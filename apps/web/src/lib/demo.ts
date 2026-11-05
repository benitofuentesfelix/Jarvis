// Example data used until EVAGD, Notion and Google Calendar are connected.
// Everything is generated relative to "now" so the demo always looks current.
// The UI marks this mode clearly ("Datos de ejemplo").

import {
  addLocalDays,
  atLocalTime,
  CAMBRIDGE_SUBJECT_ID,
  type AcademicItem,
  type BusyEvent,
  type Goal,
  type PlannerSettings,
  type Subject,
  type Topic,
  localParts,
} from "@jarvis/core";

export const TZ = "Atlantic/Canary";
/** Weekday reminder to photograph the planner: Canary secondary schools end around 14:00. */
export const AGENDA_DEFAULT = "14:15";

export const defaultSettings: PlannerSettings = {
  timezone: TZ,
  windows: [
    ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: "16:00", end: "20:45" })),
    { weekday: 6, start: "10:00", end: "13:30" },
    { weekday: 6, start: "17:00", end: "19:00" },
    { weekday: 0, start: "10:30", end: "13:30" },
    { weekday: 0, start: "17:00", end: "19:30" },
  ],
  dailyMaxWeekday: 180,
  dailyMaxWeekend: 210,
  sessionMinutes: 50,
  breakMinutes: 10,
  maxSameSubjectPerDay: 2,
  cambridgeWeeklyMinutes: 150,
  weights: { examen: 1.6, tarea: 1.2, repaso: 0.9, cambridge: 0.8 },
  peak: { start: "16:00", end: "19:00" },
  bufferMinutes: 20,
  lightDay: 0,
};

export const subjects: Subject[] = [
  { id: "mat", name: "Matemáticas I", short: "MAT", color: "c1", difficulty: 4, importance: 3, average: 8.4, style: "problemas" },
  { id: "fyq", name: "Física y Química", short: "FYQ", color: "c2", difficulty: 4, importance: 2, average: 8.1, style: "problemas" },
  { id: "eco", name: "Economía", short: "ECO", color: "c8", difficulty: 2, importance: 3, average: 9.2, style: "teoria" },
  { id: "len", name: "Lengua y Literatura I", short: "LEN", color: "c3", difficulty: 3, importance: 2, average: 8.7, style: "teoria" },
  { id: "fil", name: "Filosofía", short: "FIL", color: "c4", difficulty: 3, importance: 2, average: 8.9, style: "teoria" },
  { id: "ing", name: "Inglés I", short: "ING", color: "c5", difficulty: 2, importance: 2, average: 9.4, style: "idioma" },
  { id: CAMBRIDGE_SUBJECT_ID, name: "Cambridge C1", short: "C1", color: "c6", difficulty: 3, importance: 3, style: "idioma" },
];

const iso = (d: Date) => d.toISOString();

export function demoTopics(now: Date): Topic[] {
  const day = (n: number) => iso(addLocalDays(now, n, TZ));
  const t = (id: string, subjectId: string, name: string, mastery: number, next: number, interval = 3): Topic => ({
    id,
    subjectId,
    name,
    mastery,
    easiness: 2.4,
    intervalDays: interval,
    repetitions: 2,
    nextReview: day(next),
  });
  return [
    t("mat-derivadas", "mat", "Derivadas", 0.45, 9),
    t("mat-limites", "mat", "Límites y continuidad", 0.62, 9),
    t("mat-trigo", "mat", "Trigonometría", 0.78, 1, 6),
    t("fyq-cinematica", "fyq", "Cinemática", 0.55, 2),
    t("fyq-dinamica", "fyq", "Dinámica", 0.4, 12),
    t("eco-mercado", "eco", "Oferta y demanda", 0.82, 4, 8),
    t("fil-etica", "fil", "Ética de Kant", 0.5, 15),
    t("len-romanticismo", "len", "Romanticismo", 0.6, 3),
  ];
}

function at(now: Date, days: number, hhmm: string) {
  return atLocalTime(addLocalDays(now, days, TZ), hhmm, TZ);
}

