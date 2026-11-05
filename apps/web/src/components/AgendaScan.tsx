"use client";

import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Camera, Check, ImageUp, Loader2, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { agendaCandidates, agendaDue, localDayKey, zoned, type AgendaCandidate, type AgendaEntry } from "@jarvis/core";
import { subjects, TZ, useStore } from "@/lib/store";
import { Button } from "./ui";

type Phase =
  | { at: "idle" }
  | { at: "reading" }
  | { at: "review"; rows: Row[]; unreadable: string[] }
  | { at: "done"; added: number }
  | { at: "error"; message: string };

interface Row extends AgendaCandidate {
  key: string;
  on: boolean;
  date: string; // YYYY-MM-DD, local
  guessedDate: boolean;
}

const ERRORS: Record<string, string> = {
  sin_clave: "La lectura de fotos aún no está activada en el servidor (falta la clave de la IA).",
  clave_invalida: "La clave de la IA no es válida. Revisa la variable ANTHROPIC_API_KEY en Vercel.",
  limite: "Has llegado al máximo de 20 fotos en 24 horas. Vuelve a intentarlo mañana.",
  no_es_agenda: "En la foto no veo una agenda ni una lista de tareas. Prueba con la página bien encuadrada.",
  no_leida: "No he podido leer la foto. Prueba con más luz y la página entera, sin sombras.",
  foto_invalida: "La foto no es válida o es demasiado grande.",
  sin_sesion: "Tu sesión ha caducado. Vuelve a entrar.",
  ocupado: "La IA está saturada ahora mismo. Inténtalo en un minuto.",
  ia_no_disponible: "La IA no responde ahora mismo. Inténtalo en un minuto.",
};

