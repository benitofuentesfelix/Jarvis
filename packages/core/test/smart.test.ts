import { describe, expect, it } from "vitest";
import {
  allocateTopics,
  buildPlan,
  learningTechnique,
  localParts,
  paceFromOutcomes,
  retention,
  scaleSteps,
  zoned,
  MINUTE,
  type AcademicItem,
  type PlannerSettings,
  type Subject,
  type Topic,
} from "../src";

const TZ = "Atlantic/Canary";
const now = zoned(2026, 11, 3, 8, 0, TZ); // Tuesday

const settings: PlannerSettings = {
  timezone: TZ,
  windows: [
    ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: "16:00", end: "21:00" })),
    ...[0, 6].map((weekday) => ({ weekday, start: "10:00", end: "14:00" })),
  ],
  dailyMaxWeekday: 180,
  dailyMaxWeekend: 200,
  sessionMinutes: 50,
  breakMinutes: 10,
  maxSameSubjectPerDay: 2,
  cambridgeWeeklyMinutes: 150,
  weights: { examen: 1.6, tarea: 1.2, repaso: 0.9, cambridge: 0.8 },
};

const subjects: Subject[] = [
  { id: "mat", name: "Matemáticas I", short: "MAT", color: "c1", difficulty: 4, importance: 3, style: "problemas" },
  { id: "fil", name: "Filosofía", short: "FIL", color: "c4", difficulty: 3, importance: 2, style: "teoria" },
  { id: "cambridge", name: "Cambridge C1", short: "C1", color: "c6", difficulty: 3, importance: 3, style: "idioma" },
];

const topic = (id: string, subjectId: string, mastery: number, dueInDays: number, interval = 3): Topic => ({
  id,
  subjectId,
  name: id,
  mastery,
  easiness: 2.5,
  intervalDays: interval,
  repetitions: 2,
  nextReview: new Date(now.getTime() + dueInDays * 86_400_000).toISOString(),
});

const item = (p: Partial<AcademicItem> & Pick<AcademicItem, "id" | "kind" | "subjectId" | "due" | "effortMinutes">): AcademicItem => ({
  title: p.id,
  doneMinutes: 0,
  topicIds: [],
  source: "manual",
  createdAt: now.toISOString(),
  completed: false,
  ...p,
});

const topics = [topic("derivadas", "mat", 0.3, 30), topic("limites", "mat", 0.8, 30), topic("kant", "fil", 0.6, 1)];
const exam = item({ id: "ex", kind: "examen", subjectId: "mat", due: zoned(2026, 11, 12, 8, 0, TZ).toISOString(), effortMinutes: 350, topicIds: ["derivadas", "limites"] });
const base = { now, subjects, topics, items: [exam], busy: [], settings };
const minutesOf = (b: { start: string; end: string }) => (Date.parse(b.end) - Date.parse(b.start)) / MINUTE;
const localMinutes = (iso: string) => {
  const p = localParts(new Date(iso), TZ);
  return p.hour * 60 + p.minute;
};

describe("study methods", () => {
  it("starts weak topics with worked examples in problem subjects and elaboration in theory", () => {
    expect(learningTechnique(0.3, "problemas", true)).toBe("worked_examples");
    expect(learningTechnique(0.3, "teoria", true)).toBe("elaboration");
    expect(learningTechnique(0.6, "teoria", false)).toBe("active_recall");
    expect(learningTechnique(0.9, "problemas", true)).toBe("interleaved");
  });

  it("gives more sessions to the weaker topic", () => {
    const alloc = allocateTopics([topics[0]!, topics[1]!], 5);
    const weak = alloc.filter((t) => t.id === "derivadas").length;
    expect(weak).toBeGreaterThan(5 - weak);
  });

  it("orders exam prep from understanding to practice", () => {
    const plan = buildPlan(base);
    const seq = plan.blocks.filter((b) => b.itemId === "ex").sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    expect(seq[0]!.technique).toBe("worked_examples");
    expect(seq[0]!.topicId).toBe("derivadas");
    expect(seq.map((b) => b.technique)).toContain("interleaved");
    const mock = seq.findIndex((b) => b.technique === "practice_test");
    const fix = seq.findIndex((b) => b.technique === "error_analysis");
    expect(mock).toBeGreaterThan(0);
    expect(fix).toBeGreaterThan(mock);
  });

  it("splits a session script into 5-minute steps that add up exactly", () => {
    const steps = scaleSteps([[1, "a"], [6, "b"], [2, "c"], [1, "d"]], 50);
    expect(steps.reduce((a, s) => a + s.minutes, 0)).toBe(50);
    expect(steps.every((s) => s.minutes % 5 === 0)).toBe(true);
  });

  it("estimates retention at 90 % when a review comes due and lower after", () => {
    const t = topic("x", "mat", 0.5, 0, 4);
    expect(retention(t, now)).toBeCloseTo(0.9, 5);
    expect(retention(t, new Date(now.getTime() + 4 * 86_400_000))).toBeLessThan(0.85);
  });
});

