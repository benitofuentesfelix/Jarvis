import "server-only";
import { itemsFromIcs, parseIcs } from "@jarvis/core";
import { subjects, TZ } from "./demo";
import type { EvagdResult } from "./engine";

/**
 * Reads the student's EVAGD calendar export. The URL carries a private token, so it lives
 * only in the server environment (EVAGD_ICAL_URL) and never reaches the browser.
 * Read-only by nature: Moodle's export cannot change anything in EVAGD.
 */
function feedUrl(): URL | null {
  const raw = process.env.EVAGD_ICAL_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw.replace(/&amp;/g, "&"));
    // Always "recent and upcoming", so the feed keeps moving forward instead of a fixed range.
    url.searchParams.set("preset_what", "all");
    url.searchParams.set("preset_time", "recentupcoming");
    return url;
  } catch {
    return null;
  }
}

export async function readEvagd(now = new Date()): Promise<EvagdResult> {
  const url = feedUrl();
  if (!url) return { configured: false };
  try {
    const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "JARVIS/1.0 (calendario personal)" }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { configured: true, ok: false, error: `EVAGD respondió ${res.status}` };
    const text = await res.text();
    if (!text.includes("BEGIN:VCALENDAR")) return { configured: true, ok: false, error: "EVAGD no devolvió un calendario (¿ha caducado el enlace?)" };
    return { configured: true, ok: true, syncedAt: now.toISOString(), items: itemsFromIcs(parseIcs(text, TZ), subjects, now) };
  } catch (e) {
    return { configured: true, ok: false, error: e instanceof Error ? e.message : "error de red" };
  }
}
