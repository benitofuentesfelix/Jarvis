import type { PlanChange, StudyBlock } from "./types";
import { MINUTE } from "./time";

function fmtTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Compares two plans and explains what moved, so the student can accept or correct it. */
export function diffPlans(before: StudyBlock[], after: StudyBlock[], tz: string): PlanChange[] {
  const prev = new Map(before.map((b) => [b.id, b]));
  const next = new Map(after.map((b) => [b.id, b]));
  const changes: PlanChange[] = [];

  for (const b of after) {
    const p = prev.get(b.id);
    if (!p) {
      changes.push({ type: "added", block: b, explanation: `Nuevo: ${b.title} (${fmtTime(b.start, tz)}). ${b.reason}.` });
    } else if (Math.abs(Date.parse(p.start) - Date.parse(b.start)) >= MINUTE) {
      changes.push({
        type: "moved",
        block: b,
        previous: p,
        explanation: `Movido: ${b.title} de ${fmtTime(p.start, tz)} a ${fmtTime(b.start, tz)}.`,
      });
    }
  }
  for (const p of before) {
    if (!next.has(p.id)) {
      changes.push({ type: "removed", block: p, explanation: `Quitado: ${p.title} (${fmtTime(p.start, tz)}), ya no hace falta o no cabe.` });
    }
  }
  return changes;
}
