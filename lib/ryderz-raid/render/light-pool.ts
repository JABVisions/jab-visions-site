import * as THREE from 'three';

/**
 * Forward rendering pays for every point light on every lit pixel, so a city
 * with a lamp on each corner costs far more than the few lamps anyone can see
 * at once. The pool keeps a fixed number of real lights (the shader never
 * recompiles) and hands them to the lamps nearest the fighter. The lamps in
 * the world stay as hidden anchors: their position, colour and live intensity
 * are copied into whichever slot they hold, and slots crossfade when the
 * nearest set changes so nothing pops.
 */

interface Anchor {
  light: THREE.PointLight;
  pos: THREE.Vector3;
}

interface Slot {
  light: THREE.PointLight;
  anchor: Anchor | null;
  level: number;
}

const FADE_RATE = 5;

export class LightPool {
  private slots: Slot[] = [];
  private anchors: Anchor[] = [];
  private roots = new Map<THREE.Object3D, Anchor[]>();
  private last = 0;

  constructor(scene: THREE.Scene, size = 6) {
    for (let i = 0; i < size; i += 1) {
      const light = new THREE.PointLight(0xffffff, 0, 1, 2);
      light.name = 'pooled-light';
      scene.add(light);
      this.slots.push({ light, anchor: null, level: 0 });
    }
  }

  /** Take over the point lights under `root`. Calling again with the same root just makes it active. */
  use(root: THREE.Object3D) {
    let anchors = this.roots.get(root);
    if (!anchors) {
      anchors = [];
      root.updateMatrixWorld(true);
      root.traverse((obj) => {
        const light = obj as THREE.PointLight;
        if (!light.isPointLight) return;
        anchors!.push({ light, pos: light.getWorldPosition(new THREE.Vector3()) });
        light.visible = false;
      });
      this.roots.set(root, anchors);
    }
    this.anchors = anchors;
    for (const slot of this.slots) {
      slot.anchor = null;
      slot.level = 0;
      slot.light.intensity = 0;
    }
  }

  forget(root: THREE.Object3D) {
    if (this.anchors === this.roots.get(root)) this.use(new THREE.Object3D());
    this.roots.delete(root);
  }

  update(focus: THREE.Vector3) {
    const now = performance.now();
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 1;
    this.last = now;

    const wanted = this.nearest(focus);
    const claimed = new Set<Anchor>();
    for (const slot of this.slots) {
      if (slot.anchor && wanted.has(slot.anchor)) claimed.add(slot.anchor);
    }
    const waiting = [...wanted].filter((a) => !claimed.has(a));
    for (const slot of this.slots) {
      const keep = slot.anchor !== null && wanted.has(slot.anchor);
      if (!keep && slot.level <= 0 && waiting.length) {
        slot.anchor = waiting.shift()!;
        const src = slot.anchor.light;
        slot.light.position.copy(slot.anchor.pos);
        slot.light.color.copy(src.color);
        slot.light.distance = src.distance;
        slot.light.decay = src.decay;
      }
      const target = slot.anchor && wanted.has(slot.anchor) ? 1 : 0;
      slot.level = THREE.MathUtils.clamp(slot.level + Math.sign(target - slot.level) * FADE_RATE * dt, 0, 1);
      if (!slot.anchor) slot.level = 0;
      slot.light.intensity = slot.anchor ? slot.anchor.light.intensity * slot.level : 0;
    }
  }

  dispose() {
    for (const slot of this.slots) slot.light.removeFromParent();
    this.slots = [];
    this.roots.clear();
    this.anchors = [];
  }

  /** The lamps whose light reaches closest to the fighter: distance past the edge of their range, nearest first. */
  private nearest(focus: THREE.Vector3) {
    const scored = this.anchors.map((a) => ({ a, d: a.pos.distanceTo(focus) - a.light.distance * 0.5 }));
    scored.sort((p, q) => p.d - q.d);
    return new Set(scored.slice(0, this.slots.length).map((s) => s.a));
  }
}
