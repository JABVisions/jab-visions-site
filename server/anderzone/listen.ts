import { WebSocketServer, type WebSocket } from "ws";
import { defaultAvatar, sanitizeAvatar } from "@/lib/anderzone/avatar";
import { createDistrict, resolveJoinIdentity } from "@/lib/anderzone/room";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { regionById, type Facing } from "@/lib/anderzone/world";

const port = Number(process.env.ANDERZONE_ROOM_PORT || 2567);
const district = createDistrict();
const sockets = new Map<string, WebSocket>();
const { configured } = getSupabasePublicConfig();

type ClientFrame = {
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

async function verifiedUser(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !token) return null;
  try {
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { id?: string };
    return body.id ?? null;
  } catch {
    return null;
  }
}

function safeSend(socket: WebSocket, payload: unknown) {
  if (socket.readyState !== socket.OPEN) return;
  try {
    socket.send(JSON.stringify(payload));
  } catch {
    // A broken peer must not take down the district.
  }
}

function broadcast() {
  const payload = JSON.stringify({ type: "snapshot", snapshot: district.snapshot() });
  for (const socket of sockets.values()) {
    if (socket.readyState !== socket.OPEN) continue;
    try {
      socket.send(payload);
    } catch {
      // A broken peer must not take down the district.
    }
  }
}

function hubSpawn() {
  return regionById(district.regionId)?.spawn ?? { x: 112, y: 304 };
}

function readFrame(raw: Buffer): ClientFrame | null {
  try {
    const message = JSON.parse(String(raw)) as unknown;
    if (!message || typeof message !== "object" || Array.isArray(message)) return null;
    return message as ClientFrame;
  } catch {
    return null;
  }
}

const server = new WebSocketServer({ port });
server.on("connection", (socket: WebSocket) => {
  let userId: string | null = null;
  socket.on("message", (raw: Buffer) => {
    const message = readFrame(raw);
    if (!message) {
      safeSend(socket, { type: "error", message: "That frame was ignored." });
      return;
    }
    void handleFrame(message).catch((error) => {
      console.error("ANDERZONE room ignored a frame.", error);
      safeSend(socket, { type: "error", message: "That frame was ignored." });
    });
  });

  async function handleFrame(message: ClientFrame) {
    if (message.type === "join") {
      const verified = message.token ? await verifiedUser(message.token) : null;
      const nextId = resolveJoinIdentity(verified, String(message.userId || ""), !configured);
      if (!nextId) {
        safeSend(socket, { type: "error", message: "Board sign-in is required for this district." });
        return;
      }
      if (userId && userId !== nextId) {
        district.leave(userId);
        sockets.delete(userId);
      }
      userId = nextId;
      const spawn = hubSpawn();
      district.join(
        {
          id: userId,
          name: String(message.name || "Ander"),
          x: spawn.x,
          y: spawn.y,
          facing: "s",
          appearance: sanitizeAvatar(message.appearance ?? defaultAvatar()),
          pet: message.pet ?? null,
        },
        Date.now()
      );
      sockets.set(userId, socket);
      safeSend(socket, { type: "joined", snapshot: district.snapshot() });
      broadcast();
      return;
    }
    if (message.type === "leave") {
      if (!userId) return;
      district.leave(userId);
      sockets.delete(userId);
      userId = null;
      broadcast();
      return;
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
  }

  socket.on("close", () => {
    if (!userId) return;
    district.leave(userId);
    sockets.delete(userId);
    broadcast();
  });
});

console.log(`ANDERZONE CENTRAL room listening on ${port}. High-frequency movement stays in this process, not Supabase.`);
