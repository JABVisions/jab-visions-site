import * as THREE from 'three';
import type { AbilityId } from '../config';
import { HitSet, targetsAlongSegment, targetsInRadius } from '../combat';
import { TrailRibbon } from '../speed-vfx';
import type { PoseOverride } from '../skeletal';
import type { KitContext, KitFrame, KitTarget, MeleeStep, RyderKit } from './kit';

/**
 * Aaron Addams — the Black Ryder. Teleportation, axe control, momentum.
 *
 * Q  Boomerang Cleave  charge the axe, hurl it; it spins out around a wide
 *                      loop launching every host it crosses and curves back
 *                      into his hand.
 * E  Shadow Strike     dissolve into a portal, reappear behind the nearest
 *                      host, one flat cut at neck height. Nobody near: a
 *                      short step through the dark toward the aim.
 * R  Greed Swing       toggle: axe held out flat, Aaron spins while the
 *                      player steers; the spin ramps up over two seconds,
 *                      every host it meets is thrown and feeds aura back;
 *                      ends on one final whipping cleave.
 *
 * Visual language: black, deep violet, silver. Portals pull inward rather
 * than burst outward. Everything is done with the axe.
 */

const DEBRIS = 0x5a5160;
const SILVER = 0xd9d4ff;
const WHITE = new THREE.Color(0xffffff);

/** Heavy three-hit chain: overhead chop, flat slash, two-handed smash. */
const COMBO: MeleeStep[] = [
  { style: 'chop', damageMul: 1.0, hitDelay: 0.17, range: 2.6, halfArc: 0.7, reaction: 'stagger', strength: 1.2, recovery: 0.42, shake: 0.08, hitStop: 0.02, lunge: 0.3, sound: 'aaron.melee.chop' },
  { style: 'slash', damageMul: 0.9, hitDelay: 0.15, range: 2.8, halfArc: 1.5, reaction: 'knockback', strength: 0.9, recovery: 0.4, shake: 0.1, hitStop: 0.02, lunge: 0.2, sound: 'aaron.melee.slash' },
  { style: 'smash', damageMul: 1.7, hitDelay: 0.2, range: 2.9, halfArc: 0.75, reaction: 'heavy', strength: 1.2, recovery: 0.62, shake: 0.3, hitStop: 0.06, lunge: 0.4, sound: 'aaron.melee.smash' },
];
const COMBO_WINDOW = 1.1;

// Boomerang Cleave
const THROW_WIND = 0.36;
/** Share of the throw stance covered by the wind-up; the rest plays out as the axe leaves. */
const THROW_RELEASE_T = 0.62;
const THROW_FOLLOW = 0.2;
const THROW_CATCH = 0.32;
const LOOP_A = 5.0;
const LOOP_B = 4.0;
/** Where on the ellipse the axe leaves the hand: tangent heading forward-left. */
const LOOP_START = Math.PI + 0.5;
const AXE_SPEED = 17;
const AXE_HEIGHT = 1.15;
const AXE_WIDTH = 0.95;
const AXE_SPIN = 26;
const AXE_RETURN_MAX = 1.2;
const THROW_HIT = 24;
const THROW_REHIT = 0.5;

// Shadow Strike
const STRIKE_SEEK = 13;
const STRIKE_STEP = 6.5;
const STRIKE_VANISH = 0.17;
const STRIKE_CUT = 0.3;
const STRIKE_HIT_AT = 0.11;
const STRIKE_GUARD = 0.36;
const STRIKE_DAMAGE = 48;
const STRIKE_REACH = 3.2;
const NECK_HEIGHT = 1.42;

// Greed Swing
const SWING_RAMP = 2.0;
const SWING_RATE_MIN = 7;
const SWING_RATE_MAX = 14;
const SWING_REACH = 2.5;
/** Axe bearing relative to the body facing (held slightly to the right). */
const SWING_AXE_OFFSET = -0.3;
const SWING_HIT = 13;
const SWING_REHIT = 0.3;
const SWING_AURA_PER_HIT = 1.5;
const SWING_MOVE_SCALE = 0.72;
const SWING_FINISH = 0.46;
const SWING_FINISH_AT = 0.18;
const SWING_FINISH_RADIUS = 3.4;
const SWING_FINISH_DAMAGE = 30;

interface Flight {
  centre: THREE.Vector3;
  f: THREE.Vector3;
  r: THREE.Vector3;
  a: number;
  b: number;
  theta: number;
  pos: THREE.Vector3;
  prev: THREE.Vector3;
  dir: THREE.Vector3;
  returning: boolean;
  returnT: number;
  spin: number;
}

type Sequence =
  | { kind: 'throw'; phase: 'wind' | 'flight' | 'catch'; t: number; flight: Flight | null }
  | { kind: 'strike'; phase: 'vanish' | 'cut' | 'guard'; t: number; target: KitTarget | null; to: THREE.Vector3; faceYaw: number; hit: boolean }
  | { kind: 'finish'; t: number; angleFrom: number; angleTo: number; level: number; hit: boolean };

const _dir = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _hits: KitTarget[] = [];

function wrap(angle: number) {
  let a = angle % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a;
}

/**
 * Pooled portal: a black disc that opens and shuts with a violet rim, always
 * facing the camera. Where Aaron dissolves and where he reappears.
 */
class ShadowPortalPool {
  readonly group = new THREE.Group();
  private items: Array<{ root: THREE.Group; ring: THREE.MeshBasicMaterial; disc: THREE.MeshBasicMaterial; life: number; max: number; radius: number }> = [];

