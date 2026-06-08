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

function titleCase(input: string) {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function deriveDisplayName(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}) {
  const metadata = user.user_metadata ?? {};
  const metadataName =
    (typeof metadata.display_name === "string" && metadata.display_name.trim()) ||
    (typeof metadata.full_name === "string" && metadata.full_name.trim()) ||
    (typeof metadata.name === "string" && metadata.name.trim()) ||
    "";

  if (metadataName) return metadataName.slice(0, 60);

  const emailPrefix = String(user.email || "")
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .trim();

  return titleCase(emailPrefix).slice(0, 60) || "Board User";
}

function deriveUsername(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}) {
  const metadata = user.user_metadata ?? {};
  const metadataUsername =
    typeof metadata.username === "string" && metadata.username.trim()
      ? metadata.username.trim()
      : "";
  const raw = metadataUsername || String(user.email || "").split("@")[0].trim();
  const username = raw.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);
  return username || null;
}

function cleanDisplayName(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 60) : "";
}

function cleanUsername(value: unknown) {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/^@+/, "").replace(/[^a-z0-9_]/g, "").slice(0, 24)
    : "";
}

function isDefaultDisplayName(value: string) {
  return value.trim().toLowerCase() === "board user";
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
    .select("id, username, display_name, bio, avatar_url, avatar_path, board_style, created_at, updated_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    return new Response(JSON.stringify({ ok: false, message: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  if (!profile) {
    const payload = {
      id: user.id,
      username: deriveUsername(user),
      display_name: deriveDisplayName(user),
    };

    const { data: created, error: createError } = await supabase
      .from("profiles")
      .upsert(payload, { onConflict: "id" })
      .select("id, username, display_name, bio, avatar_url, avatar_path, board_style, created_at, updated_at")
      .single();

    if (createError) {
      return new Response(JSON.stringify({ ok: false, message: createError.message }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, profile: created }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  if (!profile.username || !profile.display_name) {
    const repair = {
      id: user.id,
      username: profile.username || deriveUsername(user),
      display_name: profile.display_name || deriveDisplayName(user),
    };

    const { data: repaired } = await supabase
      .from("profiles")
      .upsert(repair, { onConflict: "id" })
      .select("id, username, display_name, bio, avatar_url, avatar_path, board_style, created_at, updated_at")
      .single();

    if (repaired) {
      return new Response(JSON.stringify({ ok: true, profile: repaired }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
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

    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("username, display_name, bio, board_style")
      .eq("id", user.id)
      .maybeSingle();

    const existingBoardStyle =
      existingProfile?.board_style && typeof existingProfile.board_style === "object"
        ? existingProfile.board_style
        : {};

    const existingDisplayName = cleanDisplayName(existingProfile?.display_name);
    const existingUsername = cleanUsername(existingProfile?.username);

    const incomingDisplayName =
      body?.display_name !== undefined ? cleanDisplayName(body.display_name) : undefined;

    const incomingUsername =
      body?.username !== undefined ? cleanUsername(body.username) : undefined;

    const bio =
      body?.bio !== undefined ? String(body.bio).slice(0, 280) : undefined;

    const avatar_url =
      body?.avatar_url !== undefined ? String(body.avatar_url) : undefined;

    const avatar_path =
      body?.avatar_path !== undefined ? String(body.avatar_path) : undefined;

    const board_style =
      body?.board_style !== undefined && body?.board_style && typeof body.board_style === "object"
        ? body.board_style
        : undefined;

    let mergedBoardStyle = undefined;
    if (board_style !== undefined) {
      const sanitizedBoardStyle = { ...board_style };

      if (
        "displayName" in sanitizedBoardStyle &&
        existingDisplayName &&
        (!cleanDisplayName(sanitizedBoardStyle.displayName) ||
          isDefaultDisplayName(cleanDisplayName(sanitizedBoardStyle.displayName)))
      ) {
        sanitizedBoardStyle.displayName = existingDisplayName;
      }

      mergedBoardStyle = {
        ...existingBoardStyle,
        ...sanitizedBoardStyle,
      };
    }

    const update: any = { id: user.id };
    if (incomingDisplayName !== undefined) {
      if (incomingDisplayName && (!isDefaultDisplayName(incomingDisplayName) || !existingDisplayName)) {
        update.display_name = incomingDisplayName;
      } else if (existingDisplayName) {
        update.display_name = existingDisplayName;
      } else {
        update.display_name = deriveDisplayName(user);
      }
    } else if (existingDisplayName) {
      update.display_name = existingDisplayName;
    } else {
      update.display_name = deriveDisplayName(user);
    }

    if (incomingUsername !== undefined) {
      update.username = incomingUsername || existingUsername || deriveUsername(user);
    } else {
      update.username = existingUsername || deriveUsername(user);
    }

    if (bio !== undefined) update.bio = bio || null;
    if (avatar_url !== undefined) update.avatar_url = avatar_url || null;
    if (avatar_path !== undefined) update.avatar_path = avatar_path || null;
    if (mergedBoardStyle !== undefined) update.board_style = mergedBoardStyle;

    const { error } = await supabase
      .from("profiles")
      .upsert(update, { onConflict: "id" });

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
