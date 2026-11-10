import * as THREE from 'three';

/**
 * Signal Orbs: the physical form of a defeated host's Signal Points. A kill
 * bursts a few emerald orbs out of the body; they bounce once, hover and
 * pulse until a Ryder comes within magnet range, then swoop in and pay out.
 *
 * Every orb carries its exact SP value. Visual simplification (merging when
 * the field is crowded) moves value between orbs and never drops any, and an
 * orb is paid exactly once: it leaves the field the frame it is collected.
 *
 * Ownership: an orb belongs to the seat that earned the kill. Only the owner
 * can pull it for `OWNER_HOLD` seconds; after that any Ryder can. An orb left
 * alone for `ABANDON_AFTER` seconds homes in on its owner from anywhere on the
 * map, so walking away from a drop never forfeits the reward.
 */

export const ORB_MAGNET_RADIUS = 4;
export const ORB_COLLECT_RADIUS = 0.6;
/** Orbs drawn at once. Past this, new drops merge into nearby orbs. */
export const ORB_VISIBLE_CAP = 220;
const OWNER_HOLD = 8;
const ABANDON_AFTER = 30;
const HOMING_TIMEOUT = 2.6;
const GRAVITY = 15;
const HOVER = 0.55;
const MERGE_RADIUS = 2.2;

/** A body that can pull orbs: the local Ryder, or a squad teammate. */
export interface OrbCollector {
  seat: number;
  x: number;
  /** Pickup point height, about chest level. */
  y: number;
  z: number;
  /** Magnet radius in metres. */
  radius: number;
}

/** What one seat collected this frame, batched so many orbs make one payout and one sound. */
export interface OrbPickup {
  seat: number;
  amount: number;
  orbs: number;
  /** Orb ids paid in this batch. The bank keys on them so nothing pays twice. */
  ids: number[];
  x: number;
  y: number;
  z: number;
}

export interface OrbWorld {
  /** Ground (or water surface) height the orbs hover over. */
  floor(x: number, z: number): number;
  /** True where an orb may not rest: walls, cars, out of bounds. */
  blocked(x: number, z: number, radius: number): boolean;
  /** Tiny trail spark. Called sparingly. */
  spark?(pos: THREE.Vector3, color: number): void;
}

type OrbState = 'burst' | 'hover' | 'homing';

interface Orb {
  id: number;
  seat: number;
  value: number;
  state: OrbState;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  /** Rest height above the floor while hovering. */
  rest: number;
  bounced: boolean;
  age: number;
  idle: number;
  phase: number;
  spin: number;
  target: number;
  homingT: number;
  /** Side the swoop curves to, so a cluster fans out instead of lining up. */
  curve: THREE.Vector3;
  scale: number;
  trailT: number;
}

const CORE_COLOR = 0x3dff8a;
const GLOW_COLOR = 0x7dffb0;

