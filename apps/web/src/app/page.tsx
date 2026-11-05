"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Check, ChevronDown, Play, SkipForward, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { TECHNIQUES, localDayKey, type StudyBlock } from "@jarvis/core";

import { fbKey, subjectOf, TZ, useStore, type Outcome } from "@/lib/store";
import { rotterdamRequirements } from "@/lib/demo";
import { fmtMinutes, greeting, hm, longDay, minutesBetween, relDays, shortDay, subjectColor } from "@/lib/format";
import { ChangeList } from "@/components/CommandPalette";
import { CountUp } from "@/components/ui";
import { Setup } from "@/components/Setup";
import { Skeleton } from "@/components/Skeleton";
import { useFocus } from "@/components/Focus";

const ease = [0.22, 1, 0.36, 1] as const;

export default function Today() {
  const store = useStore();
  if (!store) return <Skeleton />;
  const { now, plan, todayBlocks, briefing, data, lastChanges } = store;
  const t = now.getTime();
  const current = todayBlocks.find((b) => Date.parse(b.start) <= t && Date.parse(b.end) > t && !data.feedback[fbKey(b)]);
  const next = plan.blocks.find((b) => Date.parse(b.start) > t && !data.feedback[fbKey(b)]);
  const hero = current ?? next;
  const pending = todayBlocks.filter((b) => Date.parse(b.end) > t && !data.feedback[fbKey(b)]).length;

  return (
    <div className="space-y-8 sm:space-y-10">
      {/* Header */}
      <motion.header initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <p className="micro">{longDay(now)}</p>
          <p className="flex items-center gap-1.5 font-mono text-[10.5px] text-faint">
            <span className="size-1.5 rounded-full bg-cyan" style={{ animation: "pulse-dot 2.4s infinite" }} />
            {store.live
              ? `EVAGD conectado${store.data.live?.evagd?.error ? " · error al sincronizar" : ""}`
              : store.data.clean
                ? "EVAGD sin conectar"
                : "datos de ejemplo · sin cuentas conectadas"}
          </p>
        </div>
        <h1 className="glow-text mt-2 text-[30px] font-light leading-[1.05] tracking-[-0.02em] sm:text-[44px]">{greeting(now)}.</h1>
        <p className="mt-2 max-w-[620px] text-[14px] leading-relaxed text-muted sm:text-[15px]">
          {pending === 0
            ? "Has terminado lo de hoy. Descansa: mañana sigue el plan."
            : `${pending === 1 ? "Te queda 1 sesión" : `Te quedan ${pending} sesiones`} hoy. Yo me encargo del orden; tú solo dale a empezar.`}
        </p>
      </motion.header>

      <Setup />

      <AnimatePresence>
        {lastChanges.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="rounded-[20px] border border-amber/25 bg-amber/[0.04] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-medium text-ink">He reorganizado tu plan</p>
                  <ChangeList changes={lastChanges} />
                </div>
                <button onClick={store.clearChanges} className="shrink-0 rounded-lg p-1.5 text-faint hover:text-ink" aria-label="Entendido">
                  <X className="size-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {hero ? <Hero block={hero} live={hero === current} /> : <EmptyHero />}

      <DaySection blocks={todayBlocks} heroId={hero?.id} />

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-12">
        <Upcoming />
        <Signals />
      </div>

      <Goals />
    </div>
  );
}

/* ───────── Hero: the one thing to do now ───────── */

function Hero({ block, live }: { block: StudyBlock; live: boolean }) {
  const store = useStore()!;
  const focus = useFocus();
  const [why, setWhy] = useState(false);
  const subject = subjectOf(block.subjectId);
  const color = subjectColor(subject?.color ?? "c1");
  const t = store.now.getTime();
  const start = Date.parse(block.start);
  const mins = minutesBetween(block.start, block.end);
  const untilMin = Math.round((start - t) / 60_000);
  const isToday = localDayKey(new Date(block.start), TZ) === localDayKey(store.now, TZ);
  const progress = live ? (t - start) / (Date.parse(block.end) - start) : 0;
  const tech = TECHNIQUES[block.technique];
  const [subjectName, ...rest] = block.title.split(" · ");
  const active = focus.session?.block.id === block.id;

  const when = live
    ? "Ahora"
    : isToday
      ? untilMin <= 60
        ? `Empieza en ${Math.max(1, untilMin)} min`
        : `Hoy a las ${hm(block.start)}`
      : `${shortDay(block.start)} a las ${hm(block.start)}`;

  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease, delay: 0.05 }} className="glass relative overflow-hidden p-5 sm:p-8">
      <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full opacity-[0.14] blur-3xl" style={{ background: color }} />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-10">
        <StepRing block={block} progress={progress} color={color} />

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[12px]">
            <span className={`rounded-full px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.14em] ${live ? "bg-cyan/15 text-cyan" : "bg-white/[0.05] text-muted"}`}>{when}</span>
            <span className="flex items-center gap-1.5 text-muted">
              <span className="size-1.5 rounded-full" style={{ background: color }} />
              {subjectName}
            </span>
          </p>
          <h2 className="mt-3 text-[24px] font-medium leading-tight tracking-tight text-ink sm:text-[28px]">{rest.join(" · ") || block.title}</h2>
          <p className="mt-2 text-[14px] text-muted">
            <span className="text-ink">{tech.label.charAt(0).toUpperCase() + tech.label.slice(1)}</span> · {mins} min
            {block.focus === 3 && <span className="text-faint"> · máxima concentración</span>}
          </p>
          <p className="mt-3 hidden max-w-[520px] text-[13px] leading-relaxed text-faint sm:block">{tech.why}</p>

          <div className="mt-5 flex flex-wrap items-center gap-2.5 sm:mt-6">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => (active ? focus.open() : focus.start(block))}
              className="inline-flex items-center gap-2 rounded-2xl bg-ink px-5 py-3 text-[14px] font-medium text-base shadow-[0_0_36px_-8px_rgba(98,230,234,0.75)] transition-colors hover:bg-white"
            >
              <Play className="size-4" fill="currentColor" />
              {active ? "Volver a la sesión" : live ? "Empezar sesión" : "Empezar ya"}
            </motion.button>
            {!live && !active && (
              <button onClick={() => store.skipBlock(block)} className="inline-flex items-center gap-1.5 rounded-2xl px-3.5 py-3 text-[13px] text-faint transition-colors hover:text-ink">
                <SkipForward className="size-4" /> Ahora no me viene bien
              </button>
            )}
            <button onClick={() => setWhy((v) => !v)} className="inline-flex items-center gap-1 rounded-2xl px-3 py-3 text-[13px] text-faint transition-colors hover:text-ink">
              ¿Por qué esto? <ChevronDown className={`size-3.5 transition-transform ${why ? "rotate-180" : ""}`} />
            </button>
          </div>
          <AnimatePresence>
            {why && (
              <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-3 overflow-hidden border-l border-cyan/40 pl-3 text-[13px] leading-relaxed text-muted">
                {block.reason}.
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Session script */}
      <div className="relative mt-7 grid grid-cols-1 gap-2 border-t hairline pt-5 sm:grid-cols-2 lg:grid-cols-4">
        {block.steps.map((s, i) => (
          <div key={i} className="flex gap-3 rounded-2xl p-2">
            <span className="tabular mt-0.5 font-mono text-[11px] text-faint">{String(i + 1).padStart(2, "0")}</span>
            <div className="min-w-0">
              <p className="text-[13px] leading-snug text-ink">{s.label}</p>
              <p className="tabular mt-0.5 font-mono text-[11px] text-faint">{s.minutes} min</p>
            </div>
          </div>
        ))}
      </div>
    </motion.section>
  );
}

