"use client";

import { motion } from "motion/react";
import { Bell, CalendarCheck, CalendarPlus, Check, ChevronRight, Smartphone } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useStore } from "@/lib/store";
import { CalendarSubscribe } from "./CalendarSubscribe";

/** First steps for a real account. Disappears once everything is set up. */
export function Setup() {
  const store = useStore();
  const [standalone, setStandalone] = useState(true);
  const [push, setPush] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    setStandalone(window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);
    setPush("Notification" in window && Notification.permission === "granted");
  }, []);

  if (!store || store.sync.mode !== "cloud") return null;
  const steps = [
    {
      id: "evagd",
      icon: CalendarCheck,
      title: "Conecta EVAGD",
      detail: "Tus exámenes y entregas entran solos en el plan.",
      done: store.live,
      action: <StepLink href="/ajustes#evagd">Ir a conectar</StepLink>,
    },
    {
      id: "calendar",
      icon: CalendarPlus,
      title: "Pon JARVIS en tu calendario",
      detail: "Tus sesiones, exámenes y entregas aparecerán en el calendario del iPhone y se actualizan solas.",
      done: !!store.data.setup?.calendar,
      action: <CalendarSubscribe compact />,
    },
    {
      id: "home",
      icon: Smartphone,
      title: "Instala JARVIS en el iPhone",
      detail: "En Safari: botón Compartir → «Añadir a pantalla de inicio». Se abre como una app.",
      done: standalone,
      action: null,
    },
    {
      id: "push",
      icon: Bell,
      title: "Activa los avisos",
      detail: "Te aviso 15 minutos antes de cada sesión y por la mañana con el resumen del día.",
      done: push,
      action: <StepLink href="/ajustes#avisos">Activar</StepLink>,
    },
  ];
  const left = steps.filter((s) => !s.done);
  if (left.length === 0) return null;

  return (
    <motion.section initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="glass p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[15px] font-medium text-ink">Para que JARVIS funcione solo</p>
        <p className="tabular font-mono text-[11px] text-faint">
          {steps.length - left.length}/{steps.length}
        </p>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full bg-cyan" style={{ width: `${((steps.length - left.length) / steps.length) * 100}%` }} />
      </div>
      <ul className="mt-4 space-y-1">
        {steps.map((s) => {
          const Icon = s.icon;
          const isOpen = open === s.id || (!open && s.id === left[0]?.id);
          return (
            <li key={s.id} className="rounded-2xl">
              <button
                onClick={() => setOpen(isOpen ? "__none" : s.id)}
                className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left hover:bg-white/[0.03]"
                disabled={s.done}
              >
                <span className={`grid size-8 shrink-0 place-items-center rounded-full border ${s.done ? "border-good/40 bg-good/10 text-good" : "border-line text-muted"}`}>
                  {s.done ? <Check className="size-4" /> : <Icon className="size-4" strokeWidth={1.75} />}
                </span>
                <span className={`flex-1 text-[14px] ${s.done ? "text-faint line-through" : "text-ink"}`}>{s.title}</span>
              </button>
              {isOpen && !s.done && (
                <div className="pb-3 pl-[52px] pr-2">
                  <p className="text-[13px] leading-relaxed text-muted">{s.detail}</p>
                  {s.action && <div className="mt-3">{s.action}</div>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </motion.section>
  );
}

function StepLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 rounded-xl bg-ink px-3.5 py-2 text-sm font-medium text-base">
      {children} <ChevronRight className="size-4" />
    </Link>
  );
}
