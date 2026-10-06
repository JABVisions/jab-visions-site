import type { RyderId } from '../config';

export type PreferredRange = 'close' | 'mid' | 'long';

/**
 * Future difficulty menu. Harder settings decide faster and waste fewer
 * choices. They do not gain damage or aura.
 */
export type PvpDifficulty = 'easy' | 'normal' | 'hard' | 'ryder';

export interface AiProfile {
  /** 0 calm, 1 always pressing. */
  aggression: number;
  /** 0 stands in, 1 slips attacks and backs off when hurt. */
  evasiveness: number;
  preferredRange: PreferredRange;
  /** How often powers are worth more than another basic. */
  abilityFrequency: number;
  /** Finisher and melee-string bias once someone is hurt. */
  comboPreference: number;
  /** How hard they step in when the other fighter whiffs a heavy attack. */
  punish: number;
}

export interface AiTuning {
  /** Seconds before a new choice, inclusive range. Not frame-perfect. */
  reactionMin: number;
  reactionMax: number;
  /** 0 wanders, 1 reads the fight. Aim error uses the remainder. */
  prediction: number;
  /** Chance to take a lesser legal action on purpose. */
  mistake: number;
}

export const DEFAULT_AI_PROFILE: AiProfile = {
  aggression: 0.55,
  evasiveness: 0.4,
  preferredRange: 'mid',
  abilityFrequency: 0.55,
  comboPreference: 0.45,
  punish: 0.45,
};

/** Personalities for the Ryderz who already have kits. New ids inherit the default. */
export const RYDER_AI_PROFILES: Record<RyderId, AiProfile> = {
  keven: { aggression: 0.46, evasiveness: 0.86, preferredRange: 'mid', abilityFrequency: 0.62, comboPreference: 0.48, punish: 0.84 },
  leo: { aggression: 0.92, evasiveness: 0.22, preferredRange: 'close', abilityFrequency: 0.7, comboPreference: 0.86, punish: 0.4 },
  aaron: { aggression: 0.58, evasiveness: 0.56, preferredRange: 'mid', abilityFrequency: 0.64, comboPreference: 0.52, punish: 0.82 },
  zoe: { aggression: 0.4, evasiveness: 0.74, preferredRange: 'long', abilityFrequency: 0.6, comboPreference: 0.36, punish: 0.5 },
  rubi: { aggression: 0.86, evasiveness: 0.34, preferredRange: 'close', abilityFrequency: 0.74, comboPreference: 0.9, punish: 0.58 },
};

export function aiProfileFor(id: RyderId | null | undefined): AiProfile {
  if (id && id in RYDER_AI_PROFILES) return RYDER_AI_PROFILES[id];
  return DEFAULT_AI_PROFILE;
}

export function preferredMeters(range: PreferredRange): number {
  if (range === 'close') return 2.15;
  if (range === 'long') return 9.5;
  return 6.2;
}

export function tuningFor(difficulty: PvpDifficulty): AiTuning {
  switch (difficulty) {
    case 'easy':
      return { reactionMin: 0.75, reactionMax: 1.2, prediction: 0.28, mistake: 0.34 };
    case 'hard':
      return { reactionMin: 0.3, reactionMax: 0.65, prediction: 0.7, mistake: 0.08 };
    case 'ryder':
      return { reactionMin: 0.22, reactionMax: 0.48, prediction: 0.82, mistake: 0.05 };
    default:
      return { reactionMin: 0.5, reactionMax: 0.9, prediction: 0.48, mistake: 0.18 };
  }
}
