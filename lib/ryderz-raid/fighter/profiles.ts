import type { AbilityId, RyderId } from '../config';
import type { HitReaction } from '../combat';
import type { MeleeStyle } from '../skeletal';
import { BASE_ACTIONS, type CombatAction, type StrikeKind } from './actions';
import { SHARED_COMBOS, type ComboRecipe } from './combo';

export interface PowerLinkDef {
  id: string;
  abilityId: AbilityId;
  label: string;
  preReaction: HitReaction;
  /** Extra swings after the real ability starts. The kit still plays the power. */
  followUps: number;
  /** Seconds the target is held so the power can catch them. */
  trap: number;
}

export interface MeleeSet {
  label: string;
  damageMul: number;
  reaction: HitReaction;
  range: number;
  recovery: number;
  style: MeleeStyle;
}

export interface CombatProfile {
  punch: { damageMul: number; recovery: number };
  kick: { damageMul: number; knockback: number };
  melee: MeleeSet;
  combos: ComboRecipe[];
  powerLink: PowerLinkDef;
}

const DEFAULT_LINK: PowerLinkDef = {
  id: 'power-link',
  abilityId: 'shockwave',
  label: 'Power Link',
  preReaction: 'stagger',
  followUps: 1,
  trap: 0,
};

export const DEFAULT_COMBAT_PROFILE: CombatProfile = {
  punch: { damageMul: 0.46, recovery: 0.22 },
  kick: { damageMul: 0.78, knockback: 6.4 },
  melee: { label: 'Melee', damageMul: 1.05, reaction: 'heavy', range: 2.25, recovery: 0.5, style: 'slash' },
  combos: SHARED_COMBOS,
  powerLink: DEFAULT_LINK,
};

const RYDER_COMBAT: Record<RyderId, CombatProfile> = {
  keven: {
    punch: { damageMul: 0.44, recovery: 0.2 },
    kick: { damageMul: 0.74, knockback: 5.6 },
    melee: { label: 'Acrobatic grab', damageMul: 0.96, reaction: 'launch', range: 2.05, recovery: 0.44, style: 'spinKick' },
    combos: [
      ...SHARED_COMBOS,
      { id: 'keven-flip', sequence: ['kick', 'kick', 'melee'], effect: 'launcher' },
    ],
    powerLink: { id: 'dart-rain', abilityId: 'dartStorm', label: 'Dart Rain', preReaction: 'launch', followUps: 3, trap: 0 },
  },
  leo: {
    punch: { damageMul: 0.42, recovery: 0.16 },
    kick: { damageMul: 0.7, knockback: 5.2 },
    melee: { label: 'Speed strike', damageMul: 0.92, reaction: 'knockback', range: 2.15, recovery: 0.34, style: 'spinKick' },
    combos: SHARED_COMBOS,
    powerLink: { id: 'speed-chain', abilityId: 'overdrive', label: 'Speed Chain', preReaction: 'stagger', followUps: 2, trap: 0 },
  },
  aaron: {
    punch: { damageMul: 0.48, recovery: 0.24 },
    kick: { damageMul: 0.84, knockback: 7.2 },
    melee: { label: 'Axe', damageMul: 1.22, reaction: 'heavy', range: 2.45, recovery: 0.56, style: 'smash' },
    combos: SHARED_COMBOS,
    powerLink: { id: 'shadow-step', abilityId: 'blink', label: 'Shadow Step', preReaction: 'knockback', followUps: 1, trap: 0 },
  },
  zoe: {
    punch: { damageMul: 0.4, recovery: 0.22 },
    kick: { damageMul: 0.72, knockback: 6 },
    melee: { label: 'Plasma strike', damageMul: 1, reaction: 'knockback', range: 2.3, recovery: 0.48, style: 'blast' },
    combos: SHARED_COMBOS,
    powerLink: { id: 'plasma-trap', abilityId: 'forcefield', label: 'Plasma Trap', preReaction: 'stagger', followUps: 1, trap: 0.45 },
  },
  rubi: {
    punch: { damageMul: 0.45, recovery: 0.2 },
    kick: { damageMul: 0.76, knockback: 6.2 },
    melee: { label: 'Blade', damageMul: 1.12, reaction: 'knockback', range: 2.35, recovery: 0.46, style: 'slash' },
    combos: SHARED_COMBOS,
    powerLink: { id: 'storm-chain', abilityId: 'bladeFan', label: 'Storm Chain', preReaction: 'stagger', followUps: 2, trap: 0 },
  },
  lilly: {
    punch: { damageMul: 0.42, recovery: 0.22 },
    kick: { damageMul: 0.8, knockback: 6.6 },
    melee: { label: 'Famine strike', damageMul: 1.02, reaction: 'knockback', range: 2.3, recovery: 0.46, style: 'smash' },
    combos: [...SHARED_COMBOS, { id: 'lilly-crowd', sequence: ['kick', 'kick', 'punch'], effect: 'heavyKnockback' }],
    powerLink: { id: 'drain-link', abilityId: 'soulDrain', label: 'Soul Link', preReaction: 'stagger', followUps: 1, trap: 0.2 },
  },
};

export function combatProfileFor(id: RyderId | null | undefined): CombatProfile {
  if (id && id in RYDER_COMBAT) return RYDER_COMBAT[id];
  return DEFAULT_COMBAT_PROFILE;
}

export function recipesFor(id: RyderId | null | undefined): ComboRecipe[] {
  return combatProfileFor(id).combos;
}

export function actionFor(kind: StrikeKind, id: RyderId | null | undefined): CombatAction {
  const base = BASE_ACTIONS[kind];
  const profile = combatProfileFor(id);
  if (kind === 'punch') {
    return { ...base, damageMul: profile.punch.damageMul, recovery: profile.punch.recovery };
  }
  if (kind === 'kick') {
    return { ...base, damageMul: profile.kick.damageMul, knockback: profile.kick.knockback };
  }
  if (kind === 'melee') {
    const melee = profile.melee;
    return {
      ...base,
      damageMul: melee.damageMul,
      reaction: melee.reaction,
      range: melee.range,
      recovery: melee.recovery,
      style: melee.style,
    };
  }
  return { ...base };
}

/** Signature interaction when the pressed power matches. Any other power still spends the link, lighter. */
export function resolvePowerLink(ryderId: RyderId | null | undefined, abilityId: AbilityId): PowerLinkDef {
  const link = combatProfileFor(ryderId).powerLink;
  if (link.abilityId === abilityId) return link;
  return {
    id: 'power-link',
    abilityId,
    label: 'Power Link',
    preReaction: 'stagger',
    followUps: 1,
    trap: 0,
  };
}
