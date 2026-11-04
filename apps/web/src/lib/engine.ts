// Logic shared by the browser and the server job, so both compute the same plan.

import { buildPlan, mergeSynced, paceFromOutcomes, type AcademicItem, type Plan } from "@jarvis/core";
import { demoBusy, demoItems, subjects } from "./demo";
import type { Activity, Persisted } from "./store";

export const DEMO_IDS = new Set(demoItems(new Date()).map((i) => i.id));

export function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function planFor(d: Persisted, at: Date): Plan {
  return buildPlan({
    now: at,
    subjects,
    topics: d.topics,
    items: d.items,
    busy: [...demoBusy(at, 14, !!d.live), ...d.skips],
    settings: d.settings,
    pace: paceFromOutcomes(
      Object.values(d.feedback).flatMap((f) => (f.subjectId ? [{ subjectId: f.subjectId, outcome: f.outcome, at: f.at }] : [])),
    ),
  });
}

export interface EvagdResult {
  configured: boolean;
  ok?: boolean;
  error?: string;
  syncedAt?: string;
  items?: AcademicItem[];
}

/** Merge an EVAGD read into the state. The first real sync removes the example data for good. */
export function applyEvagd(d: Persisted, body: EvagdResult): Persisted {
  if (!body.configured) return d;
  if (!body.ok || !body.items) {
    return { ...d, live: { ...d.live, evagd: { syncedAt: d.live?.evagd?.syncedAt ?? "", count: d.live?.evagd?.count ?? 0, error: body.error } } };
  }
  const first = !d.live;
  const base = first ? d.items.filter((i) => i.source === "manual" && !DEMO_IDS.has(i.id)) : d.items;
  const before = new Set(base.map((i) => i.id));
  const items = mergeSynced(base, body.items, "evagd");
  const fresh = items.filter((i) => !before.has(i.id) && i.kind !== "aviso");
  const at = body.syncedAt ?? new Date().toISOString();
  const notes: Activity[] = fresh.slice(0, 5).map((i) => ({
    id: newId("act"),
    at,
    agent: "Classifier",
    text: `${first ? "Importado" : "Nuevo"} de EVAGD: «${i.title}» · ${subjects.find((s) => s.id === i.subjectId)?.name ?? "sin asignatura"}`,
  }));
  if (first) notes.unshift({ id: newId("act"), at, agent: "Core", text: `Conectado a EVAGD: ${body.items.length} eventos leídos` });
  return {
    ...d,
    items,
    topics: first ? [] : d.topics,
    memories: first ? d.memories.filter((m) => !m.id.startsWith("mem-")) : d.memories,
    activity: first ? notes : [...notes, ...d.activity].slice(0, 60),
    live: { ...d.live, evagd: { syncedAt: at, count: body.items.length } },
  };
}
