import "server-only";
import webpush from "web-push";

export interface StoredSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export function vapidReady() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:jarvis@example.com", pub, priv);
  return true;
}

/** Sends one notification. Returns "gone" when the device unsubscribed (delete it). */
export async function sendPush(sub: StoredSub, msg: { title: string; body: string; url?: string; tag?: string }): Promise<"ok" | "gone" | "error"> {
  try {
    await webpush.sendNotification(sub, JSON.stringify({ url: "/", ...msg }), { TTL: 60 * 60 });
    return "ok";
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    return status === 404 || status === 410 ? "gone" : "error";
  }
}
