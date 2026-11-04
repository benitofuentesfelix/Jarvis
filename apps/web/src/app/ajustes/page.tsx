"use client";

import { AlertTriangle, Bell, Link2, Lock, RotateCcw, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { ACTION_POLICY } from "@jarvis/core";
import { useStore } from "@/lib/store";
import { Button, Card, Label, Pill } from "@/components/ui";
import { Skeleton } from "@/components/Skeleton";

const INTEGRATIONS = [
  { id: "google", name: "Google Calendar", detail: "Calendario «JARVIS» propio + lectura de tu agenda personal", status: "pendiente" },
  { id: "notion", name: "Notion", detail: "Solo lectura al principio: analizar sin tocar tu organización", status: "pendiente" },
  { id: "evagd", name: "EVAGD", detail: "Calendario iCal + avisos por correo (sin contraseñas)", status: "por verificar" },
  { id: "push", name: "Notificaciones", detail: "Web Push: funciona con el móvil cerrado", status: "listo para activar" },
];

export default function SettingsPage() {
  const store = useStore();
  const [pushState, setPushState] = useState<string>("comprobando…");
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    setStandalone(window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);
    if (!("Notification" in window)) setPushState("no soportado en este navegador");
    else setPushState(Notification.permission === "granted" ? "activadas" : Notification.permission === "denied" ? "bloqueadas" : "sin activar");
  }, []);

  async function enablePush() {
    try {
      const perm = await Notification.requestPermission();
      setPushState(perm === "granted" ? "activadas" : perm);
      if (perm !== "granted") return;
      const reg = await navigator.serviceWorker.ready;
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) {
        new Notification("JARVIS", { body: "Permiso concedido. Faltan las claves del servidor para enviarte avisos cuando la app esté cerrada." });
        return;
      }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON() }) });
      await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ test: true, endpoint: sub.endpoint }) });
    } catch (e) {
      setPushState("error: " + (e as Error).message);
    }
  }

  if (!store) return <Skeleton />;
  const { data } = store;

  return (
    <div className="space-y-7">
      <header>
        <h1 className="glow-text text-[32px] font-light leading-tight tracking-[-0.02em] sm:text-[38px]">Ajustes</h1>
        <p className="mt-1.5 text-[14px] text-muted">Integraciones, permisos y cómo quieres que JARVIS te interrumpa.</p>
      </header>

      <Card className="!border-amber/30 !bg-amber/[0.04]">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber" />
          <div>
            <p className="text-[14px] font-medium text-ink">Interruptor general</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">En modo solo lectura, JARVIS sigue analizando y avisándote, pero no modifica nada en ningún sitio.</p>
            <div className="mt-3">
              <Button variant={data.readOnly ? "primary" : "ghost"} onClick={() => store.setReadOnly(!data.readOnly)}>
                <Lock className="size-4" /> {data.readOnly ? "Modo solo lectura ACTIVO" : "Activar modo solo lectura"}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <Label right={<Link2 className="size-4 text-faint" />}>Integraciones</Label>
          <div className="space-y-3">
            {INTEGRATIONS.map((i) => (
              <div key={i.id} className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] text-ink">{i.name}</p>
                  <p className="text-[12px] leading-relaxed text-muted">{i.detail}</p>
                </div>
                <Pill tone={i.status === "listo para activar" ? "cyan" : "neutral"}>{i.status}</Pill>
              </div>
            ))}
          </div>
          <p className="mt-4 border-t hairline pt-3 text-[12px] leading-relaxed text-faint">
            Ninguna cuenta se conecta sin que tú autorices la pantalla oficial de cada servicio. Cada integración nueva funciona una semana en modo «propone pero no ejecuta».
          </p>
        </Card>

        <Card>
          <Label right={<Bell className="size-4 text-faint" />}>Notificaciones</Label>
          <p className="text-[13px] leading-relaxed text-muted">
            Estado: <strong className="text-ink">{pushState}</strong>
            {!standalone && <span className="block mt-1.5 text-amber">En iPhone debes añadir JARVIS a la pantalla de inicio (Compartir → Añadir a inicio) antes de activarlas.</span>}
          </p>
          <div className="mt-3">
            <Button variant="primary" onClick={enablePush} disabled={pushState === "activadas" || pushState === "bloqueadas"}>
              <Bell className="size-4" /> Activar notificaciones
            </Button>
          </div>
          <div className="mt-4 space-y-3 border-t hairline pt-4">
            <div>
              <label className="mb-1.5 flex items-center justify-between text-[12.5px] text-muted">
                Máximo de avisos al día <span className="tabular font-mono text-ink">{data.dailyNotifications}</span>
              </label>
              <input type="range" min={1} max={8} value={data.dailyNotifications} onChange={() => {}} className="w-full accent-[var(--color-cyan)]" readOnly />
            </div>
            <p className="text-[12px] text-faint">
              Horas de silencio: {data.quiet.start} – {data.quiet.end}. Solo las urgencias reales (examen mañana sin preparar) rompen el silencio.
            </p>
          </div>
        </Card>
      </div>

      <Card>
        <Label right={<ShieldCheck className="size-4 text-faint" />}>Qué puede hacer JARVIS sin preguntarte</Label>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b hairline text-[11px] uppercase tracking-wider text-faint">
                <th className="pb-2 font-medium">Acción</th>
                <th className="pb-2 font-medium">Permiso</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(ACTION_POLICY).map(([name, p]) => (
                <tr key={name} className="border-b border-line/50 last:border-0">
                  <td className="py-2 pr-4 text-muted">{p.label}</td>
                  <td className="py-2">
                    <Pill tone={p.category === "automatica" ? "good" : p.category === "autorizacion_inicial" ? "cyan" : "amber"}>
                      {p.category === "automatica" ? "automática" : p.category === "autorizacion_inicial" ? "autorización inicial" : "te pregunto cada vez"}
                    </Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <Label>Planificación</Label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Slider label="Duración de cada sesión" value={data.settings.sessionMinutes} min={25} max={90} step={5} unit="min" onChange={(v) => store.updateSettings({ sessionMinutes: v })} />
          <Slider label="Máximo entre semana" value={data.settings.dailyMaxWeekday} min={60} max={300} step={15} unit="min/día" onChange={(v) => store.updateSettings({ dailyMaxWeekday: v })} />
          <Slider label="Máximo fin de semana" value={data.settings.dailyMaxWeekend} min={60} max={360} step={15} unit="min/día" onChange={(v) => store.updateSettings({ dailyMaxWeekend: v })} />
          <Slider label="Cambridge por semana" value={data.settings.cambridgeWeeklyMinutes} min={0} max={420} step={30} unit="min" onChange={(v) => store.updateSettings({ cambridgeWeeklyMinutes: v })} />
          <Slider label="Margen libre cada día para imprevistos" value={data.settings.bufferMinutes ?? 0} min={0} max={90} step={10} unit="min" onChange={(v) => store.updateSettings({ bufferMinutes: v })} />
          <div>
            <p className="mb-1.5 text-[12.5px] text-muted">Tus horas de máxima concentración</p>
            <div className="flex items-center gap-2">
              <input type="time" value={data.settings.peak?.start ?? "16:00"} onChange={(e) => store.updateSettings({ peak: { start: e.target.value, end: data.settings.peak?.end ?? "19:00" } })} className="rounded-xl border border-line bg-white/[0.03] px-2.5 py-1.5 font-mono text-[13px] text-ink" />
              <span className="text-faint">a</span>
              <input type="time" value={data.settings.peak?.end ?? "19:00"} onChange={(e) => store.updateSettings({ peak: { start: data.settings.peak?.start ?? "16:00", end: e.target.value } })} className="rounded-xl border border-line bg-white/[0.03] px-2.5 py-1.5 font-mono text-[13px] text-ink" />
            </div>
            <p className="mt-1.5 text-[11.5px] text-faint">Ahí van los simulacros y los temas difíciles; los repasos ligeros, fuera.</p>
          </div>
          <div>
            <p className="mb-1.5 text-[12.5px] text-muted">Día ligero (mitad de carga)</p>
            <select
              value={data.settings.lightDay ?? -1}
              onChange={(e) => store.updateSettings({ lightDay: Number(e.target.value) < 0 ? undefined : Number(e.target.value) })}
              className="rounded-xl border border-line bg-s2 px-2.5 py-1.5 text-[13px] text-ink"
            >
              <option value={-1}>Ninguno</option>
              {["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"].map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[11.5px] text-faint">Se salta solo si tienes un examen en los dos días siguientes.</p>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between border-t hairline pt-4">
          <p className="text-[12px] text-faint">Volver a los datos de ejemplo originales</p>
          <Button onClick={store.reset}>
            <RotateCcw className="size-4" /> Reiniciar demo
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Slider({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="mb-1.5 flex items-center justify-between text-[12.5px] text-muted">
        {label}{" "}
        <span className="tabular font-mono text-ink">
          {value} {unit}
        </span>
      </label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--color-cyan)]" />
    </div>
  );
}
