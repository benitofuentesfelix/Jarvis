// Supabase is optional: without these variables JARVIS runs on this device only (local mode).
// The publishable key is public by design; access to data is enforced by Row Level Security.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
export const cloudEnabled = () => !!(SUPABASE_URL && SUPABASE_KEY);
