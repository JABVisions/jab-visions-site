import { RYDERZ, RYDER_ORDER, type AbilityId, type RyderId } from '../config';
import type { ComboRecipe } from '../fighter/combo';
import { MAX_RANK, derivedPowerOfKind } from './derived-powers';
import { powerTypeOf, type PowerType } from './power-types';

/**
 * Power Trees, X-Men Legends style. Every Ryder has a Powers tree — nine
 * powers of six types, the canonical three at the root and the Xtreme at the
 * crown — and three Skills branches (Combat, Defense, Signal). A node is
 * bought once with Signal Points and then ranked up to `maxRank`; each rank
 * raises a power's damage and reach and trims its cost, or stacks a skill's
 * bonus again. Deeper nodes also ask for a Ryder level. Unlocking never
 * touches the equipped deck: a granted power sits in the pool until bound.
 */
export type PowerBranch = 'powers' | 'combat' | 'defense' | 'signal';

/** Deck slots the tree can open. 1 / 2 / 3 are always open. */
export type ExtraSlot = '4' | '5' | '6';

export const POWER_BRANCHES: PowerBranch[] = ['powers', 'combat', 'defense', 'signal'];

/** Branches shown on the Skills tab; the Powers tab is the `powers` branch alone. */
export const SKILL_BRANCHES: PowerBranch[] = ['combat', 'defense', 'signal'];

export const BRANCH_LABEL: Record<PowerBranch, string> = {
  powers: 'Powers',
  combat: 'Combat',
  defense: 'Defense',
  signal: 'Signal',
};

export const BRANCH_BLURB: Record<PowerBranch, string> = {
  powers: 'Nine powers of six types, ranked 1–5',
  combat: 'Fists, launchers, aerials, finishers',
  defense: 'Health, footwork, guard, second wind',
  signal: 'Power cost and deck slots 4 · 5 · 6',
};

export type StatKey =
  | 'meleeDamage'
  | 'heavyDamage'
  | 'launchPower'
  | 'aerialDamage'
  | 'finisherDamage'
  | 'maxHp'
  | 'maxAura'
  | 'auraRegen'
  | 'dodgeCooldown'
  | 'guard'
  | 'abilityCost'
  | 'comboWindow'
  | 'knockback'
  | 'hitStunResist';

export type PassiveId = 'secondWind' | 'auraOnKill' | 'momentum';

/** A stat effect's `value` is per rank: rank 3 of +5% is +15%. */
export type NodeEffect =
  | { kind: 'ability'; abilityId: AbilityId }
  | { kind: 'stat'; stat: StatKey; value: number }
  | { kind: 'combo'; recipe: ComboRecipe }
  | { kind: 'slot'; slot: ExtraSlot }
  | { kind: 'passive'; passive: PassiveId };

export interface PowerNode {
  id: string;
  ryderId: RyderId;
  branch: PowerBranch;
  /** 1 is a starter node, higher tiers sit deeper in the branch. */
  tier: 1 | 2 | 3 | 4;
  name: string;
  description: string;
  /** SP to buy rank 1. Later ranks follow `upgradeCost`. */
  cost: number;
  requires: string[];
  effect: NodeEffect;
  /** Highest rank this node reaches. One-shot nodes (combos, slots, passives) stop at 1. */
  maxRank: number;
  /** Ryder level needed to buy rank 1. 0 means none. */
  minLevel: number;
  /** For ability nodes, the power's type; the menus badge and colour by it. */
  type?: PowerType;
  /** Starting nodes are owned from the first match. */
  starter?: boolean;
}

export interface PowerTree {
  ryderId: RyderId;
  nodes: PowerNode[];
}

/** Node id → rank for the nodes a Ryder owns. Owned nodes are at least rank 1. */
export type NodeRanks = Record<string, number>;

/** Additive modifiers the engine reads. All default to 0. */
export type PowerModifiers = Record<StatKey, number> & { passives: PassiveId[] };

export function emptyModifiers(): PowerModifiers {
  return {
    meleeDamage: 0,
    heavyDamage: 0,
    launchPower: 0,
    aerialDamage: 0,
    finisherDamage: 0,
    maxHp: 0,
    maxAura: 0,
    auraRegen: 0,
    dodgeCooldown: 0,
    guard: 0,
    abilityCost: 0,
    comboWindow: 0,
    knockback: 0,
    hitStunResist: 0,
    passives: [],
  };
}

