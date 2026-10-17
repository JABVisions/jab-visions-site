import { GameMode } from '../game-mode';
import type { RaidPlayer, TeamId } from './playerTypes';

export type CombatFaction = 'player' | 'npc' | 'environment';

/** Enough identity to answer friendly/hostile without a live networking peer. */
export interface CombatIdentity {
  playerId?: string;
  team?: TeamId;
  faction: CombatFaction;
  partyId?: string;
}

export function identityFromPlayer(player: RaidPlayer): CombatIdentity {
  return {
    playerId: player.id,
    team: player.team,
    faction: 'player',
    partyId: player.partyId,
  };
}

export function npcIdentity(): CombatIdentity {
  return { faction: 'npc' };
}

/**
 * Same-team players are allies in Raid and Solo. PvP treats every other
 * player as hostile even if they share a lobby.
 */
export function isFriendly(
  source: CombatIdentity,
  target: CombatIdentity,
  mode: GameMode,
): boolean {
  if (source.playerId && target.playerId && source.playerId === target.playerId) return true;
  if (source.faction === 'npc' || target.faction === 'npc') return false;
  if (source.faction !== 'player' || target.faction !== 'player') return false;
  if (mode === GameMode.PVP) return false;
  if (source.team && target.team) return source.team === target.team;
  if (source.partyId && target.partyId) return source.partyId === target.partyId;
  return false;
}
