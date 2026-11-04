import { TZ } from "./demo";

const f = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("es-ES", { timeZone: TZ, ...opts });
const hmF = f({ hour: "2-digit", minute: "2-digit" });
const dayF = f({ weekday: "long", day: "numeric", month: "long" });
const shortDayF = f({ weekday: "short", day: "numeric" });
const dateF = f({ day: "numeric", month: "short" });

export const hm = (d: string | Date) => hmF.format(new Date(d));
export const longDay = (d: string | Date) => {
  const s = dayF.format(new Date(d));
  return s.charAt(0).toUpperCase() + s.slice(1);
};
export const shortDay = (d: string | Date) => shortDayF.format(new Date(d));
export const shortDate = (d: string | Date) => dateF.format(new Date(d));

export function minutesBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 60_000);
}

export function relDays(n: number) {
  if (n <= 0) return "hoy";
  if (n === 1) return "mañana";
  return `en ${n} días`;
}

export function ago(iso: string, now: Date) {
  const m = Math.round((now.getTime() - Date.parse(iso)) / 60_000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} d`;
}

export function fmtMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export function greeting(now: Date) {
  const h = Number(f({ hour: "2-digit", hourCycle: "h23" }).format(now));
  if (h < 6) return "Buenas noches";
  if (h < 13) return "Buenos días";
  if (h < 21) return "Buenas tardes";
  return "Buenas noches";
}

export const subjectColor = (token: string) => `var(--color-${token})`;
