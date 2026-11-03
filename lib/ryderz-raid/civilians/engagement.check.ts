import assert from 'node:assert/strict';
import { DEFAULT_ENGAGEMENT, EngagementDirector, ringPoint, type EngagementCandidate } from './engagement';

const director = new EngagementDirector();
const cfg = { ...DEFAULT_ENGAGEMENT, slots: 2, reach: 4, rotate: 3, starve: 4, overflow: 1 };

const make = (dist: number, sinceAttack = 0, tier = 1, disabled = false): EngagementCandidate => ({
  ref: {},
  dist,
  sinceAttack,
  tier,
  disabled,
});

// Twelve bodies in reach: only `slots` swing.
const crowd = Array.from({ length: 12 }, (_, i) => make(1.5 + i * 0.1, i * 0.1));
let holders = director.assign(crowd, cfg, 0);
assert.equal(holders.size, 2, 'two slots, two attackers');
// The most starved bodies go first.
assert.ok(holders.has(crowd[11].ref) && holders.has(crowd[10].ref), 'starved bodies take the tokens');

// Tokens are stable frame to frame.
const again = director.assign(crowd, cfg, 0.5);
assert.deepEqual([...again], [...holders], 'holders keep their tokens next frame');

// A holder that walks out of reach loses the token to someone in reach.
crowd[11].dist = 9;
holders = director.assign(crowd, cfg, 1);
assert.ok(!holders.has(crowd[11].ref), 'out of reach drops the token');
assert.equal(holders.size, 2, 'the freed slot is refilled');

// Rotation: after `rotate` seconds the token moves on. Holders swung, so their starvation clock reset.
const first = [...holders];
for (const c of crowd) if (holders.has(c.ref)) c.sinceAttack = 0;
holders = director.assign(crowd, cfg, 1 + cfg.rotate + 0.1);
assert.ok(first.some((ref) => !holders.has(ref)), 'at least one token rotated');
assert.equal(holders.size, 2);

// Disabled (staggered / launched) bodies never hold a token.
const stunned = make(1, 10, 1, true);
holders = director.assign([stunned, make(2)], cfg, 10);
assert.ok(!holders.has(stunned.ref), 'a staggered body cannot attack');

// Starvation: a body that has waited too long inside close reach is forced in above the slot cap.
director.reset();
// Two hungrier bodies at the edge of reach take the slots; the patient one up close is still forced in.
const patient = make(2, cfg.starve + 1);
const squad = [make(3.6, cfg.starve + 3, 5), make(3.7, cfg.starve + 3, 5), patient];
holders = director.assign(squad, cfg, 20);
assert.equal(holders.size, 3, 'the starved body overflows the slot cap');
assert.ok(holders.has(patient.ref), 'nobody circles forever');
const lazy = make(2, 0.5);
holders = director.assign([...squad, lazy], cfg, 20.1);
assert.ok(!holders.has(lazy.ref), 'a body that just swung waits its turn');

// Elites press: given equal starvation an elite outranks a civilian.
director.reset();
const civ = make(1.5, 1, 1);
const elite = make(2.5, 1, 4);
holders = director.assign([civ, elite, make(3, 1, 1)], { ...cfg, slots: 1, overflow: 0 }, 30);
assert.ok(holders.has(elite.ref), 'the elite takes the single slot');

// Release drops a body that died.
director.release(elite.ref);
assert.ok(!director.has(elite.ref));

// Ring points are spread around the target at the requested radius.
const seen = new Set<string>();
for (let i = 0; i < 8; i += 1) {
  const p = ringPoint(10, -4, i, 8, 2.4);
  assert.ok(Math.abs(Math.hypot(p.x - 10, p.z + 4) - 2.4) < 1e-6, 'ring point sits on the radius');
  seen.add(`${p.x.toFixed(3)},${p.z.toFixed(3)}`);
}
assert.equal(seen.size, 8, 'eight distinct ring slots');

console.log('engagement ok');
