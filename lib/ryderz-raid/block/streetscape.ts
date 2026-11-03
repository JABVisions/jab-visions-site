import * as THREE from 'three';
import type { Obstacle } from '../world';
import { textTexture } from '../render/surfaces';

/**
 * Street furniture for the Block: neon signage on the shopfronts, traffic
 * signals at the plaza, hydrants, bins, a dumpster in the service alley, and
 * steam rising from the manholes. Solid pieces return their footprint so the
 * fighter and the mob walk around them.
 */

export interface StreetProp {
  obstacles: Obstacle[];
  lights: THREE.PointLight[];
}

const none: StreetProp = { obstacles: [], lights: [] };

export function metalMaterial(color: number, roughness = 0.45, metalness = 0.75) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, envMapIntensity: 1.1 });
}

function solid(mesh: THREE.Mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export interface NeonSpec {
  text: string;
  color: number;
  x: number;
  y: number;
  z: number;
  /** Yaw of the sign face. 0 faces +Z. */
  yaw: number;
  width?: number;
  /** Adds a real light of the tube colour in front of the sign. */
  light?: boolean;
  vertical?: boolean;
}

/** Glowing tube lettering on a dark backing board, with a light spill on the pavement when asked. */
export function neonSign(parent: THREE.Object3D, spec: NeonSpec, registry: { materials: THREE.Material[]; textures: THREE.Texture[]; flicker: THREE.MeshBasicMaterial[] }): StreetProp {
  const width = spec.width ?? 4.2;
  const chars = spec.text.length;
  const texW = spec.vertical ? 192 : 1024;
  const texH = spec.vertical ? 1024 : 256;
  const texture = textTexture(texW, texH, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const color = `#${spec.color.toString(16).padStart(6, '0')}`;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = color;
    ctx.shadowBlur = spec.vertical ? 18 : 28;
    if (spec.vertical) {
      const step = h / (chars + 1);
      ctx.font = `bold ${Math.min(150, step * 0.85)}px Impact, "Arial Black", sans-serif`;
      for (let i = 0; i < chars; i += 1) {
        ctx.fillText(spec.text[i], w / 2, step * (i + 1));
      }
    } else {
      const fontSize = Math.min(190, (w * 0.86) / Math.max(1, chars * 0.62));
      ctx.font = `bold ${fontSize}px Impact, "Arial Black", sans-serif`;
      ctx.fillText(spec.text, w / 2, h / 2 + 6);
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(w * 0.06, h * 0.9);
      ctx.lineTo(w * 0.94, h * 0.9);
      ctx.stroke();
    }
  });
  if (!texture) return none;
  registry.textures.push(texture);
  const height = spec.vertical ? width * (texH / texW) : width * (texH / texW);
  const face = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    color: new THREE.Color(0xffffff).multiplyScalar(2.4),
    depthWrite: false,
  });
  registry.materials.push(face);
  registry.flicker.push(face);
  const board = new THREE.Mesh(new THREE.BoxGeometry(width + 0.3, height + 0.3, 0.18), metalMaterial(0x0b0a10, 0.6, 0.3));
  board.position.set(spec.x, spec.y, spec.z);
  board.rotation.y = spec.yaw;
  board.castShadow = true;
  parent.add(board);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(width, height), face);
  glass.position.set(0, 0, 0.1);
  board.add(glass);
  const lights: THREE.PointLight[] = [];
  if (spec.light) {
    const light = new THREE.PointLight(spec.color, 26, 16, 2);
    light.position.set(0, -0.6, 1.4);
    board.add(light);
    lights.push(light);
  }
  return { obstacles: [], lights };
}

/** Pole-mounted three-aspect signal with a mast arm over the road. `dir` is which way the arm reaches. */
export function trafficSignal(parent: THREE.Object3D, x: number, z: number, y: number, arm: 'x' | 'z', dir: 1 | -1, lit: 'red' | 'green'): StreetProp {
  const pole = metalMaterial(0x1f2026, 0.5, 0.7);
  const post = solid(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 6.2, 10), pole));
  post.position.set(x, y + 3.1, z);
  parent.add(post);
  const armLen = 5.2;
  const mast = solid(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, armLen, 8), pole));
  mast.rotation.z = arm === 'x' ? Math.PI / 2 : 0;
  mast.rotation.x = arm === 'z' ? Math.PI / 2 : 0;
  mast.position.set(x + (arm === 'x' ? (dir * armLen) / 2 : 0), y + 6.05, z + (arm === 'z' ? (dir * armLen) / 2 : 0));
  parent.add(mast);
  const housing = solid(new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.25, 0.42), metalMaterial(0x1a1b20, 0.55, 0.5)));
  const hx = x + (arm === 'x' ? dir * (armLen - 0.8) : 0);
  const hz = z + (arm === 'z' ? dir * (armLen - 0.8) : 0);
  housing.position.set(hx, y + 5.25, hz);
  parent.add(housing);
  const lamps: [number, number][] = [
    [0xff2222, 0.42],
    [0xffb020, 0],
    [0x33ff77, -0.42],
  ];
  lamps.forEach(([color, dy], i) => {
    const on = (lit === 'red' && i === 0) || (lit === 'green' && i === 2);
    const lens = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 10, 8),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(on ? 2.6 : 0.12) }),
    );
    // Lenses face along the road the arm crosses.
    lens.position.set(hx + (arm === 'z' ? 0.22 : 0), y + 5.25 + dy, hz + (arm === 'x' ? 0.22 : 0));
    parent.add(lens);
    const back = lens.clone();
    back.position.set(hx - (arm === 'z' ? 0.22 : 0), y + 5.25 + dy, hz - (arm === 'x' ? 0.22 : 0));
    parent.add(back);
  });
  return { obstacles: [{ kind: 'circle', x, z, r: 0.28 }], lights: [] };
}

