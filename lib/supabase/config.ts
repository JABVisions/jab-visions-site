export function getSupabasePublicUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || "";
}

export function getSupabaseAnonKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    ""
  );
}

export function getSupabasePublicConfig() {
  const url = getSupabasePublicUrl();
  const key = getSupabaseAnonKey();
  return {
    url,
    key,
    configured: Boolean(url && key),
  };
}

export function supabaseAuthCookieName(supabaseUrl: string) {
  try {
    const host = new URL(supabaseUrl).hostname.split(".")[0];
    return host ? `sb-${host}-auth-token` : "sb-auth-token";
  } catch {
    return "sb-auth-token";
  }
}
