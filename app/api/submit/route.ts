// app/api/submit/route.ts
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Prefer server-only GAS_URL; fall back to NEXT_PUBLIC_GAS_URL if needed
  const GAS_URL = process.env.GAS_URL || process.env.NEXT_PUBLIC_GAS_URL;
  if (!GAS_URL) {
    return new Response(JSON.stringify({ ok: false, message: 'Missing GAS_URL env var' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  try {
    const form = await req.formData();

    // Relay the multipart form directly to Google Apps Script
    const gasRes = await fetch(GAS_URL, { method: 'POST', body: form, cache: 'no-store' });

    const text = await gasRes.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { ok: gasRes.ok, raw: text }; }

    return new Response(JSON.stringify(data), {
      status: gasRes.status,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, message: String(err?.message || err) }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
