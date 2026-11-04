/**
 * Uniform hash grid for crowd queries. Rebuilt every frame from host
 * positions, so host-host separation and neighbour counts are near-linear
 * instead of the all-pairs loop that fell over past thirty bodies.
 */
export interface GridBody {
  pos: { x: number; z: number };
  radius: number;
  mass: number;
  hp: number;
  held: number;
}

export class CrowdGrid<T extends GridBody> {
  private cells = new Map<number, T[]>();
  private readonly cell: number;

  constructor(cellSize = 2.4) {
    this.cell = cellSize;
  }

  private key(cx: number, cz: number) {
    // Offset into positive space so negative coordinates hash cleanly.
    return (cx + 32768) * 65536 + (cz + 32768);
  }

  rebuild(bodies: readonly T[]) {
    this.cells.clear();
    for (const body of bodies) {
      if (body.hp <= 0) continue;
      const cx = Math.floor(body.pos.x / this.cell);
      const cz = Math.floor(body.pos.z / this.cell);
      const k = this.key(cx, cz);
      const bucket = this.cells.get(k);
      if (bucket) bucket.push(body);
      else this.cells.set(k, [body]);
    }
  }

  /** Bodies in the 3×3 block of cells around a point. */
  near(x: number, z: number, out: T[] = []): T[] {
    out.length = 0;
    const cx = Math.floor(x / this.cell);
    const cz = Math.floor(z / this.cell);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        const bucket = this.cells.get(this.key(cx + dx, cz + dz));
        if (bucket) for (const body of bucket) out.push(body);
      }
    }
    return out;
  }

  /** Living bodies within `radius` of a point. */
  count(x: number, z: number, radius: number) {
    let n = 0;
    const reach = Math.ceil(radius / this.cell);
    const cx = Math.floor(x / this.cell);
    const cz = Math.floor(z / this.cell);
    for (let dx = -reach; dx <= reach; dx += 1) {
      for (let dz = -reach; dz <= reach; dz += 1) {
        const bucket = this.cells.get(this.key(cx + dx, cz + dz));
        if (!bucket) continue;
        for (const body of bucket) {
          const ox = body.pos.x - x;
          const oz = body.pos.z - z;
          if (ox * ox + oz * oz <= radius * radius) n += 1;
        }
      }
    }
    return n;
  }

  /**
   * Push overlapping bodies apart, mass-weighted. Each pair is resolved once.
   * Held bodies are placed by their grabber and do not move.
   */
  separate(bodies: readonly T[]) {
    const scratch: T[] = [];
    for (const a of bodies) {
      if (a.hp <= 0) continue;
      this.near(a.pos.x, a.pos.z, scratch);
      for (const b of scratch) {
        if (b === a) continue;
        // Resolve each unordered pair once by only acting when a sorts before b.
        if (a.pos.x > b.pos.x || (a.pos.x === b.pos.x && a.pos.z >= b.pos.z)) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) / (a.mass + b.mass);
        if (a.held <= 0) {
          a.pos.x -= (dx / d) * push * b.mass;
          a.pos.z -= (dz / d) * push * b.mass;
        }
        if (b.held <= 0) {
          b.pos.x += (dx / d) * push * a.mass;
          b.pos.z += (dz / d) * push * a.mass;
        }
      }
    }
  }
}
