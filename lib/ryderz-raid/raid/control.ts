/**
 * Who a raid tap can take over, and when picking another floor starts over.
 * The engine uses these so the party bar and the arena menu stay in agreement.
 */

export function canAssumeAlly(input: {
  raid: boolean;
  phase: string;
  seat: number;
  controlledSeat: number;
  remoteHuman: boolean;
  hp: number;
  down: number;
}): boolean {
  if (!input.raid || input.phase !== 'playing') return false;
  if (input.seat === input.controlledSeat) return false;
  if (input.remoteHuman) return false;
  if (input.hp <= 0 && input.down <= 0) return false;
  return true;
}

/** A live match changes floor. The same floor, or a match that has not started, stays put. */
export function arenaChangeRestarts(previousId: string, nextId: string, matchLive: boolean): boolean {
  return matchLive && previousId !== nextId;
}

/**
 * Keep the fraction of vital and aura across a body swap.
 * A downed body stays at zero instead of being healed by the transfer.
 */
export function carriedVitals(
  current: { hp: number; maxHp: number; aura: number; maxAura: number },
  nextMaxHp: number,
  nextMaxAura: number,
  down: number,
): { hp: number; maxHp: number; aura: number; maxAura: number } {
  if (down > 0 || nextMaxHp <= 0) {
    return { hp: 0, maxHp: Math.max(1, nextMaxHp), aura: 0, maxAura: Math.max(1, nextMaxAura) };
  }
  const hpFrac = current.maxHp > 0 ? Math.min(1, Math.max(0, current.hp / current.maxHp)) : 1;
  const auraFrac = current.maxAura > 0 ? Math.min(1, Math.max(0, current.aura / current.maxAura)) : 1;
  return {
    hp: Math.max(1, nextMaxHp * hpFrac),
    maxHp: nextMaxHp,
    aura: nextMaxAura * auraFrac,
    maxAura: nextMaxAura,
  };
}
