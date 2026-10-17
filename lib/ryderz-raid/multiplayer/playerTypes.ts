import type { RyderId } from '../config';
import type { GameMode } from '../game-mode';

/** Visible squad strip. A raid instance may contain several parties later. */
export const PARTY_HUD_CAPACITY = 5;
export const PLAYERS_PER_PARTY = 5;

export type TeamId = 'raiders' | 'opposing';

export interface RaidPlayer {
  id: string;
  displayName: string;
  playerIndex: number;
  /** Party this player belongs to. HUD shows one party; a raid may have many. */
  partyId: string;
  selectedRyder: RyderId | null;
  health: number;
  maxHealth: number;
  aura: number;
  maxAura: number;
  team: TeamId;
  isLocal: boolean;
  isAlive: boolean;
  isConnected: boolean;
  /** HUD-only stand-in. Not spawned in the arena. */
  isPlaceholder: boolean;
}

export interface RaidParty {
  id: string;
  name: string;
  playerIds: string[];
}

/**
 * A raid instance is a collection of parties, not a hard cap of five players.
 * Five is only the party HUD capacity.
 */
export interface RaidInstance {
  id: string;
  mode: GameMode;
  parties: RaidParty[];
}

export interface PartySlot {
  index: number;
  player: RaidPlayer | null;
}

export const LOCAL_PLAYER_ID = 'player-1';
export const DEFAULT_PARTY_ID = 'party-a';
