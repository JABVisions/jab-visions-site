import assert from 'node:assert/strict';
import { RYDERZ, RYDER_ORDER } from '../config';
import { ABILITY_BANDS } from '../pvp/abilityBands';
import { DERIVED_POWERS, DERIVED_POWER_IDS } from './derived-powers';
import {
  POWER_BRANCHES,
  abilitiesGranted,
  canUnlock,
  modifiersFor,
  recipesGranted,
  sanitizeUnlocked,
  slotsGranted,
  spentOn,
  starterNodes,
  treeFor,
  validateTree,
} from './power-tree';

// Every Ryder's tree is structurally sound and carries the canonical kit as free starters.
for (const id of RYDER_ORDER) {
  const tree = treeFor(id);
  const problems = validateTree(tree);
  assert.deepEqual(problems, [], `${id}: ${problems.join('; ')}`);
  assert.ok(tree.nodes.length >= 12 && tree.nodes.length <= 20, `${id} has ${tree.nodes.length} nodes`);
  for (const branch of POWER_BRANCHES) {
    assert.ok(tree.nodes.some((node) => node.branch === branch), `${id} has a ${branch} branch`);
  }
  const starters = starterNodes(id);
  const kit = RYDERZ[id].moves.map((move) => move.id);
  const granted = abilitiesGranted(tree, starters);
  for (const ability of kit) assert.ok(granted.includes(ability), `${id} starts with ${ability}`);
  assert.equal(spentOn(tree, starters), 0, `${id} starters are free`);
  // Every ability the tree hands out has a CPU band so versus AI knows how to use it.
  for (const node of tree.nodes) {
    if (node.effect.kind === 'ability') assert.ok(node.effect.abilityId in ABILITY_BANDS, `${node.effect.abilityId} has a band`);
  }
  // The tree reaches all three extra slots and an ultimate.
  assert.deepEqual(slotsGranted(tree, tree.nodes.map((node) => node.id)), ['4', '5', '6'], `${id} opens 4, 5 and 6`);
  assert.ok(tree.nodes.some((node) => node.tier === 4 && node.branch === 'ultimate'), `${id} has an ultimate`);
}

// Derived powers: three per Ryder, each owned by that Ryder.
for (const id of RYDER_ORDER) {
  const mine = DERIVED_POWER_IDS.filter((derived) => DERIVED_POWERS[derived].owner === id);
  assert.equal(mine.length, 3, `${id} has three tree powers`);
  assert.deepEqual(
    mine.map((derived) => DERIVED_POWERS[derived].kind).sort(),
    ['blitz', 'breaker', 'surge'],
    `${id} has one of each kind`,
  );
}

// --- Unlock rules on Leo's tree --------------------------------------------

const leo = treeFor('leo');
const base = starterNodes('leo');
assert.equal(canUnlock(leo, base, 'leo:fists', 0).reason, 'poor', 'no SP, no fists');
assert.equal(canUnlock(leo, base, 'leo:fists', 250).ok, true);
assert.equal(canUnlock(leo, base, 'leo:launcher', 5000).reason, 'locked', 'launcher wants fists first');
assert.deepEqual(canUnlock(leo, base, 'leo:launcher', 5000).missing, ['leo:fists']);
assert.equal(canUnlock(leo, base, 'leo:q', 5000).reason, 'owned', 'starters are already owned');
assert.equal(canUnlock(leo, base, 'leo:nope', 5000).reason, 'missing');

const owned = [...base, 'leo:fists', 'leo:stance', 'leo:focus'];
assert.equal(canUnlock(leo, owned, 'leo:slot4', 600).ok, true, 'slot 4 opens with focus and fists');
assert.equal(canUnlock(leo, owned, 'leo:slot5', 5000).reason, 'locked', 'slot 5 needs slot 4');
assert.equal(canUnlock(leo, owned, 'leo:blitz', 9999).reason, 'locked', 'the ultimate sits deep in the tree');

// Sanitize drops orphans and unknown ids but always keeps the starters.
const cleaned = sanitizeUnlocked(leo, ['leo:launcher', 'leo:fists', 'bogus', 'leo:aerial']);
assert.ok(cleaned.includes('leo:fists'));
assert.ok(cleaned.includes('leo:launcher'), 'launcher stays: fists is owned');
assert.ok(!cleaned.includes('leo:aerial') || cleaned.includes('leo:launcher'), 'aerial needs launcher');
assert.ok(!cleaned.includes('bogus'));
for (const starter of base) assert.ok(cleaned.includes(starter), `${starter} is always owned`);
const orphaned = sanitizeUnlocked(leo, ['leo:launcher']);
assert.ok(!orphaned.includes('leo:launcher'), 'an orphan without its prerequisite is dropped');

// Modifiers add up and recipes / slots come through.
const mods = modifiersFor(leo, [...owned, 'leo:launcher', 'leo:aerial', 'leo:chain', 'leo:footwork', 'leo:guard', 'leo:second-wind']);
assert.ok(Math.abs(mods.meleeDamage - 0.1) < 1e-9);
assert.ok(Math.abs(mods.launchPower - 0.3) < 1e-9);
assert.ok(Math.abs(mods.aerialDamage - 0.25) < 1e-9);
assert.equal(mods.heavyDamage, 0, 'nothing on the tree touches heavy damage');
assert.equal(mods.maxHp, 20);
assert.ok(Math.abs(mods.abilityCost + 0.12) < 1e-9);
assert.ok(Math.abs(mods.dodgeCooldown + 0.3) < 1e-9);
assert.deepEqual(mods.passives, ['secondWind']);
const recipes = recipesGranted(leo, [...owned, 'leo:chain']);
assert.equal(recipes.length, 1);
assert.equal(recipes[0].sequence[0], 'launcher', 'the chain recipe starts from a launcher');
assert.equal(spentOn(leo, owned), 250 + 300 + 400);
assert.deepEqual(abilitiesGranted(leo, [...owned, 'leo:breaker']).length, 4, 'breaker joins the three kit powers');

console.log('power tree ok');
