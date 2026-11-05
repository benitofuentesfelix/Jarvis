"use client";

import { CalendarPlus, Check, Copy, Loader2 } from "lucide-react";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useStore } from "@/lib/store";
import { Button } from "./ui";

/** Adds JARVIS as a subscribed calendar: sessions, exams and deadlines appear on their own. */
export function CalendarSubscribe({ compact = false }: { compact?: boolean }) {
  const store = useStore();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function feedUrl() {
    const sb = supabaseBrowser();
    if (!sb) throw new Error("sin_nube");
    const { data, error } = await sb.rpc("jarvis_calendar_token");
    if (error || typeof data !== "string") throw new Error("sin_token");
    return `${location.host}/api/calendario/${data}.ics`;
  }

  async function subscribe() {
    setBusy(true);
    setError(null);
    try {
      const url = await feedUrl();
      store?.setSetup({ calendar: true });
      location.href = `webcal://${url}`;
    } catch {
      setError("No se ha podido crear el enlace. Inténtalo de nuevo.");
    }
    setBusy(false);
  }

  async function copy() {
    setBusy(true);
    setError(null);
    try {
      const url = await feedUrl();
      await navigator.clipboard.writeText(`https://${url}`);
      store?.setSetup({ calendar: true });
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("No se ha podido copiar el enlace.");
    }
    setBusy(false);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={subscribe} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <CalendarPlus className="size-4" />} Añadir a mi calendario
        </Button>
        <Button onClick={copy} disabled={busy}>
          {copied ? <Check className="size-4 text-good" /> : <Copy className="size-4" />} {copied ? "Copiado" : "Copiar enlace"}
        </Button>
      </div>
      {!compact && (
        <p className="mt-2.5 text-[12px] leading-relaxed text-faint">
          En el iPhone, «Añadir» abre el Calendario y te pide suscribirte. Para Google Calendar, copia el enlace y pégalo en Otros calendarios → «Desde URL». Se actualiza solo; JARVIS nunca toca tus otros calendarios.
        </p>
      )}
      {error && <p className="mt-2 text-[12px] text-bad">{error}</p>}
    </div>
  );
}
