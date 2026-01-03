// app/api/health/route.ts
export const runtime = 'nodejs';

export async function GET() {
  return Response.json({
    ok: true,
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasSupabaseAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    hasGasUrl: !!process.env.GAS_URL || !!process.env.NEXT_PUBLIC_GAS_URL,
  });
}