  constructor(count: number, color: THREE.ColorRepresentation) {
    this.group.name = 'ShadowPortals';
    const discGeo = new THREE.CircleGeometry(1, 30);
    const ringGeo = new THREE.RingGeometry(0.9, 1.08, 44);
    for (let i = 0; i < count; i += 1) {
      const root = new THREE.Group();
      const disc = new THREE.MeshBasicMaterial({ color: 0x06030c, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
      const ring = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      const discMesh = new THREE.Mesh(discGeo, disc);
      const ringMesh = new THREE.Mesh(ringGeo, ring);
      discMesh.renderOrder = 3;
      ringMesh.renderOrder = 4;
      root.add(discMesh, ringMesh);
      root.visible = false;
      this.group.add(root);
      this.items.push({ root, ring, disc, life: 0, max: 1, radius: 1 });
    }
  }

  setColor(color: THREE.ColorRepresentation) {
    for (const item of this.items) item.ring.color.set(color);
  }

  open(pos: THREE.Vector3, radius = 0.9, life = 0.55) {
    const item = this.items.find((i) => i.life <= 0) ?? this.items.reduce((a, b) => (a.life < b.life ? a : b));
    item.root.position.copy(pos);
    item.root.visible = true;
    item.life = life;
    item.max = life;
    item.radius = radius;
    item.root.scale.setScalar(0.01);
  }

  update(dt: number, camera: THREE.Camera) {
    for (const item of this.items) {
      if (item.life <= 0) continue;
      item.life -= dt;
      if (item.life <= 0) {
        item.root.visible = false;
        continue;
      }
      const p = 1 - item.life / item.max;
      // Snap open, hold, then shut; the rim flares as it opens.
      const open = p < 0.22 ? Math.sin((p / 0.22) * Math.PI * 0.5) : p > 0.6 ? Math.max(0, 1 - (p - 0.6) / 0.4) : 1;
      item.root.scale.setScalar(Math.max(0.01, item.radius * open));
      item.root.quaternion.copy(camera.quaternion);
      item.ring.opacity = 0.9 * (p < 0.25 ? 1 : Math.max(0.35, 1 - (p - 0.25))) * Math.min(1, open * 1.4);
      item.disc.opacity = 0.9 * Math.min(1, open * 1.3);
    }
  }

  clear() {
    for (const item of this.items) {
      item.life = 0;
      item.root.visible = false;
    }
  }
}

export class AaronKit implements RyderKit {
  private ctx: KitContext | null = null;
  private seq: Sequence | null = null;
  private poseState: PoseOverride | null = null;
  private spinning = false;
  private spinT = 0;
  private spinAngle = 0;
  private spinHits = new HitSet<KitTarget>();
  private throwHits = new HitSet<KitTarget>();
  private bodyOpacity = 1;
  private bodyGlow = 0;
  private comboIndex = 0;
  private comboExpires = 0;
  private thrown: THREE.Group;
  private thrownAxe: THREE.Object3D | null = null;
  private spinDisc: THREE.Mesh;
  private axeTrail: TrailRibbon;
  private portals: ShadowPortalPool;
  private sparkT = 0;
  private debrisT = 0;
  private ringT = 0;
  private imageT = 0;
  private violetSoft = 0xb59cff;

  constructor() {
    this.thrown = new THREE.Group();
    this.thrown.name = 'ThrownAxe';
    this.thrown.visible = false;
    this.spinDisc = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.72, 40),
      new THREE.MeshBasicMaterial({ color: 0x8a3dff, transparent: true, opacity: 0.38, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    );
    this.spinDisc.rotation.x = -Math.PI / 2;
    this.thrown.add(this.spinDisc);
    // Long enough to draw most of the loop behind the blade so its orbit can be read.
    this.axeTrail = new TrailRibbon(0x8a3dff, { life: 0.7, width: 0.55, spacing: 0.12, points: 48 });
    this.portals = new ShadowPortalPool(3, 0x8a3dff);
  }

  get locked() {
    const seq = this.seq;
    if (!seq) return false;
    // The axe in flight leaves him free to walk; everything else is a canned beat.
    return !(seq.kind === 'throw' && seq.phase === 'flight');
  }

  get busy() {
    return this.spinning || (this.seq?.kind === 'throw' && this.seq.phase === 'flight');
  }

  get airY() {
    return 0;
  }

  get pose() {
    return this.poseState;
  }

  get opacity() {
    return this.bodyOpacity;
  }

  get glow() {
    return this.bodyGlow;
  }

  get intangible() {
    return this.seq?.kind === 'strike' && this.seq.phase === 'vanish';
  }

  get moveScale() {
    return this.spinning ? SWING_MOVE_SCALE : 1;
  }

  get bodyYaw() {
    return this.spinning || this.seq?.kind === 'finish' ? this.spinAngle : 0;
  }

  get braced() {
    return this.spinning || this.seq?.kind === 'finish' ? 1 : 0;
  }

  private get spinLevel() {
    return THREE.MathUtils.clamp(this.spinT / SWING_RAMP, 0, 1);
  }

  attach(ctx: KitContext) {
    this.ctx = ctx;
    const electric = ctx.spec.visual.electricityColor;
    this.axeTrail.setColor(electric);
    this.portals.setColor(electric);
    (this.spinDisc.material as THREE.MeshBasicMaterial).color.set(electric);
    this.violetSoft = new THREE.Color(electric).lerp(WHITE, 0.5).getHex();
    ctx.scene.add(this.thrown, this.axeTrail.mesh, this.portals.group);
    const fighter = ctx.fighter();
    if (fighter) ctx.afterimages.bind(fighter, ctx.spec.visual.auraColor);
    // The thrown axe is a copy of the one in his hand, so the two never differ.
    if (this.thrownAxe) this.thrown.remove(this.thrownAxe);
    this.thrownAxe = null;
    const axe = this.handAxe();
    if (axe) {
      const copy = axe.clone(true);
      copy.position.set(0, 0, 0);
      copy.quaternion.identity();
      copy.scale.setScalar(1);
      // Haft flat, so the spin reads as a thrown blade and not a propeller.
      copy.rotation.z = Math.PI / 2;
      this.thrown.add(copy);
      this.thrownAxe = copy;
    }
    this.bodyOpacity = 1;
    this.bodyGlow = 0;
    this.spinning = false;
    this.comboIndex = 0;
  }

  detach() {
    this.interrupt();
    if (this.ctx) {
      this.ctx.scene.remove(this.thrown, this.axeTrail.mesh, this.portals.group);
      this.ctx.afterimages.unbind();
    }
    this.axeTrail.clear();
    this.portals.clear();
    this.ctx = null;
  }

  /** Cut everything and leave him exactly as a fresh Aaron: axe in hand, solid, facing the camera. */
  interrupt() {
    this.seq = null;
    this.poseState = null;
    this.spinning = false;
    this.spinT = 0;
    this.spinAngle = 0;
    this.spinHits.clear();
    this.throwHits.clear();
    this.bodyOpacity = 1;
    this.bodyGlow = 0;
    this.thrown.visible = false;
    this.axeTrail.clear();
    this.axeTrail.intensity = 0;
    this.showHandAxe(true);
  }

  // ---------------------------------------------------------------------------
  // Axe plumbing
  // ---------------------------------------------------------------------------

  private handAxe(): THREE.Object3D | null {
    const fighter = this.ctx?.fighter();
    if (!fighter) return null;
    return fighter.weapons.find((w) => w.name === 'BlackAxe') ?? fighter.weapons[0] ?? null;
  }

  private showHandAxe(visible: boolean) {
    const axe = this.handAxe();
    if (axe) axe.visible = visible;
  }

  /** World position of the axe head while it is in his hand (last rendered pose). */
  private handAxeHead(out: THREE.Vector3) {
    const axe = this.handAxe();
    if (!axe) return false;
    out.set(0, 0.46, 0.16);
    axe.localToWorld(out);
    return true;
  }

  private handPosition(out: THREE.Vector3) {
    const ctx = this.ctx!;
    if (!ctx.power.anchorPosition('handR', out)) out.copy(ctx.pos).setY(ctx.heightAt(ctx.pos.x, ctx.pos.z) + 1.2);
    return out;
  }

  /** Particles that fall inward onto `centre`: Aaron's power pulls, it does not burst. */
  private implode(centre: THREE.Vector3, color: THREE.ColorRepresentation, count: number, radius: number, speed: number, size = 0.18) {
    const ctx = this.ctx!;
    for (let i = 0; i < count; i += 1) {
      _q.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      _p.copy(centre).addScaledVector(_q, radius * (0.6 + Math.random() * 0.4));
      _q.negate();
      ctx.particles.emit(_p, color, 1, { speed, direction: _q, spread: 0.25, life: (radius / speed) * 1.1, size });
    }
  }

  // ---------------------------------------------------------------------------
  // Melee chain
  // ---------------------------------------------------------------------------

  melee(time: number): MeleeStep | null {
    if (time > this.comboExpires) this.comboIndex = 0;
    const step = COMBO[this.comboIndex % COMBO.length];
    this.comboIndex += 1;
    this.comboExpires = time + step.recovery + COMBO_WINDOW;
    this.ctx?.power.boost(0.8 + 0.3 * this.comboIndex);
    this.ctx?.power.arcAt(['handR', 'lowerArmR'], 1, 0.8, 0.12, 0.03);
    return step;
  }

  // ---------------------------------------------------------------------------
  // Abilities
  // ---------------------------------------------------------------------------

  tryAbility(id: AbilityId) {
    if (!this.ctx) return false;
    switch (id) {
      case 'cleave':
        return this.seq || this.spinning ? true : this.startThrow();
      case 'blink':
        return this.seq || this.spinning ? true : this.startStrike();
      case 'greedSiphon':
        if (!this.seq) this.startSwing();
        return true;
      default:
        return false;
    }
  }

  endAbility(id: AbilityId) {
    if (id === 'greedSiphon') this.endSwing();
  }

  // --- Boomerang Cleave -------------------------------------------------------

  private startThrow() {
    const ctx = this.ctx!;
    this.throwHits.clear();
    this.seq = { kind: 'throw', phase: 'wind', t: 0, flight: null };
    ctx.camera.addKick(-0.1);
    ctx.power.boost(1.1);
    ctx.power.arcAt(['handR', 'lowerArmR'], 2, 0.9, 0.14, 0.035);
    ctx.sound('aaron.cleave.charge');
    return true;
  }

  private buildFlight(): Flight {
    const ctx = this.ctx!;
    const yaw = ctx.yaw();
    const f = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const origin = this.handPosition(_p).clone();
    origin.y = 0;
    let a = LOOP_A;
    let b = LOOP_B;
    const centre = new THREE.Vector3();
    const place = () => centre.copy(origin).addScaledVector(f, -a * Math.cos(LOOP_START)).addScaledVector(r, -b * Math.sin(LOOP_START));
    // Shrink the loop until it clears the block's geometry (the axe never tunnels through a building).
    for (let attempt = 0; attempt < 4; attempt += 1) {
      place();
      let clear = true;
      for (let i = 1; i < 14 && clear; i += 1) {
        const theta = LOOP_START + (i / 14) * Math.PI * 2;
        _q.copy(centre).addScaledVector(f, a * Math.cos(theta)).addScaledVector(r, b * Math.sin(theta));
        if (ctx.blocked(_q.x, _q.z, 0.35)) clear = false;
      }
      if (clear) break;
      a *= 0.72;
      b *= 0.72;
    }
    place();
    return {
      centre,
      f,
      r,
      a,
      b,
      theta: LOOP_START,
      pos: origin.clone(),
      prev: origin.clone(),
      dir: f.clone(),
      returning: false,
      returnT: 0,
      spin: 0,
    };
  }

  private releaseAxe(seq: Extract<Sequence, { kind: 'throw' }>) {
    const ctx = this.ctx!;
    const electric = ctx.spec.visual.electricityColor;
    seq.phase = 'flight';
    seq.t = 0;
    seq.flight = this.buildFlight();
    this.showHandAxe(false);
    this.thrown.visible = true;
    this.axeTrail.clear();
    this.axeTrail.intensity = 1.2;
    this.handPosition(_p);
    ctx.particles.emit(_p, electric, 14, { speed: 5, size: 0.22, life: 0.3, direction: seq.flight.f });
    ctx.particles.emit(_p, SILVER, 5, { speed: 2.5, size: 0.3, life: 0.2 });
    ctx.camera.addKick(0.25);
    ctx.camera.addShake(0.12);
    ctx.camera.addFovPunch(5);
    ctx.power.boost(1.6);
    ctx.sound('aaron.cleave.throw');
  }

  private updateThrow(seq: Extract<Sequence, { kind: 'throw' }>, dt: number) {
    const ctx = this.ctx!;
    const aura = ctx.spec.visual.auraColor;
    const electric = ctx.spec.visual.electricityColor;
    seq.t += dt;
    switch (seq.phase) {
      case 'wind': {
        const p = Math.min(1, seq.t / THROW_WIND);
        this.poseState = { kind: 'throw', t: p * THROW_RELEASE_T, weight: Math.min(1, seq.t / 0.06) };
        this.bodyGlow = 0.15 * p;
        // Black-violet charge gathering on the blade.
        if (this.handAxeHead(_p)) {
          this.implode(_p, Math.random() < 0.5 ? aura : electric, 2, 0.7, 4, 0.16);
          if (Math.random() < 0.7) ctx.power.arcAt(['handR'], 1, 0.9, 0.1, 0.03);
        }
        if (seq.t >= THROW_WIND) this.releaseAxe(seq);
        break;
      }
      case 'flight': {
        const flight = seq.flight!;
        // Finish the throw stance as the axe leaves, then he is free to move.
        if (seq.t < THROW_FOLLOW) {
          const p = seq.t / THROW_FOLLOW;
          this.poseState = { kind: 'throw', t: THROW_RELEASE_T + (1 - THROW_RELEASE_T) * p, weight: 1 - p * p };
        } else {
          this.poseState = null;
        }
        this.bodyGlow = Math.max(0, 0.15 - seq.t);
        this.stepFlight(flight, dt);
        if (this.flightCaught(flight)) this.catchAxe(seq);
        break;
      }
      case 'catch': {
        const p = Math.min(1, seq.t / THROW_CATCH);
        this.poseState = { kind: 'catch', t: p, weight: p > 0.75 ? 1 - (p - 0.75) / 0.25 : 1 };
        this.axeTrail.intensity = Math.max(0, this.axeTrail.intensity - dt * 5);
        if (seq.t >= THROW_CATCH) {
          this.seq = null;
          this.poseState = null;
        }
        break;
      }
    }
  }

  private stepFlight(flight: Flight, dt: number) {
    const ctx = this.ctx!;
    const aura = ctx.spec.visual.auraColor;
    flight.prev.copy(flight.pos);
    const step = AXE_SPEED * dt;
    if (!flight.returning) {
      // Walk the ellipse by arc length: dθ = ds / |P'(θ)|, in small sub-steps so
      // the tight end of the loop does not lurch.
      let remaining = step;
      while (remaining > 0 && !flight.returning) {
        const ds = Math.min(remaining, 0.25);
        const speed = Math.hypot(flight.a * Math.sin(flight.theta), flight.b * Math.cos(flight.theta)) || 0.01;
        flight.theta += ds / speed;
        remaining -= ds;
        if (flight.theta >= LOOP_START + Math.PI * 2) flight.returning = true;
      }
      flight.pos.copy(flight.centre).addScaledVector(flight.f, flight.a * Math.cos(flight.theta)).addScaledVector(flight.r, flight.b * Math.sin(flight.theta));
    }
    if (flight.returning) {
      // Home onto the hand: the loop closes wherever Aaron has walked to.
      flight.returnT += dt;
      this.handPosition(_q).setY(0);
      _dir.subVectors(_q, flight.pos).setY(0);
      const dist = _dir.length();
      if (dist > 1e-3) {
        _dir.divideScalar(dist);
        const turn = Math.min(1, dt * 9);
        flight.dir.lerp(_dir, turn).setY(0).normalize();
      }
      flight.pos.addScaledVector(flight.dir, Math.min(step, dist));
    } else {
      _dir.subVectors(flight.pos, flight.prev).setY(0);
      if (_dir.lengthSq() > 1e-6) flight.dir.copy(_dir).normalize();
    }
    flight.pos.y = 0;
    flight.spin += AXE_SPIN * dt;

    // Place the blade: hovering at chest height, spinning flat, banked into the turn.
    const ground = ctx.heightAt(flight.pos.x, flight.pos.z);
    this.thrown.position.set(flight.pos.x, ground + AXE_HEIGHT, flight.pos.z);
    this.thrown.rotation.set(0, flight.spin, 0);
    this.thrown.updateMatrixWorld(true);
    (this.spinDisc.material as THREE.MeshBasicMaterial).opacity = 0.3 + 0.12 * Math.sin(flight.spin * 0.5);

    // Trail from the blade's edge, motes along the path.
    if (this.thrownAxe) {
      _p.set(0, 0.46, 0.16);
      this.thrownAxe.localToWorld(_p);
    } else {
      _p.copy(this.thrown.position);
    }
    this.axeTrail.feed(_p);
    if (Math.random() < 0.8) {
      _q.copy(this.thrown.position);
      ctx.particles.emit(_q, Math.random() < 0.7 ? aura : SILVER, 1, { speed: 1.2, size: 0.17, life: 0.35, spread: 1.2 });
    }

    // Everything the blade passes through this frame takes it. Hosts out at
    // the rim of the loop, far from Aaron, are thrown harder.
    _q.copy(flight.prev).setY(0);
    const hits = targetsAlongSegment(ctx.targets(), _q, flight.pos, AXE_WIDTH, _hits);
    for (const target of [...hits]) {
      if (target.hp <= 0 || target.held > 0) continue;
      if (!this.throwHits.take(target, ctx.time(), THROW_REHIT)) continue;
      this.axeHit(target, flight);
    }
  }

  private axeHit(target: KitTarget, flight: Flight) {
    const ctx = this.ctx!;
    const electric = ctx.spec.visual.electricityColor;
    _dir.subVectors(target.pos, ctx.pos).setY(0);
    const away = _dir.length();
    const edge = THREE.MathUtils.clamp(away / (LOOP_A * 1.6), 0, 1);
    if (away > 1e-3) _dir.divideScalar(away);
    else _dir.copy(flight.dir);
    // Carried along with the blade and shoved outward from Aaron.
    _dir.multiplyScalar(0.7).addScaledVector(flight.dir, 0.6).setY(0).normalize();
    ctx.hurt(target, THROW_HIT, _dir, 'launch', 0.85 + 0.75 * edge);
    ctx.flash(target, electric, 0.22);
    _p.copy(target.pos).setY(1.1);
    ctx.particles.emit(_p, electric, 12, { speed: 6, size: 0.22, life: 0.32, direction: _dir });
    ctx.particles.emit(_p, SILVER, 4, { speed: 2.5, size: 0.34, life: 0.18 });
    ctx.rings.spawn(_p, electric, { radius: 1.3, duration: 0.26, y: 1.1 });
    ctx.camera.addShake(0.1 + 0.08 * edge);
    ctx.hitStop(0.02);
    ctx.power.boost(1.3);
    ctx.sound('aaron.cleave.hit');
  }

  private flightCaught(flight: Flight) {
    if (!flight.returning) return false;
    this.handPosition(_q).setY(0);
    return flight.pos.distanceTo(_q) < 0.7 || flight.returnT >= AXE_RETURN_MAX;
  }

  private catchAxe(seq: Extract<Sequence, { kind: 'throw' }>) {
    const ctx = this.ctx!;
    const electric = ctx.spec.visual.electricityColor;
    seq.phase = 'catch';
    seq.t = 0;
    seq.flight = null;
    this.thrown.visible = false;
    this.showHandAxe(true);
    this.handPosition(_p);
    ctx.hitStop(0.03);
    ctx.camera.addKick(0.18);
    ctx.camera.addShake(0.14);
    ctx.rings.spawn(_p, electric, { radius: 1.2, duration: 0.28, y: _p.y });
    ctx.particles.emit(_p, electric, 12, { speed: 4.5, size: 0.2, life: 0.3 });
    ctx.particles.emit(_p, SILVER, 6, { speed: 2, size: 0.32, life: 0.2 });
    ctx.power.boost(1.5);
    ctx.power.arcAt(['handR', 'lowerArmR', 'upperArmR'], 3, 1, 0.14, 0.035);
    ctx.sound('aaron.cleave.catch');
  }

  // --- Shadow Strike ----------------------------------------------------------

  private pickStrikeTarget() {
    const ctx = this.ctx!;
    const yaw = ctx.yaw();
    _dir.set(Math.sin(yaw), 0, Math.cos(yaw));
    const near = targetsInRadius(ctx.targets(), ctx.pos, STRIKE_SEEK, _hits).filter((t) => t.hp > 0 && t.held <= 0);
    let best: KitTarget | null = null;
    let bestScore = Infinity;
    for (const t of near) {
      _q.subVectors(t.pos, ctx.pos).setY(0);
      const d = _q.length();
      // Nearest wins; hosts behind the camera count as a few metres further.
      const score = d + (_q.dot(_dir) < 0 ? 4 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  }

  private startStrike() {
    const ctx = this.ctx!;
    const target = this.pickStrikeTarget();
    const to = new THREE.Vector3();
    let faceYaw = ctx.yaw();
    if (target) {
      // Behind the host: the far side from where Aaron stands (hosts face their prey).
      _dir.subVectors(target.pos, ctx.pos).setY(0);
      if (_dir.lengthSq() < 1e-4) _dir.set(Math.sin(faceYaw), 0, Math.cos(faceYaw));
      _dir.normalize();
      const gap = target.radius + ctx.radius + 0.55;
      const base = Math.atan2(_dir.x, _dir.z);
      let placed = false;
      for (const offset of [0, 0.9, -0.9, 1.8, -1.8, 2.6, -2.6, Math.PI]) {
        const angle = base + offset;
        to.set(target.pos.x + Math.sin(angle) * gap, 0, target.pos.z + Math.cos(angle) * gap);
        if (!ctx.blocked(to.x, to.z, ctx.radius + 0.1)) {
          placed = true;
          break;
        }
      }
      if (!placed) to.copy(ctx.pos);
      faceYaw = Math.atan2(target.pos.x - to.x, target.pos.z - to.z);
    } else {
      // Nobody near: a short step through the dark toward the aim; still useful for getting around.
      ctx.lookDir(_dir);
      _dir.setY(0);
      if (_dir.lengthSq() < 1e-4) _dir.set(Math.sin(faceYaw), 0, Math.cos(faceYaw));
      _dir.normalize();
      let dist = STRIKE_STEP;
      for (; dist > 1.2; dist -= 0.5) {
        to.copy(ctx.pos).addScaledVector(_dir, dist);
        if (!ctx.blocked(to.x, to.z, ctx.radius + 0.15)) break;
      }
      if (dist <= 1.2) to.copy(ctx.pos).addScaledVector(_dir, 1.2);
    }
    to.y = 0;
    this.seq = { kind: 'strike', phase: 'vanish', t: 0, target, to, faceYaw, hit: false };
    ctx.iframes(STRIKE_VANISH + STRIKE_CUT + 0.15);
    // The silhouette he leaves behind, and the portal that takes him.
    ctx.afterimages.spawn(0.55, 0.75);
    _p.copy(ctx.pos).setY(ctx.heightAt(ctx.pos.x, ctx.pos.z) + 1.0);
    this.portals.open(_p, 0.95, 0.5);
    this.implode(_p, ctx.spec.visual.auraColor, 16, 1.4, 6, 0.17);
    ctx.power.arcAt(['chest', 'handL', 'handR'], 3, 0.9, 0.12, 0.03);
    ctx.camera.addKick(-0.08);
    ctx.sound(target ? 'aaron.strike.vanish' : 'aaron.strike.step');
    return true;
  }

  private appear(seq: Extract<Sequence, { kind: 'strike' }>) {
    const ctx = this.ctx!;
    const aura = ctx.spec.visual.auraColor;
    const electric = ctx.spec.visual.electricityColor;
    ctx.pos.x = seq.to.x;
    ctx.pos.z = seq.to.z;
    ctx.pos.y = 0;
    ctx.resolve(ctx.pos);
    // Face the host from behind; the camera cuts with him and gets a tiny snap.
    ctx.turn(seq.faceYaw, true);
    ctx.camera.addKick(0.12);
    ctx.camera.addShake(0.1);
    _p.copy(ctx.pos).setY(ctx.heightAt(ctx.pos.x, ctx.pos.z) + 1.0);
    this.portals.open(_p, 1.0, 0.55);
    this.implode(_p, electric, 14, 1.3, 7, 0.16);
    ctx.particles.emit(_p, SILVER, 4, { speed: 1.5, size: 0.3, life: 0.2 });
    _q.copy(ctx.pos).setY(ctx.heightAt(ctx.pos.x, ctx.pos.z) + 0.05);
    ctx.rings.spawn(_q, aura, { radius: 1.5, duration: 0.3 });
    ctx.power.boost(1.4);
    ctx.sound('aaron.strike.appear');
    seq.phase = 'cut';
    seq.t = 0;
    if (seq.target) {
      ctx.strike('slash');
      ctx.schedule(STRIKE_HIT_AT, () => this.landCut(seq));
    }
  }

  private landCut(seq: Extract<Sequence, { kind: 'strike' }>) {
    const ctx = this.ctx!;
    const electric = ctx.spec.visual.electricityColor;
    const target = seq.target;
    seq.hit = true;
    if (!target || target.hp <= 0) return;
    _dir.subVectors(target.pos, ctx.pos).setY(0);
    const d = _dir.length();
    if (d > STRIKE_REACH + target.radius) return;
    if (d > 1e-3) _dir.divideScalar(d);
    else _dir.set(Math.sin(ctx.yaw()), 0, Math.cos(ctx.yaw()));
    ctx.hurt(target, STRIKE_DAMAGE, _dir, 'heavy', 1.1);
    ctx.flash(target, electric, 0.3);
    ctx.hitStop(0.06);
    ctx.camera.addShake(0.3);
    ctx.camera.addKick(0.2);
    // One flat cut at neck height: a horizontal ring through the head line, silver spray.
    _p.copy(target.pos).setY(ctx.heightAt(target.pos.x, target.pos.z) + NECK_HEIGHT);
    ctx.rings.spawn(_p, electric, { radius: 1.6, duration: 0.24, y: _p.y });
    ctx.particles.emit(_p, SILVER, 10, { speed: 5, size: 0.24, life: 0.28, direction: _dir, up: 0.4 });
    ctx.particles.emit(_p, electric, 14, { speed: 6, size: 0.22, life: 0.32, direction: _dir });
    ctx.particles.emit(_p, ctx.spec.visual.auraColor, 8, { speed: 2, size: 0.3, life: 0.4, up: 0.8 });
    ctx.power.boost(1.8);
    ctx.power.arcAt(['handR', 'lowerArmR'], 2, 1, 0.12, 0.035);
    ctx.sound('aaron.strike.cut');
  }

  private updateStrike(seq: Extract<Sequence, { kind: 'strike' }>, dt: number) {
    const ctx = this.ctx!;
    seq.t += dt;
    switch (seq.phase) {
      case 'vanish': {
        const p = Math.min(1, seq.t / STRIKE_VANISH);
        this.bodyOpacity = Math.max(0.04, 1 - p * 1.1);
        this.bodyGlow = 0.2 + 0.5 * p;
        this.poseState = { kind: 'guard', t: 0, weight: Math.min(1, p * 2) };
        if (Math.random() < 0.6) {
          _p.copy(ctx.pos).setY(ctx.heightAt(ctx.pos.x, ctx.pos.z) + 1.0);
          this.implode(_p, ctx.spec.visual.auraColor, 2, 1.2, 6, 0.15);
        }
        if (seq.t >= STRIKE_VANISH) this.appear(seq);
        break;
      }
      case 'cut': {
        const p = Math.min(1, seq.t / STRIKE_CUT);
        this.bodyOpacity = Math.min(1, 0.3 + p * 3);
        this.bodyGlow = Math.max(0, 0.5 - p * 0.7);
        // The slash itself comes from the strike animation; the stance under it is the guard crouch.
        this.poseState = seq.target ? null : { kind: 'guard', t: p * 0.3, weight: 1 };
        if (seq.t >= STRIKE_CUT) {
          seq.phase = 'guard';
          seq.t = 0;
        }
        break;
      }
      case 'guard': {
        const p = Math.min(1, seq.t / STRIKE_GUARD);
        this.bodyOpacity = 1;
        this.bodyGlow = 0;
        this.poseState = { kind: 'guard', t: 0.3 + 0.7 * p, weight: p > 0.6 ? 1 - (p - 0.6) / 0.4 : 1 };
        if (seq.t >= STRIKE_GUARD) {
          this.seq = null;
          this.poseState = null;
        }
        break;
      }
    }
  }

  // --- Greed Swing ------------------------------------------------------------

  private startSwing() {
    const ctx = this.ctx!;
    this.spinning = true;
    this.spinT = 0;
    this.spinAngle = 0;
    this.spinHits.clear();
    this.axeTrail.clear();
    this.axeTrail.intensity = 0.8;
    ctx.power.boost(1.2);
    ctx.power.arcAt(['handL', 'handR', 'lowerArmR'], 3, 0.9, 0.14, 0.035);
    _p.copy(ctx.pos).setY(ctx.heightAt(ctx.pos.x, ctx.pos.z) + 0.05);
    ctx.rings.spawn(_p, ctx.spec.visual.auraColor, { radius: 2.0, duration: 0.38 });
    ctx.sound('aaron.swing.start');
  }

  /** The engine switched the power off (press, aura gone): one last whipping cleave, then stop. */
  private endSwing() {
    if (!this.spinning) return;
    const ctx = this.ctx;
    const level = this.spinLevel;
    this.spinning = false;
    this.spinHits.clear();
    if (!ctx) {
      this.spinAngle = 0;
      return;
    }
    // At least one more full turn, ending square to the camera again.
    const from = this.spinAngle;
    const to = Math.ceil(from / (Math.PI * 2)) * Math.PI * 2 + Math.PI * 2;
    this.seq = { kind: 'finish', t: 0, angleFrom: from, angleTo: to, level, hit: false };
    ctx.camera.addKick(0.15);
    ctx.power.boost(1.6);
    ctx.sound('aaron.swing.finish');
  }

  private updateSwing(frame: KitFrame) {
    const ctx = this.ctx!;
    const { dt } = frame;
    const aura = ctx.spec.visual.auraColor;
    const electric = ctx.spec.visual.electricityColor;
    this.spinT += dt;
    const level = this.spinLevel;
    const rate = SWING_RATE_MIN + (SWING_RATE_MAX - SWING_RATE_MIN) * level;
    const from = this.spinAngle;
    this.spinAngle += rate * dt;
    this.poseState = { kind: 'spin', t: level, weight: Math.min(1, this.spinT / 0.14) };
    this.bodyGlow = 0.1 + 0.2 * level;
    ctx.power.boost(0.3 + 0.5 * level);

    // The blade sweeps a bearing band each frame; any host standing in that
    // band, within reach, is met by it. Once per pass.
    const axeFrom = wrap(ctx.yaw() + from + SWING_AXE_OFFSET);
    const sweep = rate * dt;
    for (const target of ctx.targets()) {
      if (target.hp <= 0 || target.held > 0) continue;
      const dx = target.pos.x - ctx.pos.x;
      const dz = target.pos.z - ctx.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > SWING_REACH + target.radius) continue;
      const bearing = Math.atan2(dx, dz);
      const halfWidth = Math.atan2(target.radius, Math.max(0.3, dist));
      const ahead = wrap(bearing - axeFrom + halfWidth);
      if (ahead > sweep + halfWidth * 2) continue;
      if (!this.spinHits.take(target, ctx.time(), SWING_REHIT)) continue;
      this.swingHit(target, dx, dz, dist, level);
    }

    // Energy spiralling around him, the blade's trail, and the ground tearing up as he speeds up.
    if (this.handAxeHead(_p)) this.axeTrail.feed(_p);
    this.axeTrail.intensity = 0.6 + 0.7 * level;
    this.sparkT -= dt;
    if (this.sparkT <= 0) {
      const angle = ctx.yaw() + this.spinAngle + Math.random() * 1.2;
      const radius = 0.8 + Math.random() * 0.9;
      _p.set(ctx.pos.x + Math.sin(angle) * radius, ctx.heightAt(ctx.pos.x, ctx.pos.z) + 0.3 + Math.random() * 1.4, ctx.pos.z + Math.cos(angle) * radius);
      _q.set(Math.cos(angle), 0.35, -Math.sin(angle));
      const roll = Math.random();
      ctx.particles.emit(_p, roll < 0.45 ? aura : roll < 0.85 ? electric : SILVER, 1, { speed: 2.5 + 3 * level, size: 0.16, life: 0.4, direction: _q, spread: 0.6 });
      if (Math.random() < 0.25 + 0.3 * level) ctx.power.arcAt(['handL', 'handR', 'lowerArmR'], 1, 0.6 + 0.4 * level, 0.1, 0.03);
      this.sparkT = 0.045 - 0.02 * level;
    }
    if (level > 0.3) {
      this.debrisT -= dt;
      if (this.debrisT <= 0) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 1.3 + Math.random() * 0.8;
        const ground = ctx.heightAt(ctx.pos.x, ctx.pos.z);
        _p.set(ctx.pos.x + Math.sin(angle) * radius, ground + 0.08, ctx.pos.z + Math.cos(angle) * radius);
        _q.set(Math.cos(angle), 0.5, -Math.sin(angle));
        ctx.particles.emit(_p, Math.random() < 0.7 ? DEBRIS : this.violetSoft, 2, { speed: 3 + 4 * level, size: 0.2, life: 0.45, direction: _q, spread: 0.8, gravity: 7 });
        this.debrisT = 0.09 - 0.05 * level;
      }
      this.ringT -= dt;
      if (this.ringT <= 0) {
        _p.copy(ctx.pos).setY(ctx.heightAt(ctx.pos.x, ctx.pos.z) + 0.05);
        ctx.rings.spawn(_p, aura, { radius: 1.6 + 1.2 * level, duration: 0.3 });
        this.ringT = 0.42 - 0.2 * level;
      }
    }
    if (level > 0.7) {
      this.imageT -= dt;
      if (this.imageT <= 0) {
        ctx.afterimages.spawn(0.2, 0.18);
        this.imageT = 0.12;
      }
    }
  }

  private swingHit(target: KitTarget, dx: number, dz: number, dist: number, level: number) {
    const ctx = this.ctx!;
    const electric = ctx.spec.visual.electricityColor;
    const bearing = Math.atan2(dx, dz);
    // Thrown outward and carried along with the blade's motion.
    _dir.set(dx, 0, dz);
    if (dist > 1e-3) _dir.divideScalar(dist);
    else _dir.set(Math.sin(ctx.yaw()), 0, Math.cos(ctx.yaw()));
    _q.set(Math.cos(bearing), 0, -Math.sin(bearing));
    _dir.multiplyScalar(0.75).addScaledVector(_q, 0.6).normalize();
    const damage = SWING_HIT * (1 + 0.5 * level);
    if (level < 0.5) ctx.hurt(target, damage, _dir, 'knockback', 0.8 + 0.4 * level);
    else ctx.hurt(target, damage, _dir, 'launch', 0.9 + 0.5 * level);
    ctx.gainAura(SWING_AURA_PER_HIT);
    ctx.flash(target, electric, 0.2);
    _p.copy(target.pos).setY(1.1);
    ctx.particles.emit(_p, electric, 10, { speed: 6, size: 0.22, life: 0.3, direction: _dir });
    ctx.particles.emit(_p, SILVER, 3, { speed: 2.5, size: 0.32, life: 0.18 });
    ctx.camera.addShake(0.06 + 0.06 * level);
    if (level >= 0.5) ctx.hitStop(0.015);
    ctx.power.boost(1.2 + 0.4 * level);
    ctx.sound('aaron.swing.hit');
  }

  private updateFinish(seq: Extract<Sequence, { kind: 'finish' }>, dt: number) {
    const ctx = this.ctx!;
    const aura = ctx.spec.visual.auraColor;
    const electric = ctx.spec.visual.electricityColor;
    seq.t += dt;
    const p = Math.min(1, seq.t / SWING_FINISH);
    // Whip through the last turn fast and brake out of it.
    const eased = 1 - (1 - p) * (1 - p) * (1 - p);
    this.spinAngle = seq.angleFrom + (seq.angleTo - seq.angleFrom) * eased;
    this.poseState = { kind: 'spin', t: 1, weight: p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1 };
    this.bodyGlow = Math.max(0, 0.35 - p * 0.5);
    if (this.handAxeHead(_p)) this.axeTrail.feed(_p);
    this.axeTrail.intensity = Math.max(0, 1.4 * (1 - p));
    if (!seq.hit && seq.t >= SWING_FINISH_AT) {
      seq.hit = true;
      const strength = 1.2 + 0.4 * seq.level;
      const hits = targetsInRadius(ctx.targets(), ctx.pos, SWING_FINISH_RADIUS, _hits);
      let any = false;
      for (const target of [...hits]) {
        if (target.hp <= 0 || target.held > 0) continue;
        any = true;
        _dir.subVectors(target.pos, ctx.pos).setY(0);
        if (_dir.lengthSq() < 1e-4) _dir.set(Math.sin(ctx.yaw()), 0, Math.cos(ctx.yaw()));
        _dir.normalize();
        ctx.hurt(target, SWING_FINISH_DAMAGE * (0.8 + 0.4 * seq.level), _dir, 'launch', strength);
        ctx.gainAura(SWING_AURA_PER_HIT);
        ctx.flash(target, electric, 0.25);
        _q.copy(target.pos).setY(1.1);
        ctx.particles.emit(_q, electric, 12, { speed: 7, size: 0.24, life: 0.32, direction: _dir });
      }
      _p.copy(ctx.pos).setY(ctx.heightAt(ctx.pos.x, ctx.pos.z) + 0.06);
      ctx.rings.spawn(_p, electric, { radius: SWING_FINISH_RADIUS + 0.4, duration: 0.4 });
      ctx.rings.spawn(_p, aura, { radius: SWING_FINISH_RADIUS * 0.6, duration: 0.3, y: _p.y + 1.1 });
      ctx.particles.emit(_p, DEBRIS, 16, { speed: 6, size: 0.26, life: 0.5, up: 1.1, gravity: 8 });
      ctx.particles.emit(_p, SILVER, 6, { speed: 3, size: 0.36, life: 0.22, up: 0.6 });
      ctx.camera.addShake(any ? 0.42 : 0.2);
      ctx.camera.addKick(0.25);
      if (any) ctx.hitStop(0.05);
      ctx.power.surge(0.5);
      ctx.sound(any ? 'aaron.swing.cleave' : 'aaron.swing.cleave.whiff');
    }
    if (seq.t >= SWING_FINISH) {
      this.seq = null;
      this.poseState = null;
      this.spinAngle = 0;
      this.spinT = 0;
    }
  }

  // ---------------------------------------------------------------------------
  // Per frame
  // ---------------------------------------------------------------------------

  update(frame: KitFrame) {
    const ctx = this.ctx;
    if (!ctx) return;
    const { dt } = frame;

    if (this.seq) {
      switch (this.seq.kind) {
        case 'throw':
          this.updateThrow(this.seq, dt);
          break;
        case 'strike':
          this.updateStrike(this.seq, dt);
          break;
        case 'finish':
          this.updateFinish(this.seq, dt);
          break;
      }
    } else if (this.spinning) {
      this.updateSwing(frame);
    } else {
      this.poseState = null;
      this.bodyOpacity = 1;
      this.bodyGlow = 0;
      this.axeTrail.intensity = Math.max(0, this.axeTrail.intensity - dt * 4);
    }

    this.axeTrail.update(dt, ctx.cameraObject);
    this.portals.update(dt, ctx.cameraObject);
  }
}
