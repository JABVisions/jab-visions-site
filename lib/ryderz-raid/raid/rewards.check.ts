import assert from 'node:assert/strict';
import { RAID_REWARDS, killReward } from './rewards';

assert.equal(killReward(1), RAID_REWARDS.basic);
assert.equal(killReward(2), 100);
assert.equal(killReward(3), 100);
assert.equal(killReward(4), 250);
assert.equal(killReward(5), RAID_REWARDS.elite);
assert.equal(killReward(6), 1000);
assert.equal(killReward(1, true), RAID_REWARDS.miniBoss);
assert.equal(RAID_REWARDS.round, 500);
assert.equal(RAID_REWARDS.secret, 750);
assert.equal(RAID_REWARDS.chest, 300);
assert.equal(RAID_REWARDS.finisher, 150);

console.log('raid rewards ok');
