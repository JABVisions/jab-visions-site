/**
 * Swimming and diving on top of a height field. The body stays between the
 * floor and the wave, so a character cannot fall through the seabed or get
 * stuck inside the water surface.
 */

export type WaterMode = 'land' | 'wade' | 'surface' | 'under';

/** Ankle-deep. Still walking. */
export const WADE_DEPTH = 0.42;
/** Chest-deep. The body has to swim. */
export const SWIM_DEPTH = 1.05;
/** Head is under when the feet sit this far below the wave. */
export const HEAD_CLEARANCE = 1.48;
export const OXYGEN_DRAIN = 1 / 22;
export const OXYGEN_REFILL = 0.55;
/** Health lost per second once the air is gone. Slow enough that a dive is not a death. */
export const OXYGEN_HURT = 6;

export interface SwimState {
  mode: WaterMode;
  feetY: number;
  oxygen: number;
}

export interface WaterColumn {
  floor: number;
  surface: number;
  depth: number;
}

export interface SwimInput {
  dt: number;
  rise: boolean;
  dive: boolean;
  /** Positive pitch looks down. */
  pitch: number;
  moving: boolean;
  aheadFloor: number;
  aheadDepth: number;
}

export interface SwimResult {
  state: SwimState;
  speedScale: number;
  submerged: boolean;
  pose: 'none' | 'swim';
  entered: boolean;
  exited: boolean;
  hurt: number;
}

export function emptySwim(feetY = 0): SwimState {
  return { mode: 'land', feetY, oxygen: 1 };
}

function submerged(feetY: number, surface: number) {
  return feetY + HEAD_CLEARANCE < surface - 0.04;
}

/**
 * One simulation step. `column` is the water at the body's feet.
 * A missing column (no ocean on this arena) always walks.
 */
export function stepSwim(state: SwimState, column: WaterColumn | null, input: SwimInput): SwimResult {
  if (!column || column.depth < 0.08) {
    const exited = state.mode === 'surface' || state.mode === 'under' || state.mode === 'wade';
    return {
      state: { mode: 'land', feetY: column?.floor ?? state.feetY, oxygen: Math.min(1, state.oxygen + OXYGEN_REFILL * input.dt) },
      speedScale: 1,
      submerged: false,
      pose: 'none',
      entered: false,
      exited,
      hurt: 0,
    };
  }

  const { floor, surface, depth } = column;
  let mode = state.mode;
  let feetY = state.feetY;
  let oxygen = state.oxygen;

  if (depth < WADE_DEPTH) {
    mode = 'land';
    feetY = floor;
  } else if (depth < SWIM_DEPTH) {
    mode = 'wade';
    feetY = floor;
  } else {
    const surfaceFeet = surface - 1.02;
    const diving = input.dive || (input.moving && input.pitch > 0.42);
    if (mode !== 'under' && mode !== 'surface') {
      feetY = Math.min(surfaceFeet, Math.max(floor + 0.08, feetY || floor));
    }
    if (input.rise && input.aheadDepth < WADE_DEPTH && input.aheadFloor >= surface - 0.2) {
      return {
        state: { mode: 'land', feetY: input.aheadFloor, oxygen: Math.min(1, oxygen + OXYGEN_REFILL * input.dt) },
        speedScale: 1,
        submerged: false,
        pose: 'none',
        entered: false,
        exited: true,
        hurt: 0,
      };
    }
    if (diving) feetY -= 3.3 * input.dt;
    else if (input.rise) feetY += 3.8 * input.dt;
    else feetY += (surfaceFeet - feetY) * Math.min(1, input.dt * 2.4);
    const low = floor + 0.08;
    const high = surface - 0.2;
    feetY = Math.max(low, Math.min(high, feetY));
    mode = submerged(feetY, surface) ? 'under' : 'surface';
  }

  const headUnder = mode === 'under' || (mode === 'surface' && submerged(feetY, surface));
  if (headUnder) oxygen = Math.max(0, oxygen - OXYGEN_DRAIN * input.dt);
  else oxygen = Math.min(1, oxygen + OXYGEN_REFILL * input.dt);

  const entered = (state.mode === 'land' || state.mode === 'wade') && (mode === 'surface' || mode === 'under');
  const speedScale = mode === 'land' ? 1 : mode === 'wade' ? 0.68 : mode === 'surface' ? 0.62 : 0.74;
  return {
    state: { mode, feetY, oxygen },
    speedScale,
    submerged: headUnder,
    pose: mode === 'surface' || mode === 'under' ? 'swim' : 'none',
    entered,
    exited: false,
    hurt: headUnder && oxygen <= 0 ? OXYGEN_HURT * input.dt : 0,
  };
}

/** Direction toward shallower water. Null when every sample is as deep as here. */
export function shallowDirection(x: number, z: number, depthAt: (x: number, z: number) => number) {
  const here = depthAt(x, z);
  let best = here;
  let dx = 0;
  let dz = 0;
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    const sx = x + Math.cos(angle) * 4;
    const sz = z + Math.sin(angle) * 4;
    const depth = depthAt(sx, sz);
    if (depth < best - 0.05) {
      best = depth;
      dx = Math.cos(angle);
      dz = Math.sin(angle);
    }
  }
  if (dx === 0 && dz === 0) return null;
  return { x: dx, z: dz };
}
