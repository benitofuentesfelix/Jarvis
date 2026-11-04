import { timingSafeEqual } from "node:crypto";
import { dueNotifications, localDayKey, startOfLocalDay } from "@jarvis/core";
import { TZ } from "@/lib/demo";
import { applyEvagd, planFor } from "@/lib/engine";
import { readEvagd } from "@/lib/evagd-server";
import { sendPush, vapidReady, type StoredSub } from "@/lib/push-server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Persisted } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EVAGD_EVERY = 30 * 60_000;
const BACKUP_EVERY = 7 * 86_400_000;
const BACKUPS_KEPT = 8;

/** The caller must present the token that only the database scheduler knows. */
async function authorized(req: Request, db: NonNullable<ReturnType<typeof supabaseAdmin>>) {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return false;
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const got = Buffer.from(token);
    const want = Buffer.from(secret);
    if (got.length === want.length && timingSafeEqual(got, want)) return true;
  }
  const { data } = await db.rpc("jarvis_cron_token_ok", { t: token });
  return data === true;
}

/**
 * The 24/7 job, called every few minutes by the database scheduler (pg_cron).
 * Reads EVAGD, keeps the plan current, sends due notifications and a weekly backup.
 * It only reads external sources; it never writes to EVAGD, Notion or personal calendars.
 */
export async function POST(req: Request) {
  const db = supabaseAdmin();
  if (!db) return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  if (!(await authorized(req, db))) return Response.json({ error: "unauthorized" }, { status: 401 });

  const now = new Date();
  const startedAt = now.toISOString();
  const { data: rows, error } = await db.from("app_state").select("user_id, data, updated_at");
  if (error) return Response.json({ error: "read_failed" }, { status: 500 });

  let evagd: Awaited<ReturnType<typeof readEvagd>> | null = null;
  const report: Record<string, unknown>[] = [];

  for (const row of rows ?? []) {
    const stats: Record<string, unknown> = {};
    let d = row.data as Persisted;
    try {
      // 1. EVAGD, at most every 30 minutes.
      const last = Date.parse(d.live?.evagd?.syncedAt ?? "") || 0;
      if (now.getTime() - last > EVAGD_EVERY) {
        evagd ??= await readEvagd(now);
        if (evagd.configured) {
          const next = applyEvagd(d, evagd);
          const { data: saved } = await db
            .from("app_state")
            .update({ data: next, device: "servidor" })
            .eq("user_id", row.user_id)
            .eq("updated_at", row.updated_at) // a device wrote meanwhile: its copy wins, retry next tick
            .select("user_id");
          if (saved?.length) d = next;
          stats.evagd = evagd.ok ? (evagd.items?.length ?? 0) : evagd.error;
        }
      }

      // 2. Notifications.
      if (vapidReady()) {
        const dayStart = startOfLocalDay(now, TZ).toISOString();
        const { data: sent } = await db.from("notifications").select("dedupe_key").eq("user_id", row.user_id).gte("created_at", dayStart);
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
          sentKeys: new Set((sent ?? []).map((s) => s.dedupe_key as string)),
          sentToday: sent?.length ?? 0,
          doneKeys: new Set(Object.keys(d.feedback ?? {})),
        });
        if (msgs.length) {
          const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, keys").eq("user_id", row.user_id);
          let delivered = 0;
          for (const m of msgs) {
            // Claim the key first, so two overlapping runs never send the same message.
            const { data: claimed } = await db
              .from("notifications")
              .upsert(
                { user_id: row.user_id, dedupe_key: m.key, priority: m.priority, title: m.title, body: m.body, url: m.url },
                { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
              )
              .select("id");
            if (!claimed?.length) continue;
            for (const s of subs ?? []) {
              const r = await sendPush(s as StoredSub, { title: m.title, body: m.body, url: m.url, tag: m.key });
              if (r === "gone") await db.from("push_subscriptions").delete().eq("id", s.id);
              if (r === "ok") delivered++;
            }
            await db.from("notifications").update({ sent_at: new Date().toISOString() }).eq("id", claimed[0]!.id);
          }
          stats.notifications = msgs.map((m) => m.key);
          stats.delivered = delivered;
        }
      }

      // 3. Weekly backup, keeping the last 8.
      const { data: lastBackup } = await db
        .from("state_backups")
        .select("created_at")
        .eq("user_id", row.user_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!lastBackup || now.getTime() - Date.parse(lastBackup.created_at) > BACKUP_EVERY) {
        await db.from("state_backups").insert({ user_id: row.user_id, data: d });
        const { data: old } = await db
          .from("state_backups")
          .select("id")
          .eq("user_id", row.user_id)
          .order("created_at", { ascending: false })
          .range(BACKUPS_KEPT, 100);
        if (old?.length) await db.from("state_backups").delete().in("id", old.map((o) => o.id));
        stats.backup = true;
      }

      await db.from("job_runs").insert({ user_id: row.user_id, job: "tick", started_at: startedAt, finished_at: new Date().toISOString(), ok: true, stats });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await db.from("job_runs").insert({ user_id: row.user_id, job: "tick", started_at: startedAt, finished_at: new Date().toISOString(), ok: false, error: message, stats });
      stats.error = message;
    }
    report.push(stats);
  }

  // Keep the job log small: two weeks is enough to diagnose problems.
  await db.from("job_runs").delete().lt("created_at", new Date(now.getTime() - 14 * 86_400_000).toISOString());
  return Response.json({ ok: true, users: rows?.length ?? 0, report });
}
