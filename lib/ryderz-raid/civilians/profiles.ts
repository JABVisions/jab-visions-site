import type { EnemyKind } from '../config';
import type { StrikeKind } from '../fighter/actions';

/**
 * Civilians are ordinary people. Profiles change how they close, how often
 * they swing, and whether they would rather throw something than brawl.
 * None of them cast powers.
 */
export type CivilianProfileId = 'aggressive' | 'cautious' | 'thrower' | 'brawler' | 'cowardly';

export interface CivilianProfile {
  id: CivilianProfileId;
  /** Metres they try to stand from a Ryder before swinging. */
  preferredDistance: number;
  attackRange: number;
  /** How hard they back out after getting too close. 0 stays in. */
  retreat: number;
  punch: number;
  kick: number;
  melee: number;
  /** Above 0.5 they hunt props before they commit to a fistfight. */
  throwBias: number;
  /** Flee when health falls under this fraction. 0 never flees. */
  fleeHp: number;
  /** 0 stands still in range, 1 orbits. */
  circle: number;
  speed: number;
}

export const CIVILIAN_PROFILES: Record<CivilianProfileId, CivilianProfile> = {
  aggressive: {
    id: 'aggressive',
    preferredDistance: 1.65,
    attackRange: 2.25,
    retreat: 0.04,
    punch: 0.48,
    kick: 0.34,
    melee: 0.12,
    throwBias: 0.08,
    fleeHp: 0,
    circle: 0.08,
    speed: 1.12,
  },
  cautious: {
    id: 'cautious',
    preferredDistance: 2.55,
    attackRange: 2.2,
    retreat: 0.62,
    punch: 0.34,
    kick: 0.22,
    melee: 0.08,
    throwBias: 0.2,
    fleeHp: 0.22,
    circle: 0.75,
    speed: 0.92,
  },
  thrower: {
    id: 'thrower',
    preferredDistance: 5.4,
    attackRange: 2.15,
    retreat: 0.4,
    punch: 0.16,
    kick: 0.1,
    melee: 0.04,
    throwBias: 0.92,
    fleeHp: 0.18,
    circle: 0.25,
    speed: 1,
  },
  brawler: {
    id: 'brawler',
    preferredDistance: 1.45,
    attackRange: 2.15,
    retreat: 0.06,
    punch: 0.36,
    kick: 0.22,
    melee: 0.34,
    throwBias: 0.1,
    fleeHp: 0,
    circle: 0.12,
    speed: 1,
  },
  cowardly: {
    id: 'cowardly',
    preferredDistance: 3.3,
    attackRange: 2.15,
    retreat: 0.78,
    punch: 0.42,
    kick: 0.18,
    melee: 0.05,
    throwBias: 0.28,
    fleeHp: 0.48,
    circle: 0.45,
    speed: 1.05,
  },
};

export type CivilianAttack = Extract<StrikeKind, 'punch' | 'kick' | 'melee'> | 'throwObject';

export type CivilianState =
  | 'approach'
  | 'circle'
  | 'attack'
  | 'backOff'
  | 'search'
  | 'pickup'
  | 'throw'
  | 'flee'
  | 'recover';

export interface CivilianSense {
  dist: number;
  hpRatio: number;
  holding: boolean;
  /** Distance to the nearest free prop, or null when the street is empty. */
  throwableDist: number | null;
  /** 0 and 1 may stand in and swing. Later arrivals hang back. */
  slot: number;
  recovering: boolean;
  /** 0–1, fresh each decision. */
  rng: number;
}

export interface CivilianOrder {
  state: CivilianState;
  /** 1 toward the goal, 0 hold, -1 away from the Ryder. */
  move: number;
  strafe: number;
  attack: CivilianAttack | null;
}

const POOL: CivilianProfileId[] = ['brawler', 'aggressive', 'cautious', 'thrower', 'cowardly'];

/** Kind nudges the pool. Walkers still roll, so a crowd is not five copies. */
export function profileForKind(kind: EnemyKind, rng: number): CivilianProfileId {
  if (kind === 'thrower') return 'thrower';
  if (kind === 'heavy') return rng < 0.75 ? 'brawler' : 'aggressive';
  if (kind === 'sprinter') return rng < 0.65 ? 'aggressive' : 'brawler';
  if (kind === 'broadcaster') return 'aggressive';
  return POOL[Math.floor(rng * POOL.length) % POOL.length];
}

export function civilianOrder(profile: CivilianProfile, sense: CivilianSense): CivilianOrder {
  if (sense.recovering) return { state: 'recover', move: 0, strafe: 0, attack: null };
  if (profile.fleeHp > 0 && sense.hpRatio <= profile.fleeHp) {
    return { state: 'flee', move: -1, strafe: 0.35, attack: null };
  }
  if (sense.holding) {
    if (sense.dist < 11) return { state: 'throw', move: sense.dist < 2.4 ? -0.6 : 0, strafe: 0, attack: 'throwObject' };
    return { state: 'approach', move: 1, strafe: 0, attack: null };
  }
  const wantsProp =
    profile.throwBias > 0.45 &&
    sense.throwableDist != null &&
    sense.throwableDist < 12 &&
    (sense.dist > profile.preferredDistance || sense.rng < profile.throwBias);
  if (wantsProp && sense.throwableDist != null) {
    if (sense.throwableDist < 0.85) return { state: 'pickup', move: 0, strafe: 0, attack: null };
    return { state: 'search', move: 1, strafe: 0, attack: null };
  }
  if (sense.slot >= 2 && sense.dist < profile.preferredDistance + 2.2) {
    const poke = sense.rng < 0.22 && sense.dist < profile.attackRange ? 'punch' : null;
    return { state: 'circle', move: 0, strafe: 1, attack: poke };
  }
  if (sense.dist > profile.preferredDistance + 0.4) {
    return { state: 'approach', move: 1, strafe: profile.circle * 0.25, attack: null };
  }
  if (sense.dist < profile.preferredDistance - 0.45) {
    return { state: 'backOff', move: -1, strafe: profile.circle, attack: null };
  }
  let attack: CivilianAttack | null = null;
  if (sense.dist <= profile.attackRange) {
    const kickAt = profile.punch + profile.kick;
    const meleeAt = kickAt + profile.melee;
    if (sense.rng < profile.punch) attack = 'punch';
    else if (sense.rng < kickAt) attack = 'kick';
    else if (sense.rng < meleeAt) attack = 'melee';
  }
  return {
    state: 'attack',
    move: profile.circle > 0.5 ? 0 : 0.05,
    strafe: profile.circle,
    attack,
  };
}
