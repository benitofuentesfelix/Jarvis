"use client";

import { motion } from "motion/react";
import { localDayKey, MINUTE, paceFromOutcomes, retention, TECHNIQUES, type Technique } from "@jarvis/core";
import { subjectOf, TZ, useStore } from "@/lib/store";
import { subjects } from "@/lib/demo";
import { ago, fmtMinutes, shortDay, subjectColor } from "@/lib/format";
import { Card, CountUp, Label, Pill, Sparkline } from "@/components/ui";
import { Skeleton } from "@/components/Skeleton";
import { FindingRow } from "@/components/Finding";
import { Rich } from "@/components/CommandPalette";

const AGENTS = [
  { name: "Core", role: "Coordina, conversa y decide prioridades", model: "Sonnet 5.5", state: "en línea" },
  { name: "Planner", role: "Calcula el plan, elige el método de cada sesión y aprende tu ritmo (código con pruebas)", model: "sin IA", state: "en línea" },
  { name: "Classifier", role: "Clasifica cada novedad de EVAGD, Notion y correo", model: "Haiku 5.5", state: "esperando integraciones" },
  { name: "Strategist", role: "Revisión semanal y detección de patrones", model: "Opus 5.5", state: "domingo 18:00" },
  { name: "Researcher", role: "Vigila requisitos y fechas universitarias", model: "Sonnet 5.5", state: "semanal" },
  { name: "Coach", role: "Entrena Cambridge y corrige tus Writing", model: "Sonnet 5.5", state: "fase 7" },
];

