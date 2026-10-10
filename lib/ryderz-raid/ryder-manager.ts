import { DEFAULT_ARENA, arenaSpec, type ArenaId } from './arenas';
import { RYDERZ, RYDER_ORDER, type AbilityId, type AbilitySpec, type RyderId } from './config';
import type { RaidEngine } from './engine';
import { coerceGameMode, GameMode, gameModeSpec } from './game-mode';
import type { SaveSnapshot } from './saves/saveManager';

export type InputSlot = 'Q' | 'E' | 'R';
export const INPUT_SLOTS: InputSlot[] = ['Q', 'E', 'R'];

/** A power as the Power Deck sees it: the ability spec plus ownership and deck state. */
export interface RyderAbility {
  id: AbilityId;
  name: string;
  description: string;
  /** Short sigil used by the deck UI (no icon atlas yet). */
  icon: string;
  /** Slot this power is equipped in for the Ryder being inspected, or null. */
  inputSlot: InputSlot | null;
  /** Seconds; instant powers are gated by aura rather than a timer today. */
  cooldown: number;
  unlocked: boolean;
  auraCost: number;
  drain: number;
  /** Ryder whose signature kit this power belongs to. */
  owner: RyderId;
}

export type PowerLoadout = Record<InputSlot, AbilityId>;

export interface RyderManagerState {
  activeRyder: RyderId;
  /** Every Ryder remembers their own deck; switching Ryderz never touches another deck. */
  loadouts: Record<RyderId, PowerLoadout>;
  /** Powers each Ryder may equip. Their signature kit is always present. */
  unlocked: Record<RyderId, AbilityId[]>;
  gameMode: GameMode;
  arenaId: ArenaId;
}

const STORAGE_KEY = 'ryderz-raid:ryder-manager:v1';

/** Every ability in the game keyed by id, built from the Ryder specs. */
export const ABILITIES: Record<AbilityId, AbilitySpec & { owner: RyderId }> = Object.fromEntries(
  RYDER_ORDER.flatMap((id) => RYDERZ[id].moves.map((move) => [move.id, { ...move, owner: id }])),
) as Record<AbilityId, AbilitySpec & { owner: RyderId }>;

const SIGILS: Record<AbilityId, string> = {
  bladeFan: 'BF',
  duplicate: 'DU',
  envyPulse: 'DT',
  shockwave: 'SW',
  overdrive: 'OD',
  prideDash: 'PD',
  cleave: 'CL',
  blink: 'BL',
  greedSiphon: 'GS',
  lift: 'LV',
  forcefield: 'FF',
  heartbreak: 'HB',
  decoy: 'DC',
  phase: 'PH',
  dartStorm: 'DS',
  soulDrain: 'SD',
  giantStep: 'GT',
  animalAllegiance: 'AA',
  phantomGrasp: 'PG',
  paranormalProjection: 'PP',
  dimensionalCollapse: '4C',
  nyxSlotQ: 'NQ',
  nyxSlotE: 'NE',
  nyxSlotR: 'NR',
};

export function defaultLoadout(id: RyderId): PowerLoadout {
  const [q, e, r] = RYDERZ[id].moves;
  return { Q: q.id, E: e.id, R: r.id };
}

function defaultState(): RyderManagerState {
  return {
    activeRyder: RYDER_ORDER[0],
    loadouts: Object.fromEntries(RYDER_ORDER.map((id) => [id, defaultLoadout(id)])) as Record<RyderId, PowerLoadout>,
    unlocked: Object.fromEntries(RYDER_ORDER.map((id) => [id, RYDERZ[id].moves.map((m) => m.id)])) as Record<
      RyderId,
      AbilityId[]
    >,
    gameMode: GameMode.SOLO,
    arenaId: DEFAULT_ARENA,
  };
}

function isRyderId(value: unknown): value is RyderId {
  return typeof value === 'string' && value in RYDERZ;
}

function isAbilityId(value: unknown): value is AbilityId {
  return typeof value === 'string' && value in ABILITIES;
}

/** Merge a stored snapshot over defaults, dropping anything that no longer exists. */
function hydrate(raw: unknown): RyderManagerState {
  const state = defaultState();
  if (!raw || typeof raw !== 'object') return state;
  const data = raw as Partial<RyderManagerState>;
  if (isRyderId(data.activeRyder)) state.activeRyder = data.activeRyder;
  if (data.gameMode) state.gameMode = coerceGameMode(data.gameMode);
  if (typeof data.arenaId === 'string' && arenaSpec(data.arenaId)?.available) state.arenaId = data.arenaId;
  for (const id of RYDER_ORDER) {
    const extra = data.unlocked?.[id];
    if (Array.isArray(extra)) {
      for (const ability of extra) {
        if (isAbilityId(ability) && !state.unlocked[id].includes(ability)) state.unlocked[id].push(ability);
      }
    }
    const deck = data.loadouts?.[id];
    if (deck) {
      for (const slot of INPUT_SLOTS) {
        const ability = deck[slot];
        if (isAbilityId(ability) && state.unlocked[id].includes(ability)) state.loadouts[id][slot] = ability;
      }
    }
  }
  return state;
}

type Listener = () => void;

/**
 * Owns which Ryder is in play, every Ryder's Power Deck, the game mode and the
 * arena. UI reads through `getState`/`subscribe`; gameplay changes flow to the
 * attached engine so menus never poke at combat state directly.
 */
export class RyderManager {
  private state: RyderManagerState;
  private listeners = new Set<Listener>();
  private engine: RaidEngine | null = null;

