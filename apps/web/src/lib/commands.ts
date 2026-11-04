// Local command engine: understands the most common Spanish instructions without
// any AI. When the Claude API is configured, /api/command interprets free text
// and returns the same kind of structured action, executed through the planner.

import { addLocalDays, atLocalTime, localDaysBetween, localParts, MINUTE, type PlanChange } from "@jarvis/core";
import { rotterdamRequirements, subjects, TZ } from "./demo";
import { fmtMinutes, hm, relDays, shortDay } from "./format";
import type { Store } from "./store";

export interface CommandResult {
  text: string;
  steps: string[];
  changes?: PlanChange[];
  mode: "local" | "claude";
}

export type CommandAction =
  | { type: "none" }
  | { type: "replan" }
  | { type: "add_item"; kind: "examen" | "tarea"; subjectId: string; due: string; title: string; effortMinutes: number };

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[¿?¡!.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const SUBJECT_KEYS: [RegExp, string][] = [
  [/\bmat(e|es|ematicas?)?\b|\bmates\b/, "mat"],
  [/fisica|quimica|\bfyq\b/, "fyq"],
  [/econom/, "eco"],
  [/lengua|literatura/, "len"],
  [/filosof/, "fil"],
  [/cambridge|\bc1\b/, "cambridge"],
  [/ingles/, "ing"],
];

export function detectSubject(t: string): string | undefined {
  for (const [re, id] of SUBJECT_KEYS) if (re.test(t)) return id;
  return undefined;
}

const WEEKDAYS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Returns the local day offset (0 = today) named in the text, if any. */
export function detectDay(t: string, now: Date): number | undefined {
  if (/pasado manana/.test(t)) return 2;
  if (/\bmanana\b/.test(t)) return 1;
  if (/\bhoy\b/.test(t)) return 0;
  const inN = t.match(/(?:en|dentro de) (\d{1,2}) dias?/);
  if (inN) return Number(inN[1]);
  const today = localParts(now, TZ);
  const dm = t.match(/\b(\d{1,2}) de ([a-z]+)/);
  if (dm) {
    const mi = MONTHS.indexOf(dm[2]!);
    if (mi >= 0) {
      let year = today.year;
      if (mi + 1 < today.month || (mi + 1 === today.month && Number(dm[1]) < today.day)) year++;
      const target = atLocalTime(new Date(Date.UTC(year, mi, Number(dm[1]), 12)), "12:00", TZ);
      return localDaysBetween(now, target, TZ);
    }
  }
  for (let i = 0; i < 7; i++) {
    if (new RegExp(`\\b${WEEKDAYS[i]}\\b`).test(t)) {
      let diff = (i - today.weekday + 7) % 7;
      if (diff === 0) diff = 7;
      if (/proxim|siguiente|que viene/.test(t) && diff < 7 && diff <= 2) diff += 7;
      return diff;
    }
  }
  const d = t.match(/\bel (\d{1,2})\b/);
  if (d) {
    const n = Number(d[1]);
    for (let i = 0; i < 40; i++) {
      const day = addLocalDays(now, i, TZ);
      if (localParts(day, TZ).day === n) return i;
    }
  }
  return undefined;
}

const name = (id: string) => subjects.find((s) => s.id === id)?.name ?? id;

export function summarizeChanges(changes: PlanChange[]): string {
  if (changes.length === 0) return "El plan no necesita cambios.";
  const added = changes.filter((c) => c.type === "added").length;
  const moved = changes.filter((c) => c.type === "moved").length;
  const removed = changes.filter((c) => c.type === "removed").length;
  const parts = [added && `${added} ${added === 1 ? "bloque nuevo" : "bloques nuevos"}`, moved && `${moved} ${moved === 1 ? "movido" : "movidos"}`, removed && `${removed} ${removed === 1 ? "quitado" : "quitados"}`].filter(Boolean);
  return `Impacto en tu agenda: ${parts.join(", ")}.`;
}

/** Executes a structured action through the store (and therefore the planner). */
export function executeAction(action: CommandAction, store: Store): PlanChange[] | undefined {
  if (action.type === "replan") return store.replan();
  if (action.type === "add_item") {
    return store.addItem({
      kind: action.kind,
      subjectId: action.subjectId,
      title: action.title,
      due: action.due,
      effortMinutes: action.effortMinutes,
      topicIds: store.data.topics.filter((t) => t.subjectId === action.subjectId).slice(0, 2).map((t) => t.id),
    });
  }
  return undefined;
}

export function runLocalCommand(raw: string, store: Store): CommandResult {
  const t = norm(raw);
  const { now, plan, data, briefing } = store;
  const steps: string[] = [];
  const subj = detectSubject(t);

  // 1. Capture: "tengo examen de física el jueves", "añade tarea de lengua para mañana"
  if (/(tengo|hay|anade|apunta|nuevo|nueva|pon)\b.*\b(examen|prueba|control|tarea|trabajo|entrega|deberes)/.test(t) || /^(examen|tarea|control)\b/.test(t)) {
    const kind = /examen|prueba|control/.test(t) ? "examen" : "tarea";
    steps.push("Interpretando la orden", "Detectando asignatura y fecha");
    if (!subj) return { mode: "local", steps, text: "¿De qué asignatura? Por ejemplo: «tengo examen de Física el jueves»." };
    const day = detectDay(t, now);
    if (day === undefined || day < 0)
      return { mode: "local", steps, text: `Entendido: ${kind} de ${name(subj)}. ¿Para qué día? Por ejemplo: «el jueves» o «el 18 de noviembre».` };
    const due = kind === "examen" ? atLocalTime(addLocalDays(now, day, TZ), "08:00", TZ) : atLocalTime(addLocalDays(now, day, TZ), "23:59", TZ);
    steps.push("Calculando prioridad", "Recalculando el plan", "Sincronizando con tu calendario JARVIS");
    const title = `${kind === "examen" ? "Examen" : "Tarea"} de ${name(subj)}`;
    const changes = executeAction(
      { type: "add_item", kind, subjectId: subj, due: due.toISOString(), title, effortMinutes: kind === "examen" ? 250 : 100 },
      store,
    )!;
    return {
      mode: "local",
      steps,
      changes,
      text: `Añadido: **${title}** ${relDays(day)} (${shortDay(due)}). ${summarizeChanges(changes)}${
        kind === "examen" ? " He repartido la preparación en varios días y termino con un simulacro." : ""
      }`,
    };
  }

  // 2. Replan
  if (/reorganiza|replanifica|reorganizar|rehaz|optimiza/.test(t)) {
    steps.push("Leyendo agenda y obligaciones", "Recalculando prioridades", "Colocando bloques", "Comprobando conflictos");
    const changes = store.replan();
    const week = plan.blocks.filter((b) => Date.parse(b.start) < now.getTime() + 7 * 86_400_000);
    const mins = week.reduce((a, b) => a + (Date.parse(b.end) - Date.parse(b.start)) / MINUTE, 0);
    return {
      mode: "local",
      steps,
      changes,
      text: `Semana reorganizada: ${week.length} bloques, ${fmtMinutes(mins)} de estudio. ${summarizeChanges(changes)}${
        plan.findings[0] ? ` Ojo: ${plan.findings[0].title.toLowerCase()}.` : ""
      }`,
    };
  }

  // 3. Cambridge status
  if (/cambridge|\bc1\b/.test(t) || (/ingles/.test(t) && /como voy|progreso|nivel/.test(t))) {
    steps.push("Consultando objetivo Cambridge", "Revisando sesiones de la semana");
    const g = store.goals.find((x) => x.area === "cambridge")!;
    const m = g.metrics[0]!;
    const week = plan.blocks.filter((b) => b.kind === "cambridge" && Date.parse(b.start) < now.getTime() + 7 * 86_400_000);
    const mins = week.reduce((a, b) => a + (Date.parse(b.end) - Date.parse(b.start)) / MINUTE, 0);
    return {
      mode: "local",
      steps,
      text: `Cambridge C1: estimación actual **${m.current}** en la escala (objetivo ${m.target}; Rotterdam pide 170). Has subido ${
        m.current - m.history[0]!.value
      } puntos en 6 meses. Esta semana tienes ${week.length} sesiones (${Math.round(mins)} de ${data.settings.cambridgeWeeklyMinutes} min). Siguiente: ${
        week[0] ? `${week[0].title.replace("Cambridge C1 · ", "")} el ${shortDay(week[0].start)} a las ${hm(week[0].start)}` : "sin sesiones, los exámenes ocupan los huecos"
      }.`,
    };
  }

  // 4. Rotterdam
  if (/rotterdam|erasmus|universidad|ibeb|\biba\b/.test(t)) {
    steps.push("Consultando requisitos verificados", "Comparando con tus datos");
    const pending = rotterdamRequirements.filter((r) => r.state !== "cumplido");
    return {
      mode: "local",
      steps,
      text: `Para Rotterdam vas bien en ${rotterdamRequirements.length - pending.length} de ${rotterdamRequirements.length} requisitos. Lo que más importa ahora: **mantener Matemáticas ≥ 8** (vas con 8,4) y **llegar a 170+ en cada destreza de Cambridge**. Pendientes: ${pending
        .map((p) => p.label)
        .join("; ")}.`,
    };
  }

  // 5. Exam plan
  if (/examen/.test(t) && /plan|prepara|preparar|como estudio/.test(t)) {
    steps.push("Buscando el examen", "Leyendo sesiones planificadas");
    const exam = data.items
      .filter((i) => i.kind === "examen" && !i.completed && Date.parse(i.due) > now.getTime() && (!subj || i.subjectId === subj))
      .sort((a, b) => Date.parse(a.due) - Date.parse(b.due))[0];
    if (!exam) return { mode: "local", steps, text: `No tengo ningún examen${subj ? ` de ${name(subj)}` : ""} registrado. Dime la fecha y lo preparo: «tengo examen de ${subj ? name(subj) : "Matemáticas"} el jueves».` };
    const blocks = plan.blocks.filter((b) => b.itemId === exam.id);
    const days = localDaysBetween(now, new Date(exam.due), TZ);
    return {
      mode: "local",
      steps,
      text: `Plan para **${exam.title}** (${relDays(days)}): ${blocks
        .map((b) => `${shortDay(b.start)} ${hm(b.start)} · ${b.title.split(" · ")[1]}`)
        .join(" → ")}. Cada sesión empieza con recuerdo activo sin apuntes y termina corrigiendo errores; el último bloque es un simulacro cronometrado.`,
    };
  }

  // 6. What's new
  if (/nueva|nuevas|nuevo|novedad|aparecido|ha llegado|evagd/.test(t)) {
    steps.push("Consultando EVAGD, Notion y correo");
    const recent = data.items.filter((i) => now.getTime() - Date.parse(i.createdAt) < 48 * 3_600_000).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    if (!recent.length) return { mode: "local", steps, text: "No ha aparecido nada nuevo en las últimas 48 horas." };
    return {
      mode: "local",
      steps,
      text: `En las últimas 48 h: ${recent
        .map((i) => `**${i.title}** (${name(i.subjectId)}, ${i.source.toUpperCase()}${i.kind !== "material" ? `, ${relDays(localDaysBetween(now, new Date(i.due), TZ))}` : ""})`)
        .join("; ")}. Todo está ya en tu plan.`,
    };
  }

  // 7. What now
  if (/que (toca|estudio|hago|tengo)|ahora|siguiente|hoy/.test(t)) {
    steps.push("Leyendo el plan de hoy");
    const b = briefing.current ?? briefing.next;
    return {
      mode: "local",
      steps,
      text: b
        ? `${briefing.current ? "Ahora mismo" : `A las ${hm(b.start)}`}: **${b.title}**. ${b.reason}. ${briefing.headline}`
        : briefing.headline,
    };
  }

  // 8. Week overview
  if (/semana/.test(t)) {
    steps.push("Resumiendo la semana");
    const week = plan.blocks.filter((b) => Date.parse(b.start) < now.getTime() + 7 * 86_400_000);
    const by = new Map<string, number>();
    for (const b of week) by.set(b.subjectId, (by.get(b.subjectId) ?? 0) + (Date.parse(b.end) - Date.parse(b.start)) / MINUTE);
    return {
      mode: "local",
      steps,
      text: `Esta semana: ${[...by.entries()].sort((a, b) => b[1] - a[1]).map(([s, m]) => `${name(s)} ${fmtMinutes(m)}`).join(", ")}.`,
    };
  }

  return {
    mode: "local",
    steps: ["Interpretando la orden"],
    text: "Puedo: reorganizar tu semana, decirte qué toca ahora, preparar un plan de examen, añadir exámenes o tareas («tengo examen de Física el jueves»), y darte tu estado en Cambridge o Rotterdam.",
  };
}