function glowTexture() {
  const size = 64;
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (!canvas) return null;
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) return null;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(220,255,230,1)');
  grad.addColorStop(0.25, 'rgba(120,255,170,0.75)');
  grad.addColorStop(0.6, 'rgba(40,220,110,0.22)');
  grad.addColorStop(1, 'rgba(0,160,70,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Split a reward into orbs whose values add up exactly. 10 SP is two 5s, sometimes 4 + 3 + 3. */
export function splitReward(total: number, rng: () => number = Math.random): number[] {
  const amount = Math.max(0, Math.round(total));
  if (amount <= 0) return [];
  let count: number;
  if (amount <= 10) count = rng() < 0.7 ? 2 : 3;
  else if (amount <= 40) count = 4;
  else if (amount <= 100) count = 6;
  else count = 9;
  count = Math.min(count, amount);
  const base = Math.floor(amount / count);
  const out = new Array<number>(count).fill(base);
  for (let i = 0; i < amount - base * count; i += 1) out[i] += 1;
  return out;
}

export class SignalOrbs {
  readonly group = new THREE.Group();
  private orbs: Orb[] = [];
  private seq = 0;
  private readonly cores: THREE.InstancedMesh;
  private readonly glows: THREE.InstancedMesh;
  private readonly glowTex: THREE.Texture | null;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly spinQ = new THREE.Quaternion();
  private readonly axis = new THREE.Vector3(0.3, 1, 0.2).normalize();
  private readonly color = new THREE.Color();
  private flashes: { pos: THREE.Vector3; t: number }[] = [];
  private readonly flash: THREE.InstancedMesh;

  constructor(private readonly world: OrbWorld) {
    this.group.name = 'SignalOrbs';
    const coreGeo = new THREE.IcosahedronGeometry(0.12, 1);
    const coreMat = new THREE.MeshBasicMaterial({ color: CORE_COLOR, transparent: true, opacity: 0.92, toneMapped: false });
    this.cores = new THREE.InstancedMesh(coreGeo, coreMat, ORB_VISIBLE_CAP);
    this.glowTex = glowTexture();
    const glowMat = new THREE.MeshBasicMaterial({
      color: GLOW_COLOR,
      map: this.glowTex,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const plane = new THREE.PlaneGeometry(1, 1);
    this.glows = new THREE.InstancedMesh(plane, glowMat, ORB_VISIBLE_CAP);
    this.flash = new THREE.InstancedMesh(plane, glowMat.clone(), 32);
    (this.flash.material as THREE.MeshBasicMaterial).color.setHex(0xc8ffd8);
    for (const mesh of [this.cores, this.glows, this.flash]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(mesh);
    }
    this.glows.renderOrder = 5;
    this.flash.renderOrder = 6;
  }

  get count() {
    return this.orbs.length;
  }

  /** SP still lying on the field, per seat. */
  outstanding(seat?: number) {
    let total = 0;
    for (const orb of this.orbs) if (seat === undefined || orb.seat === seat) total += orb.value;
    return total;
  }

  /** Burst a kill's reward out of the body at (x, y, z). Values add up to `total` exactly. */
  drop(total: number, seat: number, x: number, y: number, z: number) {
    const values = splitReward(total);
    if (!values.length) return;
    const origin = this.safeOrigin(x, z);
    const base = Math.random() * Math.PI * 2;
    values.forEach((value, i) => {
      if (this.orbs.length >= ORB_VISIBLE_CAP && this.mergeInto(value, seat, origin.x, origin.z)) return;
      const ang = base + (i / values.length) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
      const speed = 1.4 + Math.random() * 1.3;
      this.seq += 1;
      this.orbs.push({
        id: this.seq,
        seat,
        value,
        state: 'burst',
        pos: new THREE.Vector3(origin.x, Math.max(y, this.world.floor(origin.x, origin.z) + 0.6), origin.z),
        vel: new THREE.Vector3(Math.cos(ang) * speed, 4.2 + Math.random() * 1.8, Math.sin(ang) * speed),
        rest: HOVER + Math.random() * 0.12,
        bounced: false,
        age: 0,
        idle: 0,
        phase: Math.random() * Math.PI * 2,
        spin: Math.random() * Math.PI * 2,
        target: -1,
        homingT: 0,
        curve: new THREE.Vector3(),
        scale: 1,
        trailT: Math.random() * 0.1,
      });
    });
  }

  /**
   * Move every orb, pull the ones in range, and return what was collected
   * this frame. `collectors[0]` should be the local Ryder.
   */
  update(dt: number, time: number, collectors: readonly OrbCollector[], camera: THREE.Camera): OrbPickup[] {
    const paid: OrbPickup[] = [];
    const keep: Orb[] = [];
    for (const orb of this.orbs) {
      orb.age += dt;
      orb.spin += dt * 2.2;
      if (orb.state === 'burst') this.stepBurst(orb, dt);
      else if (orb.state === 'hover') this.stepHover(orb, dt, time);
      if (orb.state !== 'homing') {
        const pull = this.pickCollector(orb, collectors);
        if (pull >= 0) this.startHoming(orb, pull, collectors);
      }
      if (orb.state === 'homing') {
        const collector = collectors.find((c) => c.seat === orb.target);
        if (!collector) {
          orb.state = 'hover';
          orb.target = -1;
          orb.vel.set(0, 0, 0);
        } else if (this.stepHoming(orb, dt, collector)) {
          this.pay(paid, orb, collector.seat);
          this.flashAt(orb.pos);
          continue;
        }
      }
      keep.push(orb);
    }
    this.orbs = keep;
    this.draw(dt, time, camera);
    return paid;
  }

  /** Pay everything still on the field to its owner (round clear, match end). */
  flush(): OrbPickup[] {
    const paid: OrbPickup[] = [];
    for (const orb of this.orbs) this.pay(paid, orb, orb.seat);
    this.orbs = [];
    this.cores.count = 0;
    this.glows.count = 0;
    return paid;
  }

  /** Drop everything without paying. Only for tearing the scene down after a flush. */
  clear() {
    this.orbs = [];
    this.flashes = [];
    this.cores.count = 0;
    this.glows.count = 0;
    this.flash.count = 0;
  }

  dispose() {
    this.clear();
    this.cores.geometry.dispose();
    (this.cores.material as THREE.Material).dispose();
    this.glows.geometry.dispose();
    (this.glows.material as THREE.Material).dispose();
    (this.flash.material as THREE.Material).dispose();
    this.glowTex?.dispose();
    this.group.removeFromParent();
  }

  // ---------------------------------------------------------------------------

  /** A body wedged against a wall still drops on open ground. */
  private safeOrigin(x: number, z: number) {
    if (!this.world.blocked(x, z, 0.2)) return { x, z };
    for (const ring of [0.6, 1.2, 2, 3]) {
      for (let i = 0; i < 12; i += 1) {
        const ang = (i / 12) * Math.PI * 2;
        const px = x + Math.cos(ang) * ring;
        const pz = z + Math.sin(ang) * ring;
        if (!this.world.blocked(px, pz, 0.2)) return { x: px, z: pz };
      }
    }
    return { x, z };
  }

  private mergeInto(value: number, seat: number, x: number, z: number) {
    let best: Orb | null = null;
    let bestD = MERGE_RADIUS * MERGE_RADIUS;
    for (const orb of this.orbs) {
      if (orb.seat !== seat || orb.state === 'homing') continue;
      const d = (orb.pos.x - x) ** 2 + (orb.pos.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = orb;
      }
    }
    best ??= this.orbs.find((orb) => orb.seat === seat && orb.state !== 'homing') ?? null;
    if (!best) return false;
    best.value += value;
    best.scale = Math.min(1.8, 1 + Math.log2(1 + best.value / 10) * 0.25);
    return true;
  }

  private stepBurst(orb: Orb, dt: number) {
    orb.vel.y -= GRAVITY * dt;
    const nx = orb.pos.x + orb.vel.x * dt;
    const nz = orb.pos.z + orb.vel.z * dt;
    if (this.world.blocked(nx, nz, 0.15)) {
      // Never scatter into a wall: kill the sideways motion and drop where it is.
      orb.vel.x *= -0.2;
      orb.vel.z *= -0.2;
    } else {
      orb.pos.x = nx;
      orb.pos.z = nz;
    }
    orb.pos.y += orb.vel.y * dt;
    const floor = this.world.floor(orb.pos.x, orb.pos.z) + 0.14;
    if (orb.pos.y <= floor && orb.vel.y < 0) {
      orb.pos.y = floor;
      if (!orb.bounced) {
        orb.bounced = true;
        orb.vel.y = -orb.vel.y * 0.42;
        orb.vel.x *= 0.45;
        orb.vel.z *= 0.45;
      } else {
        orb.state = 'hover';
        orb.vel.set(0, 2.2, 0);
      }
    }
  }

  private stepHover(orb: Orb, dt: number, time: number) {
    orb.idle += dt;
    const base = this.world.floor(orb.pos.x, orb.pos.z) + orb.rest;
    const goal = base + Math.sin(time * 2.4 + orb.phase) * 0.07;
    // Ease up from the bounce into the hover rather than snapping.
    orb.pos.y += (goal - orb.pos.y) * (1 - Math.exp(-dt * 6));
  }

  private pickCollector(orb: Orb, collectors: readonly OrbCollector[]) {
    const ownerOnly = orb.age < OWNER_HOLD;
    const abandoned = orb.idle > ABANDON_AFTER;
    let best = -1;
    let bestD = Infinity;
    for (const c of collectors) {
      if (ownerOnly && c.seat !== orb.seat) continue;
      const d = Math.hypot(c.x - orb.pos.x, c.y - orb.pos.y, c.z - orb.pos.z);
      const reach = abandoned && c.seat === orb.seat ? Infinity : c.radius;
      if (d < reach && d < bestD) {
        bestD = d;
        best = c.seat;
      }
    }
    return best;
  }

  private startHoming(orb: Orb, seat: number, collectors: readonly OrbCollector[]) {
    const c = collectors.find((entry) => entry.seat === seat)!;
    orb.state = 'homing';
    orb.target = seat;
    orb.homingT = 0;
    const to = this.tmp.set(c.x - orb.pos.x, c.y - orb.pos.y, c.z - orb.pos.z).normalize();
    // Swoop: kick out sideways and up first, then fold into the pull.
    const side = this.tmp2.set(-to.z, 0, to.x).multiplyScalar(Math.random() < 0.5 ? -1 : 1);
    orb.curve.copy(side).multiplyScalar(3.2 + Math.random() * 1.6);
    orb.curve.y = 2.4 + Math.random() * 1.2;
    orb.vel.copy(orb.curve).addScaledVector(to, -1.2);
  }

  /** True when the orb reached the collector this step. */
  private stepHoming(orb: Orb, dt: number, c: OrbCollector) {
    orb.homingT += dt;
    const dx = c.x - orb.pos.x;
    const dy = c.y - orb.pos.y;
    const dz = c.z - orb.pos.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < ORB_COLLECT_RADIUS || orb.homingT > HOMING_TIMEOUT) return true;
    // Speed ramps with time so a sprinting or jumping Ryder is always caught.
    const speed = Math.min(34, 6 + orb.homingT * 34);
    const want = this.tmp.set(dx / dist, dy / dist, dz / dist).multiplyScalar(speed);
    const grip = 1 - Math.exp(-dt * (3 + orb.homingT * 14));
    orb.vel.lerp(want, grip);
    const step = orb.vel.length() * dt;
    if (step >= dist) return true;
    orb.pos.addScaledVector(orb.vel, dt);
    orb.trailT -= dt;
    if (orb.trailT <= 0 && this.world.spark) {
      orb.trailT = 0.05;
      this.world.spark(orb.pos, CORE_COLOR);
    }
    return false;
  }

  private pay(paid: OrbPickup[], orb: Orb, seat: number) {
    let batch = paid.find((entry) => entry.seat === seat);
    if (!batch) {
      batch = { seat, amount: 0, orbs: 0, ids: [], x: orb.pos.x, y: orb.pos.y, z: orb.pos.z };
      paid.push(batch);
    }
    batch.amount += orb.value;
    batch.orbs += 1;
    batch.ids.push(orb.id);
  }

  private flashAt(pos: THREE.Vector3) {
    if (this.flashes.length >= 32) this.flashes.shift();
    this.flashes.push({ pos: pos.clone(), t: 0 });
  }

  private draw(dt: number, time: number, camera: THREE.Camera) {
    camera.getWorldQuaternion(this.q);
    let n = 0;
    for (const orb of this.orbs) {
      if (n >= ORB_VISIBLE_CAP) break;
      const pulse = 1 + Math.sin(time * 6 + orb.phase) * 0.12;
      const grow = Math.min(1, orb.age * 6);
      const size = orb.scale * pulse * grow;
      this.spinQ.setFromAxisAngle(this.axis, orb.spin);
      this.m.compose(orb.pos, this.spinQ, this.s.setScalar(size));
      this.cores.setMatrixAt(n, this.m);
      const halo = (orb.state === 'homing' ? 0.85 : 0.7) * size;
      this.m.compose(orb.pos, this.q, this.s.setScalar(halo));
      this.glows.setMatrixAt(n, this.m);
      n += 1;
    }
    this.cores.count = n;
    this.glows.count = n;
    this.cores.instanceMatrix.needsUpdate = true;
    this.glows.instanceMatrix.needsUpdate = true;

    let f = 0;
    this.flashes = this.flashes.filter((entry) => (entry.t += dt) < 0.22);
    for (const entry of this.flashes) {
      const k = entry.t / 0.22;
      this.m.compose(entry.pos, this.q, this.s.setScalar(0.5 + k * 1.3));
      this.flash.setMatrixAt(f, this.m);
      this.color.setScalar(1 - k);
      this.flash.setColorAt(f, this.color);
      f += 1;
    }
    this.flash.count = f;
    this.flash.instanceMatrix.needsUpdate = true;
    if (this.flash.instanceColor) this.flash.instanceColor.needsUpdate = true;
  }
}