interface Flavor {
  chain: string;
  chainBlurb: string;
  finisher: string;
  stance: string;
  footwork: string;
  guard: string;
  secondWind: string;
}

const FLAVOR: Record<RyderId, Flavor> = {
  leo: { chain: 'Velocity Chain', chainBlurb: 'Extra high-speed strikes after a launcher.', finisher: 'Pride Stomp', stance: 'Heir of Pride', footwork: 'Afterburner Step', guard: 'Golden Guard', secondWind: 'Second Wind' },
  rubi: { chain: 'Blade Cadence', chainBlurb: 'Blade follow-ups chain off a heavy.', finisher: 'Crimson Verdict', stance: 'Blade Stance', footwork: 'Razor Step', guard: 'Steel Guard', secondWind: 'Unbroken' },
  aaron: { chain: 'Greed Chain', chainBlurb: 'Axe strikes keep coming while the target is down.', finisher: 'Umbral Execution', stance: 'Shadow Stance', footwork: 'Dark Step', guard: 'Shadow Guard', secondWind: 'Covetous Heart' },
  zoe: { chain: 'Plasma Chain', chainBlurb: 'Plasma strikes ripple into extra hits.', finisher: 'Ion Crush', stance: 'Overcharge Stance', footwork: 'Static Step', guard: 'Field Guard', secondWind: 'Reignite' },
  keven: { chain: 'Acrobat Chain', chainBlurb: 'Flip kicks carry a juggle further.', finisher: 'Needle Drop', stance: 'Acrobat Stance', footwork: 'Vault Step', guard: 'Deflect', secondWind: 'Bounce Back' },
  lilly: { chain: 'Famine Chain', chainBlurb: 'Fork strikes link into longer strings.', finisher: 'Reaping', stance: 'Hunger Stance', footwork: 'Gaunt Step', guard: 'Bone Guard', secondWind: 'Starving Will' },
  'kid-paranormal': { chain: 'Phantom Chain', chainBlurb: 'Baton strikes echo across dimensions.', finisher: 'Rift Slam', stance: 'Spectral Stance', footwork: 'Phase Step', guard: 'Ecto Guard', secondWind: 'Return Trip' },
  'agent-nyx': { chain: 'Temporal Chain', chainBlurb: 'Palm strikes land a second time.', finisher: 'Zero Hour Drop', stance: 'Agent Stance', footwork: 'Rewind Step', guard: 'Paradox Guard', secondWind: 'Second Timeline' },
  'marilyn-monroe': { chain: 'Showstopper Chain', chainBlurb: 'Encore strikes after a heavy.', finisher: 'Curtain Call', stance: 'Spotlight Stance', footwork: 'Stage Step', guard: 'Glamour Guard', secondWind: 'Standing Ovation' },
  'martin-luther-king': { chain: 'Cadence Chain', chainBlurb: 'Strikes land on the beat for extra hits.', finisher: 'Summit Drop', stance: 'Resolute Stance', footwork: 'March Step', guard: 'Steadfast Guard', secondWind: 'Keep Marching' },
  marywantis: { chain: 'Tide Chain', chainBlurb: 'Tide palms roll into extra strikes.', finisher: 'Undertow', stance: 'Current Stance', footwork: 'Surf Step', guard: 'Reef Guard', secondWind: 'High Tide' },
  tj: { chain: 'Riot Chain', chainBlurb: 'Pistol-whips chain into a flurry.', finisher: 'Last Word', stance: 'Riot Stance', footwork: 'Alley Step', guard: 'Street Guard', secondWind: 'Still Standing' },
};

/** Ryder level a tier asks for before its rank 1 can be bought. */
export const TIER_LEVEL: Record<PowerNode['tier'], number> = { 1: 0, 2: 2, 3: 4, 4: 7 };

/** Highest rank any node may reach at a Ryder level: a new rank every two levels. */
export function rankCapAt(level: number) {
  return Math.max(1, Math.min(MAX_RANK, 1 + Math.floor(Math.max(1, level) / 2)));
}

