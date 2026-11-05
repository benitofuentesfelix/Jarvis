import type {
  AcademicItem,
  BusyEvent,
  Finding,
  Plan,
  PlannerSettings,
  SessionStep,
  StudyBlock,
  Subject,
  SubjectStyle,
  Technique,
  Topic,
} from "./types";
import {
  MINUTE,
  DAY,
  addLocalDays,
  atLocalTime,
  localDayKey,
  localDaysBetween,
  localParts,
  overlaps,
  startOfLocalDay,
} from "./time";
import { TECHNIQUES, WEAK, allocateTopics, learningTechnique, PHASE_ORDER, sessionScript, techniqueLabel } from "./methods";

export const CAMBRIDGE_SUBJECT_ID = "cambridge";

export interface PlannerInput {
  now: Date;
  horizonDays?: number;
  subjects: Subject[];
  topics: Topic[];
  items: AcademicItem[];
  busy: BusyEvent[];
  settings: PlannerSettings;
  /** Learned pace per subject (see paceFromOutcomes). 1.2 = work takes 20 % longer than estimated. */
  pace?: Record<string, number>;
}

interface Unit {
  key: string;
  kind: StudyBlock["kind"];
  subjectId: string;
  itemId?: string;
  topicId?: string;
  minutes: number;
  technique: Technique;
  title: string;
  reason: string;
  steps: SessionStep[];
  focus: 1 | 2 | 3;
  /** Earliest local day index (0 = today) this unit may be placed on. */
  earliestDay: number;
  /** Preferred local day index. */
  targetDay: number;
  /** Absolute instant the unit must end before. */
  deadline: number;
  score: number;
  /** Nice to have: not reported as missing work when it does not fit. */
  optional?: boolean;
}

interface Slot {
  start: number;
  end: number;
}

interface DayState {
  index: number;
  date: Date;
  free: Slot[];
  usedMinutes: number;
  cap: number;
  light: boolean;
  /** Blocks must end after this instant, so nothing is planned that is already almost over. */
  minEnd: number;
  subjectCount: Map<string, number>;
  placed: StudyBlock[];
}

/** Priority score 0..100 used to order competing work. Pure and explainable. */
export function priorityScore(args: {
  kind: StudyBlock["kind"];
  daysLeft: number;
  subject?: Subject;
  mastery?: number;
  settings: PlannerSettings;
}): number {
  const { kind, daysLeft, subject, settings } = args;
  const weight = settings.weights[kind];
  const urgency = 1 / (1 + Math.max(0, daysLeft) / 3); // 1 today, 0.5 in 3 days, 0.25 in 9
  const importance = subject ? 0.7 + 0.15 * subject.importance : 1;
  const difficulty = subject ? 0.8 + 0.08 * subject.difficulty : 1;
  const gap = 1.15 - (args.mastery ?? 0.5) * 0.6;
  const raw = weight * urgency * importance * difficulty * gap;
  return Math.round(Math.min(100, raw * 60));
}

function freeSlotsForDay(day: Date, input: PlannerInput, notBefore: number): Slot[] {
  const { settings, busy } = input;
  const wd = localParts(day, settings.timezone).weekday;
  let slots: Slot[] = settings.windows
    .filter((w) => w.weekday === wd)
    .map((w) => ({
      start: atLocalTime(day, w.start, settings.timezone).getTime(),
      end: atLocalTime(day, w.end, settings.timezone).getTime(),
    }))
    .map((s) => ({ start: Math.max(s.start, notBefore), end: s.end }))
    .filter((s) => s.end - s.start >= 20 * MINUTE);

  for (const ev of busy) {
    const bs = Date.parse(ev.start);
    const be = Date.parse(ev.end);
    if (ev.origin === "jarvis") continue; // JARVIS blocks are regenerated, not obstacles
    const next: Slot[] = [];
    for (const s of slots) {
      if (!overlaps(s.start, s.end, bs, be)) {
        next.push(s);
        continue;
      }
      if (bs > s.start) next.push({ start: s.start, end: bs });
      if (be < s.end) next.push({ start: be, end: s.end });
    }
    slots = next.filter((s) => s.end - s.start >= 20 * MINUTE);
  }
  return slots.sort((a, b) => a.start - b.start);
}

const FIVE = 5 * MINUTE;
const ceil5 = (t: number) => Math.ceil(t / FIVE) * FIVE;
const floor5 = (t: number) => Math.floor(t / FIVE) * FIVE;

