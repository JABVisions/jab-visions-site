import assert from 'node:assert/strict';
import { DEFAULT_RAID_FLAGS, RAID_SYSTEM_FLAGS, applyRaidFlagTokens, resolveRaidFlags, serializeRaidFlags } from './flags';

assert.equal(DEFAULT_RAID_FLAGS.profiler, false, 'the profiler is opt-in');
for (const name of RAID_SYSTEM_FLAGS) assert.equal(DEFAULT_RAID_FLAGS[name], true, `${name} ships on`);

const legacy = resolveRaidFlags(null, '?raidflags=legacy');
for (const name of RAID_SYSTEM_FLAGS) assert.equal(legacy[name], false, `legacy switches ${name} off`);
assert.equal(legacy.profiler, false, 'legacy leaves tooling alone');

const mixed = resolveRaidFlags(null, '?arena=block&raidflags=legacy,cameraBvh,profiler');
assert.equal(mixed.cameraBvh, true, 'a flag named after legacy comes back on');
assert.equal(mixed.cameraFollow, false);
assert.equal(mixed.profiler, true);

const off = resolveRaidFlags('-sweptMove', '');
assert.equal(off.sweptMove, false, 'a stored override applies');
assert.equal(off.cameraBvh, true);
const urlWins = resolveRaidFlags('-sweptMove', 'raidflags=sweptmove');
assert.equal(urlWins.sweptMove, true, 'the URL beats storage, and names are case-insensitive');

assert.deepEqual(applyRaidFlagTokens(DEFAULT_RAID_FLAGS, 'nonsense, ,-alsoNothing'), DEFAULT_RAID_FLAGS, 'unknown tokens are ignored');
assert.notEqual(applyRaidFlagTokens(DEFAULT_RAID_FLAGS, ''), DEFAULT_RAID_FLAGS, 'the defaults are never handed out by reference');

assert.equal(serializeRaidFlags(DEFAULT_RAID_FLAGS), '');
const round = applyRaidFlagTokens(DEFAULT_RAID_FLAGS, '-jumpAssist profiler');
assert.deepEqual(applyRaidFlagTokens(DEFAULT_RAID_FLAGS, serializeRaidFlags(round)), round, 'serialize round-trips');

console.log('raid flags checks passed');
