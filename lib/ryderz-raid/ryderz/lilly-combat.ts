/**
 * Numbers and hit tests for Lilly James. The kit plays these; tests can call
 * them without a scene.
 */

export const SOUL_RADIUS = 4.6;
export const SOUL_DPS = 16;
export const SOUL_HEAL_RATIO = 0.4;
export const SOUL_COOLDOWN = 6;

export const GIANT_SCALE = 4;
export const GIANT_HOLD = 8;
export const GIANT_COOLDOWN = 14;
export const GIANT_MOVE = 0.68;

export const STOMP_CORE = 1.15;
export const STOMP_SHOCK = 3.4;
export const STOMP_CORE_DAMAGE = 36;
export const STOMP_SHOCK_DAMAGE = 12;
export const STOMP_TELEGRAPH = 0.28;

export const SUMMON_COOLDOWN = 11;
export const SUMMON_DURATION = 1.75;

export interface CircleBody {
  x: number;
  z: number;
  radius: number;
  hp: number;
}

export function inCircle(body: CircleBody, x: number, z: number, radius: number) {
  const dx = body.x - x;
  const dz = body.z - z;
  const reach = radius + body.radius;
  return dx * dx + dz * dz <= reach * reach;
}

/** Damage only bodies standing in the circle. Damage stops the moment they leave. */
export function drainHits(bodies: readonly CircleBody[], x: number, z: number, radius: number, amount: number) {
  const hits: Array<{ index: number; dealt: number }> = [];
  bodies.forEach((body, index) => {
    if (body.hp <= 0 || !inCircle(body, x, z, radius)) return;
    const dealt = Math.min(body.hp, amount);
    if (dealt > 0) hits.push({ index, dealt });
  });
  return hits;
}

/** Heal from damage actually dealt, never past max health. */
export function healFromDamage(hp: number, maxHp: number, dealt: number, ratio = SOUL_HEAL_RATIO) {
  const room = Math.max(0, maxHp - hp);
  const healed = Math.min(room, Math.max(0, dealt) * ratio);
  return { hp: hp + healed, healed };
}

export type GrowPhase = 'plant' | 'expand' | 'giant' | 'shrink';

/** 1 at rest, GIANT_SCALE while holding, and a smooth ramp on the way in and out. */
export function scaleForGrow(phase: GrowPhase, t: number, giant = GIANT_SCALE) {
  const u = Math.min(1, Math.max(0, t));
  const smooth = u * u * (3 - 2 * u);
  if (phase === 'plant') return 1 + (1.12 - 1) * smooth;
  if (phase === 'expand') return 1.12 + (giant - 1.12) * smooth;
  if (phase === 'shrink') return giant + (1 - giant) * smooth;
  return giant;
}

export function radiusForScale(scale: number, giant = GIANT_SCALE) {
  const u = Math.min(1, Math.max(0, (scale - 1) / Math.max(0.001, giant - 1)));
  return 1 + u * 1.45;
}

export type StompBand = 'crush' | 'shock';

/** Crush under the foot, shock in the ring, nothing outside. One band per impact. */
export function stompBand(distance: number, core = STOMP_CORE, shock = STOMP_SHOCK): StompBand | null {
  if (distance <= core) return 'crush';
  if (distance <= shock) return 'shock';
  return null;
}

/** Side-and-forward offset so a summon does not spawn inside Lilly. */
export function summonOffset(yaw: number, radius: number) {
  const dist = radius + 0.9;
  return {
    x: Math.sin(yaw) * 0.35 + Math.cos(yaw) * dist,
    z: Math.cos(yaw) * 0.35 - Math.sin(yaw) * dist,
  };
}
