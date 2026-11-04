"use client";

import { motion } from "motion/react";
import { Check, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import type { MemoryItem } from "@/lib/demo";
import { ago } from "@/lib/format";
import { Button, Card, Label, Pill } from "@/components/ui";
import { Skeleton } from "@/components/Skeleton";

const KINDS: { id: MemoryItem["kind"]; label: string; help: string }[] = [
  { id: "personal", label: "Personal", help: "Preferencias, horarios y límites" },
  { id: "academica", label: "Académica", help: "Asignaturas, notas y puntos débiles" },
  { id: "proyectos", label: "Proyectos", help: "Cambridge, universidad y proyectos propios" },
  { id: "operativa", label: "Operativa", help: "Estado de las integraciones" },
  { id: "decisiones", label: "Decisiones", help: "Qué decidió JARVIS y por qué" },
];

export default function MemoryPage() {
  const store = useStore();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<MemoryItem["kind"] | "todas">("todas");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

  const list = useMemo(() => {
    if (!store) return [];
    const needle = q.toLowerCase().trim();
    return store.data.memories.filter((m) => (kind === "todas" || m.kind === kind) && (!needle || m.content.toLowerCase().includes(needle)));
  }, [store, q, kind]);

  if (!store) return <Skeleton />;

  function save(m: MemoryItem, content: string) {
    if (!store) return;
    store.setMemory({ ...m, content, confirmed: true });
    setEditing(null);
  }

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="glow-text text-[32px] font-light leading-tight tracking-[-0.02em] sm:text-[38px]">Memoria</h1>
          <p className="mt-1.5 text-[14px] text-muted">Todo lo que JARVIS sabe de ti. Puedes corregirlo o borrarlo cuando quieras.</p>
        </div>
        <Button variant="primary" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> Enseñar algo
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en la memoria…" className="w-full rounded-xl border border-line bg-s1 py-2.5 pl-9 pr-3 text-[14px] text-ink placeholder:text-faint focus:border-line-strong focus:outline-none" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["todas", ...KINDS.map((k) => k.id)] as const).map((k) => (
            <button key={k} onClick={() => setKind(k)} className={`rounded-full border px-3 py-1.5 text-[12.5px] capitalize transition-colors ${kind === k ? "border-line-strong bg-s2 text-ink" : "border-line text-faint hover:text-muted"}`}>
              {k}
            </button>
          ))}
        </div>
      </div>

      {adding && (
        <Card>
          <Label>Nuevo recuerdo</Label>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder="Ej: Los viernes prefiero no estudiar después de las 19:00."
            className="w-full resize-none rounded-xl border border-line bg-s2 px-3 py-2.5 text-[14px] text-ink placeholder:text-faint focus:border-line-strong focus:outline-none"
          />
          <div className="mt-3 flex justify-end gap-2">
            <Button onClick={() => { setAdding(false); setDraft(""); }}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={!draft.trim()}
              onClick={() => {
                store.setMemory({ id: `mem_${Math.random().toString(36).slice(2, 8)}`, kind: "personal", content: draft.trim(), source: "Dicho por ti", confirmed: true, createdAt: new Date().toISOString() });
                store.log("Tú", `Nuevo recuerdo: «${draft.trim().slice(0, 60)}»`);
                setDraft("");
                setAdding(false);
              }}
            >
              Guardar
            </Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {list.map((m) => (
          <motion.div key={m.id} layout className="card p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <Pill tone={m.confirmed ? "neutral" : "amber"}>{m.confirmed ? m.kind : "propuesta de JARVIS"}</Pill>
              <div className="flex items-center gap-1">
                <button onClick={() => { setEditing(m.id); setDraft(m.content); }} className="rounded p-1.5 text-faint transition-colors hover:bg-s2 hover:text-ink" aria-label="Editar">
                  <Pencil className="size-3.5" />
                </button>
                <button onClick={() => store.deleteMemory(m.id)} className="rounded p-1.5 text-faint transition-colors hover:bg-s2 hover:text-bad" aria-label="Borrar">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
            {editing === m.id ? (
              <div>
                <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} className="w-full resize-none rounded-lg border border-line bg-s2 px-2.5 py-2 text-[13.5px] text-ink focus:outline-none" />
                <div className="mt-2 flex justify-end gap-1.5">
                  <button onClick={() => setEditing(null)} className="rounded-lg p-1.5 text-faint hover:text-ink" aria-label="Cancelar">
                    <X className="size-4" />
                  </button>
                  <button onClick={() => save(m, draft)} className="rounded-lg p-1.5 text-good hover:bg-good/10" aria-label="Guardar">
                    <Check className="size-4" />
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-[13.5px] leading-relaxed text-ink">{m.content}</p>
            )}
            <div className="mt-3 flex items-center justify-between border-t hairline pt-2.5 text-[11px] text-faint">
              <span>{m.source}</span>
              <span>{ago(m.createdAt, store.now)}</span>
            </div>
            {!m.confirmed && (
              <div className="mt-2.5 flex gap-2">
                <Button variant="subtle" className="!px-2.5 !py-1 !text-[12px]" onClick={() => store.setMemory({ ...m, confirmed: true })}>
                  Es correcto
                </Button>
                <Button className="!px-2.5 !py-1 !text-[12px]" onClick={() => store.deleteMemory(m.id)}>
                  No es así
                </Button>
              </div>
            )}
          </motion.div>
        ))}
        {list.length === 0 && <p className="py-8 text-center text-[13.5px] text-faint sm:col-span-2">Nada guardado con ese filtro.</p>}
      </div>

      <Card>
        <Label>Cómo funciona</Label>
        <ul className="space-y-1.5 text-[13px] leading-relaxed text-muted">
          <li>• Solo se guarda lo que puede cambiar una decisión futura. Una conversación cualquiera no crea memoria.</li>
          <li>• Lo que JARVIS deduce entra como <strong className="text-amber">propuesta</strong> hasta que tú lo confirmas.</li>
          <li>• Si una fuente oficial (EVAGD) contradice un recuerdo, gana la fuente y el recuerdo se actualiza.</li>
          <li>• Puedes borrar cualquier cosa, y se borra de verdad.</li>
        </ul>
      </Card>
    </div>
  );
}
