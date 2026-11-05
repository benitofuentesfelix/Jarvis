import { describe, expect, it } from "vitest";
import { agendaCandidates, agendaDue, boundEffort, localDayKey, resolveAgendaDay, similarItem, zoned, type AcademicItem, type AgendaEntry } from "../src";

const TZ = "Atlantic/Canary";
// Thursday 5 November 2026, 14:30 in Canarias (just out of school).
const now = zoned(2026, 11, 5, 14, 30, TZ);
const key = (d: Date | null) => (d ? localDayKey(d, TZ) : null);

describe("agenda dates", () => {
  it("relative days count from today", () => {
    expect(key(resolveAgendaDay({ type: "relativo", days: 1 }, now, TZ))).toBe("2026-11-06");
    expect(key(resolveAgendaDay({ type: "relativo", days: 0 }, now, TZ))).toBe("2026-11-05");
    expect(resolveAgendaDay({ type: "relativo", days: -2 }, now, TZ)).toBeNull();
  });

  it("weekdays mean the next one, never today", () => {
    expect(key(resolveAgendaDay({ type: "dia_semana", weekday: 5, nextWeek: false }, now, TZ))).toBe("2026-11-06"); // viernes
    expect(key(resolveAgendaDay({ type: "dia_semana", weekday: 1, nextWeek: false }, now, TZ))).toBe("2026-11-09"); // lunes
    expect(key(resolveAgendaDay({ type: "dia_semana", weekday: 4, nextWeek: false }, now, TZ))).toBe("2026-11-12"); // jueves → el de la semana que viene
  });

  it("'que viene' moves a weekday of this week to next week", () => {
    expect(key(resolveAgendaDay({ type: "dia_semana", weekday: 5, nextWeek: true }, now, TZ))).toBe("2026-11-13");
    expect(key(resolveAgendaDay({ type: "dia_semana", weekday: 1, nextWeek: true }, now, TZ))).toBe("2026-11-09");
  });

  it("'para mañana' and weekdays count from the page's date when it has one", () => {
    const monday = { day: 2, month: 11 };
    expect(key(resolveAgendaDay({ type: "relativo", days: 1, from: monday }, now, TZ))).toBe("2026-11-03");
    expect(key(resolveAgendaDay({ type: "dia_semana", weekday: 3, nextWeek: false, from: monday }, now, TZ))).toBe("2026-11-04");
    expect(key(resolveAgendaDay({ type: "relativo", days: 1, from: { day: 31, month: 12 } }, now, TZ))).toBe("2027-01-01");
  });

  it("day numbers without month roll to next month once past", () => {
    expect(key(resolveAgendaDay({ type: "fecha", day: 12, month: null }, now, TZ))).toBe("2026-11-12");
    expect(key(resolveAgendaDay({ type: "fecha", day: 3, month: null }, now, TZ))).toBe("2026-12-03");
    expect(key(resolveAgendaDay({ type: "fecha", day: 31, month: null }, now, TZ))).toBe("2026-12-31"); // noviembre no tiene 31
  });

  it("full dates far in the past belong to next year", () => {
    expect(key(resolveAgendaDay({ type: "fecha", day: 15, month: 1 }, now, TZ))).toBe("2027-01-15");
    expect(key(resolveAgendaDay({ type: "fecha", day: 20, month: 11 }, now, TZ))).toBe("2026-11-20");
    expect(key(resolveAgendaDay({ type: "fecha", day: 30, month: 10 }, now, TZ))).toBe("2026-10-30"); // reciente: se queda (aparecerá como atrasada)
    expect(resolveAgendaDay({ type: "fecha", day: 30, month: 2 }, now, TZ)).toBeNull();
    expect(resolveAgendaDay({ type: "ninguna" }, now, TZ)).toBeNull();
  });

  it("due is before school, or tonight when it is for today", () => {
    const fri = resolveAgendaDay({ type: "relativo", days: 1 }, now, TZ)!;
    expect(agendaDue(fri, now, TZ).toISOString()).toBe(zoned(2026, 11, 6, 8, 0, TZ).toISOString());
    const today = resolveAgendaDay({ type: "relativo", days: 0 }, now, TZ)!;
    expect(agendaDue(today, now, TZ).toISOString()).toBe(zoned(2026, 11, 5, 21, 30, TZ).toISOString());
  });
});

describe("agenda candidates", () => {
  const entry = (p: Partial<AgendaEntry>): AgendaEntry => ({
    title: "Ejercicios 3, 4 y 5 pág. 52",
    subjectId: "mat",
    kind: "tarea",
    when: { type: "relativo", days: 1 },
    effortMinutes: 40,
    readText: "Mates: ej 3,4,5 pág 52 para mañana",
    confidence: "alta",
    pageDate: null,
    ...p,
  });
  const existing: AcademicItem = {
    id: "x1",
    kind: "tarea",
    subjectId: "mat",
    title: "ejercicios 3 4 5 pag 52",
    due: zoned(2026, 11, 6, 8, 0, TZ).toISOString(),
    effortMinutes: 40,
    doneMinutes: 0,
    topicIds: [],
    source: "manual",
    createdAt: now.toISOString(),
    completed: false,
  };

  it("bounds effort and keeps unknown subjects as 'otra'", () => {
    expect(boundEffort("tarea", 0)).toBe(45);
    expect(boundEffort("tarea", 1000)).toBe(240);
    expect(boundEffort("examen", 20)).toBe(60);
    const [c] = agendaCandidates([entry({ subjectId: "biologia", effortMinutes: 3 })], [], ["mat", "len"], now, TZ);
    expect(c).toMatchObject({ subjectId: "otra", effortMinutes: 10 });
  });

  it("flags work that already exists and drops repeats inside the same photo", () => {
    const out = agendaCandidates([entry({}), entry({ title: "ejercicios 3,4,5 pagina 52" }), entry({ title: "Resumen tema 4", subjectId: "len" })], [existing], ["mat", "len"], now, TZ);
    expect(out).toHaveLength(2);
    expect(out.find((c) => c.subjectId === "mat")!.duplicateOf).toBe("x1");
    expect(out.find((c) => c.subjectId === "len")!.duplicateOf).toBeNull();
  });

  it("leaves undated entries for the student to date, at the end", () => {
    const out = agendaCandidates([entry({ when: { type: "ninguna" }, title: "Traer la autorización" }), entry({})], [], ["mat"], now, TZ);
    expect(out[0]!.due).not.toBeNull();
    expect(out[1]).toMatchObject({ due: null, duplicateOf: null });
  });

  it("undated entries under a day heading take that day only if it is not past", () => {
    const [ahead] = agendaCandidates([entry({ when: { type: "ninguna" }, pageDate: { day: 9, month: 11 } })], [], ["mat"], now, TZ);
    expect(key(ahead!.due ? new Date(ahead!.due) : null)).toBe("2026-11-09");
    const [past] = agendaCandidates([entry({ when: { type: "ninguna" }, pageDate: { day: 3, month: 11 } })], [], ["mat"], now, TZ);
    expect(past!.due).toBeNull();
  });

  it("similarity needs the same subject and nearby dates", () => {
    const a = { subjectId: "mat", title: "Ejercicios pág 52", due: existing.due };
    expect(similarItem(a, existing)).toBe(true);
    expect(similarItem({ ...a, subjectId: "fyq" }, existing)).toBe(false);
    expect(similarItem({ ...a, due: zoned(2026, 11, 20, 8, 0, TZ).toISOString() }, existing)).toBe(false);
  });
});