function StepRing({ block, progress, color }: { block: StudyBlock; progress: number; color: string }) {
  const size = 168;
  const r = 74;
  const total = block.steps.reduce((a, s) => a + s.minutes, 0);
  const gap = 0.025;
  let acc = 0;
  const arcs = block.steps.map((s) => {
    const from = acc / total;
    acc += s.minutes;
    return { from, to: acc / total };
  });
  const arc = (from: number, to: number) => {
    const a0 = from * 2 * Math.PI - Math.PI / 2;
    const a1 = to * 2 * Math.PI - Math.PI / 2;
    const large = to - from > 0.5 ? 1 : 0;
    const c = size / 2;
    return `M ${c + r * Math.cos(a0)} ${c + r * Math.sin(a0)} A ${r} ${r} 0 ${large} 1 ${c + r * Math.cos(a1)} ${c + r * Math.sin(a1)}`;
  };
  return (
    <div className="relative mx-auto -my-7 grid shrink-0 scale-[0.7] place-items-center sm:mx-0 sm:my-0 sm:scale-100" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 overflow-visible">
        {arcs.map((a, i) => (
          <motion.path
            key={i}
            d={arc(a.from + gap / 2, a.to - gap / 2)}
            stroke={color}
            strokeOpacity={0.28}
            strokeWidth={6}
            strokeLinecap="round"
            fill="none"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.7, delay: 0.15 + i * 0.12, ease }}
          />
        ))}
        {progress > 0 && <path d={arc(0.001, Math.min(0.999, progress))} stroke="var(--color-cyan)" strokeWidth={6} strokeLinecap="round" fill="none" style={{ filter: "drop-shadow(0 0 6px rgba(98,230,234,0.8))" }} />}
        <circle cx={size / 2} cy={size / 2} r={r - 16} fill="none" stroke="rgba(255,255,255,0.05)" strokeDasharray="1 5" />
      </svg>
      <div className="text-center">
        <p className="tabular font-mono text-[30px] font-light leading-none tracking-tight text-ink">{hm(block.start)}</p>
        <p className="tabular mt-1.5 font-mono text-[11px] text-faint">→ {hm(block.end)}</p>
      </div>
    </div>
  );
}

