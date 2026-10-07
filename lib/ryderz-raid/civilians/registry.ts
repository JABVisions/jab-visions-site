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

const HOST_MALE = '/assets/those-ryderz/models/host-male.glb';
const LAVENDER = '/assets/those-ryderz/models/civilian-fashion.glb';

function pair(
  id: string,
  maleName: string,
  profile: CivilianProfileId,
  health: number,
  moveSpeed: number,
  maleMap: CivilianDefinition['animationMap'],
): CivilianDefinition[] {
  return [
    {
      id,
      name: maleName,
      modelPath: HOST_MALE,
      animationMap: maleMap,
      profile,
      health,
      moveSpeed,
    },
    {
      id: `${id}-lavender`,
      name: 'Lavender',
      modelPath: LAVENDER,
      // Rigged at load. No baked clips, so she uses the shared walk and strike poses.
      animationMap: {},
      profile,
      health,
      moveSpeed,
    },
  ];
}

export const CIVILIAN_REGISTRY: CivilianDefinition[] = [
  ...pair('street-brawler', 'Street brawler', 'brawler', 36, 3.6, { punch: 'jab', kick: 'kick', melee: 'tackle', grab: 'grab' }),
  ...pair('street-aggressive', 'Aggressor', 'aggressive', 32, 4.4, { punch: 'jab', kick: 'kick' }),
  ...pair('street-cautious', 'Hesitant', 'cautious', 28, 3.3, { punch: 'jab', kick: 'kick' }),
  ...pair('street-thrower', 'Thrower', 'thrower', 30, 3.5, { punch: 'jab', throw: 'kick' }),
  ...pair('street-coward', 'Reluctant', 'cowardly', 24, 3.8, { punch: 'jab' }),
];

/** Each profile has one male and one female body. `rng` 0–1 splits them evenly. */
export function definitionForProfile(profile: CivilianProfileId, rng = 0): CivilianDefinition {
  const matches = CIVILIAN_REGISTRY.filter((entry) => entry.profile === profile);
  if (!matches.length) return CIVILIAN_REGISTRY[0];
  const index = Math.min(matches.length - 1, Math.floor(Math.max(0, rng) * matches.length));
  return matches[index];
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
