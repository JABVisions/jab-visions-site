import * as THREE from 'three';
import type { ParticleSystem } from './particles';
import { ArcPool, type Anchor } from './power-vfx';
import { addOutline, glow, toon } from './toon';

/**
 * Ryder Beacon: the one recovery point in an arena. A holographic ring on a
 * low platform with orbiting energy rings and symbols, a soft light column and
 * electricity crawling around the core. Activation restores the Ryder (the
 * engine owns the health/aura numbers) and puts the Beacon on a cooldown
 * during which it stays visible but dims.
 *
 * The visual tints toward the active Ryder's colour while they stand on it or
 * are being recharged, and shows a neutral signal-white otherwise.
 */

export const BEACON_BASE_COLOR = 0x3fd2ff;
/** Seconds the recharge sequence plays before the Beacon reports it is done. */
export const BEACON_RECHARGE_DURATION = 1.15;

export interface RyderBeaconOptions {
  cooldownDuration: number;
  interactionRadius?: number;
}

export interface BeaconHudState {
  near: boolean;
  ready: boolean;
  cooldownLeft: number;
  cooldownDuration: number;
  /** True while the recharge sequence is playing on the player. */
  recharging: boolean;
}

interface Symbol {
  mesh: THREE.Mesh;
  radius: number;
  speed: number;
  phase: number;
  height: number;
}

const BEAM_GEOMETRY = new THREE.CylinderGeometry(0.42, 0.62, 7.5, 20, 1, true);
const RING_FLAT_GEOMETRY = new THREE.RingGeometry(1.25, 1.62, 48);
const RING_INNER_GEOMETRY = new THREE.RingGeometry(0.42, 0.52, 40);
const TORUS_GEOMETRY = new THREE.TorusGeometry(1.08, 0.035, 8, 48);
const TORUS_SMALL_GEOMETRY = new THREE.TorusGeometry(0.78, 0.03, 8, 40);
const SYMBOL_GEOMETRY = new THREE.OctahedronGeometry(0.16, 0);
const CORE_GEOMETRY = new THREE.IcosahedronGeometry(0.22, 1);

let beamAlphaMap: THREE.Texture | null = null;
function getBeamAlphaMap() {
  if (beamAlphaMap) return beamAlphaMap;
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    grad.addColorStop(0.9, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0.6)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 2, 128);
  }
  beamAlphaMap = new THREE.CanvasTexture(canvas);
  return beamAlphaMap;
}

const _v = new THREE.Vector3();
const _target = new THREE.Vector3();
const _color = new THREE.Color();
const _base = new THREE.Color(BEACON_BASE_COLOR);

export class RyderBeacon {
  readonly group = new THREE.Group();
  readonly position = new THREE.Vector3();
  cooldownDuration: number;
  interactionRadius: number;
  /** Clock time of the last successful activation; -Infinity when never used. */
  lastActivationTime = -Infinity;

  private arcs: ArcPool;
  private ringMat: THREE.MeshBasicMaterial;
  private innerMat: THREE.MeshBasicMaterial;
  private torusMat: THREE.MeshBasicMaterial;
  private symbolMat: THREE.MeshBasicMaterial;
  private coreMat: THREE.MeshBasicMaterial;
  private beamMat: THREE.MeshBasicMaterial;
  private torusA: THREE.Mesh;
  private torusB: THREE.Mesh;
  private ringFlat: THREE.Mesh;
  private core: THREE.Mesh;
  private symbols: Symbol[] = [];
  private tint = new THREE.Color(BEACON_BASE_COLOR);
  private tintTarget = new THREE.Color(BEACON_BASE_COLOR);
  private glowLevel = 1;
  private pulse = 0;
  private nextArc = 0;
  private rechargeT = 0;
  private rechargeTarget: Anchor | THREE.Vector3 | null = null;
  private rechargeColor = new THREE.Color(BEACON_BASE_COLOR);
  private readyFlash = 0;
  private wasReady = true;
  private lastKnownTime = 0;
  private light: THREE.PointLight;
  private particles: ParticleSystem;

