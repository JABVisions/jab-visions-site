import assert from 'node:assert/strict';
import { arenaChangeRestarts, canAssumeAlly, carriedVitals } from './control';

const cpu = {
  raid: true,
  phase: 'playing',
  seat: 2,
  controlledSeat: 0,
  remoteHuman: false,
  hp: 40,
  down: 0,
};

assert.equal(canAssumeAlly(cpu), true);
assert.equal(canAssumeAlly({ ...cpu, seat: 0 }), false);
assert.equal(canAssumeAlly({ ...cpu, remoteHuman: true }), false);
assert.equal(canAssumeAlly({ ...cpu, hp: 0, down: 0 }), false);
assert.equal(canAssumeAlly({ ...cpu, hp: 0, down: 4 }), true);
assert.equal(canAssumeAlly({ ...cpu, phase: 'dead' }), false);
assert.equal(canAssumeAlly({ ...cpu, raid: false }), false);

assert.equal(arenaChangeRestarts('training-pad', 'island-paradise', true), true);
assert.equal(arenaChangeRestarts('training-pad', 'training-pad', true), false);
assert.equal(arenaChangeRestarts('training-pad', 'island-paradise', false), false);

const half = carriedVitals({ hp: 50, maxHp: 100, aura: 10, maxAura: 40 }, 120, 80, 0);
assert.equal(half.hp, 60);
assert.equal(half.maxHp, 120);
assert.equal(half.aura, 20);
assert.equal(half.maxAura, 80);
const downed = carriedVitals({ hp: 0, maxHp: 100, aura: 10, maxAura: 40 }, 100, 40, 6);
assert.equal(downed.hp, 0);
assert.equal(downed.aura, 0);

console.log('raid control ok');
