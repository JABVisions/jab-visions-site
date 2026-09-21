import { supabaseServer } from "@/lib/supabase/server";
import { publicOrbAvatarUrl } from "@/lib/board/friendZoneOrbs";
import { resolveRoomId } from "@/lib/board/rooms/catalog";
import { isMissingRoomsTable, json } from "@/lib/board/rooms/server";
import { ROOM_PRESENCE_TTL_MS } from "@/lib/board/rooms/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanText(value: unknown, max = 80) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET(
  _req: Request,
  { params }: { params: { roomId: string } }
) {
  const roomId = resolveRoomId(params.roomId);
  if (!roomId) return json({ ok: false, message: "Room not found" }, 404);

  try {
    const supabase = supabaseServer();
    const since = new Date(Date.now() - ROOM_PRESENCE_TTL_MS).toISOString();
    const { data, error } = await supabase
      .from("room_presence")
      .select("user_id, username, display_name, avatar_url, last_seen_at")
      .eq("room_id", roomId)
      .gte("last_seen_at", since)
      .order("last_seen_at", { ascending: false });

    if (error && isMissingRoomsTable(error)) {
      return json({ ok: true, presence: [], setupRequired: true });
    }
    if (error) return json({ ok: true, presence: [], warning: error.message });
    return json({ ok: true, presence: data || [] });
  } catch {
    return json({ ok: true, presence: [] });
  }
}

export async function POST(
  req: Request,
  { params }: { params: { roomId: string } }
) {
  const roomId = resolveRoomId(params.roomId);
  if (!roomId) return json({ ok: false, message: "Room not found" }, 404);

  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, message: "Unauthorized" }, 401);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  if (body.leave === true) {
    const { error } = await supabase
      .from("room_presence")
      .delete()
      .eq("room_id", roomId)
      .eq("user_id", user.id);
    if (error && !isMissingRoomsTable(error)) {
      return json({ ok: false, message: error.message }, 500);
    }
    return json({ ok: true, left: true });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const lastSeenAt = new Date().toISOString();
  const row = {
    room_id: roomId,
    user_id: user.id,
    username: cleanText(body.username, 24) || cleanText(profile?.username, 24) || null,
    display_name:
      cleanText(body.displayName, 60) ||
      cleanText(profile?.display_name, 60) ||
      "Board User",
    avatar_url: publicOrbAvatarUrl(body.avatarUrl, profile?.avatar_url) || null,
    last_seen_at: lastSeenAt,
  };

  const { error } = await supabase.from("room_presence").upsert(row, { onConflict: "room_id,user_id" });
  if (error && isMissingRoomsTable(error)) {
    return json({ ok: true, persisted: "local", lastSeenAt });
  }
  if (error) return json({ ok: false, message: error.message }, 500);
  return json({ ok: true, persisted: "db", lastSeenAt });
}
