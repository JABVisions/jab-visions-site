import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseServer() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  );
}

export async function GET() {
  const supabase = supabaseServer();

  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;

  if (!user) {
    return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, bio, avatar_url, avatar_path, created_at, updated_at")
    .eq("id", user.id)
    .single();

  if (error) {
    return new Response(JSON.stringify({ ok: false, message: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, profile }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export async function PATCH(req: NextRequest) {
  const supabase = supabaseServer();

  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;

  if (!user) {
    return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const body = await req.json();

    const display_name =
      body?.display_name !== undefined ? String(body.display_name).slice(0, 60) : undefined;

    const username =
      body?.username !== undefined ? String(body.username).trim().toLowerCase().slice(0, 24) : undefined;

    const bio =
      body?.bio !== undefined ? String(body.bio).slice(0, 280) : undefined;

    const avatar_url =
      body?.avatar_url !== undefined ? String(body.avatar_url) : undefined;

    const avatar_path =
      body?.avatar_path !== undefined ? String(body.avatar_path) : undefined;

    const update: any = {};
    if (display_name !== undefined) update.display_name = display_name;
    if (username !== undefined) update.username = username || null;
    if (bio !== undefined) update.bio = bio || null;
    if (avatar_url !== undefined) update.avatar_url = avatar_url || null;
    if (avatar_path !== undefined) update.avatar_path = avatar_path || null;

    const { error } = await supabase.from("profiles").update(update).eq("id", user.id);

    if (error) {
      return new Response(JSON.stringify({ ok: false, message: error.message }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, message: err?.message || "Server error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
