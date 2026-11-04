import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL, cloudEnabled } from "@/lib/supabase/config";

const PUBLIC = ["/entrar", "/auth/"];

/**
 * With Supabase configured, every page and API route needs a session.
 * Signing up is limited on the database side to the owner's email.
 */
export async function middleware(req: NextRequest) {
  if (!cloudEnabled()) return NextResponse.next();

  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) req.cookies.set(name, value);
        res = NextResponse.next({ request: req });
        for (const { name, value, options } of list) res.cookies.set(name, value, options);
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = req.nextUrl.pathname;
  if (user || PUBLIC.some((p) => path.startsWith(p))) return res;
  if (path.startsWith("/api/cron/")) return res; // protected by CRON_SECRET inside the route
  if (path.startsWith("/api/")) return NextResponse.json({ error: "no_session" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/entrar";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icons/|sw.js|manifest.webmanifest|favicon.ico).*)"],
};
