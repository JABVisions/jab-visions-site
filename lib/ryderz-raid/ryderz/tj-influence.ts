/**
 * TJ's hold on a crowd. Marks live on the bodies themselves and expire.
 * A recast refreshes the same mark. It does not add a second controller.
 */

export type SwayMode = 'control' | 'riot';

export interface SwayMark {
  until: number;
  mode: SwayMode;
  /** Extra attack pace while a riot is feeding on a nearby death. */
  haste: number;
}

export interface InfluenceBody {
  hp: number;
  ally?: boolean;
  duelist?: boolean;
  tier?: number;
  pos: { x: number; z: number };
}

const marks = new WeakMap<object, SwayMark>();
const provoked = new WeakSet<object>();

export const CONTROL_SECONDS = 15;
export const RIOT_SECONDS = 10;
export const CONTROL_RADIUS = 15;
export const RIOT_RADIUS = 25;
export const CONTROL_CAP = 8;
export const RIOT_CAP = 20;
export const STRIKE_RANGE = 25;
export const STRIKE_SECONDS = 3;

export type InfluenceRank = 'open' | 'elite' | 'immune';

/** Civilians bend. Elites bend partway. Bosses, adepts, and other Ryderz do not. */
export function influenceRank(body: Pick<InfluenceBody, 'ally' | 'duelist' | 'tier'>): InfluenceRank {
  if (body.ally || body.duelist) return 'immune';
  const tier = body.tier ?? 1;
  if (tier >= 5) return 'immune';
  if (tier >= 4) return 'elite';
  return 'open';
}

export function swaySeconds(mode: SwayMode, rank: InfluenceRank) {
  if (rank === 'immune') return 0;
  const base = mode === 'control' ? CONTROL_SECONDS : RIOT_SECONDS;
  return rank === 'elite' ? base * 0.35 : base;
}

/** Refresh an existing mark. Riot is not downgraded by a later mind-control cast. */
export function applySway(body: object, mode: SwayMode, now: number, seconds: number) {
  if (seconds <= 0) return false;
  const until = now + seconds;
  const prev = marks.get(body);
  if (prev && prev.until > now) {
    prev.until = Math.max(prev.until, until);
    if (mode === 'riot') prev.mode = 'riot';
    return true;
  }
  marks.set(body, { until, mode, haste: 0 });
  return true;
}

export function swayOf(body: object, now: number): SwayMark | null {
  const mark = marks.get(body);
  if (!mark) return null;
  if (mark.until <= now) {
    marks.delete(body);
    return null;
  }
  return mark;
}

export function clearSway(body: object) {
  marks.delete(body);
}

/** TJ shot or struck this body, so the crowd no longer treats him as untouchable. */
export function provoke(body: object) {
  provoked.add(body);
}

export function isProvoked(body: object) {
  return provoked.has(body);
}

/**
 * Mind-controlled civilians leave TJ alone until he hurts them.
 * Elites, bosses, and other Ryderz never get this courtesy.
 */
export function ringmasterHolds(body: InfluenceBody) {
  if (isProvoked(body)) return false;
  return influenceRank(body) === 'open';
}

export function pickRival<T extends InfluenceBody>(self: T, others: readonly T[]): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const other of others) {
    if (other === self || other.hp <= 0 || other.ally) continue;
    const dist = Math.hypot(other.pos.x - self.pos.x, other.pos.z - self.pos.z);
    if (dist < bestD) {
      best = other;
      bestD = dist;
    }
  }
  return best;
}

export function swayCandidates<T extends InfluenceBody>(
  bodies: readonly T[],
  origin: { x: number; z: number },
  radius: number,
  cap: number,
  mode: SwayMode,
): T[] {
  return bodies
    .filter((body) => body.hp > 0 && swaySeconds(mode, influenceRank(body)) > 0)
    .map((body) => ({ body, dist: Math.hypot(body.pos.x - origin.x, body.pos.z - origin.z) }))
    .filter((row) => row.dist <= radius)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, cap)
    .map((row) => row.body);
}

/** A riot death makes the bodies still fighting nearby swing faster for a moment. */
export function boostNearbyRiot<T extends InfluenceBody>(dead: T, others: readonly T[], now: number) {
  let boosted = 0;
  for (const other of others) {
    if (other === dead || other.hp <= 0) continue;
    const mark = swayOf(other, now);
    if (!mark || mark.mode !== 'riot') continue;
    if (Math.hypot(other.pos.x - dead.pos.x, other.pos.z - dead.pos.z) > 8) continue;
    mark.haste = Math.min(1.2, mark.haste + 0.45);
    mark.until = Math.max(mark.until, now + 1.5);
    boosted += 1;
  }
  return boosted;
}
