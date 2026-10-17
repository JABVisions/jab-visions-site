import type { HitReaction } from '../combat';
import type { MeleeStyle } from '../skeletal';

/**
 * Physical attacks are data. Punch, kick, and melee differ in speed, reach,
 * and what they do to the person they land on. Abilities stay on the kits.
 */
export type StrikeKind = 'punch' | 'kick' | 'melee' | 'grab' | 'throw';

export type CombatActionType = StrikeKind | 'ability' | 'dodge';

export type BodyStance = 'grounded' | 'airborne' | 'launched' | 'knockedDown' | 'stunned' | 'grabbed';

export interface CombatAction {
  id: string;
  type: StrikeKind;
  /** Multiplier on the attacker's melee damage. PvP scaling happens later, once. */
  damageMul: number;
  startup: number;
  active: number;
  recovery: number;
  range: number;
  halfArc: number;
  hitStun: number;
  knockback: number;
  reaction: HitReaction;
  strength: number;
  lunge: number;
  style: MeleeStyle;
}

export const PUNCH: CombatAction = {
  id: 'punch',
  type: 'punch',
  damageMul: 0.46,
  startup: 0.12,
  active: 0.1,
  recovery: 0.22,
  range: 2.2,
  halfArc: 0.9,
  hitStun: 0.2,
  knockback: 2.4,
  reaction: 'stagger',
  strength: 0.7,
  lunge: 0.22,
  style: 'punch',
};

export const KICK: CombatAction = {
  id: 'kick',
  type: 'kick',
  damageMul: 0.78,
  startup: 0.14,
  active: 0.1,
  recovery: 0.46,
  range: 2.7,
  halfArc: 0.72,
  hitStun: 0.34,
  knockback: 6.4,
  reaction: 'knockback',
  strength: 1,
  lunge: 0.42,
  style: 'kick',
};

/** Pitchfork reach. Damage multipliers stay on the Ryder profile; this only changes the swing. */
export function forkStrike(action: CombatAction, kind: StrikeKind): CombatAction {
  if (kind === 'punch') {
    return {
      ...action,
      id: 'fork-thrust',
      range: 2.6,
      halfArc: 0.35,
      style: 'forkThrust',
      reaction: 'stagger',
      knockback: 3.4,
      lunge: 0.36,
      startup: 0.1,
      active: 0.08,
      hitStun: 0.22,
    };
  }
  if (kind === 'kick') {
    return {
      ...action,
      id: 'fork-sweep',
      range: 3.1,
      halfArc: 1.35,
      style: 'forkSweep',
      reaction: 'knockback',
      knockback: 8,
      lunge: 0.24,
      startup: 0.12,
      active: 0.1,
      hitStun: 0.32,
    };
  }
  if (kind === 'melee') {
    return {
      ...action,
      id: 'fork-slam',
      range: 2.55,
      halfArc: 0.55,
      style: 'forkSlam',
      reaction: 'heavy',
      knockback: 6.5,
      lunge: 0.16,
      damageMul: action.damageMul * 1.3,
      startup: 0.16,
      active: 0.1,
      strength: 1.15,
    };
  }
  return action;
}

export const MELEE: CombatAction = {
  id: 'melee',
  type: 'melee',
  damageMul: 1.05,
  startup: 0.12,
  active: 0.1,
  recovery: 0.5,
  range: 2.25,
  halfArc: 0.95,
  hitStun: 0.36,
  knockback: 5.2,
  reaction: 'heavy',
  strength: 1,
  lunge: 0.34,
  style: 'slash',
};

export const GRAB: CombatAction = {
  id: 'grab',
  type: 'grab',
  damageMul: 0,
  startup: 0.1,
  active: 0.08,
  recovery: 0.48,
  range: 1.38,
  halfArc: 1.05,
  hitStun: 0.2,
  knockback: 0,
  reaction: 'stagger',
  strength: 0.4,
  lunge: 0.16,
  style: 'punch',
};

export const THROW: CombatAction = {
  id: 'throw',
  type: 'throw',
  damageMul: 0.7,
  startup: 0.04,
  active: 0.06,
  recovery: 0.4,
  range: 1.8,
  halfArc: Math.PI,
  hitStun: 0.42,
  knockback: 9,
  reaction: 'knockback',
  strength: 1.15,
  lunge: 0.1,
  style: 'smash',
};

export const BASE_ACTIONS: Record<StrikeKind, CombatAction> = {
  punch: PUNCH,
  kick: KICK,
  melee: MELEE,
  grab: GRAB,
  throw: THROW,
};

/** Hit 1 is full damage. Later hits step down so a long string cannot empty a duel bar. */
export function comboDamageScale(hitIndex: number): number {
  return Math.max(0.62, 1 - Math.max(0, hitIndex - 1) * 0.05);
}

/** Later hits stun less, so a long string opens a way out. */
export function comboStunScale(hitIndex: number): number {
  return Math.max(0.3, 1 - Math.max(0, hitIndex - 1) * 0.1);
}

export interface PhysicalHit {
  reaction: HitReaction;
  strength: number;
  hitStun: number;
  knockback: number;
}

export function stanceOf(body: { held?: number; airY?: number; stagger?: number; stun?: number }): BodyStance {
  if ((body.held ?? 0) > 0) return 'grabbed';
  if ((body.airY ?? 0) > 0.75) return 'launched';
  if ((body.airY ?? 0) > 0.08) return 'airborne';
  if ((body.airY ?? 0) <= 0 && (body.stagger ?? 0) > 0.45) return 'knockedDown';
  if ((body.stagger ?? 0) > 0 || (body.stun ?? 0) > 0) return 'stunned';
  return 'grounded';
}