export function demoItems(now: Date): AcademicItem[] {
  const h = (hours: number) => iso(new Date(now.getTime() - hours * 3_600_000));
  return [
    {
      id: "ex-mat-derivadas",
      kind: "examen",
      subjectId: "mat",
      title: "Examen: derivadas y límites",
      due: iso(at(now, 6, "08:00")),
      effortMinutes: 300,
      doneMinutes: 50,
      topicIds: ["mat-derivadas", "mat-limites"],
      source: "evagd",
      createdAt: h(72),
      completed: false,
    },
    {
      id: "ex-fyq-dinamica",
      kind: "examen",
      subjectId: "fyq",
      title: "Examen: dinámica",
      due: iso(at(now, 9, "10:00")),
      effortMinutes: 250,
      doneMinutes: 0,
      topicIds: ["fyq-dinamica", "fyq-cinematica"],
      source: "evagd",
      createdAt: h(30),
      completed: false,
    },
    {
      id: "ta-len-comentario",
      kind: "tarea",
      subjectId: "len",
      title: "Comentario de texto: Bécquer",
      due: iso(at(now, 2, "23:59")),
      effortMinutes: 100,
      doneMinutes: 0,
      topicIds: ["len-romanticismo"],
      source: "evagd",
      createdAt: h(3),
      completed: false,
    },
    {
      id: "ta-eco-informe",
      kind: "tarea",
      subjectId: "eco",
      title: "Informe: elasticidad del precio",
      due: iso(at(now, 4, "23:59")),
      effortMinutes: 100,
      doneMinutes: 0,
      topicIds: ["eco-mercado"],
      source: "notion",
      createdAt: h(50),
      completed: false,
    },
    {
      id: "ex-fil-kant",
      kind: "examen",
      subjectId: "fil",
      title: "Examen: Kant",
      due: iso(at(now, 13, "09:00")),
      effortMinutes: 150,
      doneMinutes: 0,
      topicIds: ["fil-etica"],
      source: "evagd",
      createdAt: h(20),
      completed: false,
    },
    {
      id: "mat-apuntes-t4",
      kind: "material",
      subjectId: "mat",
      title: "Nuevos apuntes: tema 4 (derivadas)",
      due: iso(now),
      effortMinutes: 0,
      doneMinutes: 0,
      topicIds: ["mat-derivadas"],
      source: "evagd",
      createdAt: h(5),
      completed: false,
    },
  ];
}

/** Personal events: classes, training, family. JARVIS reads them but never edits them. */
/**
 * Personal events. With real accounts connected and no Google Calendar yet, only the school
 * timetable is assumed; the example training and family plans are not invented for a real student.
 */
export function demoBusy(now: Date, days = 14, schoolOnly = false): BusyEvent[] {
  const out: BusyEvent[] = [];
  for (let i = 0; i < days; i++) {
    const d = addLocalDays(now, i, TZ);
    const wd = localParts(d, TZ).weekday;
    const ev = (id: string, title: string, s: string, e: string) =>
      out.push({ id: `${id}-${i}`, title, start: iso(atLocalTime(d, s, TZ)), end: iso(atLocalTime(d, e, TZ)), origin: "personal" });
    if (wd >= 1 && wd <= 5) ev("clase", "Instituto", "08:00", "14:00");
    if (schoolOnly) continue;
    if (wd === 2 || wd === 4) ev("entreno", "Entreno de baloncesto", "18:30", "20:00");
    if (wd === 6) ev("familia", "Comida familiar", "13:30", "16:00");
    if (wd === 3) ev("academia", "Academia de inglés", "16:00", "17:00");
  }
  return out;
}

