"use client";

/** The JARVIS presence: breathes when idle, spins its outer ring while working. */
export function Orb({ size = 40, working = false }: { size?: number; working?: boolean }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-hidden>
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: "radial-gradient(circle at 50% 42%, rgba(92,225,230,0.95), rgba(42,143,163,0.45) 55%, transparent 72%)",
          animation: `orb-breathe ${working ? 1.2 : 4}s ease-in-out infinite`,
          filter: "blur(0.3px)",
        }}
      />
      <div
        className="absolute inset-[8%] rounded-full border"
        style={{
          borderColor: "rgba(92,225,230,0.5)",
          borderTopColor: working ? "rgba(233,236,241,0.95)" : "rgba(92,225,230,0.5)",
          animation: `orb-spin ${working ? 0.9 : 14}s linear infinite`,
        }}
      />
      <div className="absolute inset-[38%] rounded-full bg-ink shadow-[0_0_12px_rgba(92,225,230,0.8)]" />
    </div>
  );
}
