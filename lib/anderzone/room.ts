import type { AvatarAppearance } from "./avatar";
import type { Facing } from "./world";
import { bodyHitsSolid, MOVE_SPEED, regionById } from "./world";

export type PetPresence = {
  name: string;
  speciesId: string;
  behavior: string;
  x: number;
  y: number;
};

export type PlayerPresence = {
  id: string;
  name: string;
  x: number;
  y: number;
  facing: Facing;
  appearance: AvatarAppearance;
  emote: string | null;
  pet: PetPresence | null;
  seq: number;
  at: number;
};

export type MoveInput = {
  seq: number;
  x: number;
  y: number;
  facing: Facing;
  emote?: string | null;
  pet?: PetPresence | null;
};

const SLACK = 8;

export function createDistrict(regionId = "anderzone-central") {
  const players = new Map<string, PlayerPresence>();
  return {
    regionId,
    join(player: Omit<PlayerPresence, "seq" | "at" | "emote"> & { emote?: string | null }, now: number) {
      const previous = players.get(player.id);
      const next: PlayerPresence = {
        id: player.id,
        name: player.name.slice(0, 24),
        x: previous?.x ?? player.x,
        y: previous?.y ?? player.y,
        facing: previous?.facing ?? player.facing,
        appearance: player.appearance,
        emote: player.emote ?? null,
        pet: player.pet ?? previous?.pet ?? null,
        seq: previous?.seq ?? 0,
        at: now,
      };
      players.set(player.id, next);
      return { reconnected: Boolean(previous), player: next };
    },
    leave(id: string) {
      players.delete(id);
    },
    input(id: string, input: MoveInput, now: number) {
      const player = players.get(id);
      if (!player) return { ok: false as const, reason: "missing" };
      if (input.seq <= player.seq) return { ok: true as const, ignored: true };
      const region = regionById(regionId);
      const dt = Math.min(0.25, Math.max(1 / 60, (now - player.at) / 1000));
      const distance = Math.hypot(input.x - player.x, input.y - player.y);
      if (distance > MOVE_SPEED * dt + SLACK) return { ok: false as const, reason: "speed" };
      if (region?.rows && bodyHitsSolid(region, input.x, input.y)) return { ok: false as const, reason: "collision" };
      player.x = input.x;
      player.y = input.y;
      player.facing = input.facing;
      player.seq = input.seq;
      player.at = now;
      if (input.emote) player.emote = input.emote.slice(0, 16);
      if (input.pet) player.pet = { ...input.pet, name: input.pet.name.slice(0, 16) };
      return { ok: true as const, ignored: false };
    },
    snapshot() {
      return {
        regionId,
        players: [...players.values()].map((player) => ({
          id: player.id,
          name: player.name,
          x: player.x,
          y: player.y,
          facing: player.facing,
          appearance: player.appearance,
          emote: player.emote,
          pet: player.pet ? { ...player.pet } : null,
        })),
      };
    },
  };
}

export type DistrictSnapshot = ReturnType<ReturnType<typeof createDistrict>["snapshot"]>;

export function interpolatePresence(from: { x: number; y: number }, to: { x: number; y: number }, t: number) {
  const amount = Math.max(0, Math.min(1, t));
  return {
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
  };
}

export function resolveJoinIdentity(verifiedUserId: string | null, devId: string, allowDev: boolean) {
  if (verifiedUserId) return verifiedUserId;
  if (allowDev && devId.trim()) return devId.trim().slice(0, 80);
  return null;
}