type Template = [number, string][];

const CAMBRIDGE_ROTATION: { title: string; technique: Technique; steps: Template }[] = [
  {
    title: "Use of English · partes 1–4",
    technique: "deliberate_practice",
    steps: [
      [1, "Repasa tus errores típicos de transformaciones"],
      [6, "Partes 1–4 con el tiempo del examen"],
      [2, "Corrige y apunta cada colocación nueva"],
      [1, "Pasa lo aprendido a tarjetas"],
    ],
  },
  {
    title: "Reading · partes 5–7",
    technique: "active_recall",
    steps: [
      [1, "Lee primero las preguntas, luego el texto"],
      [7, "Partes 5–7 cronometradas"],
      [2, "Justifica cada fallo con la frase exacta del texto"],
    ],
  },
  {
    title: "Listening · partes 1–4",
    technique: "deliberate_practice",
    steps: [
      [7, "Partes 1–4 con audio, como en el examen"],
      [2, "Revisa con la transcripción lo que se te escapó"],
      [1, "Apunta las paráfrasis que no reconociste"],
    ],
  },
  {
    title: "Writing · ensayo 220–260 palabras",
    technique: "deliberate_practice",
    steps: [
      [1, "Plan: estructura y cinco expresiones C1 que vas a usar"],
      [6, "Escribe sin diccionario"],
      [2, "Revisa con la checklist: registro, cohesión, variedad"],
      [1, "Cuenta palabras y pule la conclusión"],
    ],
  },
  {
    title: "Speaking · long turn cronometrado",
    technique: "deliberate_practice",
    steps: [
      [1, "Elige fotos de la parte 2 y prepara el cronómetro"],
      [6, "Turnos de un minuto grabándote"],
      [3, "Escúchate y anota muletillas y errores"],
    ],
  },
  {
    title: "Vocabulary · tarjetas y collocations",
    technique: "spaced_review",
    steps: [
      [1, "Tarjetas: las que tocan hoy"],
      [3, "Collocations y phrasal verbs nuevos en frases tuyas"],
      [1, "Mini test de diez palabras"],
    ],
  },
];

function styleOf(subject?: Subject): SubjectStyle {
  return subject?.style ?? "teoria";
}

function focusOf(technique: Technique, subject?: Subject): 1 | 2 | 3 {
  const f = TECHNIQUES[technique].focus;
  return f === 2 && (subject?.difficulty ?? 0) >= 4 ? 3 : f;
}

const pct = (x: number) => `${Math.round(x * 100)} %`;
const days = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;

