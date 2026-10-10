import { RYDERZ, RYDER_ORDER, type EnemyKind, type RyderId } from '../config';

/** Cooperative raid is allies versus civilians. It is not PvP. */
export const SQUAD_SIZE = 5;
export const RAID_WAVES = 3;

export type SlotControl = 'human' | 'computer' | 'open' | 'disconnected' | 'reconnecting';
export type RaidDifficulty = 'easy' | 'normal' | 'hard';

export type RaidLifecycle =
  | 'LOBBY'
  | 'READY'
  | 'LOADING'
  | 'COUNTDOWN'
  | 'IN_PROGRESS'
  | 'VICTORY'
  | 'DEFEAT'
  | 'RESULTS'
  | 'RETURN_TO_LOBBY';

export interface SquadSlot {
  index: number;
  control: SlotControl;
  ryderId: RyderId | null;
  displayName: string;
  ready: boolean;
  /** Guest id of the human in this slot. Null for computer slots. */
  playerId: string | null;
  connected: boolean;
  /** Authoritative cover while a human is inside the reconnect window. */
  aiCover: boolean;
}

export interface RaidSquad {
  mode: 'COOPERATIVE_PVE';
  friendlyFire: false;
  difficulty: RaidDifficulty;
  arenaId: string;
  aiFill: boolean;
  slots: SquadSlot[];
}

export function isPlayableRyder(id: string | null | undefined): id is RyderId {
  return !!id && id in RYDERZ;
}

/** Computer slots default to fighters other than the host's pick. */
export function defaultAllyIds(hostId: RyderId | null): RyderId[] {
  const pool = RYDER_ORDER.filter((id) => id !== hostId);
  const preferred: RyderId[] = ['leo', 'aaron', 'zoe', 'keven', 'rubi', 'kid-paranormal', 'agent-nyx', 'lilly'];
  const ordered = [...preferred.filter((id) => pool.includes(id)), ...pool];
  return ordered.slice(0, SQUAD_SIZE - 1);
}

export function emptySlot(index: number): SquadSlot {
  return {
    index,
    control: 'open',
    ryderId: null,
    displayName: 'Open',
    ready: false,
    playerId: null,
    connected: false,
    aiCover: false,
  };
}

export function computerSlot(index: number, ryderId: RyderId): SquadSlot {
  const spec = RYDERZ[ryderId];
  return {
    index,
    control: 'computer',
    ryderId,
    displayName: spec.name,
    ready: true,
    playerId: null,
    connected: true,
    aiCover: false,
  };
}

export function defaultSquad(hostId: RyderId | null, hostName = 'Host'): RaidSquad {
  const allies = defaultAllyIds(hostId);
  const slots: SquadSlot[] = [emptySlot(0), ...allies.map((id, i) => computerSlot(i + 1, id))];
  while (slots.length < SQUAD_SIZE) slots.push(emptySlot(slots.length));
  const hostSpec = hostId ? RYDERZ[hostId] : null;
  slots[0] = {
    index: 0,
    control: 'human',
    ryderId: hostId,
    displayName: hostSpec?.name ?? hostName,
    ready: false,
    playerId: null,
    connected: true,
    aiCover: false,
  };
  return {
    mode: 'COOPERATIVE_PVE',
    friendlyFire: false,
    difficulty: 'normal',
    arenaId: 'training-pad',
    aiFill: true,
    slots,
  };
}

export interface RaidAllyLaunch {
  ryderId: RyderId;
  human: boolean;
  playerId: string | null;
}

export interface RaidLaunch {
  difficulty: RaidDifficulty;
  arenaId: string;
  allies: RaidAllyLaunch[];
}

export function launchFromSquad(squad: RaidSquad, localRyder: RyderId): RaidLaunch {
  return {
    difficulty: squad.difficulty,
    arenaId: squad.arenaId,
    allies: squad.slots.flatMap((slot) => {
      if (!slot.ryderId || slot.ryderId === localRyder && slot.index === 0) return [];
      if (slot.index === 0) return [];
      return [{ ryderId: slot.ryderId, human: slot.control === 'human' && !slot.aiCover, playerId: slot.playerId }];
    }),
  };
}

export function squadAllies(squad: RaidSquad): RyderId[] {
  return squad.slots.slice(1).flatMap((slot) => (slot.ryderId && isPlayableRyder(slot.ryderId) ? [slot.ryderId] : []));
}

/** Humans must be ready. Every active slot needs a real character. */
export function squadReady(squad: RaidSquad): boolean {
  const active = squad.slots.filter((slot) => slot.control === 'human' || slot.control === 'computer' || slot.control === 'reconnecting');
  if (!active.some((slot) => slot.control === 'human')) return false;
  return active.every((slot) => isPlayableRyder(slot.ryderId) && (slot.control !== 'human' || slot.ready || slot.aiCover));
}

/**
 * Civilian counts grow with the squad and the wave, and stay capped so five
 * fighters plus a wave do not all appear on the same frame.
 */
export function waveKinds(wave: number, squadSize: number): EnemyKind[] {
  const count = Math.min(8, 3 + wave + Math.max(0, squadSize - 2));
  const kinds: EnemyKind[] = [];
  for (let i = 0; i < count; i += 1) {
    if (i % 5 === 4) kinds.push('heavy');
    else if (i % 3 === 2) kinds.push('sprinter');
    else kinds.push('walker');
  }
  return kinds;
}
