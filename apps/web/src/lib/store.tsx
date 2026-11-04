"use client";

import {
  buildPlan,
  buildBriefing,
  diffPlans,
  localDayKey,
  reviewTopic,
  paceFromOutcomes,
  mergeSynced,
  MINUTE,
  type Outcome,
  type AcademicItem,
  type BusyEvent,
  type Plan,
  type PlanChange,
  type PlannerSettings,
  type StudyBlock,
  type Topic,
} from "@jarvis/core";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  TZ,
  defaultSettings,
  demoBusy,
  demoGoals,
  demoItems,
  demoMemories,
  demoTopics,
  subjects,
  type MemoryItem,
} from "./demo";
import { useCloudSync, type SyncState } from "./sync";
import { applyEvagd, newId, planFor, type EvagdResult } from "./engine";

export type { Outcome };

export interface Activity {
  id: string;
  at: string;
  agent: "Planner" | "Core" | "Classifier" | "Strategist" | "Researcher" | "Coach" | "Tú";
  text: string;
}

export interface Feedback {
  outcome: Outcome;
  at: string;
  subjectId?: string;
  /** 1..5 recall quality, for sessions tied to a topic. */
  quality?: number;
}

export interface Persisted {
  v: 2;
  items: AcademicItem[];
  topics: Topic[];
  memories: MemoryItem[];
  settings: PlannerSettings;
  feedback: Record<string, Feedback>;
  skips: BusyEvent[];
  activity: Activity[];
  dismissed: string[];
  day: { key: string; blocks: StudyBlock[] };
  readOnly: boolean;
  quiet: { start: string; end: string };
  dailyNotifications: number;
  /** Real connections. Absent = example data. */
  live?: { evagd?: { syncedAt: string; count: number; error?: string } };
}

const KEY = "jarvis.v2";

function seed(now: Date): Persisted {
  const ago = (m: number) => new Date(now.getTime() - m * MINUTE).toISOString();
  return {
    v: 2,
    items: demoItems(now),
    topics: demoTopics(now),
    memories: demoMemories(now),
    settings: defaultSettings,
    feedback: {},
    skips: [],
    activity: [
      { id: "a1", at: ago(185), agent: "Classifier", text: "Nueva tarea en EVAGD: «Comentario de texto: Bécquer» · Lengua · entrega en 2 días" },
      { id: "a2", at: ago(184), agent: "Planner", text: "Plan recalculado: 2 bloques añadidos, repaso de Economía movido al viernes" },
      { id: "a3", at: ago(300), agent: "Classifier", text: "Material nuevo en EVAGD: apuntes del tema 4 de Matemáticas (vinculado a Derivadas)" },
      { id: "a4", at: ago(1260), agent: "Strategist", text: "Revisión semanal: Matemáticas sube a 8,4; Cambridge estimado 172 (+2)" },
      { id: "a5", at: ago(2880), agent: "Researcher", text: "Sin cambios en las páginas de admisión de Erasmus (comprobado)" },
    ],
    dismissed: [],
    day: { key: "", blocks: [] },
    readOnly: false,
    quiet: { start: "22:30", end: "07:30" },
    dailyNotifications: 3,
  };
}

function load(now: Date): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Persisted;
      if (p.v === 2) return p;
    }
  } catch {
    /* private mode or corrupted: start fresh */
  }
  return seed(now);
}

function useNow(tickMs = 30_000) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), tickMs);
    return () => clearInterval(t);
  }, [tickMs]);
  return now;
}

export interface Store {
  ready: boolean;
  now: Date;
  tz: string;
  data: Persisted;
  plan: Plan;
  todayBlocks: StudyBlock[];
  briefing: ReturnType<typeof buildBriefing>;
  goals: ReturnType<typeof demoGoals>;
  lastChanges: PlanChange[];
  working: string | null;
  /** True once a real account (EVAGD for now) is feeding the plan. */
  live: boolean;
  busyFor: (days: number) => BusyEvent[];
  /** Where the state lives: this device only, or mirrored to the cloud. */
  sync: SyncState;
  addItem: (item: Omit<AcademicItem, "id" | "createdAt" | "doneMinutes" | "completed" | "source"> & { source?: AcademicItem["source"] }) => PlanChange[];
  completeItem: (id: string) => void;
  recordOutcome: (block: StudyBlock, outcome: Outcome, quality?: number) => void;
  skipBlock: (block: StudyBlock) => PlanChange[];
  replan: () => PlanChange[];
  dismissFinding: (id: string) => void;
  clearChanges: () => void;
  updateSettings: (p: Partial<PlannerSettings>) => void;
  setMemory: (m: MemoryItem) => void;
  deleteMemory: (id: string) => void;
  setReadOnly: (v: boolean) => void;
  setQuiet: (q: { start: string; end: string }) => void;
  log: (agent: Activity["agent"], text: string) => void;
  setWorking: (s: string | null) => void;
  reset: () => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const now = useNow();
  const [data, setData] = useState<Persisted | null>(null);
  const [lastChanges, setLastChanges] = useState<PlanChange[]>([]);
  const [working, setWorking] = useState<string | null>(null);
  const sync = useCloudSync(data, setData);

