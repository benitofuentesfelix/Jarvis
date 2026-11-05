// Photo of the paper planner → academic items.
// The AI only *reads* the page and reports how each date was written. Turning that into
// an exact day, deciding duplicates and bounding effort is done here, in tested code.

import type { AcademicItem } from "./types";
import { addLocalDays, localDaysBetween, localParts, zoned } from "./time";

/** Date printed on the planner page where the entry is written ("para mañana" counts from it). */
export interface PageDate {
  day: number;
  month: number;
}

/** How the date appears on the page, as the AI read it. */
export type AgendaWhen =
  | { type: "fecha"; day: number; month: number | null }
  | { type: "dia_semana"; weekday: number; nextWeek: boolean; from?: PageDate }
  | { type: "relativo"; days: number; from?: PageDate }
  | { type: "ninguna" };

export interface AgendaEntry {
  title: string;
  subjectId: string;
  kind: "tarea" | "examen";
  when: AgendaWhen;
  effortMinutes: number;
  /** What the AI literally read, shown to the student for checking. */
  readText: string;
  /** Date heading of the section where the entry is written, if the page shows one. */
  pageDate: PageDate | null;
  confidence: "alta" | "media" | "baja";
}

export interface AgendaCandidate extends AgendaEntry {
  /** null when the page gives no date: the student must pick one. */
  due: string | null;
  duplicateOf: string | null;
}

/**
 * Resolves a written date to the local day it refers to, as a Date at local midnight.
 * - "día 12" (no month): this month if still ahead, otherwise next month.
 * - "12/1": the next 12 January from today (a date long past means next year).
 * - "el jueves": the next Thursday after today; "el jueves que viene" moves it to next week.
 * - "mañana", "en 3 días": counted from today, or from the page's own date when it has one
 *   ("para mañana" written on Monday's page means Tuesday, even if the photo is taken on Thursday).
 */
export function resolveAgendaDay(when: AgendaWhen, now: Date, tz: string): Date | null {
  const today = localParts(now, tz);
  const base = (from?: PageDate) => (from ? resolveAgendaDay({ type: "fecha", day: from.day, month: from.month }, now, tz) : now);
  switch (when.type) {
    case "ninguna":
      return null;
    case "relativo": {
      const n = Math.round(when.days);
      const b = base(when.from);
      if (!b || !Number.isFinite(n) || n < 0 || n > 120) return null;
      return addLocalDays(b, n, tz);
    }
    case "dia_semana": {
      const w = Math.round(when.weekday);
      const b = base(when.from);
      if (!b || w < 0 || w > 6) return null;
      const bw = localParts(b, tz).weekday;
      let ahead = (w - bw + 7) % 7;
      if (ahead === 0) ahead = 7;
      if (when.nextWeek) {
        // Days left until Monday of next week (weeks start on Monday in Spain).
        const toNextMonday = ((1 - bw + 7) % 7) || 7;
        if (ahead < toNextMonday) ahead += 7;
      }
      return addLocalDays(b, ahead, tz);
    }
    case "fecha": {
      const d = Math.round(when.day);
      if (d < 1 || d > 31) return null;
      if (when.month === null) {
        for (let k = 0; k < 2; k++) {
          const y = today.year + Math.floor((today.month - 1 + k) / 12);
          const m = ((today.month - 1 + k) % 12) + 1;
          if (!validDay(y, m, d)) continue;
          const day = zoned(y, m, d, 0, 0, tz);
          if (localDaysBetween(now, day, tz) >= 0) return day;
        }
        return null;
      }
      const m = Math.round(when.month);
      if (m < 1 || m > 12) return null;
      // A date more than ~2 months behind is next year's (planners run Sept–June).
      for (const y of [today.year, today.year + 1]) {
        if (!validDay(y, m, d)) continue;
        const day = zoned(y, m, d, 0, 0, tz);
        if (localDaysBetween(now, day, tz) >= -60) return day;
      }
      return null;
    }
  }
}

