import { describe, expect, it } from "vitest";
import {
  buildPlan,
  decide,
  diffPlans,
  localParts,
  reviewTopic,
  zoned,
  type AcademicItem,
  type BusyEvent,
  type PlannerSettings,
  type Subject,
  type Topic,
  MINUTE,
} from "../src";

const TZ = "Atlantic/Canary";
const now = zoned(2026, 11, 3, 8, 0, TZ); // Tuesday 08:00

const settings: PlannerSettings = {
  timezone: TZ,
  windows: [
    ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: "16:30", end: "20:30" })),
    ...[0, 6].flatMap((weekday) => [
      { weekday, start: "10:00", end: "13:00" },
      { weekday, start: "17:00", end: "19:00" },
    ]),
  ],
  dailyMaxWeekday: 150,
  dailyMaxWeekend: 180,
  sessionMinutes: 50,
  breakMinutes: 10,
  maxSameSubjectPerDay: 2,
  cambridgeWeeklyMinutes: 150,
  weights: { examen: 1.6, tarea: 1.2, repaso: 0.9, cambridge: 0.8 },
};

const subjects: Subject[] = [
  { id: "mat", name: "Matemáticas I", short: "MAT", color: "c1", difficulty: 4, importance: 3 },
  { id: "fyq", name: "Física y Química", short: "FYQ", color: "c2", difficulty: 4, importance: 2 },
  { id: "his", name: "Historia", short: "HIS", color: "c3", difficulty: 2, importance: 2 },
];

const topic = (id: string, subjectId: string, mastery: number, nextReviewDays: number): Topic => ({
  id,
  subjectId,
  name: id,
  mastery,
  easiness: 2.5,
  intervalDays: 3,
  repetitions: 2,
  nextReview: new Date(now.getTime() + nextReviewDays * 86_400_000).toISOString(),
});

const topics: Topic[] = [topic("derivadas", "mat", 0.4, 20), topic("limites", "mat", 0.6, 20), topic("cinematica", "fyq", 0.5, 2)];

const item = (p: Partial<AcademicItem> & Pick<AcademicItem, "id" | "kind" | "subjectId" | "due" | "effortMinutes">): AcademicItem => ({
  title: p.id,
  doneMinutes: 0,
  topicIds: [],
  source: "manual",
  createdAt: now.toISOString(),
  completed: false,
  ...p,
});

const items: AcademicItem[] = [
  item({ id: "exam-mat", kind: "examen", subjectId: "mat", due: zoned(2026, 11, 10, 8, 0, TZ).toISOString(), effortMinutes: 250, topicIds: ["derivadas", "limites"] }),
  item({ id: "task-his", kind: "tarea", subjectId: "his", due: zoned(2026, 11, 5, 23, 59, TZ).toISOString(), effortMinutes: 100 }),
];

const busy: BusyEvent[] = [
  { id: "futbol", title: "Entreno", start: zoned(2026, 11, 4, 17, 0, TZ).toISOString(), end: zoned(2026, 11, 4, 18, 30, TZ).toISOString(), origin: "personal" },
];

const base = { now, subjects, topics, items, busy, settings };

describe("time helpers", () => {
  it("handles the Canary DST change (UTC+0 in winter, UTC+1 in summer)", () => {
    expect(zoned(2026, 1, 15, 10, 0, TZ).toISOString()).toBe("2026-01-15T10:00:00.000Z");
    expect(zoned(2026, 7, 15, 10, 0, TZ).toISOString()).toBe("2026-07-15T09:00:00.000Z");
    expect(localParts(zoned(2026, 7, 15, 10, 0, TZ), TZ).hour).toBe(10);
  });
});