  constructor(initial?: Partial<RyderManagerState>) {
    this.state = { ...this.load(), ...initial };
  }

  // --- Store -------------------------------------------------------------------

  getState() {
    return this.state;
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private commit(patch: Partial<RyderManagerState>) {
    this.state = { ...this.state, ...patch };
    this.save();
    this.listeners.forEach((listener) => listener());
  }

  private load(): RyderManagerState {
    if (typeof window === 'undefined') return defaultState();
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return hydrate(raw ? JSON.parse(raw) : null);
    } catch {
      return defaultState();
    }
  }

  private save() {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Storage may be full or blocked; the session still works in memory.
    }
  }

  // --- Engine binding ----------------------------------------------------------

  attach(engine: RaidEngine) {
    this.engine = engine;
    engine.setGameMode(this.state.gameMode);
    if (engine.getArena().id !== this.state.arenaId) engine.loadArena(this.state.arenaId);
  }

  detach(engine?: RaidEngine) {
    if (!engine || this.engine === engine) this.engine = null;
  }

  // --- Ryderz ------------------------------------------------------------------

  get activeRyder() {
    return this.state.activeRyder;
  }

  /** Roster gating hook: every Ryder is playable in Solo today. */
  isRyderAvailable(id: RyderId, mode = this.state.gameMode) {
    return gameModeSpec(mode).available && id in RYDERZ;
  }

  /** Record the Ryder a raid is starting with (no engine swap). */
  setActiveRyder(id: RyderId) {
    if (id !== this.state.activeRyder) this.commit({ activeRyder: id });
  }

  /** Swap the playable Ryder, deck and all, inside the running raid. */
  async switchRyder(id: RyderId) {
    if (!this.isRyderAvailable(id)) return false;
    this.commit({ activeRyder: id });
    await this.engine?.switchRyder(id, this.loadoutSpecs(id));
    return true;
  }

  // --- Power Deck --------------------------------------------------------------

  loadout(id: RyderId): PowerLoadout {
    return this.state.loadouts[id];
  }

  /** The deck as engine-ready specs, in Q / E / R order. */
  loadoutSpecs(id: RyderId): AbilitySpec[] {
    const deck = this.state.loadouts[id];
    return INPUT_SLOTS.map((slot) => ABILITIES[deck[slot]]);
  }

  /** Every power in the game, annotated for the given Ryder's deck. */
  abilityPool(id: RyderId): RyderAbility[] {
    const deck = this.state.loadouts[id];
    const unlocked = this.state.unlocked[id];
    const slotOf = (ability: AbilityId) => INPUT_SLOTS.find((slot) => deck[slot] === ability) ?? null;
    const describe = (ability: AbilityId): RyderAbility => {
      const spec = ABILITIES[ability];
      return {
        id: ability,
        name: spec.name,
        description: spec.description,
        icon: SIGILS[ability],
        inputSlot: slotOf(ability),
        cooldown: 0,
        unlocked: unlocked.includes(ability),
        auraCost: spec.auraCost,
        drain: spec.drain,
        owner: spec.owner,
      };
    };
    // Own kit first, then the rest of the roster's powers in roster order.
    const own = RYDERZ[id].moves.map((move) => move.id);
    const others = RYDER_ORDER.filter((other) => other !== id).flatMap((other) =>
      RYDERZ[other].moves.map((move) => move.id),
    );
    return [...own, ...others].map(describe);
  }

  /**
   * Put a power in a slot. If it already sits in another slot the two swap, so
   * a deck never holds the same power twice.
   */
  equip(id: RyderId, slot: InputSlot, ability: AbilityId) {
    if (!this.state.unlocked[id].includes(ability)) return false;
    const deck = { ...this.state.loadouts[id] };
    const previous = INPUT_SLOTS.find((other) => deck[other] === ability);
    if (previous && previous !== slot) deck[previous] = deck[slot];
    deck[slot] = ability;
    this.commit({ loadouts: { ...this.state.loadouts, [id]: deck } });
    if (id === this.state.activeRyder) this.engine?.setLoadout(this.loadoutSpecs(id));
    return true;
  }

  resetLoadout(id: RyderId) {
    this.commit({ loadouts: { ...this.state.loadouts, [id]: defaultLoadout(id) } });
    if (id === this.state.activeRyder) this.engine?.setLoadout(this.loadoutSpecs(id));
  }

  unlock(id: RyderId, ability: AbilityId) {
    if (this.state.unlocked[id].includes(ability)) return;
    this.commit({ unlocked: { ...this.state.unlocked, [id]: [...this.state.unlocked[id], ability] } });
  }

  // --- Mode & arena ------------------------------------------------------------

  setGameMode(mode: GameMode) {
    if (!gameModeSpec(mode).available) return false;
    this.commit({ gameMode: mode });
    this.engine?.setGameMode(mode);
    return true;
  }

  /** Replace session state from a save slot without tearing down the manager. */
  applySnapshot(snapshot: SaveSnapshot) {
    this.state = hydrate(snapshot);
    this.save();
    this.listeners.forEach((listener) => listener());
    this.engine?.setGameMode(this.state.gameMode);
    if (this.engine && this.engine.getArena().id !== this.state.arenaId) {
      this.engine.loadArena(this.state.arenaId);
    }
  }

  resetSession() {
    this.state = defaultState();
    this.save();
    this.listeners.forEach((listener) => listener());
    this.engine?.setGameMode(this.state.gameMode);
  }

  setArena(id: ArenaId) {
    if (!arenaSpec(id)?.available) return false;
    this.commit({ arenaId: id });
    this.engine?.loadArena(id);
    return true;
  }
}
