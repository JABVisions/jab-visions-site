import { supabaseServer } from "@/lib/supabase/server";
import { resolveRoomId } from "@/lib/board/rooms/catalog";
import { isMissingRoomsTable, json } from "@/lib/board/rooms/server";
import type { LiveSignal } from "@/lib/board/rooms/liveWebRtc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SIGNALS = 40;

function asSignal(value: unknown): LiveSignal | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const kind = String(row.kind || "");
  if (!["hello", "goodbye", "offer", "answer", "ice", "ended", "state"].includes(kind)) return null;
  const from = String(row.from || "").trim();
  const sessionId = String(row.sessionId || "").trim();
  const roomId = String(row.roomId || "").trim();
  if (!from || !sessionId || !roomId) return null;
  return {
    kind: kind as LiveSignal["kind"],
    sessionId,
    roomId,
    from,
    to: typeof row.to === "string" ? row.to : null,
    role: row.role === "host" ? "host" : "viewer",
    sdp: typeof row.sdp === "string" ? row.sdp : undefined,
    candidate: row.candidate,
    viewerCount: typeof row.viewerCount === "number" ? row.viewerCount : undefined,
    ts: typeof row.ts === "number" ? row.ts : Date.now(),
  };
}

export async function GET(
  req: Request,
  { params }: { params: { roomId: string } }
) {
  const roomId = resolveRoomId(params.roomId);
  if (!roomId) return json({ ok: false, message: "Room not found" }, 404);
  const url = new URL(req.url);
  const sessionId = String(url.searchParams.get("sessionId") || "").trim();
  const since = Number(url.searchParams.get("since") || 0);

  try {
    const supabase = supabaseServer();
    let query = supabase
      .from("room_sessions")
      .select("id, metadata")
      .eq("room_id", roomId)
      .eq("kind", "live")
      .in("status", ["starting", "live"])
      .order("created_at", { ascending: false })
      .limit(1);
    if (sessionId) query = query.eq("id", sessionId);
    const { data, error } = await query.maybeSingle();
    if (error && isMissingRoomsTable(error)) return json({ ok: true, signals: [], setupRequired: true });
    if (error) return json({ ok: true, signals: [] });
    const signals = Array.isArray((data as { metadata?: { signals?: unknown } } | null)?.metadata?.signals)
      ? ((data as { metadata: { signals: unknown[] } }).metadata.signals || [])
          .map(asSignal)
          .filter((row): row is LiveSignal => Boolean(row))
          .filter((row) => !since || row.ts > since)
      : [];
    return json({ ok: true, signals, sessionId: (data as { id?: string } | null)?.id || sessionId });
  } catch {
    return json({ ok: true, signals: [] });
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

  const signal = asSignal(body.signal || body);
  if (!signal) return json({ ok: false, message: "signal is required" }, 400);
  signal.roomId = roomId;
  const sessionId = String(body.sessionId || signal.sessionId || "").trim();

  try {
    let query = supabase
      .from("room_sessions")
      .select("id, metadata")
      .eq("room_id", roomId)
      .eq("kind", "live")
      .in("status", ["starting", "live"])
      .order("created_at", { ascending: false })
      .limit(1);
    if (sessionId) query = query.eq("id", sessionId);
    const { data, error } = await query.maybeSingle();
    if (error && isMissingRoomsTable(error)) return json({ ok: true, persisted: "local" });
    if (error || !data) return json({ ok: true, persisted: "none" });

    const metadata =
      data.metadata && typeof data.metadata === "object" ? (data.metadata as Record<string, unknown>) : {};
    const previous = Array.isArray(metadata.signals) ? metadata.signals : [];
    const nextSignals = [...previous, signal].slice(-MAX_SIGNALS);
    const { error: updateError } = await supabase
      .from("room_sessions")
      .update({ metadata: { ...metadata, vendor: "webrtc", placeholder: false, signals: nextSignals } })
      .eq("id", data.id);
    if (updateError) return json({ ok: true, persisted: "none" });
    return json({ ok: true, persisted: "db" });
  } catch {
    return json({ ok: true, persisted: "local" });
  }
}
