"use client";

import { motion } from "motion/react";
import { Check, ChevronDown, CircleDashed, ExternalLink, Minus } from "lucide-react";
import { useState } from "react";
import { localDaysBetween } from "@jarvis/core";
import { rotterdamRequirements, type Requirement } from "@/lib/demo";
import { TZ, useStore } from "@/lib/store";
import { shortDate } from "@/lib/format";
import { Card, CountUp, Label, Pill, Ring, Sparkline } from "@/components/ui";
import { Skeleton } from "@/components/Skeleton";

const STATUS_LABEL: Record<string, string> = {
  activo: "activo",
  al_dia: "al día",
  en_riesgo: "en riesgo",
  completado: "completado",
  pausado: "en pausa",
};

const AREA_COLOR: Record<string, string> = {
  academico: "var(--color-c1)",
  cambridge: "var(--color-c6)",
  universidad: "var(--color-c8)",
  personal: "var(--color-c5)",
};

export default function GoalsPage() {
  const store = useStore();
  const [open, setOpen] = useState<string | null>("g-academico");
  if (!store) return <Skeleton />;
  const { goals, now } = store;

  return (
    <div className="space-y-7">
      <header>
        <h1 className="glow-text text-[32px] font-light leading-tight tracking-[-0.02em] sm:text-[38px]">Objetivos</h1>
        <p className="mt-1.5 text-[14px] text-muted">Objetivo → proyecto → hito → tarea. JARVIS convierte cada objetivo en acciones del día.</p>
      </header>

      <div className="space-y-4">
        {goals.map((g, i) => {
          const color = AREA_COLOR[g.area]!;
          const m = g.metrics[0];
          const pct = m ? Math.min(1, m.current / m.target) : 0;
          const daysLeft = localDaysBetween(now, new Date(g.targetDate), TZ);
          const isOpen = open === g.id;
          return (
            <Card key={g.id} delay={i * 0.04} className="!p-0 overflow-hidden">
              <button onClick={() => setOpen(isOpen ? null : g.id)} className="flex w-full items-center gap-4 p-5 text-left">
                <Ring value={pct} size={58} stroke={4.5} color={color}>
                  <span className="tabular font-mono text-[12px] text-ink">{Math.round(pct * 100)}%</span>
                </Ring>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[16.5px] font-semibold tracking-tight">{g.title}</h2>
                    <Pill tone={g.status === "al_dia" ? "good" : g.status === "en_riesgo" ? "bad" : "cyan"}>{STATUS_LABEL[g.status] ?? g.status}</Pill>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted">{g.description}</p>
                  <p className="mt-1.5 text-[11.5px] text-faint">
                    Fecha objetivo {shortDate(g.targetDate)} de {g.targetDate.slice(0, 4)} · faltan {Math.max(0, Math.round(daysLeft / 30))} meses
                  </p>
                </div>
                {m && (
                  <div className="hidden shrink-0 text-right sm:block">
                    <p className="text-[22px] font-semibold leading-none">
                      <CountUp value={m.current} decimals={m.current % 1 ? 2 : 0} />
                    </p>
                    <p className="mt-1 text-[11px] text-faint">objetivo {m.target.toLocaleString("es-ES")}</p>
                    <div className="mt-1.5">
                      <Sparkline values={m.history.map((h) => h.value)} color={color} width={86} height={24} />
                    </div>
                  </div>
                )}
                <motion.span animate={{ rotate: isOpen ? 180 : 0 }} className="shrink-0 text-faint">
                  <ChevronDown className="size-5" />
                </motion.span>
              </button>

              <motion.div initial={false} animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }} className="overflow-hidden">
                <div className="space-y-4 border-t hairline p-5">
                  {g.projects.map((p) => (
                    <div key={p.id}>
                      <div className="mb-2.5 flex items-center justify-between gap-3">
                        <h3 className="text-[14px] font-medium">{p.title}</h3>
                        <span className="text-[12px] text-faint">Siguiente: {p.nextAction}</span>
                      </div>
                      {p.milestones.length > 0 && (
                        <ol className="relative space-y-2.5 border-l hairline pl-4">
                          {p.milestones.map((ms) => (
                            <li key={ms.id} className="relative flex items-center gap-2.5">
                              <span className="absolute -left-[22px] grid size-4 place-items-center rounded-full border border-line bg-base">
                                {ms.done ? <Check className="size-2.5 text-good" /> : <span className="size-1.5 rounded-full" style={{ background: color }} />}
                              </span>
                              <span className={`flex-1 text-[13px] ${ms.done ? "text-faint line-through" : "text-muted"}`}>{ms.title}</span>
                              <span className="tabular shrink-0 font-mono text-[11px] text-faint">{shortDate(ms.dueDate)}</span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  ))}
                  {g.area === "universidad" && <RotterdamReqs />}
                  {g.area === "cambridge" && <CambridgeBreakdown />}
                </div>
              </motion.div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

const REQ_STYLE: Record<Requirement["state"], { icon: typeof Check; cls: string; label: string }> = {
  cumplido: { icon: Check, cls: "text-good", label: "cumplido" },
  en_camino: { icon: CircleDashed, cls: "text-cyan", label: "en camino" },
  pendiente: { icon: Minus, cls: "text-faint", label: "pendiente" },
  riesgo: { icon: Minus, cls: "text-bad", label: "en riesgo" },
};

function RotterdamReqs() {
  return (
    <div className="rounded-2xl border border-line bg-s2/40 p-4">
      <Label right={<span className="text-[10.5px] text-faint">verificado en fuentes oficiales · nov 2026</span>}>Requisitos de admisión</Label>
      <div className="space-y-2.5">
        {rotterdamRequirements.map((r) => {
          const s = REQ_STYLE[r.state];
          const Icon = s.icon;
          return (
            <div key={r.id} className="flex items-start gap-2.5">
              <Icon className={`mt-0.5 size-4 shrink-0 ${s.cls}`} />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] text-ink">{r.label}</p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{r.detail}</p>
              </div>
              <a href={r.source} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded p-1 text-faint transition-colors hover:text-cyan" title="Fuente oficial">
                <ExternalLink className="size-3.5" />
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const PAPERS = [
  { name: "Reading & Use of English", score: 168, target: 185 },
  { name: "Writing", score: 170, target: 185 },
  { name: "Listening", score: 178, target: 185 },
  { name: "Speaking", score: 174, target: 185 },
];

function CambridgeBreakdown() {
  return (
    <div className="rounded-2xl border border-line bg-s2/40 p-4">
      <Label right={<span className="text-[10.5px] text-faint">escala Cambridge · estimación de simulacros</span>}>Por destreza</Label>
      <div className="space-y-3">
        {PAPERS.map((p) => {
          const pct = (p.score - 150) / (210 - 150);
          const ok = p.score >= 170;
          return (
            <div key={p.name} className="flex items-center gap-3">
              <span className="w-44 shrink-0 truncate text-[13px] text-muted">{p.name}</span>
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-s3">
                <motion.div className="h-full rounded-full" style={{ background: ok ? "var(--color-good)" : "var(--color-amber)" }} initial={{ width: 0 }} animate={{ width: `${pct * 100}%` }} transition={{ duration: 0.8 }} />
                <span className="absolute inset-y-0 w-px bg-ink/40" style={{ left: `${((170 - 150) / 60) * 100}%` }} title="Mínimo de Erasmus: 170" />
              </div>
              <span className={`tabular w-9 shrink-0 text-right font-mono text-[12.5px] ${ok ? "text-good" : "text-amber"}`}>{p.score}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 border-t hairline pt-3 text-[12px] leading-relaxed text-faint">
        La línea marca el 170 que pide Erasmus en cada destreza (IBA). 180–199 = certificado C1; 200+ = grado A (nivel C2). Use of English es tu punto débil: JARVIS le da el doble de sesiones.
      </p>
    </div>
  );
}
