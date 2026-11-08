import { dampAngle, wrapAngle } from './camera';

/**
 * Soft auto lock. With no hard lock held, the camera eases toward the nearest
 * host worth fighting. Any manual look pauses it so the player keeps control.
 */
export const AUTO_LOCK = {
  /** Hosts closer than this can be picked up (m). */
  range: 9,
  /** A held target is dropped past this distance (m). */
  release: 12,
  /** Seconds of no manual look before the assist steers again. */
  resume: 1.1,
  /** No turn while the target is already this close to centre (rad). */
  deadzone: 0.14,
  /** Time constant of the camera turn (s). Slower than a hard lock. */
  turn: 0.32,
  /** Metres of distance one radian off-centre is worth when scoring. */
  anglePenalty: 2.2,
  /** A new body must score this fraction of the held one to steal the lock. */
  switchRatio: 0.6,
} as const;

export interface LockCandidate {
  pos: { x: number; z: number };
}

function score(px: number, pz: number, yaw: number, target: LockCandidate) {
  const dx = target.pos.x - px;
  const dz = target.pos.z - pz;
  const dist = Math.hypot(dx, dz);
  const off = Math.abs(wrapAngle(Math.atan2(dx, dz) - yaw));
  return { dist, value: dist + off * AUTO_LOCK.anglePenalty };
}

/** Keep the held target while it stays in reach, unless a clearly better one steps in. */
export function pickAutoTarget<T extends LockCandidate>(
  px: number,
  pz: number,
  yaw: number,
  candidates: readonly T[],
  current: T | null,
): T | null {
  let best: T | null = null;
  let bestValue = Infinity;
  for (const candidate of candidates) {
    const { dist, value } = score(px, pz, yaw, candidate);
    if (dist > AUTO_LOCK.range || value >= bestValue) continue;
    best = candidate;
    bestValue = value;
  }
  if (current && candidates.includes(current)) {
    const held = score(px, pz, yaw, current);
    if (held.dist <= AUTO_LOCK.release && (!best || bestValue > held.value * AUTO_LOCK.switchRatio)) return current;
  }
  return best;
}

/** Ease the yaw toward the target. Inside the deadzone the camera is left alone. */
export function steerAutoLock(yaw: number, px: number, pz: number, target: LockCandidate, dt: number) {
  const aim = Math.atan2(target.pos.x - px, target.pos.z - pz);
  if (Math.abs(wrapAngle(aim - yaw)) < AUTO_LOCK.deadzone) return yaw;
  return dampAngle(yaw, aim, AUTO_LOCK.turn, dt);
}
