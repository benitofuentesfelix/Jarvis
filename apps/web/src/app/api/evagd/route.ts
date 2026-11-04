import { readEvagd } from "@/lib/evagd-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const r = await readEvagd();
  return Response.json(r, { status: r.configured && !r.ok ? 502 : 200 });
}
