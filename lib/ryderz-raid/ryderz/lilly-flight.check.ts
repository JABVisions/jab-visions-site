import assert from 'node:assert/strict';
import { FLIGHT_CEILING, FLIGHT_WINDOW, forkArmed, inArc, shouldStartFlight, stepAltitude } from './lilly-flight';

assert.equal(
  shouldStartFlight({ airborne: true, sinceJump: 0.2, giant: false, phase: 'ground' }),
  true,
  'a second jump while still in the hop mounts',
);
assert.equal(
  shouldStartFlight({ airborne: true, sinceJump: FLIGHT_WINDOW + 0.05, giant: false, phase: 'ground' }),
  false,
  'a late jump does not mount',
);
assert.equal(
  shouldStartFlight({ airborne: false, sinceJump: 0.1, giant: false, phase: 'ground' }),
  false,
  'the first hop stays a jump',
);
assert.equal(
  shouldStartFlight({ airborne: true, sinceJump: 0.1, giant: true, phase: 'ground' }),
  false,
  'giant step does not mount',
);
assert.equal(
  shouldStartFlight({ airborne: true, sinceJump: 0.1, giant: false, phase: 'flying' }),
  false,
  'she does not mount twice',
);

assert.equal(forkArmed({ aura: 40, burnout: false, phase: 'ground' }), true);
assert.equal(forkArmed({ aura: 0, burnout: false, phase: 'ground' }), false, 'no aura, no weapon');
assert.equal(forkArmed({ aura: 40, burnout: true, phase: 'ground' }), false);
assert.equal(forkArmed({ aura: 40, burnout: false, phase: 'flying' }), false, 'the fork is a mount in the air');

assert.equal(stepAltitude(2, 0.5, 0), 2, 'releasing climb holds altitude');
assert.equal(stepAltitude(13.5, 0.2, 1), FLIGHT_CEILING, 'she cannot climb past the ceiling');
assert.equal(stepAltitude(0.2, 0.1, -1), 0, 'descent stops at the ground');
assert.ok(stepAltitude(4, 0.2, 1) > 4);
assert.ok(stepAltitude(4, 0.2, -1) < 4);

assert.equal(inArc(0, 2, 0, 2.6, 0.35, 0.4), true, 'a thrust reaches straight ahead');
assert.equal(inArc(2, 0.2, 0, 2.6, 0.35, 0.4), false, 'a thrust misses a target beside her');
assert.equal(inArc(2.2, 0.4, 0, 3.1, 1.35, 0.4), true, 'a sweep covers the side');
assert.equal(inArc(0, 6, 0, 2.6, 0.35, 0.4), false, 'a far target is not hit');

console.log('lilly flight checks ok');