/** Shrinks the photo on the phone (max 2000 px, JPEG) so it uploads fast and stays private-sized. */
async function compress(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  if (!blob) throw new Error("compress");
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

const field = "rounded-lg border border-line bg-s2 px-2 py-1.5 text-[13px] text-ink focus:border-line-strong focus:outline-none";

/** "Foto de la agenda": JARVIS reads the page, you check it, the plan reorganises itself. */
export function AgendaScan() {
  const store = useStore();
  const [phase, setPhase] = useState<Phase>({ at: "idle" });
  const [ready, setReady] = useState<boolean | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/agenda")
      .then((r) => (r.ok ? r.json() : { ready: false }))
      .then((j: { ready?: boolean }) => setReady(!!j.ready))
      .catch(() => setReady(false));
  }, []);

  if (!store) return null;
  const { now } = store;

  async function onFile(file: File | undefined) {
    if (!file || !store) return;
    setPhase({ at: "reading" });
    try {
      const image = await compress(file);
      const res = await fetch("/api/agenda", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image, mediaType: "image/jpeg" }) });
      const json = (await res.json().catch(() => ({}))) as { entries?: AgendaEntry[]; unreadable?: string[]; error?: string };
      if (!res.ok || !json.entries) {
        setPhase({ at: "error", message: ERRORS[json.error ?? ""] ?? "No se ha podido leer la foto. Inténtalo de nuevo." });
        return;
      }
      const at = new Date();
      const candidates = agendaCandidates(json.entries, store.data.items, subjects.map((s) => s.id), at, TZ);
      const tomorrow = localDayKey(new Date(at.getTime() + 86_400_000), TZ);
      const rows: Row[] = candidates.map((c, i) => ({
        ...c,
        key: `r${i}`,
        on: !c.duplicateOf,
        date: c.due ? localDayKey(new Date(c.due), TZ) : tomorrow,
        guessedDate: !c.due,
      }));
      setPhase({ at: "review", rows, unreadable: json.unreadable ?? [] });
    } catch {
      setPhase({ at: "error", message: "No se ha podido preparar la foto. Si es del iPhone, prueba a hacerla desde aquí con «Hacer foto»." });
    } finally {
      if (camera.current) camera.current.value = "";
      if (gallery.current) gallery.current.value = "";
    }
  }

  function update(key: string, patch: Partial<Row>) {
    if (phase.at !== "review") return;
    setPhase({ ...phase, rows: phase.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) });
  }

  function confirm() {
    if (phase.at !== "review" || !store) return;
    const chosen = phase.rows.filter((r) => r.on && r.title.trim());
    if (chosen.length === 0) return setPhase({ at: "idle" });
    const at = new Date();
    store.addItems(
      chosen.map((r) => {
        const [y, m, d] = r.date.split("-").map(Number);
        const day = zoned(y!, m!, d!, 0, 0, TZ);
        return {
          kind: r.kind,
          subjectId: r.subjectId,
          title: r.title.trim(),
          due: agendaDue(day, at, TZ).toISOString(),
          effortMinutes: r.effortMinutes,
          topicIds: [],
          source: "agenda" as const,
        };
      }),
      `Agenda (foto): ${chosen.length} ${chosen.length === 1 ? "tarea añadida" : "tareas añadidas"}`,
    );
    setPhase({ at: "done", added: chosen.length });
  }

  const today = localDayKey(now, TZ);

  return (
    <section className="glass p-5 sm:p-6" id="agenda">
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      <input ref={gallery} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />

      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full border border-line text-cyan">
          <Camera className="size-[18px]" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium text-ink">Foto de la agenda</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
            Al salir del cole, hazle una foto a la página de hoy. JARVIS lee tus deberes y exámenes, tú lo compruebas y el plan se reorganiza solo.
          </p>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {phase.at === "idle" && (
          <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-4">
            {ready === false ? (
              <p className="rounded-xl border border-amber/25 bg-amber/[0.05] px-3 py-2.5 text-[12.5px] leading-relaxed text-muted">
                <span className="text-amber">Pendiente de activar.</span> Falta poner la clave de la IA en el servidor; en cuanto esté, este botón funciona.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={() => camera.current?.click()} disabled={ready === null}>
                  <Camera className="size-4" /> Hacer foto
                </Button>
                <Button onClick={() => gallery.current?.click()} disabled={ready === null}>
                  <ImageUp className="size-4" /> Elegir de la galería
                </Button>
              </div>
            )}
          </motion.div>
        )}

        {phase.at === "reading" && (
          <motion.div key="reading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-4 flex items-center gap-2.5 text-[13.5px] text-muted" role="status">
            <Loader2 className="size-4 animate-spin text-cyan" /> Leyendo tu agenda… (unos 15 segundos)
          </motion.div>
        )}

        {phase.at === "error" && (
          <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-4 space-y-3">
            <p className="flex items-start gap-2 text-[13px] leading-relaxed text-bad">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {phase.message}
            </p>
            <Button onClick={() => setPhase({ at: "idle" })}>
              <RotateCcw className="size-4" /> Probar otra vez
            </Button>
          </motion.div>
        )}

        {phase.at === "done" && (
          <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-4 space-y-3">
            <p className="flex items-center gap-2 text-[13.5px] text-ink">
              <Check className="size-4 text-good" /> {phase.added === 1 ? "1 tarea añadida" : `${phase.added} tareas añadidas`}. Tu plan ya está reorganizado: abajo tienes lo de hoy.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/plan" className="inline-flex items-center rounded-xl bg-ink px-3.5 py-2 text-sm font-medium text-base">
                Ver la semana
              </Link>
              <Button onClick={() => setPhase({ at: "idle" })}>Otra foto</Button>
            </div>
          </motion.div>
        )}

        {phase.at === "review" && (
          <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-4">
            {phase.rows.length === 0 ? (
              <p className="text-[13.5px] text-muted">No he encontrado deberes ni exámenes en la foto.</p>
            ) : (
              <>
                <p className="mb-3 text-[12.5px] text-faint">Revisa lo que he leído. Toca para corregir; solo se añade lo marcado.</p>
                <ul className="space-y-2.5">
                  {phase.rows.map((r) => {
                    const doubtful = r.confidence !== "alta" || r.guessedDate;
                    const past = r.date < today;
                    return (
                      <li key={r.key} className={`rounded-2xl border p-3 transition-colors ${r.on ? "border-line bg-white/[0.02]" : "border-line/50 opacity-60"}`}>
                        <div className="flex items-start gap-2.5">
                          <button
                            onClick={() => update(r.key, { on: !r.on })}
                            className={`mt-1 grid size-5 shrink-0 place-items-center rounded-md border ${r.on ? "border-cyan bg-cyan/20 text-cyan" : "border-line text-transparent"}`}
                            aria-label={r.on ? "No añadir" : "Añadir"}
                            aria-pressed={r.on}
                          >
                            <Check className="size-3.5" />
                          </button>
                          <div className="min-w-0 flex-1 space-y-2">
                            <input value={r.title} onChange={(e) => update(r.key, { title: e.target.value })} className={`${field} w-full text-[14px]`} aria-label="Título" />
                            <div className="flex flex-wrap items-center gap-1.5">
                              <select value={r.subjectId} onChange={(e) => update(r.key, { subjectId: e.target.value })} className={field} aria-label="Asignatura">
                                {subjects.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name}
                                  </option>
                                ))}
                                <option value="otra">Otra</option>
                              </select>
                              <select
                                value={r.kind}
                                onChange={(e) => {
                                  const kind = e.target.value as Row["kind"];
                                  update(r.key, { kind, effortMinutes: kind === "examen" ? Math.max(r.effortMinutes, 180) : Math.min(r.effortMinutes, 120) });
                                }}
                                className={field}
                                aria-label="Tipo"
                              >
                                <option value="tarea">Tarea</option>
                                <option value="examen">Examen</option>
                              </select>
                              <input type="date" value={r.date} onChange={(e) => e.target.value && update(r.key, { date: e.target.value, guessedDate: false })} className={field} aria-label="Fecha de entrega" />
                              <select value={r.effortMinutes} onChange={(e) => update(r.key, { effortMinutes: Number(e.target.value) })} className={field} aria-label="Tiempo estimado">
                                {[...new Set([10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 420, 600, r.effortMinutes])].sort((a, b) => a - b).map((m) => (
                                  <option key={m} value={m}>
                                    {m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ""}`}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <p className="text-[11.5px] leading-relaxed text-faint">
                              Leído: «{r.readText}»
                            </p>
                            {(r.duplicateOf || doubtful || past) && (
                              <p className="text-[11.5px] leading-relaxed text-amber">
                                {r.duplicateOf
                                  ? "Ya lo tenías en el plan: no se duplica salvo que lo marques."
                                  : r.guessedDate
                                    ? "La agenda no dice cuándo es: he puesto mañana, cámbialo si no es así."
                                    : past
                                      ? "Esa fecha ya ha pasado: revísala."
                                      : "No lo he leído con total seguridad: revísalo."}
                              </p>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            {phase.unreadable.length > 0 && (
              <p className="mt-3 text-[12px] leading-relaxed text-amber">No he podido leer: {phase.unreadable.map((u) => `«${u}»`).join(", ")}. Añádelo a mano si es importante.</p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {phase.rows.some((r) => r.on) && (
                <Button variant="primary" onClick={confirm}>
                  <Check className="size-4" /> Añadir {phase.rows.filter((r) => r.on).length} y organizar mi día
                </Button>
              )}
              <Button onClick={() => setPhase({ at: "idle" })}>
                <X className="size-4" /> Descartar
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
