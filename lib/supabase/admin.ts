import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  const missing = [
    !url ? "NEXT_PUBLIC_SUPABASE_URL" : null,
    !secret ? "SUPABASE_SECRET_KEY" : null,
  ].filter(Boolean);
  if (missing.length) throw new Error(`Missing Supabase environment variable(s): ${missing.join(", ")}`);
  return createClient(url!, secret!, { auth: { persistSession: false, autoRefreshToken: false } });
}
