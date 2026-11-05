import { describe, expect, it } from "vitest";
import { dueNotifications, inQuietHours, zoned, type StudyBlock } from "../src";

const TZ = "Atlantic/Canary";
const quiet = { start: "22:30", end: "07:30" };

const block = (id: string, h: number, m: number, minutes = 50): StudyBlock => {
  const start = zoned(2026, 11, 4, h, m, TZ);
  return {
    id,
    start: start.toISOString(),
    end: new Date(start.getTime() + minutes * 60_000).toISOString(),
    subjectId: "mat",
    kind: "examen",
    technique: "deliberate_practice",
    title: "Matemáticas: derivadas",
    reason: "Examen el viernes",
    score: 1,
    steps: [],
    focus: 3,
  };
};

const base = (at: Date, extra: Partial<Parameters<typeof dueNotifications>[0]> = {}) =>
  dueNotifications({ now: at, tz: TZ, blocks: [block("b1", 16, 0), block("b2", 17, 0)], quiet, maxPerDay: 3, sentKeys: new Set(), sentToday: 0, ...extra });

describe("notificaciones", () => {
  it("respeta las horas de silencio, también cruzando medianoche", () => {
    expect(inQuietHours(zoned(2026, 11, 4, 23, 0, TZ), TZ, quiet)).toBe(true);
    expect(inQuietHours(zoned(2026, 11, 4, 6, 59, TZ), TZ, quiet)).toBe(true);
    expect(inQuietHours(zoned(2026, 11, 4, 7, 30, TZ), TZ, quiet)).toBe(false);
    expect(base(zoned(2026, 11, 4, 6, 0, TZ))).toEqual([]);
  });

  it("manda el resumen de la mañana una sola vez y solo antes de mediodía", () => {
    const msgs = base(zoned(2026, 11, 4, 7, 35, TZ));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.title).toBe("Hoy: 2 sesiones, 1 h 40 min");
    expect(msgs[0]!.body).toContain("16:00");
    expect(base(zoned(2026, 11, 4, 7, 40, TZ), { sentKeys: new Set([msgs[0]!.key]) })).toEqual([]);
    expect(base(zoned(2026, 11, 4, 12, 30, TZ))).toEqual([]);
  });

  it("recuerda cada sesión poco antes de empezar, sin repetir", () => {
    const at = zoned(2026, 11, 4, 15, 50, TZ);
    const msgs = base(at);
    expect(msgs.map((m) => m.title)).toEqual(["A las 16:00: Matemáticas: derivadas"]);
    expect(msgs[0]!.body).toContain("50 min");
    expect(base(at, { sentKeys: new Set([msgs[0]!.key]) })).toEqual([]);
    expect(base(zoned(2026, 11, 4, 15, 30, TZ))).toEqual([]); // too early
  });

  it("no recuerda sesiones ya marcadas y no pasa del máximo diario", () => {
    const at = zoned(2026, 11, 4, 15, 50, TZ);
    expect(base(at, { doneKeys: new Set([`b1@${block("b1", 16, 0).start}`]) })).toEqual([]);
    expect(base(at, { sentToday: 3 })).toEqual([]);
  });
  it("recuerda la foto de la agenda al salir del cole, solo entre semana y si no está hecha", () => {
    const agenda = { at: "14:15", doneToday: false };
    const keys = (at: Date, a = agenda) => base(at, { agenda: a, blocks: [] }).map((m) => m.key);
    expect(keys(zoned(2026, 11, 4, 14, 10, TZ))).not.toContain("agenda:2026-11-04");
    expect(keys(zoned(2026, 11, 4, 14, 20, TZ))).toContain("agenda:2026-11-04");
    expect(keys(zoned(2026, 11, 4, 17, 20, TZ))).not.toContain("agenda:2026-11-04"); // pasadas 3 h
    expect(keys(zoned(2026, 11, 4, 14, 20, TZ), { at: "14:15", doneToday: true })).toEqual([]);
    expect(keys(zoned(2026, 11, 7, 14, 20, TZ))).toEqual([]); // sábado
    expect(base(zoned(2026, 11, 4, 14, 20, TZ), { agenda, blocks: [], sentKeys: new Set(["agenda:2026-11-04"]) })).toEqual([]);
  });
});
