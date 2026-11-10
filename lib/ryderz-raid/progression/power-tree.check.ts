import assert from 'node:assert/strict';
import { RYDERZ, RYDER_ORDER } from '../config';
import { ABILITY_BANDS } from '../pvp/abilityBands';
import { DERIVED_KINDS, DERIVED_POWERS, DERIVED_POWER_IDS, MAX_RANK, derivedAtRank, rankScaling } from './derived-powers';
import { BLITZ_FINISH, RYDER_STYLE, choreoFor, validateChoreo } from './power-choreo';
import { POWER_TYPES, powerTypeOf } from './power-types';
import {
  POWER_BRANCHES,
  SKILL_BRANCHES,
  abilitiesGranted,
  abilityRanks,
  canUnlock,
  canUpgrade,
  costThroughRank,
  levelForRank,
  modifiersFor,
  rankCapAt,
  recipesGranted,
  sanitizeRanks,
  sanitizeUnlocked,
  slotsGranted,
  spentOn,
  starterNodes,
  treeFor,
  upgradeCost,
  validateTree,
} from './power-tree';

// Every Ryder's tree is structurally sound and carries the canonical kit as free starters.
for (const id of RYDER_ORDER) {
  const tree = treeFor(id);
  const problems = validateTree(tree);
  assert.deepEqual(problems, [], `${id}: ${problems.join('; ')}`);
  assert.equal(tree.nodes.length, 23, `${id} has ${tree.nodes.length} nodes`);
  for (const branch of POWER_BRANCHES) {
    assert.ok(tree.nodes.some((node) => node.branch === branch), `${id} has a ${branch} branch`);
  }
  const starters = starterNodes(id);
  const kit = RYDERZ[id].moves.map((move) => move.id);
  const granted = abilitiesGranted(tree, starters);
  for (const ability of kit) assert.ok(granted.includes(ability), `${id} starts with ${ability}`);
  assert.equal(spentOn(tree, starters), 0, `${id} starters are free`);
  // The Powers tab: nine powers covering all six types, the Xtreme at the crown.
  const powers = tree.nodes.filter((node) => node.branch === 'powers');
  assert.equal(powers.length, 9, `${id} has nine powers`);
  for (const node of powers) assert.equal(node.effect.kind, 'ability', `${node.id} grants a power`);
  const types = new Set(powers.map((node) => node.type));
  for (const type of POWER_TYPES) assert.ok(types.has(type), `${id}'s powers include a ${type}`);
  const crown = powers.find((node) => node.tier === 4);
  assert.ok(crown && crown.type === 'xtreme', `${id}'s deepest power is the Xtreme`);
  for (const node of powers) assert.equal(node.maxRank, MAX_RANK, `${node.id} ranks to ${MAX_RANK}`);
  // Skills: every branch has a starter the player can buy at level 1.
  for (const branch of SKILL_BRANCHES) {
    assert.ok(tree.nodes.some((node) => node.branch === branch && node.tier === 1 && node.minLevel === 0), `${id}'s ${branch} branch opens at level 1`);
  }
  // Every ability the tree hands out has a CPU band so versus AI knows how to use it.
  for (const node of tree.nodes) {
    if (node.effect.kind === 'ability') assert.ok(node.effect.abilityId in ABILITY_BANDS, `${node.effect.abilityId} has a band`);
  }
  // The tree reaches all three extra slots.
  assert.deepEqual(slotsGranted(tree, tree.nodes.map((node) => node.id)), ['4', '5', '6'], `${id} opens 4, 5 and 6`);
}

