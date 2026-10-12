/** Seconds a downed raider stays on the ground before they fade out. */
export const DOWN_SECONDS = 8;
/** The last stretch of that window is the fade. */
export const DOWN_FADE = 1.4;
/** Metres a living teammate must close to pick someone up. */
export const REVIVE_RANGE = 2.25;
export const REVIVE_HP = 0.42;
export const REVIVE_AURA = 0.4;

export function downOpacity(left: number) {
  if (left <= 0) return 0;
  return Math.min(1, left / DOWN_FADE);
}

export function reviveVitals(maxHp: number, maxAura: number, currentAura = 0) {
  return {
    hp: Math.max(1, maxHp * REVIVE_HP),
    aura: Math.max(currentAura, maxAura * REVIVE_AURA),
  };
}

/** A raid continues while anyone is still on their feet. */
export function squadStillStanding(playerUp: boolean, livingAllies: number) {
  return playerUp || livingAllies > 0;
}