describe("planner", () => {
  const plan = buildPlan(base);
  const blocks = plan.blocks;

  it("places blocks", () => {
    expect(blocks.length).toBeGreaterThan(5);
  });

  it("never overlaps blocks with each other or with personal events", () => {
    const sorted = [...blocks].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    for (let i = 1; i < sorted.length; i++) {
      expect(Date.parse(sorted[i]!.start)).toBeGreaterThanOrEqual(Date.parse(sorted[i - 1]!.end) + settings.breakMinutes * MINUTE);
    }
    for (const b of blocks)
      for (const e of busy)
        expect(Date.parse(b.start) < Date.parse(e.end) && Date.parse(e.start) < Date.parse(b.end)).toBe(false);
  });

  it("keeps every block inside a study window", () => {
    for (const b of blocks) {
      const s = localParts(new Date(b.start), TZ);
      const e = localParts(new Date(b.end), TZ);
      const sm = s.hour * 60 + s.minute;
      const em = e.hour * 60 + e.minute;
      const ok = settings.windows.some((w) => {
        const [wh, wm] = w.start.split(":").map(Number);
        const [eh, emm] = w.end.split(":").map(Number);
        return w.weekday === s.weekday && sm >= wh! * 60 + wm! && em <= eh! * 60 + emm!;
      });
      expect(ok, `${b.title} ${b.start}`).toBe(true);
    }
  });

  it("respects the daily cap and the same-subject limit", () => {
    const perDay = new Map<string, { min: number; subj: Map<string, number> }>();
    for (const b of blocks) {
      const p = localParts(new Date(b.start), TZ);
      const k = `${p.year}-${p.month}-${p.day}`;
      const d = perDay.get(k) ?? { min: 0, subj: new Map() };
      d.min += (Date.parse(b.end) - Date.parse(b.start)) / MINUTE;
      d.subj.set(b.subjectId, (d.subj.get(b.subjectId) ?? 0) + 1);
      perDay.set(k, d);
      const cap = p.weekday === 0 || p.weekday === 6 ? settings.dailyMaxWeekend : settings.dailyMaxWeekday;
      expect(d.min).toBeLessThanOrEqual(cap);
      for (const n of d.subj.values()) expect(n).toBeLessThanOrEqual(settings.maxSameSubjectPerDay);
    }
  });

  it("prepares exams in phases: learn, mock test, fix errors, light review on the eve", () => {
    const exam = blocks.filter((b) => b.itemId === "exam-mat").sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    expect(exam.length).toBe(5);
    for (const b of exam) expect(Date.parse(b.end)).toBeLessThan(zoned(2026, 11, 10, 0, 0, TZ).getTime());
    const order = exam.map((b) => b.technique);
    expect(order.slice(-3)).toEqual(["practice_test", "error_analysis", "light_review"]);
    // The mock test leaves at least one full day to fix what went wrong.
    const mock = exam.find((b) => b.technique === "practice_test")!;
    expect(localParts(new Date(mock.start), TZ).day).toBeLessThanOrEqual(8);
    // The eve is light: the last session is short.
    const eve = exam.at(-1)!;
    expect(localParts(new Date(eve.start), TZ).day).toBe(9);
    expect((Date.parse(eve.end) - Date.parse(eve.start)) / MINUTE).toBeLessThan(settings.sessionMinutes);
    // Spread over several days rather than crammed.
    const days = new Set(exam.map((b) => localParts(new Date(b.start), TZ).day));
    expect(days.size).toBeGreaterThanOrEqual(4);
  });

  it("gives every block a session script that adds up to its length", () => {
    for (const b of blocks) {
      expect(b.steps.length).toBeGreaterThan(0);
      const total = b.steps.reduce((a, s) => a + s.minutes, 0);
      expect(total, b.title).toBe((Date.parse(b.end) - Date.parse(b.start)) / MINUTE);
      for (const s of b.steps) expect(s.minutes).toBeGreaterThanOrEqual(5);
    }
  });

  it("finishes tasks with margin before the deadline", () => {
    const task = blocks.filter((b) => b.itemId === "task-his");
    expect(task.length).toBe(2);
    for (const b of task) expect(Date.parse(b.end)).toBeLessThanOrEqual(Date.parse(items[1]!.due) - 120 * MINUTE);
  });

  it("schedules due spaced reviews", () => {
    expect(blocks.some((b) => b.kind === "repaso" && b.topicId === "cinematica")).toBe(true);
  });

  it("schedules Cambridge practice", () => {
    expect(blocks.filter((b) => b.kind === "cambridge").length).toBeGreaterThan(0);
  });

  it("explains every block", () => {
    for (const b of blocks) expect(b.reason.length).toBeGreaterThan(10);
  });

  it("flags overload when work cannot fit before the deadline", () => {
    const heavy = buildPlan({
      ...base,
      items: [item({ id: "huge", kind: "tarea", subjectId: "his", due: zoned(2026, 11, 4, 22, 0, TZ).toISOString(), effortMinutes: 600 })],
    });
    expect(heavy.unscheduled.length).toBeGreaterThan(0);
    expect(heavy.findings.some((f) => f.id === "overload:huge" && f.severity === 3)).toBe(true);
  });

  it("detects exam clusters", () => {
    const cluster = buildPlan({
      ...base,
      items: [
        ...items,
        item({ id: "e2", kind: "examen", subjectId: "fyq", due: zoned(2026, 11, 11, 8, 0, TZ).toISOString(), effortMinutes: 100 }),
        item({ id: "e3", kind: "examen", subjectId: "his", due: zoned(2026, 11, 13, 8, 0, TZ).toISOString(), effortMinutes: 100 }),
      ],
    });
    expect(cluster.findings.some((f) => f.id.startsWith("cluster:"))).toBe(true);
  });

  it("explains the impact of a new task on the plan", () => {
    const after = buildPlan({
      ...base,
      items: [...items, item({ id: "new", kind: "tarea", subjectId: "fyq", due: zoned(2026, 11, 4, 23, 0, TZ).toISOString(), effortMinutes: 100 })],
    });
    const changes = diffPlans(plan.blocks, after.blocks, TZ);
    expect(changes.some((c) => c.type === "added" && c.block.itemId === "new")).toBe(true);
    expect(changes.every((c) => c.explanation.length > 0)).toBe(true);
  });

  it("is deterministic", () => {
    expect(buildPlan(base).blocks).toEqual(blocks);
  });
});

