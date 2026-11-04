"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Check, CornerDownLeft, Loader2, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { executeAction, runLocalCommand, summarizeChanges, type CommandAction } from "@/lib/commands";
import { useStore } from "@/lib/store";
import type { PlanChange } from "@jarvis/core";
import { Orb } from "./Orb";

interface Turn {
  id: string;
  q: string;
  steps: string[];
  done: number;
  answer?: string;
  changes?: PlanChange[];
  mode?: "local" | "claude";
}

const SUGGESTIONS = [
  "¿Qué toca ahora?",
  "Reorganiza mi semana",
  "¿Cómo voy con Cambridge C1?",
  "¿Qué necesito para entrar en Rotterdam?",
  "Prepara un plan para mi examen de Matemáticas",
  "¿Qué tareas nuevas han aparecido?",
  "Tengo examen de Economía el 20 de noviembre",
];

export function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") ? (
          <strong key={i} className="font-semibold text-ink">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function contextFor(store: NonNullable<ReturnType<typeof useStore>>) {
  const { now, data, plan, goals } = store;
  return {
    now: now.toISOString(),
    subjects: ["mat", "fyq", "eco", "len", "fil", "ing", "cambridge"],
    items: data.items.filter((i) => !i.completed).map(({ id, kind, subjectId, title, due, effortMinutes, doneMinutes, createdAt, source }) => ({ id, kind, subjectId, title, due, effortMinutes, doneMinutes, createdAt, source })),
    nextBlocks: plan.blocks.slice(0, 25).map(({ start, end, title, reason, kind }) => ({ start, end, title, reason, kind })),
    findings: plan.findings.map((f) => f.title + ": " + f.detail),
    goals: goals.map((g) => ({ title: g.title, metrics: g.metrics.map((m) => `${m.label}: ${m.current} / ${m.target}`) })),
    memories: data.memories.filter((m) => m.confirmed).map((m) => m.content),
  };
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useStore();
  const [q, setQ] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  async function submit(text: string) {
    if (!store || !text.trim() || busy) return;
    setBusy(true);
    setQ("");
    const id = Math.random().toString(36).slice(2);
    const provisional = ["Interpretando la orden", "Consultando tu contexto"];
    setTurns((t) => [...t, { id, q: text, steps: provisional, done: 0 }]);
    store.setWorking("Pensando…");

    let remote: { mode: string; reply?: string; action?: Record<string, unknown> } = { mode: "local" };
    try {
      const r = await fetch("/api/command", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, context: contextFor(store) }) });
      if (r.ok) remote = await r.json();
    } catch {
      /* offline: local engine */
    }

    let result: { text: string; steps: string[]; changes?: PlanChange[]; mode: "local" | "claude" };
    if (remote.mode === "claude" && remote.reply) {
      const a = remote.action as { type: string; kind?: string; subjectId?: string; due?: string; title?: string; effortMinutes?: number } | undefined;
      let changes: PlanChange[] | undefined;
      if (a?.type === "replan") changes = executeAction({ type: "replan" }, store);
      if (a?.type === "add_item" && a.kind && a.subjectId && a.due)
        changes = executeAction(
          { type: "add_item", kind: a.kind as "examen" | "tarea", subjectId: a.subjectId, due: a.due, title: a.title ?? "Nuevo elemento", effortMinutes: a.effortMinutes ?? 100 } as CommandAction,
          store,
        );
      result = {
        mode: "claude",
        steps: ["Interpretando la orden", "Razonando con tu contexto", ...(changes ? ["Recalculando el plan"] : [])],
        text: remote.reply + (changes ? ` ${summarizeChanges(changes)}` : ""),
        changes,
      };
    } else {
      result = runLocalCommand(text, store);
    }

    // Reveal the tool steps one by one so you can see what JARVIS did.
    setTurns((t) => t.map((x) => (x.id === id ? { ...x, steps: result.steps, done: 0 } : x)));
    for (let i = 1; i <= result.steps.length; i++) {
      await new Promise((r) => setTimeout(r, 220));
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, done: i } : x)));
    }
    setTurns((t) => t.map((x) => (x.id === id ? { ...x, answer: result.text, changes: result.changes, mode: result.mode } : x)));
    store.log("Core", `«${text}» → ${result.text.replace(/\*\*/g, "").slice(0, 110)}${result.text.length > 110 ? "…" : ""}`);
    store.setWorking(null);
    setBusy(false);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center sm:items-start sm:pt-[12vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-void/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-label="Centro de comandos"
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="card relative flex max-h-[86dvh] w-full max-w-2xl flex-col overflow-hidden rounded-b-none shadow-2xl shadow-black/60 sm:rounded-b-[18px]"
          >
            <div className="flex items-center gap-3 border-b hairline px-4 py-3">
              <Orb size={26} working={busy} />
              <form
                className="flex flex-1 items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit(q);
                }}
              >
                <input
                  ref={inputRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Pregunta o da una orden…"
                  className="h-10 w-full min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-faint focus:outline-none"
                />
                <button type="submit" disabled={!q.trim() || busy} className="grid size-8 place-items-center rounded-lg bg-ink text-base disabled:opacity-30" aria-label="Enviar">
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
                </button>
              </form>
              <button onClick={onClose} className="grid size-8 place-items-center rounded-lg text-faint hover:bg-s2 hover:text-ink" aria-label="Cerrar">
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
              {turns.length === 0 && (
                <div>
                  <p className="mb-3 text-xs text-faint">Prueba con</p>
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} onClick={() => void submit(s)} className="rounded-full border border-line bg-s2 px-3 py-1.5 text-[13px] text-muted transition-colors hover:border-line-strong hover:text-ink">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {turns.map((t) => (
                <div key={t.id} className="space-y-2">
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-s3 px-3.5 py-2 text-[14px] text-ink">{t.q}</div>
                  </div>
                  <div className="space-y-1 pl-1">
                    {t.steps.map((s, i) => (
                      <motion.div key={s + i} initial={{ opacity: 0, x: -4 }} animate={{ opacity: i <= t.done ? 1 : 0.35, x: 0 }} className="flex items-center gap-2 font-mono text-[11.5px] text-faint">
                        {i < t.done ? <Check className="size-3 text-cyan" /> : <Loader2 className="size-3 animate-spin text-cyan" />}
                        {s}
                      </motion.div>
                    ))}
                  </div>
                  {t.answer && (
                    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl rounded-bl-md border border-line bg-s2/60 px-4 py-3 text-[14px] leading-relaxed text-muted">
                      <Rich text={t.answer} />
                      {t.changes && t.changes.length > 0 && <ChangeList changes={t.changes} />}
                      <div className="mt-2 flex items-center gap-1.5 text-[10.5px] text-faint">
                        <Sparkles className="size-3" />
                        {t.mode === "claude" ? "Claude + planificador" : "Motor local (sin IA conectada)"}
                      </div>
                    </motion.div>
                  )}
                </div>
              ))}
              <div ref={endRef} />
            </div>
            <div className="hidden items-center justify-between border-t hairline px-4 py-2 text-[11px] text-faint sm:flex">
              <span className="flex items-center gap-1">
                <CornerDownLeft className="size-3" /> enviar
              </span>
              <span>esc para cerrar · ⌘K para abrir</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ChangeList({ changes, limit = 5 }: { changes: PlanChange[]; limit?: number }): ReactNode {
  const tone = { added: "text-good", moved: "text-amber", removed: "text-bad" } as const;
  const sym = { added: "+", moved: "↻", removed: "−" } as const;
  return (
    <ul className="mt-3 space-y-1 border-t hairline pt-3">
      {changes.slice(0, limit).map((c, i) => (
        <li key={i} className="flex gap-2 text-[12.5px] leading-snug text-muted">
          <span className={`w-3 shrink-0 font-mono ${tone[c.type]}`}>{sym[c.type]}</span>
          <span>{c.explanation}</span>
        </li>
      ))}
      {changes.length > limit && <li className="pl-5 text-[12px] text-faint">y {changes.length - limit} cambios más</li>}
    </ul>
  );
}