function buildUnits(input: PlannerInput, horizon: number): Unit[] {
  const { now, settings, subjects, topics, items } = input;
  const tz = settings.timezone;
  const subj = new Map(subjects.map((s) => [s.id, s]));
  const topicById = new Map(topics.map((t) => [t.id, t]));
  const units: Unit[] = [];
  const S = settings.sessionMinutes;
  const short = Math.max(20, Math.round(S / 2 / 5) * 5);
  const dayEnd = (d: number) => addLocalDays(now, d + 1, tz).getTime();

  for (const item of items) {
    if (item.completed || item.kind === "material" || item.kind === "aviso") continue;
    const due = Date.parse(item.due);
    if (due <= now.getTime()) continue;
    const pace = input.pace?.[item.subjectId] ?? 1;
    const base = Math.max(0, item.effortMinutes - item.doneMinutes);
    const remaining = Math.round(base * pace);
    if (remaining <= 0) continue;
    const extra = remaining - base;
    const paceNote = extra >= 10 ? ` · +${extra} min porque esta asignatura te está llevando más de lo previsto` : "";
    const subject = subj.get(item.subjectId);
    const style = styleOf(subject);
    const dueDay = localDaysBetween(now, new Date(due), tz);
    const itemTopics = item.topicIds.map((id) => topicById.get(id)).filter(Boolean) as Topic[];
    const mastery = itemTopics.length ? itemTopics.reduce((a, t) => a + t.mastery, 0) / itemTopics.length : 0.5;
    const n = Math.max(1, Math.round(remaining / S));
    const name = subject?.name ?? "Otros";

    if (item.kind === "examen") {
      // Exam prep in phases: understand → practise → mock test → fix errors → light review on the eve.
      const lastDay = Math.max(0, dueDay - 1);
      const span = Math.min(lastDay, Math.max(n * 2, 4));
      const firstDay = Math.max(0, lastDay - span);
      const examDayStart = startOfLocalDay(new Date(due), tz).getTime();
      const tail: Technique[] = n === 1 ? ["practice_test"] : n === 2 ? ["practice_test"] : n === 3 ? ["practice_test", "error_analysis"] : ["practice_test", "error_analysis", "light_review"];
      const learnN = n - tail.length;
      const multi = itemTopics.length > 1;

      // Learning sessions: weaker topics get more of them, and each repeat moves up a phase.
      const seen = new Map<string, number>();
      const learning = allocateTopics(itemTopics, learnN).map((t) => {
        const k = seen.get(t.id) ?? 0;
        seen.set(t.id, k + 1);
        return { topic: t as Topic | undefined, technique: learningTechnique(Math.min(1, t.mastery + 0.15 * k), style, multi) };
      });
      while (learning.length < learnN) learning.push({ topic: undefined, technique: learningTechnique(mastery, style, false) });
      if (learnN >= 3 && multi) learning[learnN - 1] = { topic: undefined, technique: "interleaved" };
      learning.sort((a, b) => PHASE_ORDER.indexOf(a.technique) - PHASE_ORDER.indexOf(b.technique));

      const tailTarget = (k: number) => Math.max(0, lastDay - (tail.length - 1 - k));
      const learnEnd = Math.max(firstDay, tailTarget(0) - 1);
      const mockDay = tailTarget(0);

      const seq = [
        ...learning.map((l, i) => ({
          ...l,
          target: learnN === 1 ? firstDay : Math.round(firstDay + ((learnEnd - firstDay) * i) / Math.max(1, learnN - 1)),
        })),
        ...tail.map((technique, k) => ({ topic: undefined as Topic | undefined, technique, target: tailTarget(k) })),
      ];

      seq.forEach((s, i) => {
        const { technique, topic, target } = s;
        const what =
          technique === "practice_test"
            ? "simulacro de examen"
            : technique === "error_analysis"
              ? "corregir fallos del simulacro"
              : technique === "light_review"
                ? "repaso final"
                : technique === "interleaved"
                  ? "ejercicios mezclados de todo el temario"
                  : topic?.name ?? item.title;
        const why =
          technique === "practice_test"
            ? ` a ${days(dueDay - target)} del examen, con tiempo para corregir lo que falle`
            : technique === "error_analysis"
              ? ": lo que falles hoy no lo fallas en el examen"
              : technique === "light_review"
                ? ": víspera tranquila, nada de materia nueva"
                : topic
                  ? ` · ${topic.name} al ${pct(topic.mastery)}${topic.mastery < WEAK ? ", primero entenderlo" : topic.mastery < 0.75 ? ", toca practicar sin mirar" : ", ya toca mezclar"}`
                  : "";
        const minutes = technique === "light_review" ? short : S;
        units.push({
          key: `${item.id}#${i}`,
          kind: "examen",
          subjectId: item.subjectId,
          itemId: item.id,
          topicId: topic?.id,
          minutes,
          technique,
          title: `${name} · ${what}`,
          reason: `Examen en ${days(dueDay)} · sesión ${i + 1} de ${seq.length} · ${techniqueLabel(technique)}${why}${i === 0 ? paceNote : ""}`,
          steps: sessionScript({ technique, minutes, style, topic: topic?.name ?? item.title.replace(/^Examen:\s*/i, "") }),
          focus: focusOf(technique, subject),
          // The mock and the error review must not drift past their day, or they lose their point.
          earliestDay: technique === "error_analysis" ? mockDay : technique === "light_review" ? lastDay : 0,
          targetDay: target,
          deadline: technique === "practice_test" || technique === "error_analysis" ? Math.min(examDayStart, dayEnd(target)) : examDayStart,
          score: priorityScore({ kind: "examen", daysLeft: dueDay, subject, mastery, settings }),
          optional: technique === "light_review",
        });
      });
    } else {
      // Tasks: work as early as reasonable, finished with margin before the deadline.
      for (let i = 0; i < n; i++) {
        const target = Math.min(i, Math.max(0, dueDay - 1));
        units.push({
          key: `${item.id}#${i}`,
          kind: "tarea",
          subjectId: item.subjectId,
          itemId: item.id,
          minutes: S,
          technique: "task_work",
          title: `${name} · ${item.title}`,
          reason: `Entrega en ${days(dueDay)} · bloque ${i + 1} de ${n} · terminar con margen${i === 0 ? paceNote : ""}`,
          steps: sessionScript({ technique: "task_work", minutes: S, style }),
          focus: focusOf("task_work", subject),
          earliestDay: 0,
          targetDay: target,
          deadline: due - 2 * 60 * MINUTE,
          score: priorityScore({ kind: "tarea", daysLeft: dueDay, subject, mastery: 0.5, settings }),
        });
      }
    }
  }

  // Spaced reviews for topics that come due inside the horizon.
  for (const t of topics) {
    const at = Date.parse(t.nextReview);
    const day = Math.max(0, localDaysBetween(now, new Date(at), tz));
    if (day >= horizon) continue;
    const subject = subj.get(t.subjectId);
    const nextGap = Math.max(1, Math.round((t.intervalDays || 1) * t.easiness));
    units.push({
      key: `review:${t.id}`,
      kind: "repaso",
      subjectId: t.subjectId,
      topicId: t.id,
      minutes: short,
      technique: "spaced_review",
      title: `${subject?.name ?? "Repaso"} · ${t.name}`,
      reason: `Se cumple su intervalo de ${days(t.intervalDays || 1)} (dominio ${pct(t.mastery)}). Si lo recuerdas bien, el siguiente repaso será dentro de unos ${days(nextGap)}`,
      steps: sessionScript({ technique: "spaced_review", minutes: short, style: styleOf(subject), topic: t.name }),
      focus: 1,
      earliestDay: day,
      targetDay: day,
      deadline: addLocalDays(now, day + 3, tz).getTime(),
      score: priorityScore({ kind: "repaso", daysLeft: 1, subject, mastery: t.mastery, settings }),
    });
  }

  // Cambridge: weekly target split into sessions, rotating the papers.
  const perWeek = Math.max(0, Math.round(settings.cambridgeWeeklyMinutes / S));
  const weeks = Math.ceil(horizon / 7);
  let rot = Math.floor(now.getTime() / DAY) % CAMBRIDGE_ROTATION.length;
  for (let w = 0; w < weeks; w++) {
    for (let i = 0; i < perWeek; i++) {
      const r = CAMBRIDGE_ROTATION[rot++ % CAMBRIDGE_ROTATION.length]!;
      const target = Math.min(horizon - 1, w * 7 + Math.round(((i + 0.5) * 7) / perWeek));
      units.push({
        key: `cambridge:${w}:${i}`,
        kind: "cambridge",
        subjectId: CAMBRIDGE_SUBJECT_ID,
        minutes: S,
        technique: r.technique,
        title: `Cambridge C1 · ${r.title}`,
        reason: `Objetivo semanal de Cambridge: ${settings.cambridgeWeeklyMinutes} min · sesión ${i + 1} de ${perWeek} · se rotan las cinco partes del examen`,
        steps: sessionScript({ technique: r.technique, minutes: S, custom: r.steps }),
        focus: TECHNIQUES[r.technique].focus,
        earliestDay: w * 7,
        targetDay: target,
        deadline: addLocalDays(now, Math.min(horizon, (w + 1) * 7), tz).getTime(),
        score: priorityScore({ kind: "cambridge", daysLeft: 5, settings }),
      });
    }
  }

  return units;
}

