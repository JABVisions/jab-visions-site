// app/api/submit/route.ts
import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // ✅ Require a logged-in Supabase user (Board account)
  const cookieResponse = new Response();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Keep auth cookies in sync if Supabase refreshes them
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieResponse.headers.append(
              "Set-Cookie",
              `${name}=${encodeURIComponent(value)}; Path=${options?.path ?? "/"}${
                options?.maxAge ? `; Max-Age=${options.maxAge}` : ""
              }${options?.expires ? `; Expires=${options.expires.toUTCString()}` : ""}${
                options?.domain ? `; Domain=${options.domain}` : ""
              }${options?.secure ? "; Secure" : ""}${options?.httpOnly ? "; HttpOnly" : ""}${
                options?.sameSite ? `; SameSite=${options.sameSite}` : ""
              }`
            );
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ ok: false, message: "Unauthorized: please log in." }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  // Prefer server-only GAS_URL; fall back to NEXT_PUBLIC_GAS_URL if needed
  const GAS_URL = process.env.GAS_URL || process.env.NEXT_PUBLIC_GAS_URL;
  if (!GAS_URL) {
    return new Response(JSON.stringify({ ok: false, message: "Missing GAS_URL env var" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const form = await req.formData();

    // (Optional but useful) attach user info to the submission
    form.set("supabase_user_id", user.id);
    if (user.email) form.set("supabase_email", user.email);

    // Relay the multipart form directly to Google Apps Script
    const gasRes = await fetch(GAS_URL, { method: "POST", body: form, cache: "no-store" });

    const text = await gasRes.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { ok: gasRes.ok, raw: text };
    }

    // Return upstream response + forward any auth Set-Cookie headers
    const headers = new Headers({ "content-type": "application/json" });

    const setCookie = cookieResponse.headers.get("Set-Cookie");
    if (setCookie) headers.append("Set-Cookie", setCookie);

    return new Response(JSON.stringify(data), {
      status: gasRes.status,
      headers,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, message: String(err?.message || err) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
