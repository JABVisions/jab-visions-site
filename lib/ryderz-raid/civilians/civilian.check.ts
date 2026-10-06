import { CIVILIAN_PROFILES, civilianOrder, profileForKind } from './profiles';

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

const brawler = CIVILIAN_PROFILES.brawler;
const far = civilianOrder(brawler, {
  dist: 8,
  hpRatio: 1,
  holding: false,
  throwableDist: null,
  slot: 0,
  recovering: false,
  rng: 0.1,
});
assert(far.state === 'approach' && far.attack === null, 'a far brawler closes in before swinging');

const inRange = civilianOrder(brawler, {
  dist: 1.5,
  hpRatio: 1,
  holding: false,
  throwableDist: null,
  slot: 0,
  recovering: false,
  rng: 0.1,
});
assert(inRange.state === 'attack' && inRange.attack === 'punch', 'a brawler punches inside reach');
assert(inRange.move < 0.2, 'a brawler does not keep running through the Ryder');

const thrower = civilianOrder(CIVILIAN_PROFILES.thrower, {
  dist: 6,
  hpRatio: 1,
  holding: false,
  throwableDist: 3,
  slot: 0,
  recovering: false,
  rng: 0.2,
});
assert(thrower.state === 'search' && thrower.attack === null, 'a thrower goes for a prop before a punch');

const tossing = civilianOrder(CIVILIAN_PROFILES.thrower, {
  dist: 5,
  hpRatio: 1,
  holding: true,
  throwableDist: null,
  slot: 0,
  recovering: false,
  rng: 0.2,
});
assert(tossing.state === 'throw' && tossing.attack === 'throwObject', 'a thrower lets go once they are holding something');

const coward = civilianOrder(CIVILIAN_PROFILES.cowardly, {
  dist: 2,
  hpRatio: 0.2,
  holding: false,
  throwableDist: null,
  slot: 0,
  recovering: false,
  rng: 0.5,
});
assert(coward.state === 'flee' && coward.move < 0, 'a hurt coward runs');

const waiting = civilianOrder(CIVILIAN_PROFILES.aggressive, {
  dist: 2.2,
  hpRatio: 1,
  holding: false,
  throwableDist: null,
  slot: 3,
  recovering: false,
  rng: 0.9,
});
assert(waiting.state === 'circle', 'later civilians hang off the pile instead of stacking');

assert(profileForKind('thrower', 0.1) === 'thrower', 'thrower spawns stay throwers');
assert(profileForKind('walker', 0) === 'brawler', 'walkers can come out as brawlers');

console.log('civilian checks ok');
