import { createClient } from "@supabase/supabase-js";
import { dueNotifications, localDayKey, startOfLocalDay } from "@jarvis/core";
import { TZ } from "@/lib/demo";
import { applyEvagd, planFor } from "@/lib/engine";
import { readEvagd } from "@/lib/evagd-server";
import { sendPush, vapidReady, type StoredSub } from "@/lib/push-server";
import { SUPABASE_KEY, SUPABASE_URL, cloudEnabled } from "@/lib/supabase/config";
import type { Persisted } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EVAGD_EVERY = 30 * 60_000;

/**
 * The 24/7 job, called every five minutes by the database scheduler (pg_cron).
 * It holds no secret of its own: every database call carries the token that only
 * pg_cron knows, and the database functions reject anything else.
 * Reads EVAGD, keeps the plan current, sends due notifications and a weekly backup.
 * It never writes to EVAGD, Notion or personal calendars.
 */
export async function POST(req: Request) {
  if (!cloudEnabled()) return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  const header = req.headers.get("authorization") ?? "";
  const t = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!t) return Response.json({ error: "unauthorized" }, { status: 401 });

  const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date();
  const startedAt = now.toISOString();
  const { data: rows, error } = await db.rpc("jarvis_cron_states", { t });
  if (error) return Response.json({ error: error.code === "42501" ? "unauthorized" : "read_failed" }, { status: error.code === "42501" ? 401 : 500 });

  const report: Record<string, unknown>[] = [];
  for (const row of (rows ?? []) as { user_id: string; data: Persisted; updated_at: string; evagd_url: string | null }[]) {
    const uid = row.user_id;
    const stats: Record<string, unknown> = {};
    let d = row.data;
    try {
      // 1. EVAGD, at most every 30 minutes.
      const last = Date.parse(d.live?.evagd?.syncedAt ?? "") || 0;
      if (now.getTime() - last > EVAGD_EVERY) {
        const evagd = await readEvagd(now, row.evagd_url);
        if (evagd.configured) {
          const next = applyEvagd(d, evagd);
          // A device that wrote meanwhile wins; the next run tries again.
          const { data: saved } = await db.rpc("jarvis_cron_save_state", { t, uid, d: next, expected: row.updated_at });
          if (saved === true) d = next;
          stats.evagd = evagd.ok ? (evagd.items?.length ?? 0) : evagd.error;
        }
      }

      // 2. Notifications.
      if (vapidReady()) {
        const { data: sent } = await db.rpc("jarvis_cron_sent_keys", { t, uid, since: startOfLocalDay(now, TZ).toISOString() });
        const sentKeys = (sent ?? []) as string[];
        const plan = planFor(d, now);
        const today = localDayKey(now, TZ);
        const kept = d.day?.key === today ? d.day.blocks : [];
        const ids = new Set(plan.blocks.map((b) => b.id + b.start));
        const msgs = dueNotifications({
          now,
          tz: TZ,
          blocks: [...kept.filter((b) => !ids.has(b.id + b.start)), ...plan.blocks],
          quiet: d.quiet,
          maxPerDay: d.dailyNotifications,
          sentKeys: new Set(sentKeys),
          sentToday: sentKeys.length,
          doneKeys: new Set(Object.keys(d.feedback ?? {})),
        });
        if (msgs.length) {
          const { data: subs } = await db.rpc("jarvis_cron_subs", { t, uid });
          let delivered = 0;
          for (const m of msgs) {
            // Claim the key first, so two overlapping runs never send the same message.
            const { data: nid } = await db.rpc("jarvis_cron_claim", { t, uid, k: m.key, prio: m.priority, ttl: m.title, bdy: m.body, u: m.url });
            if (!nid) continue;
            for (const s of (subs ?? []) as (StoredSub & { id: string })[]) {
              const r = await sendPush(s, { title: m.title, body: m.body, url: m.url, tag: m.key });
              if (r === "gone") await db.rpc("jarvis_cron_drop_sub", { t, sid: s.id });
              if (r === "ok") delivered++;
            }
            await db.rpc("jarvis_cron_mark_sent", { t, nid });
          }
          stats.notifications = msgs.map((m) => m.key);
          stats.delivered = delivered;
        }
      }

      // 3. Weekly backup (the database keeps the last 8).
      const { data: backed } = await db.rpc("jarvis_cron_backup", { t, uid, d });
      if (backed) stats.backup = true;

      await db.rpc("jarvis_cron_log", { t, uid, started: startedAt, ok: true, err: null, st: stats });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      stats.error = message;
      await db.rpc("jarvis_cron_log", { t, uid, started: startedAt, ok: false, err: message, st: stats });
    }
    report.push(stats);
  }
  return Response.json({ ok: true, users: rows?.length ?? 0, report });
}
