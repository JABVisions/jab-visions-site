import * as THREE from 'three';

/**
 * Sparkle aura for Those Boomers. One point cloud, parented to the fighter,
 * so the motes follow jumps, sprints, and teleports without a mesh per spark.
 * Ryderz keep their electrical aura; this system is not lightning.
 */

export type BoomerQuality = 'low' | 'medium' | 'high';

const COUNTS: Record<BoomerQuality, number> = { low: 72, medium: 160, high: 280 };

let quality: BoomerQuality = 'medium';

export function setBoomerQuality(next: BoomerQuality) {
  quality = next;
}

export function boomerQuality() {
  return quality;
}

export interface BoomerPalette {
  primary: number;
  secondary: number;
  highlight: number;
}

export class BoomerAuraSystem {
  readonly points: THREE.Points;
  private positions: Float32Array;
  private colors: Float32Array;
  private phases: Float32Array;
  private radii: Float32Array;
  private heights: Float32Array;
  private speeds: Float32Array;
  private count: number;
  private charge = 1;
  private flare = 0;
  private time = 0;

  constructor(palette: BoomerPalette, count = COUNTS[quality]) {
    this.count = count;
    this.positions = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 3);
    this.phases = new Float32Array(count);
    this.radii = new Float32Array(count);
    this.heights = new Float32Array(count);
    this.speeds = new Float32Array(count);
    const primary = new THREE.Color(palette.primary);
    const secondary = new THREE.Color(palette.secondary);
    const highlight = new THREE.Color(palette.highlight);
    for (let i = 0; i < count; i += 1) {
      this.phases[i] = Math.random() * Math.PI * 2;
      this.radii[i] = 0.35 + Math.random() * 0.55;
      this.heights[i] = Math.random() * 1.9;
      this.speeds[i] = 0.7 + Math.random() * 1.4;
      const pick = Math.random();
      const color = pick > 0.82 ? highlight : pick > 0.4 ? secondary : primary;
      this.colors[i * 3] = color.r;
      this.colors[i * 3 + 1] = color.g;
      this.colors[i * 3 + 2] = color.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.045,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.name = 'boomer-aura';
  }

  attach(parent: THREE.Object3D) {
    parent.add(this.points);
  }

  /** 0 hides the aura when power is gone. Values above 1 cluster it for a special. */
  setCharge(charge: number, flare = 0) {
    this.charge = Math.max(0, charge);
    this.flare = Math.max(this.flare, flare);
  }

  update(dt: number, moving: boolean) {
    this.time += dt;
    this.flare = Math.max(0, this.flare - dt * 0.8);
    const rush = moving ? 1.65 : 1;
    const spread = 0.55 + this.charge * 0.45 + this.flare * 0.35;
    for (let i = 0; i < this.count; i += 1) {
      const climb = this.heights[i] + this.time * this.speeds[i] * 0.35 * rush;
      const y = (climb % 1.95) + 0.05;
      const spin = this.phases[i] + this.time * this.speeds[i] * rush * (1 + this.flare);
      const radius = this.radii[i] * spread * (0.75 + 0.25 * Math.sin(spin * 0.5));
      const i3 = i * 3;
      this.positions[i3] = Math.cos(spin) * radius;
      this.positions[i3 + 1] = y;
      this.positions[i3 + 2] = Math.sin(spin) * radius * 0.72 - (moving ? 0.25 : 0);
    }
    const position = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    position.needsUpdate = true;
    const material = this.points.material as THREE.PointsMaterial;
    material.opacity = Math.max(0.05, Math.min(1, this.charge));
    material.size = 0.04 + this.flare * 0.03;
  }

  dispose() {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
