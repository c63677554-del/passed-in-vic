import { createClient } from "@supabase/supabase-js";

// Browser-safe client. Uses the PUBLIC anon key, which is gated by RLS
// (public read-only). NEVER put the service-role key in a NEXT_PUBLIC_* var.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY in web/.env.local"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
