import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { publicOrbAvatarUrl } from "@/lib/board/friendZoneOrbs";

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
        setAll: (cs) =>
          cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  );
}

function cleanText(value: unknown, max = 80) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(req: Request) {
  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  if (body.visible === false) {
    return Response.json({ ok: true, skipped: true });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, board_style")
    .eq("id", user.id)
    .maybeSingle();

  const existingStyle =
    profile?.board_style && typeof profile.board_style === "object"
      ? (profile.board_style as Record<string, unknown>)
      : {};

  if (existingStyle.presenceOnline === false || existingStyle.presenceScope === "hidden") {
    return Response.json({ ok: true, skipped: true });
  }

  const lastSeenAt = new Date().toISOString();
  const username =
    cleanText(body.username, 24) ||
    cleanText(profile?.username, 24) ||
    String(user.email || "").split("@")[0];
  const displayName =
    cleanText(body.displayName, 60) ||
    cleanText(profile?.display_name, 60) ||
    username ||
    "Board User";
  const avatarUrl = publicOrbAvatarUrl(body.avatarUrl, profile?.avatar_url);

  const nextStyle = {
    ...existingStyle,
    lastSeenAt,
    presenceOnline: true,
  };

  await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        username: profile?.username || username || null,
        display_name: profile?.display_name || displayName,
        avatar_url: profile?.avatar_url || (avatarUrl.startsWith("http") ? avatarUrl : null),
        board_style: nextStyle,
        updated_at: lastSeenAt,
      },
      { onConflict: "id" }
    );

  const presenceRow = {
    user_id: user.id,
    username: username || null,
    display_name: displayName,
    avatar_url: avatarUrl.startsWith("http") || avatarUrl.startsWith("/") ? avatarUrl : null,
    last_seen_at: lastSeenAt,
    visible: true,
  };

  const { error: presenceError } = await supabase.from("board_presence").upsert(presenceRow, {
    onConflict: "user_id",
  });

  const presenceMeta = {
    presence: true,
    source: "board_presence",
    lastSeenAt,
    authorUsername: username,
    authorName: displayName,
    authorAvatar: avatarUrl,
  };

  if (presenceError) {
    const { data: existing } = await supabase
      .from("board_activity")
      .select("id")
      .eq("user_id", user.id)
      .contains("meta", { presence: true })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      await supabase
        .from("board_activity")
        .update({
          created_at: lastSeenAt,
          meta: presenceMeta,
        })
        .eq("id", existing.id)
        .eq("user_id", user.id);
    } else {
      const payload = {
        scope: "global",
        user_id: user.id,
        kind: "system",
        title: "",
        body: "",
        href: null,
        image_url: null,
        meta: presenceMeta,
      };
      const { error: insertError } = await supabase.from("board_activity").insert(payload);
      if (insertError) {
        await supabase.from("board_activity").insert({ ...payload, kind: "status" });
      }
    }
  }

  return Response.json({ ok: true, lastSeenAt });
}
