export const TILE = 32;
export const MOVE_SPEED = 120;

export type RegionId =
  | "anderzone-central"
  | "home-pod"
  | "pixel-paradise"
  | "whisper-woods"
  | "outer-grid"
  | "underground"
  | "null-zone";

export type TileKind = "floor" | "plaza" | "wall" | "door" | "sign" | "npc" | "portal";

export type Facing = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

export type RegionDefinition = {
  id: RegionId;
  title: string;
  mood: string;
  /** False means the map is only a definition. It must not be entered. */
  playable: boolean;
  rows?: string[];
  spawn?: { x: number; y: number };
  portalTo?: RegionId;
};

const CENTRAL_ROWS = [
  "########################",
  "#......................#",
  "#..AAAAA...............#",
  "#..A...A......pppp.....#",
  "#..A.n.A......pppp.....#",
  "#..AAdAA...............#",
  "#..........s...........#",
  "#......................#",
  "#......................#",
  "#..............h.......#",
  "#......................#",
  "########################",
];

const HOME_ROWS = [
  "##########",
  "#........#",
  "#........#",
  "#........#",
  "#........#",
  "#........#",
  "#...c....#",
  "##########",
];

export const REGIONS: RegionDefinition[] = [
  {
    id: "anderzone-central",
    title: "ANDERZONE CENTRAL",
    mood: "A bright plaza where signals stay playful and a few doors lead somewhere stranger.",
    playable: true,
    rows: CENTRAL_ROWS,
    spawn: { x: 3 * TILE + TILE / 2, y: 9 * TILE + TILE / 2 },
    portalTo: "home-pod",
  },
  {
    id: "home-pod",
    title: "Home Pod",
    mood: "Your starter room. Quiet, private, and ready for a pet bed.",
    playable: true,
    rows: HOME_ROWS,
    spawn: { x: 2 * TILE + TILE / 2, y: 2 * TILE + TILE / 2 },
    portalTo: "anderzone-central",
  },
  {
    id: "pixel-paradise",
    title: "Pixel Paradise",
    mood: "A candy-colored shore that is still only a rumor.",
    playable: false,
  },
  {
    id: "whisper-woods",
    title: "Whisper Woods",
    mood: "Soft trees that repeat names. Not open yet.",
    playable: false,
  },
  {
    id: "outer-grid",
    title: "Outer Grid",
    mood: "A far lattice of lights. Mapped, not built.",
    playable: false,
  },
  {
    id: "underground",
    title: "Underground",
    mood: "Service tunnels under the plaza. Not playable.",
    playable: false,
  },
  {
    id: "null-zone",
    title: "Null Zone",
    mood: "A blank signal at the edge of the map. Not playable.",
    playable: false,
  },
];

const LEGEND: Record<string, TileKind> = {
  "#": "wall",
  ".": "floor",
  p: "plaza",
  A: "wall",
  d: "door",
  s: "sign",
  n: "npc",
  h: "portal",
  c: "portal",
};

export function regionById(id: string) {
  return REGIONS.find((region) => region.id === id) ?? null;
}

export function regionSize(region: RegionDefinition) {
  const rows = region.rows ?? [];
  return { width: rows[0]?.length ?? 0, height: rows.length };
}

export function tileKind(region: RegionDefinition, tileX: number, tileY: number): TileKind | null {
  const row = region.rows?.[tileY];
  if (!row || tileX < 0 || tileX >= row.length) return null;
  return LEGEND[row[tileX]] ?? "floor";
}

export function isSolid(kind: TileKind | null) {
  return kind === "wall" || kind === "sign" || kind == null;
}

export function directionFromKeys(x: number, y: number): Facing | null {
  const sx = Math.sign(x);
  const sy = Math.sign(y);
  if (sx === 0 && sy === 0) return null;
  const table: Record<string, Facing> = {
    "0,-1": "n",
    "1,-1": "ne",
    "1,0": "e",
    "1,1": "se",
    "0,1": "s",
    "-1,1": "sw",
    "-1,0": "w",
    "-1,-1": "nw",
  };
  return table[`${sx},${sy}`] ?? null;
}

export function velocityFor(dirX: number, dirY: number, speed = MOVE_SPEED) {
  const len = Math.hypot(dirX, dirY);
  if (!len) return { x: 0, y: 0 };
  return { x: (dirX / len) * speed, y: (dirY / len) * speed };
}

export type Body = { x: number; y: number; facing: Facing };

function blockedAt(region: RegionDefinition, x: number, y: number) {
  return isSolid(tileKind(region, Math.floor(x / TILE), Math.floor(y / TILE)));
}

export function bodyHitsSolid(region: RegionDefinition, x: number, y: number, half = 8) {
  return (
    blockedAt(region, x - half, y - half) ||
    blockedAt(region, x + half, y - half) ||
    blockedAt(region, x - half, y + half) ||
    blockedAt(region, x + half, y + half)
  );
}

export function moveBody(region: RegionDefinition, body: Body, dirX: number, dirY: number, dt: number): Body {
  const facing = directionFromKeys(dirX, dirY) ?? body.facing;
  const velocity = velocityFor(dirX, dirY);
  let x = body.x + velocity.x * dt;
  let y = body.y + velocity.y * dt;
  if (bodyHitsSolid(region, x, body.y)) x = body.x;
  if (bodyHitsSolid(region, x, y)) y = body.y;
  return { x, y, facing };
}

export type Interactable = {
  id: string;
  kind: "sign" | "npc" | "door" | "portal";
  x: number;
  y: number;
  prompt: string;
  action: "read" | "talk" | "adopt" | "travel";
  to?: RegionId;
};

export function interactables(region: RegionDefinition): Interactable[] {
  const found: Interactable[] = [];
  region.rows?.forEach((row, tileY) => {
    row.split("").forEach((cell, tileX) => {
      const x = tileX * TILE + TILE / 2;
      const y = tileY * TILE + TILE / 2;
      if (cell === "s") {
        found.push({
          id: `sign-${tileX}-${tileY}`,
          kind: "sign",
          x,
          y,
          action: "read",
          prompt: `${region.title}. Playful signals, and a few doors that stay mysterious.`,
        });
      }
      if (cell === "n") {
        found.push({
          id: `npc-${tileX}-${tileY}`,
          kind: "npc",
          x,
          y,
          action: "talk",
          prompt: "Plaza keeper: The lights stay on. Your first Dooboo is free.",
        });
      }
      if (cell === "d") {
        found.push({
          id: `door-${tileX}-${tileY}`,
          kind: "door",
          x,
          y,
          action: "adopt",
          prompt: "Dooboo Adoption Center",
        });
      }
      if (cell === "h" || cell === "c") {
        found.push({
          id: `portal-${tileX}-${tileY}`,
          kind: "portal",
          x,
          y,
          action: "travel",
          to: region.portalTo,
          prompt: region.portalTo === "home-pod" ? "Home Pod portal" : "Return to ANDERZONE CENTRAL",
        });
      }
    });
  });
  return found;
}

export function nearestInteractable(region: RegionDefinition, x: number, y: number, range = 42) {
  return (
    interactables(region)
      .map((item) => ({ item, distance: Math.hypot(item.x - x, item.y - y) }))
      .filter((entry) => entry.distance <= range)
      .sort((a, b) => a.distance - b.distance)[0]?.item ?? null
  );
}

export function enterRegion(id: string) {
  const region = regionById(id);
  if (!region) return { ok: false as const, reason: "missing" };
  if (!region.playable || !region.rows || !region.spawn) {
    return { ok: false as const, reason: "unbuilt", title: region.title };
  }
  return { ok: true as const, region };
}
