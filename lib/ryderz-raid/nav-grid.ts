import type { Obstacle } from './world';

/**
 * A clearance grid over a walled arena: for each cell, how far it is to the
 * nearest wall. Two things come out of it.
 *
 * - `sealCrevices`: boxes over every pocket a body can squeeze into but not
 *   move around in (gaps between buildings and the map edge, slots between a
 *   wall and a prop). Added to the arena's obstacles, nothing gets wedged there.
 * - `NavGrid.routeTo`: the next waypoint on the shortest walkable path to a
 *   goal, for a fighter whose straight line is blocked. Distance fields are
 *   cached per goal cell and body size, so a crowd chasing one player shares one.
 */

const CAP = 3;

function bucketize(obstacles: readonly Obstacle[], limit: number, size: number, reach: number) {
  const span = Math.ceil((limit * 2) / size);
  const buckets: Obstacle[][] = Array.from({ length: span * span }, () => []);
  const index = (v: number) => Math.max(0, Math.min(span - 1, Math.floor((v + limit) / size)));
  for (const o of obstacles) {
    const minX = (o.kind === 'box' ? o.minX : o.x - o.r) - reach;
    const maxX = (o.kind === 'box' ? o.maxX : o.x + o.r) + reach;
    const minZ = (o.kind === 'box' ? o.minZ : o.z - o.r) - reach;
    const maxZ = (o.kind === 'box' ? o.maxZ : o.z + o.r) + reach;
    if (maxX < -limit || minX > limit || maxZ < -limit || minZ > limit) continue;
    for (let j = index(minZ); j <= index(maxZ); j += 1) {
      for (let i = index(minX); i <= index(maxX); i += 1) buckets[j * span + i].push(o);
    }
  }
  return { buckets, span, index };
}

function distanceTo(o: Obstacle, x: number, z: number) {
  if (o.kind === 'box') {
    const dx = Math.max(o.minX - x, 0, x - o.maxX);
    const dz = Math.max(o.minZ - z, 0, z - o.maxZ);
    return Math.hypot(dx, dz);
  }
  return Math.max(0, Math.hypot(x - o.x, z - o.z) - o.r);
}

/** Distance to the nearest wall or the arena edge at each cell centre, capped at `CAP` metres. */
export function clearanceField(obstacles: readonly Obstacle[], limit: number, cell: number) {
  const n = Math.ceil((limit * 2) / cell);
  const field = new Float32Array(n * n);
  const { buckets, span, index } = bucketize(obstacles, limit, 4, CAP);
  for (let j = 0; j < n; j += 1) {
    const z = -limit + (j + 0.5) * cell;
    const bj = index(z);
    for (let i = 0; i < n; i += 1) {
      const x = -limit + (i + 0.5) * cell;
      let d = Math.min(CAP, limit - Math.abs(x), limit - Math.abs(z));
      for (const o of buckets[bj * span + index(x)]) {
        const dd = distanceTo(o, x, z);
        if (dd < d) d = dd;
        if (d <= 0) break;
      }
      field[j * n + i] = d;
    }
  }
  return { field, n };
}

/** Sliding max over a square window, rows then columns. */
function dilateMax(src: Float32Array, n: number, r: number) {
  const tmp = new Float32Array(n * n);
  const out = new Float32Array(n * n);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      let m = 0;
      for (let k = Math.max(0, i - r); k <= Math.min(n - 1, i + r); k += 1) m = Math.max(m, src[j * n + k]);
      tmp[j * n + i] = m;
    }
  }
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      let m = 0;
      for (let k = Math.max(0, j - r); k <= Math.min(n - 1, j + r); k += 1) m = Math.max(m, tmp[k * n + i]);
      out[j * n + i] = m;
    }
  }
  return out;
}

export interface SealOptions {
  /** Smallest body radius worth keeping out. */
  small?: number;
  /** A space a disc of this radius can reach is open street, not a crevice. */
  open?: number;
  cell?: number;
  /** Pockets smaller than this (m²) are left alone. */
  minArea?: number;
  /** Slots whose widest point has less clearance than this are sealed even when they run through. */
  tight?: number;
}

/**
 * True when the pocket opens onto open street through two separate mouths
 * (a lane between two streets), false for a dead end with one mouth.
 */
