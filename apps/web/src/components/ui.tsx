"use client";

import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, type ReactNode } from "react";

export function Card({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
      className={`card card-hover p-5 ${className}`}
    >
      {children}
    </motion.section>
  );
}

export function Label({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="micro">{children}</h2>
      {right}
    </div>
  );
}

export function CountUp({ value, decimals = 0, className = "" }: { value: number; decimals?: number; className?: string }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => v.toLocaleString("es-ES", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }));
  useEffect(() => {
    const c = animate(mv, value, { duration: 0.9, ease: [0.22, 1, 0.36, 1] });
    return () => c.stop();
  }, [value, mv]);
  return <motion.span className={`tabular ${className}`}>{text}</motion.span>;
}

export function Ring({
  value,
  size = 64,
  stroke = 5,
  color = "var(--color-cyan)",
  children,
}: {
  value: number; // 0..1
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - v) }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

export function Sparkline({ values, color = "var(--color-cyan)", width = 120, height = 32 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (width - 4) + 2, height - 3 - ((v - min) / span) * (height - 6)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const last = pts.at(-1)!;
  return (
    <svg width={width} height={height} className="overflow-visible">
      <motion.path d={d} fill="none" stroke={color} strokeWidth="1.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2 }} />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} />
    </svg>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "amber" | "cyan" | "good" | "bad" }) {
  const tones = {
    neutral: "border-line text-muted bg-white/[0.03]",
    amber: "border-amber/30 text-amber bg-amber/10",
    cyan: "border-cyan/30 text-cyan bg-cyan/10",
    good: "border-good/30 text-good bg-good/10",
    bad: "border-bad/30 text-bad bg-bad/10",
  } as const;
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

export function Button({
  children,
  onClick,
  variant = "ghost",
  className = "",
  type = "button",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "ghost" | "primary" | "subtle";
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const v = {
    ghost: "border border-line hover:border-line-strong hover:bg-white/[0.04] text-ink",
    primary: "bg-ink text-base hover:bg-white shadow-[0_0_24px_-6px_rgba(98,230,234,0.55)]",
    subtle: "bg-s2 hover:bg-s3 text-ink",
  } as const;
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-40 ${v[variant]} ${className}`}
    >
      {children}
    </motion.button>
  );
}

export function Dot({ color }: { color: string }) {
  return <span className="inline-block size-2 shrink-0 rounded-full" style={{ background: color }} />;
}
