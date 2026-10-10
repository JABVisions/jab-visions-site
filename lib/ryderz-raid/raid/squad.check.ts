import assert from 'node:assert/strict';
import { defaultSquad, squadReady, waveKinds } from './squad';
import { actRoom, createRoom, notePresenceForTests, readRoom, resetRoomsForTests } from './roomStore';

resetRoomsForTests();
const squad = defaultSquad('rubi');
assert.equal(squad.mode, 'COOPERATIVE_PVE');
assert.equal(squad.friendlyFire, false);
assert.equal(squad.difficulty, 'normal');
assert.equal(squad.slots.length, 4);
assert.equal(squad.slots[0].control, 'human');
assert.equal(squad.slots[1].control, 'computer');
assert.equal(squad.slots[2].control, 'computer');
assert.equal(squad.slots[3].control, 'computer');
assert.ok(squad.slots.slice(1).every((slot) => slot.ryderId && slot.ryderId !== 'rubi'));
assert.equal(squadReady(squad), false);
squad.slots[0].ready = true;
assert.equal(squadReady(squad), true);
const wave = waveKinds(1, 4);
assert.ok(wave.length >= 4 && wave.length <= 8);
assert.ok(wave.every((kind) => kind === 'walker' || kind === 'sprinter' || kind === 'heavy'));

const host = createRoom('guest-host', 'Ada', 'rubi', 1_000);
assert.equal(host.squad.slots.filter((slot) => slot.control === 'computer').length, 3);
const joined = actRoom({ action: 'join', code: host.code, guestId: 'guest-b', name: 'Bea' }, 1_100);
assert.equal(joined.squad.slots.filter((slot) => slot.control === 'human').length, 2);
assert.equal(joined.squad.slots.filter((slot) => slot.control === 'computer').length, 2);
assert.equal(joined.yourSlot, 1);
assert.throws(() => actRoom({ action: 'claim', code: host.code, guestId: 'guest-c', slot: 1 }, 1_200), /slot taken|not in room/);

actRoom({ action: 'join', code: host.code, guestId: 'guest-c', name: 'Cy' }, 1_300);
const full = actRoom({ action: 'join', code: host.code, guestId: 'guest-d', name: 'Dee' }, 1_400);
assert.equal(full.squad.slots.filter((slot) => slot.control === 'human').length, 4);
assert.throws(() => actRoom({ action: 'join', code: host.code, guestId: 'guest-e', name: 'Eve' }, 1_500), /full/);

notePresenceForTests(host.code, ['guest-host', 'guest-b', 'guest-c', 'guest-d'], 19_000);
actRoom({ action: 'leave', code: host.code, guestId: 'guest-d' }, 19_100);
const afterLeave = readRoom(host.code, 'guest-host', 19_200);
assert.ok(afterLeave);
assert.equal(afterLeave.squad.slots[3].control, 'computer');

const again = actRoom({ action: 'join', code: host.code, guestId: 'guest-d', name: 'Dee' }, 20_200);
assert.equal(again.squad.slots.filter((slot) => slot.control === 'human').length, 4);
for (const guestId of ['guest-host', 'guest-b', 'guest-c', 'guest-d']) {
  actRoom({ action: 'ready', code: host.code, guestId, ready: true }, 20_300);
}
const started = actRoom({ action: 'start', code: host.code, guestId: 'guest-host' }, 20_400);
assert.equal(started.lifecycle, 'COUNTDOWN');
const live = readRoom(host.code, 'guest-b', 24_000);
assert.equal(live?.lifecycle, 'IN_PROGRESS');

const posted = actRoom(
  {
    action: 'snapshot',
    code: host.code,
    guestId: 'guest-host',
    snapshot: {
      phase: 'playing',
      wave: 1,
      waves: 3,
      enemiesLeft: 4,
      defeated: 1,
      dealt: 40,
      taken: 10,
      at: 24_100,
      contributions: [{ name: 'Rubi', dealt: 40 }],
      fighters: [
        { id: 'p1', ryderId: 'rubi', name: 'Rubi', hp: 80, maxHp: 100, x: 1, z: 2, ally: true, human: true },
        { id: 'e1', ryderId: null, name: 'Host', hp: 20, maxHp: 40, x: 4, z: 2, ally: false, human: false },
      ],
    },
  },
  24_100,
);
assert.equal(posted.snapshot?.fighters[0].x, 1);
assert.throws(
  () =>
    actRoom(
      {
        action: 'snapshot',
        code: host.code,
        guestId: 'guest-b',
        snapshot: posted.snapshot!,
      },
      24_200,
    ),
  /authority/,
);
const healed = actRoom(
  {
    action: 'snapshot',
    code: host.code,
    guestId: 'guest-host',
    snapshot: {
      ...posted.snapshot!,
      fighters: posted.snapshot!.fighters.map((fighter) => (fighter.id === 'p1' ? { ...fighter, hp: 200 } : fighter)),
    },
  },
  24_300,
);
assert.equal(healed.snapshot?.fighters.find((fighter) => fighter.id === 'p1')?.hp, 80);

notePresenceForTests(host.code, ['guest-host', 'guest-b', 'guest-c', 'guest-d'], 39_900);
actRoom({ action: 'leave', code: host.code, guestId: 'guest-b' }, 40_000);
const dropped = readRoom(host.code, 'guest-host', 40_100);
assert.equal(dropped?.squad.slots[1].control, 'disconnected');
const back = actRoom({ action: 'join', code: host.code, guestId: 'guest-b', name: 'Bea' }, 40_200);
assert.equal(back.squad.slots[1].control, 'human');
assert.equal(back.squad.slots[1].playerId, 'guest-b');
assert.equal(back.squad.slots.filter((slot) => slot.playerId === 'guest-b').length, 1);

console.log('raid squad room ok', host.code);
