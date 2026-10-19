import type { Obstacle } from './world';

/** A walk blocker worth drawing on the raid chart. Metres, world XZ. */
export type MapBlock =
  | { kind: 'box'; minX: number; maxX: number; minZ: number; maxZ: number }
  | { kind: 'circle'; x: number; z: number; r: number };

/**
 * Structures a fighter cannot walk through. Lamp posts and hairline rails
 * stay off the chart so the buildings, walls, cars, and rocks stay readable.
 */
export function chartBlocks(obstacles: readonly Obstacle[]): MapBlock[] {
  const blocks: MapBlock[] = [];
  for (const obstacle of obstacles) {
    if (obstacle.kind === 'circle') {
      if (obstacle.r < 0.5) continue;
      blocks.push({ kind: 'circle', x: obstacle.x, z: obstacle.z, r: obstacle.r });
      continue;
    }
    const width = obstacle.maxX - obstacle.minX;
    const depth = obstacle.maxZ - obstacle.minZ;
    const long = Math.max(width, depth);
    const thin = Math.min(width, depth);
    if (long < 1.4 || thin < 0.16) continue;
    blocks.push({
      kind: 'box',
      minX: obstacle.minX,
      maxX: obstacle.maxX,
      minZ: obstacle.minZ,
      maxZ: obstacle.maxZ,
    });
  }
  return blocks;
}
