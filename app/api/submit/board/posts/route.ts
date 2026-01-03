import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const GAS_URL = process.env.GAS_URL || process.env.NEXT_PUBLIC_GAS_URL;
  if (!GAS_URL) {
    return new Response(JSON.stringify({ ok: false, message: "Missing GAS_URL env var" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  // We’ll call GAS with an action so it knows what to do
  const url = `${GAS_URL}?action=board_list`;

  const gasRes = await fetch(url, { method: "GET", cache: "no-store" });
  const text = await gasRes.text();

  let data: any;
  try { data = JSON.parse(text); } catch { data = { ok: gasRes.ok, raw: text }; }

  return new Response(JSON.stringify(data), {
    status: gasRes.status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  const GAS_URL = process.env.GAS_URL || process.env.NEXT_PUBLIC_GAS_URL;
  if (!GAS_URL) {
    return new Response(JSON.stringify({ ok: false, message: "Missing GAS_URL env var" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const { title, body } = await req.json();

    if (!title || !body) {
      return new Response(JSON.stringify({ ok: false, message: "Missing title/body" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    // Send to GAS with an action so it routes to the Board sheet
    const gasRes = await fetch(GAS_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "board_post", title, body }),
      cache: "no-store",
    });

    const text = await gasRes.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { ok: gasRes.ok, raw: text }; }

    return new Response(JSON.stringify(data), {
      status: gasRes.status,
      headers: { "content-type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, message: String(err?.message || err) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