describe("smarter planning", () => {
  it("puts demanding sessions in peak hours and light reviews outside them", () => {
    const plan = buildPlan({ ...base, settings: { ...settings, peak: { start: "16:00", end: "18:30" } } });
    const hard = plan.blocks.filter((b) => b.focus === 3);
    const light = plan.blocks.filter((b) => b.focus === 1);
    expect(hard.length).toBeGreaterThan(0);
    expect(light.length).toBeGreaterThan(0);
    const inPeak = (b: { start: string }) => localMinutes(b.start) < 18 * 60 + 30 && localMinutes(b.start) >= 16 * 60;
    // On weekdays (where the peak window exists) most hard work lands in it, light work mostly does not.
    const weekday = (b: { start: string }) => [1, 2, 3, 4, 5].includes(localParts(new Date(b.start), TZ).weekday);
    const hardW = hard.filter(weekday);
    const lightW = light.filter(weekday);
    expect(hardW.filter(inPeak).length / hardW.length).toBeGreaterThan(0.7);
    expect(lightW.filter(inPeak).length / Math.max(1, lightW.length)).toBeLessThan(0.5);
  });

  it("learns pace from feedback and adds time to slow subjects", () => {
    const pace = paceFromOutcomes([
      { subjectId: "mat", outcome: "parcial", at: "2026-11-01T17:00:00Z" },
      { subjectId: "mat", outcome: "parcial", at: "2026-11-02T17:00:00Z" },
      { subjectId: "mat", outcome: "no_hecho", at: "2026-11-02T18:00:00Z" },
      { subjectId: "fil", outcome: "hecho", at: "2026-11-02T17:00:00Z" },
    ]);
    expect(pace.mat).toBeGreaterThan(1.15);
    expect(pace.fil).toBeLessThan(1);
    const before = buildPlan(base).blocks.filter((b) => b.itemId === "ex").reduce((a, b) => a + minutesOf(b), 0);
    const after = buildPlan({ ...base, pace }).blocks.filter((b) => b.itemId === "ex").reduce((a, b) => a + minutesOf(b), 0);
    expect(after).toBeGreaterThan(before);
    expect(buildPlan({ ...base, pace }).findings.some((f) => f.id === "pace:mat")).toBe(true);
  });

  it("keeps a daily buffer free of flexible work", () => {
    const plan = buildPlan({ ...base, settings: { ...settings, bufferMinutes: 1000 } });
    expect(plan.blocks.some((b) => b.kind === "cambridge" || b.kind === "repaso")).toBe(false);
    expect(plan.blocks.some((b) => b.itemId === "ex")).toBe(true);
  });

  it("halves the load on the light day unless an exam is close", () => {
    const light = { ...settings, lightDay: 0 };
    const sunday = (b: { start: string }) => localParts(new Date(b.start), TZ).weekday === 0;
    const plan = buildPlan({ ...base, settings: light });
    const sundays = new Map<number, number>();
    for (const b of plan.blocks.filter(sunday)) {
      const d = localParts(new Date(b.start), TZ).day;
      sundays.set(d, (sundays.get(d) ?? 0) + minutesOf(b));
    }
    for (const m of sundays.values()) expect(m).toBeLessThanOrEqual(light.dailyMaxWeekend / 2);
    // Exam on Monday 9: Sunday 8 is not lightened, so the plan matches the one without a light day.
    const mondayExam = item({ id: "lunes", kind: "examen", subjectId: "fil", due: zoned(2026, 11, 9, 8, 0, TZ).toISOString(), effortMinutes: 400, topicIds: ["kant"] });
    const sun8 = (p: ReturnType<typeof buildPlan>) => p.blocks.filter((b) => sunday(b) && localParts(new Date(b.start), TZ).day === 8).map((b) => b.id + b.start);
    const withLight = buildPlan({ ...base, items: [mondayExam], settings: light });
    const without = buildPlan({ ...base, items: [mondayExam] });
    expect(sun8(withLight)).toEqual(sun8(without));
    expect(sun8(withLight).length).toBeGreaterThan(0);
  });

  it("avoids stacking the same subject back to back when there is a choice", () => {
    const plan = buildPlan(base);
    const byDay = new Map<number, typeof plan.blocks>();
    for (const b of plan.blocks) {
      const d = localParts(new Date(b.start), TZ).day;
      byDay.set(d, [...(byDay.get(d) ?? []), b]);
    }
    let stacked = 0;
    let pairs = 0;
    for (const list of byDay.values()) {
      for (let i = 1; i < list.length; i++) {
        if (Date.parse(list[i]!.start) - Date.parse(list[i - 1]!.end) <= 40 * MINUTE) {
          pairs++;
          if (list[i]!.subjectId === list[i - 1]!.subjectId) stacked++;
        }
      }
    }
    expect(stacked).toBeLessThanOrEqual(Math.floor(pairs / 3));
  });

  it("flags weak topics before an exam and explains the response", () => {
    const plan = buildPlan(base);
    const f = plan.findings.find((x) => x.id === "weak:ex");
    expect(f).toBeDefined();
    expect(f!.detail).toMatch(/ejemplos resueltos/);
    expect(f!.detail).toMatch(/simulacro/);
  });

  it("keeps the plan stable from minute to minute and never plans something almost over", () => {
    const a = buildPlan({ ...base, now: zoned(2026, 11, 3, 16, 31, TZ) });
    const b = buildPlan({ ...base, now: zoned(2026, 11, 3, 16, 44, TZ) });
    expect(b.blocks.map((x) => x.id + x.start)).toEqual(a.blocks.map((x) => x.id + x.start));
    const late = zoned(2026, 11, 3, 16, 58, TZ);
    for (const x of buildPlan({ ...base, now: late }).blocks) expect(Date.parse(x.end)).toBeGreaterThanOrEqual(late.getTime() + 15 * MINUTE);
  });
});
