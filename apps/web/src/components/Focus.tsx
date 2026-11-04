"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, Pause, Play, SkipForward, Square } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { TECHNIQUES, type StudyBlock } from "@jarvis/core";
import { subjectOf, useStore, type Outcome } from "@/lib/store";
import { subjectColor } from "@/lib/format";

interface Session {
  block: StudyBlock;
  startedAt: number;
  /** Total paused time so far, in ms. */
  paused: number;
  pausedAt?: number;
}

interface FocusApi {
  session: Session | null;
  start: (block: StudyBlock) => void;
  open: () => void;
}

const Ctx = createContext<FocusApi>({ session: null, start: () => {}, open: () => {} });
const KEY = "jarvis.focus";

export function useFocus() {
  return useContext(Ctx);
}

export function FocusProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setSession(JSON.parse(raw) as Session);
    } catch {
      /* ignore */
    }
  }, []);

  const save = useCallback((s: Session | null) => {
    setSession(s);
    try {
      if (s) localStorage.setItem(KEY, JSON.stringify(s));
      else localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const api = useMemo<FocusApi>(
    () => ({
      session,
      start: (block) => {
        if (session?.block.id !== block.id) save({ block, startedAt: Date.now(), paused: 0 });
        setVisible(true);
      },
      open: () => setVisible(true),
    }),
    [session, save],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <AnimatePresence>{session && visible && <FocusOverlay session={session} save={save} onHide={() => setVisible(false)} />}</AnimatePresence>
      <AnimatePresence>{session && !visible && <FocusPill session={session} onOpen={() => setVisible(true)} />}</AnimatePresence>
    </Ctx.Provider>
  );
}

function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

function elapsedOf(s: Session) {
  const end = s.pausedAt ?? Date.now();
  return Math.max(0, end - s.startedAt - s.paused);
}

const mmss = (ms: number) => {
  const t = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

function stepAt(block: StudyBlock, elapsedMin: number) {
  let acc = 0;
  for (let i = 0; i < block.steps.length; i++) {
    const s = block.steps[i]!;
    if (elapsedMin < acc + s.minutes) return { index: i, startMin: acc };
    acc += s.minutes;
  }
  return { index: block.steps.length, startMin: acc };
}

function FocusPill({ session, onOpen }: { session: Session; onOpen: () => void }) {
  useTick();
  const total = session.block.steps.reduce((a, s) => a + s.minutes, 0) * 60_000;
  const left = total - elapsedOf(session);
  const color = subjectColor(subjectOf(session.block.subjectId)?.color ?? "c2");
  return (
    <motion.button
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      onClick={onOpen}
      className="glass fixed bottom-[92px] left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 !rounded-full py-2 pl-3 pr-4 lg:bottom-6"
    >
      <span className="size-2 rounded-full" style={{ background: color, animation: session.pausedAt ? undefined : "pulse-dot 2s infinite" }} />
      <span className="max-w-[180px] truncate text-[13px] text-ink">{session.block.title.split(" · ").slice(-1)[0]}</span>
      <span className="tabular font-mono text-[13px] text-cyan">{left > 0 ? mmss(left) : "fin"}</span>
    </motion.button>
  );
}

function FocusOverlay({ session, save, onHide }: { session: Session; save: (s: Session | null) => void; onHide: () => void }) {
  useTick(500);
  const store = useStore();
  const { block } = session;
  const subject = subjectOf(block.subjectId);
  const color = subjectColor(subject?.color ?? "c2");
  const totalMin = block.steps.reduce((a, s) => a + s.minutes, 0);
  const elapsed = elapsedOf(session);
  const elapsedMin = elapsed / 60_000;
  const { index } = stepAt(block, elapsedMin);
  const finishedTime = elapsedMin >= totalMin;
  const [ending, setEnding] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const showFeedback = ending || finishedTime;
  const paused = !!session.pausedAt;

  // Keep the screen on while focusing, where the browser allows it.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    return () => void lock?.release().catch(() => {});
  }, []);

  const r = 118;
  const c = 2 * Math.PI * r;
  const progress = Math.min(1, elapsedMin / totalMin);

  function togglePause() {
    if (paused) save({ ...session, paused: session.paused + (Date.now() - session.pausedAt!), pausedAt: undefined });
    else save({ ...session, pausedAt: Date.now() });
  }
  function skipStep() {
    let acc = 0;
    for (let i = 0; i <= index && i < block.steps.length; i++) acc += block.steps[i]!.minutes;
    const target = acc * 60_000;
    save({ ...session, startedAt: session.startedAt - (target - elapsed) });
  }
  function finish(o: Outcome, quality?: number) {
    store?.recordOutcome(block, o, quality);
    save(null);
    onHide();
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] overflow-y-auto bg-void"
      role="dialog"
      aria-label="Modo foco"
    >
      <div
        className="pointer-events-none absolute left-1/2 top-[18%] size-[520px] -translate-x-1/2 rounded-full opacity-25 blur-3xl"
        style={{ background: `radial-gradient(circle, ${color}, transparent 65%)` }}
      />
      <div className="relative mx-auto flex min-h-full max-w-[560px] flex-col px-5 pb-10 pt-[max(20px,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <p className="micro">Modo foco</p>
          <button onClick={onHide} className="flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[12.5px] text-faint hover:text-ink">
            <ChevronDown className="size-4" /> Minimizar
          </button>
        </div>

        <div className="mt-6 text-center">
          <p className="flex items-center justify-center gap-2 text-[12px] text-muted">
            <span className="size-1.5 rounded-full" style={{ background: color }} />
            {subject?.name} · {TECHNIQUES[block.technique].label}
          </p>
          <h2 className="mx-auto mt-2 max-w-[440px] text-[21px] font-medium leading-snug tracking-tight text-ink">{block.title.split(" · ").slice(1).join(" · ") || block.title}</h2>
        </div>

        {/* Ring */}
        <div className="relative mx-auto mt-6 grid size-[220px] place-items-center sm:mt-8 sm:size-[260px]">
          <svg viewBox="0 0 260 260" className="absolute inset-0 -rotate-90">
            <defs>
              <linearGradient id="focus-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="var(--color-cyan)" />
                <stop offset="100%" stopColor="var(--color-indigo)" />
              </linearGradient>
            </defs>
            <circle cx="130" cy="130" r={r} stroke="rgba(255,255,255,0.06)" strokeWidth="3" fill="none" />
            {/* Step ticks */}
            {block.steps.reduce<{ at: number; els: ReactNode[] }>(
              (acc, s, i) => {
                const at = acc.at + s.minutes / totalMin;
                if (i < block.steps.length - 1) {
                  const a = at * 2 * Math.PI;
                  acc.els.push(
                    <line key={i} x1={130 + (r - 7) * Math.cos(a)} y1={130 + (r - 7) * Math.sin(a)} x2={130 + (r + 7) * Math.cos(a)} y2={130 + (r + 7) * Math.sin(a)} stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />,
                  );
                }
                return { at, els: acc.els };
              },
              { at: 0, els: [] },
            ).els}
            <circle
              cx="130"
              cy="130"
              r={r}
              stroke="url(#focus-grad)"
              strokeWidth="3.5"
              strokeLinecap="round"
              fill="none"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - progress)}
              style={{ transition: "stroke-dashoffset 600ms linear", filter: "drop-shadow(0 0 8px rgba(98,230,234,0.6))" }}
            />
          </svg>
          <div className="text-center">
            <p className={`tabular font-mono text-[46px] font-light sm:text-[54px] leading-none tracking-tight ${paused ? "text-faint" : "text-ink"}`}>{mmss(totalMin * 60_000 - elapsed)}</p>
            <p className="mt-2 text-[12px] text-faint">{paused ? "en pausa" : `de ${totalMin} min`}</p>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {!showFeedback ? (
            <motion.div key="run" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {/* Current step */}
              <div className="mt-8 text-center">
                <p className="micro">
                  Paso {Math.min(index + 1, block.steps.length)} de {block.steps.length}
                </p>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={index}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="mx-auto mt-2 max-w-[420px] text-[18px] leading-snug text-ink"
                  >
                    {block.steps[index]?.label}
                  </motion.p>
                </AnimatePresence>
              </div>

              <ol className="mx-auto mt-7 max-w-[420px] space-y-1">
                {block.steps.map((s, i) => (
                  <li key={i} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] transition-colors ${i === index ? "bg-white/[0.04] text-ink" : i < index ? "text-faint line-through decoration-white/20" : "text-muted"}`}>
                    <span className={`grid size-4 shrink-0 place-items-center rounded-full border ${i < index ? "border-good/40 bg-good/15" : i === index ? "border-cyan" : "border-line-strong"}`}>
                      {i < index && <Check className="size-2.5 text-good" />}
                      {i === index && <span className="size-1.5 rounded-full bg-cyan" />}
                    </span>
                    <span className="min-w-0 flex-1">{s.label}</span>
                    <span className="tabular font-mono text-[11px] text-faint">{s.minutes}′</span>
                  </li>
                ))}
              </ol>

              <div className="mt-8 flex items-center justify-center gap-3">
                <button onClick={skipStep} className="grid size-12 place-items-center rounded-full border border-line text-muted transition-colors hover:border-line-strong hover:text-ink" aria-label="Siguiente paso">
                  <SkipForward className="size-[18px]" />
                </button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={togglePause}
                  className="grid size-16 place-items-center rounded-full bg-ink text-base shadow-[0_0_40px_-8px_rgba(98,230,234,0.7)]"
                  aria-label={paused ? "Reanudar" : "Pausar"}
                >
                  {paused ? <Play className="size-6 translate-x-px" /> : <Pause className="size-6" />}
                </motion.button>
                <button onClick={() => setEnding(true)} className="grid size-12 place-items-center rounded-full border border-line text-muted transition-colors hover:border-line-strong hover:text-ink" aria-label="Terminar">
                  <Square className="size-4" />
                </button>
              </div>
              <p className="mx-auto mt-6 max-w-[400px] text-center text-[12px] leading-relaxed text-faint">{TECHNIQUES[block.technique].why}</p>
            </motion.div>
          ) : (
            <motion.div key="fb" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-8 text-center">
              <p className="text-[18px] text-ink">{finishedTime ? "Sesión completada." : "¿Lo dejas aquí?"} ¿Cómo ha ido?</p>
              <p className="mt-1 text-[12.5px] text-faint">Con esto JARVIS ajusta el tiempo que necesitas y cuándo repasar.</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {([["hecho", "Hecho"], ["parcial", "A medias"], ["no_hecho", "No pude"]] as const).map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => (block.topicId && v !== "no_hecho" ? setOutcome(v) : finish(v))}
                    className={`rounded-2xl border px-4 py-2.5 text-[14px] transition-colors ${
                      outcome === v ? "border-cyan/50 bg-cyan/10 text-ink" : "border-line text-muted hover:border-line-strong hover:text-ink"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {outcome && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
                  <p className="text-[14px] text-muted">¿Cuánto recordabas sin mirar?</p>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    {([[1, "Casi nada"], [3, "Algo"], [4, "Bastante"], [5, "Todo"]] as const).map(([q, label]) => (
                      <button key={q} onClick={() => finish(outcome, q)} className="rounded-2xl border border-line px-4 py-2.5 text-[14px] text-muted transition-colors hover:border-cyan/50 hover:bg-cyan/10 hover:text-ink">
                        {label}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
              {!finishedTime && (
                <button onClick={() => setEnding(false)} className="mt-6 text-[12.5px] text-faint hover:text-muted">
                  Seguir con la sesión
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
