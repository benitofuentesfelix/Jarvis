// EVAGD (Moodle) calendar export → academic items.
// Everything in the feed is data written by other people: it is parsed and classified,
// never followed as instructions.

import type { AcademicItem, ItemKind, Subject } from "./types";
import { zoned } from "./time";

export interface IcsEvent {
  uid: string;
  summary: string;
  description: string;
  categories: string[];
  start: Date;
  end?: Date;
  allDay: boolean;
}

/** RFC 5545 unfolding + unescaping, enough for Moodle's export. */
export function parseIcs(text: string, tz: string): IcsEvent[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const events: IcsEvent[] = [];
  let cur: Record<string, { value: string; params: Record<string, string> }> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      cur = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur?.DTSTART && cur.UID) {
        const s = parseDate(cur.DTSTART.value, cur.DTSTART.params, tz);
        if (s) {
          const e = cur.DTEND ? parseDate(cur.DTEND.value, cur.DTEND.params, tz) : undefined;
          events.push({
            uid: cur.UID.value,
            summary: unescape(cur.SUMMARY?.value ?? ""),
            description: unescape(cur.DESCRIPTION?.value ?? ""),
            categories: (cur.CATEGORIES?.value ?? "").split(/(?<!\\),/).map((c) => unescape(c).trim()).filter(Boolean),
            start: s.date,
            end: e?.date,
            allDay: s.allDay,
          });
        }
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const [name, ...rawParams] = line.slice(0, colon).split(";");
    const params: Record<string, string> = {};
    for (const p of rawParams) {
      const [k, v] = p.split("=");
      if (k && v) params[k.toUpperCase()] = v.replace(/^"|"$/g, "");
    }
    cur[name!.toUpperCase()] = { value: line.slice(colon + 1), params };
  }
  return events;
}

function unescape(s: string) {
  return s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();
}

function parseDate(v: string, params: Record<string, string>, tz: string): { date: Date; allDay: boolean } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, , z] = m;
  if (h === undefined) return { date: zoned(+y!, +mo!, +d!, 23, 59, tz), allDay: true };
  if (z) return { date: new Date(Date.UTC(+y!, +mo! - 1, +d!, +h, +mi!)), allDay: false };
  return { date: zoned(+y!, +mo!, +d!, +h, +mi!, params.TZID ?? tz), allDay: false };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Keywords that identify each subject in a Moodle course name. */
const SUBJECT_HINTS: Record<string, RegExp> = {
  mat: /matemat|\bmat\b|\bmatii?\b/,
  fyq: /fisica|quimica|\bfyq\b|\bfq\b/,
  eco: /econom/,
  len: /lengua|literatura|\blcl\b/,
  fil: /filosof/,
  ing: /ingles|english|\bing\b|primera lengua extranjera/,
};

export function guessSubject(text: string, subjects: Subject[]): string | undefined {
  const t = norm(text);
  for (const s of subjects) {
    const hint = SUBJECT_HINTS[s.id];
    if (hint?.test(t) || t.includes(norm(s.name))) return s.id;
  }
  return undefined;
}

export function classify(summary: string): ItemKind {
  const t = norm(summary);
  if (/\b(examen|prueba escrita|prueba objetiva|control|parcial|recuperacion|evaluacion)\b/.test(t)) return "examen";
  if (/tarea|entrega|vence|fecha de entrega|cierra|actividad|trabajo|cuestionario|proyecto|practica/.test(t)) return "tarea";
  return "aviso";
}

/** Strips Moodle's suffixes ("está en fecha de entrega", "vence", "cierra") to keep the real title. */
export function cleanTitle(summary: string): string {
  return summary
    .replace(/\s*(está en fecha de entrega|esta en fecha de entrega|vence|cierra|se cierra|debe completarse|is due|closes)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

const DEFAULT_EFFORT: Record<ItemKind, number> = { examen: 250, tarea: 100, material: 0, aviso: 0 };

/**
 * Turns the feed into items. Stable ids come from the event UID, so a re-sync updates
 * instead of duplicating. Events of unknown subjects are kept as "avisos" for review.
 */
export function itemsFromIcs(events: IcsEvent[], subjects: Subject[], now: Date): AcademicItem[] {
  const out: AcademicItem[] = [];
  for (const ev of events) {
    if (ev.start.getTime() < now.getTime() - 86_400_000) continue;
    const subjectId = guessSubject(`${ev.categories.join(" ")} ${ev.summary} ${ev.description}`, subjects);
    let kind = classify(ev.summary);
    if (!subjectId && kind !== "aviso") kind = "aviso";
    out.push({
      id: `evagd:${ev.uid}`,
      kind,
      subjectId: subjectId ?? "otra",
      title: cleanTitle(ev.summary) || "Evento de EVAGD",
      due: ev.start.toISOString(),
      effortMinutes: DEFAULT_EFFORT[kind],
      doneMinutes: 0,
      topicIds: [],
      source: "evagd",
      createdAt: now.toISOString(),
      completed: false,
    });
  }
  return out.sort((a, b) => Date.parse(a.due) - Date.parse(b.due));
}

/**
 * Merges a fresh sync into the current items: keeps progress (doneMinutes, completed,
 * effort the student corrected) and drops EVAGD items that disappeared from the feed.
 */
export function mergeSynced(current: AcademicItem[], synced: AcademicItem[], source: AcademicItem["source"]): AcademicItem[] {
  const prev = new Map(current.map((i) => [i.id, i]));
  const merged = synced.map((s) => {
    const p = prev.get(s.id);
    return p ? { ...s, doneMinutes: p.doneMinutes, completed: p.completed, effortMinutes: p.effortMinutes, topicIds: p.topicIds, createdAt: p.createdAt } : s;
  });
  const ids = new Set(synced.map((s) => s.id));
  return [...current.filter((i) => i.source !== source || ids.has(i.id)).filter((i) => !ids.has(i.id)), ...merged];
}
