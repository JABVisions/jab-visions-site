import assert from 'node:assert/strict';
import { DOWN_FADE, DOWN_SECONDS, REVIVE_RANGE, downOpacity, reviveVitals, squadStillStanding } from './downed';
import { defaultSquad, launchFromSquad } from './squad';

assert.equal(DOWN_SECONDS > DOWN_FADE, true);
assert.equal(downOpacity(DOWN_SECONDS), 1);
assert.equal(downOpacity(DOWN_FADE), 1);
assert.equal(downOpacity(DOWN_FADE / 2), 0.5);
assert.equal(downOpacity(0), 0);
assert.equal(downOpacity(-1), 0);
const restored = reviveVitals(100, 80, 10);
assert.equal(restored.hp, 42);
assert.equal(restored.aura, 32);
assert.equal(reviveVitals(100, 80, 70).aura, 70);
assert.equal(squadStillStanding(false, 0), false);
assert.equal(squadStillStanding(true, 0), true);
assert.equal(squadStillStanding(false, 2), true);
assert.ok(REVIVE_RANGE > 0.9 && REVIVE_RANGE < 4);

const squad = defaultSquad('rubi');
const launch = launchFromSquad(squad, 'rubi');
assert.deepEqual(
  launch.allies.map((ally) => ally.seat),
  [1, 2, 3, 4],
);
assert.equal(launch.allies.every((ally) => ally.ryderId !== 'rubi'), true);
console.log('raid downed ok');
