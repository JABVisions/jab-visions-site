import * as THREE from 'three';

/**
 * Shared combat plumbing every Ryder kit builds on: hit queries, physical hit
 * reactions, per-target re-hit guards, delayed hit windows, and the two
 * impact decals (shock rings, cracked ground) that heavy attacks share.
 *
 * Nothing in here knows about a specific Ryder; kits (see `ryderz/`) compose
 * these into their own moves.
 */

/** The slice of an enemy the hit system needs. The engine's `Host` satisfies it. */
export interface Targetable {
  pos: THREE.Vector3;
  radius: number;
}

/** Physical state a target carries so hits can move it. */
export interface ReactiveBody extends Targetable {
  mass: number;
  /** Horizontal shove velocity, decays on its own. */
  knock: THREE.Vector3;
  /** Seconds the body is held airborne / disabled by a lift. */
  stun: number;
  /** Seconds of hit-stagger: no movement, no attacks, hurt pose. */
  stagger: number;
  /** Height above the ground and vertical velocity while launched. */
  airY: number;
  airVel: number;
  /** Visual lean away from the last hit (0 → 1), decays. */
  lean: number;
  /** Visual tumble rate while airborne (rad/s). */
  spin: number;
  /**
   * Seconds the body is in an attacker's grip: no AI, no reactions, the
   * grabber positions it. Always counts down so nothing stays held forever.
   */
  held: number;
  /** Metres the body is pulled below the ground (grabs); eases back to 0 once released. */
  sink: number;
}

/**
 * How a hit moves the target.
 * - stagger: flinch in place, brief interruption
 * - knockback: shoved along the hit direction
 * - launch: popped into the air and shoved
 * - heavy: big shove with a low hop; the "finisher" feel
 * - slam: ground-pound launch, mostly vertical
 */
export type HitReaction = 'stagger' | 'knockback' | 'launch' | 'heavy' | 'slam';

export const GRAVITY = 22;

/** Apply a hit reaction to a body. `dir` is the hit direction (from attacker to target), normalised. */
export function applyReaction(body: ReactiveBody, reaction: HitReaction, dir: THREE.Vector3, strength = 1) {
  const m = Math.max(0.4, body.mass);
  const push = (speed: number) => {
    body.knock.set(dir.x, 0, dir.z).normalize().multiplyScalar((speed * strength) / m);
  };
  switch (reaction) {
    case 'stagger':
      push(5);
      body.stagger = Math.max(body.stagger, 0.3 * Math.min(1.4, strength));
      body.lean = Math.max(body.lean, 0.55);
      break;
    case 'knockback':
      push(12);
      body.stagger = Math.max(body.stagger, 0.45);
      body.lean = Math.max(body.lean, 0.9);
      break;
    case 'launch':
      push(6);
      body.airVel = Math.max(body.airVel, (7 * strength) / Math.sqrt(m));
      body.stagger = Math.max(body.stagger, 0.9);
      body.lean = 1;
      body.spin = (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 3);
      break;
    case 'heavy':
      push(15);
      body.airVel = Math.max(body.airVel, 3.2 / Math.sqrt(m));
      body.stagger = Math.max(body.stagger, 0.75);
      body.lean = 1;
      body.spin = (Math.random() < 0.5 ? -1 : 1) * 3;
      break;
    case 'slam':
      push(7);
      body.airVel = Math.max(body.airVel, (8.5 * strength) / Math.sqrt(m));
      body.stagger = Math.max(body.stagger, 1.1);
      body.lean = 1;
      body.spin = (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 4);
      break;
  }
}

/**
 * Integrate a body's reaction state for one frame. Returns true on the frame
 * it lands from the air so callers can kick dust.
 */
export function stepReaction(body: ReactiveBody, dt: number) {
  let landed = false;
  if (body.held > 0) {
    body.held = Math.max(0, body.held - dt);
    return false;
  }
  if (body.sink > 0) body.sink = Math.max(0, body.sink - dt * 6);
  body.stagger = Math.max(0, body.stagger - dt);
  body.lean = Math.max(0, body.lean - dt * 2.2);
  if (body.airY > 0 || body.airVel > 0) {
    body.airVel -= GRAVITY * dt;
    body.airY += body.airVel * dt;
    if (body.airY <= 0) {
      body.airY = 0;
      body.airVel = 0;
      body.spin = 0;
      landed = true;
    }
  }
  return landed;
}

// ---------------------------------------------------------------------------
// Hit queries
// ---------------------------------------------------------------------------

