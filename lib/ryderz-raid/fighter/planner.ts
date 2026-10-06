import type { AiProfile } from '../pvp/aiProfile';
import type { StrikeKind } from './actions';

/**
 * A short script the CPU tries to land. It is a suggestion: range, whiffs,
 * and a low health bar throw it away. Personalities only change the weights.
 */
export function openingPlan(profile: AiProfile, allowChain: boolean, rng: () => number = Math.random): StrikeKind[] | null {
  if (!allowChain) return null;
  if (rng() > 0.28 + profile.comboPreference * 0.62) return null;
  const roll = rng();
  if (profile.comboPreference > 0.72 && roll < 0.45) return ['punch', 'punch', 'kick'];
  if (profile.comboPreference > 0.55 && roll < 0.7) return ['punch', 'kick', 'melee'];
  if (profile.evasiveness > 0.65 && roll < 0.55) return ['punch', 'kick', 'punch'];
  if (profile.punish > 0.7 && roll < 0.5) return ['kick', 'melee'];
  if (roll < 0.45) return ['punch', 'punch'];
  return ['kick', 'kick'];
}
