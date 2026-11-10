import assert from 'node:assert/strict';
import { arenaAllows, arenaSpec } from '../arenas';
import { NavGrid, sealCrevices } from '../nav-grid';
import type { Obstacle } from '../world';
import {
  ENTRANCE_TRAIL,
  RIVERDALE,
  RIVERDALE_BEACON,
  RIVERDALE_CACHES,
  RIVERDALE_HALF_X,
  RIVERDALE_HALF_Z,
  RIVERDALE_SPAWN,
  SPAWN_CLEAR,
  SPAWN_ZONES,
  STORY_TRIGGERS,
} from './config';
import { StoryTriggerSet } from './story';
import {
  beamHeight,
  columnOmitted,
  ledgeTop,
  riverdaleCeiling,
  riverdaleColumns,
  riverdaleGround,
  riverdaleObstacles,
  strutHeight,
  trailDistance,
  underStructure,
} from './terrain';

const inside = (o: Obstacle, x: number, z: number, pad = 0) =>
  o.kind === 'box'
    ? x > o.minX - pad && x < o.maxX + pad && z > o.minZ - pad && z < o.maxZ + pad
    : Math.hypot(x - o.x, z - o.z) < o.r + pad;

const obstacles = riverdaleObstacles();
obstacles.push(...sealCrevices(obstacles, RIVERDALE.bounds, { open: 1.1 }));
const blocked = (x: number, z: number, pad = 0.4) => obstacles.some((o) => inside(o, x, z, pad));

// Registration: solo and co-op Raid only.
const arena = arenaSpec('riverdale_party');
assert.ok(arena, 'riverdale_party registered');
assert.equal(arena.name, 'The Riverdale Party');
assert.equal(arena.worldKey, 'riverdale');
assert.ok(arena.available);
assert.match(arena.setting, /Urban \/ Woodland/);
assert.equal(
  arena.description,
  'A secret party beneath an abandoned concrete structure deep in the woods. When the celebration turns into chaos, the Ryderz must survive.',
);
assert.match(arena.picture ?? '', /riverdale-party\.webp/);
assert.ok(arenaAllows(arena, 'solo'));
assert.ok(arenaAllows(arena, 'raid'));
assert.ok(!arenaAllows(arena, 'pvp'), 'PvP stays off on Riverdale');
assert.ok(arenaAllows(arenaSpec('block')!, 'pvp'), 'arenas without a mode list allow every mode');

// Ground: finite everywhere, rising toward the back wall, falling into the woods.
for (let x = -RIVERDALE.bounds; x <= RIVERDALE.bounds; x += 3.7) {
  for (let z = -RIVERDALE.bounds; z <= RIVERDALE.bounds; z += 3.7) {
    assert.ok(Number.isFinite(riverdaleGround(x, z)), `ground ${x},${z}`);
  }
}
assert.ok(riverdaleGround(0, -16) > riverdaleGround(0, 0) + 1.5, 'floor rises to the back wall');
assert.ok(riverdaleGround(0, 40) < riverdaleGround(0, 10) - 1, 'woods fall away past the open side');
assert.ok(Math.abs(ledgeTop() - riverdaleGround(43, -16)) < 1e-9, 'ledge cache stands on the ledge');

// Roof: every point under the slab has a ceiling above the ground with room to stand.
for (let x = -RIVERDALE_HALF_X; x <= RIVERDALE_HALF_X; x += 2.5) {
  for (let z = -RIVERDALE_HALF_Z + 0.5; z <= RIVERDALE_HALF_Z; z += 2.5) {
    const ceiling = riverdaleCeiling(x, z);
    assert.ok(ceiling !== null && ceiling - riverdaleGround(x, z) > 2.35, `headroom ${x},${z}`);
    assert.ok(ceiling < strutHeight(x, z) - 0.5, 'crowns stop below the struts');
    assert.ok(strutHeight(x, z) < RIVERDALE.ceiling - 0.6, 'struts stay under the ribs');
  }
}
assert.ok(Math.abs(strutHeight(0, 0) - RIVERDALE.strutY) < 1e-5, 'party floor steel at the base strut line');
for (const row of RIVERDALE.columnRows) {
  for (let x = -RIVERDALE_HALF_X; x <= RIVERDALE_HALF_X; x += 0.5) {
    assert.ok(beamHeight(x - 4.5, row, x + 4.5, row) >= strutHeight(x, row) - 1e-6, 'beam covers its span');
  }
}
assert.equal(riverdaleCeiling(0, 30), null, 'open sky over the woods');
assert.equal(riverdaleCeiling(RIVERDALE_HALF_X + 5, 0), null);