export function demoGoals(now: Date): Goal[] {
  const month = (n: number) => iso(addLocalDays(now, -30 * n, TZ)).slice(0, 10);
  return [
    {
      id: "g-academico",
      title: "Excelencia académica",
      area: "academico",
      description: "Media de 1.º de Bachillerato por encima de 9, con Matemáticas ≥ 8,5 (requisito Rotterdam ≥ 8).",
      targetDate: "2027-06-20",
      priority: 1,
      status: "al_dia",
      metrics: [
        {
          id: "m-media",
          label: "Nota media",
          unit: "",
          target: 9.2,
          current: 8.78,
          history: [5, 4, 3, 2, 1, 0].map((n, i) => ({ date: month(n), value: [8.2, 8.35, 8.4, 8.5, 8.7, 8.78][i]! })),
        },
        {
          id: "m-mates",
          label: "Matemáticas",
          unit: "",
          target: 8.5,
          current: 8.4,
          history: [5, 4, 3, 2, 1, 0].map((n, i) => ({ date: month(n), value: [7.6, 7.9, 8.0, 8.1, 8.3, 8.4][i]! })),
        },
      ],
      projects: [
        {
          id: "p-eval1",
          title: "Primera evaluación",
          status: "activo",
          nextAction: "Preparar examen de derivadas",
          milestones: [
            { id: "ms-1", title: "Examen de Matemáticas", dueDate: iso(at(now, 6, "08:00")).slice(0, 10), done: false },
            { id: "ms-2", title: "Examen de Física y Química", dueDate: iso(at(now, 9, "10:00")).slice(0, 10), done: false },
            { id: "ms-3", title: "Examen de Filosofía", dueDate: iso(at(now, 13, "09:00")).slice(0, 10), done: false },
          ],
        },
      ],
    },
    {
      id: "g-cambridge",
      title: "Cambridge C1 Advanced",
      area: "cambridge",
      description: "Certificado C1 con 185+ en la escala Cambridge y 170+ en cada destreza.",
      targetDate: "2027-06-15",
      priority: 1,
      status: "activo",
      metrics: [
        {
          id: "m-scale",
          label: "Escala Cambridge estimada",
          unit: "",
          target: 185,
          current: 172,
          history: [5, 4, 3, 2, 1, 0].map((n, i) => ({ date: month(n), value: [161, 164, 166, 168, 170, 172][i]! })),
        },
      ],
      projects: [
        {
          id: "p-c1",
          title: "Preparación C1",
          status: "activo",
          nextAction: "Simulacro de Reading & Use of English",
          milestones: [
            { id: "ms-c1-1", title: "Diagnóstico inicial con examen oficial", dueDate: "2026-10-15", done: true },
            { id: "ms-c1-2", title: "Use of English ≥ 175", dueDate: "2027-01-31", done: false },
            { id: "ms-c1-3", title: "Simulacro completo ≥ 180", dueDate: "2027-04-15", done: false },
            { id: "ms-c1-4", title: "Examen oficial", dueDate: "2027-06-15", done: false },
          ],
        },
      ],
    },
    {
      id: "g-rotterdam",
      title: "Erasmus University Rotterdam",
      area: "universidad",
      description: "Solicitud a IBEB / IBA para septiembre de 2028, con todos los requisitos cumplidos.",
      targetDate: "2028-01-15",
      priority: 2,
      status: "al_dia",
      metrics: [
        {
          id: "m-reqs",
          label: "Requisitos en camino",
          unit: "de 6",
          target: 6,
          current: 3,
          history: [2, 1, 0].map((n, i) => ({ date: month(n), value: [1, 2, 3][i]! })),
        },
      ],
      projects: [
        {
          id: "p-eur",
          title: "Solicitud 2028",
          status: "activo",
          nextAction: "Confirmar requisito de Matemáticas para IBEB con un español",
          milestones: [
            { id: "ms-eur-1", title: "Studielink abre (estimado)", dueDate: "2027-10-01", done: false },
            { id: "ms-eur-2", title: "Plazo Studielink", dueDate: "2028-01-15", done: false },
            { id: "ms-eur-3", title: "Formulario y motivación (IBA)", dueDate: "2028-01-31", done: false },
            { id: "ms-eur-4", title: "Resultados de inglés y matemáticas", dueDate: "2028-03-15", done: false },
          ],
        },
      ],
    },
    {
      id: "g-personal",
      title: "Equilibrio y hábitos",
      area: "personal",
      description: "Dormir 8 h, deporte 3 veces por semana y un día ligero tras cada semana de exámenes.",
      targetDate: "2027-06-30",
      priority: 2,
      status: "al_dia",
      metrics: [
        {
          id: "m-sleep",
          label: "Horas de sueño (media semanal)",
          unit: "h",
          target: 8,
          current: 7.4,
          history: [5, 4, 3, 2, 1, 0].map((n, i) => ({ date: month(n), value: [7.0, 7.2, 7.5, 7.3, 7.6, 7.4][i]! })),
        },
      ],
      projects: [
        {
          id: "p-habits",
          title: "Rutina sostenible",
          status: "activo",
          nextAction: "Sin pantallas después de las 23:00",
          milestones: [],
        },
      ],
    },
  ];
}

