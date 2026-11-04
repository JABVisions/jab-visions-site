import { DEFAULT_ARENA, arenaSpec, type ArenaId } from './arenas';
import { arenaChangeRestarts } from './raid/control';
import { RYDERZ, RYDER_ORDER, type AbilityId, type AbilitySpec, type RyderId } from './config';
import type { RaidEngine } from './engine';
import { coerceGameMode, GameMode, gameModeSpec } from './game-mode';
import type { SaveSnapshot } from './saves/saveManager';
import { DERIVED_POWERS, DERIVED_POWER_IDS } from './progression/derived-powers';
import {
  abilitiesGranted,
  abilityRanks,
  canUnlock,
  canUpgrade,
  modifiersFor,
  rankOfNode,
  recipesGranted,
  sanitizeRanks,
  sanitizeUnlocked,
  slotsGranted,
  spentOn,
  starterNodes,
  treeFor,
  type ExtraSlot,
  type NodeRanks,
  type PowerModifiers,
  type PowerNode,
  type UnlockCheck,
  type UpgradeCheck,
} from './progression/power-tree';
import { availableSignal, emptyLedger, levelForSignal, type SignalEvent, type SignalLedger } from './progression/signal-points';

/** Deck slots sit on the number row and fire with keys 1–6. */
export type InputSlot = '1' | '2' | '3' | '4' | '5' | '6';
export const INPUT_SLOTS: InputSlot[] = ['1', '2', '3', '4', '5', '6'];
/** The canonical three every Ryder starts with. */
export const BASE_SLOTS: InputSlot[] = ['1', '2', '3'];
export const EXTRA_SLOTS: ExtraSlot[] = ['4', '5', '6'];

/** Decks saved before the number-row layout bound the canonical three to Q / E / R. */
const LEGACY_SLOTS: Record<string, InputSlot> = { Q: '1', E: '2', R: '3' };

/** A power as the Power Deck sees it: the ability spec plus ownership and deck state. */
export interface RyderAbility {
  id: AbilityId;
  name: string;
  description: string;
  /** Slot this power is equipped in for the Ryder being inspected, or null. */
  inputSlot: InputSlot | null;
  /** Seconds; instant powers are gated by aura rather than a timer today. */
  cooldown: number;
  unlocked: boolean;
  auraCost: number;
  drain: number;
  /** Ryder whose signature kit this power belongs to. */
  owner: RyderId;
  /** Earned on the Power Tree rather than part of a canonical kit. */
  derived: boolean;
}

export type PowerLoadout = Record<InputSlot, AbilityId | null>;

export interface RyderManagerState {
  activeRyder: RyderId;
  /** Every Ryder remembers their own deck; switching Ryderz never touches another deck. */
  loadouts: Record<RyderId, PowerLoadout>;
  /** Powers each Ryder may equip. Their signature kit is always present. */
  unlocked: Record<RyderId, AbilityId[]>;
  /** Power Tree nodes each Ryder owns. Starter nodes are always present. */
  nodes: Record<RyderId, string[]>;
  /** Rank of each owned node. An owned node missing here is rank 1. */
  ranks: Record<RyderId, NodeRanks>;
  /** Signal Points: lifetime earned and lifetime spent. The wallet is shared across Ryderz. */
  signal: SignalLedger;
  gameMode: GameMode;
  arenaId: ArenaId;
}

const STORAGE_KEY = 'ryderz-raid:ryder-manager:v1';

/** Every ability in the game keyed by id: the Ryder kits plus the tree-earned powers. */
export const ABILITIES: Record<AbilityId, AbilitySpec & { owner: RyderId }> = {
  ...(Object.fromEntries(RYDER_ORDER.flatMap((id) => RYDERZ[id].moves.map((move) => [move.id, { ...move, owner: id }]))) as Record<
    AbilityId,
    AbilitySpec & { owner: RyderId }
  >),
  ...DERIVED_POWERS,
};

