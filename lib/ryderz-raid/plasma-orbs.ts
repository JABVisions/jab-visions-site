import * as THREE from 'three';
import { TrailRibbon } from './speed-vfx';

/**
 * Zoe's three plasma satellites. One controller owns the meshes, trails and
 * orbit math so abilities can retarget them without duplicating or hiding them.
 *
 * Parent the `group` to the Ryder's figure group (metres, +Y up). `update`
 * runs in that local space so the orbs follow her without world-space lag.
 */

export type OrbMode = 'idle' | 'levitate' | 'cast' | 'blitz';

interface OrbSpec {
  /** Rest orbit height, metres above the figure origin. */
  height: number;
  radius: number;
  /** Radians per second at idle. */
  rate: number;
  phase: number;
  /** Tilt of the orbit plane so the three paths are not the same circle. */
  tiltX: number;
  tiltZ: number;
}

const SPECS: OrbSpec[] = [
  { height: 1.18, radius: 0.58, rate: 2.15, phase: 0.2, tiltX: 0.38, tiltZ: -0.18 },
  { height: 0.82, radius: 0.66, rate: -1.72, phase: 2.3, tiltX: -0.52, tiltZ: 0.28 },
  { height: 0.46, radius: 0.52, rate: 1.38, phase: 4.1, tiltX: 0.85, tiltZ: 0.12 },
];

const CORE_GEO = new THREE.SphereGeometry(0.045, 10, 8);
const SHELL_GEO = new THREE.SphereGeometry(0.09, 12, 10);
const WISP_GEO = new THREE.SphereGeometry(0.028, 8, 6);

const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _e = new THREE.Euler();
const WHITE = new THREE.Color(0xffffff);
const _fallbackCam = new THREE.PerspectiveCamera();
_fallbackCam.position.set(0, 1.2, 4);

interface Orb {
  spec: OrbSpec;
  core: THREE.Mesh;
  shell: THREE.Mesh;
  wisp: THREE.Mesh;
  trail: TrailRibbon;
  local: THREE.Vector3;
  coreMat: THREE.MeshBasicMaterial;
  shellMat: THREE.MeshBasicMaterial;
  wispMat: THREE.MeshBasicMaterial;
}

function plasmaMat(color: THREE.ColorRepresentation, opacity: number) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
}

export class PlasmaOrbits {
  readonly group = new THREE.Group();
  readonly glowMeshes: THREE.Mesh[] = [];
  mode: OrbMode = 'idle';
  /** 0 → 1 from the Ryder's aura. Dims and slows the orbs when empty. */
  power = 1;
  /** Extra rate from sprinting / combat. */
  drive = 1;
  /** Local-space point an orb should dive toward during a cast. */
  castTarget: THREE.Vector3 | null = null;
  private orbs: Orb[] = [];
  private color = new THREE.Color();
  private clock = 0;
  private shellBlend = 0;
  private castBlend = 0;

  constructor(color: THREE.ColorRepresentation) {
    this.group.name = 'PlasmaOrbits';
    this.color.set(color);
    for (const spec of SPECS) {
      const coreMat = plasmaMat(0xdeffff, 0.95);
      const shellMat = plasmaMat(this.color, 0.42);
      const wispMat = plasmaMat(this.color, 0.7);
      const core = new THREE.Mesh(CORE_GEO, coreMat);
      const shell = new THREE.Mesh(SHELL_GEO, shellMat);
      const wisp = new THREE.Mesh(WISP_GEO, wispMat);
      core.renderOrder = 5;
      shell.renderOrder = 4;
      wisp.renderOrder = 5;
      this.group.add(core, shell, wisp);
      const trail = new TrailRibbon(this.color, { life: 0.38, width: 0.11, spacing: 0.08, points: 22 });
      trail.intensity = 0.85;
      this.group.add(trail.mesh);
      this.glowMeshes.push(core, shell, wisp);
      this.orbs.push({ spec, core, shell, wisp, trail, local: new THREE.Vector3(), coreMat, shellMat, wispMat });
    }
    this.setColor(color);
  }

