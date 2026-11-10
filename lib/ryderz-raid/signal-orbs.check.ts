import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SignalBank, SP_REWARDS } from './progression/signal-points';
import { ORB_VISIBLE_CAP, SignalOrbs, splitReward, type OrbCollector } from './signal-orbs';

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

// Splits always add up to the reward exactly.
for (const total of [1, 5, 10, 25, 75, 150, 333]) {
  for (let i = 0; i < 20; i += 1) {
    const parts = splitReward(total);
    assert.equal(sum(parts), total, `split of ${total}`);
    assert.ok(parts.every((v) => v > 0), `split of ${total} has no empty orbs`);
  }
}
assert.deepEqual(splitReward(10, () => 0), [5, 5], 'a civilian drops two 5 SP orbs by default');

const flat = {
  floor: () => 0,
  blocked: (x: number, z: number) => Math.abs(x) > 50 || Math.abs(z) > 50 || (x > 2 && x < 3),
};
const camera = new THREE.PerspectiveCamera();
const run = (orbs: SignalOrbs, collectors: OrbCollector[], seconds: number) => {
  let paid = 0;
  const ids: number[] = [];
  for (let t = 0; t < seconds; t += 1 / 30) {
    for (const p of orbs.update(1 / 30, t, collectors, camera)) {
      paid += p.amount;
      ids.push(...p.ids);
    }
  }
  return { paid, ids };
};

// A kill bursts orbs that settle, then a Ryder walking in collects every SP once.
{
  const orbs = new SignalOrbs(flat);
  orbs.drop(10, 0, 0, 1, 0);
  assert.ok(orbs.count >= 2, 'a civilian drops at least two orbs');
  const far = run(orbs, [{ seat: 0, x: 20, y: 1, z: 20, radius: 4 }], 2);
  assert.equal(far.paid, 0, 'nothing pays while the Ryder is out of range');
  assert.equal(orbs.outstanding(), 10, 'the reward waits on the street');
  const near = run(orbs, [{ seat: 0, x: 1, y: 1, z: 1.5, radius: 4 }], 3);
  assert.equal(near.paid, 10, 'walking in collects the full 10 SP');
  assert.equal(new Set(near.ids).size, near.ids.length, 'each orb pays once');
  assert.equal(orbs.count, 0);
}

// Orbs never rest inside a wall.
{
  const orbs = new SignalOrbs(flat);
  for (let i = 0; i < 30; i += 1) orbs.drop(10, 0, 2.5, 1, 0);
  run(orbs, [], 3);
  const any = orbs as unknown as { orbs: { pos: THREE.Vector3 }[] };
  for (const orb of any.orbs) assert.ok(!flat.blocked(orb.pos.x, orb.pos.z), `orb at ${orb.pos.x.toFixed(2)} rests in the open`);
}

// Owner hold: a teammate cannot pull another seat's fresh drop.
{
  const orbs = new SignalOrbs(flat);
  orbs.drop(10, 1, 0, 1, 0);
  const early = run(orbs, [{ seat: 0, x: 0.5, y: 1, z: 0.5, radius: 4 }], 3);
  assert.equal(early.paid, 0, 'seat 0 cannot take seat 1 orbs at first');
  const later = run(orbs, [{ seat: 0, x: 0.5, y: 1, z: 0.5, radius: 4 }], 8);
  assert.equal(later.paid, 10, 'after the hold anyone nearby collects');
}

// Abandoned orbs fly to their owner from across the map.
{
  const orbs = new SignalOrbs(flat);
  orbs.drop(10, 0, -40, 1, -40);
  const res = run(orbs, [{ seat: 0, x: 40, y: 1, z: 40, radius: 4 }], 36);
  assert.equal(res.paid, 10, 'an orb left for 30 s homes in on its owner');
}

// Crowded field: past the cap, drops merge and keep every SP.
{
  const orbs = new SignalOrbs(flat);
  for (let i = 0; i < 400; i += 1) orbs.drop(10, 0, (i % 20) - 10, 1, Math.floor(i / 20) - 10);
  assert.ok(orbs.count <= ORB_VISIBLE_CAP, `field holds ${orbs.count} orbs`);
  assert.equal(orbs.outstanding(), 4000, 'merging keeps all 4,000 SP');
  const flushed = orbs.flush();
  assert.equal(sum(flushed.map((p) => p.amount)), 4000, 'flush pays every SP still on the field');
  assert.equal(orbs.count, 0);
}

// The bank: a kill claims its SP without paying it, the finisher pays at once, orbs pay once by id.
{
  const bank = new SignalBank();
  const host = {};
  const owed = bank.claimKill(host, 1, false, true, 1, 0);
  assert.equal(owed, SP_REWARDS.civilian);
  assert.equal(bank.earned, SP_REWARDS.finisher, 'only the finisher bonus is paid at the kill');
  assert.equal(bank.claimKill(host, 1, false, true, 1, 0), 0, 'a body never drops twice');
  assert.equal(bank.collect([1, 2], 10, 1, 0), 10);
  assert.equal(bank.collect([1, 2], 10, 1, 0), 0, 'a replayed pickup pays nothing');
  assert.equal(bank.earned, SP_REWARDS.finisher + 10);
  assert.equal(bank.tally.kill, 1, 'the kill is counted once');
  assert.equal(bank.claimKill({}, 4, false, false, 1, 0), SP_REWARDS.elite, 'elites carry more');
}

console.log('signal orbs ok');
