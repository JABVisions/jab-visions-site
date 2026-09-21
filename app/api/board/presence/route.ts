import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { hostedOrbAvatarUrl } from "@/lib/board/friendZoneOrbs";
import { pickBoardDisplayName } from "@/lib/board/boardAuthor";
import { publishFriendZoneDirectory } from "@/lib/board/friendZoneDirectory";

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

  const username =
    cleanText(body.username, 24) ||
    cleanText(profile?.username, 24) ||
    String(user.email || "")
      .split("@")[0]
      .replace(/[^a-z0-9_]/gi, "")
      .slice(0, 24);
  const displayName =
    pickBoardDisplayName(profile?.display_name, body.displayName, profile?.username, username) ||
    username ||
    "Board User";
  const avatarUrl = hostedOrbAvatarUrl(
    profile?.avatar_url,
    existingStyle.avatarUrl,
    existingStyle.avatarPath,
    body.avatarUrl
  );
  const lastSeenAt = new Date().toISOString();

  await supabase.from("profiles").upsert(
    {
      id: user.id,
      username: profile?.username || username || null,
      display_name: profile?.display_name || displayName,
      avatar_url: profile?.avatar_url || (avatarUrl.startsWith("http") ? avatarUrl : null),
      board_style: {
        ...existingStyle,
        lastSeenAt,
        presenceOnline: true,
      },
      updated_at: lastSeenAt,
    },
    { onConflict: "id" }
  );

  await publishFriendZoneDirectory(supabase, user.id, {
    username,
    displayName,
    avatarUrl,
  }).catch(() => undefined);

  return Response.json({ ok: true, lastSeenAt });
}
