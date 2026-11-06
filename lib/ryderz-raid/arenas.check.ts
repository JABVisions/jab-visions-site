import assert from 'node:assert/strict';
import { arenaSpec, formatSpan, listArenas } from './arenas';

const playable = listArenas().filter((arena) => arena.available).map((arena) => arena.id);
assert.deepEqual(playable, ['block', 'training-pad', 'island-paradise']);

const block = arenaSpec('block');
const pad = arenaSpec('training-pad');
const island = arenaSpec('island-paradise');
assert.ok(block && pad && island);

assert.equal(block.size.label, 'City');
assert.ok(block.size.metres > 160 && block.size.metres < 220, `block span ${block.size.metres}`);
assert.match(block.description, /blocks/i);
assert.match(block.size.guide, /four/i);

assert.equal(pad.size.label, 'Compact');
assert.ok(pad.size.metres < block.size.metres);
assert.match(pad.size.guide, /32 m/);

assert.equal(island.size.label, 'Vast');
assert.ok(island.size.metres > 1500);
assert.equal(formatSpan(island.size.metres), '1.6 km across');
assert.equal(formatSpan(block.size.metres), `${Math.round(block.size.metres)} m across`);

for (const arena of listArenas()) {
  assert.ok(arena.size.guide.length > 12, arena.id);
  assert.ok(arena.description.length > 12, arena.id);
}

console.log('arenas ok', {
  block: formatSpan(block.size.metres),
  pad: formatSpan(pad.size.metres),
  island: formatSpan(island.size.metres),
});
