import assert from 'node:assert/strict';
import { civilianOrder, CIVILIAN_PROFILES } from '../civilians/profiles';
import {
  CIVILIANS_PER_ROUND,
  DEFAULT_CROWD_BUDGET,
  activeBudgetForRound,
  archetypeById,
  attackSlotsForRound,
  bossRound,
  civilianCountForRound,
  directRound,
  eligibleArchetypes,
  phaseForRound,
  registerEnemyArchetype,
  resetArchetypesForTests,
  resetCrowdBudgetForTests,
  populationForRound,
  roundPressure,
  roundScale,
  setCrowdBudget,
  warzoneEvent,
} from './director';

const street = phaseForRound(1);
assert.equal(street.name, 'Street Chaos');
assert.equal(street.maxTier, 2);
assert.equal(phaseForRound(5).id, 'street');
assert.equal(phaseForRound(6).name, 'Organized Resistance');
assert.equal(phaseForRound(15).name, 'Elite Threats');
assert.equal(phaseForRound(15).maxTier, 4);
assert.equal(phaseForRound(21).name, 'Superhuman Warfare');
assert.equal(phaseForRound(40).maxTier, 5);
assert.equal(phaseForRound(41).name, 'Apocalypse');
assert.equal(phaseForRound(80).id, 'apocalypse');

const anchor = roundScale(15, 1, 'normal');
assert.equal(anchor.maxTier, 4);
assert.equal(anchor.hp.toFixed(2), '1.63');
assert.equal(anchor.damage.toFixed(2), '1.25');
assert.equal(anchor.cap, 13);
assert.equal(anchor.tactics.powers, false);
assert.equal(anchor.tactics.hazards, false);
assert.equal(anchor.tactics.coordinate, true);
assert.equal(anchor.tactics.interrupt, false);
assert.equal(anchor.population, 120);
assert.equal(anchor.attackSlots, 4);
// The survival rule: exactly eight civilians per round.
assert.equal(CIVILIANS_PER_ROUND, 8);
for (const [round, count] of [
  [1, 8],
  [5, 40],
  [10, 80],
  [20, 160],
  [30, 240],
  [50, 400],
] as const) {
  assert.equal(civilianCountForRound(round), count, `round ${round} holds ${count} civilians`);
  assert.equal(populationForRound(round), count);
  const plan = directRound(round, 1, () => 0.3);
  assert.equal(plan.civilians, count, `plan ${round} assigns ${count} civilians`);
  const bodies = plan.opening.concat(plan.reserve);
  assert.equal(bodies.filter((spawn) => spawn.kind !== 'broadcaster').length, count);
  assert.equal(plan.total, count + (plan.boss ? 1 : 0));
}
assert.equal(civilianCountForRound(2) - civilianCountForRound(1), 8);
assert.equal(civilianCountForRound(49) - civilianCountForRound(48), 8);
// Difficulty never touches the count.
assert.equal(roundScale(20, 1, 'easy').population, 160);
assert.equal(roundScale(20, 1, 'nightmare').population, 160);
assert.equal(roundScale(20, 4, 'hard').population, 160);
// The active budget climbs but stays under the crowd ceiling.
assert.equal(activeBudgetForRound(1), 6);
assert.ok(activeBudgetForRound(50) <= DEFAULT_CROWD_BUDGET.maxAlive);
assert.ok(activeBudgetForRound(50) > activeBudgetForRound(20));
assert.ok(roundScale(50).spawnBatch > roundScale(1).spawnBatch);
assert.ok(roundScale(50).spawnInterval < roundScale(1).spawnInterval);
setCrowdBudget({ maxAlive: 12 });
assert.equal(activeBudgetForRound(50), 12, 'a lower crowd budget caps the live count without changing the wave');
assert.equal(roundScale(50).population, 400);
resetCrowdBudgetForTests();
assert.equal(attackSlotsForRound(1), 2);
assert.equal(attackSlotsForRound(20), 5);
assert.equal(attackSlotsForRound(20, 3), 7);
assert.ok(attackSlotsForRound(60) <= 10);
assert.equal(roundPressure(1), 'Light');
assert.equal(roundPressure(10), 'Moderate');
assert.equal(roundPressure(50), 'Catastrophic');

const early = directRound(1, 1, () => 0.2);
assert.equal(early.boss, false);
assert.equal(early.reserve.length, 0);
assert.equal(early.event, null);
assert.equal(early.opening.length + early.reserve.length, 8);
assert.ok(early.opening.every((spawn) => spawn.kind === 'walker' || spawn.kind === 'sprinter' || spawn.kind === 'thrower'));