function throughLane(cells: number[], n: number, narrow: Uint8Array, field: Float32Array, small: number) {
  const mouths = new Set<number>();
  for (const c of cells) {
    const i = c % n;
    for (const m of [i > 0 ? c - 1 : -1, i < n - 1 ? c + 1 : -1, c - n, c + n]) {
      if (m < 0 || m >= n * n || narrow[m] || field[m] <= small) continue;
      mouths.add(m);
    }
  }
  // Group open cells along the pocket's edge; separate groups are separate mouths.
  const seen = new Set<number>();
  let groups = 0;
  for (const start of mouths) {
    if (seen.has(start)) continue;
    groups += 1;
    if (groups > 1) return true;
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const c = stack.pop()!;
      const i = c % n;
      for (let dj = -1; dj <= 1; dj += 1) {
        for (let di = -1; di <= 1; di += 1) {
          if ((!di && !dj) || i + di < 0 || i + di >= n) continue;
          const m = c + dj * n + di;
          if (mouths.has(m) && !seen.has(m)) {
            seen.add(m);
            stack.push(m);
          }
        }
      }
    }
  }
  return false;
}

/**
 * Boxes that fill every narrow pocket: space a small body can stand in that a
 * disc of radius `open` can never reach. Each pocket is covered by merged
 * row runs, so a long strip is one box.
 */
export function sealCrevices(obstacles: readonly Obstacle[], limit: number, options: SealOptions = {}): Obstacle[] {
  const small = options.small ?? 0.3;
  const open = options.open ?? 1.4;
  const cell = options.cell ?? 0.25;
  const minArea = options.minArea ?? 0.3;
  const tight = options.tight ?? 1.0;
  const { field, n } = clearanceField(obstacles, limit, cell);
  const roomy = new Float32Array(n * n);
  for (let k = 0; k < n * n; k += 1) roomy[k] = field[k] > open ? 1 : 0;
  const reached = dilateMax(roomy, n, Math.ceil(open / cell));
  const narrow = new Uint8Array(n * n);
  for (let k = 0; k < n * n; k += 1) narrow[k] = field[k] > small && reached[k] < 0.5 ? 1 : 0;

  const seen = new Uint8Array(n * n);
  const boxes: Obstacle[] = [];
  const stack: number[] = [];
  for (let start = 0; start < n * n; start += 1) {
    if (!narrow[start] || seen[start]) continue;
    const cells: number[] = [];
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const c = stack.pop()!;
      cells.push(c);
      const i = c % n;
      const j = (c - i) / n;
      if (i > 0 && narrow[c - 1] && !seen[c - 1]) (seen[c - 1] = 1), stack.push(c - 1);
      if (i < n - 1 && narrow[c + 1] && !seen[c + 1]) (seen[c + 1] = 1), stack.push(c + 1);
      if (j > 0 && narrow[c - n] && !seen[c - n]) (seen[c - n] = 1), stack.push(c - n);
      if (j < n - 1 && narrow[c + n] && !seen[c + n]) (seen[c + n] = 1), stack.push(c + n);
    }
    if (cells.length * cell * cell < minArea) continue;
    // A slot narrower than `tight` is always a trap. A wider one is only
    // sealed when it is a dead end; one that joins two streets is a lane.
    let widest = 0;
    for (const c of cells) widest = Math.max(widest, field[c]);
    if (widest > tight && throughLane(cells, n, narrow, field, small)) continue;
    // Row runs, merged downward while the next row has the same run.
    const rows = new Map<number, Array<[number, number]>>();
    cells.sort((a, b) => a - b);
    for (const c of cells) {
      const i = c % n;
      const j = (c - i) / n;
      const list = rows.get(j) ?? [];
      const last = list[list.length - 1];
      if (last && last[1] === i - 1) last[1] = i;
      else list.push([i, i]);
      rows.set(j, list);
    }
    const open2 = new Map<string, { i0: number; i1: number; j0: number; j1: number }>();
    const rowKeys = [...rows.keys()].sort((a, b) => a - b);
    const flush = (rect: { i0: number; i1: number; j0: number; j1: number }) => {
      boxes.push({
        kind: 'box',
        minX: -limit + rect.i0 * cell,
        maxX: -limit + (rect.i1 + 1) * cell,
        minZ: -limit + rect.j0 * cell,
        maxZ: -limit + (rect.j1 + 1) * cell,
      });
    };
    for (const j of rowKeys) {
      const next = new Map<string, { i0: number; i1: number; j0: number; j1: number }>();
      for (const [i0, i1] of rows.get(j)!) {
        const key = `${i0}:${i1}`;
        const rect = open2.get(key);
        if (rect && rect.j1 === j - 1) {
          rect.j1 = j;
          next.set(key, rect);
          open2.delete(key);
        } else next.set(key, { i0, i1, j0: j, j1: j });
      }
      open2.forEach(flush);
      open2.clear();
      next.forEach((rect, key) => open2.set(key, rect));
    }
    open2.forEach(flush);
  }
  return boxes;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