function EmptyHero() {
  const store = useStore()!;
  const waiting = store.data.clean && !store.live;
  return (
    <section className="glass p-8 text-center">
      <p className="text-[20px] font-light text-ink">{waiting ? "Aún no hay nada que estudiar." : "Nada pendiente en el horizonte."}</p>
      <p className="mt-2 text-[13.5px] text-faint">
        {waiting
          ? "Conecta EVAGD y tus exámenes y entregas aparecerán aquí con su plan. También puedes añadirlos desde el centro de comandos (botón central)."
          : "Cuando aparezca un examen o una tarea, lo verás aquí con su plan."}
      </p>
    </section>
  );
}

/* ───────── Day: timeline rail + compact list ───────── */

function DaySection({ blocks, heroId }: { blocks: StudyBlock[]; heroId?: string }) {
  const store = useStore()!;
  const now = store.now;
  const key = localDayKey(now, TZ);
  const busy = store.busyFor(1).filter((b) => localDayKey(new Date(b.start), TZ) === key && Date.parse(b.start) >= now.getTime() - 12 * 3_600_000);
  const total = blocks.reduce((a, b) => a + minutesBetween(b.start, b.end), 0);
  const done = blocks.filter((b) => store.data.feedback[fbKey(b)]?.outcome === "hecho").reduce((a, b) => a + minutesBetween(b.start, b.end), 0);

  if (!blocks.length) return null;
  const points = [...blocks, ...busy.filter((b) => Date.parse(b.end) > Date.parse(blocks[0]!.start) - 3 * 3_600_000)];
  const startH = Math.floor(Math.min(...points.map((b) => hour(b.start))));
  const endH = Math.ceil(Math.max(...points.map((b) => hour(b.end))));
  const span = Math.max(1, endH - startH);
  const pos = (iso: string) => ((hour(iso) - startH) / span) * 100;
  const nowPct = ((hour(now.toISOString()) - startH) / span) * 100;

  return (
    <section>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="micro">Tu día</p>
          <p className="mt-1.5 text-[14px] text-muted">
            <span className="tabular text-ink">{fmtMinutes(total)}</span> de estudio · <span className="tabular text-ink">{total ? Math.round((done / total) * 100) : 0} %</span> hecho
          </p>
        </div>
        <Link href="/plan" className="flex items-center gap-1 text-[12.5px] text-faint transition-colors hover:text-ink">
          Semana <ArrowUpRight className="size-3.5" />
        </Link>
      </div>

      {/* Rail */}
      <div className="relative mt-5 h-14">
        <div className="absolute inset-x-0 top-[18px] h-[14px] rounded-full bg-white/[0.03]" />
        {busy.map((b) => (
          <div
            key={b.id}
            className="hatch absolute top-[18px] h-[14px] rounded-full border border-line"
            style={{ left: `${Math.max(0, pos(b.start))}%`, width: `${Math.min(100, pos(b.end)) - Math.max(0, pos(b.start))}%` }}
            title={`${b.title} · ${hm(b.start)}–${hm(b.end)}`}
          />
        ))}
        {blocks.map((b, i) => {
          const color = subjectColor(subjectOf(b.subjectId)?.color ?? "c1");
          const past = Date.parse(b.end) <= now.getTime();
          return (
            <motion.div
              key={b.id}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.5, delay: 0.1 + i * 0.05, ease }}
              className="absolute top-[18px] h-[14px] origin-left rounded-full"
              style={{
                left: `${pos(b.start)}%`,
                width: `${pos(b.end) - pos(b.start)}%`,
                background: color,
                opacity: past ? 0.35 : b.id === heroId ? 1 : 0.75,
                boxShadow: b.id === heroId ? `0 0 14px ${color}` : undefined,
              }}
              title={`${b.title} · ${hm(b.start)}`}
            />
          );
        })}
        {nowPct >= 0 && nowPct <= 100 && (
          <div className="absolute top-2 h-[34px] w-px bg-cyan shadow-[0_0_10px_rgba(98,230,234,0.9)]" style={{ left: `${nowPct}%` }}>
            <span className="absolute -top-1 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-cyan" />
          </div>
        )}
        <div className="absolute inset-x-0 top-[40px] flex justify-between">
          {Array.from({ length: span + 1 }, (_, i) => startH + i).map((h, i) => (
            <span key={h} className={`tabular font-mono text-[10px] text-faint ${i % 2 && span > 6 ? "hidden sm:inline" : ""}`}>
              {String(h).padStart(2, "0")}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-5">
        {blocks.map((b) => (
          <DayRow key={b.id} block={b} hero={b.id === heroId} />
        ))}
      </div>
    </section>
  );
}

function hour(iso: string) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const h = Number(p.find((x) => x.type === "hour")!.value);
  const m = Number(p.find((x) => x.type === "minute")!.value);
  return h + m / 60;
}