const sixth = directRound(6, 1, () => 0.5);
assert.equal(sixth.boss, false);
assert.ok(sixth.reserve.length > 0);
assert.equal(sixth.scale.maxTier, 3);
assert.ok(sixth.opening.concat(sixth.reserve).every((spawn) => spawn.kind !== 'adept' && spawn.kind !== 'broadcaster'));

assert.equal(warzoneEvent(4), null);
assert.equal(warzoneEvent(5), 'storm');
assert.equal(warzoneEvent(10), 'boss');
assert.equal(warzoneEvent(15), 'secrets');
assert.equal(warzoneEvent(20), 'boss');
assert.equal(warzoneEvent(25), 'storm');
assert.equal(warzoneEvent(35), 'breach');
assert.equal(roundScale(16).tactics.hazards, true);
assert.equal(roundScale(16).tactics.interrupt, true);
assert.equal(roundScale(20).tactics.interrupt, true);
assert.equal(bossRound(9), false);
assert.equal(bossRound(10), true);
const tenth = directRound(10, 1, () => 0.4);
assert.equal(tenth.opening.filter((spawn) => spawn.kind === 'broadcaster').length, 1);
assert.equal(tenth.opening[0].archetypeId, 'broadcaster');

assert.ok(eligibleArchetypes(15).every((entry) => entry.tier <= 4 && !entry.supernatural));
assert.ok(eligibleArchetypes(21).some((entry) => entry.id === 'signal-adept' && entry.supernatural));
assert.equal(archetypeById('signal-adept')?.style.includes('power'), true);

const late = roundScale(50, 1, 'normal');
assert.equal(late.phase.id, 'apocalypse');
assert.equal(late.tactics.hazards, true);
assert.equal(late.tactics.protectElite, true);
assert.ok(late.cap <= DEFAULT_CROWD_BUDGET.maxAlive);
assert.ok(late.hp > anchor.hp);
assert.equal(directRound(50, 1, () => 0.2).boss, true);
assert.equal(directRound(55, 1, () => 0.2).boss, false);

const squad = roundScale(15, 5, 'normal');
assert.equal(squad.cap, 21);
assert.ok(squad.hp > anchor.hp);
assert.ok(squad.hp < anchor.hp * 1.4);
const easy = roundScale(15, 1, 'easy');
assert.ok(easy.hp < anchor.hp);
assert.equal(easy.population, anchor.population);
assert.ok(easy.cap < anchor.cap);
assert.ok(easy.attackSlots < anchor.attackSlots);
const nightmare = roundScale(15, 1, 'nightmare');
assert.ok(nightmare.hp > roundScale(15, 1, 'hard').hp);
assert.equal(nightmare.population, anchor.population);
assert.ok(nightmare.cap > anchor.cap);
assert.ok(nightmare.tactics.aggression > anchor.tactics.aggression);
assert.ok(nightmare.cap <= DEFAULT_CROWD_BUDGET.maxAlive);
assert.equal(directRound(1, 1, () => 0.2, 'nightmare').reserve.length, 0);

assert.throws(() =>
  registerEnemyArchetype({
    id: 'illegal-power',
    kind: 'walker',
    tier: 2,
    name: 'Illegal',
    style: ['power'],
    supernatural: false,
    minRound: 1,
    weight: { street: 1 },
  }),
);
registerEnemyArchetype({
  id: 'future-glb',
  kind: 'heavy',
  tier: 4,
  name: 'Future GLB',
  style: ['weapon'],
  supernatural: false,
  minRound: 11,
  glb: '/assets/those-ryderz/models/future-elite.glb',
  weight: { elite: 3 },
});
assert.equal(eligibleArchetypes(15).some((entry) => entry.id === 'future-glb'), true);
assert.equal(archetypeById('future-glb')?.glb?.includes('future-elite'), true);
resetArchetypesForTests();
assert.equal(archetypeById('future-glb'), undefined);

const guard = civilianOrder(CIVILIAN_PROFILES.brawler, {
  dist: 1.4,
  hpRatio: 1,
  holding: false,
  throwableDist: null,
  slot: 0,
  recovering: false,
  rng: 0.9,
  playerAttacking: true,
  tier: 3,
  tactics: anchor.tactics,
});
assert.equal(guard.state, 'guard');
assert.equal(guard.attack, null);

const open = civilianOrder(CIVILIAN_PROFILES.aggressive, {
  dist: 1.6,
  hpRatio: 1,
  holding: false,
  throwableDist: null,
  slot: 0,
  recovering: false,
  rng: 0.1,
  playerAttacking: true,
  tier: 1,
  tactics: roundScale(2).tactics,
});
assert.notEqual(open.state, 'guard');

console.log('round director ok', { round15: anchor.cap, squadCap: squad.cap, round50: late.cap });
