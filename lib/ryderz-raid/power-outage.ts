/**
 * Q, E, and R have no cooldown. In Solo and Raid, powers stay up for a long
 * random stretch, then cut out for every fighter. While they are out the aura
 * is dark and only melee and movement work. When the stretch ends, the aura
 * that was saved comes back. A duel never cuts powers: usage stays unlimited
 * for the whole match, and the gauge does not run a clock.
 */

export const POWER_LIVE_MIN = 22;
export const POWER_LIVE_MAX = 36;
export const POWER_DRY_MIN = 4;
export const POWER_DRY_MAX = 7;
/** Kept so older callers compile. PvP does not roll a live or dry window. */
export const POWER_LIVE_MIN_PVP = 0;
export const POWER_LIVE_MAX_PVP = 0;
export const POWER_DRY_MIN_PVP = 0;
export const POWER_DRY_MAX_PVP = 0;

/** A tap this short may debounce a held toggle. Anything longer is not a cooldown. */
const TAP_GUARD = 0.4;

export interface PowerClock {
  live: number;
  dry: number;
  stashed: number;
}

export interface PowerShift {
  /** True on the frame powers cut out. */
  cut: boolean;
  /** True on the frame powers return. */
  back: boolean;
  /** Aura to show. Zero while powers are out. */
  aura: number;
}

/**
 * Q/E/R lockouts are ignored. A gap of `TAP_GUARD` or less can still stop a
 * second press from cancelling a toggle that just started.
 */
export function abilityLockout(seconds: number) {
  if (!Number.isFinite(seconds) || seconds > TAP_GUARD) return 0;
  return Math.max(0, seconds);
}

function span(min: number, max: number, roll: () => number) {
  return min + roll() * (max - min);
}

export class PowerOutage {
  live: number;
  dry = 0;
  /** Aura hidden while powers are out, restored when they return. */
  stashed = 0;

  constructor(pvp = false, roll: () => number = Math.random) {
    this.live = pvp ? 0 : rollLive(roll);
  }

  get down() {
    return this.dry > 0;
  }

  snapshot(): PowerClock {
    return { live: this.live, dry: this.dry, stashed: this.stashed };
  }

  adopt(clock: PowerClock) {
    this.live = Math.max(0, clock.live);
    this.dry = Math.max(0, clock.dry);
    this.stashed = Math.max(0, clock.stashed);
  }

  /** Start a blackout now. Saves `aura` when nothing is already hidden. */
  cutNow(seconds: number, aura: number) {
    this.live = 0;
    this.dry = Math.max(0.05, seconds);
    if (this.stashed <= 0) this.stashed = Math.max(0, aura);
  }

  /** Drop a blackout and start a fresh live window. The beacon uses this. A duel stays live. */
  resume(pvp: boolean, roll: () => number = Math.random) {
    this.dry = 0;
    this.stashed = 0;
    this.live = pvp ? 0 : rollLive(roll);
  }

  step(dt: number, pvp: boolean, aura: number, roll: () => number = Math.random): PowerShift {
    if (pvp) {
      this.live = 0;
      if (this.dry > 0 || this.stashed > 0) {
        this.dry = 0;
        const back = this.stashed > 0 ? this.stashed : aura;
        this.stashed = 0;
        return { cut: false, back: true, aura: back };
      }
      return { cut: false, back: false, aura };
    }
    if (this.dry > 0) {
      this.dry = Math.max(0, this.dry - dt);
      if (this.dry === 0) {
        this.live = rollLive(roll);
        const back = this.stashed;
        this.stashed = 0;
        return { cut: false, back: true, aura: back };
      }
      return { cut: false, back: false, aura: 0 };
    }
    this.live = Math.max(0, this.live - dt);
    if (this.live > 0) return { cut: false, back: false, aura };
    this.dry = rollDry(roll);
    this.stashed = Math.max(0, aura);
    return { cut: true, back: false, aura: 0 };
  }
}

function rollLive(roll: () => number) {
  return span(POWER_LIVE_MIN, POWER_LIVE_MAX, roll);
}

function rollDry(roll: () => number) {
  return span(POWER_DRY_MIN, POWER_DRY_MAX, roll);
}
