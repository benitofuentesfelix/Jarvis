// Domain model shared by the planner, the gateway, the web app and (later) the workers.

export type GoalArea = "academico" | "cambridge" | "universidad" | "personal";
export type Status = "activo" | "en_riesgo" | "al_dia" | "completado" | "pausado";

export interface Goal {
  id: string;
  title: string;
  area: GoalArea;
  description: string;
  targetDate: string; // ISO date
  priority: 1 | 2 | 3; // 1 = highest
  status: Status;
  metrics: Metric[];
  projects: Project[];
}

export interface Metric {
  id: string;
  label: string;
  unit: string;
  target: number;
  current: number;
  /** Historical values, oldest first. */
  history: { date: string; value: number }[];
}

export interface Project {
  id: string;
  title: string;
  status: Status;
  nextAction: string;
  milestones: Milestone[];
}

export interface Milestone {
  id: string;
  title: string;
  dueDate: string;
  done: boolean;
}

export interface Subject {
  id: string;
  name: string;
  short: string;
  color: string; // token name, resolved by the UI
  /** 1 (easy) .. 5 (hard), as perceived by the student. */
  difficulty: number;
  /** Weight in the student's goals, 1..3. */
  importance: number;
  /** Average grade so far (0..10), if any. */
  average?: number;
  /** How the subject is learned: problem solving, theory, or a language. Shapes the session scripts. */
  style?: SubjectStyle;
}

export type SubjectStyle = "problemas" | "teoria" | "idioma";

export interface Topic {
  id: string;
  subjectId: string;
  name: string;
  /** 0..1 estimated mastery. */
  mastery: number;
  /** Spaced-repetition state. */
  easiness: number; // SM-2 EF, >= 1.3
  intervalDays: number;
  repetitions: number;
  nextReview: string; // ISO date-time
}

export type ItemKind = "examen" | "tarea" | "material" | "aviso";
export type ItemSource = "evagd" | "notion" | "gcal" | "email" | "manual" | "jarvis";

export interface AcademicItem {
  id: string;
  kind: ItemKind;
  subjectId: string;
  title: string;
  /** For exams: the exam start. For tasks: the deadline. */
  due: string; // ISO date-time
  /** Estimated total work in minutes. */
  effortMinutes: number;
  /** Minutes already done. */
  doneMinutes: number;
  topicIds: string[];
  source: ItemSource;
  createdAt: string;
  completed: boolean;
}

/** Busy time the planner must respect (classes, personal events, sleep handled by windows). */
export interface BusyEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  /** "personal" events are never modified by JARVIS. */
  origin: "personal" | "jarvis";
}

export interface StudyWindow {
  /** 0 = Sunday .. 6 = Saturday. */
  weekday: number;
  /** "HH:MM" local time. */
  start: string;
  end: string;
}

export interface PlannerSettings {
  timezone: string;
  windows: StudyWindow[];
  /** Max study minutes per day (weekday / weekend). */
  dailyMaxWeekday: number;
  dailyMaxWeekend: number;
  sessionMinutes: number;
  breakMinutes: number;
  /** Max sessions of the same subject in one day (forces interleaving). */
  maxSameSubjectPerDay: number;
  /** Weekly Cambridge practice target in minutes. */
  cambridgeWeeklyMinutes: number;
  /** Relative weights the student can tune. */
  weights: { examen: number; tarea: number; repaso: number; cambridge: number };
  /** Hours when the student concentrates best ("HH:MM"). Demanding sessions go here, light ones outside. */
  peak?: { start: string; end: string };
  /** Minutes per day kept free from flexible work (reviews, Cambridge) so surprises fit without reshuffling. */
  bufferMinutes?: number;
  /** Weekday (0 = Sunday) with half the usual load, unless an exam is in the next two days. */
  lightDay?: number;
}

export type Technique =
  | "worked_examples"
  | "elaboration"
  | "active_recall"
  | "deliberate_practice"
  | "interleaved"
  | "practice_test"
  | "error_analysis"
  | "light_review"
  | "spaced_review"
  | "task_work";

export interface SessionStep {
  minutes: number;
  label: string;
}

export interface StudyBlock {
  id: string;
  start: string;
  end: string;
  subjectId: string;
  itemId?: string;
  topicId?: string;
  kind: "examen" | "tarea" | "repaso" | "cambridge";
  technique: Technique;
  title: string;
  /** One-line explanation shown on the block ("¿por qué?"). */
  reason: string;
  score: number;
  /** Minute-by-minute script for the session. */
  steps: SessionStep[];
  /** 1 light .. 3 demanding: how much concentration the session needs. */
  focus: 1 | 2 | 3;
}

export interface Finding {
  id: string;
  agent: "planner" | "strategist" | "researcher" | "coach";
  type: "alerta" | "riesgo" | "oportunidad" | "recomendacion";
  severity: 1 | 2 | 3; // 3 = most severe
  title: string;
  detail: string;
}

export interface Plan {
  generatedAt: string;
  horizonDays: number;
  blocks: StudyBlock[];
  /** Work that could not be placed before its deadline. */
  unscheduled: { itemId: string; minutes: number; reason: string }[];
  findings: Finding[];
}

export interface PlanChange {
  type: "added" | "removed" | "moved";
  block: StudyBlock;
  previous?: StudyBlock;
  explanation: string;
}
