import { RYDERZ, type RyderId } from '../config';
import { GameMode } from '../game-mode';
import { teamForMode } from './damageRules';
import {
  DEFAULT_PARTY_ID,
  LOCAL_PLAYER_ID,
  PARTY_HUD_CAPACITY,
  type PartySlot,
  type RaidInstance,
  type RaidParty,
  type RaidPlayer,
} from './playerTypes';

type Listener = () => void;

function localPlayer(ryder: RyderId | null, mode: GameMode): RaidPlayer {
  const spec = ryder ? RYDERZ[ryder] : null;
  return {
    id: LOCAL_PLAYER_ID,
    displayName: spec ? spec.name : 'Player 1',
    playerIndex: 0,
    partyId: DEFAULT_PARTY_ID,
    selectedRyder: ryder,
    health: spec?.maxHp ?? 100,
    maxHealth: spec?.maxHp ?? 100,
    aura: spec?.maxAura ?? 100,
    maxAura: spec?.maxAura ?? 100,
    team: 'raiders',
    isLocal: true,
    isAlive: true,
    isConnected: true,
    isPlaceholder: false,
  };
}

/**
 * Client-side roster. Player 1 is the existing local Ryder. Players 2–5 can
 * be HUD placeholders. Nobody in this store is spawned into the arena.
 */
type StoreSnapshot = {
  players: RaidPlayer[];
  localPlayerId: string;
  localPlayer: RaidPlayer;
  remotePlayers: RaidPlayer[];
  mode: GameMode;
  slots: PartySlot[];
};

export class PlayerStore {
  private players: RaidPlayer[] = [localPlayer(null, GameMode.SOLO)];
  private localPlayerId = LOCAL_PLAYER_ID;
  private mode: GameMode = GameMode.SOLO;
  private instanceId = 'raid-local';
  private listeners = new Set<Listener>();
  private snapshot: StoreSnapshot = this.buildSnapshot();

  getState() {
    return this.snapshot;
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private buildSnapshot(): StoreSnapshot {
    return {
      players: this.players,
      localPlayerId: this.localPlayerId,
      localPlayer: this.localPlayer(),
      remotePlayers: this.remotePlayers(),
      mode: this.mode,
      slots: this.partySlots(),
    };
  }

  private notify() {
    this.snapshot = this.buildSnapshot();
    this.listeners.forEach((listener) => listener());
  }

  localPlayer() {
    return this.players.find((player) => player.id === this.localPlayerId) ?? this.players[0];
  }

  remotePlayers() {
    return this.players.filter((player) => player.id !== this.localPlayerId);
  }

  getGameMode() {
    return this.mode;
  }

  /**
   * Always five HUD slots. Extra players in a future raid instance live on
   * other parties and are not shown in this strip.
   */
  partySlots(): PartySlot[] {
    const party = this.players.filter((player) => player.partyId === DEFAULT_PARTY_ID);
    return Array.from({ length: PARTY_HUD_CAPACITY }, (_, index) => ({
      index,
      player: party.find((player) => player.playerIndex === index) ?? null,
    }));
  }

  raidInstance(): RaidInstance {
    const byParty = new Map<string, RaidParty>();
    for (const player of this.players) {
      const existing = byParty.get(player.partyId);
      if (existing) existing.playerIds.push(player.id);
      else {
        byParty.set(player.partyId, {
          id: player.partyId,
          name: player.partyId === DEFAULT_PARTY_ID ? 'Squad A' : player.partyId,
          playerIds: [player.id],
        });
      }
    }
    return { id: this.instanceId, mode: this.mode, parties: [...byParty.values()] };
  }

  configure(opts: {
    mode: GameMode;
    localRyder: RyderId | null;
    seats?: Array<{ index: number; displayName: string; ryderId: RyderId | null; isLocal: boolean }>;
  }) {
    this.mode = opts.mode;
    if (opts.seats && opts.seats.length > 0) {
      this.players = opts.seats.map((seat) => {
        const spec = seat.ryderId ? RYDERZ[seat.ryderId] : null;
        return {
          id: seat.isLocal ? LOCAL_PLAYER_ID : `player-${seat.index + 1}`,
          displayName: spec?.name ?? seat.displayName,
          playerIndex: seat.index,
          partyId: DEFAULT_PARTY_ID,
          selectedRyder: seat.ryderId,
          health: spec?.maxHp ?? 100,
          maxHealth: spec?.maxHp ?? 100,
          aura: spec?.maxAura ?? 100,
          maxAura: spec?.maxAura ?? 100,
          team: teamForMode(opts.mode, seat.isLocal),
          isLocal: seat.isLocal,
          isAlive: true,
          isConnected: true,
          isPlaceholder: !seat.isLocal,
        };
      });
      const local = this.players.find((player) => player.isLocal);
      if (local) this.localPlayerId = local.id;
    } else {
      this.localPlayerId = LOCAL_PLAYER_ID;
      this.players = [localPlayer(opts.localRyder, opts.mode)];
    }
    this.notify();
  }

  setLocalRyder(id: RyderId) {
    const spec = RYDERZ[id];
    this.players = this.players.map((player) =>
      player.isLocal
        ? {
            ...player,
            selectedRyder: id,
            displayName: spec.name,
            health: spec.maxHp,
            maxHealth: spec.maxHp,
            aura: spec.maxAura,
            maxAura: spec.maxAura,
            isAlive: true,
          }
        : player,
    );
    this.notify();
  }

  /**
   * Mutate local vitals without notifying React. Call from the engine HUD
   * sync so the 3D loop does not rerender the party strip every frame.
   */
  syncLocalVitals(vitals: { health: number; maxHealth: number; aura: number; maxAura: number; isAlive: boolean }) {
    const local = this.localPlayer();
    if (!local) return;
    local.health = vitals.health;
    local.maxHealth = vitals.maxHealth;
    local.aura = vitals.aura;
    local.maxAura = vitals.maxAura;
    local.isAlive = vitals.isAlive;
  }
}
