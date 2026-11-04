import { sendPush, vapidReady, type StoredSub } from "@/lib/push-server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Local mode (no Supabase): subscriptions live in memory, enough to test the flow.
const memory = new Map<string, StoredSub>();

export async function GET() {
  const sb = await supabaseServer();
  if (!sb) return Response.json({ configured: vapidReady(), subscriptions: memory.size });
  const { count } = await sb.from("push_subscriptions").select("id", { count: "exact", head: true });
  return Response.json({ configured: vapidReady(), subscriptions: count ?? 0 });
}

/** body: { subscription } to subscribe this device, or { test: true, endpoint } to send a test. */
export async function POST(req: Request) {
  if (!vapidReady()) return Response.json({ error: "vapid_not_configured" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { subscription?: StoredSub; test?: boolean; endpoint?: string };
  const sb = await supabaseServer();

  if (body.subscription?.endpoint && body.subscription.keys?.p256dh && body.subscription.keys.auth) {
    const sub = { endpoint: body.subscription.endpoint, keys: { p256dh: body.subscription.keys.p256dh, auth: body.subscription.keys.auth } };
    if (!sb) {
      memory.set(sub.endpoint, sub);
      return Response.json({ ok: true });
    }
    const { error } = await sb
      .from("push_subscriptions")
      .upsert({ endpoint: sub.endpoint, keys: sub.keys, user_agent: req.headers.get("user-agent")?.slice(0, 200) ?? null }, { onConflict: "endpoint" });
    return error ? Response.json({ error: "save_failed" }, { status: 500 }) : Response.json({ ok: true });
  }

  if (body.test && body.endpoint) {
    let sub: StoredSub | undefined = memory.get(body.endpoint);
    if (sb) {
      const { data } = await sb.from("push_subscriptions").select("endpoint, keys").eq("endpoint", body.endpoint).maybeSingle();
      sub = (data as StoredSub | null) ?? undefined;
    }
    if (!sub) return Response.json({ error: "unknown_subscription" }, { status: 404 });
    const r = await sendPush(sub, { title: "JARVIS", body: "Notificaciones activas. Te avisaré solo de lo importante." });
    if (r === "gone") {
      memory.delete(body.endpoint);
      if (sb) await sb.from("push_subscriptions").delete().eq("endpoint", body.endpoint);
    }
    return r === "ok" ? Response.json({ ok: true }) : Response.json({ error: "send_failed" }, { status: 502 });
  }
  return Response.json({ error: "bad_request" }, { status: 400 });
}
