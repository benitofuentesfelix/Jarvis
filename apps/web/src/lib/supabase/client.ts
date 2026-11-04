"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL, cloudEnabled } from "./config";

let client: SupabaseClient | null = null;

/** The browser client, or null in local mode. */
export function supabaseBrowser(): SupabaseClient | null {
  if (!cloudEnabled()) return null;
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
  return client;
}
