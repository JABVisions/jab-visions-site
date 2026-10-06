import { GameMode } from '../game-mode';
import { isFriendly, type CombatIdentity } from './teamUtils';

/**
 * Shared targeting gate for future ability work (Overdrive, Dark Storm,
 * Greed Swing, Heartbreak Blitz, Blade Storm, …). Kits should call this
 * instead of assuming every nearby figure is fair game.
 *
 * Friendly fire is off in Raid. PvP players are valid targets for each other.
 * NPCs are always valid player targets in Solo and Raid.
 */
export function canDamage(attacker: CombatIdentity, target: CombatIdentity, mode: GameMode): boolean {
  if (attacker.playerId && target.playerId && attacker.playerId === target.playerId) return false;
  if (isFriendly(attacker, target, mode)) return false;
  if (target.faction === 'environment') return false;
  return true;
}

export function teamForMode(mode: GameMode, isLocal: boolean): 'raiders' | 'opposing' {
  if (mode === GameMode.PVP && !isLocal) return 'opposing';
  return 'raiders';
}