function DayRow({ block, hero }: { block: StudyBlock; hero: boolean }) {
  const store = useStore()!;
  const focus = useFocus();
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const t = store.now.getTime();
  const past = Date.parse(block.end) <= t;
  const live = Date.parse(block.start) <= t && !past;
  const fb = store.data.feedback[fbKey(block)];
  const color = subjectColor(subjectOf(block.subjectId)?.color ?? "c1");
  const [subjectName, ...rest] = block.title.split(" · ");

  function record(o: Outcome) {
    store.recordOutcome(block, o, block.topicId ? (o === "hecho" ? 4 : o === "parcial" ? 3 : 1) : undefined);
    setAsking(false);
  }

  return (
    <div className="group border-t hairline">
      <div className="flex items-center gap-3 py-3.5 sm:gap-4">
        <span className={`tabular w-11 shrink-0 font-mono text-[13px] ${past ? "text-faint" : "text-ink"}`}>{hm(block.start)}</span>
        <span className="h-8 w-[3px] shrink-0 rounded-full" style={{ background: color, opacity: past ? 0.35 : 1, boxShadow: hero ? `0 0 10px ${color}` : undefined }} />
        <button onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 text-left">
          <p className={`truncate text-[14.5px] ${past && fb ? "text-faint" : "text-ink"}`}>{rest.join(" · ") || block.title}</p>
          <p className="truncate text-[12px] text-faint">
            {subjectName} · {TECHNIQUES[block.technique].label} · {minutesBetween(block.start, block.end)} min
            {fb && <span className={fb.outcome === "hecho" ? "text-good" : fb.outcome === "parcial" ? "text-amber" : ""}> · {fb.outcome === "hecho" ? "hecho" : fb.outcome === "parcial" ? "a medias" : "no hecho"}</span>}
          </p>
        </button>
        {fb?.outcome === "hecho" ? (
          <Check className="size-4 shrink-0 text-good" />
        ) : past && !fb ? (
          <button onClick={() => setAsking((v) => !v)} className="shrink-0 rounded-xl border border-line px-2.5 py-1.5 text-[12px] text-muted hover:border-line-strong hover:text-ink">
            ¿Cómo fue?
          </button>
        ) : !fb ? (
          <button
            onClick={() => focus.start(block)}
            className={`grid size-9 shrink-0 place-items-center rounded-full border transition-colors ${live ? "border-cyan/50 text-cyan" : "border-line text-faint opacity-100 group-hover:text-ink sm:opacity-0 sm:group-hover:opacity-100"}`}
            aria-label="Empezar esta sesión"
          >
            <Play className="size-3.5" fill="currentColor" />
          </button>
        ) : null}
      </div>
      <AnimatePresence>
        {asking && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex flex-wrap gap-2 overflow-hidden pb-3.5 pl-[74px]">
            {([["hecho", "Hecho"], ["parcial", "A medias"], ["no_hecho", "No pude"]] as const).map(([v, label]) => (
              <button key={v} onClick={() => record(v)} className="rounded-xl border border-line px-3 py-1.5 text-[12.5px] text-muted hover:border-line-strong hover:text-ink">
                {label}
              </button>
            ))}
          </motion.div>
        )}
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden pb-4 pl-[74px] pr-2">
            <ol className="space-y-1.5">
              {block.steps.map((s, i) => (
                <li key={i} className="flex gap-3 text-[13px]">
                  <span className="tabular w-8 shrink-0 font-mono text-[11px] leading-5 text-faint">{s.minutes}′</span>
                  <span className="text-muted">{s.label}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-[12px] leading-relaxed text-faint">{block.reason}.</p>
            {!past && !fb && (
              <button onClick={() => store.skipBlock(block)} className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-faint hover:text-ink">
                <SkipForward className="size-3.5" /> Mover a otro hueco
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ───────── Upcoming and signals ───────── */

function Upcoming() {
  const store = useStore()!;
  const list = store.briefing.upcoming.slice(0, 5);
  return (
    <section>
      <p className="micro">Lo que viene</p>
      <div className="mt-4">
        {list.length === 0 && <p className="text-[13.5px] text-faint">Nada en los próximos 14 días.</p>}
        {list.map(({ item, daysLeft }) => {
          const s = subjectOf(item.subjectId);
          const color = subjectColor(s?.color ?? "c1");
          const pct = Math.min(1, item.doneMinutes / Math.max(1, item.effortMinutes));
          return (
            <div key={item.id} className="group flex items-center gap-4 border-t hairline py-3.5">
              <div className="w-12 shrink-0 text-center">
                <p className="tabular font-mono text-[22px] font-light leading-none text-ink">{daysLeft}</p>
                <p className="mt-1 font-mono text-[9.5px] uppercase tracking-wider text-faint">{daysLeft === 1 ? "día" : "días"}</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] text-ink">{item.title}</p>
                <div className="mt-1.5 flex items-center gap-2.5">
                  <div className="h-[3px] w-20 overflow-hidden rounded-full bg-white/[0.06]">
                    <motion.div className="h-full rounded-full" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${pct * 100}%` }} transition={{ duration: 0.9, ease }} />
                  </div>
                  <p className="truncate text-[11.5px] text-faint">
                    {s?.name} · {item.kind === "examen" ? "examen" : "entrega"} {relDays(daysLeft)}
                  </p>
                </div>
              </div>
              <button onClick={() => store.completeItem(item.id)} title="Marcar como hecho" className="rounded-lg p-1.5 text-faint opacity-60 transition hover:text-good group-hover:opacity-100">
                <Check className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const TONE: Record<string, string> = { alerta: "var(--color-amber)", riesgo: "var(--color-amber)", recomendacion: "var(--color-cyan)", oportunidad: "var(--color-good)" };

function Signals() {
  const store = useStore()!;
  const findings = store.plan.findings.slice(0, 4);
  return (
    <section>
      <p className="micro">JARVIS ha detectado</p>
      <div className="mt-4">
        {findings.length === 0 && <p className="border-t hairline py-3.5 text-[13.5px] text-faint">Todo en orden. Nada que requiera tu atención.</p>}
        <AnimatePresence initial={false}>
          {findings.map((f) => (
            <motion.div key={f.id} layout exit={{ opacity: 0, height: 0 }} className="group flex items-start gap-3.5 overflow-hidden border-t hairline py-3.5">
              <span className="mt-[7px] size-1.5 shrink-0 rounded-full" style={{ background: TONE[f.type], boxShadow: `0 0 8px ${TONE[f.type]}` }} />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] leading-snug text-ink">{f.title}</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-faint">{f.detail}</p>
              </div>
              <button onClick={() => store.dismissFinding(f.id)} className="rounded-lg p-1 text-faint opacity-60 transition hover:text-ink group-hover:opacity-100" aria-label="Descartar">
                <X className="size-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}

/* ───────── Goals strip ───────── */

function Goals() {
  const store = useStore()!;
  const academic = store.goals.find((g) => g.area === "academico");
  const cambridge = store.goals.find((g) => g.area === "cambridge");
  const reqs = rotterdamRequirements.filter((r) => r.state === "cumplido" || r.state === "en_camino").length;
  // A real account has no grades yet: show the target and a dash, never invented numbers.
  const metric = (m: { current: number; target: number } | undefined, target: number) => ({ value: m ? m.current : null, target: m?.target ?? target });
  const items = [
    { label: "Nota media", ...metric(academic?.metrics[0], 9.2), d: 2, color: "var(--color-c1)" },
    { label: "Matemáticas", ...metric(academic?.metrics[1], 8.5), d: 1, color: "var(--color-c2)" },
    { label: "Cambridge", ...metric(cambridge?.metrics[0], 185), d: 0, color: "var(--color-c6)" },
    { label: "Rotterdam", value: store.data.clean ? null : reqs, target: rotterdamRequirements.length, d: 0, color: "var(--color-indigo)" },
  ];
  return (
    <section>
      <div className="flex items-end justify-between">
        <p className="micro">Objetivos</p>
        <Link href="/objetivos" className="flex items-center gap-1 text-[12.5px] text-faint transition-colors hover:text-ink">
          Detalle <ArrowUpRight className="size-3.5" />
        </Link>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-y-6 border-t hairline pt-5 sm:grid-cols-4">
        {items.map((g, i) => (
          <div key={g.label} className={`px-1 sm:px-5 ${i ? "sm:border-l sm:border-line" : "sm:pl-0"}`}>
            <p className="text-[12px] text-faint">{g.label}</p>
            <p className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-[28px] font-light leading-none tracking-tight text-ink">
                {g.value === null ? "—" : <CountUp value={g.value} decimals={g.d} />}
              </span>
              <span className="tabular text-[12px] text-faint">/ {g.target.toLocaleString("es-ES")}</span>
            </p>
            <div className="mt-3 h-[2px] w-full max-w-[140px] overflow-hidden rounded-full bg-white/[0.06]">
              <motion.div className="h-full rounded-full" style={{ background: g.color, boxShadow: `0 0 8px ${g.color}` }} initial={{ width: 0 }} animate={{ width: `${g.value === null ? 0 : Math.min(1, g.value / g.target) * 100}%` }} transition={{ duration: 1.1, ease, delay: 0.1 * i }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