// Columns: a regular grid with the party bay held open.
const columns = riverdaleColumns();
assert.equal(columns.length, 34, `columns ${columns.length}`);
assert.ok(columns.every((c) => !columnOmitted(c.x, c.row)));
assert.ok(!columns.some((c) => Math.abs(c.x) < RIVERDALE.clearing.halfX - 1 && Math.abs(c.z) < 5), 'party bay open');

// Spawns, beacon and caches stand in the open, inside the arena.
const spots = [
  { name: 'spawn', ...RIVERDALE_SPAWN },
  { name: 'beacon', ...RIVERDALE_BEACON },
  ...RIVERDALE_CACHES.map((c) => ({ name: c.id, x: c.x, z: c.z })),
];
for (const spot of spots) {
  assert.ok(Math.abs(spot.x) < RIVERDALE.bounds && Math.abs(spot.z) < RIVERDALE.bounds, `${spot.name} in bounds`);
  assert.ok(!blocked(spot.x, spot.z, 0.2), `${spot.name} clear of solids`);
}
assert.equal(RIVERDALE_CACHES.length, 5);
assert.equal(new Set(RIVERDALE_CACHES.map((c) => c.id)).size, 5);
assert.ok(trailDistance(RIVERDALE_SPAWN.x, RIVERDALE_SPAWN.z) < 2, 'raid starts on the entrance trail');
const trailEnd = ENTRANCE_TRAIL[ENTRANCE_TRAIL.length - 1];
assert.ok(underStructure(trailEnd.x, trailEnd.z), 'trail ends on the party floor');

// Six spawn zones, each walkable to the party.
assert.deepEqual(SPAWN_ZONES.map((z) => z.id), ['A', 'B', 'C', 'D', 'E', 'F']);
assert.ok(SPAWN_CLEAR >= 15);
const nav = new NavGrid(obstacles, RIVERDALE.bounds);
const walk = (fromX: number, fromZ: number, toX: number, toZ: number) => {
  let x = fromX;
  let z = fromZ;
  for (let step = 0; step < 400; step += 1) {
    if (Math.hypot(toX - x, toZ - z) < 1.5) return true;
    const next = nav.routeTo(x, z, toX, toZ, 0.45) ?? { x: toX, z: toZ };
    const dx = next.x - x;
    const dz = next.z - z;
    const d = Math.hypot(dx, dz) || 1;
    const move = Math.min(d, 0.5);
    x += (dx / d) * move;
    z += (dz / d) * move;
    if (blocked(x, z, 0)) return false;
  }
  return false;
};
for (const zone of SPAWN_ZONES) {
  const start = nav.openSpot(zone.x, zone.z, 0.45) ?? zone;
  assert.ok(!blocked(start.x, start.z, 0.2), `zone ${zone.id} spawn open`);
  assert.ok(walk(start.x, start.z, 0, 2), `zone ${zone.id} reaches the party floor`);
}
for (const cache of RIVERDALE_CACHES) {
  assert.ok(walk(0, 2, cache.x, cache.z), `cache ${cache.id} reachable`);
}
assert.ok(walk(RIVERDALE_SPAWN.x, RIVERDALE_SPAWN.z, RIVERDALE_BEACON.x, RIVERDALE_BEACON.z), 'spawn reaches beacon');

// Story triggers: dormant until a story controller turns them on, then each fires once.
const story = new StoryTriggerSet();
assert.equal(story.regions.length, STORY_TRIGGERS.length);
const fired: string[] = [];
story.onEnter((id) => fired.push(id));
story.update(RIVERDALE_SPAWN.x, RIVERDALE_SPAWN.z);
story.update(0, 0);
assert.deepEqual(fired, [], 'dormant triggers never fire');
story.activate();
story.update(RIVERDALE_SPAWN.x, RIVERDALE_SPAWN.z);
story.update(RIVERDALE_SPAWN.x, RIVERDALE_SPAWN.z);
assert.deepEqual(fired, ['forest-arrival']);
story.update(0, 0);
assert.deepEqual(fired, ['forest-arrival', 'main-gathering', 'initial-conflict', 'major-combat']);
story.deactivate();
story.update(RIVERDALE_HALF_X + 2, 2);
assert.ok(!(fired as string[]).includes('exit'));
story.activate();
story.update(0, 0);
assert.equal(fired.filter((id) => id === 'main-gathering').length, 2, 're-activation re-arms the regions');
story.dispose();

console.log('riverdale ok', { columns: columns.length, obstacles: obstacles.length, zones: SPAWN_ZONES.length });
