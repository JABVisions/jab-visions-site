import type { CivilianProfileId } from './profiles';

/**
 * One entry per civilian body. New GLBs join this list: point at the file,
 * name the clips you have, and pick a profile. The AI is shared.
 *
 * Clip names are substrings. A missing clip falls back to the procedural
 * punch, kick, or shove already used by the Ryders.
 */
export interface CivilianDefinition {
  id: string;
  name: string;
  /** Null keeps the current host figure until a GLB is added. */
  modelPath: string | null;
  animationMap: Partial<
    Record<'idle' | 'punch' | 'kick' | 'melee' | 'grab' | 'throw' | 'hitLight' | 'hitHeavy' | 'knockedDown', string>
  >;
  profile: CivilianProfileId;
  health: number;
  moveSpeed: number;
}

export const CIVILIAN_REGISTRY: CivilianDefinition[] = [
  {
    id: 'street-brawler',
    name: 'Street brawler',
    modelPath: '/assets/those-ryderz/models/host-male.glb',
    animationMap: { punch: 'jab', kick: 'kick', melee: 'tackle', grab: 'grab' },
    profile: 'brawler',
    health: 36,
    moveSpeed: 3.6,
  },
  {
    id: 'street-aggressive',
    name: 'Aggressor',
    modelPath: '/assets/those-ryderz/models/host-male.glb',
    animationMap: { punch: 'jab', kick: 'kick' },
    profile: 'aggressive',
    health: 32,
    moveSpeed: 4.4,
  },
  {
    id: 'street-cautious',
    name: 'Hesitant',
    modelPath: '/assets/those-ryderz/models/host-male.glb',
    animationMap: { punch: 'jab', kick: 'kick' },
    profile: 'cautious',
    health: 28,
    moveSpeed: 3.3,
  },
  {
    id: 'street-thrower',
    name: 'Thrower',
    modelPath: '/assets/those-ryderz/models/host-male.glb',
    animationMap: { punch: 'jab', throw: 'kick' },
    profile: 'thrower',
    health: 30,
    moveSpeed: 3.5,
  },
  {
    id: 'street-coward',
    name: 'Reluctant',
    modelPath: '/assets/those-ryderz/models/host-male.glb',
    animationMap: { punch: 'jab' },
    profile: 'cowardly',
    health: 24,
    moveSpeed: 3.8,
  },
];

export function definitionForProfile(profile: CivilianProfileId): CivilianDefinition {
  return CIVILIAN_REGISTRY.find((entry) => entry.profile === profile) ?? CIVILIAN_REGISTRY[0];
}

/** Pick a baked clip substring for this swing. Missing names fall back to the style index. */
export function clipHintFor(
  map: CivilianDefinition['animationMap'] | undefined,
  style?: string,
  throwing = false,
): string | undefined {
  if (!map) return undefined;
  if (throwing) return map.throw ?? map.kick ?? map.punch;
  if (style === 'kick' || style === 'spinKick') return map.kick ?? map.punch;
  if (style === 'smash' || style === 'slash' || style === 'chop' || style === 'blast' || style === 'slap') {
    return map.melee ?? map.kick ?? map.punch;
  }
  return map.punch;
}
