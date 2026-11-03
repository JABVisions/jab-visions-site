import { RYDERZ, RYDER_ORDER, type AbilityId, type RyderId } from '../config';
import type { ComboRecipe } from '../fighter/combo';
import { derivedPowerOfKind } from './derived-powers';

/**
 * Power Trees. Four branches per Ryder, data-driven nodes, prerequisites,
 * costs in Signal Points. Unlocking a node never touches the equipped deck:
 * a granted power sits in the pool until the player equips it.
 */
export type PowerBranch = 'combat' | 'powers' | 'defense' | 'ultimate';

export const POWER_BRANCHES: PowerBranch[] = ['combat', 'powers', 'defense', 'ultimate'];

export const BRANCH_LABEL: Record<PowerBranch, string> = {
  combat: 'Combat',
  powers: 'Powers',
  defense: 'Defense',
  ultimate: 'Ultimate',
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

export type NodeEffect =
  | { kind: 'ability'; abilityId: AbilityId }
  | { kind: 'stat'; stat: StatKey; value: number }
  | { kind: 'combo'; recipe: ComboRecipe }
  | { kind: 'slot'; slot: '4' | '5' }
  | { kind: 'passive'; passive: PassiveId };

export interface PowerNode {
  id: string;
  ryderId: RyderId;
  branch: PowerBranch;
  /** 1 is a starter node, higher tiers sit deeper in the branch. */
  tier: 1 | 2 | 3 | 4;
  name: string;
  description: string;
  cost: number;
  requires: string[];
  effect: NodeEffect;
  /** Starting nodes are owned from the first match. */
  starter?: boolean;
}

export interface PowerTree {
  ryderId: RyderId;
  nodes: PowerNode[];
}

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

/**
 * Builds the standard 18-node tree for a Ryder. Canonical Q / E / R powers are
 * starter nodes and are never gated. Costs follow the design brief: starter
 * nodes free, first upgrades a few hundred SP, the ultimate 3,000.
 */
export function buildTree(ryderId: RyderId): PowerTree {
  const spec = RYDERZ[ryderId];
  const f = FLAVOR[ryderId];
  const [q, e, r] = spec.moves;
  const breaker = derivedPowerOfKind(ryderId, 'breaker');
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
  ): PowerNode => ({ id: p(id), ryderId, branch, tier, name, description, cost, requires: requires.map(p), effect, starter });

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
    // Combat
    node('fists', 'combat', 1, 'Hardened Fists', 'Punches, kicks, and melee hit 10% harder.', 250, [], { kind: 'stat', stat: 'meleeDamage', value: 0.1 }),
    node('launcher', 'combat', 2, 'Launcher Mastery', 'Sprint + kick launches higher and keeps targets in the air longer.', 500, ['fists'], { kind: 'stat', stat: 'launchPower', value: 0.3 }),
    node('aerial', 'combat', 3, 'Air Rave', 'Aerial strikes deal 25% more and slam harder on landing.', 750, ['launcher'], { kind: 'stat', stat: 'aerialDamage', value: 0.25 }),
    node('chain', 'combat', 2, f.chain, f.chainBlurb, 1000, ['fists'], { kind: 'combo', recipe: chainRecipe }),
    node('finisher', 'combat', 4, f.finisher, 'Ground finishers deal 35% more and pay out as combo finishers.', 1400, ['chain', 'launcher'], { kind: 'combo', recipe: finisherRecipe }),
    // Powers
    node('q', 'powers', 1, q.name, q.description, 0, [], { kind: 'ability', abilityId: q.id }, true),
    node('e', 'powers', 1, e.name, e.description, 0, [], { kind: 'ability', abilityId: e.id }, true),
    node('r', 'powers', 1, r.name, r.description, 0, [], { kind: 'ability', abilityId: r.id }, true),
    node('focus', 'powers', 2, 'Signal Focus', 'Powers cost 12% less aura.', 400, ['q'], { kind: 'stat', stat: 'abilityCost', value: -0.12 }),
    ...(breaker ? [node('breaker', 'powers', 2, breaker.name, breaker.description, 750, ['focus'], { kind: 'ability', abilityId: breaker.id })] : []),
    ...(surge ? [node('surge', 'powers', 3, surge.name, surge.description, 1200, ['breaker'], { kind: 'ability', abilityId: surge.id })] : []),
    // Defense
    node('stance', 'defense', 1, f.stance, '+20 maximum health.', 300, [], { kind: 'stat', stat: 'maxHp', value: 20 }),
    node('footwork', 'defense', 2, f.footwork, 'Dodge recovers 30% faster.', 500, ['stance'], { kind: 'stat', stat: 'dodgeCooldown', value: -0.3 }),
    node('guard', 'defense', 2, f.guard, 'Holding dodge blocks 20% more damage.', 500, ['stance'], { kind: 'stat', stat: 'guard', value: 0.2 }),
    node('second-wind', 'defense', 3, f.secondWind, 'Once per round, a lethal blow leaves you at 1 health instead.', 1200, ['footwork', 'guard'], { kind: 'passive', passive: 'secondWind' }),
    // Ultimate
    node('slot4', 'ultimate', 2, 'Expanded Deck', 'Opens a fourth power slot bound to 4.', 600, ['focus', 'fists'], { kind: 'slot', slot: '4' }),
    node('slot5', 'ultimate', 3, 'Full Deck', 'Opens a fifth power slot bound to 5.', 1200, ['slot4', 'stance'], { kind: 'slot', slot: '5' }),
    ...(blitz ? [node('blitz', 'ultimate', 4, blitz.name, blitz.description, 3000, ['slot5', 'surge'], { kind: 'ability', abilityId: blitz.id })] : []),
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

/** Structural checks: ids unique, prerequisites exist, no cycles, costs sane, 12–18 nodes. */
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
  }
  for (const node of tree.nodes) {
    for (const req of node.requires) {
      if (!ids.has(req)) problems.push(`node ${node.id} requires missing ${req}`);
    }
  }
  if (tree.nodes.length < 12 || tree.nodes.length > 18) problems.push(`tree has ${tree.nodes.length} nodes; expected 12–18`);
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
  reason: 'owned' | 'missing' | 'locked' | 'poor' | null;
  /** Prerequisites still missing, by id. */
  missing: string[];
}

