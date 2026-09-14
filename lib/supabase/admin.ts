import "server-only";

import { createClient } from "@supabase/supabase-js";

// This project does not yet have generated Supabase database types. Keep the
// admin client untyped at this boundary so new server-only tables remain usable.
let cachedAdmin: any = null;

/** Server-only Supabase client for payment records that clients may not mutate. */
export function getSupabaseAdmin(): any {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) return null;
  if (cachedAdmin) return cachedAdmin;

  cachedAdmin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedAdmin;
}
