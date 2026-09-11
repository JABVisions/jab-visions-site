// Single source of truth for "is a Supabase project linked yet?".
//
// Board is local-first: the UI has to stay browsable before anyone pastes
// credentials, so every surface asks here instead of asserting the environment
// variables are present. Reads nothing but `process.env`, so this is safe to
// import from client components, route handlers, and middleware alike.

export const SUPABASE_SETUP_HINT =
  "Supabase is not connected. Copy NEXT_PUBLIC_SUPABASE_URL and " +
  "NEXT_PUBLIC_SUPABASE_ANON_KEY from Supabase Dashboard → Project Settings → " +
  "API into .env.local, then restart the development server. See README.md.";

export function supabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || "";
}

/** The browser-safe key. Never a service_role / sb_secret_ key. */
export function supabasePublishableKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    ""
  );
}

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl() && supabasePublishableKey());
}

/** Credentials for a server/route client, or null when no project is linked. */
export function supabaseCredentials() {
  const url = supabaseUrl();
  const key = supabasePublishableKey();
  return url && key ? { url, key } : null;
}

/**
 * The response an API route returns when no project is linked. 503 rather than
 * 500: the request was fine, the backend just isn't wired up yet. `extra` lets
 * a route keep its usual success shape (`items: []`, `posts: []`) so clients
 * parse it without a special case.
 */
export function supabaseNotConfiguredResponse(
  extra?: Record<string, unknown>,
  status = 503
) {
  return Response.json(
    { ok: false, message: SUPABASE_SETUP_HINT, ...extra },
    { status }
  );
}