  useEffect(() => {
    if (now && !data) setData(load(now));
  }, [now, data]);

  useEffect(() => {
    if (!data) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* storage unavailable: keep working in memory */
    }
  }, [data]);

  const minuteKey = now ? Math.floor(now.getTime() / MINUTE) : 0;

  const computePlan = useCallback((d: Persisted, at: Date) => planFor(d, at), []);

  const plan = useMemo(() => {
    if (!data || !now) return null;
    return computePlan(data, now);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.items, data?.topics, data?.settings, data?.skips, data?.feedback, minuteKey, computePlan]);

  // Keep today's blocks (including ones already past) so the day view and feedback survive replanning.
  const todayKey = now ? localDayKey(now, TZ) : "";
  const todayBlocks = useMemo(() => {
    if (!plan || !now || !data) return [];
    const t = now.getTime();
    const fromPlan = plan.blocks.filter((b) => localDayKey(new Date(b.start), TZ) === todayKey);
    const kept = data.day.key === todayKey ? data.day.blocks.filter((b) => Date.parse(b.start) < t || data.feedback[fbKey(b)]) : [];
    const ids = new Set(fromPlan.map((b) => b.id));
    return [...kept.filter((b) => !ids.has(b.id)), ...fromPlan].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  }, [plan, now, data, todayKey]);

  const todaySig = todayBlocks.map((b) => b.id + b.start).join("|");
  useEffect(() => {
    if (!data || !todayKey) return;
    setData((d) => (d ? { ...d, day: { key: todayKey, blocks: todayBlocks } } : d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todaySig, todayKey]);

  const prevPlan = useRef<Plan | null>(null);
  useEffect(() => {
    if (plan) prevPlan.current = plan;
  }, [plan]);

  const log = useCallback((agent: Activity["agent"], text: string) => {
    setData((d) =>
      d ? { ...d, activity: [{ id: newId("act"), at: new Date().toISOString(), agent, text }, ...d.activity].slice(0, 60) } : d,
    );
  }, []);

  /** Apply a mutation, recompute the plan and explain what changed. */
  const mutate = useCallback(
    (fn: (d: Persisted) => Persisted, label?: { agent: Activity["agent"]; text: string }): PlanChange[] => {
      if (!data || !now || !plan) return [];
      const next = fn(data);
      const after = computePlan(next, now);
      const changes = diffPlans(plan.blocks, after.blocks, TZ);
      const summary =
        changes.length === 0
          ? "sin cambios en el plan"
          : `${changes.filter((c) => c.type === "added").length} añadidos, ${changes.filter((c) => c.type === "moved").length} movidos, ${
              changes.filter((c) => c.type === "removed").length
            } quitados`;
      const activity: Activity[] = [];
      if (label) activity.push({ id: newId("act"), at: now.toISOString(), agent: label.agent, text: label.text });
      activity.push({ id: newId("act"), at: now.toISOString(), agent: "Planner", text: `Plan recalculado: ${summary}` });
      setData({ ...next, activity: [...activity.reverse(), ...next.activity].slice(0, 60) });
      setLastChanges(changes);
      return changes;
    },
    [data, now, plan, computePlan],
  );

  // EVAGD sync: on load and every 30 minutes. The server holds the private feed URL.
  const loaded = !!data;
  useEffect(() => {
    if (!loaded) return;
    let stop = false;
    const run = async () => {
      try {
        const res = await fetch("/api/evagd", { cache: "no-store" });
        const body = (await res.json()) as EvagdResult;
        if (stop || !body.configured) return;
        setData((d) => (d ? applyEvagd(d, body) : d));
      } catch {
        /* offline: try again next round */
      }
    };
    void run();
    const t = setInterval(run, 30 * 60_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [loaded]);

  const store = useMemo<Store | null>(() => {
    if (!data || !now || !plan) return null;
    const briefing = buildBriefing({ now, tz: TZ, plan: { ...plan, blocks: plan.blocks }, items: data.items, subjects });
    return {
      ready: true,
      now,
      tz: TZ,
      data,
      plan: { ...plan, findings: plan.findings.filter((f) => !data.dismissed.includes(f.id)) },
      todayBlocks,
      briefing,
      goals: demoGoals(now),
      lastChanges,
      working,
      live: !!data.live,
      busyFor: (days) => [...demoBusy(now, days, !!data.live), ...data.skips],
      sync,
      setWorking,
      log,
      addItem: (item) =>
        mutate(
          (d) => ({
            ...d,
            items: [
              ...d.items,
              {
                ...item,
                id: newId(item.kind === "examen" ? "ex" : "ta"),
                source: item.source ?? "manual",
                createdAt: now.toISOString(),
                doneMinutes: 0,
                completed: false,
              },
            ],
          }),
          { agent: "Classifier", text: `Nuevo ${item.kind === "examen" ? "examen" : "elemento"}: «${item.title}»` },
        ),
      completeItem: (id) =>
        void mutate(
          (d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, completed: true } : i)) }),
          { agent: "Tú", text: `Marcado como completado: «${data.items.find((i) => i.id === id)?.title ?? id}»` },
        ),
      recordOutcome: (block, outcome, quality) => {
        const minutes = (Date.parse(block.end) - Date.parse(block.start)) / MINUTE;
        const credit = outcome === "hecho" ? minutes : outcome === "parcial" ? Math.round(minutes / 2) : 0;
        mutate(
          (d) => ({
            ...d,
            feedback: { ...d.feedback, [fbKey(block)]: { outcome, at: now.toISOString(), subjectId: block.subjectId, quality } },
            // Done ahead of time: that slot is now free time, not a slot to refill with the same work.
            skips:
              now.getTime() < Date.parse(block.start)
                ? [...d.skips, { id: newId("early"), title: "Sesión adelantada", start: block.start, end: block.end, origin: "personal" as const }]
                : d.skips,
            items: block.itemId
              ? d.items.map((i) => (i.id === block.itemId ? { ...i, doneMinutes: i.doneMinutes + credit } : i))
              : d.items,
            topics:
              block.topicId && quality !== undefined
                ? d.topics.map((t) => (t.id === block.topicId ? reviewTopic(t, quality, now) : t))
                : d.topics,
          }),
          {
            agent: "Tú",
            text: `${block.title}: ${outcome === "hecho" ? "hecho" : outcome === "parcial" ? "parcial" : "no hecho"}${
              outcome !== "hecho" && block.itemId ? " · reprogramo lo que falta" : ""
            }`,
          },
        );
      },
      skipBlock: (block) =>
        mutate(
          (d) => ({
            ...d,
            skips: [...d.skips, { id: newId("skip"), title: "Hueco bloqueado por ti", start: block.start, end: block.end, origin: "personal" }],
          }),
          { agent: "Tú", text: `No me viene bien: «${block.title}». Busco otro hueco.` },
        ),
      replan: () => mutate((d) => ({ ...d, skips: d.skips.filter((s) => Date.parse(s.end) > now.getTime()) }), { agent: "Core", text: "Reorganizar la semana" }),
      dismissFinding: (id) => setData((d) => (d ? { ...d, dismissed: [...d.dismissed, id] } : d)),
      clearChanges: () => setLastChanges([]),
      updateSettings: (p) =>
        void mutate((d) => ({ ...d, settings: { ...d.settings, ...p } }), { agent: "Tú", text: "Ajustes de planificación actualizados" }),
      setMemory: (m) =>
        setData((d) => {
          if (!d) return d;
          const exists = d.memories.some((x) => x.id === m.id);
          return { ...d, memories: exists ? d.memories.map((x) => (x.id === m.id ? m : x)) : [m, ...d.memories] };
        }),
      deleteMemory: (id) => setData((d) => (d ? { ...d, memories: d.memories.filter((m) => m.id !== id) } : d)),
      setReadOnly: (v) => setData((d) => (d ? { ...d, readOnly: v } : d)),
      setQuiet: (q) => setData((d) => (d ? { ...d, quiet: q } : d)),
      reset: () => {
        try {
          localStorage.removeItem(KEY);
        } catch {
          /* ignore */
        }
        setData(seed(now));
        setLastChanges([]);
      },
    };
  }, [data, now, plan, todayBlocks, lastChanges, working, mutate, log, sync]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store | null {
  return useContext(Ctx);
}

export { subjects, TZ };

/** Feedback is tied to a block at its time: a regenerated block in another slot is a new session. */
export function fbKey(b: Pick<StudyBlock, "id" | "start">) {
  return `${b.id}@${b.start}`;
}

export function subjectOf(id: string) {
  return subjects.find((s) => s.id === id);
}
