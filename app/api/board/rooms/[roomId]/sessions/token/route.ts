import { AccessToken } from "livekit-server-sdk";
import { supabaseServer } from "@/lib/supabase/server";
import { getRoomById, resolveRoomId } from "@/lib/board/rooms/catalog";
import { isMissingRoomsTable, json } from "@/lib/board/rooms/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function liveKitConfig() {
  const url = process.env.LIVEKIT_URL?.trim();
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  return url && apiKey && apiSecret ? { url, apiKey, apiSecret } : null;
}

export async function POST(
  req: Request,
  { params }: { params: { roomId: string } }
) {
  const roomId = resolveRoomId(params.roomId);
  if (!roomId || !getRoomById(roomId)) return json({ ok: false, message: "Room not found" }, 404);

  const config = liveKitConfig();
  if (!config) {
    return json({ ok: false, message: "LiveKit is not configured for this environment." }, 503);
  }

  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, message: "Unauthorized" }, 401);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, message: "Invalid token request." }, 400);
  }

  const kind = body.kind === "live" ? "live" : "call";
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  if (!sessionId) return json({ ok: false, message: "Session is required." }, 400);

  const { data: session, error: sessionError } = await supabase
    .from("room_sessions")
    .select("id, kind, status, started_by")
    .eq("id", sessionId)
    .eq("room_id", roomId)
    .eq("kind", kind)
    .in("status", ["starting", "live"])
    .maybeSingle();
  if (sessionError && !isMissingRoomsTable(sessionError)) {
    return json({ ok: false, message: sessionError.message }, 500);
  }
  if (!session) return json({ ok: false, message: "This session is no longer active." }, 404);

  const { data: membership, error: membershipError } = await supabase
    .from("room_members")
    .select("role, status")
    .eq("room_id", roomId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipError && !isMissingRoomsTable(membershipError)) {
    return json({ ok: false, message: membershipError.message }, 500);
  }
  if (!membership || !["joined", "following"].includes(String(membership.status))) {
    return json({ ok: false, message: "Join the Room before entering its session." }, 403);
  }

  const isHost = session.started_by === user.id;
  const canPublish = kind === "call" || isHost;
  const token = new AccessToken(config.apiKey, config.apiSecret, {
    identity: user.id,
    name: user.user_metadata?.display_name || user.email || "Board member",
    metadata: JSON.stringify({ roomId, sessionId, kind, role: canPublish ? "speaker" : "viewer" }),
  });
  token.addGrant({
    roomJoin: true,
    room: `board-${roomId}-${sessionId}`,
    canPublish,
    canSubscribe: true,
    canPublishData: true,
  });

  return json({
    ok: true,
    url: config.url,
    token: await token.toJwt(),
    canPublish,
  });
}
