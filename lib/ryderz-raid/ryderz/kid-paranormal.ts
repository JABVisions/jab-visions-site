import * as THREE from 'three';
import type { AbilityId } from '../config';
import type { MeleeStyle, PoseOverride } from '../skeletal';
import type { HitReaction } from '../combat';
import { AirJumpFx, chestPoint, leapAhead } from './air-jump';
import type { KitContext, KitFrame, KitTarget, MeleeStep, RyderKit } from './kit';

/**
 * Kid Paranormal. The Mixamo GLB supplies the body and the blanket cape.
 * This kit plays Unipolar Energy on top of the shared punch, kick, and melee
 * pipeline: spectral hands, illusion copies, a folding construct, and a goo teleport.
 */

const VIOLET = 0xb388ff;
const CYAN = 0x3de7ff;
const WHITE = 0xf4fbff;
const GRASP_RANGE = 8.2;
const SHOCK_RANGE = 4.6;
const COLLAPSE_RANGE = 7;
const COLLAPSE_RANGE_CHARGED = 9.4;
const PROJECTION_LIFE = 8;
const RESONANCE_MAX = 100;
const RESONANCE_GAIN = 22;

type GraspPhase = 'raise' | 'crack' | 'seize' | 'lift' | 'slam';
type CollapsePhase = 'rise' | 'form' | 'hold' | 'fold' | 'burst';

interface Grasp {
  phase: GraspPhase;
  t: number;
  targets: KitTarget[];
  charged: boolean;
}

interface Collapse {
  phase: CollapsePhase;
  t: number;
  targets: KitTarget[];
  radius: number;
  mesh: THREE.Group;
  charged: boolean;
}

interface Projection {
  mesh: THREE.Group;
  role: 'attack' | 'decoy';
  x: number;
  z: number;
  hitCd: number;
  life: number;
}

const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();

function resist(target: KitTarget) {
  let amount = target.mass >= 1.7 ? 0.45 : 0;
  if ((target as { duelist?: boolean }).duelist) amount = Math.max(amount, 0.4);
  return amount;
}

function living(targets: readonly KitTarget[]) {
  return targets.filter((target) => target.hp > 0);
}

export class KidParanormalKit implements RyderKit {
  private ctx: KitContext | null = null;
  private grasp: Grasp | null = null;
  private collapse: Collapse | null = null;
  private projections: Projection[] = [];
  private hands: THREE.Mesh[] = [];
  private cracks: THREE.Mesh[] = [];
  private fragments: THREE.Mesh[] = [];
  private baton: THREE.Mesh | null = null;
  private fist: THREE.Mesh | null = null;
  private batonT = 0;
  private fistT = 0;
  private meter = 0;
  private fx: AirJumpFx | null = null;
  private veil = 0;
  private readonly chest = new THREE.Vector3();
  private poseState: PoseOverride | null = null;
  private lift = 0;

  get locked() {
    return this.grasp !== null || this.collapse !== null;
  }

  get flying() {
    return this.collapse !== null;
  }

  get opacity() {
    return this.veil > 0 ? 0.12 : 1;
  }

  get airY() {
    return this.lift;
  }

  get pose() {
    return this.poseState;
  }

  get glow() {
    if (this.collapse) return 0.9;
    if (this.grasp) return 0.55;
    if (this.veil > 0) return 0.35;
    return 0;
  }

  get resonance() {
    return this.meter;
  }

  get moveScale() {
    return 1;
  }