export function targetsInRadius<T extends Targetable>(list: readonly T[], center: THREE.Vector3, radius: number, out: T[] = []) {
  out.length = 0;
  for (const t of list) {
    const dx = t.pos.x - center.x;
    const dz = t.pos.z - center.z;
    const r = radius + t.radius;
    if (dx * dx + dz * dz <= r * r) out.push(t);
  }
  return out;
}

/** Targets inside a forward cone: `halfArc` radians either side of `yaw` (game yaw: forward = (sin, 0, cos)). */
export function targetsInArc<T extends Targetable>(
  list: readonly T[],
  center: THREE.Vector3,
  yaw: number,
  range: number,
  halfArc: number,
  out: T[] = [],
) {
  out.length = 0;
  for (const t of list) {
    const dx = t.pos.x - center.x;
    const dz = t.pos.z - center.z;
    const dist = Math.hypot(dx, dz);
    if (dist > range + t.radius) continue;
    if (halfArc < Math.PI) {
      let diff = Math.atan2(dx, dz) - yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      // Close targets count even slightly off-angle: the fist is wide.
      if (Math.abs(diff) > halfArc + Math.min(0.5, t.radius / Math.max(dist, 0.3))) continue;
    }
    out.push(t);
  }
  return out;
}

/** Targets whose circle touches the swept segment from → to widened by `width`. */
export function targetsAlongSegment<T extends Targetable>(
  list: readonly T[],
  from: THREE.Vector3,
  to: THREE.Vector3,
  width: number,
  out: T[] = [],
) {
  out.length = 0;
  const sx = to.x - from.x;
  const sz = to.z - from.z;
  const len2 = sx * sx + sz * sz;
  for (const t of list) {
    let u = 0;
    if (len2 > 1e-8) u = Math.max(0, Math.min(1, ((t.pos.x - from.x) * sx + (t.pos.z - from.z) * sz) / len2));
    const px = from.x + sx * u;
    const pz = from.z + sz * u;
    const dx = t.pos.x - px;
    const dz = t.pos.z - pz;
    const r = width + t.radius;
    if (dx * dx + dz * dz <= r * r) out.push(t);
  }
  return out;
}

/** Sort targets by distance to a point (in place). */
export function sortByDistance<T extends Targetable>(list: T[], from: THREE.Vector3) {
  return list.sort((a, b) => a.pos.distanceToSquared(from) - b.pos.distanceToSquared(from));
}

/** Per-target re-hit guard so a sweeping attack lands once per target (or once per cooldown). */
export class HitSet<T extends object> {
  private last = new Map<T, number>();

  /** True (and records the hit) if `target` may be hit at `time`. */
  take(target: T, time: number, cooldown = Infinity) {
    const prev = this.last.get(target);
    if (prev !== undefined && time - prev < cooldown) return false;
    this.last.set(target, time);
    return true;
  }

  has(target: T) {
    return this.last.has(target);
  }

  clear() {
    this.last.clear();
  }

  get size() {
    return this.last.size;
  }
}

/**
 * Delayed hit windows: damage lands when the fist does, not on key press.
 * Entries are cleared wholesale when a sequence is interrupted.
 */
export class HitScheduler {
  private queue: Array<{ at: number; fn: () => void }> = [];

  schedule(time: number, delay: number, fn: () => void) {
    this.queue.push({ at: time + delay, fn });
  }

  update(time: number) {
    if (!this.queue.length) return;
    const due = this.queue.filter((e) => e.at <= time);
    if (!due.length) return;
    this.queue = this.queue.filter((e) => e.at > time);
    for (const e of due) e.fn();
  }

  clear() {
    this.queue.length = 0;
  }

  get pending() {
    return this.queue.length;
  }
}

// ---------------------------------------------------------------------------
// Impact decals
// ---------------------------------------------------------------------------

const RING_GEOMETRY = new THREE.RingGeometry(0.82, 1, 48);

interface Ring {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
  radius: number;
  thickness: number;
  active: boolean;
}

/** Pooled expanding ground rings for shockwaves and detonations. */
export class ShockRingPool {
  private rings: Ring[] = [];
  readonly group = new THREE.Group();