/** Level at which `rank` first becomes available. */
export function levelForRank(rank: number) {
  return rank <= 1 ? 1 : (rank - 1) * 2;
}

/** Rank-up pricing for a free starter power, which has no base cost of its own. */
const STARTER_RANK_BASE = 300;

/** SP to buy `rank` of a node: rank 1 is the listed cost, every later rank costs more than the one before. */
export function upgradeCost(node: PowerNode, rank: number) {
  if (rank <= 1) return node.cost;
  const base = node.cost || STARTER_RANK_BASE;
  return Math.round((base * (0.8 + 0.3 * (rank - 1))) / 50) * 50;
}

/** Every SP a node has taken up to and including `rank`. */
export function costThroughRank(node: PowerNode, rank: number) {
  let total = 0;
  for (let r = 1; r <= Math.min(rank, node.maxRank); r += 1) total += upgradeCost(node, r);
  return total;
}

/**
 * Builds the standard 22-node tree for a Ryder. The canonical three powers
 * (slots 1 / 2 / 3) are starter nodes and are never gated. Costs follow the
 * design brief: starter nodes free, first upgrades a few hundred SP, the
 * Xtreme 3,000. Stat values are per rank.
 */
export function buildTree(ryderId: RyderId): PowerTree {
  const spec = RYDERZ[ryderId];
  const f = FLAVOR[ryderId];
  const [one, two, three] = spec.moves;
  const breaker = derivedPowerOfKind(ryderId, 'breaker');
  const volley = derivedPowerOfKind(ryderId, 'volley');
  const nova = derivedPowerOfKind(ryderId, 'nova');
  const snare = derivedPowerOfKind(ryderId, 'snare');
  const surge = derivedPowerOfKind(ryderId, 'surge');
  const blitz = derivedPowerOfKind(ryderId, 'blitz');
  const p = (id: string) => `${ryderId}:${id}`;
  const node = (
    id: string,
    branch: PowerBranch,
    tier: PowerNode['tier'],
    name: string,
    description: string,
    cost: number,
    requires: string[],
    effect: NodeEffect,
    starter = false,
  ): PowerNode => ({
    id: p(id),
    ryderId,
    branch,
    tier,
    name,
    description,
    cost,
    requires: requires.map(p),
    effect,
    maxRank: effect.kind === 'ability' || effect.kind === 'stat' ? MAX_RANK : 1,
    minLevel: starter ? 0 : TIER_LEVEL[tier],
    type: effect.kind === 'ability' ? powerTypeOf(effect.abilityId) : undefined,
    starter,
  });
  const power = (id: string, tier: PowerNode['tier'], ability: { id: AbilityId; name: string; description: string } | undefined, cost: number, requires: string[], starter = false) =>
    ability ? [node(id, 'powers', tier, ability.name, ability.description, cost, requires, { kind: 'ability', abilityId: ability.id }, starter)] : [];

  const chainRecipe: ComboRecipe = {
    id: `${ryderId}-chain`,
    sequence: ['launcher', 'punch', 'punch', 'punch'],
    effect: 'juggle',
    label: f.chain.toUpperCase(),
  };
  const finisherRecipe: ComboRecipe = {
    id: `${ryderId}-verdict`,
    sequence: ['heavy', 'kick', 'finisher'],
    effect: 'finisher',
    label: f.finisher.toUpperCase(),
  };

  const nodes: PowerNode[] = [
    // Powers: the canonical three at the root, one of each type above them, the Xtreme at the crown.
    ...power('q', 1, one, 0, [], true),
    ...power('e', 1, two, 0, [], true),
    ...power('r', 1, three, 0, [], true),
    ...power('breaker', 2, breaker, 750, ['q']),
    ...power('volley', 2, volley, 700, ['e']),
    ...power('snare', 2, snare, 800, ['r']),
    ...power('nova', 3, nova, 1200, ['breaker', 'volley']),
    ...power('surge', 3, surge, 1200, ['snare']),
    ...power('blitz', 4, blitz, 3000, ['nova', 'surge']),
    // Combat
    node('fists', 'combat', 1, 'Hardened Fists', 'Punches, kicks, and melee hit 5% harder per rank.', 250, [], { kind: 'stat', stat: 'meleeDamage', value: 0.05 }),
    node('launcher', 'combat', 2, 'Launcher Mastery', 'Sprint + kick launches 12% higher per rank and keeps targets in the air longer.', 500, ['fists'], { kind: 'stat', stat: 'launchPower', value: 0.12 }),
    node('chain', 'combat', 2, f.chain, f.chainBlurb, 1000, ['fists'], { kind: 'combo', recipe: chainRecipe }),
    node('aerial', 'combat', 3, 'Air Rave', 'Aerial strikes deal 8% more per rank and slam harder on landing.', 750, ['launcher'], { kind: 'stat', stat: 'aerialDamage', value: 0.08 }),
    node('finisher', 'combat', 4, f.finisher, 'Ground finishers deal more and pay out as combo finishers.', 1400, ['chain', 'launcher'], { kind: 'combo', recipe: finisherRecipe }),
    // Defense
    node('stance', 'defense', 1, f.stance, '+12 maximum health per rank.', 300, [], { kind: 'stat', stat: 'maxHp', value: 12 }),
    node('footwork', 'defense', 2, f.footwork, 'Dodge recovers 8% faster per rank.', 500, ['stance'], { kind: 'stat', stat: 'dodgeCooldown', value: -0.08 }),
    node('guard', 'defense', 2, f.guard, 'Holding dodge blocks 8% more damage per rank.', 500, ['stance'], { kind: 'stat', stat: 'guard', value: 0.08 }),
    node('second-wind', 'defense', 3, f.secondWind, 'Once per round, a lethal blow leaves you at 1 health instead.', 1200, ['footwork', 'guard'], { kind: 'passive', passive: 'secondWind' }),
    // Signal: power cost and the deck
    node('focus', 'signal', 1, 'Signal Focus', 'Powers cost 5% less aura per rank.', 400, [], { kind: 'stat', stat: 'abilityCost', value: -0.05 }),
    node('slot4', 'signal', 2, 'Expanded Deck', 'Opens a fourth power slot bound to 4.', 600, ['focus'], { kind: 'slot', slot: '4' }),
    node('slot5', 'signal', 3, 'Full Deck', 'Opens a fifth power slot bound to 5.', 1200, ['slot4'], { kind: 'slot', slot: '5' }),
    node('slot6', 'signal', 4, 'Overclocked Deck', 'Opens a sixth power slot bound to 6.', 2000, ['slot5'], { kind: 'slot', slot: '6' }),
  ];
  return { ryderId, nodes };
}

