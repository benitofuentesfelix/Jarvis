"use client";

import { motion } from "motion/react";
import { CalendarPlus, Play, RefreshCw, X } from "lucide-react";
import { useMemo, useState } from "react";
import { addLocalDays, atLocalTime, localDayKey, localParts, MINUTE, TECHNIQUES, type StudyBlock } from "@jarvis/core";
import { subjectOf, TZ, useStore } from "@/lib/store";
import { subjects } from "@/lib/demo";
import { fmtMinutes, hm, shortDay, subjectColor } from "@/lib/format";
import { Button, Card, Dot, Label, Pill } from "@/components/ui";
import { Skeleton } from "@/components/Skeleton";
import { AddItemDialog } from "@/components/AddItemDialog";
import { useFocus } from "@/components/Focus";

const DAY_START = 7.5; // 07:30
const DAY_END = 22; // 22:00
const PX_PER_HOUR = 54;

export default function PlanPage() {
  const store = useStore();
  const [adding, setAdding] = useState(false);
  const [days, setDays] = useState(7);
  const [sel, setSel] = useState<StudyBlock | null>(null);
  const focus = useFocus();

  const grid = useMemo(() => {
    if (!store) return [];
    const { now, plan } = store;
    const busy = store.busyFor(days + 1);
    return Array.from({ length: days }, (_, i) => {
      const date = addLocalDays(now, i, TZ);
      const key = localDayKey(date, TZ);
      const inDay = (iso: string) => localDayKey(new Date(iso), TZ) === key;
      return {
        date,
        key,
        blocks: plan.blocks.filter((b) => inDay(b.start)),
        busy: busy.filter((b) => inDay(b.start)),
      };
    });
  }, [store, days]);

  if (!store) return <Skeleton />;
  const { now, plan } = store;
  const weekMinutes = plan.blocks.filter((b) => Date.parse(b.start) < now.getTime() + days * 86_400_000).reduce((a, b) => a + (Date.parse(b.end) - Date.parse(b.start)) / MINUTE, 0);

  const top = (iso: string) => ((Date.parse(iso) - atLocalTime(new Date(iso), `${String(Math.floor(DAY_START)).padStart(2, "0")}:${DAY_START % 1 ? "30" : "00"}`, TZ).getTime()) / 3_600_000) * PX_PER_HOUR;
  const height = (a: string, b: string) => Math.max(18, ((Date.parse(b) - Date.parse(a)) / 3_600_000) * PX_PER_HOUR);

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="glow-text text-[32px] font-light leading-tight tracking-[-0.02em] sm:text-[38px]">Plan</h1>
          <p className="mt-1.5 text-[14px] text-muted">
            {fmtMinutes(weekMinutes)} de estudio en {days} días · los bloques grises son tuyos y JARVIS no los toca
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-line p-0.5">
            {[7, 14].map((d) => (
              <button key={d} onClick={() => setDays(d)} className={`rounded-[9px] px-2.5 py-1.5 text-[12.5px] transition-colors ${days === d ? "bg-s2 text-ink" : "text-faint hover:text-muted"}`}>
                {d} días
              </button>
            ))}
          </div>
          <Button onClick={() => store.replan()}>
            <RefreshCw className="size-4" /> Reorganizar
          </Button>
          <Button variant="primary" onClick={() => setAdding(true)}>
            <CalendarPlus className="size-4" /> Añadir
          </Button>
        </div>
      </header>

      <Card className="!p-0">
        <div className="overflow-x-auto scrollbar-none">
          <div className="min-w-[760px]">
            <div className="grid" style={{ gridTemplateColumns: `52px repeat(${days}, minmax(96px, 1fr))` }}>
              <div className="border-b border-r hairline" />
              {grid.map(({ date, key }) => {
                const p = localParts(date, TZ);
                const isToday = key === localDayKey(now, TZ);
                return (
                  <div key={key} className={`border-b hairline px-2 py-2.5 text-center ${isToday ? "bg-cyan/[0.05]" : ""}`}>
                    <p className={`text-[11px] uppercase tracking-wider ${isToday ? "text-cyan" : "text-faint"}`}>{shortDay(date).split(" ")[0]}</p>
                    <p className={`tabular font-mono text-[15px] ${isToday ? "text-ink" : "text-muted"}`}>{p.day}</p>
                  </div>
                );
              })}
            </div>
            <div className="relative grid" style={{ gridTemplateColumns: `52px repeat(${days}, minmax(96px, 1fr))`, height: (DAY_END - DAY_START) * PX_PER_HOUR + 10 }}>
              <div className="relative border-r hairline">
                {Array.from({ length: Math.ceil(DAY_END - DAY_START) }, (_, i) => (
                  <div key={i} className="absolute right-2 -translate-y-1/2 tabular font-mono text-[10px] text-faint" style={{ top: (i + (1 - (DAY_START % 1))) * PX_PER_HOUR }}>
                    {String(Math.ceil(DAY_START) + i).padStart(2, "0")}:00
                  </div>
                ))}
              </div>
              {grid.map(({ date, key, blocks, busy }) => (
                <div key={key} className="relative border-r hairline last:border-r-0">
                  {Array.from({ length: Math.ceil(DAY_END - DAY_START) }, (_, i) => (
                    <div key={i} className="absolute inset-x-0 border-t border-line/40" style={{ top: (i + (1 - (DAY_START % 1))) * PX_PER_HOUR }} />
                  ))}
                  {store.data.settings.peak && (
                    <div
                      className="absolute inset-x-0 border-y border-cyan/10 bg-cyan/[0.03]"
                      style={{
                        top: top(atLocalTime(date, store.data.settings.peak.start, TZ).toISOString()),
                        height: height(
                          atLocalTime(date, store.data.settings.peak.start, TZ).toISOString(),
                          atLocalTime(date, store.data.settings.peak.end, TZ).toISOString(),
                        ),
                      }}
                    />
                  )}
                  {busy.map((e) => (
                    <div key={e.id} className="hatch absolute inset-x-1 rounded-md border border-line/70" style={{ top: top(e.start), height: height(e.start, e.end) }} title={`${e.title} · tuyo, JARVIS no lo toca`}>
                      <p className="truncate px-1.5 pt-0.5 text-[10px] text-faint">{e.title}</p>
                    </div>
                  ))}
                  {blocks.map((b) => {
                    const c = subjectColor(subjectOf(b.subjectId)?.color ?? "c1");
                    return (
                      <motion.div
                        key={b.id}
                        layout
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        onClick={() => setSel(b)}
                        title={`${b.title}\n${b.reason}`}
                        className={`absolute inset-x-1 cursor-pointer overflow-hidden rounded-md border px-1.5 py-[3px] transition-shadow hover:shadow-[0_0_14px_-2px_var(--glow)] ${sel?.id === b.id ? "ring-1 ring-white/60" : ""}`}
                        style={{ top: top(b.start), height: height(b.start, b.end), borderColor: c, background: `color-mix(in srgb, ${c} 14%, transparent)`, ["--glow" as string]: c }}
                      >
                        {height(b.start, b.end) < 34 ? (
                          <p className="truncate text-[10px] leading-tight text-ink">
                            <span className="tabular font-mono text-[9.5px]" style={{ color: c }}>
                              {hm(b.start)}
                            </span>{" "}
                            {b.title.split(" · ").slice(1).join(" · ")}
                          </p>
                        ) : (
                          <>
                            <p className="tabular font-mono text-[9.5px]" style={{ color: c }}>
                              {hm(b.start)}
                            </p>
                            <p className="truncate text-[10.5px] leading-tight text-ink">{b.title.split(" · ").slice(1).join(" · ")}</p>
                          </>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {sel && (
        <motion.section key={sel.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[12px] text-muted">
                <Dot color={subjectColor(subjectOf(sel.subjectId)?.color ?? "c1")} />
                {shortDay(sel.start)} · {hm(sel.start)}–{hm(sel.end)} · {TECHNIQUES[sel.technique].label}
              </p>
              <h2 className="mt-2 text-[20px] font-medium leading-snug tracking-tight text-ink">{sel.title}</h2>
              <p className="mt-1.5 max-w-[640px] text-[13px] leading-relaxed text-faint">{sel.reason}. {TECHNIQUES[sel.technique].why}</p>
            </div>
            <button onClick={() => setSel(null)} className="rounded-lg p-1.5 text-faint hover:text-ink" aria-label="Cerrar">
              <X className="size-4" />
            </button>
          </div>
          <ol className="mt-5 grid grid-cols-1 gap-x-6 gap-y-2 border-t hairline pt-4 sm:grid-cols-2">
            {sel.steps.map((st, i) => (
              <li key={i} className="flex gap-3 text-[13px]">
                <span className="tabular w-8 shrink-0 font-mono text-[11px] leading-5 text-faint">{st.minutes}′</span>
                <span className="text-muted">{st.label}</span>
              </li>
            ))}
          </ol>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => focus.start(sel)}>
              <Play className="size-3.5" fill="currentColor" /> Empezar ya
            </Button>
            <Button onClick={() => { store.skipBlock(sel); setSel(null); }}>Mover a otro hueco</Button>
          </div>
        </motion.section>
      )}

      <p className="-mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-faint">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-sm border border-cyan/20 bg-cyan/[0.06]" /> tus horas de máxima concentración: ahí van las sesiones exigentes</span>
        <span className="flex items-center gap-1.5"><span className="hatch inline-block h-2.5 w-4 rounded-sm border border-line" /> tus eventos, JARVIS no los toca</span>
        <span>Toca un bloque para ver el guion de la sesión</span>
      </p>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Card>
          <Label>Reparto por asignatura</Label>
          <div className="space-y-2.5">
            {subjects
              .map((s) => ({
                s,
                min: plan.blocks.filter((b) => b.subjectId === s.id && Date.parse(b.start) < now.getTime() + days * 86_400_000).reduce((a, b) => a + (Date.parse(b.end) - Date.parse(b.start)) / MINUTE, 0),
              }))
              .filter((x) => x.min > 0)
              .sort((a, b) => b.min - a.min)
              .map(({ s, min }) => (
                <div key={s.id} className="flex items-center gap-3">
                  <Dot color={subjectColor(s.color)} />
                  <span className="w-36 shrink-0 truncate text-[13px] text-muted">{s.name}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-s3">
                    <motion.div className="h-full rounded-full" style={{ background: subjectColor(s.color) }} initial={{ width: 0 }} animate={{ width: `${(min / weekMinutes) * 100}%` }} transition={{ duration: 0.8 }} />
                  </div>
                  <span className="tabular w-16 shrink-0 text-right font-mono text-[11.5px] text-faint">{fmtMinutes(min)}</span>
                </div>
              ))}
          </div>
        </Card>
        <Card>
          <Label right={<Pill tone={plan.unscheduled.length ? "bad" : "good"}>{plan.unscheduled.length ? "con conflictos" : "todo encaja"}</Pill>}>Conflictos</Label>
          {plan.unscheduled.length === 0 ? (
            <p className="text-[13px] text-muted">Todo tu trabajo cabe antes de sus fechas sin superar tu límite diario ({store.data.settings.dailyMaxWeekday} min entre semana).</p>
          ) : (
            <ul className="space-y-2 text-[13px] text-muted">
              {Object.entries(
                plan.unscheduled.reduce<Record<string, number>>((acc, u) => ({ ...acc, [u.itemId]: (acc[u.itemId] ?? 0) + u.minutes }), {}),
              ).map(([id, min]) => (
                <li key={id} className="flex items-start gap-2">
                  <span className="text-bad">•</span>
                  <span>
                    <strong className="text-ink">{store.data.items.find((i) => i.id === id)?.title ?? id}</strong>: faltan {fmtMinutes(min)} antes de la fecha.
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <AddItemDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