  attach(ctx: KitContext) {
    this.ctx = ctx;
    this.hands = [0, 1].map((side) => {
      const hand = new THREE.Mesh(
        new THREE.SphereGeometry(0.34, 10, 8),
        new THREE.MeshBasicMaterial({ color: side === 0 ? VIOLET : CYAN, transparent: true, opacity: 0.42, depthWrite: false }),
      );
      hand.visible = false;
      hand.scale.set(1.4, 0.85, 0.7);
      ctx.scene.add(hand);
      return hand;
    });
    this.cracks = [0, 1].map(() => {
      const crack = new THREE.Mesh(
        new THREE.RingGeometry(0.15, 0.55, 5),
        new THREE.MeshBasicMaterial({ color: WHITE, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
      );
      crack.visible = false;
      ctx.scene.add(crack);
      return crack;
    });
    this.fragments = Array.from({ length: 5 }, (_, i) => {
      const bit = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.08, 0),
        new THREE.MeshBasicMaterial({ color: i % 2 ? CYAN : VIOLET, transparent: true, opacity: 0.85, depthWrite: false }),
      );
      ctx.scene.add(bit);
      return bit;
    });
    const fighter = ctx.fighter();
    const parent = fighter?.humanoid.handR ?? fighter?.humanoid.group;
    if (parent) {
      this.baton = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.72, 0.08),
        new THREE.MeshBasicMaterial({ color: WHITE, transparent: true, opacity: 0.9 }),
      );
      this.baton.position.set(0, -0.35, 0.08);
      this.baton.visible = false;
      parent.add(this.baton);
      this.fist = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 8, 6),
        new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.55, depthWrite: false }),
      );
      this.fist.visible = false;
      parent.add(this.fist);
    }
    this.fx = new AirJumpFx(ctx.scene);
    this.veil = 0;
  }

  detach() {
    this.interrupt();
    this.hands.forEach((mesh) => {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    });
    this.cracks.forEach((mesh) => {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    });
    this.fragments.forEach((mesh) => {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    });
    this.hands = [];
    this.cracks = [];
    this.fragments = [];
    this.baton = null;
    this.fist = null;
    this.fx?.clear();
    this.fx = null;
    this.veil = 0;
    this.ctx = null;
  }

  tryAbility(id: AbilityId) {
    if (!this.ctx || this.locked) return false;
    if (id === 'phantomGrasp') {
      this.startGrasp();
      return true;
    }
    if (id === 'paranormalProjection') {
      if (this.projections.length) {
        this.swapProjection();
        this.ctx.gainAura(this.cost('paranormalProjection'));
        return true;
      }
      this.summonProjections();
      return true;
    }
    if (id === 'dimensionalCollapse') {
      this.startCollapse();
      return true;
    }
    return false;
  }

  tryAirJump(sinceJump: number, _height = 0) {
    const ctx = this.ctx;
    if (!ctx || this.locked || sinceJump > 0.9) return false;
    const jitter = (Math.random() - 0.5) * 0.7;
    const from = leapAhead(ctx, 6.5, jitter);
    if (!from) return false;
    const depart = chestPoint(ctx, from.x, from.z, this.chest).clone();
    depart.y = ctx.heightAt(from.x, from.z);
    const arrive = chestPoint(ctx, ctx.pos.x, ctx.pos.z, this.chest).clone();
    arrive.y = ctx.heightAt(ctx.pos.x, ctx.pos.z);
    this.fx?.goo(depart);
    this.fx?.goo(arrive);
    ctx.particles.emit(depart.clone().setY(depart.y + 0.8), VIOLET, 12, { speed: 4, size: 0.32, life: 0.4, spread: 0.8, up: 1.2, gravity: 8 });
    ctx.particles.emit(arrive.clone().setY(arrive.y + 0.6), CYAN, 10, { speed: 3.5, size: 0.28, life: 0.36, spread: 0.7, up: 0.8, gravity: 8 });
    this.veil = 0.18;
    ctx.iframes(0.16);
    ctx.sound('kid.goo.impact');
    ctx.camera.addShake(0.12);
    return true;
  }

  melee(): MeleeStep | null {
    if (this.locked) return null;
    const close = this.nearest(1.75);
    if (close) {
      this.batonT = 0;
      return {
        style: 'smash',
        damageMul: 1.08,
        hitDelay: 0.16,
        range: 2.15,
        halfArc: 0.95,
        reaction: 'launch',
        strength: 1.15,
        recovery: 0.5,
        shake: 0.22,
        hitStop: 0.06,
        lunge: 0.4,
        sound: 'kid.throw',
      };
    }
    this.batonT = 0.34;
    return {
      style: 'slash',
      damageMul: 1.02,
      hitDelay: 0.14,
      range: 2.25,
      halfArc: 1.05,
      reaction: 'knockback',
      strength: 0.9,
      recovery: 0.42,
      shake: 0.12,
      hitStop: 0.04,
      lunge: 0.22,
      sound: 'kid.baton',
    };
  }

  onStrike(style: MeleeStyle) {
    if (style === 'punch' || style === 'punchR') {
      this.fistT = 0.22;
      this.ctx?.sound('kid.punch');
      this.ctx?.afterimages.spawn(0.12, 0.18);
    } else if (style === 'kick' || style === 'spinKick') {
      this.ctx?.sound('kid.kick');
      this.ctx?.afterimages.spawn(0.28, 0.45);
    }
  }

  noteHit() {
    if (this.meter >= RESONANCE_MAX) return;
    this.meter = Math.min(RESONANCE_MAX, this.meter + RESONANCE_GAIN);
  }

  onRound() {
    this.meter = 0;
  }

  airStrike(kind: 'punch' | 'kick' | 'melee') {
    this.onStrike(kind === 'punch' ? 'punch' : kind === 'kick' ? 'spinKick' : 'slash');
    if (kind === 'melee') this.batonT = 0.28;
  }

  update(frame: KitFrame) {
    const ctx = this.ctx;
    if (!ctx) return;
    this.stepGrasp(frame.dt);
    this.stepCollapse(frame.dt);
    this.stepProjections(frame.dt);
    if (this.veil > 0) this.veil = Math.max(0, this.veil - frame.dt);
    this.fx?.step(frame.dt);
    if (!this.collapse) this.lift = this.grasp ? 0 : 0;
    this.batonT = Math.max(0, this.batonT - frame.dt);
    this.fistT = Math.max(0, this.fistT - frame.dt);
    if (this.baton) this.baton.visible = this.batonT > 0;
    if (this.fist) this.fist.visible = this.fistT > 0;
    this.waveCape(frame.time);
    this.orbitFragments(frame);
  }

  interrupt() {
    this.releaseGrasp();
    this.releaseCollapse();
    this.clearProjections();
    this.veil = 0;
    this.fx?.clear();
    this.lift = 0;
    this.poseState = null;
    this.batonT = 0;
    this.fistT = 0;
    if (this.baton) this.baton.visible = false;
    if (this.fist) this.fist.visible = false;
  }

  private cost(id: AbilityId) {
    return this.ctx?.spec.moves.find((move) => move.id === id)?.auraCost ?? 0;
  }

  private takeCharge() {
    if (this.meter < RESONANCE_MAX) return false;
    this.meter = 0;
    return true;
  }

  private nearest(range: number) {
    const ctx = this.ctx;
    if (!ctx) return null;
    let best: KitTarget | null = null;
    let bestD = range * range;
    for (const target of living(ctx.targets())) {
      const d = (target.pos.x - ctx.pos.x) ** 2 + (target.pos.z - ctx.pos.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = target;
      }
    }
    return best;
  }

  private inFront(targets: KitTarget[], range: number, limit: number) {
    const ctx = this.ctx;
    if (!ctx) return [];
    const yaw = ctx.yaw();
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    return living(targets)
      .map((target) => {
        const dx = target.pos.x - ctx.pos.x;
        const dz = target.pos.z - ctx.pos.z;
        const dist = Math.hypot(dx, dz);
        const ahead = dx * fx + dz * fz;
        return { target, dist, ahead };
      })
      .filter((hit) => hit.dist <= range && hit.ahead > -0.4)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, limit)
      .map((hit) => hit.target);
  }

  private startGrasp() {
    const ctx = this.ctx;
    if (!ctx) return;
    const charged = this.takeCharge();
    const targets = this.inFront(living(ctx.targets()), GRASP_RANGE, charged ? 2 : 1);
    this.grasp = { phase: 'raise', t: 0, targets, charged };
    this.poseState = { kind: 'cast', t: 0, weight: 1 };
    ctx.sound('kid.grasp.start');
    ctx.power.boost(1.1);
  }

  private stepGrasp(dt: number) {
    const seq = this.grasp;
    const ctx = this.ctx;
    if (!seq || !ctx) return;
    seq.t += dt;
    seq.targets = seq.targets.filter((target) => target.hp > 0 && ctx.targets().includes(target));
    const phaseTime = seq.phase === 'raise' ? 0.32 : seq.phase === 'crack' ? 0.28 : seq.phase === 'seize' ? 0.22 : seq.phase === 'lift' ? 0.48 : 0.28;
    if (seq.phase === 'raise') this.poseState = { kind: 'cast', t: Math.min(1, seq.t / phaseTime), weight: 1 };
    if (seq.phase === 'crack' || seq.phase === 'seize') this.placeCracks(seq);
    if (seq.phase === 'lift' || seq.phase === 'slam') this.placeHands(seq, seq.phase === 'slam');
    if (seq.t < phaseTime) return;
    seq.t = 0;
    if (seq.phase === 'raise') seq.phase = 'crack';
    else if (seq.phase === 'crack') {
      if (!seq.targets.length) {
        this.finishGrasp(false);
        return;
      }
      seq.phase = 'seize';
      ctx.sound('kid.grasp.seize');
    } else if (seq.phase === 'seize') {
      seq.phase = 'lift';
      for (const target of seq.targets) this.hold(target, 0.7);
    } else if (seq.phase === 'lift') {
      seq.phase = 'slam';
      ctx.hitStop(0.05);
    } else this.finishGrasp(true);
  }

  private hold(target: KitTarget, seconds: number) {
    const scale = 1 - resist(target);
    target.held = Math.max(target.held, seconds * scale);
    target.knock.set(0, 0, 0);
    target.airY = 0;
    target.airVel = 0;
    target.stagger = 0;
  }

  private placeCracks(seq: Grasp) {
    const ctx = this.ctx;
    if (!ctx) return;
    const spots = seq.targets.length ? seq.targets : [null, null];
    this.cracks.forEach((crack, i) => {
      const target = spots[i];
      crack.visible = true;
      if (target) crack.position.set(target.pos.x, ctx.heightAt(target.pos.x, target.pos.z) + 0.08, target.pos.z);
      else {
        const yaw = ctx.yaw() + (i === 0 ? -0.5 : 0.5);
        crack.position.set(ctx.pos.x + Math.sin(yaw) * 2.2, ctx.heightAt(ctx.pos.x, ctx.pos.z) + 0.08, ctx.pos.z + Math.cos(yaw) * 2.2);
      }
      crack.rotation.x = -Math.PI / 2;
      crack.scale.setScalar(1 + seq.t * 2);
    });
  }

  private placeHands(seq: Grasp, slam: boolean) {
    const ctx = this.ctx;
    if (!ctx) return;
    seq.targets.forEach((target, i) => {
      const hand = this.hands[i];
      if (!hand) return;
      this.hold(target, 0.35);
      const ground = ctx.heightAt(target.pos.x, target.pos.z);
      const height = slam ? ground + 0.4 : ground + 2.1 * (1 - resist(target));
      hand.visible = true;
      hand.position.set(target.pos.x, height, target.pos.z);
      target.sink = slam ? 0 : -1.6 * (1 - resist(target));
      target.pos.x = hand.position.x;
      target.pos.z = hand.position.z;
    });
  }

  private finishGrasp(landed: boolean) {
    const ctx = this.ctx;
    const seq = this.grasp;
    if (!ctx || !seq) return;
    if (landed) {
      for (const target of seq.targets) {
        if (target.hp <= 0) continue;
        _dir.set(target.pos.x - ctx.pos.x, 0, target.pos.z - ctx.pos.z);
        if (_dir.lengthSq() < 1e-4) _dir.set(Math.sin(ctx.yaw()), 0, Math.cos(ctx.yaw()));
        _dir.normalize();
        target.held = 0;
        target.sink = 0;
        const scale = 1 - resist(target) * 0.5;
        ctx.hurt(target, 26 * scale, _dir, 'slam', 1.1 * scale);
      }
      for (const target of living(ctx.targets())) {
        if (seq.targets.includes(target)) continue;
        const dist = Math.hypot(target.pos.x - ctx.pos.x, target.pos.z - ctx.pos.z);
        if (dist > SHOCK_RANGE) continue;
        _dir.set(target.pos.x - ctx.pos.x, 0, target.pos.z - ctx.pos.z).normalize();
        ctx.hurt(target, 12, _dir, 'knockback', 0.8);
      }
      _v.set(ctx.pos.x, ctx.heightAt(ctx.pos.x, ctx.pos.z) + 0.05, ctx.pos.z);
      ctx.rings.spawn(_v, CYAN, { radius: SHOCK_RANGE, duration: 0.35 });
      ctx.particles.emit(_v, VIOLET, 16, { speed: 6, size: 0.22, life: 0.35, up: 1.2 });
      ctx.sound('kid.grasp.slam');
      ctx.camera.addShake(0.28);
    }
    this.releaseGrasp();
  }

  private releaseGrasp() {
    this.grasp?.targets.forEach((target) => {
      target.held = 0;
      target.sink = 0;
    });
    this.hands.forEach((hand) => {
      hand.visible = false;
    });
    this.cracks.forEach((crack) => {
      crack.visible = false;
    });
    this.grasp = null;
    if (!this.collapse) this.poseState = null;
  }

  private summonProjections() {
    const ctx = this.ctx;
    if (!ctx) return;
    const charged = this.takeCharge();
    const roles: Projection['role'][] = charged ? ['attack', 'attack', 'attack', 'decoy'] : ['attack', 'attack', 'decoy'];
    roles.forEach((role, i) => {
      const yaw = ctx.yaw() + (i - 1) * 0.7;
      const mesh = this.projectionMesh();
      ctx.scene.add(mesh);
      this.projections.push({
        mesh,
        role,
        x: ctx.pos.x + Math.sin(yaw) * 1.4,
        z: ctx.pos.z + Math.cos(yaw) * 1.4,
        hitCd: 0.3,
        life: PROJECTION_LIFE,
      });
    });
    ctx.sound('kid.projection.summon');
    ctx.power.boost(0.8);
  }

  private projectionMesh() {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      color: VIOLET,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      wireframe: false,
    });
    const edge = new THREE.MeshBasicMaterial({ color: CYAN, wireframe: true, transparent: true, opacity: 0.85 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.7, 4, 6), mat);
    body.position.y = 0.9;
    const shell = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.74, 4, 6), edge);
    shell.position.y = 0.9;
    group.add(body, shell);
    return group;
  }

  private stepProjections(dt: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const targets = living(ctx.targets());
    this.projections = this.projections.filter((proj) => {
      proj.life -= dt;
      proj.hitCd = Math.max(0, proj.hitCd - dt);
      if (proj.life <= 0) {
        this.disposeProjection(proj);
        return false;
      }
      if (proj.role === 'decoy') {
        const yaw = ctx.yaw() + Math.PI / 2;
        proj.x += (ctx.pos.x + Math.sin(yaw) * 2.2 - proj.x) * Math.min(1, dt * 3);
        proj.z += (ctx.pos.z + Math.cos(yaw) * 2.2 - proj.z) * Math.min(1, dt * 3);
      } else {
        const target = targets.reduce<KitTarget | null>((best, next) => {
          if (!best) return next;
          const bd = (best.pos.x - proj.x) ** 2 + (best.pos.z - proj.z) ** 2;
          const nd = (next.pos.x - proj.x) ** 2 + (next.pos.z - proj.z) ** 2;
          return nd < bd ? next : best;
        }, null);
        if (target) {
          const dx = target.pos.x - proj.x;
          const dz = target.pos.z - proj.z;
          const dist = Math.hypot(dx, dz) || 1;
          const step = 4.6 * dt;
          let nx = proj.x + (dx / dist) * step;
          let nz = proj.z + (dz / dist) * step;
          if (ctx.blocked(nx, nz, 0.34)) {
            nx = proj.x + (dz / dist) * step;
            nz = proj.z - (dx / dist) * step;
            if (ctx.blocked(nx, nz, 0.34)) {
              nx = proj.x;
              nz = proj.z;
            }
          }
          proj.x = nx;
          proj.z = nz;
          if (dist < 1.35 && proj.hitCd <= 0 && target.hp > 0) {
            _dir.set(dx, 0, dz).normalize();
            ctx.hurt(target, 8, _dir, 'stagger', 0.45);
            ctx.sound('kid.projection.hit');
            proj.hitCd = 0.72;
          }
        }
      }
      const y = ctx.heightAt(proj.x, proj.z);
      proj.mesh.position.set(proj.x, y, proj.z);
      return true;
    });
  }

  private swapProjection() {
    const ctx = this.ctx;
    if (!ctx || !this.projections.length) return false;
    const proj = this.projections.reduce((best, next) => {
      const bd = (best.x - ctx.pos.x) ** 2 + (best.z - ctx.pos.z) ** 2;
      const nd = (next.x - ctx.pos.x) ** 2 + (next.z - ctx.pos.z) ** 2;
      return nd < bd ? next : best;
    });
    if (ctx.blocked(proj.x, proj.z, ctx.radius)) {
      ctx.sound('kid.projection.blocked');
      return false;
    }
    const oldX = ctx.pos.x;
    const oldZ = ctx.pos.z;
    ctx.pos.x = proj.x;
    ctx.pos.z = proj.z;
    ctx.resolve(ctx.pos);
    if (ctx.blocked(ctx.pos.x, ctx.pos.z, ctx.radius * 0.6)) {
      ctx.pos.x = oldX;
      ctx.pos.z = oldZ;
      ctx.sound('kid.projection.blocked');
      return false;
    }
    proj.x = oldX;
    proj.z = oldZ;
    _v.set(ctx.pos.x, ctx.heightAt(ctx.pos.x, ctx.pos.z) + 0.05, ctx.pos.z);
    ctx.rings.spawn(_v, VIOLET, { radius: 1.4, duration: 0.25 });
    ctx.sound('kid.projection.swap');
    return true;
  }

  private clearProjections() {
    this.projections.forEach((proj) => this.disposeProjection(proj));
    this.projections = [];
  }

  private disposeProjection(proj: Projection) {
    proj.mesh.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    proj.mesh.removeFromParent();
  }

  private startCollapse() {
    const ctx = this.ctx;
    if (!ctx) return;
    const charged = this.takeCharge();
    const radius = charged ? COLLAPSE_RANGE_CHARGED : COLLAPSE_RANGE;
    const mesh = new THREE.Group();
    const shell = new THREE.Mesh(
      new THREE.OctahedronGeometry(radius * 0.55, 1),
      new THREE.MeshBasicMaterial({ color: CYAN, wireframe: true, transparent: true, opacity: 0.75 }),
    );
    const fill = new THREE.Mesh(
      new THREE.IcosahedronGeometry(radius * 0.42, 0),
      new THREE.MeshBasicMaterial({ color: VIOLET, transparent: true, opacity: 0.12, depthWrite: false }),
    );
    mesh.add(shell, fill);
    ctx.scene.add(mesh);
    this.collapse = {
      phase: 'rise',
      t: 0,
      targets: [],
      radius,
      mesh,
      charged,
    };
    this.lift = 0.4;
    ctx.sound('kid.collapse.start');
    ctx.power.boost(1.4);
  }

  private stepCollapse(dt: number) {
    const seq = this.collapse;
    const ctx = this.ctx;
    if (!seq || !ctx) return;
    seq.t += dt;
    const yaw = ctx.yaw();
    const cx = ctx.pos.x + Math.sin(yaw) * 2.2;
    const cz = ctx.pos.z + Math.cos(yaw) * 2.2;
    const ground = ctx.heightAt(cx, cz);
    const phaseTime = seq.phase === 'rise' ? 0.35 : seq.phase === 'form' ? 0.4 : seq.phase === 'hold' ? 0.5 : seq.phase === 'fold' ? 0.32 : 0.2;
    const fold = seq.phase === 'fold' ? Math.min(1, seq.t / phaseTime) : seq.phase === 'burst' ? 1 : 0;
    seq.mesh.position.set(cx, ground + 1.6, cz);
    seq.mesh.scale.setScalar(Math.max(0.12, 1 - fold * 0.88));
    seq.mesh.rotation.y += dt * (1.2 + fold * 4);
    this.poseState = { kind: 'hover', t: Math.min(1, seq.t / 0.35), weight: 1, lean: 0.1 };
    this.lift = 1.15;
    if (seq.phase === 'form' && seq.targets.length === 0) {
      seq.targets = living(ctx.targets()).filter((target) => Math.hypot(target.pos.x - cx, target.pos.z - cz) <= seq.radius);
    }
    if (seq.phase === 'hold' || seq.phase === 'fold') {
      for (const target of seq.targets) {
        if (target.hp <= 0) continue;
        this.hold(target, 0.3);
        target.sink = -1.3 * (1 - fold);
        target.pos.x += (cx - target.pos.x) * Math.min(1, dt * 2.2);
        target.pos.z += (cz - target.pos.z) * Math.min(1, dt * 2.2);
      }
    }
    if (seq.t < phaseTime) return;
    seq.t = 0;
    if (seq.phase === 'rise') seq.phase = 'form';
    else if (seq.phase === 'form') seq.phase = 'hold';
    else if (seq.phase === 'hold') seq.phase = 'fold';
    else if (seq.phase === 'fold') seq.phase = 'burst';
    else this.finishCollapse(cx, cz, ground);
  }

  private finishCollapse(x: number, z: number, ground: number) {
    const ctx = this.ctx;
    const seq = this.collapse;
    if (!ctx || !seq) return;
    for (const target of seq.targets) {
      if (target.hp <= 0) continue;
      target.held = 0;
      target.sink = 0;
      _dir.set(target.pos.x - x, 0, target.pos.z - z);
      if (_dir.lengthSq() < 1e-4) _dir.set(1, 0, 0);
      _dir.normalize();
      const reaction: HitReaction = 'heavy';
      ctx.hurt(target, seq.charged ? 40 : 34, _dir, reaction, 1);
    }
    _v.set(x, ground + 0.2, z);
    ctx.rings.spawn(_v, WHITE, { radius: seq.radius, duration: 0.4 });
    ctx.particles.emit(_v, CYAN, 18, { speed: 7, size: 0.24, life: 0.4, up: 1.4 });
    ctx.camera.addShake(0.34);
    ctx.hitStop(0.07);
    ctx.sound('kid.collapse.burst');
    this.releaseCollapse();
  }

  private releaseCollapse() {
    this.collapse?.targets.forEach((target) => {
      target.held = 0;
      target.sink = 0;
    });
    if (this.collapse) {
      this.collapse.mesh.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) mesh.geometry.dispose();
      });
      this.collapse.mesh.removeFromParent();
    }
    this.collapse = null;
    if (!this.grasp) this.poseState = null;
    this.lift = 0;
  }

  private waveCape(time: number) {
    const group = this.ctx?.fighter()?.humanoid.group;
    const cape = group?.getObjectByName('PadCape');
    if (!cape) return;
    const flap = this.collapse ? 0.45 : 0.18;
    cape.rotation.x = -0.15 + Math.sin(time * (this.collapse ? 7 : 2.4)) * flap;
  }

  private orbitFragments(frame: KitFrame) {
    const ctx = this.ctx;
    if (!ctx) return;
    const on = (frame.aura ?? 0) > 6 && !frame.burnout;
    this.fragments.forEach((bit, i) => {
      bit.visible = on;
      if (!on) return;
      const a = frame.time * 1.3 + i * 1.25;
      const r = 0.7 + (i % 2) * 0.25;
      bit.position.set(ctx.pos.x + Math.cos(a) * r, ctx.heightAt(ctx.pos.x, ctx.pos.z) + 1.2 + Math.sin(a * 1.4) * 0.2, ctx.pos.z + Math.sin(a) * r);
    });
  }
}
