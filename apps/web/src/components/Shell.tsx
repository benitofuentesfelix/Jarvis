"use client";

import { AnimatePresence, motion } from "motion/react";
import { Activity, Brain, CalendarRange, Home, Settings2, Target } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useStore } from "@/lib/store";
import { CommandPalette } from "./CommandPalette";
import { FocusProvider } from "./Focus";
import { Orb } from "./Orb";

const NAV = [
  { href: "/", label: "Hoy", icon: Home },
  { href: "/plan", label: "Plan", icon: CalendarRange },
  { href: "/objetivos", label: "Objetivos", icon: Target },
  { href: "/inteligencia", label: "Inteligencia", icon: Activity },
  { href: "/memoria", label: "Memoria", icon: Brain },
];

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const store = useStore();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  const working = !!store?.working;

  return (
    <FocusProvider>
      <div className="ambient" aria-hidden />
      <div className="mx-auto flex min-h-dvh w-full max-w-[1200px]">
        {/* Desktop rail */}
        <aside className="sticky top-0 hidden h-dvh w-[84px] shrink-0 flex-col items-center py-6 lg:flex">
          <button onClick={() => setOpen(true)} className="group relative mb-8 grid place-items-center" aria-label="Centro de comandos (⌘K)">
            <Orb size={40} working={working} />
            <Tip>Centro de comandos · ⌘K</Tip>
          </button>
          <nav className="flex flex-col items-center gap-1.5">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = path === href;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-label={label}
                  className={`group relative grid size-11 place-items-center rounded-2xl transition-colors ${active ? "text-ink" : "text-faint hover:text-ink"}`}
                >
                  {active && (
                    <motion.span
                      layoutId="rail"
                      className="absolute inset-0 rounded-2xl border border-line-strong bg-white/[0.05] shadow-[0_0_20px_-8px_rgba(98,230,234,0.6)]"
                      transition={{ type: "spring", stiffness: 420, damping: 36 }}
                    />
                  )}
                  <Icon className="relative size-[19px]" strokeWidth={1.75} />
                  <Tip>{label}</Tip>
                </Link>
              );
            })}
          </nav>
          <Link
            href="/ajustes"
            aria-label="Ajustes"
            className={`group relative mt-auto grid size-11 place-items-center rounded-2xl transition-colors ${path === "/ajustes" ? "bg-white/[0.05] text-ink" : "text-faint hover:text-ink"}`}
          >
            <Settings2 className="size-[18px]" strokeWidth={1.75} />
            <Tip>Ajustes e integraciones</Tip>
          </Link>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile top bar */}
          <header className="sticky top-0 z-30 flex items-center gap-2.5 px-4 pb-2 pt-[max(12px,env(safe-area-inset-top))] lg:hidden">
            <div className="absolute inset-0 -z-10 bg-gradient-to-b from-base via-base/80 to-transparent" />
            <Orb size={24} working={working} />
            <p className="flex-1 font-mono text-[11px] uppercase tracking-[0.2em] text-muted">Jarvis</p>
            <Link href="/memoria" aria-label="Memoria" className={`grid size-9 place-items-center rounded-xl ${path === "/memoria" ? "text-ink" : "text-faint"}`}>
              <Brain className="size-[18px]" strokeWidth={1.75} />
            </Link>
            <Link href="/ajustes" aria-label="Ajustes" className={`grid size-9 place-items-center rounded-xl ${path === "/ajustes" ? "text-ink" : "text-faint"}`}>
              <Settings2 className="size-[18px]" strokeWidth={1.75} />
            </Link>
          </header>

          <main className="min-w-0 flex-1 px-4 pb-32 pt-2 sm:px-6 lg:px-10 lg:pb-14 lg:pt-10">
            <AnimatePresence mode="wait">
              <motion.div
                key={path}
                initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>

        {/* Mobile floating dock */}
        <nav className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-30 lg:hidden">
          <div className="mx-auto flex max-w-[420px] items-center justify-between rounded-[26px] border border-line-strong bg-s1 px-2 py-1.5 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.05)]">
            {NAV.slice(0, 2).map((n) => (
              <DockLink key={n.href} {...n} active={path === n.href} />
            ))}
            <button
              onClick={() => setOpen(true)}
              aria-label="Centro de comandos"
              className="-my-4 grid size-[58px] place-items-center rounded-full border border-cyan/30 bg-base shadow-[0_0_30px_-6px_rgba(98,230,234,0.55)]"
            >
              <Orb size={30} working={working} />
            </button>
            {NAV.slice(2, 4).map((n) => (
              <DockLink key={n.href} {...n} active={path === n.href} />
            ))}
          </div>
        </nav>

        <CommandPalette open={open} onClose={() => setOpen(false)} />
      </div>
    </FocusProvider>
  );
}

function DockLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof Home; active: boolean }) {
  return (
    <Link href={href} className={`relative flex w-16 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[10px] transition-colors ${active ? "text-ink" : "text-faint"}`}>
      <Icon className="size-[19px]" strokeWidth={1.75} />
      {label}
      {active && <motion.span layoutId="dock" className="absolute -bottom-0.5 h-[2px] w-5 rounded-full bg-cyan shadow-[0_0_8px_rgba(98,230,234,0.9)]" />}
    </Link>
  );
}

function Tip({ children }: { children: ReactNode }) {
  return (
    <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-lg border border-line bg-s2/95 px-2.5 py-1 text-[12px] text-ink opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
      {children}
    </span>
  );
}
