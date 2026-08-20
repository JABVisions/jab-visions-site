import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * IMPORTANT:
 * This file MUST export a singleton Supabase client.
 * Creating multiple clients causes auth lock AbortErrors in dev (and sometimes prod).
 */

let browserClient: SupabaseClient | null = null;
const authLocks = new Map<string, Promise<unknown>>();
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SUPABASE_ANON_KEY = "local-board-guest";

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  );
}

async function runWithBrowserAuthLock<T>(
  name: string,
  _acquireTimeout: number,
  fn: () => Promise<T>
): Promise<T> {
  const previous = authLocks.get(name) ?? Promise.resolve();

  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });

  authLocks.set(
    name,
    previous
      .catch(() => undefined)
      .then(() => current)
  );

  await previous.catch(() => undefined);

  try {
    return await fn();
  } finally {
    release();
    if (authLocks.get(name) === current) {
      authLocks.delete(name);
    }
  }
}

export function supabaseBrowser(): SupabaseClient {
  if (browserClient) return browserClient;

  // Keep local/demo Board pages usable when a Supabase project has not been
  // connected yet. Requests to this fallback fail closed, so it grants no
  // remote data access or authenticated permissions.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || LOCAL_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    LOCAL_SUPABASE_ANON_KEY;

  browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      lock: runWithBrowserAuthLock,
    },
    global: {
      headers: {
        "X-Client-Info": "jab-visions-board",
      },
    },
  });

  return browserClient;
}