export function defaultLoadout(id: RyderId): PowerLoadout {
  const [one, two, three] = RYDERZ[id].moves;
  return { '1': one.id, '2': two.id, '3': three.id, '4': null, '5': null, '6': null };
}

/** Pull extra slots down so 4 fills before 5 and 5 before 6; the engine's slot order stays dense. */
function compactExtras(deck: PowerLoadout) {
  const held = EXTRA_SLOTS.map((slot) => deck[slot]).filter((ability): ability is AbilityId => Boolean(ability));
  EXTRA_SLOTS.forEach((slot, i) => {
    deck[slot] = held[i] ?? null;
  });
}

function defaultState(): RyderManagerState {
  return {
    activeRyder: RYDER_ORDER[0],
    loadouts: Object.fromEntries(RYDER_ORDER.map((id) => [id, defaultLoadout(id)])) as Record<RyderId, PowerLoadout>,
    unlocked: Object.fromEntries(RYDER_ORDER.map((id) => [id, RYDERZ[id].moves.map((m) => m.id)])) as Record<
      RyderId,
      AbilityId[]
    >,
    nodes: Object.fromEntries(RYDER_ORDER.map((id) => [id, starterNodes(id)])) as Record<RyderId, string[]>,
    ranks: Object.fromEntries(RYDER_ORDER.map((id) => [id, sanitizeRanks(treeFor(id), starterNodes(id), {})])) as Record<RyderId, NodeRanks>,
    signal: emptyLedger(),
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
export function hydrate(raw: unknown): RyderManagerState {
  const state = defaultState();
  if (!raw || typeof raw !== 'object') return state;
  const data = raw as Partial<RyderManagerState>;
  if (isRyderId(data.activeRyder)) state.activeRyder = data.activeRyder;
  if (data.gameMode) state.gameMode = coerceGameMode(data.gameMode);
  if (typeof data.arenaId === 'string' && arenaSpec(data.arenaId)?.available) state.arenaId = data.arenaId;
  const signal = data.signal;
  if (signal && typeof signal === 'object') {
    const earned = Number((signal as Partial<SignalLedger>).earned);
    const spent = Number((signal as Partial<SignalLedger>).spent);
    state.signal.earned = Number.isFinite(earned) && earned > 0 ? Math.floor(earned) : 0;
    state.signal.spent = Number.isFinite(spent) && spent > 0 ? Math.floor(spent) : 0;
  }
  for (const id of RYDER_ORDER) {
    const tree = treeFor(id);
    const rawNodes = data.nodes?.[id];
    state.nodes[id] = sanitizeUnlocked(tree, Array.isArray(rawNodes) ? rawNodes.filter((n): n is string => typeof n === 'string') : []);
    // Saves from before ranks carry no `ranks`; every owned node comes back at rank 1.
    state.ranks[id] = sanitizeRanks(tree, state.nodes[id], data.ranks?.[id]);
    const granted = abilitiesGranted(tree, state.nodes[id]);
    for (const ability of granted) if (!state.unlocked[id].includes(ability)) state.unlocked[id].push(ability);
    const extra = data.unlocked?.[id];
    if (Array.isArray(extra)) {
      for (const ability of extra) {
        // Derived powers are owned through the tree only; legacy flat unlocks cannot smuggle them in.
        if (isAbilityId(ability) && !(ability in DERIVED_POWERS) && !state.unlocked[id].includes(ability)) state.unlocked[id].push(ability);
      }
    }
    const deck = data.loadouts?.[id];
    if (deck) {
      const slots = slotsGranted(tree, state.nodes[id]);
      const stored = deck as Record<string, unknown>;
      for (const slot of INPUT_SLOTS) {
        const legacy = Object.keys(LEGACY_SLOTS).find((key) => LEGACY_SLOTS[key] === slot);
        const ability = stored[slot] ?? (legacy ? stored[legacy] : undefined);
        if (slot === '4' || slot === '5' || slot === '6') {
          if (!slots.includes(slot)) continue;
        }
        if (isAbilityId(ability) && state.unlocked[id].includes(ability)) state.loadouts[id][slot] = ability;
      }
      // Never hold the same power twice.
      const seen = new Set<AbilityId>();
      for (const slot of INPUT_SLOTS) {
        const ability = state.loadouts[id][slot];
        if (!ability) continue;
        if (seen.has(ability)) state.loadouts[id][slot] = BASE_SLOTS.includes(slot) ? defaultLoadout(id)[slot] : null;
        else seen.add(ability);
      }
      compactExtras(state.loadouts[id]);
    }
  }
  // The owned nodes and their ranks are the ledger of record: a save from an
  // older price list, or a tampered one, settles to what the trees say was spent.
  state.signal.spent = RYDER_ORDER.reduce((sum, id) => sum + spentOn(treeFor(id), state.nodes[id], state.ranks[id]), 0);
  if (state.signal.spent > state.signal.earned) state.signal.spent = state.signal.earned;
  return state;
}

type Listener = () => void;

/** A tree node annotated for the UI. */
export interface PowerNodeView extends PowerNode {
  owned: boolean;
  /** Current rank, 0 when unowned. */
  rank: number;
  /** Buying rank 1. */
  check: UnlockCheck;
  /** Buying the next rank of an owned node. */
  upgrade: UpgradeCheck;
  /** The granted ability's deck slot, when it is equipped. */
  equippedIn: InputSlot | null;
}

/**
 * Owns which Ryder is in play, every Ryder's Power Deck and Power Tree, the
 * Signal Points wallet, the game mode and the arena. UI reads through
 * `getState`/`subscribe`; gameplay changes flow to the attached engine so
 * menus never poke at combat state directly.
 */
export class RyderManager {
  private state: RyderManagerState;
  private listeners = new Set<Listener>();
  private engine: RaidEngine | null = null;
  private unhookSignal: (() => void) | null = null;

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
    this.unhookSignal?.();
    this.unhookSignal = engine.setSignalHook((event) => this.onSignal(event));
    this.pushProgression(this.state.activeRyder);
  }

  detach(engine?: RaidEngine) {
    if (!engine || this.engine === engine) {
      this.unhookSignal?.();
      this.unhookSignal = null;
      this.engine = null;
    }
  }

  /** The engine resolved an SP event for the local player. */
  private onSignal(event: SignalEvent) {
    if (event.amount <= 0) return;
    this.commit({ signal: { ...this.state.signal, earned: this.state.signal.earned + Math.floor(event.amount) } });
  }

  private pushProgression(id: RyderId) {
    if (!this.engine) return;
    const tree = treeFor(id);
    const owned = this.state.nodes[id];
    const ranks = this.state.ranks[id];
    this.engine.setProgression({
      modifiers: modifiersFor(tree, owned, ranks),
      recipes: recipesGranted(tree, owned),
      signal: this.state.signal,
      slots: this.slotsFor(id).length,
      ranks: abilityRanks(tree, owned, ranks),
    });
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
    this.pushProgression(id);
  }

  /** Swap the playable Ryder, deck and all, inside the running raid. */
  async switchRyder(id: RyderId) {
    if (!this.isRyderAvailable(id)) return false;
    this.commit({ activeRyder: id });
    await this.engine?.switchRyder(id, this.loadoutSpecs(id));
    this.pushProgression(id);
    return true;
  }

  // --- Signal Points -----------------------------------------------------------

  signal(): SignalLedger {
    return this.state.signal;
  }

  signalAvailable() {
    return availableSignal(this.state.signal);
  }

  level() {
    return levelForSignal(this.state.signal.earned);
  }

  /** Grant SP from outside the engine (a remote raid report, a debug tool). */
  earnSignal(amount: number) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.commit({ signal: { ...this.state.signal, earned: this.state.signal.earned + Math.floor(amount) } });
    this.pushProgression(this.state.activeRyder);
  }

  // --- Power Tree --------------------------------------------------------------

  tree(id: RyderId) {
    return treeFor(id);
  }

  ownedNodes(id: RyderId): string[] {
    return this.state.nodes[id];
  }

  nodeRanks(id: RyderId): NodeRanks {
    return this.state.ranks[id];
  }

  modifiers(id: RyderId): PowerModifiers {
    return modifiersFor(treeFor(id), this.state.nodes[id], this.state.ranks[id]);
  }

  /** Rank the engine plays a power at for this Ryder: 1 when it is unranked or not from the tree. */
  rankOfAbility(id: RyderId, ability: AbilityId) {
    return abilityRanks(treeFor(id), this.state.nodes[id], this.state.ranks[id])[ability] ?? 1;
  }

  /** Slots this Ryder may equip into: 1 / 2 / 3 plus whatever the tree opened. */
  slotsFor(id: RyderId): InputSlot[] {
    return [...BASE_SLOTS, ...slotsGranted(treeFor(id), this.state.nodes[id])];
  }

  treeView(id: RyderId): PowerNodeView[] {
    const tree = treeFor(id);
    const owned = this.state.nodes[id];
    const ranks = this.state.ranks[id];
    const deck = this.state.loadouts[id];
    const available = this.signalAvailable();
    const level = this.level();
    return tree.nodes.map((node) => ({
      ...node,
      owned: owned.includes(node.id),
      rank: rankOfNode(owned, ranks, node.id),
      check: canUnlock(tree, owned, node.id, available, level),
      upgrade: canUpgrade(tree, owned, ranks, node.id, available, level),
      equippedIn:
        node.effect.kind === 'ability' ? INPUT_SLOTS.find((slot) => deck[slot] === (node.effect as { abilityId: AbilityId }).abilityId) ?? null : null,
    }));
  }

  canUnlockNode(id: RyderId, nodeId: string): UnlockCheck {
    return canUnlock(treeFor(id), this.state.nodes[id], nodeId, this.signalAvailable(), this.level());
  }

  canUpgradeNode(id: RyderId, nodeId: string): UpgradeCheck {
    return canUpgrade(treeFor(id), this.state.nodes[id], this.state.ranks[id], nodeId, this.signalAvailable(), this.level());
  }

  /**
   * Spend SP on rank 1 of a node. Granted powers join the pool without
   * touching the deck; the player binds them from the Power Tree or the deck.
   */
  unlockNode(id: RyderId, nodeId: string): boolean {
    const tree = treeFor(id);
    const check = canUnlock(tree, this.state.nodes[id], nodeId, this.signalAvailable(), this.level());
    if (!check.ok) return false;
    const node = tree.nodes.find((entry) => entry.id === nodeId)!;
    const nodes = { ...this.state.nodes, [id]: [...this.state.nodes[id], nodeId] };
    const ranks = { ...this.state.ranks, [id]: { ...this.state.ranks[id], [nodeId]: 1 } };
    const unlocked = { ...this.state.unlocked };
    if (node.effect.kind === 'ability' && !unlocked[id].includes(node.effect.abilityId)) {
      unlocked[id] = [...unlocked[id], node.effect.abilityId];
    }
    this.commit({
      nodes,
      ranks,
      unlocked,
      signal: { ...this.state.signal, spent: this.state.signal.spent + node.cost },
    });
    if (id === this.state.activeRyder) this.pushProgression(id);
    return true;
  }

  /** Spend SP on the next rank of an owned node. */
  upgradeNode(id: RyderId, nodeId: string): boolean {
    const check = canUpgrade(treeFor(id), this.state.nodes[id], this.state.ranks[id], nodeId, this.signalAvailable(), this.level());
    if (!check.ok) return false;
    this.commit({
      ranks: { ...this.state.ranks, [id]: { ...this.state.ranks[id], [nodeId]: check.nextRank } },
      signal: { ...this.state.signal, spent: this.state.signal.spent + check.cost },
    });
    if (id === this.state.activeRyder) this.pushProgression(id);
    return true;
  }

  /** Unlock when unowned, otherwise rank up. The Power Tree's one button. */
  buyNode(id: RyderId, nodeId: string): boolean {
    return this.state.nodes[id].includes(nodeId) ? this.upgradeNode(id, nodeId) : this.unlockNode(id, nodeId);
  }

  // --- Power Deck --------------------------------------------------------------

  loadout(id: RyderId): PowerLoadout {
    return this.state.loadouts[id];
  }

  /**
   * The deck as engine-ready specs: slots 1 / 2 / 3, then any equipped extra
   * slot in order. Index i is the engine's slot i.
   */
  loadoutSpecs(id: RyderId): AbilitySpec[] {
    const deck = this.state.loadouts[id];
    const specs: AbilitySpec[] = BASE_SLOTS.map((slot) => ABILITIES[deck[slot] ?? defaultLoadout(id)[slot]!]);
    for (const slot of EXTRA_SLOTS) {
      const ability = deck[slot];
      if (!ability) break;
      specs.push(ABILITIES[ability]);
    }
    return specs;
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
        inputSlot: slotOf(ability),
        cooldown: 0,
        unlocked: unlocked.includes(ability),
        auraCost: spec.auraCost,
        drain: spec.drain,
        owner: spec.owner,
        derived: ability in DERIVED_POWERS,
      };
    };
    // Own kit, own tree powers, then the rest of the roster's powers in roster order.
    const own = RYDERZ[id].moves.map((move) => move.id);
    const ownDerived = DERIVED_POWER_IDS.filter((derived) => DERIVED_POWERS[derived].owner === id);
    const others = RYDER_ORDER.filter((other) => other !== id).flatMap((other) =>
      RYDERZ[other].moves.map((move) => move.id),
    );
    return [...own, ...ownDerived, ...others].map(describe);
  }

  /**
   * Put a power in a slot. If it already sits in another slot the two swap, so
   * a deck never holds the same power twice. Extra slots must be opened on the
   * tree, and an extra slot fills the lowest empty one first so the engine's
   * slot order stays dense.
   */
  equip(id: RyderId, slot: InputSlot, ability: AbilityId) {
    if (!this.state.unlocked[id].includes(ability)) return false;
    const open = this.slotsFor(id);
    if (!open.includes(slot)) return false;
    const deck = { ...this.state.loadouts[id] };
    let target = slot;
    if (!BASE_SLOTS.includes(target)) {
      const firstEmpty = EXTRA_SLOTS.find((extra) => !deck[extra]);
      if (firstEmpty && firstEmpty < target) target = firstEmpty;
    }
    const previous = INPUT_SLOTS.find((other) => deck[other] === ability);
    if (previous && previous !== target) deck[previous] = deck[target];
    deck[target] = ability;
    // A base slot can never be empty after a swap.
    for (const base of BASE_SLOTS) if (!deck[base]) deck[base] = defaultLoadout(id)[base];
    compactExtras(deck);
    this.commit({ loadouts: { ...this.state.loadouts, [id]: deck } });
    if (id === this.state.activeRyder) this.engine?.setLoadout(this.loadoutSpecs(id));
    return true;
  }

  /** Empty an extra slot. Slots 1 / 2 / 3 always hold something. */
  unequip(id: RyderId, slot: ExtraSlot) {
    const deck = { ...this.state.loadouts[id] };
    if (!deck[slot]) return false;
    deck[slot] = null;
    compactExtras(deck);
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
    this.pushProgression(this.state.activeRyder);
  }

  resetSession() {
    this.state = defaultState();
    this.save();
    this.listeners.forEach((listener) => listener());
    this.engine?.setGameMode(this.state.gameMode);
    this.pushProgression(this.state.activeRyder);
  }

  setArena(id: ArenaId) {
    if (!arenaSpec(id)?.available) return false;
    const previous = this.state.arenaId;
    const live = Boolean(this.engine?.matchLive());
    this.commit({ arenaId: id });
    this.engine?.loadArena(id, { restart: arenaChangeRestarts(previous, id, live) });
    return true;
  }
}
