// Builds the subscribed calendar (RFC 5545) that phones and Google Calendar read.
// Read-only by nature: subscribers download it, they never write back.

export interface CalEvent {
  uid: string;
  title: string;
  description?: string;
  start: Date;
  end?: Date;
  /** All-day event on the local date given as YYYY-MM-DD. */
  allDayDate?: string;
  /** Minutes before start for a reminder. */
  alarmMinutes?: number;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const icsUtc = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

export function icsEscape(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Folds lines at 75 octets (UTF-8 aware), as RFC 5545 requires. */
export function icsFold(line: string) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let size = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (size + b > limit) {
      out.push(cur);
      cur = "";
      size = 0;
    }
    cur += ch;
    size += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function buildIcs(args: { name: string; now: Date; events: CalEvent[] }): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//JARVIS//Plan de estudio//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(args.name)}`,
    "X-WR-TIMEZONE:Atlantic/Canary",
    "REFRESH-INTERVAL;VALUE=DURATION:PT30M",
    "X-PUBLISHED-TTL:PT30M",
  ];
  const stamp = icsUtc(args.now);
  for (const e of args.events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${stamp}`);
    if (e.allDayDate) {
      const d = e.allDayDate.replace(/-/g, "");
      const next = new Date(Date.UTC(+e.allDayDate.slice(0, 4), +e.allDayDate.slice(5, 7) - 1, +e.allDayDate.slice(8, 10) + 1));
      lines.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next.getUTCFullYear()}${pad(next.getUTCMonth() + 1)}${pad(next.getUTCDate())}`);
    } else {
      lines.push(`DTSTART:${icsUtc(e.start)}`, `DTEND:${icsUtc(e.end ?? e.start)}`);
    }
    lines.push(`SUMMARY:${icsEscape(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${icsEscape(e.description)}`);
    lines.push("TRANSP:" + (e.allDayDate ? "TRANSPARENT" : "OPAQUE"));
    if (e.alarmMinutes !== undefined && !e.allDayDate) {
      lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(e.title)}`, `TRIGGER:-PT${e.alarmMinutes}M`, "END:VALARM");
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(icsFold).join("\r\n") + "\r\n";
}