/**
 * Places a unit in the day at the best moment, not just the first free one:
 * demanding sessions go to the student's peak hours, light ones outside them,
 * the same subject is not stacked back to back, and windows are not chopped into useless scraps.
 */
function tryPlace(day: DayState, unit: Unit, settings: PlannerSettings): StudyBlock | null {
  const len = unit.minutes * MINUTE;
  const flexible = unit.kind === "repaso" || unit.kind === "cambridge";
  const cap = flexible ? day.cap - (settings.bufferMinutes ?? 0) : day.cap;
  if (day.usedMinutes + unit.minutes > cap) return null;
  if ((day.subjectCount.get(unit.subjectId) ?? 0) >= settings.maxSameSubjectPerDay) return null;

  const tz = settings.timezone;
  const brk = settings.breakMinutes * MINUTE;
  const peak = settings.peak
    ? { start: atLocalTime(day.date, settings.peak.start, tz).getTime(), end: atLocalTime(day.date, settings.peak.end, tz).getTime() }
    : null;
  const dayStart = day.date.getTime();

  let best: { slot: number; start: number; score: number } | null = null;
  for (let i = 0; i < day.free.length; i++) {
    const s = day.free[i]!;
    const lo = ceil5(s.start);
    const options = new Set<number>([lo, floor5(s.end - len)]);
    if (peak) {
      options.add(ceil5(Math.max(s.start, peak.start)));
      options.add(floor5(Math.min(s.end, peak.end) - len));
    }
    for (const start of options) {
      const end = start + len;
      if (start < lo || end > s.end || end > unit.deadline || end < day.minEnd) continue;
      let score = 0;
      if (peak) {
        const inPeak = Math.max(0, Math.min(end, peak.end) - Math.max(start, peak.start)) / len;
        score += unit.focus === 3 ? 2 * inPeak : unit.focus === 1 ? -inPeak : 0.5 * inPeak;
      }
      // Light work drifts to the end of the evening, everything else to the start.
      score += ((unit.focus === 1 ? 1 : -1) * (start - dayStart)) / DAY;
      // Scraps of time that nothing will fit into.
      for (const piece of [start - brk - s.start, s.end - end - brk]) {
        if (piece > 0 && piece < 20 * MINUTE) score -= 0.8;
        else if (piece >= 20 * MINUTE && piece < settings.sessionMinutes * MINUTE) score -= 0.3;
      }
      // Interleaving: avoid the same subject right before or after.
      for (const b of day.placed) {
        if (b.subjectId !== unit.subjectId) continue;
        const gap = Math.min(Math.abs(start - Date.parse(b.end)), Math.abs(Date.parse(b.start) - end));
        if (gap <= brk + 30 * MINUTE) score -= 1;
      }
      if (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) < 1e-9 && start < best.start)) {
        best = { slot: i, start, score };
      }
    }
  }
  if (!best) return null;

  const s = day.free[best.slot]!;
  const end = best.start + len;
  const pieces: Slot[] = [
    { start: s.start, end: best.start - brk },
    { start: end + brk, end: s.end },
  ].filter((p) => p.end - p.start >= 20 * MINUTE);
  day.free.splice(best.slot, 1, ...pieces);

  const block: StudyBlock = {
    id: `blk_${unit.key}`,
    start: new Date(best.start).toISOString(),
    end: new Date(end).toISOString(),
    subjectId: unit.subjectId,
    itemId: unit.itemId,
    topicId: unit.topicId,
    kind: unit.kind,
    technique: unit.technique,
    title: unit.title,
    reason: unit.reason,
    score: unit.score,
    steps: unit.steps,
    focus: unit.focus,
  };
  day.usedMinutes += unit.minutes;
  day.subjectCount.set(unit.subjectId, (day.subjectCount.get(unit.subjectId) ?? 0) + 1);
  day.placed.push(block);
  return block;
}

