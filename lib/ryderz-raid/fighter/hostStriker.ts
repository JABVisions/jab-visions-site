import { comboDamageScale, comboStunScale, type StrikeKind } from './actions';
import { actionFor } from './profiles';

/**
 * Solo and Raid hosts use the same punch / kick / melee definitions as a Ryder.
 * Their authored `damage` stays the base. A chain is short and then they pause.
 */
export function nextHostStrike(input: { chain: number; dist: number; foeStun: number; rng: number }): { kind: StrikeKind; chain: number } {
  const continuing = input.foeStun > 0.05 && input.chain > 0 && input.chain < 3 && input.rng < 0.72;
  if (continuing) {
    const kind: StrikeKind = input.chain === 2 ? 'kick' : 'punch';
    return { kind, chain: input.chain + 1 };
  }
  let kind: StrikeKind = 'punch';
  if (input.dist < 1.55 && input.rng > 0.62) kind = 'melee';
  else if (input.rng > 0.4) kind = 'kick';
  return { kind, chain: 1 };
}

export function hostStrikeDamage(baseDamage: number, kind: StrikeKind, chain: number): { damage: number; hitStun: number; knockback: number; recovery: number } {
  const action = actionFor(kind, null);
  const hit = Math.max(1, chain);
  return {
    damage: baseDamage * action.damageMul * comboDamageScale(hit),
    hitStun: action.hitStun * comboStunScale(hit),
    knockback: action.knockback,
    recovery: action.recovery + (chain >= 3 ? 0.55 : 0.22),
  };
}
