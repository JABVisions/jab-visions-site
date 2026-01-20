import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * IMPORTANT:
 * This file MUST export a singleton Supabase client.
 * Creating multiple clients causes auth lock AbortErrors in dev (and sometimes prod).
 */

let browserClient: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient {
  if (browserClient) return browserClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  browserClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: {
      headers: {
        "X-Client-Info": "jab-visions-board",
      },
    },
  });

  return browserClient;
}