  constructor(capacity = 8) {
    this.group.name = 'ShockRings';
    for (let i = 0; i < capacity; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(RING_GEOMETRY, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.renderOrder = 3;
      this.group.add(mesh);
      this.rings.push({ mesh, material, life: 0, maxLife: 1, radius: 1, thickness: 1, active: false });
    }
  }

  spawn(pos: THREE.Vector3, color: THREE.ColorRepresentation, options: { radius?: number; duration?: number; y?: number } = {}) {
    const ring = this.rings.find((r) => !r.active) ?? this.rings.reduce((a, b) => (a.life < b.life ? a : b));
    ring.active = true;
    ring.maxLife = options.duration ?? 0.45;
    ring.life = ring.maxLife;
    ring.radius = options.radius ?? 5;
    ring.mesh.visible = true;
    ring.mesh.position.set(pos.x, options.y ?? pos.y + 0.06, pos.z);
    ring.material.color.set(color);
  }

  update(dt: number) {
    for (const ring of this.rings) {
      if (!ring.active) continue;
      ring.life -= dt;
      if (ring.life <= 0) {
        ring.active = false;
        ring.mesh.visible = false;
        continue;
      }
      const p = 1 - ring.life / ring.maxLife;
      const eased = 1 - (1 - p) * (1 - p);
      const scale = Math.max(0.05, ring.radius * eased);
      ring.mesh.scale.setScalar(scale);
      ring.material.opacity = (1 - p) * 0.9;
    }
  }

  dispose() {
    this.rings.forEach((r) => r.material.dispose());
  }
}

let crackTexture: THREE.CanvasTexture | null = null;

/** Radial cracks drawn once into a canvas; dark lines on transparent. */
function getCrackTexture() {
  if (crackTexture) return crackTexture;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  const c = size / 2;
  // Deterministic jagged cracks so every pound reads the same way.
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  ctx.lineCap = 'round';
  for (let i = 0; i < 9; i += 1) {
    let a = (i / 9) * Math.PI * 2 + rnd() * 0.5;
    let x = c;
    let y = c;
    let r = 0;
    const reach = size * (0.28 + rnd() * 0.2);
    ctx.beginPath();
    ctx.moveTo(x, y);
    while (r < reach) {
      const step = 10 + rnd() * 16;
      a += (rnd() - 0.5) * 0.9;
      x += Math.cos(a) * step;
      y += Math.sin(a) * step;
      r += step;
      ctx.lineTo(x, y);
      if (rnd() < 0.35) {
        // Side split.
        const b = a + (rnd() < 0.5 ? -1 : 1) * (0.7 + rnd() * 0.6);
        const bl = 8 + rnd() * 14;
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(b) * bl, y + Math.sin(b) * bl);
        ctx.moveTo(x, y);
      }
    }
    const fade = 1 - r / (size * 0.5);
    ctx.strokeStyle = `rgba(6, 4, 12, ${0.55 + fade * 0.35})`;
    ctx.lineWidth = 4.5 - i * 0.2;
    ctx.stroke();
  }
  // Crater shading in the middle.
  const grad = ctx.createRadialGradient(c, c, 0, c, c, size * 0.22);
  grad.addColorStop(0, 'rgba(10, 6, 16, 0.75)');
  grad.addColorStop(1, 'rgba(10, 6, 16, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  crackTexture = new THREE.CanvasTexture(canvas);
  crackTexture.colorSpace = THREE.SRGBColorSpace;
  return crackTexture;
}

const DECAL_GEOMETRY = new THREE.PlaneGeometry(1, 1);

interface Decal {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
  active: boolean;
}

/** Pooled cracked-ground decals left behind by ground pounds. */
export class CrackDecalPool {
  private decals: Decal[] = [];
  readonly group = new THREE.Group();

  constructor(capacity = 4) {
    this.group.name = 'CrackDecals';
    for (let i = 0; i < capacity; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        map: getCrackTexture(),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(DECAL_GEOMETRY, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.renderOrder = 1;
      this.group.add(mesh);
      this.decals.push({ mesh, material, life: 0, maxLife: 1, active: false });
    }
  }

  spawn(pos: THREE.Vector3, size = 5, life = 4) {
    const decal = this.decals.find((d) => !d.active) ?? this.decals.reduce((a, b) => (a.life < b.life ? a : b));
    decal.active = true;
    decal.maxLife = life;
    decal.life = life;
    decal.mesh.visible = true;
    decal.mesh.position.set(pos.x, pos.y + 0.02, pos.z);
    decal.mesh.rotation.z = Math.random() * Math.PI * 2;
    decal.mesh.scale.setScalar(size);
    decal.material.opacity = 1;
  }

  update(dt: number) {
    for (const decal of this.decals) {
      if (!decal.active) continue;
      decal.life -= dt;
      if (decal.life <= 0) {
        decal.active = false;
        decal.mesh.visible = false;
        continue;
      }
      const p = decal.life / decal.maxLife;
      decal.material.opacity = Math.min(1, p * 2.2);
    }
  }

  dispose() {
    this.decals.forEach((d) => d.material.dispose());
  }
}
