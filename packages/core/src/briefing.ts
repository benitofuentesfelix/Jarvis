import type { AcademicItem, Plan, StudyBlock, Subject } from "./types";
import { addLocalDays, localDaysBetween, MINUTE } from "./time";

export interface Briefing {
  headline: string;
  todayMinutes: number;
  todayBlocks: StudyBlock[];
  current?: StudyBlock;
  next?: StudyBlock;
  upcoming: { item: AcademicItem; daysLeft: number }[];
  recommendation?: string;
}

function hm(iso: string, tz: string) {
  return new Intl.DateTimeFormat("es-ES", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** Deterministic daily briefing. When the Claude API is configured, the text can be polished by the Core agent. */
export function buildBriefing(args: {
  now: Date;
  tz: string;
  plan: Plan;
  items: AcademicItem[];
  subjects: Subject[];
}): Briefing {
  const { now, tz, plan, items, subjects } = args;
  const t = now.getTime();
  const endOfToday = addLocalDays(now, 1, tz).getTime();
  const todayBlocks = plan.blocks.filter((b) => Date.parse(b.end) > t && Date.parse(b.start) < endOfToday);
  const todayMinutes = todayBlocks.reduce((a, b) => a + (Date.parse(b.end) - Date.parse(b.start)) / MINUTE, 0);
  const current = plan.blocks.find((b) => Date.parse(b.start) <= t && Date.parse(b.end) > t);
  const next = plan.blocks.find((b) => Date.parse(b.start) > t);

  const upcoming = items
    .filter((i) => !i.completed && (i.kind === "examen" || i.kind === "tarea") && Date.parse(i.due) > t)
    .map((item) => ({ item, daysLeft: localDaysBetween(now, new Date(item.due), tz) }))
    .filter((u) => u.daysLeft <= 14)
    .sort((a, b) => Date.parse(a.item.due) - Date.parse(b.item.due));

  const exams7 = upcoming.filter((u) => u.item.kind === "examen" && u.daysLeft <= 7);
  const name = (id: string) => subjects.find((s) => s.id === id)?.name ?? id;

  let headline: string;
  if (current) headline = `Ahora: ${current.title}. Termina a las ${hm(current.end, tz)}.`;
  else if (todayBlocks.length === 0) headline = "Hoy no tienes bloques de estudio pendientes. Descansa o adelanta Cambridge.";
  else
    headline = `Hoy: ${todayBlocks.length} ${todayBlocks.length === 1 ? "bloque" : "bloques"} (${Math.round(
      todayMinutes,
    )} min). Empiezas a las ${hm(todayBlocks[0]!.start, tz)} con ${todayBlocks[0]!.title.split(" · ")[0]}.`;

  if (exams7.length >= 2) headline += ` Semana exigente: ${exams7.length} exámenes en 7 días.`;

  const top = plan.findings[0];
  const recommendation =
    top?.detail ??
    (exams7[0]
      ? `Prioridad: ${name(exams7[0].item.subjectId)}, examen en ${exams7[0].daysLeft} días.`
      : undefined);

  return { headline, todayMinutes, todayBlocks, current, next, upcoming, recommendation };
}