export default function IntelligencePage() {
  const store = useStore();
  if (!store) return <Skeleton />;
  const { plan, data, now, todayBlocks } = store;

  // Last 14 days of study (from recorded feedback) for the activity chart.
  const history = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now.getTime() - (13 - i) * 86_400_000);
    const key = localDayKey(d, TZ);
    const mins = Object.entries(data.feedback)
      .filter(([, f]) => localDayKey(new Date(f.at), TZ) === key && f.outcome !== "no_hecho")
      .length * data.settings.sessionMinutes;
    return { key, date: d, mins };
  });
  const maxMins = Math.max(60, ...history.map((h) => h.mins));
  const doneCount = Object.values(data.feedback).filter((f) => f.outcome === "hecho").length;
  const total = Object.keys(data.feedback).length;
  const completion = total ? Math.round((doneCount / total) * 100) : 0;

  const mastery = subjects
    .filter((s) => s.id !== "cambridge")
    .map((s) => {
      const ts = data.topics.filter((t) => t.subjectId === s.id);
      return { s, value: ts.length ? ts.reduce((a, t) => a + t.mastery, 0) / ts.length : 0, topics: ts };
    })
    .filter((x) => x.topics.length)
    .sort((a, b) => a.value - b.value);

  return (
    <div className="space-y-7">
      <header>
        <h1 className="glow-text text-[32px] font-light leading-tight tracking-[-0.02em] sm:text-[38px]">Inteligencia</h1>
        <p className="mt-1.5 text-[14px] text-muted">Lo que JARVIS ha observado, decidido y recomendado.</p>
      </header>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <Card>
          <Label>Bloques cumplidos</Label>
          <p className="text-[32px] font-semibold leading-none">
            <CountUp value={completion} />
            <span className="text-[18px] text-faint">%</span>
          </p>
          <p className="mt-2 text-[12px] text-faint">{total ? `${doneCount} de ${total} sesiones registradas` : "Marca tus sesiones para que JARVIS aprenda"}</p>
        </Card>
        <Card>
          <Label>Hoy</Label>
          <p className="text-[32px] font-semibold leading-none tabular">{fmtMinutes(todayBlocks.reduce((a, b) => a + (Date.parse(b.end) - Date.parse(b.start)) / MINUTE, 0))}</p>
          <p className="mt-2 text-[12px] text-faint">{todayBlocks.length} {todayBlocks.length === 1 ? "bloque planificado" : "bloques planificados"}</p>
        </Card>
        <Card>
          <Label>Alertas abiertas</Label>
          <p className="text-[32px] font-semibold leading-none">
            <CountUp value={plan.findings.length} />
          </p>
          <p className="mt-2 text-[12px] text-faint">{plan.findings.filter((f) => f.severity === 3).length} de prioridad alta</p>
        </Card>
      </div>

      <Methods />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <Label right={<span className="text-[10.5px] text-faint">últimos 14 días</span>}>Estudio registrado</Label>
          <div className="relative">
            <div className="flex h-28 items-end gap-1.5">
              {history.map((h) => (
                <div key={h.key} className="group flex flex-1 flex-col items-center gap-1.5">
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${(h.mins / maxMins) * 92}px` }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    className="w-full rounded-t-[3px]"
                    style={{ background: h.mins ? "var(--color-cyan)" : "var(--color-s3)", opacity: h.mins ? 0.75 : 1, minHeight: 3 }}
                    title={`${shortDay(h.date)}: ${fmtMinutes(h.mins)}`}
                  />
                  <span className="text-[9px] text-faint">{shortDay(h.date).slice(0, 1).toUpperCase()}</span>
                </div>
              ))}
            </div>
            {history.every((h) => h.mins === 0) && (
              <div className="absolute inset-0 grid place-items-center pb-5">
                <p className="rounded-full border border-line bg-s2/90 px-3 py-1.5 text-[12px] text-faint">Aún sin sesiones registradas</p>
              </div>
            )}
          </div>
          <p className="mt-3 border-t hairline pt-3 text-[12px] text-faint">
            Se llena a medida que marcas cómo van tus sesiones. Con esos datos JARVIS ajusta cuánto tiempo necesitas de verdad por asignatura.
          </p>
        </Card>

        <Card>
          <Label>Dominio por asignatura</Label>
          <div className="space-y-3">
            {mastery.map(({ s, value, topics }) => (
              <div key={s.id}>
                <div className="mb-1 flex items-center justify-between text-[12.5px]">
                  <span className="text-muted">{s.name}</span>
                  <span className={`tabular font-mono ${value < 0.5 ? "text-amber" : "text-muted"}`}>{Math.round(value * 100)} %</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-s3">
                  <motion.div className="h-full rounded-full" style={{ background: subjectColor(s.color) }} initial={{ width: 0 }} animate={{ width: `${value * 100}%` }} transition={{ duration: 0.8 }} />
                </div>
                {(() => {
                  const weakest = topics.slice().sort((a, b) => a.mastery - b.mastery)[0]!;
                  return weakest.mastery < 0.75 ? (
                    <p className="mt-1 text-[11px] text-faint">
                      Más flojo: {weakest.name} ({Math.round(weakest.mastery * 100)} %)
                    </p>
                  ) : (
                    <p className="mt-1 text-[11px] text-faint">Al día en todos los temas</p>
                  );
                })()}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {plan.findings.length > 0 && (
        <Card>
          <Label>Alertas y recomendaciones</Label>
          <div>
            {plan.findings.map((f) => (
              <FindingRow key={f.id} f={f} onDismiss={() => store.dismissFinding(f.id)} />
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1fr]">
        <Card>
          <Label>Agentes</Label>
          <div className="space-y-3">
            {AGENTS.map((a) => (
              <div key={a.name} className="flex items-start gap-3">
                <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${a.state === "en línea" ? "bg-good" : "bg-faint"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] text-ink">
                    {a.name} <span className="font-mono text-[10.5px] text-faint">· {a.model}</span>
                  </p>
                  <p className="text-[12px] leading-relaxed text-muted">{a.role}</p>
                </div>
                <Pill tone={a.state === "en línea" ? "good" : "neutral"}>{a.state}</Pill>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <Label>Registro de decisiones</Label>
          <div className="max-h-[320px] space-y-2.5 overflow-y-auto pr-1">
            {data.activity.map((a) => (
              <div key={a.id} className="flex items-start gap-2.5 text-[12.5px]">
                <span className="mt-[3px] w-[64px] shrink-0 font-mono text-[10px] uppercase tracking-wider text-cyan">{a.agent}</span>
                <span className="min-w-0 flex-1 leading-relaxed text-muted">
                  <Rich text={a.text} />
                </span>
                <span className="shrink-0 font-mono text-[10px] text-faint">{ago(a.at, now)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Methods() {
  const store = useStore()!;
  const { plan, now, data } = store;
  const week = plan.blocks.filter((b) => Date.parse(b.start) < now.getTime() + 7 * 86_400_000);
  const total = week.reduce((a, b) => a + (Date.parse(b.end) - Date.parse(b.start)) / MINUTE, 0) || 1;
  const byTech = new Map<Technique, number>();
  for (const b of week) byTech.set(b.technique, (byTech.get(b.technique) ?? 0) + (Date.parse(b.end) - Date.parse(b.start)) / MINUTE);
  const mix = [...byTech.entries()].sort((a, b) => b[1] - a[1]);
  const pace = paceFromOutcomes(Object.values(data.feedback).flatMap((f) => (f.subjectId ? [{ subjectId: f.subjectId, outcome: f.outcome, at: f.at }] : [])));
  const fading = data.topics
    .map((t) => ({ t, r: retention(t, now) }))
    .sort((a, b) => a.r - b.r)
    .slice(0, 5);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <Card>
        <Label right={<span className="text-[10.5px] text-faint">próximos 7 días</span>}>Métodos en tu plan</Label>
        <div className="space-y-2.5">
          {mix.map(([t, min]) => (
            <div key={t}>
              <div className="mb-1 flex items-center justify-between text-[12.5px]">
                <span className="text-muted">{TECHNIQUES[t].label.charAt(0).toUpperCase() + TECHNIQUES[t].label.slice(1)}</span>
                <span className="tabular font-mono text-[11px] text-faint">{fmtMinutes(min)}</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
                <motion.div className="h-full rounded-full bg-gradient-to-r from-cyan to-indigo" initial={{ width: 0 }} animate={{ width: `${(min / total) * 100}%` }} transition={{ duration: 0.8 }} />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 border-t hairline pt-3 text-[12px] leading-relaxed text-faint">
          Nada de releer apuntes: cada sesión usa una técnica con evidencia y cambia según lo que domines y lo cerca que esté el examen.
        </p>
      </Card>

      <Card>
        <Label>Lo que empiezas a olvidar</Label>
        <div className="space-y-3">
          {fading.map(({ t, r }) => (
            <div key={t.id} className="flex items-center gap-3">
              <span className="size-1.5 shrink-0 rounded-full" style={{ background: subjectColor(subjectOf(t.subjectId)?.color ?? "c1") }} />
              <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{t.name}</span>
              <span className={`tabular font-mono text-[12px] ${r < 0.85 ? "text-amber" : "text-faint"}`}>{Math.round(r * 100)} %</span>
            </div>
          ))}
        </div>
        <p className="mt-4 border-t hairline pt-3 text-[12px] leading-relaxed text-faint">
          Retención estimada hoy. Cuando un tema baja del 90 %, JARVIS le pone un repaso corto en tu plan.
        </p>
      </Card>

      <Card>
        <Label>Tu ritmo real</Label>
        {Object.keys(pace).length === 0 ? (
          <p className="text-[13px] leading-relaxed text-muted">
            Aún no hay datos. Cada vez que termines una sesión y digas cómo fue, JARVIS aprende cuánto tardas de verdad en cada asignatura y ajusta el plan solo.
          </p>
        ) : (
          <div className="space-y-3">
            {Object.entries(pace).map(([id, p]) => (
              <div key={id} className="flex items-center gap-3">
                <span className="size-1.5 shrink-0 rounded-full" style={{ background: subjectColor(subjectOf(id)?.color ?? "c1") }} />
                <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{subjectOf(id)?.name ?? id}</span>
                <span className={`tabular font-mono text-[12px] ${p >= 1.15 ? "text-amber" : "text-faint"}`}>
                  {p >= 1 ? "+" : "−"}
                  {Math.abs(Math.round((p - 1) * 100))} %
                </span>
              </div>
            ))}
            <p className="border-t hairline pt-3 text-[12px] leading-relaxed text-faint">Tiempo extra (o de menos) que JARVIS ya está aplicando al estimar tus tareas y exámenes.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
