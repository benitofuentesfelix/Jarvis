import { createClient } from "@supabase/supabase-js";
import { buildIcs, localDayKey, techniqueLabel, type CalEvent } from "@jarvis/core";
import { subjects, TZ } from "@/lib/demo";
import { planFor } from "@/lib/engine";
import { SUPABASE_KEY, SUPABASE_URL, cloudEnabled } from "@/lib/supabase/config";
import type { Persisted } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Private subscribed calendar: /api/calendario/<token>.ics
 * The phone downloads it every ~30 minutes. Read-only, and only with the long private token.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const tok = token.replace(/\.ics$/, "");
  if (!cloudEnabled() || !/^[a-f0-9]{32,}$/.test(tok)) return new Response("No encontrado", { status: 404 });

  const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.rpc("jarvis_calendar_feed", { tok });
  if (error || !data) return new Response("No encontrado", { status: 404 });
  const d = data as Persisted;

  const now = new Date();
  const plan = planFor(d, now);
  const today = localDayKey(now, TZ);
  const kept = d.day?.key === today ? d.day.blocks : [];
  const seen = new Set<string>();
  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? "";

  const events: CalEvent[] = [];
  for (const b of [...kept, ...plan.blocks]) {
    const key = `${b.id}@${b.start}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const steps = b.steps.map((s) => `· ${s.minutes} min: ${s.label}`).join("\n");
    events.push({
      uid: `${b.id}-${Date.parse(b.start)}@jarvis`,
      title: b.title,
      description: `${techniqueLabel(b.technique)}${subjectName(b.subjectId) ? ` · ${subjectName(b.subjectId)}` : ""}\n${b.reason}${steps ? `\n\n${steps}` : ""}`,
      start: new Date(b.start),
      end: new Date(b.end),
      alarmMinutes: 10,
    });
  }
  for (const i of d.items) {
    if (i.completed || i.kind === "aviso" || i.kind === "material") continue;
    const due = new Date(i.due);
    if (due.getTime() < now.getTime() - 86_400_000) continue;
    events.push({
      uid: `item-${i.id}@jarvis`,
      title: `${i.kind === "examen" ? "Examen" : "Entrega"}: ${i.title}`,
      description: subjectName(i.subjectId) || undefined,
      start: due,
      allDayDate: localDayKey(due, TZ),
    });
  }

  return new Response(buildIcs({ name: "JARVIS · Estudio", now, events }), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="jarvis.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
