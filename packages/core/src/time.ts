// Small timezone-aware helpers built on Intl, so the planner places blocks in the
// student's local time (Atlantic/Canary by default) regardless of server timezone.

export const MINUTE = 60_000;
export const DAY = 86_400_000;

interface Parts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localParts(date: Date, tz: string): Parts {
  const out: Record<string, string> = {};
  for (const p of fmt(tz).formatToParts(date)) out[p.type] = p.value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour),
    minute: Number(out.minute),
    weekday: WEEKDAYS[out.weekday ?? "Sun"] ?? 0,
  };
}

/** Offset (minutes) of tz at the given instant, e.g. +60 for UTC+1. */
function offsetMinutes(date: Date, tz: string): number {
  const p = localParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((asUtc - Math.floor(date.getTime() / MINUTE) * MINUTE) / MINUTE);
}

/** Build the instant for a local wall-clock time in tz. */
export function zoned(year: number, month: number, day: number, hour: number, minute: number, tz: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const off1 = offsetMinutes(new Date(guess), tz);
  const candidate = guess - off1 * MINUTE;
  const off2 = offsetMinutes(new Date(candidate), tz);
  return new Date(guess - off2 * MINUTE);
}

/** Local midnight of the day containing `date`. */
export function startOfLocalDay(date: Date, tz: string): Date {
  const p = localParts(date, tz);
  return zoned(p.year, p.month, p.day, 0, 0, tz);
}

/** Local midnight `n` days after the local day containing `date`. */
export function addLocalDays(date: Date, n: number, tz: string): Date {
  const p = localParts(date, tz);
  const base = new Date(Date.UTC(p.year, p.month - 1, p.day + n));
  return zoned(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), 0, 0, tz);
}

export function atLocalTime(day: Date, hhmm: string, tz: string): Date {
  const p = localParts(day, tz);
  const [h, m] = hhmm.split(":").map(Number);
  return zoned(p.year, p.month, p.day, h ?? 0, m ?? 0, tz);
}

export function localDayKey(date: Date, tz: string): string {
  const p = localParts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Whole local days from `a`'s day to `b`'s day (b - a). */
export function localDaysBetween(a: Date, b: Date, tz: string): number {
  const ka = localDayKey(a, tz).split("-").map(Number);
  const kb = localDayKey(b, tz).split("-").map(Number);
  const da = Date.UTC(ka[0]!, ka[1]! - 1, ka[2]!);
  const db = Date.UTC(kb[0]!, kb[1]! - 1, kb[2]!);
  return Math.round((db - da) / DAY);
}

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}