/**
 * An entry with no due date, written under a day heading: students who note homework on the
 * day it is due get that day. A heading already past means it was noted the day it was set,
 * so the date is left for the student to choose.
 */
function undatedOnPage(e: AgendaEntry, now: Date, tz: string): Date | null {
  if (e.when.type !== "ninguna" || !e.pageDate) return null;
  const day = resolveAgendaDay({ type: "fecha", day: e.pageDate.day, month: e.pageDate.month }, now, tz);
  return day && localDaysBetween(now, day, tz) >= 0 ? day : null;
}

function validDay(y: number, m: number, d: number) {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/**
 * Due instant for an item on that day: before school (08:00) so homework is done in time;
 * something due today gets the evening instead.
 */
export function agendaDue(day: Date, now: Date, tz: string): Date {
  const p = localParts(day, tz);
  const isToday = localDaysBetween(now, day, tz) === 0;
  return isToday ? zoned(p.year, p.month, p.day, 21, 30, tz) : zoned(p.year, p.month, p.day, 8, 0, tz);
}

const EFFORT_BOUNDS: Record<"tarea" | "examen", [number, number, number]> = {
  // [min, max, default]
  tarea: [10, 240, 45],
  examen: [60, 600, 250],
};

export function boundEffort(kind: "tarea" | "examen", minutes: number): number {
  const [min, max, def] = EFFORT_BOUNDS[kind];
  if (!Number.isFinite(minutes) || minutes <= 0) return def;
  return Math.min(max, Math.max(min, Math.round(minutes / 5) * 5));
}

const STOP = new Set(["de", "del", "la", "el", "los", "las", "y", "a", "en", "para", "con", "por", "un", "una", "tema", "pag", "pagina", "ej", "ejercicio", "ejercicios", "hacer"]);
function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9ñ ]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1 && !STOP.has(t)),
  );
}

/** Same subject, close due date and mostly the same words (or one title contains the other). */
export function similarItem(a: { subjectId: string; title: string; due: string }, b: { subjectId: string; title: string; due: string }): boolean {
  if (a.subjectId !== b.subjectId) return false;
  if (Math.abs(Date.parse(a.due) - Date.parse(b.due)) > 2 * 86_400_000) return false;
  const ta = tokens(a.title);
  const tb = tokens(b.title);
  if (ta.size === 0 || tb.size === 0) return false;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  const jaccard = shared / (ta.size + tb.size - shared);
  return jaccard >= 0.5 || shared === Math.min(ta.size, tb.size);
}

/**
 * Turns what the AI read into candidates the student reviews before anything is saved.
 * Unknown subjects become "otra"; existing items with the same work are flagged, not duplicated.
 */
export function agendaCandidates(entries: AgendaEntry[], existing: AcademicItem[], subjectIds: string[], now: Date, tz: string): AgendaCandidate[] {
  const out: AgendaCandidate[] = [];
  for (const e of entries) {
    const title = e.title.replace(/\s+/g, " ").trim().slice(0, 140);
    if (!title) continue;
    const kind: "tarea" | "examen" = e.kind === "examen" ? "examen" : "tarea";
    const subjectId = subjectIds.includes(e.subjectId) ? e.subjectId : "otra";
    const day = resolveAgendaDay(e.when, now, tz) ?? undatedOnPage(e, now, tz);
    const due = day ? agendaDue(day, now, tz).toISOString() : null;
    const probe = { subjectId, title, due: due ?? now.toISOString() };
    const dup = due ? existing.find((i) => !i.completed && similarItem(probe, i)) : undefined;
    const sameScan = due ? out.find((c) => c.due && similarItem(probe, { ...c, due: c.due })) : undefined;
    if (sameScan) continue;
    out.push({ ...e, title, kind, subjectId, effortMinutes: boundEffort(kind, e.effortMinutes), due, duplicateOf: dup?.id ?? null });
  }
  return out.sort((a, b) => (a.due ? Date.parse(a.due) : Infinity) - (b.due ? Date.parse(b.due) : Infinity));
}