const TREES = new Map<RyderId, PowerTree>();

export function treeFor(ryderId: RyderId): PowerTree {
  let tree = TREES.get(ryderId);
  if (!tree) {
    tree = buildTree(ryderId);
    TREES.set(ryderId, tree);
  }
  return tree;
}

export function allTrees(): PowerTree[] {
  return RYDER_ORDER.map((id) => treeFor(id));
}

export function nodeById(ryderId: RyderId, id: string): PowerNode | undefined {
  return treeFor(ryderId).nodes.find((node) => node.id === id);
}

/** Nodes every Ryder owns before spending anything. */
export function starterNodes(ryderId: RyderId): string[] {
  return treeFor(ryderId)
    .nodes.filter((node) => node.starter)
    .map((node) => node.id);
}

/** Structural checks: ids unique, prerequisites exist, no cycles, costs sane, 12–24 nodes, ranks sane. */
export function validateTree(tree: PowerTree): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const node of tree.nodes) {
    if (ids.has(node.id)) problems.push(`duplicate node ${node.id}`);
    ids.add(node.id);
    if (!node.id.startsWith(`${tree.ryderId}:`)) problems.push(`node ${node.id} is not namespaced to ${tree.ryderId}`);
    if (node.cost < 0 || !Number.isFinite(node.cost)) problems.push(`node ${node.id} has a bad cost`);
    if (node.starter && node.cost !== 0) problems.push(`starter ${node.id} must be free`);
    if (!node.starter && node.cost === 0) problems.push(`node ${node.id} is free but not a starter`);
    if (node.maxRank < 1 || node.maxRank > MAX_RANK) problems.push(`node ${node.id} has maxRank ${node.maxRank}`);
    if (node.effect.kind === 'ability' && !node.type) problems.push(`power ${node.id} has no type`);
    if (node.minLevel < 0) problems.push(`node ${node.id} has a negative level gate`);
    if (node.starter && node.minLevel > 0) problems.push(`starter ${node.id} must not be level-gated`);
    for (let r = 2; r <= node.maxRank; r += 1) {
      if (upgradeCost(node, r) <= 0) problems.push(`node ${node.id} rank ${r} is free`);
    }
  }
  for (const node of tree.nodes) {
    for (const req of node.requires) {
      if (!ids.has(req)) problems.push(`node ${node.id} requires missing ${req}`);
    }
  }
  if (tree.nodes.length < 12 || tree.nodes.length > 24) problems.push(`tree has ${tree.nodes.length} nodes; expected 12–24`);
  for (const branch of POWER_BRANCHES) {
    if (!tree.nodes.some((node) => node.branch === branch)) problems.push(`branch ${branch} is empty`);
  }
  // Cycle check by repeated peeling of satisfiable nodes.
  const remaining = new Set(tree.nodes.map((node) => node.id));
  const byId = new Map(tree.nodes.map((node) => [node.id, node]));
  let progressed = true;
  while (progressed && remaining.size) {
    progressed = false;
    for (const id of [...remaining]) {
      const node = byId.get(id)!;
      if (node.requires.every((req) => !remaining.has(req))) {
        remaining.delete(id);
        progressed = true;
      }
    }
  }
  if (remaining.size) problems.push(`prerequisite cycle among ${[...remaining].join(', ')}`);
  return problems;
}