describe("spaced repetition", () => {
  it("grows the interval on good recall and resets on failure", () => {
    let t = topics[0]!;
    t = { ...t, repetitions: 0, intervalDays: 0 };
    t = reviewTopic(t, 5, now);
    expect(t.intervalDays).toBe(1);
    t = reviewTopic(t, 4, now);
    expect(t.intervalDays).toBe(3);
    t = reviewTopic(t, 4, now);
    expect(t.intervalDays).toBeGreaterThan(5);
    const fail = reviewTopic(t, 1, now);
    expect(fail.intervalDays).toBe(1);
    expect(fail.mastery).toBeLessThan(t.mastery);
  });
});

describe("action gateway", () => {
  const ctx = { authorized: new Set(["google", "push"]), readOnly: false, dryRun: new Set<string>(), jarvisCalendarId: "cal_jarvis" };

  it("executes JARVIS-calendar blocks automatically", () => {
    expect(decide({ name: "calendar.create_jarvis_block", params: { calendarId: "cal_jarvis" }, requestedBy: "planner", reason: "x" }, ctx).outcome).toBe("execute");
  });
  it("never touches other calendars without approval", () => {
    expect(decide({ name: "calendar.move_jarvis_block", params: { calendarId: "primary" }, requestedBy: "planner", reason: "x" }, ctx).outcome).toBe("needs_approval");
  });
  it("requires approval for personal events", () => {
    expect(decide({ name: "calendar.modify_personal_event", params: {}, requestedBy: "core", reason: "x" }, ctx).outcome).toBe("needs_approval");
  });
  it("refuses unauthorized integrations and read-only mode", () => {
    expect(decide({ name: "notion.write", params: {}, requestedBy: "core", reason: "x" }, ctx).outcome).toBe("refused");
    expect(decide({ name: "calendar.create_jarvis_block", params: { calendarId: "cal_jarvis" }, requestedBy: "planner", reason: "x" }, { ...ctx, readOnly: true }).outcome).toBe("refused");
  });
  it("marks dry-run integrations", () => {
    const d = decide({ name: "calendar.create_jarvis_block", params: { calendarId: "cal_jarvis" }, requestedBy: "planner", reason: "x" }, { ...ctx, dryRun: new Set(["google"]) });
    expect(d).toEqual({ outcome: "execute", dryRun: true });
  });
});

describe("block boundaries", () => {
  it("starts every block on a clean 5-minute boundary", () => {
    const odd = zoned(2026, 11, 3, 16, 23, TZ);
    const plan = buildPlan({ ...base, now: odd });
    for (const b of plan.blocks) {
      const p = localParts(new Date(b.start), TZ);
      expect(p.minute % 5, `${b.title} ${b.start}`).toBe(0);
    }
  });
});