// Derived powers: six per Ryder, one of each kind, each owned by that Ryder and typed by kind.
for (const id of RYDER_ORDER) {
  const mine = DERIVED_POWER_IDS.filter((derived) => DERIVED_POWERS[derived].owner === id);
  assert.equal(mine.length, 6, `${id} has six tree powers`);
  assert.deepEqual(
    mine.map((derived) => DERIVED_POWERS[derived].kind).sort(),
    [...DERIVED_KINDS].sort(),
    `${id} has one of each kind`,
  );
}
for (const derived of DERIVED_POWER_IDS) {
  const spec = DERIVED_POWERS[derived];
  assert.equal(powerTypeOf(derived), { breaker: 'strike', volley: 'projectile', nova: 'radial', snare: 'control', surge: 'boost', blitz: 'xtreme' }[spec.kind]);
}
// Every power in the game has a type.
for (const id of RYDER_ORDER) for (const move of RYDERZ[id].moves) assert.ok(POWER_TYPES.includes(powerTypeOf(move.id)), `${move.id} is typed`);

// --- Rank scaling -----------------------------------------------------------

assert.deepEqual(rankScaling(1), { damage: 1, cost: 1, radius: 1, duration: 1, count: 0 }, 'rank 1 is the printed power');
assert.ok(rankScaling(MAX_RANK).damage > rankScaling(1).damage, 'damage climbs with rank');
assert.ok(rankScaling(MAX_RANK).cost < rankScaling(1).cost, 'cost falls with rank');
assert.equal(rankScaling(99).damage, rankScaling(MAX_RANK).damage, 'rank is clamped');
const salvo = DERIVED_POWERS.plasmaSalvo;
assert.equal(derivedAtRank(salvo, 1).count, salvo.count);
assert.equal(derivedAtRank(salvo, 5).count, salvo.count + 2, 'a volley gains a bolt every two ranks');
assert.equal(derivedAtRank(DERIVED_POWERS.rushBreaker, 5).count, 0, 'a breaker never grows a count');
assert.ok(derivedAtRank(salvo, 3).auraCost < salvo.auraCost);

// --- Choreography -----------------------------------------------------------

for (const kind of DERIVED_KINDS) {
  const choreo = choreoFor(kind, 5);
  const problems = validateChoreo(choreo);
  assert.deepEqual(problems, [], `${kind}: ${problems.join('; ')}`);
  assert.ok(choreo.lock > 0 && choreo.lock <= choreo.duration, `${kind} locks the body for part of the sequence`);
}
assert.equal(choreoFor('volley', 7).beats.filter((beat) => beat.events?.includes('shot')).length, 7, 'a volley throws one shot beat per bolt');
assert.ok(choreoFor('volley', 7).duration > choreoFor('volley', 5).duration, 'more bolts, longer volley');
for (const kind of ['breaker', 'nova', 'snare', 'surge'] as const) {
  assert.ok(choreoFor(kind).beats.some((beat) => beat.events?.includes('hit')), `${kind} lands a hit beat`);
}
assert.ok(BLITZ_FINISH.beats[0].events?.includes('hit'), 'the blitz finisher hits on its first beat');
for (const id of RYDER_ORDER) assert.ok(RYDER_STYLE[id], `${id} has a weapon style`);

// --- Costs, levels and rank caps -------------------------------------------

const leo = treeFor('leo');
const base = starterNodes('leo');
const fists = leo.nodes.find((node) => node.id === 'leo:fists')!;
assert.equal(upgradeCost(fists, 1), 250);
for (let r = 2; r <= MAX_RANK; r += 1) assert.ok(upgradeCost(fists, r) > upgradeCost(fists, r - 1), `rank ${r} costs more than rank ${r - 1}`);
assert.equal(costThroughRank(fists, 1), 250);
assert.equal(costThroughRank(fists, 2), 250 + upgradeCost(fists, 2));
const q = leo.nodes.find((node) => node.id === 'leo:q')!;
assert.equal(upgradeCost(q, 1), 0, 'a starter is free');
assert.ok(upgradeCost(q, 2) > 0, 'ranking a starter power costs SP');
assert.equal(rankCapAt(1), 1);
assert.equal(rankCapAt(2), 2);
assert.equal(rankCapAt(8), 5);
assert.equal(rankCapAt(40), MAX_RANK, 'the cap never passes MAX_RANK');
assert.equal(levelForRank(1), 1);
assert.equal(levelForRank(3), 4);
for (let r = 2; r <= MAX_RANK; r += 1) assert.ok(rankCapAt(levelForRank(r)) >= r, `rank ${r} is reachable at its listed level`);