export interface Requirement {
  id: string;
  label: string;
  detail: string;
  state: "cumplido" | "en_camino" | "pendiente" | "riesgo";
  source: string;
}

/** Verified on official pages (Nov 2026). See the proposal doc for sources. */
export const rotterdamRequirements: Requirement[] = [
  {
    id: "mates",
    label: "Matemáticas ≥ 8",
    detail: "IBA exige Matemáticas I/II (Ciencias) ≥ 8,0. Vas con 8,4.",
    state: "en_camino",
    source: "https://www.rsm.nl/education/bachelor/bsc-international-business-administration-iba/admission-application/faq-item/759-spain-titulo-de-bachiller/",
  },
  {
    id: "pau",
    label: "PAU: media ≥ 6 y Matemáticas ≥ 6",
    detail: "Junio de 2028. Cada materia ≥ 6 según la regla general de Erasmus.",
    state: "pendiente",
    source: "https://www.eur.nl/en/education/practical-matters/bachelor-admission-and-application/diploma-overview",
  },
  {
    id: "ingles",
    label: "Inglés: C1 Advanced ≥ 170",
    detail: "IBA: 170 en cada destreza. Válido 2 años: el examen de junio de 2027 cubre la solicitud.",
    state: "en_camino",
    source: "https://www.rsm.nl/education/bachelor/bsc-international-business-administration-iba/iba-english-requirements-and-tests/",
  },
  {
    id: "media8",
    label: "Media ≥ 8 (puntos de selección)",
    detail: "En IBA las notas pesan un 75 % del ranking. Tu media actual: 8,78.",
    state: "cumplido",
    source: "https://www.rsm.nl/education/bachelor/bsc-international-business-administration-iba/admission-application/faq-item/759-spain-titulo-de-bachiller/",
  },
  {
    id: "studielink",
    label: "Studielink antes del 15 de enero",
    detail: "Para septiembre de 2028. Fecha estimada a partir del calendario 2026-27.",
    state: "pendiente",
    source: "https://www.eur.nl/en/education/practical-matters/bachelor-admission-and-application/programmes-limited-places-numerus-fixus",
  },
  {
    id: "motivacion",
    label: "Motivación (25 % en IBA)",
    detail: "Dos preguntas cortas en inglés. JARVIS empezará a recoger ideas en 2.º.",
    state: "pendiente",
    source: "https://www.rsm.nl/education/bachelor/bsc-international-business-administration-iba/admission-application/",
  },
];

export interface MemoryItem {
  id: string;
  kind: "personal" | "academica" | "proyectos" | "operativa" | "decisiones";
  content: string;
  source: string;
  confirmed: boolean;
  createdAt: string;
}

export function demoMemories(now: Date): MemoryItem[] {
  const d = (n: number) => iso(addLocalDays(now, -n, TZ));
  return [
    { id: "mem-1", kind: "personal", content: "Prefiere estudiar Matemáticas en el primer bloque de la tarde.", source: "Dicho por ti", confirmed: true, createdAt: d(20) },
    { id: "mem-2", kind: "personal", content: "Entreno de baloncesto martes y jueves de 18:30 a 20:00.", source: "Google Calendar", confirmed: true, createdAt: d(30) },
    { id: "mem-3", kind: "academica", content: "Derivadas es el tema con menor dominio de Matemáticas (45 %).", source: "Resultados de repasos", confirmed: true, createdAt: d(4) },
    { id: "mem-4", kind: "personal", content: "Parece que rindes mejor antes de las 19:00 (82 % de bloques completados frente a 61 %).", source: "Inferido por JARVIS", confirmed: false, createdAt: d(2) },
    { id: "mem-5", kind: "proyectos", content: "Objetivo Cambridge: examen oficial en junio de 2027, objetivo 185.", source: "Dicho por ti", confirmed: true, createdAt: d(25) },
    { id: "mem-6", kind: "decisiones", content: "Repaso de Inglés movido al viernes por el comentario de Lengua.", source: "Planner", confirmed: true, createdAt: d(1) },
  ];
}
