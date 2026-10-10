/**
 * Pitchfork flight and aura-weapon rules. Pure so they can be checked without
 * loading Lilly's mesh. The character GLB has no flight clips; the ride is a pose.
 */

export const FLIGHT_WINDOW = 0.85;
export const FLIGHT_CEILING = 14;
export const MOUNT_TIME = 0.45;
export const FLY_DRAIN = 6;
export const BOOST_DRAIN = 10;
export const FLY_SPEED = 1.65;
/** Shift also applies the engine sprint multiplier, so this lands near 2.4 overall. */
export const BOOST_SPEED = 1.88;

export type FlightPhase = 'ground' | 'mounting' | 'flying' | 'attacking' | 'dismounting';

export function shouldStartFlight(input: {
  airborne: boolean;
  sinceJump: number;
  giant: boolean;
  phase: FlightPhase;
}): boolean {
  if (input.giant || input.phase !== 'ground' || !input.airborne) return false;
  return input.sinceJump >= 0 && input.sinceJump <= FLIGHT_WINDOW;
}

/** Aura turns the pitchfork into a weapon. Flight and an empty aura put it away. */
export function forkArmed(input: { aura: number; burnout: boolean; phase: FlightPhase }): boolean {
  if (input.burnout || input.aura <= 0) return false;
  return input.phase === 'ground';
}

export function stepAltitude(
  altitude: number,
  dt: number,
  climb: -1 | 0 | 1,
  opts?: { ceiling?: number; rise?: number; fall?: number },
): number {
  const ceiling = opts?.ceiling ?? FLIGHT_CEILING;
  const rise = opts?.rise ?? 6.5;
  const fall = opts?.fall ?? 7.5;
  const delta = climb > 0 ? rise : climb < 0 ? -fall : 0;
  const next = altitude + delta * dt;
  if (next < 0) return 0;
  if (next > ceiling) return ceiling;
  return next;
}

/** Forward cone. `yaw` uses the raid facing: forward is (sin yaw, 0, cos yaw). */
export function inArc(dx: number, dz: number, yaw: number, range: number, halfArc: number, radius: number): boolean {
  const dist = Math.hypot(dx, dz);
  if (dist > range + radius) return false;
  if (halfArc >= Math.PI) return true;
  let diff = Math.atan2(dx, dz) - yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const slack = Math.min(0.5, radius / Math.max(dist, 0.3));
  return Math.abs(diff) <= halfArc + slack;
}