// --- Unlock rules on Leo's tree --------------------------------------------

assert.equal(canUnlock(leo, base, 'leo:fists', 0).reason, 'poor', 'no SP, no fists');
assert.equal(canUnlock(leo, base, 'leo:fists', 250).ok, true);
assert.equal(canUnlock(leo, base, 'leo:launcher', 5000).reason, 'locked', 'launcher wants fists first');
assert.deepEqual(canUnlock(leo, base, 'leo:launcher', 5000).missing, ['leo:fists']);
assert.equal(canUnlock(leo, base, 'leo:q', 5000).reason, 'owned', 'starters are already owned');
assert.equal(canUnlock(leo, base, 'leo:nope', 5000).reason, 'missing');
assert.equal(canUnlock(leo, base, 'leo:breaker', 5000, 1).reason, 'level', 'a tier-2 power waits for level 2');
assert.equal(canUnlock(leo, base, 'leo:breaker', 5000, 2).ok, true);
assert.equal(canUnlock(leo, base, 'leo:breaker', 5000).ok, true, 'omitting the level skips the gate');

const owned = [...base, 'leo:fists', 'leo:stance', 'leo:focus'];
assert.equal(canUnlock(leo, owned, 'leo:slot4', 600, 9).ok, true, 'slot 4 opens with focus');
assert.equal(canUnlock(leo, owned, 'leo:slot5', 5000, 9).reason, 'locked', 'slot 5 needs slot 4');
assert.equal(canUnlock(leo, owned, 'leo:blitz', 9999, 9).reason, 'locked', 'the Xtreme sits at the crown of the Powers tree');
assert.equal(canUnlock(leo, [...owned, 'leo:breaker', 'leo:volley', 'leo:snare', 'leo:nova', 'leo:surge'], 'leo:blitz', 9999, 6).reason, 'level', 'the Xtreme asks for level 7');
assert.equal(canUnlock(leo, [...owned, 'leo:breaker', 'leo:volley', 'leo:snare', 'leo:nova', 'leo:surge'], 'leo:blitz', 9999, 7).ok, true);

// --- Upgrade rules ----------------------------------------------------------

assert.equal(canUpgrade(leo, base, {}, 'leo:fists', 9999, 9).reason, 'unowned');
assert.equal(canUpgrade(leo, owned, {}, 'leo:fists', 9999, 1).reason, 'level', 'rank 2 waits for level 2');
assert.equal(canUpgrade(leo, owned, {}, 'leo:fists', 0, 2).reason, 'poor');
const up = canUpgrade(leo, owned, {}, 'leo:fists', 9999, 2);
assert.equal(up.ok, true);
assert.equal(up.nextRank, 2);
assert.equal(up.cost, upgradeCost(fists, 2));
assert.equal(canUpgrade(leo, owned, { 'leo:fists': MAX_RANK }, 'leo:fists', 9999, 40).reason, 'max');
assert.equal(canUpgrade(leo, owned, { 'leo:fists': 2 }, 'leo:fists', 9999, 3).reason, 'level', 'rank 3 waits for level 4');
assert.equal(canUpgrade(leo, owned, { 'leo:fists': 2 }, 'leo:fists', 9999, 4).ok, true);
assert.equal(canUpgrade(leo, base, {}, 'leo:q', 9999, 2).ok, true, 'a starter power ranks up like any other');
const slot4Owned = [...owned, 'leo:slot4'];
assert.equal(canUpgrade(leo, slot4Owned, {}, 'leo:slot4', 9999, 40).reason, 'max', 'a slot is a one-rank node');

