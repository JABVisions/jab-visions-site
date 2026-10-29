import assert from 'node:assert/strict';
import {
  POWER_DRY_MAX,
  POWER_DRY_MIN,
  POWER_LIVE_MAX,
  POWER_LIVE_MAX_PVP,
  POWER_LIVE_MIN,
  POWER_LIVE_MIN_PVP,
  PowerOutage,
  abilityLockout,
} from './power-outage';

assert.equal(abilityLockout(30), 0, 'a 30s ultimate lockout is not a cooldown');
assert.equal(abilityLockout(14), 0);
assert.equal(abilityLockout(5), 0);
assert.equal(abilityLockout(0.35), 0.35, 'a tap guard can still debounce a toggle');
assert.equal(abilityLockout(Number.NaN), 0);

const out = new PowerOutage(false, () => 0);
assert.equal(POWER_LIVE_MIN, 30, 'Solo/Raid powers stay live for at least 30 seconds');
assert.equal(POWER_LIVE_MAX, 45);
assert.equal(POWER_LIVE_MIN_PVP, 20, 'PvP gets a longer power window too');
assert.equal(POWER_LIVE_MAX_PVP, 30);
assert.equal(out.live, POWER_LIVE_MIN);
assert.equal(out.down, false);

let shift = out.step(POWER_LIVE_MIN - 0.01, false, 90, () => 0);
assert.equal(shift.cut, false);
assert.equal(shift.aura, 90);
assert.equal(out.down, false);

shift = out.step(0.02, false, 90, () => 0);
assert.equal(shift.cut, true);
assert.equal(shift.aura, 0);
assert.equal(out.down, true);
assert.equal(out.dry, POWER_DRY_MIN);
assert.equal(out.stashed, 90);

shift = out.step(0.1, false, 40, () => 0);
assert.equal(shift.cut, false);
assert.equal(shift.aura, 0, 'regen during a blackout does not turn the aura back on');
assert.equal(out.stashed, 90);

shift = out.step(out.dry, false, 0, () => 1);
assert.equal(shift.back, true);
assert.equal(shift.aura, 90, 'the saved aura returns when powers do');
assert.equal(out.down, false);
assert.equal(out.live, POWER_LIVE_MAX);
assert.equal(out.stashed, 0);

const duel = new PowerOutage(true, () => 0);
assert.equal(duel.live, POWER_LIVE_MIN_PVP);
duel.step(POWER_LIVE_MIN_PVP, true, 40, () => 1);
assert.equal(duel.down, true);
assert.ok(duel.dry <= POWER_DRY_MAX);
duel.resume(true, () => 1);
assert.equal(duel.down, false);
assert.equal(duel.live, POWER_LIVE_MAX_PVP);
assert.equal(duel.stashed, 0);

const forced = new PowerOutage(false, () => 1);
forced.cutNow(4, 70);
assert.equal(forced.down, true);
assert.equal(forced.stashed, 70);
const clock = forced.snapshot();
const next = new PowerOutage(false, () => 0);
next.adopt(clock);
assert.equal(next.down, true);
assert.equal(next.stashed, 70);
assert.equal(next.dry, 4);

console.log('power outage ok');
