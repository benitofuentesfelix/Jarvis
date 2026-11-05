"use client";

import { CalendarCheck, Loader2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useStore } from "@/lib/store";
import { ago } from "@/lib/format";
import { Button, Card, Label, Pill } from "./ui";

/**
 * Connects EVAGD with the calendar export link. The link is a private token: it is sent once
 * to the database, which keeps it encrypted in Vault; the browser never reads it back.
 */
export function EvagdLink() {
  const store = useStore();
  const sb = supabaseBrowser();
  const [has, setHas] = useState<boolean | null>(null);
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  useEffect(() => {
    if (!sb) return;
    void sb.rpc("jarvis_has_evagd_url").then(({ data }) => setHas(data === true));
  }, [sb]);

  if (!sb || !store) return null;
  const live = store.data.live?.evagd;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!sb || !store) return;
    setBusy(true);
    setMsg(null);
    const clean = url.trim().replace(/&amp;/g, "&");
    const { error } = await sb.rpc("jarvis_set_evagd_url", { url: clean });
    if (error) {
      setBusy(false);
      setMsg({ tone: "bad", text: error.message.includes("EVAGD") ? error.message : "No se ha podido guardar. Inténtalo de nuevo." });
      return;
    }
    setHas(true);
    setUrl("");
    setEditing(false);
    const r = await store.syncEvagd();
    setBusy(false);
    if (r?.ok) setMsg({ tone: "good", text: `Conectado: ${r.items?.length ?? 0} eventos leídos. El plan ya los tiene en cuenta.` });
    else setMsg({ tone: "bad", text: r?.error ? `Guardado, pero EVAGD respondió: ${r.error}` : "Guardado. Lo leeré en unos minutos." });
  }

  return (
    <Card>
      <Label right={<CalendarCheck className="size-4 text-faint" />}>EVAGD</Label>
      {has && !editing ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 text-[13px] leading-relaxed text-muted">
            <Pill tone={live?.error ? "bad" : "good"}>{live?.error ? "con errores" : "conectado"}</Pill>
            <p className="mt-1.5">
              {live?.error
                ? `Último intento: ${live.error}`
                : live?.syncedAt
                  ? `${live.count} eventos leídos ${ago(live.syncedAt, store.now)}. Se revisa cada 30 minutos, también con la app cerrada.`
                  : "Enlace guardado. Se revisa cada 30 minutos, también con la app cerrada."}
            </p>
          </div>
          <Button onClick={() => setEditing(true)}>Cambiar enlace</Button>
        </div>
      ) : (
        <form onSubmit={save} className="space-y-3">
          <p className="text-[13px] leading-relaxed text-muted">
            En EVAGD ve a <strong className="text-ink">Calendario → Importar o exportar calendarios → Exportar</strong>, elige «Todos los eventos» y «Eventos recientes y próximos», pulsa «Obtener URL del calendario» y pega aquí el enlace. Se guarda cifrado y solo lo usa el servidor para leer.
          </p>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://www3.gobiernodecanarias.org/…/export_execute.php?…"
            className="h-11 w-full rounded-xl border border-line bg-white/[0.03] px-3 text-[13px] text-ink outline-none placeholder:text-faint focus:border-cyan/50"
          />
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={busy || url.trim().length < 20}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Conectar EVAGD"}
            </Button>
            {has && (
              <Button onClick={() => { setEditing(false); setUrl(""); }}>
                Cancelar
              </Button>
            )}
          </div>
        </form>
      )}
      {msg && <p className={`mt-3 text-[12.5px] ${msg.tone === "good" ? "text-good" : "text-bad"}`}>{msg.text}</p>}
    </Card>
  );
}
