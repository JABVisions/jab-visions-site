import * as THREE from 'three';

/**
 * Green code fragments that orbit a mind-controlled opponent.
 * One shared atlas per slot, so every host shows the same hijacked signal
 * without a canvas per body.
 */
const SLOTS = 6;
const CODE = '#7CFFB0';
const GLOW = '#39ff6a';
const HEX = '0123456789ABCDEF';

const PLANE = new THREE.PlaneGeometry(1, 1);

interface Slot {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
}

interface Fragment {
  mesh: THREE.Mesh;
  phase: number;
  radius: number;
  height: number;
  speed: number;
  slot: number;
}

let slots: Slot[] | null = null;
let paintedAt = -1;

function chunk(length: number) {
  let text = '';
  for (let i = 0; i < length; i += 1) text += HEX[(Math.random() * 16) | 0];
  return text;
}

function codeLine() {
  const roll = Math.random();
  if (roll < 0.28) return `0x${chunk(4)}`;
  if (roll < 0.56) return `${chunk(2)} ${chunk(2)} ${chunk(2)}`;
  if (roll < 0.78) return `>${chunk(2)}:${chunk(2)}`;
  return `${chunk(2)}${chunk(2)}`;
}

function paintSlot(slot: Slot) {
  const { canvas, context } = slot;
  context.clearRect(0, 0, canvas.width, canvas.height);
  const text = codeLine();
  context.font = '700 56px ui-monospace, monospace';
  context.textBaseline = 'middle';
  context.shadowColor = GLOW;
  context.shadowBlur = 18;
  context.fillStyle = CODE;
  const y = canvas.height * 0.5;
  const x = 10 + (Math.random() < 0.34 ? (Math.random() - 0.4) * 22 : 0);
  context.fillText(text, x, y);
  if (Math.random() < 0.5) {
    context.shadowBlur = 0;
    context.fillStyle = 'rgba(57, 255, 106, 0.55)';
    const slice = 16 + Math.random() * 36;
    context.save();
    context.beginPath();
    context.rect(0, slice, canvas.width, 12);
    context.clip();
    context.fillText(text, x + 10, y);
    context.restore();
  }
  slot.texture.needsUpdate = true;
}

function ensureSlots() {
  if (slots || typeof document === 'undefined') return slots;
  slots = [];
  for (let i = 0; i < SLOTS; i += 1) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const context = canvas.getContext('2d');
    if (!context) continue;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.userData.retain = true;
    const slot = { canvas, context, texture };
    paintSlot(slot);
    slots.push(slot);
  }
  paintedAt = 0;
  return slots;
}

function tickSlots(time: number) {
  const ready = ensureSlots();
  if (!ready || time - paintedAt < 0.12) return;
  paintedAt = time;
  ready.forEach(paintSlot);
}

export class HostGlitch {
  readonly group = new THREE.Group();
  private fragments: Fragment[] = [];
  private opacity = 1;

  constructor(height: number) {
    this.group.name = 'HostGlitch';
    const ready = ensureSlots();
    if (!ready?.length) return;
    const angles = [0.85, 5.45, 1.65, 4.65, 2.55, 3.75];
    const heights = [0.72, 0.5, 0.84, 0.34, 0.62, 0.78];
    for (let i = 0; i < angles.length; i += 1) {
      const slot = ready[i % ready.length];
      const material = new THREE.MeshBasicMaterial({
        map: slot.texture,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
        premultipliedAlpha: false,
        alphaTest: 0.12,
      });
      const mesh = new THREE.Mesh(PLANE, material);
      mesh.name = 'GlitchCode';
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      mesh.scale.set(i % 2 === 0 ? 0.92 : 0.74, 0.18, 1);
      this.group.add(mesh);
      this.fragments.push({
        mesh,
        phase: angles[i],
        radius: 0.9 + (i % 3) * 0.06,
        height: Math.max(0.35, height * heights[i]),
        speed: 0.35 + (i % 2) * 0.08,
        slot: i,
      });
    }
  }

  setOpacity(opacity: number) {
    this.opacity = opacity;
  }

  update(time: number, camera: THREE.Camera) {
    tickSlots(time);
    for (const fragment of this.fragments) {
      const step = Math.floor(time * 12 + fragment.slot);
      const kicking = step % 7 === fragment.slot % 7;
      const kick = kicking ? ((step % 5) - 2) * 0.07 : 0;
      const orbit = fragment.phase + time * fragment.speed;
      fragment.mesh.position.set(
        Math.cos(orbit) * fragment.radius + kick,
        fragment.height + Math.sin(time * 2.1 + fragment.phase) * 0.045,
        Math.sin(orbit) * fragment.radius * 0.82,
      );
      fragment.mesh.lookAt(camera.position);
      const material = fragment.mesh.material as THREE.MeshBasicMaterial;
      const flicker = 0.8 + 0.2 * (0.5 + 0.5 * Math.sin(time * 8 + fragment.phase));
      material.opacity = this.opacity * flicker;
    }
  }
}
