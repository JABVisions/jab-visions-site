import { WebSocketServer, type WebSocket } from "ws";
import { defaultAvatar, sanitizeAvatar } from "@/lib/anderzone/avatar";
import { createDistrict, resolveJoinIdentity } from "@/lib/anderzone/room";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import type { Facing } from "@/lib/anderzone/world";

const port = Number(process.env.ANDERZONE_ROOM_PORT || 2567);
const district = createDistrict();
const sockets = new Map<string, WebSocket>();
const { configured } = getSupabasePublicConfig();

async function verifiedUser(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !token) return null;
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { id?: string };
  return body.id ?? null;
}

function broadcast() {
  const payload = JSON.stringify({ type: "snapshot", snapshot: district.snapshot() });
  for (const socket of sockets.values()) {
    if (socket.readyState === socket.OPEN) socket.send(payload);
  }
}

const server = new WebSocketServer({ port });
server.on("connection", (socket: WebSocket) => {
  let userId: string | null = null;
  socket.on("message", async (raw: Buffer) => {
    const message = JSON.parse(String(raw)) as {
      type?: string;
      userId?: string;
      token?: string;
      name?: string;
      appearance?: unknown;
      pet?: { name: string; speciesId: string; behavior: string; x: number; y: number } | null;
      seq?: number;
      x?: number;
      y?: number;
      facing?: Facing;
      emote?: string;
    };
    if (message.type === "join") {
      const verified = message.token ? await verifiedUser(message.token) : null;
      userId = resolveJoinIdentity(verified, String(message.userId || ""), !configured);
      if (!userId) {
        socket.send(JSON.stringify({ type: "error", message: "Board sign-in is required for this district." }));
        return;
      }
      district.join(
        {
          id: userId,
          name: String(message.name || "Ander"),
          x: 128,
          y: 304,
          facing: "s",
          appearance: sanitizeAvatar(message.appearance ?? defaultAvatar()),
          pet: message.pet ?? null,
        },
        Date.now()
      );
      sockets.set(userId, socket);
      socket.send(JSON.stringify({ type: "joined", snapshot: district.snapshot() }));
      broadcast();
    }
    if (message.type === "input" && userId) {
      district.input(
        userId,
        {
          seq: Number(message.seq) || 0,
          x: Number(message.x) || 0,
          y: Number(message.y) || 0,
          facing: message.facing || "s",
          emote: message.emote,
          pet: message.pet,
        },
        Date.now()
      );
      broadcast();
    }
  });
  socket.on("close", () => {
    if (!userId) return;
    district.leave(userId);
    sockets.delete(userId);
    broadcast();
  });
});

console.log(`ANDERZONE CENTRAL room listening on ${port}. High-frequency movement stays in this process, not Supabase.`);
