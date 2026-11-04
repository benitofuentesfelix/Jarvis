"use client";

// Cloud sync of the app state. The state stays on this device first (works offline) and is
// mirrored to Supabase, so the iPhone and the computer see the same plan.
// Conflicts: the newest change wins. The server keeps a weekly copy as backup.

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "./supabase/client";
import type { Persisted } from "./store";

export interface SyncState {
  mode: "local" | "signed_out" | "cloud";
  status: "idle" | "syncing" | "ok" | "error";
  at?: string;
  email?: string;
}

const META = "jarvis.sync";
interface Meta {
  /** Device time of the last local change. */
  changedAt: number;
  /** Server time of the copy we last pushed or pulled. */
  syncedAt: number;
}

function readMeta(): Meta {
  try {
    const m = JSON.parse(localStorage.getItem(META) ?? "null") as Meta | null;
    if (m && typeof m.changedAt === "number") return m;
  } catch {
    /* ignore */
  }
  return { changedAt: 0, syncedAt: 0 };
}
function writeMeta(m: Meta) {
  try {
    localStorage.setItem(META, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

export function useCloudSync(data: Persisted | null, replace: (p: Persisted) => void): SyncState {
  const [state, setState] = useState<SyncState>({ mode: "local", status: "idle" });
  const uid = useRef<string | null>(null);
  const lastSig = useRef<string>("");
  const ready = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Persisted | null>(null);
  latest.current = data;
  const loaded = !!data;

  async function push(d: Persisted) {
    const sb = supabaseBrowser();
    if (!sb || !uid.current) return;
    setState((s) => ({ ...s, status: "syncing" }));
    const { data: row, error } = await sb
      .from("app_state")
      .upsert({ user_id: uid.current, data: d, device: deviceName() }, { onConflict: "user_id" })
      .select("updated_at")
      .single();
    if (error) {
      setState((s) => ({ ...s, status: "error" }));
      return;
    }
    const m = readMeta();
    writeMeta({ ...m, syncedAt: Date.parse(row.updated_at) });
    setState((s) => ({ ...s, status: "ok", at: row.updated_at }));
  }

  /** Pull the cloud copy; take it if it is newer than our last local change. */
  async function pull(initial: boolean) {
    const sb = supabaseBrowser();
    if (!sb || !uid.current) return;
    setState((s) => ({ ...s, status: "syncing" }));
    const { data: row, error } = await sb.from("app_state").select("data, updated_at").eq("user_id", uid.current).maybeSingle();
    if (error) {
      setState((s) => ({ ...s, status: "error" }));
      return;
    }
    const m = readMeta();
    const remoteAt = row ? Date.parse(row.updated_at) : 0;
    const remote = row?.data as Persisted | undefined;
    if (remote?.v === 2 && remoteAt > m.changedAt && remoteAt !== m.syncedAt) {
      lastSig.current = JSON.stringify(remote);
      writeMeta({ changedAt: remoteAt, syncedAt: remoteAt });
      replace(remote);
      setState((s) => ({ ...s, status: "ok", at: row!.updated_at }));
    } else if (initial || m.changedAt > m.syncedAt) {
      const d = latest.current;
      if (d) {
        lastSig.current = JSON.stringify(d);
        await push(d);
      }
    } else {
      setState((s) => ({ ...s, status: "ok", at: row?.updated_at ?? s.at }));
    }
  }

  // Start: find the session, then reconcile with the cloud copy.
  useEffect(() => {
    if (!loaded) return;
    const sb = supabaseBrowser();
    if (!sb) return;
    let stop = false;
    (async () => {
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (stop) return;
      if (!user) {
        setState({ mode: "signed_out", status: "idle" });
        return;
      }
      uid.current = user.id;
      setState({ mode: "cloud", status: "syncing", email: user.email ?? undefined });
      await pull(true);
      ready.current = true;
    })();
    const onVisible = () => {
      if (document.visibilityState === "visible" && ready.current) void pull(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    const every = setInterval(() => ready.current && void pull(false), 5 * 60_000);
    return () => {
      stop = true;
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(every);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // Local change: remember when, and push a few seconds later.
  useEffect(() => {
    if (!data || !ready.current) return;
    const sig = JSON.stringify(data);
    if (sig === lastSig.current) return;
    lastSig.current = sig;
    writeMeta({ ...readMeta(), changedAt: Date.now() });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => latest.current && void push(latest.current), 3000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return state;
}

function deviceName() {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "Navegador";
}

export async function signOut() {
  const sb = supabaseBrowser();
  if (!sb) return;
  await sb.auth.signOut();
  try {
    localStorage.removeItem(META);
  } catch {
    /* ignore */
  }
  location.replace("/entrar");
}
