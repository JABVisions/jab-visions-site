import type { HitReaction } from '../combat';
import type { MeleeStyle } from '../skeletal';

/**
 * Physical attacks are data. Punch, kick, and melee differ in speed, reach,
 * and what they do to the person they land on. Abilities stay on the kits.
 */
/**
 * punch / kick / melee are the three buttons. heavy and launcher are the
 * sprint-modified versions of punch and kick. aerial replaces any strike
 * thrown while airborne, and finisher replaces melee over a downed body.
 */
export type StrikeKind = 'punch' | 'kick' | 'melee' | 'grab' | 'throw' | 'heavy' | 'launcher' | 'aerial' | 'finisher';

/** Strikes a fighter can ask for directly. grab / throw / aerial / finisher are chosen by context. */
export type StrikeInput = 'punch' | 'kick' | 'melee' | 'heavy' | 'launcher';

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
  /**
   * Half-width of the swept volume between where the fighter stood and where
   * the lunge put the fist. Unset strikes only test the arc at the end point.
   */
  sweepWidth?: number;
  /** Once this strike connects, the next buffered strike may start as soon as the active frames end. */
  cancelOnHit?: boolean;
  /** Extra upward speed given to a target that was already in the air. */
  juggle?: number;
}

export const PUNCH: CombatAction = {
  id: 'punch',
  type: 'punch',
  damageMul: 0.46,
  startup: 0.08,
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
  cancelOnHit: true,
  juggle: 0.4,
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
  cancelOnHit: true,
  juggle: 0.6,
};

/** Sprint + punch. Slow, wide, and it puts a crowd on the ground. */
export const HEAVY: CombatAction = {
  id: 'heavy',
  type: 'heavy',
  damageMul: 1.4,
  startup: 0.26,
  active: 0.12,
  recovery: 0.6,
  range: 2.7,
  halfArc: 1.35,
  hitStun: 0.5,
  knockback: 9,
  reaction: 'heavy',
  strength: 1.3,
  lunge: 0.55,
  style: 'smash',
  sweepWidth: 1.15,
  cancelOnHit: true,
  juggle: 0.3,
};

/** Sprint + kick. A rising strike that pops the target into the air for a juggle. */
export const LAUNCHER: CombatAction = {
  id: 'launcher',
  type: 'launcher',
  damageMul: 0.9,
  startup: 0.18,
  active: 0.1,
  recovery: 0.46,
  range: 2.3,
  halfArc: 0.85,
  hitStun: 0.45,
  knockback: 3,
  reaction: 'launch',
  strength: 1.3,
  lunge: 0.34,
  style: 'punchR',
  cancelOnHit: true,
  juggle: 1.2,
};

/** Any strike thrown while airborne. Comes down on everyone around the landing point. */
export const AERIAL: CombatAction = {
  id: 'aerial',
  type: 'aerial',
  damageMul: 1.2,
  startup: 0.1,
  active: 0.16,
  recovery: 0.36,
  range: 2.6,
  halfArc: Math.PI,
  hitStun: 0.42,
  knockback: 7,
  reaction: 'slam',
  strength: 1.1,
  lunge: 0.45,
  style: 'smash',
  sweepWidth: 1.2,
  cancelOnHit: true,
  juggle: 0.9,
};

/** Melee over a downed body. Slow start, big payoff. */
export const FINISHER: CombatAction = {
  id: 'finisher',
  type: 'finisher',
  damageMul: 2,
  startup: 0.2,
  active: 0.1,
  recovery: 0.55,
  range: 1.9,
  halfArc: 0.9,
  hitStun: 0.5,
  knockback: 6,
  reaction: 'heavy',
  strength: 1.45,
  lunge: 0.2,
  style: 'smash',
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
  heavy: HEAVY,
  launcher: LAUNCHER,
  aerial: AERIAL,
  finisher: FINISHER,
};

/** Strikes that may be asked for by a button. */
export const STRIKE_INPUTS: StrikeInput[] = ['punch', 'kick', 'melee', 'heavy', 'launcher'];

/** Sprint turns a light strike into its heavy cousin. Melee already is one. */
export function heavyVariant(kind: StrikeInput): StrikeInput {
  if (kind === 'punch') return 'heavy';
  if (kind === 'kick') return 'launcher';
  return kind;
}

/** A body on the floor with its stagger still running is open to a finisher. */
export function isKnockedDown(body: { airY?: number; stagger?: number; held?: number }): boolean {
  return (body.held ?? 0) <= 0 && (body.airY ?? 0) <= 0.02 && (body.stagger ?? 0) > 0.45;
}

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