export function hydrant(parent: THREE.Object3D, x: number, z: number, y: number): StreetProp {
  const paint = new THREE.MeshStandardMaterial({ color: 0xb8221e, roughness: 0.4, metalness: 0.2, envMapIntensity: 1 });
  const body = solid(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.72, 12), paint));
  body.position.set(x, y + 0.36, z);
  const cap = solid(new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), paint));
  cap.position.set(x, y + 0.76, z);
  const arm = solid(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8), paint));
  arm.rotation.z = Math.PI / 2;
  arm.position.set(x, y + 0.5, z);
  const nut = solid(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 6), metalMaterial(0x6a6f7a)));
  nut.position.set(x, y + 0.9, z);
  parent.add(body, cap, arm, nut);
  return { obstacles: [{ kind: 'circle', x, z, r: 0.3 }], lights: [] };
}

export function trashCan(parent: THREE.Object3D, x: number, z: number, y: number): StreetProp {
  const mesh = solid(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 1.0, 12, 1, false), metalMaterial(0x2c3036, 0.55, 0.6)));
  mesh.position.set(x, y + 0.5, z);
  const rim = solid(new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.03, 6, 16), metalMaterial(0x3b4048)));
  rim.rotation.x = Math.PI / 2;
  rim.position.set(x, y + 1.0, z);
  const bag = solid(new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8), new THREE.MeshStandardMaterial({ color: 0x0c0c10, roughness: 0.35 })));
  bag.scale.set(1, 0.55, 1);
  bag.position.set(x, y + 1.02, z);
  parent.add(mesh, rim, bag);
  return { obstacles: [{ kind: 'circle', x, z, r: 0.42 }], lights: [] };
}

export function newsBox(parent: THREE.Object3D, x: number, z: number, y: number, color: number): StreetProp {
  const mesh = solid(new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.15, 0.5), new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 })));
  mesh.position.set(x, y + 0.575, z);
  const window = new THREE.Mesh(
    new THREE.PlaneGeometry(0.4, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x0a0c14, roughness: 0.1, metalness: 0.6, envMapIntensity: 1.5 }),
  );
  window.position.set(0, 0.2, 0.26);
  mesh.add(window);
  parent.add(mesh);
  return { obstacles: [{ kind: 'box', minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.28, maxZ: z + 0.28 }], lights: [] };
}

export function dumpster(parent: THREE.Object3D, x: number, z: number, y: number, yaw = 0): StreetProp {
  const paint = new THREE.MeshStandardMaterial({ color: 0x1f5a3a, roughness: 0.55, metalness: 0.35, envMapIntensity: 0.9 });
  const body = solid(new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.25, 1.4), paint));
  body.position.set(x, y + 0.75, z);
  body.rotation.y = yaw;
  const lid = solid(new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.1, 1.45), paint));
  lid.position.set(0, 0.68, 0);
  lid.rotation.x = -0.22;
  body.add(lid);
  const bags = new THREE.MeshStandardMaterial({ color: 0x0b0b0e, roughness: 0.3 });
  for (let i = 0; i < 3; i += 1) {
    const bag = solid(new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), bags));
    bag.scale.set(1, 0.7, 1);
    bag.position.set(x + Math.cos(yaw) * (1.5 + i * 0.5) - Math.sin(yaw) * 0.3 * i, y + 0.3, z + Math.sin(yaw) * (1.5 + i * 0.5) + Math.cos(yaw) * 0.3 * i);
    parent.add(bag);
  }
  parent.add(body);
  const c = Math.abs(Math.cos(yaw));
  const s = Math.abs(Math.sin(yaw));
  const ex = c * 1.2 + s * 0.7;
  const ez = s * 1.2 + c * 0.7;
  return {
    obstacles: [
      { kind: 'box', minX: x - ex - 0.05, maxX: x + ex + 0.05, minZ: z - ez - 0.05, maxZ: z + ez + 0.05 },
      { kind: 'circle', x: x + Math.cos(yaw) * 1.9, z: z + Math.sin(yaw) * 1.9, r: 0.55 },
    ],
    lights: [],
  };
}

/** Two crossed sheets of scrolling vapour above a vent. One material animates every copy. */
export function steamMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { time: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        p.x += sin(uv.y * 5.0 + position.y * 0.5) * 0.18 * uv.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        vec2 p = vec2(vUv.x * 3.0, vUv.y * 4.0 - time * 0.9);
        float n = noise(p) * 0.6 + noise(p * 2.3 + 7.0) * 0.4;
        float edge = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x);
        float rise = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y));
        float a = smoothstep(0.38, 0.75, n) * edge * rise * 0.55;
        gl_FragColor = vec4(vec3(0.82, 0.86, 0.95), a);
      }
    `,
  });
}

export function steamVent(parent: THREE.Object3D, x: number, z: number, y: number, material: THREE.Material) {
  const geo = new THREE.PlaneGeometry(2.2, 4.6, 1, 6);
  geo.translate(0, 2.3, 0);
  const a = new THREE.Mesh(geo, material);
  a.position.set(x, y, z);
  const b = new THREE.Mesh(geo, material);
  b.position.set(x, y, z);
  b.rotation.y = Math.PI / 2;
  a.renderOrder = 3;
  b.renderOrder = 3;
  parent.add(a, b);
  return geo;
}
