import assert from 'node:assert/strict';
import { applyGuestIntent, seatGuests, seatMissing } from './online';
import { defaultSquad, launchFromSquad, squadReady } from './squad';

const squad = defaultSquad('rubi', 'Host');
squad.slots[0].playerId = 'guest-host';
squad.slots[0].ready = true;

const seated = seatGuests(squad, [{ guestId: 'guest-b', name: 'Bea', ready: true }]);
assert.equal(seated.slots.filter((slot) => slot.control === 'human').length, 2);
assert.equal(seated.slots[1].playerId, 'guest-b');
assert.equal(seated.slots[1].displayName, 'Bea');
assert.equal(seated.slots[1].control, 'human');
assert.ok(seated.slots[1].ryderId);

const again = seatGuests(seated, [{ guestId: 'guest-b', name: 'Bea', ready: true }]);
assert.equal(again.slots.filter((slot) => slot.playerId === 'guest-b').length, 1);

const launch = launchFromSquad(again, 'rubi');
const player2 = launch.allies.find((ally) => ally.playerId === 'guest-b');
assert.ok(player2, 'player 2 is in the launch plan');
assert.equal(player2?.human, true);
assert.equal(player2?.seat, 1);
assert.equal(squadReady(again), true);

const serverMissedThem = seatGuests(squad, [{ guestId: 'guest-b', name: 'Bea', ready: true }]);
assert.equal(launchFromSquad(serverMissedThem, 'rubi').allies.some((ally) => ally.playerId === 'guest-b' && ally.human), true);

const joined = applyGuestIntent(squad, [], { intent: 'join', guestId: 'guest-c', name: 'Cy' });
assert.equal(joined.squad.slots[1].playerId, 'guest-c');
assert.equal(joined.squad.slots[1].ready, false);
const readied = applyGuestIntent(joined.squad, joined.guests, { intent: 'ready', guestId: 'guest-c', ready: true });
assert.equal(readied.squad.slots[1].ready, true);
const swapped = applyGuestIntent(readied.squad, readied.guests, {
  intent: 'character',
  guestId: 'guest-c',
  slot: 1,
  ryderId: 'aaron',
});
assert.equal(swapped.squad.slots[1].ryderId, 'aaron');
assert.equal(swapped.squad.slots[1].ready, false);
const stolen = applyGuestIntent(swapped.squad, swapped.guests, {
  intent: 'character',
  guestId: 'guest-c',
  slot: 0,
  ryderId: 'leo',
});
assert.equal(stolen.squad.slots[0].ryderId, 'rubi');

const serverReady = seatGuests(squad, [{ guestId: 'guest-b', name: 'Bea', ready: true }]);
const kept = seatMissing(serverReady, [{ guestId: 'guest-b', name: 'Bea', ready: false }, { guestId: 'guest-d', name: 'Dee', ready: true }]);
assert.equal(kept.slots[1].ready, true);
assert.equal(kept.slots.find((slot) => slot.playerId === 'guest-d')?.control, 'human');
assert.equal(launchFromSquad(kept, 'rubi').allies.filter((ally) => ally.human).length, 2);

console.log('raid online seating ok');
