import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Supabase server helper */
function supabaseServer() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) =>
          cs.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
      },
    }
  );
}

/* ─────────────────────────────
   GET: Fetch board feed
   ───────────────────────────── */
export async function GET() {
  const supabase = supabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response(
      JSON.stringify({ ok: false, message: "Unauthorized" }),
      { status: 401, headers: { "content-type": "application/json" } }
    );
  }

  const { data, error } = await supabase
    .from("posts")
    .select("id, content, image_url, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return new Response(
      JSON.stringify({ ok: false, message: error.message }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  return new Response(JSON.stringify({ ok: true, posts: data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/* ─────────────────────────────
   POST: Create board post
   ───────────────────────────── */
export async function POST(req: NextRequest) {
  const supabase = supabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response(
      JSON.stringify({ ok: false, message: "Unauthorized" }),
      { status: 401, headers: { "content-type": "application/json" } }
    );
  }

  try {
    const body = await req.json();

    const content = String(body?.content || "").trim();
    const image_url = body?.image_url ? String(body.image_url) : null;
    const image_path = body?.image_path ? String(body.image_path) : null;

    // Require at least text OR image
    if (!content && !image_url) {
      return new Response(
        JSON.stringify({
          ok: false,
          message: "Post must include text or an image",
        }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    const { error } = await supabase.from("posts").insert({
      user_id: user.id,
      content: content || "",
      image_url,
      image_path,
    });

    if (error) {
      return new Response(
        JSON.stringify({ ok: false, message: error.message }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, message: err?.message || "Server error" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}
