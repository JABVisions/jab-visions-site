import assert from 'node:assert/strict';
import { animalSummonRegistry } from './animal-registry';
import {
  GIANT_SCALE,
  SOUL_RADIUS,
  drainHits,
  healFromDamage,
  radiusForScale,
  scaleForGrow,
  stompBand,
  summonOffset,
} from './lilly-combat';

const inside = { x: 1, z: 0, radius: 0.4, hp: 30 };
const outside = { x: 12, z: 0, radius: 0.4, hp: 30 };
const hits = drainHits([inside, outside], 0, 0, SOUL_RADIUS, 8);
assert.equal(hits.length, 1, 'only the body inside the puddle is drained');
assert.equal(hits[0].index, 0);
assert.equal(hits[0].dealt, 8);

const left = drainHits([{ ...inside, x: SOUL_RADIUS + inside.radius + 0.2, hp: 30 }], 0, 0, SOUL_RADIUS, 8);
assert.equal(left.length, 0, 'leaving the puddle stops the drain');

const capped = healFromDamage(90, 100, 40, 0.4);
assert.equal(capped.healed, 10, 'healing stops at maximum health');
assert.equal(capped.hp, 100);
const full = healFromDamage(40, 100, 20, 0.4);
assert.equal(full.healed, 8);
assert.equal(full.hp, 48);

assert.equal(scaleForGrow('giant', 0), GIANT_SCALE);
assert.ok(scaleForGrow('plant', 0) < 1.05);
assert.ok(Math.abs(scaleForGrow('shrink', 1) - 1) < 0.001, 'shrink ends at normal size');
assert.ok(scaleForGrow('expand', 1) > 3);
assert.ok(radiusForScale(1) === 1);
assert.ok(radiusForScale(GIANT_SCALE) > 2);

assert.equal(stompBand(0.4), 'crush');
assert.equal(stompBand(2.2), 'shock');
assert.equal(stompBand(9), null);

const spot = summonOffset(0, 0.45);
assert.ok(Math.hypot(spot.x, spot.z) > 0.45, 'the summon stands outside Lilly');

animalSummonRegistry.clear();
assert.equal(animalSummonRegistry.pick(), null, 'no animal GLB means no spawn');
animalSummonRegistry.register({ id: 'note', damage: 4, speed: 3, health: 10, behavior: 'chase', life: 8 });
assert.equal(animalSummonRegistry.pick(), null, 'a note without a model is not spawned');
animalSummonRegistry.register({
  id: 'wolf',
  glb: '/assets/those-ryderz/models/future-wolf.glb',
  damage: 8,
  speed: 5,
  health: 24,
  behavior: 'chase',
  life: 12,
});
assert.equal(animalSummonRegistry.pick(0)?.id, 'wolf');
animalSummonRegistry.clear();

console.log('lilly checks ok');