// Ranks sanitise against ownership and maxRank, and every owned node is at least rank 1.
const ranks = sanitizeRanks(leo, owned, { 'leo:fists': 3, 'leo:stance': 99, 'leo:launcher': 2, 'leo:focus': 'x', 'leo:q': 2 });
assert.equal(ranks['leo:fists'], 3);
assert.equal(ranks['leo:stance'], MAX_RANK, 'clamped to maxRank');
assert.equal(ranks['leo:launcher'], undefined, 'unowned nodes carry no rank');
assert.equal(ranks['leo:focus'], 1, 'garbage reads as rank 1');
assert.equal(ranks['leo:q'], 2, 'starters hold their rank');
for (const starter of base) assert.ok(ranks[starter] >= 1, `${starter} is ranked`);

// Sanitize drops orphans and unknown ids but always keeps the starters.
const cleaned = sanitizeUnlocked(leo, ['leo:launcher', 'leo:fists', 'bogus', 'leo:aerial']);
assert.ok(cleaned.includes('leo:fists'));
assert.ok(cleaned.includes('leo:launcher'), 'launcher stays: fists is owned');
assert.ok(!cleaned.includes('leo:aerial') || cleaned.includes('leo:launcher'), 'aerial needs launcher');
assert.ok(!cleaned.includes('bogus'));
for (const starter of base) assert.ok(cleaned.includes(starter), `${starter} is always owned`);
const orphaned = sanitizeUnlocked(leo, ['leo:launcher']);
assert.ok(!orphaned.includes('leo:launcher'), 'an orphan without its prerequisite is dropped');

// Modifiers add up per rank and recipes / slots / ability ranks come through.
const built = [...owned, 'leo:launcher', 'leo:aerial', 'leo:chain', 'leo:footwork', 'leo:guard', 'leo:second-wind'];
const mods = modifiersFor(leo, built);
assert.ok(Math.abs(mods.meleeDamage - 0.05) < 1e-9, 'rank 1 fists');
assert.ok(Math.abs(mods.launchPower - 0.12) < 1e-9);
assert.ok(Math.abs(mods.aerialDamage - 0.08) < 1e-9);
assert.equal(mods.heavyDamage, 0, 'nothing on the tree touches heavy damage');
assert.equal(mods.maxHp, 12);
assert.ok(Math.abs(mods.abilityCost + 0.05) < 1e-9);
assert.ok(Math.abs(mods.dodgeCooldown + 0.08) < 1e-9);
assert.deepEqual(mods.passives, ['secondWind']);
const ranked = modifiersFor(leo, built, { 'leo:fists': 3, 'leo:stance': 5 });
assert.ok(Math.abs(ranked.meleeDamage - 0.15) < 1e-9, 'rank 3 fists stack three times');
assert.equal(ranked.maxHp, 60, 'rank 5 stance');
const recipes = recipesGranted(leo, [...owned, 'leo:chain']);
assert.equal(recipes.length, 1);
assert.equal(recipes[0].sequence[0], 'launcher', 'the chain recipe starts from a launcher');
assert.equal(spentOn(leo, owned), 250 + 300 + 400);
assert.equal(spentOn(leo, owned, { 'leo:fists': 2 }), 250 + upgradeCost(fists, 2) + 300 + 400, 'the ledger counts every rank bought');
assert.equal(abilitiesGranted(leo, [...owned, 'leo:breaker']).length, 4, 'breaker joins the three kit powers');
const powerRanks = abilityRanks(leo, [...owned, 'leo:breaker'], { 'leo:breaker': 3, 'leo:q': 2 });
assert.equal(powerRanks.rushBreaker, 3);
assert.equal(powerRanks[RYDERZ.leo.moves[0].id], 2, 'the canonical slot-1 power carries its rank');
assert.equal(powerRanks[RYDERZ.leo.moves[1].id], 1);

console.log('power tree ok');
