import webpush from "web-push";

export const runtime = "nodejs";

// Phase 1: subscriptions are kept in memory so the flow can be tested end to end
// on a deployed instance. Phase 2 stores them in the push_subscriptions table.
const subscriptions = new Map<string, webpush.PushSubscription>();

function configured() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:jarvis@example.com", pub, priv);
  return true;
}

export async function GET() {
  return Response.json({ configured: configured(), subscriptions: subscriptions.size });
}

/** body: { subscription } to subscribe, or { test: true, endpoint } to send a test notification. */
export async function POST(req: Request) {
  if (!configured()) return Response.json({ error: "vapid_not_configured" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as {
    subscription?: webpush.PushSubscription;
    test?: boolean;
    endpoint?: string;
    title?: string;
    body?: string;
  };

  if (body.subscription?.endpoint) {
    subscriptions.set(body.subscription.endpoint, body.subscription);
    return Response.json({ ok: true });
  }

  if (body.test && body.endpoint) {
    const sub = subscriptions.get(body.endpoint);
    if (!sub) return Response.json({ error: "unknown_subscription" }, { status: 404 });
    try {
      await webpush.sendNotification(
        sub,
        JSON.stringify({
          title: body.title ?? "JARVIS",
          body: body.body ?? "Notificaciones activas. Te avisaré solo de lo importante.",
          url: "/",
        }),
      );
      return Response.json({ ok: true });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) subscriptions.delete(body.endpoint);
      return Response.json({ error: "send_failed", status }, { status: 502 });
    }
  }
  return Response.json({ error: "bad_request" }, { status: 400 });
}
