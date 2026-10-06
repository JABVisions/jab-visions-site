/**
 * PvP duel pacing only. Solo hosts and Raid waves keep their authored damage
 * and health. These multipliers are applied at the hurt boundary, never by
 * rewriting an ability's base numbers.
 */
export const PVP_BALANCE = {
  /** Both Ryderz. Enough exchanges to use a kit without turning into a sponge. */
  healthMultiplier: 2.5,
  /** Guns and melee. Chip damage; combos add up. */
  incomingDamageMultiplier: 0.55,
  /** Q / E while a power is live. Noticeable, not a delete. */
  abilityDamageMultiplier: 0.62,
  /** R, the heavier slot. Still leaves room to answer. */
  ultimateDamageMultiplier: 0.72,
} as const;

export type PvpDamageKind = 'basic' | 'ability' | 'ultimate';

export function calculatePvPDamage(input: { baseDamage: number; kind?: PvpDamageKind }): number {
  const kind = input.kind ?? 'basic';
  const scale =
    kind === 'ultimate'
      ? PVP_BALANCE.ultimateDamageMultiplier
      : kind === 'ability'
        ? PVP_BALANCE.abilityDamageMultiplier
        : PVP_BALANCE.incomingDamageMultiplier;
  return Math.max(0, input.baseDamage * scale);
}

export function pvpHealth(base: number): number {
  return Math.max(1, Math.round(base * PVP_BALANCE.healthMultiplier));
}