  setColor(color: THREE.ColorRepresentation) {
    this.color.set(color);
    for (const orb of this.orbs) {
      orb.shellMat.color.copy(this.color);
      orb.wispMat.color.copy(this.color).lerp(WHITE, 0.25);
      orb.coreMat.color.copy(this.color).lerp(WHITE, 0.7);
      orb.trail.setColor(this.color);
    }
  }

  worldPos(index: number, out: THREE.Vector3) {
    const orb = this.orbs[index] ?? this.orbs[0];
    return orb.core.getWorldPosition(out);
  }

  update(dt: number, camera?: THREE.Camera) {
    this.clock += dt;
    const wantShell = this.mode === 'levitate' || this.mode === 'blitz' ? 1 : 0;
    this.shellBlend += (wantShell - this.shellBlend) * Math.min(1, dt * 6);
    const wantCast = this.mode === 'cast' && this.castTarget ? 1 : 0;
    this.castBlend += (wantCast - this.castBlend) * Math.min(1, dt * 8);
    const pwr = THREE.MathUtils.clamp(this.power, 0, 1);
    const live = pwr > 0.04;
    this.group.visible = live;
    if (!live) {
      for (const orb of this.orbs) orb.trail.clear();
      return;
    }

    const drive = this.drive * (0.45 + 0.55 * pwr);
    const rateMul = this.mode === 'blitz' ? 2.5 : this.mode === 'levitate' ? 1.85 : this.mode === 'cast' ? 1.35 : 1;
    this.group.visible = true;

    for (let i = 0; i < this.orbs.length; i += 1) {
      const orb = this.orbs[i];
      const spec = orb.spec;
      const a = this.clock * spec.rate * drive * rateMul + spec.phase;
      const radius = spec.radius * (1 - 0.18 * this.shellBlend) + 1.42 * this.shellBlend;
      _p.set(Math.cos(a) * radius, spec.height + Math.sin(a * 1.35 + spec.phase) * 0.07, Math.sin(a) * radius);
      _e.set(spec.tiltX, 0, spec.tiltZ);
      _p.applyEuler(_e);
      // Keep a little clearance from the torso so they don't clip the waist.
      const xz = Math.hypot(_p.x, _p.z);
      if (xz < 0.42) {
        const s = 0.42 / Math.max(1e-4, xz);
        _p.x *= s;
        _p.z *= s;
      }
      if (this.castBlend > 0.01 && this.castTarget) {
        if (i === 0) _p.lerp(this.castTarget, this.castBlend);
        else if (i === 1) _p.lerp(this.castTarget, this.castBlend * 0.45);
      }
      orb.local.copy(_p);
      orb.core.position.copy(_p);
      orb.shell.position.copy(_p);
      const pulse = 1 + 0.12 * Math.sin(this.clock * 9 + spec.phase);
      orb.shell.scale.setScalar(pulse);
      _q.copy(_p);
      _q.x += Math.sin(a * 2.4) * 0.06;
      _q.y += 0.04;
      _q.z += Math.cos(a * 1.7) * 0.06;
      orb.wisp.position.copy(_q);
      orb.coreMat.opacity = 0.55 + 0.4 * pwr;
      orb.shellMat.opacity = (0.18 + 0.28 * pwr) * pulse;
      orb.wispMat.opacity = 0.25 + 0.45 * pwr;
      orb.trail.intensity = 0.4 + 0.7 * pwr * (this.mode === 'idle' ? 0.85 : 1.15);
      orb.core.getWorldPosition(_q);
      orb.trail.feed(_q);
      orb.trail.update(dt, camera ?? _fallbackCam);
    }
  }

  dispose() {
    for (const orb of this.orbs) {
      orb.coreMat.dispose();
      orb.shellMat.dispose();
      orb.wispMat.dispose();
      orb.trail.dispose();
    }
  }
}