export function buildPlan(input: PlannerInput): Plan {
  const { now, settings, items } = input;
  const tz = settings.timezone;
  const horizon = input.horizonDays ?? 14;
  // Anchor "now" to the half hour so the plan does not drift every minute: a block due at 17:00
  // still reads "now" at 17:20 instead of sliding to 17:30, 17:35, 17:40...
  const notBefore = Math.floor(now.getTime() / (30 * MINUTE)) * 30 * MINUTE;
  const minEnd = now.getTime() + 15 * MINUTE;
  const examDays = items
    .filter((i) => i.kind === "examen" && !i.completed && Date.parse(i.due) > now.getTime())
    .map((i) => localDaysBetween(now, new Date(i.due), tz));

  const days: DayState[] = [];
  for (let i = 0; i < horizon; i++) {
    const date = addLocalDays(now, i, tz);
    const wd = localParts(date, tz).weekday;
    let cap = wd === 0 || wd === 6 ? settings.dailyMaxWeekend : settings.dailyMaxWeekday;
    // The light day protects rest, except right before an exam.
    const light = settings.lightDay === wd && !examDays.some((d) => d > i && d <= i + 2);
    if (light) cap = Math.round(cap / 2);
    days.push({
      index: i,
      date,
      free: freeSlotsForDay(date, input, notBefore),
      usedMinutes: 0,
      cap,
      light,
      minEnd,
      subjectCount: new Map(),
      placed: [],
    });
  }

  // Pass order mirrors the default priority rule: deadlines (exams, tasks) first in
  // earliest-deadline order, then spaced reviews, then Cambridge in the remaining time.
  const pass = (u: Unit) => (u.optional ? 3 : u.kind === "examen" || u.kind === "tarea" ? 0 : u.kind === "repaso" ? 1 : 2);
  const units = buildUnits(input, horizon).sort(
    (a, b) => pass(a) - pass(b) || a.deadline - b.deadline || b.score - a.score || a.key.localeCompare(b.key),
  );

  const blocks: StudyBlock[] = [];
  const unscheduled: Plan["unscheduled"] = [];

  for (const unit of units) {
    const target = Math.min(Math.max(unit.targetDay, unit.earliestDay), horizon - 1);
    // Try the preferred day, then earlier days (closest first), then later days before the deadline.
    const order: number[] = [target];
    for (let d = target - 1; d >= unit.earliestDay; d--) order.push(d);
    for (let d = target + 1; d < horizon; d++) order.push(d);
    let placed: StudyBlock | null = null;
    for (const d of order) {
      const day = days[d];
      if (!day || day.date.getTime() >= unit.deadline) continue;
      placed = tryPlace(day, unit, settings);
      if (placed) break;
    }
    if (placed) blocks.push(placed);
    else if (unit.itemId && !unit.optional)
      unscheduled.push({
        itemId: unit.itemId,
        minutes: unit.minutes,
        reason: "No hay hueco libre antes de la fecha límite sin superar tu límite diario.",
      });
  }

  // The error review only makes sense after the mock: if placement put it first, swap their times.
  for (const id of new Set(blocks.map((b) => b.itemId).filter(Boolean))) {
    const mock = blocks.find((b) => b.itemId === id && b.technique === "practice_test");
    const fix = blocks.find((b) => b.itemId === id && b.technique === "error_analysis");
    if (mock && fix && Date.parse(fix.start) < Date.parse(mock.start)) {
      const { start, end } = mock;
      mock.start = fix.start;
      mock.end = fix.end;
      fix.start = start;
      fix.end = end;
    }
  }

  blocks.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const plan: Plan = {
    generatedAt: now.toISOString(),
    horizonDays: horizon,
    blocks,
    unscheduled,
    findings: [],
  };
  plan.findings = analyze(input, plan, days);
  return plan;
}