/** May this node be bought right now? */
export function canUnlock(tree: PowerTree, unlocked: readonly string[], id: string, available: number): UnlockCheck {
  const node = tree.nodes.find((entry) => entry.id === id);
  if (!node) return { ok: false, reason: 'missing', missing: [] };
  if (unlocked.includes(id)) return { ok: false, reason: 'owned', missing: [] };
  const missing = node.requires.filter((req) => !unlocked.includes(req));
  if (missing.length) return { ok: false, reason: 'locked', missing };
  if (available < node.cost) return { ok: false, reason: 'poor', missing: [] };
  return { ok: true, reason: null, missing: [] };
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

export function modifiersFor(tree: PowerTree, unlocked: readonly string[]): PowerModifiers {
  const mods = emptyModifiers();
  for (const node of tree.nodes) {
    if (!unlocked.includes(node.id)) continue;
    if (node.effect.kind === 'stat') mods[node.effect.stat] += node.effect.value;
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

export function recipesGranted(tree: PowerTree, unlocked: readonly string[]): ComboRecipe[] {
  return tree.nodes.filter((node) => node.effect.kind === 'combo' && unlocked.includes(node.id)).map((node) => (node.effect as { recipe: ComboRecipe }).recipe);
}

export function slotsGranted(tree: PowerTree, unlocked: readonly string[]): Array<'4' | '5'> {
  const out: Array<'4' | '5'> = [];
  for (const node of tree.nodes) {
    if (node.effect.kind === 'slot' && unlocked.includes(node.id)) out.push(node.effect.slot);
  }
  return out;
}

/** Total SP a set of owned nodes cost, for the spent ledger. */
export function spentOn(tree: PowerTree, unlocked: readonly string[]) {
  return tree.nodes.filter((node) => unlocked.includes(node.id)).reduce((sum, node) => sum + node.cost, 0);
}
