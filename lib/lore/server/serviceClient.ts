// File: lib/lore/server/serviceClient.ts
// Server-only Supabase access for the Lore Library. Two clients on purpose:
//  - a service-role client (bypasses RLS) for Visionary AI retrieval and for
//    admin API routes' actual reads/writes, once the caller is verified;
//  - the caller's own cookie-bound session for verifying *who* is asking, via
//    the existing public.is_jab_admin() function from board_rooms.sql.
// Never import this from a client component — the service-role key must stay
// on the server.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";
import { getSupabasePublicUrl } from "@/lib/supabase/config";

let cached: SupabaseClient | null = null;

/** The privileged client. Returns null if no service-role key is configured. */
export function loreServiceClient(): SupabaseClient | null {
  if (cached) return cached;
  const url = getSupabasePublicUrl();
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SB_SECRET_KEY;
  if (!url || !serviceKey) return null;
  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/** True if the current request's cookie session belongs to a JAB admin. */
export async function isRequestFromLoreAdmin(): Promise<boolean> {
  try {
    const supabase = supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    const { data, error } = await supabase.rpc("is_jab_admin");
    if (error) return false;
    return Boolean(data);
  } catch {
    return false;
  }
}