/** Proactive checks over the plan: the planner's half of the "proactive system". */
export function analyze(input: PlannerInput, plan: Plan, days?: DayState[]): Finding[] {
  const { now, items, settings, subjects } = input;
  const tz = settings.timezone;
  const findings: Finding[] = [];
  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? id;

  // 1. Work that does not fit.
  const byItem = new Map<string, number>();
  for (const u of plan.unscheduled) byItem.set(u.itemId, (byItem.get(u.itemId) ?? 0) + u.minutes);
  for (const [itemId, minutes] of byItem) {
    const item = items.find((i) => i.id === itemId);
    if (!item) continue;
    findings.push({
      id: `overload:${itemId}`,
      agent: "planner",
      type: "alerta",
      severity: 3,
      title: `Faltan ${minutes} min para «${item.title}»`,
      detail: `No caben antes de la fecha con tu límite diario actual. Opciones: ampliar el límite esos días, empezar antes o reducir otra actividad.`,
    });
  }

  // 2. Exam clusters: 3+ exams inside any 7-day window.
  const exams = items
    .filter((i) => i.kind === "examen" && !i.completed && Date.parse(i.due) > now.getTime())
    .sort((a, b) => Date.parse(a.due) - Date.parse(b.due));
  for (let i = 0; i < exams.length; i++) {
    const inWindow = exams.filter(
      (e) => Date.parse(e.due) >= Date.parse(exams[i]!.due) && Date.parse(e.due) < Date.parse(exams[i]!.due) + 7 * DAY,
    );
    if (inWindow.length >= 3) {
      const first = new Date(exams[i]!.due);
      const daysTo = localDaysBetween(now, first, tz);
      findings.push({
        id: `cluster:${localDayKey(first, tz)}`,
        agent: "planner",
        type: "riesgo",
        severity: 2,
        title: `${inWindow.length} exámenes en 7 días`,
        detail: `${inWindow.map((e) => subjectName(e.subjectId)).join(", ")}. Empiezan en ${daysTo} días: he adelantado sesiones para repartir la carga.`,
      });
      break;
    }
  }

  // 3. Cambridge below weekly target in the next 7 days.
  const weekEnd = addLocalDays(now, 7, tz).getTime();
  const cambridgeMin = plan.blocks
    .filter((b) => b.kind === "cambridge" && Date.parse(b.start) < weekEnd)
    .reduce((a, b) => a + (Date.parse(b.end) - Date.parse(b.start)) / MINUTE, 0);
  if (cambridgeMin < settings.cambridgeWeeklyMinutes * 0.75) {
    findings.push({
      id: "cambridge:below",
      agent: "planner",
      type: "recomendacion",
      severity: 1,
      title: `Cambridge: ${Math.round(cambridgeMin)} de ${settings.cambridgeWeeklyMinutes} min esta semana`,
      detail: "Los exámenes ocupan los huecos. Lo compenso la semana que viene, salvo que prefieras mantenerlo.",
    });
  }

  // 4. Overdue tasks accumulating.
  const overdue = items.filter((i) => i.kind === "tarea" && !i.completed && Date.parse(i.due) < now.getTime());
  if (overdue.length >= 1) {
    findings.push({
      id: "overdue",
      agent: "planner",
      type: "alerta",
      severity: overdue.length >= 2 ? 3 : 2,
      title: `${overdue.length} ${overdue.length === 1 ? "tarea vencida" : "tareas vencidas"} sin marcar`,
      detail: overdue.map((o) => o.title).join(" · ") + ". Márcalas como entregadas o dime si necesitas tiempo extra.",
    });
  }

  // 5. Heavy days in a row.
  if (days) {
    const heavy = days.filter((d) => d.index < 7 && d.usedMinutes >= d.cap * 0.9).length;
    if (heavy >= 3) {
      findings.push({
        id: "heavy-week",
        agent: "planner",
        type: "recomendacion",
        severity: 2,
        title: `${heavy} días al límite esta semana`,
        detail: "Semana exigente. He reservado los descansos; si notas cansancio, dime qué día aligerar.",
      });
    }
  }

  // 6. Weak topics right before an exam: say what JARVIS is doing about it.
  const topicById = new Map(input.topics.map((t) => [t.id, t]));
  for (const exam of exams) {
    const d = localDaysBetween(now, new Date(exam.due), tz);
    if (d > 10) continue;
    const weak = exam.topicIds.map((id) => topicById.get(id)).filter((t): t is Topic => !!t && t.mastery < WEAK);
    if (!weak.length) continue;
    const prep = plan.blocks.filter((b) => b.itemId === exam.id);
    const weakIds = new Set(weak.map((t) => t.id));
    const first = prep.find((b) => b.topicId && weakIds.has(b.topicId));
    const sessions = prep.filter((b) => b.topicId && weakIds.has(b.topicId)).length;
    const mock = prep.find((b) => b.technique === "practice_test");
    const mockDay = mock ? new Intl.DateTimeFormat("es-ES", { timeZone: tz, weekday: "long" }).format(new Date(mock.start)) : undefined;
    findings.push({
      id: `weak:${exam.id}`,
      agent: "planner",
      type: "riesgo",
      severity: 2,
      title: `${weak.map((t) => `${t.name} (${Math.round(t.mastery * 100)} %)`).join(", ")}: examen en ${d} días`,
      detail: `${sessions > 1 ? `Le he dado ${sessions} sesiones, más que al resto del temario` : "Va primero en tu preparación"}${
        first ? `, y empiezo con ${techniqueLabel(first.technique)} antes de practicar solo` : ""
      }.${mockDay ? ` El simulacro es el ${mockDay}: sabrás a tiempo cómo vas.` : ""}`,
    });
  }

  // 7. Learned pace: a subject that consistently takes longer than estimated.
  for (const [subjectId, p] of Object.entries(input.pace ?? {})) {
    if (p < 1.2) continue;
    findings.push({
      id: `pace:${subjectId}`,
      agent: "planner",
      type: "recomendacion",
      severity: 1,
      title: `${subjectName(subjectId)} te lleva un ${Math.round((p - 1) * 100)} % más de lo previsto`,
      detail: "Lo he aprendido de cómo marcas tus sesiones y ya he ampliado su tiempo en el plan.",
    });
  }

  return findings.sort((a, b) => b.severity - a.severity);
}