  constructor(position: THREE.Vector3, particles: ParticleSystem, options: RyderBeaconOptions) {
    this.particles = particles;
    this.cooldownDuration = options.cooldownDuration;
    this.interactionRadius = options.interactionRadius ?? 2.3;
    this.position.copy(position);
    this.group.position.copy(position);
    this.group.name = 'RyderBeacon';

    const additive = (color: THREE.ColorRepresentation, opacity: number) =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      });

    // Low platform the ring sits in.
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.95, 0.16, 36), toon(0x2a2540));
    platform.position.y = 0.08;
    addOutline(platform, 0.05);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.07, 8, 48), toon(0x443c66));
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 0.16;
    this.group.add(platform, lip);

    this.ringMat = additive(BEACON_BASE_COLOR, 0.65);
    this.ringFlat = new THREE.Mesh(RING_FLAT_GEOMETRY, this.ringMat);
    this.ringFlat.rotation.x = -Math.PI / 2;
    this.ringFlat.position.y = 0.175;
    this.innerMat = additive(BEACON_BASE_COLOR, 0.8);
    const inner = new THREE.Mesh(RING_INNER_GEOMETRY, this.innerMat);
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.18;
    this.group.add(this.ringFlat, inner);

    this.torusMat = additive(BEACON_BASE_COLOR, 0.9);
    this.torusMat.side = THREE.FrontSide;
    this.torusA = new THREE.Mesh(TORUS_GEOMETRY, this.torusMat);
    this.torusA.position.y = 1.25;
    this.torusB = new THREE.Mesh(TORUS_SMALL_GEOMETRY, this.torusMat);
    this.torusB.position.y = 1.25;
    this.group.add(this.torusA, this.torusB);

    this.coreMat = glow(BEACON_BASE_COLOR, 1.3);
    this.core = new THREE.Mesh(CORE_GEOMETRY, this.coreMat);
    this.core.position.y = 1.25;
    this.group.add(this.core);

    this.symbolMat = glow(BEACON_BASE_COLOR, 1.1);
    for (let i = 0; i < 4; i += 1) {
      const mesh = new THREE.Mesh(SYMBOL_GEOMETRY, this.symbolMat);
      this.group.add(mesh);
      this.symbols.push({
        mesh,
        radius: 0.95 + (i % 2) * 0.25,
        speed: 0.9 + i * 0.18,
        phase: (i / 4) * Math.PI * 2,
        height: 1.7 + (i % 2) * 0.35,
      });
    }

    this.beamMat = additive(BEACON_BASE_COLOR, 0.16);
    this.beamMat.alphaMap = getBeamAlphaMap();
    this.beamMat.side = THREE.DoubleSide;
    const beam = new THREE.Mesh(BEAM_GEOMETRY, this.beamMat);
    beam.position.y = 3.75 + 0.15;
    this.group.add(beam);

    this.light = new THREE.PointLight(BEACON_BASE_COLOR, 2.2, 9, 1.6);
    this.light.position.y = 1.4;
    this.group.add(this.light);

    this.arcs = new ArcPool(14);
    this.group.add(this.arcs.mesh);
    // Arcs are generated in world space.
    this.arcs.mesh.position.copy(position).multiplyScalar(-1);
  }

  /** Ready = not cooling down and not mid-sequence, as of the last update tick. */
  get isReady() {
    return this.rechargeT <= 0 && this.cooldownLeftAt(this.lastKnownTime) <= 0;
  }

  cooldownLeftAt(time: number) {
    if (!Number.isFinite(this.lastActivationTime)) return 0;
    return Math.max(0, this.lastActivationTime + this.cooldownDuration - time);
  }

  get isRecharging() {
    return this.rechargeT > 0;
  }

  isPlayerInRange(playerPos: THREE.Vector3) {
    const dx = playerPos.x - this.position.x;
    const dz = playerPos.z - this.position.z;
    return dx * dx + dz * dz <= this.interactionRadius * this.interactionRadius;
  }

  /** Forget any cooldown (new raid). */
  reset() {
    this.lastActivationTime = -Infinity;
    this.rechargeT = 0;
    this.rechargeTarget = null;
    this.arcs.clear();
    this.glowLevel = 1;
    this.wasReady = true;
  }

  /**
   * Start the recharge sequence toward `target` (an anchor on the Ryder, or a
   * point). Returns false when the Beacon is cooling down or already firing.
   */
  activate(time: number, target: Anchor | THREE.Vector3, ryderColor: THREE.ColorRepresentation) {
    if (this.rechargeT > 0 || this.cooldownLeftAt(time) > 0) return false;
    this.lastKnownTime = time;
    this.lastActivationTime = time;
    this.rechargeT = BEACON_RECHARGE_DURATION;
    this.rechargeTarget = target;
    this.rechargeColor.set(ryderColor);
    this.pulse = 1;
    this.wasReady = false;
    _v.copy(this.position).y += 1.25;
    this.particles.emit(_v, ryderColor, 28, { speed: 6, size: 0.3, life: 0.6, up: 1.4, gravity: 3 });
    return true;
  }

  hudState(time: number, playerPos: THREE.Vector3): BeaconHudState {
    const cooldownLeft = this.cooldownLeftAt(time);
    return {
      near: this.isPlayerInRange(playerPos),
      ready: cooldownLeft <= 0 && this.rechargeT <= 0,
      cooldownLeft,
      cooldownDuration: this.cooldownDuration,
      recharging: this.rechargeT > 0,
    };
  }

  update(dt: number, time: number, playerPos: THREE.Vector3, ryderColor: THREE.ColorRepresentation, camera: THREE.Camera) {
    this.lastKnownTime = time;
    const cooldownLeft = this.cooldownLeftAt(time);
    const ready = cooldownLeft <= 0 && this.rechargeT <= 0;
    if (ready && !this.wasReady) {
      // Lights back up: a flash and a ring of sparks so it is noticed from afar.
      this.readyFlash = 1;
      _v.copy(this.position).y += 1.25;
      this.particles.emit(_v, BEACON_BASE_COLOR, 20, { speed: 5, size: 0.26, life: 0.55, up: 1, gravity: 2 });
    }
    this.wasReady = ready;

    const near = this.isPlayerInRange(playerPos);
    const recharging = this.rechargeT > 0;
    if (recharging) {
      this.rechargeT -= dt;
      this.updateRechargeArcs(dt);
    }

    // Tint: Ryder colour while used or stood on, otherwise the neutral signal white.
    this.tintTarget.copy(recharging ? this.rechargeColor : near && ready ? _color.set(ryderColor).lerp(_base, 0.35) : _base);
    this.tint.lerp(this.tintTarget, Math.min(1, dt * 4));

    // Glow: dim while cooling down, climbing back as the cooldown runs out.
    const cooldownFrac = this.cooldownDuration > 0 ? cooldownLeft / this.cooldownDuration : 0;
    const targetGlow = recharging ? 1.6 : ready ? 1 : 0.22 + 0.2 * (1 - cooldownFrac);
    this.glowLevel += (targetGlow - this.glowLevel) * Math.min(1, dt * 3);
    this.pulse = Math.max(0, this.pulse - dt * 1.4);
    this.readyFlash = Math.max(0, this.readyFlash - dt * 1.2);
    const level = this.glowLevel + this.pulse * 0.8 + this.readyFlash * 0.7;
    const breathe = 1 + Math.sin(time * 2.4) * 0.06 * (ready ? 1 : 0.3);

    // Keep multipliers near 1 so the colour stays readable instead of clipping to white.
    const glowMul = Math.min(1.25, 0.55 + level * 0.5);
    this.ringMat.color.copy(this.tint).multiplyScalar(glowMul);
    this.ringMat.opacity = 0.6 * Math.min(1, level);
    this.innerMat.color.copy(this.tint).multiplyScalar(glowMul);
    this.torusMat.color.copy(this.tint).multiplyScalar(glowMul);
    this.torusMat.opacity = 0.8 * Math.min(1, 0.15 + level * 0.85);
    this.coreMat.color.copy(this.tint).multiplyScalar(0.7 + level * 0.6);
    this.symbolMat.color.copy(this.tint).multiplyScalar(0.55 + level * 0.55);
    this.beamMat.color.copy(this.tint).multiplyScalar(glowMul);
    this.beamMat.opacity = 0.14 * Math.min(1.4, level);
    this.light.color.copy(this.tint);
    this.light.intensity = 1 + level * 1.8;

    this.ringFlat.scale.setScalar(breathe);
    this.ringFlat.rotation.z = time * 0.35;
    const spin = ready ? 1 : 0.35;
    this.torusA.rotation.set(Math.PI / 2 + Math.sin(time * 0.7) * 0.35, time * 0.9 * spin, time * 0.4 * spin);
    this.torusB.rotation.set(Math.PI / 2 - Math.sin(time * 0.9) * 0.5, -time * 1.3 * spin, time * 0.6 * spin);
    this.core.rotation.set(time * 0.8, time * 1.1, 0);
    this.core.position.y = 1.25 + Math.sin(time * 1.6) * 0.08;
    for (const symbol of this.symbols) {
      const a = symbol.phase + time * symbol.speed * spin;
      symbol.mesh.position.set(
        Math.cos(a) * symbol.radius,
        symbol.height + Math.sin(time * 1.7 + symbol.phase) * 0.12,
        Math.sin(a) * symbol.radius,
      );
      symbol.mesh.rotation.set(time * 1.4, a, 0);
    }

    // Idle electricity around the core: brisk when ready, a rare flicker when cooling.
    this.nextArc -= dt;
    if (this.nextArc <= 0) {
      const count = ready ? 1 + (Math.random() < 0.4 ? 1 : 0) : Math.random() < 0.5 ? 1 : 0;
      for (let i = 0; i < count; i += 1) this.lightIdleArc(ready ? 1 : 0.45);
      this.nextArc = ready ? 0.2 + Math.random() * 0.4 : 1.2 + Math.random() * 1.6;
    }
    this.arcs.update(dt, camera);
  }

  private lightIdleArc(brightness: number) {
    const a0 = Math.random() * Math.PI * 2;
    const a1 = a0 + 0.8 + Math.random() * 2;
    const fromRing = Math.random() < 0.5;
    const r0 = fromRing ? 1.08 : 0.42;
    // Either ring → ring or ring/platform → core; everything meets at ring height.
    const r1 = Math.random() < 0.5 ? 1.08 : 0.0;
    _v.set(this.position.x + Math.cos(a0) * r0, this.position.y + (fromRing ? 1.25 : 0.2), this.position.z + Math.sin(a0) * r0);
    _target.set(this.position.x + Math.cos(a1) * r1, this.position.y + 1.25, this.position.z + Math.sin(a1) * r1);
    this.arcs.spawn(_v, _target, this.tint, { brightness, life: 0.14 + Math.random() * 0.12, width: 0.035, wobble: 0.18 });
  }

  /** Energy streams from the ring to the Ryder, denser toward the end of the sequence. */
  private updateRechargeArcs(dt: number) {
    const target = this.rechargeTarget;
    if (!target) return;
    const progress = 1 - this.rechargeT / BEACON_RECHARGE_DURATION;
    const want = Math.random() < 0.45 + progress * 0.5 ? 1 : 0;
    for (let i = 0; i < want; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const fromCore = Math.random() < 0.3;
      _v.set(
        this.position.x + (fromCore ? 0 : Math.cos(a) * 1.3),
        this.position.y + (fromCore ? 1.25 : 0.2),
        this.position.z + (fromCore ? 0 : Math.sin(a) * 1.3),
      );
      this.arcs.spawn(_v, target, this.rechargeColor, {
        brightness: 0.85 + progress * 0.3,
        life: 0.16 + Math.random() * 0.12,
        width: 0.045,
        wobble: 0.22,
      });
    }
    if (dt > 0 && Math.random() < 0.5) {
      _v.copy(this.position).y += 0.3;
      this.particles.emit(_v, this.rechargeColor, 2, { speed: 3, size: 0.18, life: 0.4, up: 2.2 });
    }
  }

  dispose() {
    this.arcs.dispose();
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (mesh.geometry !== BEAM_GEOMETRY && mesh.geometry !== RING_FLAT_GEOMETRY && mesh.geometry !== RING_INNER_GEOMETRY &&
          mesh.geometry !== TORUS_GEOMETRY && mesh.geometry !== TORUS_SMALL_GEOMETRY && mesh.geometry !== SYMBOL_GEOMETRY &&
          mesh.geometry !== CORE_GEOMETRY) {
        mesh.geometry.dispose();
      }
    });
    [this.ringMat, this.innerMat, this.torusMat, this.symbolMat, this.coreMat, this.beamMat].forEach((m) => m.dispose());
  }
}
