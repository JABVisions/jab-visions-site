import * as THREE from 'three';
import type { KitTarget } from '../ryderz/kit';

/** Timed crowd control stored on the live body. The engine ticks these down. */
export type CrowdBody = KitTarget & {
  kind?: string;
  pacified?: number;
  immobile?: number;
  striker?: { interrupt(): void };
  fighter?: { humanoid: { group: THREE.Object3D } };
};

function resisted(body: CrowdBody, seconds: number) {
  const boss = body.kind === 'heavy' || body.kind === 'broadcaster';
  return seconds * (boss ? 0.5 : 1);
}

export function pacify(target: KitTarget, seconds: number) {
  const body = target as CrowdBody;
  body.pacified = Math.max(body.pacified ?? 0, resisted(body, seconds));
  body.striker?.interrupt();
}

export function immobilize(target: KitTarget, seconds: number) {
  const body = target as CrowdBody;
  body.immobile = Math.max(body.immobile ?? 0, resisted(body, seconds));
  body.striker?.interrupt();
}

export function livingFoes(targets: readonly KitTarget[], canHit?: (target: KitTarget) => boolean) {
  return targets.filter((target) => target.hp > 0 && (canHit ? canHit(target) : true));
}

export function handPoint(group: THREE.Object3D, side: 1 | -1, out: THREE.Vector3) {
  return group.localToWorld(out.set(0.42 * side, 1.25, 0.28));
}

export function projectionFigure(color: number) {
  const group = new THREE.Group();
  group.name = 'showtime-projection';
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
  });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.62, 4, 8), material);
  torso.position.y = 0.85;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), material);
  head.position.y = 1.45;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.08, 0.08), material);
  arm.position.y = 1.15;
  group.add(torso, head, arm);
  return group;
}

export function auraRing(color: number) {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(0.86, 1, 56),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.frustumCulled = false;
  return mesh;
}

export function xrayOverlay(color: number) {
  const group = new THREE.Group();
  group.name = 'dream-vision-scan';
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(0.62, 1.65, 0.36)),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 }),
  );
  edges.position.y = 0.9;
  const scan = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.05),
    new THREE.MeshBasicMaterial({
      color: 0xff5c78,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  scan.position.y = 0.3;
  group.add(edges, scan);
  return { group, scan };
}

export function beamVolume(coreColor: number, edgeColor: number) {
  const group = new THREE.Group();
  group.name = 'proclaim-peace-beam';
  const edge = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.7, 1, 10, 1, true),
    new THREE.MeshBasicMaterial({
      color: edgeColor,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.22, 1, 8, 1, true),
    new THREE.MeshBasicMaterial({
      color: coreColor,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  edge.rotation.x = Math.PI / 2;
  core.rotation.x = Math.PI / 2;
  group.add(edge, core);
  group.frustumCulled = false;
  return group;
}

const RIBBON_STEPS = 28;

export function ribbonMesh(color: number) {
  const positions = new Float32Array(RIBBON_STEPS * 2 * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const indices: number[] = [];
  for (let i = 0; i < RIBBON_STEPS - 1; i += 1) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  geometry.setIndex(indices);
  geometry.setDrawRange(0, 0);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  mesh.frustumCulled = false;
  mesh.name = 'lets-be-bad-ribbon';
  return { mesh, positions };
}

export function writeRibbon(positions: Float32Array, samples: THREE.Vector3[], width: number) {
  const count = Math.min(RIBBON_STEPS, samples.length);
  const side = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < count; i += 1) {
    const next = samples[Math.min(count - 1, i + 1)];
    const prev = samples[Math.max(0, i - 1)];
    forward.subVectors(next, prev);
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, 1);
    side.crossVectors(forward, up).normalize().multiplyScalar(width);
    const point = samples[i];
    const o = i * 6;
    positions[o] = point.x + side.x;
    positions[o + 1] = point.y + side.y;
    positions[o + 2] = point.z + side.z;
    positions[o + 3] = point.x - side.x;
    positions[o + 4] = point.y - side.y;
    positions[o + 5] = point.z - side.z;
  }
  return count * 2;
}

export const BOOMER_GLB = {
  'marilyn-monroe': '/assets/those-ryderz/models/boomers/marilyn-monroe.glb',
  'martin-luther-king': '/assets/those-ryderz/models/boomers/martin-luther-king.glb',
} as const;

const warned = new Set<string>();

export function warnMissingBoomerModel(id: keyof typeof BOOMER_GLB) {
  if (warned.has(id)) return;
  warned.add(id);
  console.warn(
    `[those-boomers] ${id} has no GLB in the repo yet. Expected ${BOOMER_GLB[id]}. Using the procedural figure and ability poses until that file is added.`,
  );
}

/** Reused blue motes. Abracadabra only bursts a slot when that hit actually kills. */
export class FairyDustPool {
  private slots: { points: THREE.Points; life: number; max: number; baseY: number }[] = [];

  constructor(
    private scene: THREE.Scene,
    private color = 0x66cfff,
    private cap = 8,
  ) {}

  burst(at: THREE.Vector3) {
    let slot = this.slots.find((entry) => entry.life <= 0);
    if (!slot) {
      if (this.slots.length >= this.cap) {
        slot = this.slots.reduce((a, b) => (a.life < b.life ? a : b));
      } else {
        const count = 48;
        const positions = new Float32Array(count * 3);
        for (let i = 0; i < count; i += 1) {
          const angle = Math.random() * Math.PI * 2;
          const radius = 0.12 + Math.random() * 0.7;
          positions[i * 3] = Math.cos(angle) * radius;
          positions[i * 3 + 1] = Math.random() * 1.35;
          positions[i * 3 + 2] = Math.sin(angle) * radius;
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const material = new THREE.PointsMaterial({
          color: this.color,
          size: 0.07,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        const points = new THREE.Points(geometry, material);
        points.name = 'abracadabra-dust';
        points.frustumCulled = false;
        points.visible = false;
        this.scene.add(points);
        slot = { points, life: 0, max: 0.85, baseY: 0 };
        this.slots.push(slot);
      }
    }
    slot.life = 0.85;
    slot.max = 0.85;
    slot.baseY = at.y;
    slot.points.visible = true;
    slot.points.position.copy(at);
    (slot.points.material as THREE.PointsMaterial).opacity = 0.95;
  }

  update(dt: number) {
    for (const slot of this.slots) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      const material = slot.points.material as THREE.PointsMaterial;
      material.opacity = Math.max(0, slot.life / slot.max);
      slot.points.position.y = slot.baseY + (1 - slot.life / slot.max) * 0.8;
      if (slot.life <= 0) slot.points.visible = false;
    }
  }

  dispose() {
    for (const slot of this.slots) {
      slot.points.removeFromParent();
      slot.points.geometry.dispose();
      (slot.points.material as THREE.Material).dispose();
    }
    this.slots.length = 0;
  }
}
