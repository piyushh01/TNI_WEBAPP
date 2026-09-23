import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Add them to your .env file."
  );
}

export const supabase = createClient(url, anonKey, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
});