interface Field {
  goal: number;
  clearance: number;
  cost: Float32Array;
  made: number;
}

const SIZE_CLASSES = [0.5, 0.95, 1.4];
const FIELD_TTL = 450;
const STRAIGHT = 1;
const DIAGONAL = Math.SQRT2;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class NavGrid {
  readonly n: number;
  readonly cell: number;
  readonly limit: number;
  readonly clearance: Float32Array;
  private fields: Field[] = [];
  private heap = new Int32Array(0);
  private heapCost = new Float32Array(0);

  constructor(obstacles: readonly Obstacle[], limit: number, cell = 0.5) {
    this.limit = limit;
    this.cell = cell;
    const { field, n } = clearanceField(obstacles, limit, cell);
    this.n = n;
    this.clearance = field;
  }

  index(x: number, z: number) {
    const i = Math.max(0, Math.min(this.n - 1, Math.floor((x + this.limit) / this.cell)));
    const j = Math.max(0, Math.min(this.n - 1, Math.floor((z + this.limit) / this.cell)));
    return j * this.n + i;
  }

  clearanceAt(x: number, z: number) {
    return this.clearance[this.index(x, z)];
  }

  private centre(k: number) {
    const i = k % this.n;
    const j = (k - i) / this.n;
    return { x: -this.limit + (i + 0.5) * this.cell, z: -this.limit + (j + 0.5) * this.cell };
  }

  /** True when a body of `radius` can walk the straight segment. */
  lineClear(ax: number, az: number, bx: number, bz: number, radius: number) {
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(len / (this.cell * 0.5)));
    for (let s = 1; s <= steps; s += 1) {
      const t = s / steps;
      if (this.clearanceAt(ax + (bx - ax) * t, az + (bz - az) * t) < radius) return false;
    }
    return true;
  }

  private sizeClass(radius: number) {
    return SIZE_CLASSES.find((c) => radius <= c) ?? SIZE_CLASSES[SIZE_CLASSES.length - 1];
  }

  /** Nearest cell a body of this size can stand in, searching outward a few metres. */
  private standable(k: number, need: number) {
    if (this.clearance[k] >= need) return k;
    const i0 = k % this.n;
    const j0 = (k - i0) / this.n;
    for (let r = 1; r <= 8; r += 1) {
      let best = -1;
      let bestC = need;
      for (let dj = -r; dj <= r; dj += 1) {
        for (let di = -r; di <= r; di += 1) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = i0 + di;
          const j = j0 + dj;
          if (i < 0 || j < 0 || i >= this.n || j >= this.n) continue;
          const c = this.clearance[j * this.n + i];
          if (c >= bestC) {
            bestC = c;
            best = j * this.n + i;
          }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  private field(goal: number, need: number): Field | null {
    const t = now();
    const hit = this.fields.find((f) => f.goal === goal && f.clearance === need && t - f.made < FIELD_TTL);
    if (hit) return hit;
    const cost = this.flood(goal, need);
    const made = { goal, clearance: need, cost, made: t };
    this.fields.push(made);
    if (this.fields.length > 8) this.fields.shift();
    return made;
  }

  /** Dijkstra from the goal over every cell a body of `need` clearance fits. */
  private flood(goal: number, need: number) {
    const n = this.n;
    const total = n * n;
    const cost = new Float32Array(total).fill(Infinity);
    if (this.heap.length < total * 2) {
      this.heap = new Int32Array(total * 2);
      this.heapCost = new Float32Array(total * 2);
    }
    const heap = this.heap;
    const hc = this.heapCost;
    let size = 0;
    const push = (k: number, c: number) => {
      let i = size++;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (hc[p] <= c) break;
        heap[i] = heap[p];
        hc[i] = hc[p];
        i = p;
      }
      heap[i] = k;
      hc[i] = c;
    };
    const pop = () => {
      const top = heap[0];
      const lastK = heap[--size];
      const lastC = hc[size];
      let i = 0;
      for (;;) {
        let child = i * 2 + 1;
        if (child >= size) break;
        if (child + 1 < size && hc[child + 1] < hc[child]) child += 1;
        if (hc[child] >= lastC) break;
        heap[i] = heap[child];
        hc[i] = hc[child];
        i = child;
      }
      heap[i] = lastK;
      hc[i] = lastC;
      return top;
    };
    cost[goal] = 0;
    push(goal, 0);
    const clearance = this.clearance;
    while (size > 0) {
      const top = hc[0];
      const k = pop();
      if (top > cost[k]) continue;
      const i = k % n;
      const j = (k - i) / n;
      for (let dj = -1; dj <= 1; dj += 1) {
        const jj = j + dj;
        if (jj < 0 || jj >= n) continue;
        for (let di = -1; di <= 1; di += 1) {
          if (!di && !dj) continue;
          const ii = i + di;
          if (ii < 0 || ii >= n) continue;
          const m = jj * n + ii;
          if (clearance[m] < need) continue;
          // No corner cutting between two blocked cells.
          if (di && dj && (clearance[j * n + ii] < need || clearance[jj * n + i] < need)) continue;
          // Hug walls less: tight cells cost a little more than open street.
          const tight = clearance[m] < need + 0.6 ? 0.35 : 0;
          const c = top + (di && dj ? DIAGONAL : STRAIGHT) + tight;
          if (c < cost[m]) {
            cost[m] = c;
            push(m, c);
          }
        }
      }
    }
    return cost;
  }

  /**
   * Where a body at (fromX, fromZ) should head to reach (toX, toZ): the
   * farthest point down the shortest path it can see in a straight line.
   * Null when the straight line is already clear or there is no way through.
   */
  routeTo(fromX: number, fromZ: number, toX: number, toZ: number, radius = 0.5): { x: number; z: number } | null {
    const need = this.sizeClass(radius);
    if (this.lineClear(fromX, fromZ, toX, toZ, need * 0.85)) return null;
    // Goals snap to a 2 m block so a crowd ringing one player shares one field.
    const goal = this.standable(this.index(Math.floor(toX / 2) * 2 + 1, Math.floor(toZ / 2) * 2 + 1), need);
    const start = this.standable(this.index(fromX, fromZ), need);
    if (goal < 0 || start < 0) return null;
    const field = this.field(goal, need);
    if (!field || !Number.isFinite(field.cost[start])) return null;
    const n = this.n;
    let k = start;
    let best = start;
    let first = start;
    for (let step = 0; step < 40; step += 1) {
      const i = k % n;
      const j = (k - i) / n;
      let next = k;
      let low = field.cost[k];
      for (let dj = -1; dj <= 1; dj += 1) {
        for (let di = -1; di <= 1; di += 1) {
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
          const m = jj * n + ii;
          if (field.cost[m] < low) {
            low = field.cost[m];
            next = m;
          }
        }
      }
      if (next === k) break;
      k = next;
      if (first === start) first = k;
      const c = this.centre(k);
      if (this.lineClear(fromX, fromZ, c.x, c.z, need * 0.85)) best = k;
      else if (step > 4) break;
      if (k === goal) break;
    }
    // Nothing visible down the path yet: step to the first cell of it.
    return this.centre(best === start ? first : best);
  }

  /** Remaining path length in metres, or Infinity when there is no way. */
  pathLength(fromX: number, fromZ: number, toX: number, toZ: number, radius = 0.5) {
    const need = this.sizeClass(radius);
    const goal = this.standable(this.index(toX, toZ), need);
    const start = this.standable(this.index(fromX, fromZ), need);
    if (goal < 0 || start < 0) return Infinity;
    const field = this.field(goal, need);
    return field ? field.cost[start] * this.cell : Infinity;
  }
}