export interface UnlockCheck {
  ok: boolean;
  reason: 'owned' | 'missing' | 'locked' | 'level' | 'poor' | null;
  /** Prerequisites still missing, by id. */
  missing: string[];
}

/** May this node's rank 1 be bought right now? `level` is the Ryder level; omit it to skip the gate. */
export function canUnlock(tree: PowerTree, unlocked: readonly string[], id: string, available: number, level = Infinity): UnlockCheck {
  const node = tree.nodes.find((entry) => entry.id === id);
  if (!node) return { ok: false, reason: 'missing', missing: [] };
  if (unlocked.includes(id)) return { ok: false, reason: 'owned', missing: [] };
  const missing = node.requires.filter((req) => !unlocked.includes(req));
  if (missing.length) return { ok: false, reason: 'locked', missing };
  if (level < node.minLevel) return { ok: false, reason: 'level', missing: [] };
  if (available < node.cost) return { ok: false, reason: 'poor', missing: [] };
  return { ok: true, reason: null, missing: [] };
}

export interface UpgradeCheck {
  ok: boolean;
  reason: 'missing' | 'unowned' | 'max' | 'level' | 'poor' | null;
  /** Rank the upgrade would reach. */
  nextRank: number;
  /** SP the upgrade costs. */
  cost: number;
  /** Ryder level the next rank asks for. */
  levelNeeded: number;
}

/** May this owned node go up a rank right now? */
export function canUpgrade(tree: PowerTree, unlocked: readonly string[], ranks: NodeRanks, id: string, available: number, level: number): UpgradeCheck {
  const node = tree.nodes.find((entry) => entry.id === id);
  if (!node) return { ok: false, reason: 'missing', nextRank: 0, cost: 0, levelNeeded: 0 };
  const rank = rankOfNode(unlocked, ranks, id);
  if (rank < 1) return { ok: false, reason: 'unowned', nextRank: 1, cost: node.cost, levelNeeded: node.minLevel };
  const nextRank = rank + 1;
  const cost = upgradeCost(node, nextRank);
  const levelNeeded = Math.max(node.minLevel, levelForRank(nextRank));
  if (nextRank > node.maxRank) return { ok: false, reason: 'max', nextRank: rank, cost: 0, levelNeeded: 0 };
  if (rankCapAt(level) < nextRank) return { ok: false, reason: 'level', nextRank, cost, levelNeeded };
  if (available < cost) return { ok: false, reason: 'poor', nextRank, cost, levelNeeded };
  return { ok: true, reason: null, nextRank, cost, levelNeeded };
}

