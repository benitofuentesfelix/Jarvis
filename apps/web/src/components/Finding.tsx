"use client";

import { motion } from "motion/react";
import { X } from "lucide-react";
import type { Finding } from "@jarvis/core";

const COLOR = { 3: "var(--color-bad)", 2: "var(--color-amber)", 1: "var(--color-cyan)" } as const;

export function FindingRow({ f, onDismiss }: { f: Finding; onDismiss?: () => void }) {
  const c = COLOR[f.severity];
  return (
    <motion.div layout className="group flex items-start gap-3.5 border-t hairline py-3 first:border-t-0 first:pt-0">
      <span className="mt-[7px] size-1.5 shrink-0 rounded-full" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] leading-snug text-ink">{f.title}</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-faint">{f.detail}</p>
      </div>
      {onDismiss && (
        <button onClick={onDismiss} className="shrink-0 rounded p-1 text-faint opacity-60 transition hover:text-ink group-hover:opacity-100" aria-label="Descartar">
          <X className="size-3.5" />
        </button>
      )}
    </motion.div>
  );
}
