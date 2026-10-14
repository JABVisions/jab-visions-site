/**
 * Solid ground. A Ryder can step a curb and walk a steep trail. A cliff face
 * stops the body, and walking off a lip starts a fall instead of snapping
 * the feet through the hill.
 */

/** Rise you can step onto without it counting as a wall. */
export const STEP_HEIGHT = 0.7;

/**
 * Steepest walkable rise per metre of run. Mountain trails stay under this.
 * Waterfall lips and cave walls are steeper, so they stay solid.
 */
export const MAX_GRADE = 2.9;

export function slopeBlocks(rise: number, run: number, clearance: number) {
  if (rise <= clearance) return false;
  if (run < 0.03) return true;
  return rise > run * MAX_GRADE + 0.05;
}

const SHOULDER = 0.36;
const SHOULDERS: ReadonlyArray<readonly [number, number]> = [
  [SHOULDER, 0],
  [-SHOULDER, 0],
  [0, SHOULDER],
  [0, -SHOULDER],
];

/**
 * Keep `pos` out of a wall of ground. Mutates `pos`. Returns the floor under
 * the accepted point. `clearance` includes a jump, so a hop can clear a lip.
 */
export function resolveFooting(
  heightAt: (x: number, z: number) => number,
  pos: { x: number; z: number },
  fromX: number,
  fromZ: number,
  fromFloor: number,
  clearance: number,
) {
  let floor = heightAt(pos.x, pos.z);
  const runX = Math.abs(pos.x - fromX);
  const runZ = Math.abs(pos.z - fromZ);
  const run = Math.hypot(pos.x - fromX, pos.z - fromZ);
  if (slopeBlocks(floor - fromFloor, run, clearance)) {
    const blockX = slopeBlocks(heightAt(pos.x, fromZ) - fromFloor, runX, clearance);
    const blockZ = slopeBlocks(heightAt(fromX, pos.z) - fromFloor, runZ, clearance);
    if (blockX || (!blockX && !blockZ)) pos.x = fromX;
    if (blockZ || (!blockX && !blockZ)) pos.z = fromZ;
    floor = heightAt(pos.x, pos.z);
  }

  for (const [dx, dz] of SHOULDERS) {
    const side = heightAt(pos.x + dx, pos.z + dz);
    if (!slopeBlocks(side - floor, SHOULDER, clearance)) continue;
    pos.x -= dx;
    pos.z -= dz;
    floor = heightAt(pos.x, pos.z);
  }
  return floor;
}

/** A drop too steep to walk. The body should fall from `fromFeet` instead. */
export function ledgeDrop(fromFeet: number, floor: number, run: number) {
  const drop = fromFeet - floor;
  if (drop <= STEP_HEIGHT) return false;
  if (run < 0.03) return drop > STEP_HEIGHT;
  return drop > run * MAX_GRADE + 0.05;
}
