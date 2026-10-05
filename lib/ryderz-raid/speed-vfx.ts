import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Fighter } from './characters';

/**
 * Speed language shared by fast Ryderz: a ribbon trail that follows a point
 * on the body, and pooled afterimages (frozen, fading ghosts of the figure's
 * current pose). Both preallocate everything so sprinting never allocates.
 */

const _side = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _toCam = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _color = new THREE.Color();

const TRAIL_POINTS = 18;

/**
 * Camera-facing ribbon through the last positions fed into it. Width and
 * brightness taper toward the tail; `intensity` scales both so a trail can
 * grow with speed. Stops growing when not fed and fades out on its own.
 */
export class TrailRibbon {
  readonly mesh: THREE.Mesh;
  private geometry: THREE.BufferGeometry;
  private positions: Float32Array;
  private colors: Float32Array;
  private points: THREE.Vector3[] = [];
  private ages: number[] = [];
  private count = 0;
  private color = new THREE.Color();
  private life: number;
  private width: number;
  private minSpacing: number;
  private capacity: number;
  intensity = 1;

  constructor(color: THREE.ColorRepresentation, options: { life?: number; width?: number; spacing?: number; points?: number } = {}) {
    this.color.set(color);
    this.life = options.life ?? 0.28;
    this.width = options.width ?? 0.22;
    this.minSpacing = options.spacing ?? 0.12;
    this.capacity = Math.max(2, options.points ?? TRAIL_POINTS);
    for (let i = 0; i < this.capacity; i += 1) {
      this.points.push(new THREE.Vector3());
      this.ages.push(0);
    }
    const vertices = (this.capacity - 1) * 6;
    this.positions = new Float32Array(vertices * 3);
    this.colors = new Float32Array(vertices * 3);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(
      this.geometry,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.name = 'TrailRibbon';
  }

  setColor(color: THREE.ColorRepresentation) {
    this.color.set(color);
  }

  /** Push the current head position. Call every frame while the trail should grow. */
  feed(pos: THREE.Vector3) {
    if (this.count > 0 && this.points[0].distanceToSquared(pos) < this.minSpacing * this.minSpacing) {
      this.points[0].copy(pos);
      return;
    }
    // Shift down (newest at index 0), dropping the oldest.
    const n = Math.min(this.count + 1, this.capacity);
    for (let i = n - 1; i > 0; i -= 1) {
      this.points[i].copy(this.points[i - 1]);
      this.ages[i] = this.ages[i - 1];
    }
    this.points[0].copy(pos);
    this.ages[0] = 0;
    this.count = n;
  }

  /** Drop every point immediately (teleport / Ryder switch). */
  clear() {
    this.count = 0;
    this.geometry.setDrawRange(0, 0);
  }

  get active() {
    return this.count > 1;
  }

  update(dt: number, camera: THREE.Camera) {
    // Age and expire from the tail.
    let alive = 0;
    for (let i = 0; i < this.count; i += 1) {
      this.ages[i] += dt;
      if (this.ages[i] < this.life) alive = i + 1;
    }
    this.count = alive;
    if (this.count < 2) {
      this.geometry.setDrawRange(0, 0);
      return;
    }
    let vertex = 0;
    for (let i = 0; i < this.count - 1; i += 1) {
      const p0 = this.points[i];
      const p1 = this.points[i + 1];
      _dir.subVectors(p1, p0);
      if (_dir.lengthSq() < 1e-8) continue;
      _toCam.subVectors(camera.position, p0);
      _side.crossVectors(_dir, _toCam).normalize();
      const f0 = 1 - this.ages[i] / this.life;
      const f1 = 1 - this.ages[i + 1] / this.life;
      const w0 = this.width * 0.5 * f0 * this.intensity;
      const w1 = this.width * 0.5 * f1 * this.intensity;
      _a.copy(p0).addScaledVector(_side, w0);
      _b.copy(p0).addScaledVector(_side, -w0);
      vertex = this.write(_a, f0 * f0 * this.intensity, vertex);
      vertex = this.write(_b, f0 * f0 * this.intensity, vertex);
      _a.copy(p1).addScaledVector(_side, w1);
      vertex = this.write(_a, f1 * f1 * this.intensity, vertex);
      vertex = this.write(_b, f0 * f0 * this.intensity, vertex);
      _b.copy(p1).addScaledVector(_side, -w1);
      vertex = this.write(_b, f1 * f1 * this.intensity, vertex);
      vertex = this.write(_a, f1 * f1 * this.intensity, vertex);
    }
    this.geometry.setDrawRange(0, vertex);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }

  private write(p: THREE.Vector3, brightness: number, vertex: number) {
    const o = vertex * 3;
    this.positions[o] = p.x;
    this.positions[o + 1] = p.y;
    this.positions[o + 2] = p.z;
    _color.copy(this.color).multiplyScalar(Math.min(1.2, brightness));
    this.colors[o] = _color.r;
    this.colors[o + 1] = _color.g;
    this.colors[o + 2] = _color.b;
    return vertex + 1;
  }

  dispose() {
    this.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

interface Ghost {
  root: THREE.Object3D;
  nodes: THREE.Object3D[];
  material: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
  peak: number;
  active: boolean;
}

/**
 * Frozen copies of a fighter that fade out: the classic speedster afterimage.
 * Ghosts are cloned once per `bind` (rigged figures via SkeletonUtils so the
 * skin follows its own bone copy); spawning only copies local transforms.
 */
export class AfterimagePool {
  readonly group = new THREE.Group();
  private ghosts: Ghost[] = [];
  private source: THREE.Object3D[] = [];
  private fighter: Fighter | null = null;
  private capacity: number;

  constructor(capacity = 5) {
    this.capacity = capacity;
    this.group.name = 'Afterimages';
  }

  /** Build ghosts for this fighter; replaces any previous set. */
  bind(fighter: Fighter, color: THREE.ColorRepresentation) {
    this.unbind();
    this.fighter = fighter;
    const root = fighter.humanoid.group;
    this.source = [];
    root.traverse((o) => this.source.push(o));
    for (let i = 0; i < this.capacity; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const ghostRoot = cloneSkeleton(root) as THREE.Object3D;
      const nodes: THREE.Object3D[] = [];
      ghostRoot.traverse((o) => {
        nodes.push(o);
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          // Outlines would double the silhouette; everything else wears the ghost tint.
          if (o.name === 'outline') mesh.visible = false;
          else mesh.material = material;
          mesh.castShadow = false;
          mesh.frustumCulled = false;
        }
      });
      ghostRoot.visible = false;
      this.group.add(ghostRoot);
      this.ghosts.push({ root: ghostRoot, nodes, material, life: 0, maxLife: 1, peak: 0.5, active: false });
    }
  }

  unbind() {
    for (const ghost of this.ghosts) {
      this.group.remove(ghost.root);
      ghost.material.dispose();
      ghost.root.traverse((o) => {
        const mesh = o as THREE.SkinnedMesh;
        // Skinned clones own their skeleton copy; geometry stays shared with the source.
        if (mesh.isSkinnedMesh) mesh.skeleton.dispose();
      });
    }
    this.ghosts = [];
    this.source = [];
    this.fighter = null;
  }

  get bound() {
    return this.fighter !== null;
  }

  /** Freeze the fighter's current pose into a ghost. */
  spawn(opacity = 0.45, life = 0.32, color?: THREE.ColorRepresentation) {
    if (!this.fighter || !this.ghosts.length) return;
    const ghost = this.ghosts.find((g) => !g.active) ?? this.ghosts.reduce((a, b) => (a.life < b.life ? a : b));
    const n = Math.min(this.source.length, ghost.nodes.length);
    for (let i = 0; i < n; i += 1) {
      const src = this.source[i];
      const dst = ghost.nodes[i];
      dst.position.copy(src.position);
      dst.quaternion.copy(src.quaternion);
      dst.scale.copy(src.scale);
      if (i > 0 && dst.name !== 'outline') dst.visible = src.visible;
    }
    ghost.root.visible = true;
    ghost.active = true;
    ghost.maxLife = life;
    ghost.life = life;
    ghost.peak = opacity;
    if (color !== undefined) ghost.material.color.set(color);
    ghost.material.opacity = opacity;
  }

  update(dt: number) {
    for (const ghost of this.ghosts) {
      if (!ghost.active) continue;
      ghost.life -= dt;
      if (ghost.life <= 0) {
        ghost.active = false;
        ghost.root.visible = false;
        continue;
      }
      const p = ghost.life / ghost.maxLife;
      ghost.material.opacity = ghost.peak * p * p;
    }
  }

  dispose() {
    this.unbind();
  }
}
