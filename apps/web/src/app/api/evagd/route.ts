import { readEvagd } from "@/lib/evagd-server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let url: string | null = null;
  const sb = await supabaseServer();
  if (sb) {
    const { data } = await sb.rpc("jarvis_my_evagd_url");
    url = typeof data === "string" ? data : null;
  }
  const r = await readEvagd(new Date(), url);
  return Response.json(r, { status: r.configured && !r.ok ? 502 : 200 });
}