/** 0 when unowned, otherwise the stored rank clamped to at least 1. */
export function rankOfNode(unlocked: readonly string[], ranks: NodeRanks, id: string) {
  if (!unlocked.includes(id)) return 0;
  return Math.max(1, Math.floor(ranks[id] ?? 1));
}

/** Drop unknown ids and anything whose prerequisites are not also owned. Starters are always owned. */
export function sanitizeUnlocked(tree: PowerTree, raw: readonly string[]): string[] {
  const known = new Set(tree.nodes.map((node) => node.id));
  const owned = new Set<string>(starterNodes(tree.ryderId));
  for (const id of raw) if (known.has(id)) owned.add(id);
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...owned]) {
      const node = tree.nodes.find((entry) => entry.id === id)!;
      if (node.starter) continue;
      if (!node.requires.every((req) => owned.has(req))) {
        owned.delete(id);
        changed = true;
      }
    }
  }
  return tree.nodes.filter((node) => owned.has(node.id)).map((node) => node.id);
}

/** Keep ranks only for owned nodes, clamped to 1 … maxRank. Owned nodes missing a rank are rank 1. */
export function sanitizeRanks(tree: PowerTree, unlocked: readonly string[], raw: unknown): NodeRanks {
  const out: NodeRanks = {};
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  for (const node of tree.nodes) {
    if (!unlocked.includes(node.id)) continue;
    const value = Number(source[node.id]);
    out[node.id] = Number.isFinite(value) ? Math.max(1, Math.min(node.maxRank, Math.floor(value))) : 1;
  }
  return out;
}

export function modifiersFor(tree: PowerTree, unlocked: readonly string[], ranks: NodeRanks = {}): PowerModifiers {
  const mods = emptyModifiers();
  for (const node of tree.nodes) {
    if (!unlocked.includes(node.id)) continue;
    const rank = rankOfNode(unlocked, ranks, node.id);
    if (node.effect.kind === 'stat') mods[node.effect.stat] += node.effect.value * rank;
    if (node.effect.kind === 'passive' && !mods.passives.includes(node.effect.passive)) mods.passives.push(node.effect.passive);
  }
  return mods;
}

export function abilitiesGranted(tree: PowerTree, unlocked: readonly string[]): AbilityId[] {
  const out: AbilityId[] = [];
  for (const node of tree.nodes) {
    if (node.effect.kind === 'ability' && unlocked.includes(node.id) && !out.includes(node.effect.abilityId)) out.push(node.effect.abilityId);
  }
  return out;
}

/** Rank of every granted power, for the engine. */
export function abilityRanks(tree: PowerTree, unlocked: readonly string[], ranks: NodeRanks): Partial<Record<AbilityId, number>> {
  const out: Partial<Record<AbilityId, number>> = {};
  for (const node of tree.nodes) {
    if (node.effect.kind !== 'ability' || !unlocked.includes(node.id)) continue;
    out[node.effect.abilityId] = Math.max(out[node.effect.abilityId] ?? 0, rankOfNode(unlocked, ranks, node.id));
  }
  return out;
}

export function recipesGranted(tree: PowerTree, unlocked: readonly string[]): ComboRecipe[] {
  return tree.nodes.filter((node) => node.effect.kind === 'combo' && unlocked.includes(node.id)).map((node) => (node.effect as { recipe: ComboRecipe }).recipe);
}

export function slotsGranted(tree: PowerTree, unlocked: readonly string[]): ExtraSlot[] {
  const out: ExtraSlot[] = [];
  for (const node of tree.nodes) {
    if (node.effect.kind === 'slot' && unlocked.includes(node.id)) out.push(node.effect.slot);
  }
  return out.sort();
}

/** Total SP a set of owned nodes (and their ranks) cost, for the spent ledger. */
export function spentOn(tree: PowerTree, unlocked: readonly string[], ranks: NodeRanks = {}) {
  return tree.nodes.filter((node) => unlocked.includes(node.id)).reduce((sum, node) => sum + costThroughRank(node, rankOfNode(unlocked, ranks, node.id)), 0);
}
