"use client";

import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useState } from "react";
import { atLocalTime } from "@jarvis/core";
import { subjects, TZ, useStore } from "@/lib/store";
import { Button } from "./ui";

export function AddItemDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useStore();
  const [kind, setKind] = useState<"examen" | "tarea">("examen");
  const [subjectId, setSubjectId] = useState("mat");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [effort, setEffort] = useState(250);

  if (!store) return null;

  function submit() {
    if (!store || !date) return;
    const due = atLocalTime(new Date(`${date}T12:00:00Z`), kind === "examen" ? "08:00" : "23:59", TZ);
    store.addItem({
      kind,
      subjectId,
      title: title.trim() || `${kind === "examen" ? "Examen" : "Tarea"} de ${subjects.find((s) => s.id === subjectId)?.name}`,
      due: due.toISOString(),
      effortMinutes: effort,
      topicIds: store.data.topics.filter((t) => t.subjectId === subjectId).slice(0, 2).map((t) => t.id),
    });
    setTitle("");
    setDate("");
    onClose();
  }

  const field = "w-full rounded-xl border border-line bg-s2 px-3 py-2.5 text-[14px] text-ink focus:border-line-strong focus:outline-none";

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-void/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div role="dialog" aria-label="Añadir examen o tarea" initial={{ y: 12, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 8, opacity: 0 }} className="card relative w-full max-w-md p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[16px] font-semibold tracking-tight">Añadir a tu plan</h2>
              <button onClick={onClose} className="rounded-lg p-1.5 text-faint hover:bg-s2 hover:text-ink" aria-label="Cerrar">
                <X className="size-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="flex rounded-xl border border-line p-0.5">
                {(["examen", "tarea"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => {
                      setKind(k);
                      setEffort(k === "examen" ? 250 : 100);
                    }}
                    className={`flex-1 rounded-[9px] py-2 text-[13.5px] capitalize transition-colors ${kind === k ? "bg-s2 text-ink" : "text-faint"}`}
                  >
                    {k}
                  </button>
                ))}
              </div>
              <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className={field} aria-label="Asignatura">
                {subjects.map((s) => (
                  <option key={s.id} value={s.id} className="bg-s2">
                    {s.name}
                  </option>
                ))}
              </select>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título (opcional)" className={field} />
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} aria-label="Fecha" />
              <div>
                <label className="mb-1.5 flex items-center justify-between text-[12.5px] text-faint">
                  Tiempo total estimado <span className="tabular font-mono text-muted">{effort} min</span>
                </label>
                <input type="range" min={30} max={600} step={10} value={effort} onChange={(e) => setEffort(Number(e.target.value))} className="w-full accent-[var(--color-cyan)]" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button onClick={onClose}>Cancelar</Button>
              <Button variant="primary" onClick={submit} disabled={!date}>
                Añadir y replanificar
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
