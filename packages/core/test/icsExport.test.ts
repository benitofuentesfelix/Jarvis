import { describe, expect, it } from "vitest";
import { buildIcs, icsEscape, icsFold, parseIcs, zoned } from "../src";

const TZ = "Atlantic/Canary";

describe("calendario suscrito", () => {
  it("escapa comas, puntos y coma y saltos de línea", () => {
    expect(icsEscape("Mates, tema 3; derivadas\nrepaso")).toBe("Mates\\, tema 3\; derivadas\\nrepaso");
  });

  it("pliega las líneas largas sin romper caracteres", () => {
    const line = "DESCRIPTION:" + "ñ".repeat(60);
    const folded = icsFold(line);
    for (const l of folded.split("\r\n")) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });

  it("genera un calendario que se vuelve a leer igual", () => {
    const start = zoned(2026, 11, 6, 16, 0, TZ);
    const ics = buildIcs({
      name: "JARVIS",
      now: start,
      events: [
        { uid: "b1@jarvis", title: "Matemáticas: derivadas, práctica", description: "Práctica deliberada · 50 min", start, end: new Date(start.getTime() + 50 * 60_000), alarmMinutes: 10 },
        { uid: "ex1@jarvis", title: "Examen: Economía UD2", start, allDayDate: "2026-11-12" },
      ],
    });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261112\r\nDTEND;VALUE=DATE:20261113");
    expect(ics).toContain("TRIGGER:-PT10M");
    const back = parseIcs(ics, TZ);
    expect(back).toHaveLength(2);
    expect(back[0]!.summary).toBe("Matemáticas: derivadas, práctica");
    expect(back[0]!.start.toISOString()).toBe(start.toISOString());
    expect(back[1]!.allDay).toBe(true);
  });
});
