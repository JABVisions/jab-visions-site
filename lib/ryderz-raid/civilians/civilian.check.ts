import { CIVILIAN_PROFILES, civilianOrder, profileForKind } from './profiles';
import { tacticsForRound } from '../rounds/director';

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
  throwableOnRoute: true,
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
assert(coward.state === 'attack' && coward.attack != null, 'a hurt coward keeps fighting');

const waiting = civilianOrder(CIVILIAN_PROFILES.aggressive, {
  dist: 2.2,
  hpRatio: 1,
  holding: false,
  throwableDist: null,
  slot: 3,
  recovering: false,
  rng: 0.9,
});
assert(waiting.state === 'attack' && waiting.attack != null, 'a host already in reach swings instead of circling');
assert(Math.abs(waiting.strafe) < 0.6, 'attack slots sidestep instead of orbiting');

for (const slot of [0, 1, 2, 3, 4]) {
  const packed = civilianOrder(CIVILIAN_PROFILES.cautious, {
    dist: 2.1,
    hpRatio: 1,
    holding: false,
    throwableDist: null,
    slot,
    recovering: false,
    rng: 0.95,
  });
  assert(packed.state === 'attack' && packed.attack != null, `slot ${slot} attacks inside range`);
}

assert(profileForKind('thrower', 0.1) === 'thrower', 'thrower spawns stay throwers');

for (const profile of Object.values(CIVILIAN_PROFILES)) {
  for (const dist of [1, 1.5, 2]) {
    const order = civilianOrder(profile, {
      dist, hpRatio: 1, holding: false, throwableDist: null,
      slot: 4, recovering: false, rng: 0.5,
    });
    assert(order.state === 'attack' && order.attack != null, `${profile.id} commits at ${dist}m`);
    assert(order.strafe === 0, 'a striking host holds their attack line');
  }
}
assert(profileForKind('walker', 0) === 'brawler', 'walkers can come out as brawlers');

for (const profile of Object.values(CIVILIAN_PROFILES)) {
  for (const dist of [8, 60, 140]) {
    const pursuit = civilianOrder(profile, {
      dist, hpRatio: 0.05, holding: false, throwableDist: 1,
      throwableOnRoute: false, slot: 3, recovering: false, rng: 0,
      tier: 2, tactics: tacticsForRound(45),
    });
    assert(pursuit.state === 'approach' && pursuit.move > 0, `${profile.id} pursues from ${dist}m even when hurt`);
  }
}
const farProp = civilianOrder(CIVILIAN_PROFILES.thrower, {
  dist: 100, hpRatio: 1, holding: false, throwableDist: 1,
  throwableOnRoute: true, slot: 0, recovering: false, rng: 0,
});
assert(farProp.state === 'approach', 'a distant player takes priority over prop hunting');

console.log('civilian checks ok');
