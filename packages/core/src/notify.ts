// Which push notifications are due right now. Pure and deterministic: the server job
// calls it every few minutes and sends what it returns, deduplicated by `key`.

import type { StudyBlock } from "./types";
import { localDayKey, localParts, MINUTE } from "./time";
import { techniqueLabel } from "./methods";

export interface PushMessage {
  /** Stable id: the same notification is never sent twice. */
  key: string;
  title: string;
  body: string;
  url: string;
  /** 1 = urgent (may break quiet hours), 2 = normal, 3 = low. */
  priority: 1 | 2 | 3;
}

export interface NotifyInput {
  now: Date;
  tz: string;
  /** Planned blocks (any order), including today's. */
  blocks: StudyBlock[];
  quiet: { start: string; end: string };
  maxPerDay: number;
  /** Keys already sent (at least today's). */
  sentKeys: Set<string>;
  /** Number of notifications already sent today (local day). */
  sentToday: number;
  /** Minutes before a session to remind it. */
  leadMinutes?: number;
  /** Local time of the morning summary; defaults to the end of quiet hours. */
  briefingAt?: string;
  /** Blocks with recorded feedback are not reminded. */
  doneKeys?: Set<string>;
  /** Weekday reminder to photograph the planner after school; skipped once done that day. */
  agenda?: { at: string; doneToday: boolean };
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export function inQuietHours(now: Date, tz: string, quiet: { start: string; end: string }): boolean {
  const p = localParts(now, tz);
  const t = p.hour * 60 + p.minute;
  const s = toMin(quiet.start);
  const e = toMin(quiet.end);
  return s <= e ? t >= s && t < e : t >= s || t < e;
}

const hhmm = (iso: string, tz: string) => {
  const p = localParts(new Date(iso), tz);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
};

const fmtMin = (m: number) => (m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60} h` : `${Math.floor(m / 60)} h ${m % 60} min`);

export function dueNotifications(input: NotifyInput): PushMessage[] {
  const { now, tz, quiet, sentKeys } = input;
  const lead = input.leadMinutes ?? 15;
  const t = now.getTime();
  const today = localDayKey(now, tz);
  const out: PushMessage[] = [];
  const quietNow = inQuietHours(now, tz, quiet);

  const todays = input.blocks
    .filter((b) => localDayKey(new Date(b.start), tz) === today)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

  // Morning summary: once a day, from the briefing time until noon.
  const p = localParts(now, tz);
  const minuteOfDay = p.hour * 60 + p.minute;
  const briefAt = toMin(input.briefingAt ?? quiet.end);
  const briefKey = `brief:${today}`;
  if (!quietNow && minuteOfDay >= briefAt && minuteOfDay < 12 * 60 && !sentKeys.has(briefKey)) {
    const pending = todays.filter((b) => Date.parse(b.end) > t);
    const total = pending.reduce((s, b) => s + (Date.parse(b.end) - Date.parse(b.start)) / MINUTE, 0);
    const first = pending[0];
    out.push({
      key: briefKey,
      title: pending.length ? `Hoy: ${pending.length} ${pending.length === 1 ? "sesión" : "sesiones"}, ${fmtMin(Math.round(total))}` : "Hoy no tienes estudio planificado",
      body: first ? `Empiezas a las ${hhmm(first.start, tz)} con ${first.title}.` : "Día libre de estudio. Si surge algo, te aviso.",
      url: "/",
      priority: 3,
    });
  }

  // After school (Mon–Fri): photograph the planner, for up to 3 hours after the set time.
  if (input.agenda && !input.agenda.doneToday && p.weekday >= 1 && p.weekday <= 5) {
    const at = toMin(input.agenda.at);
    const key = `agenda:${today}`;
    if (minuteOfDay >= at && minuteOfDay < at + 180 && !sentKeys.has(key)) {
      out.push({
        key,
        title: "Foto de la agenda",
        body: "Hazle una foto a la página de hoy y organizo tu tarde con lo que te han mandado.",
        url: "/#agenda",
        priority: 2,
      });
    }
  }

  // Reminder shortly before each session.
  for (const b of todays) {
    const start = Date.parse(b.start);
    const until = (start - t) / MINUTE;
    const key = `block:${b.id}@${b.start}`;
    if (until <= 0 || until > lead || sentKeys.has(key) || input.doneKeys?.has(`${b.id}@${b.start}`)) continue;
    const minutes = Math.round((Date.parse(b.end) - start) / MINUTE);
    out.push({
      key,
      title: `A las ${hhmm(b.start, tz)}: ${b.title}`,
      body: `${techniqueLabel(b.technique)} · ${fmtMin(minutes)}. ${b.reason}`,
      url: "/",
      priority: 2,
    });
  }

  const allowed = out.filter((m) => !quietNow || m.priority === 1);
  // Reminders beat the summary when the daily budget is tight.
  allowed.sort((a, b) => a.priority - b.priority);
  return allowed.slice(0, Math.max(0, input.maxPerDay - input.sentToday));
}
