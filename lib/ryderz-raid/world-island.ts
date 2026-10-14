import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Obstacle, World } from './world';
import {
  ISLAND_CAVE,
  ISLAND_FALLS,
  ISLAND_GROTTO,
  ISLAND_HALF,
  ISLAND_SPAN,
  islandAlleys,
  islandFloor,
  islandSurface,
  rainforestMask,
  sampleIsland,
} from './island/terrain';

/**
 * Island Paradise. Built the first time the arena is selected.
 * Terrain is four chunks so the camera can cull a distant quarter.
 * Palms and rocks are instanced. The ocean is one shaded surface whose
 * waves match islandSurface, so the gameplay waterline and the picture agree.
 */

const CHUNK = 4;
const SEGMENT = 4;

let clock = 0;

function terrainMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `
      varying vec3 vPos;
      varying vec3 vNormal;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vPos = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      varying vec3 vPos;
      varying vec3 vNormal;
      uniform float time;
      void main() {
        float h = vPos.y;
        vec3 sand = vec3(0.83, 0.71, 0.45);
        vec3 wet = vec3(0.55, 0.46, 0.30);
        vec3 grass = vec3(0.13, 0.40, 0.16);
        vec3 soil = vec3(0.34, 0.26, 0.14);
        vec3 rock = vec3(0.45, 0.43, 0.40);
        vec3 abyss = vec3(0.02, 0.10, 0.14);
        vec3 col = mix(wet, sand, smoothstep(0.05, 1.15, h));
        col = mix(col, soil, smoothstep(1.15, 2.2, h) * 0.45);
        col = mix(col, grass, smoothstep(2.0, 8.0, h));
        float basinX = (vPos.x + 48.0) / 155.0;
        float basinZ = (vPos.z - 125.0) / 78.0;
        float basin = clamp(1.0 - (basinX * basinX + basinZ * basinZ), 0.0, 1.0);
        float canopy = basin * smoothstep(2.2, 5.0, h) * (1.0 - smoothstep(14.0, 22.0, h));
        col = mix(col, vec3(0.04, 0.24, 0.07), canopy * 0.9);
        col = mix(col, rock, smoothstep(16.0, 34.0, h));
        col = mix(col, vec3(0.62, 0.60, 0.56), smoothstep(58.0, 96.0, h));
        float slope = 1.0 - clamp(vNormal.y, 0.0, 1.0);
        col = mix(col, rock, smoothstep(0.28, 0.62, slope));
        float grotto = 0.0;
        if (vPos.x > 28.0 && vPos.x < 58.0 && vPos.z < -70.0 && vPos.z > -132.0 && vPos.y < 13.0) grotto = 1.0;
        if (vPos.x > -32.0 && vPos.x < -6.0 && vPos.z < -124.0 && vPos.z > -152.0 && vPos.y < 14.0) grotto = 1.0;
        col *= mix(1.0, 0.16, grotto);
        if (h < 0.15) {
          float depth = clamp(-h / 16.0, 0.0, 1.0);
          col = mix(col, abyss, depth);
          float band = sin(vPos.x * 0.55 + time * 1.3) * sin(vPos.z * 0.48 - time * 1.1);
          col += vec3(0.05, 0.22, 0.24) * band * band * (1.0 - depth) * step(h, 0.0);
        }
        float lambert = clamp(dot(normalize(vNormal), normalize(vec3(-0.35, 0.86, 0.28))), 0.0, 1.0);
        col *= 0.42 + lambert * 0.78;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

function waterMaterial(depthMap: THREE.DataTexture) {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, depthMap: { value: depthMap } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
      uniform float time;
      uniform sampler2D depthMap;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vDepth;
      void main() {
        vec3 pos = position;
        vec2 uv = pos.xz / ${ISLAND_SPAN.toFixed(1)} + 0.5;
        float depth = texture2D(depthMap, uv).r;
        float amp = 0.08 + depth * 0.55;
        float wave = sin(pos.x * 0.045 + time * 1.15) * amp + sin(pos.z * 0.07 - time * 0.82) * amp * 0.65;
        pos.y += wave;
        vec4 world = modelMatrix * vec4(pos, 1.0);
        vWorld = world.xyz;
        float dx = cos(pos.x * 0.045 + time * 1.15) * 0.045 * amp;
        float dz = cos(pos.z * 0.07 - time * 0.82) * 0.07 * amp * 0.65;
        vNormal = normalize(vec3(-dx, 1.0, -dz));
        vDepth = depth;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform float time;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vDepth;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - clamp(dot(normalize(vNormal), viewDir), 0.0, 1.0), 3.0);
        vec3 deep = vec3(0.02, 0.18, 0.28);
        vec3 shallow = vec3(0.18, 0.62, 0.58);
        vec3 col = mix(shallow, deep, smoothstep(0.02, 0.45, vDepth));
        vec3 sky = vec3(0.62, 0.82, 0.95);
        col = mix(col, sky, fres * 0.72);
        vec3 sun = normalize(vec3(-0.4, 0.82, 0.25));
        vec3 halfDir = normalize(sun + viewDir);
        float spec = pow(clamp(dot(normalize(vNormal), halfDir), 0.0, 1.0), 48.0);
        col += vec3(1.0, 0.92, 0.75) * spec * (0.35 + fres);
        float shore = smoothstep(0.16, 0.0, vDepth);
        float foam = shore * (0.55 + 0.45 * sin(vWorld.x * 0.55 + vWorld.z * 0.4 + time * 2.6));
        col = mix(col, vec3(0.92, 0.96, 0.95), clamp(foam, 0.0, 1.0) * 0.85);
        float alpha = mix(0.55, 0.88, fres);
        alpha = mix(alpha, 0.42, shore);
        if (!gl_FrontFacing) {
          col = mix(col, vec3(0.03, 0.22, 0.32), 0.55);
          alpha = 0.72;
        }
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
}

function depthTexture() {
  const n = 128;
  const data = new Uint8Array(n * n);
  for (let iz = 0; iz < n; iz += 1) {
    for (let ix = 0; ix < n; ix += 1) {
      const x = -ISLAND_HALF + (ix / (n - 1)) * ISLAND_SPAN;
      const z = -ISLAND_HALF + (iz / (n - 1)) * ISLAND_SPAN;
      const depth = Math.max(0, -islandFloor(x, z));
      data[iz * n + ix] = Math.min(255, Math.floor((depth / 18) * 255));
    }
  }
  const texture = new THREE.DataTexture(data, n, n, THREE.RedFormat);
  texture.needsUpdate = true;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function chunkGeometry(ox: number, oz: number, size: number) {
  const seg = Math.round(size / SEGMENT);
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i) + ox;
    const z = pos.getZ(i) + oz;
    pos.setXYZ(i, x, islandFloor(x, z), z);
  }
  geo.computeVertexNormals();
  return geo;
}

function palmGeometry() {
  const trunk = new THREE.CylinderGeometry(0.16, 0.28, 6.2, 5);
  trunk.translate(0, 3.1, 0);
  const parts: THREE.BufferGeometry[] = [trunk];
  for (let i = 0; i < 6; i += 1) {
    const leaf = new THREE.ConeGeometry(0.12, 2.8, 3);
    leaf.translate(0, 1.3, 0);
    leaf.rotateZ(1.15);
    leaf.rotateY((i / 6) * Math.PI * 2);
    leaf.translate(0, 6.1, 0);
    parts.push(leaf);
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  return merged ?? trunk;
}

function placePalms() {
  const spots: THREE.Vector3[] = [];
  for (let x = -340; x <= 340 && spots.length < 640; x += 16) {
    for (let z = -300; z <= 280 && spots.length < 640; z += 16) {
      const jitterX = x + Math.sin(x * 0.17 + z) * 4;
      const jitterZ = z + Math.cos(z * 0.13 + x) * 4;
      const sample = sampleIsland(jitterX, jitterZ);
      if (sample.depth > 0.25 || sample.floor < 1.7 || sample.floor > 18) continue;
      if (Math.abs(jitterX - 128) < 46 && Math.abs(jitterZ - 96) < 38) continue;
      if (Math.hypot(jitterX - 8, jitterZ - 48) < 26) continue;
      if (Math.hypot(jitterX + 76, jitterZ - 248) < 18) continue;
      const forest = rainforestMask(jitterX, jitterZ) > 0.35;
      if (!forest && ((x / 16) ^ (z / 16)) % 3 === 0) continue;
      spots.push(new THREE.Vector3(jitterX, sample.floor, jitterZ));
    }
  }
  return spots;
}

function canopyGeometry() {
  const trunk = new THREE.CylinderGeometry(0.22, 0.38, 4.6, 5);
  trunk.translate(0, 2.3, 0);
  const crown = new THREE.SphereGeometry(2.15, 6, 5);
  crown.scale(1, 0.7, 1);
  crown.translate(0, 4.7, 0);
  const merged = mergeGeometries([trunk, crown], false);
  if (!merged) return trunk;
  trunk.dispose();
  crown.dispose();
  return merged;
}

function placeCanopy() {
  const spots: THREE.Vector3[] = [];
  for (let x = -220; x <= 120 && spots.length < 520; x += 9) {
    for (let z = 40; z <= 210 && spots.length < 520; z += 9) {
      const jitterX = x + Math.sin(x * 0.21 + z * 0.07) * 2.4;
      const jitterZ = z + Math.cos(z * 0.19 + x * 0.05) * 2.4;
      if (rainforestMask(jitterX, jitterZ) < 0.28) continue;
      const sample = sampleIsland(jitterX, jitterZ);
      if (sample.depth > 0.2 || sample.floor < 2 || sample.floor > 16) continue;
      if (Math.hypot(jitterX - 8, jitterZ - 48) < 28) continue;
      if ((x + z) % 18 === 0) continue;
      spots.push(new THREE.Vector3(jitterX, sample.floor, jitterZ));
    }
  }
  return spots;
}

function placeRocks() {
  const spots: { pos: THREE.Vector3; scale: number; solid: boolean }[] = [];
  for (let i = 0; i < 180; i += 1) {
    const angle = i * 2.399;
    const radius = 40 + (i % 17) * 16;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius * 0.9 - 20;
    const sample = sampleIsland(x, z);
    if (sample.floor < -8 || (sample.depth === 0 && sample.floor < 1.2)) continue;
    const scale = sample.depth > 1 ? 1.4 + (i % 5) * 0.35 : 0.8 + (i % 4) * 0.4;
    spots.push({ pos: new THREE.Vector3(x, sample.floor, z), scale, solid: scale > 1.5 && sample.floor > -1 });
  }
  const summits = [
    { x: -48, z: -178 },
    { x: 62, z: -88 },
    { x: -150, z: 40 },
  ];
  for (const summit of summits) {
    for (let i = 0; i < 26; i += 1) {
      const angle = i * 0.86 + summit.x;
      const radius = 26 + (i % 6) * 16;
      const x = summit.x + Math.cos(angle) * radius;
      const z = summit.z + Math.sin(angle) * radius * 0.85;
      const floor = islandFloor(x, z);
      if (floor < 16 || floor > 96) continue;
      spots.push({ pos: new THREE.Vector3(x, floor, z), scale: 2.2 + (i % 4) * 1.15, solid: false });
    }
  }
  return spots;
}

export function buildIslandWorld(): World {
  const group = new THREE.Group();
  group.name = 'island-paradise';
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const obstacles: Obstacle[] = [];

  const groundMat = terrainMaterial();
  materials.push(groundMat);
  const chunkSize = ISLAND_SPAN / CHUNK;
  for (let cx = 0; cx < CHUNK; cx += 1) {
    for (let cz = 0; cz < CHUNK; cz += 1) {
      const ox = -ISLAND_HALF + chunkSize * (cx + 0.5);
      const oz = -ISLAND_HALF + chunkSize * (cz + 0.5);
      const geo = chunkGeometry(ox, oz, chunkSize);
      geometries.push(geo);
      const mesh = new THREE.Mesh(geo, groundMat);
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  const depthMap = depthTexture();
  const oceanMat = waterMaterial(depthMap);
  materials.push(oceanMat);
  const oceanGeo = new THREE.PlaneGeometry(ISLAND_SPAN, ISLAND_SPAN, 72, 72);
  oceanGeo.rotateX(-Math.PI / 2);
  geometries.push(oceanGeo);
  const ocean = new THREE.Mesh(oceanGeo, oceanMat);
  ocean.renderOrder = 2;
  group.add(ocean);

  const palms = placePalms();
  const palmGeo = palmGeometry();
  geometries.push(palmGeo);
  const palmMat = new THREE.MeshStandardMaterial({ color: 0x2f6b32, roughness: 0.85 });
  materials.push(palmMat);
  const palmMesh = new THREE.InstancedMesh(palmGeo, palmMat, Math.max(1, palms.length));
  const dummy = new THREE.Object3D();
  palms.forEach((spot, index) => {
    dummy.position.copy(spot);
    dummy.rotation.y = index * 0.7;
    dummy.scale.setScalar(0.85 + (index % 5) * 0.08);
    dummy.updateMatrix();
    palmMesh.setMatrixAt(index, dummy.matrix);
  });
  palmMesh.instanceMatrix.needsUpdate = true;
  group.add(palmMesh);

  const canopy = placeCanopy();
  const canopyGeo = canopyGeometry();
  geometries.push(canopyGeo);
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0x0e4a22, roughness: 0.9 });
  materials.push(canopyMat);
  const canopyMesh = new THREE.InstancedMesh(canopyGeo, canopyMat, Math.max(1, canopy.length));
  canopy.forEach((spot, index) => {
    dummy.position.copy(spot);
    dummy.rotation.y = index * 0.9;
    const scale = 0.85 + (index % 5) * 0.16;
    dummy.scale.set(scale, scale * (0.9 + (index % 3) * 0.12), scale);
    dummy.updateMatrix();
    canopyMesh.setMatrixAt(index, dummy.matrix);
  });
  canopyMesh.instanceMatrix.needsUpdate = true;
  group.add(canopyMesh);

  const rocks = placeRocks();
  const rockGeo = new THREE.DodecahedronGeometry(1.1, 0);
  geometries.push(rockGeo);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6d6a64, roughness: 0.95 });
  materials.push(rockMat);
  const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, Math.max(1, rocks.length));
  rocks.forEach((rock, index) => {
    dummy.position.copy(rock.pos);
    dummy.rotation.set(index, index * 0.4, 0);
    dummy.scale.setScalar(rock.scale);
    dummy.updateMatrix();
    rockMesh.setMatrixAt(index, dummy.matrix);
    if (rock.solid) {
      obstacles.push({ kind: 'circle', x: rock.pos.x, z: rock.pos.z, r: rock.scale * 0.8 });
    }
  });
  rockMesh.instanceMatrix.needsUpdate = true;
  group.add(rockMesh);

  const plaster = new THREE.MeshStandardMaterial({ color: 0xf2efe4, roughness: 0.72 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.8 });
  const roof = new THREE.MeshStandardMaterial({ color: 0xc4553a, roughness: 0.6 });
  materials.push(plaster, wood, roof);
  const lodge = new THREE.Mesh(new THREE.BoxGeometry(18, 5.2, 11), plaster);
  lodge.position.set(118, 1.65 + 2.6, 96);
  group.add(lodge);
  geometries.push(lodge.geometry);
  obstacles.push({ kind: 'box', minX: 118 - 9.2, maxX: 118 + 9.2, minZ: 96 - 5.7, maxZ: 96 + 5.7 });
  const roofMesh = new THREE.Mesh(new THREE.BoxGeometry(20, 0.6, 13), roof);
  roofMesh.position.set(118, 1.65 + 5.4, 96);
  group.add(roofMesh);
  geometries.push(roofMesh.geometry);
  for (const cabin of [
    { x: 146, z: 78 },
    { x: 146, z: 112 },
  ]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(6.5, 3.2, 5.5), wood);
    mesh.position.set(cabin.x, 1.65 + 1.6, cabin.z);
    group.add(mesh);
    geometries.push(mesh.geometry);
    obstacles.push({
      kind: 'box',
      minX: cabin.x - 3.4,
      maxX: cabin.x + 3.4,
      minZ: cabin.z - 2.9,
      maxZ: cabin.z + 2.9,
    });
  }

  const caveMat = new THREE.MeshStandardMaterial({ color: 0x241f1c, roughness: 1 });
  materials.push(caveMat);
  const caveLength = ISLAND_CAVE.maxZ - ISLAND_CAVE.minZ;
  const caveWidth = ISLAND_CAVE.maxX - ISLAND_CAVE.minX;
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(caveWidth + 8, 8, caveLength - 8), caveMat);
  ceiling.position.set(
    (ISLAND_CAVE.minX + ISLAND_CAVE.maxX) / 2,
    10.4,
    (ISLAND_CAVE.minZ + ISLAND_CAVE.maxZ) / 2 - 4,
  );
  group.add(ceiling);
  geometries.push(ceiling.geometry);
  const grotto = new THREE.Mesh(
    new THREE.BoxGeometry(ISLAND_GROTTO.maxX - ISLAND_GROTTO.minX + 6, 9, ISLAND_GROTTO.maxZ - ISLAND_GROTTO.minZ + 4),
    caveMat,
  );
  grotto.position.set((ISLAND_GROTTO.minX + ISLAND_GROTTO.maxX) / 2, 9.6, (ISLAND_GROTTO.minZ + ISLAND_GROTTO.maxZ) / 2);
  group.add(grotto);
  geometries.push(grotto.geometry);
  for (const side of [ISLAND_CAVE.minX + 1.5, ISLAND_CAVE.maxX - 1.5]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(3.4, 8.5, 3.4), caveMat);
    pillar.position.set(side, ISLAND_CAVE.floor + 4.2, ISLAND_CAVE.maxZ + 1);
    group.add(pillar);
    geometries.push(pillar.geometry);
  }
  obstacles.push({
    kind: 'box',
    minX: ISLAND_CAVE.minX - 2,
    maxX: ISLAND_CAVE.minX + 2,
    minZ: ISLAND_CAVE.minZ,
    maxZ: ISLAND_CAVE.maxZ,
  });
  obstacles.push({
    kind: 'box',
    minX: ISLAND_CAVE.maxX - 2,
    maxX: ISLAND_CAVE.maxX + 2,
    minZ: ISLAND_CAVE.minZ,
    maxZ: ISLAND_CAVE.maxZ,
  });

  const fallMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { time: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      varying vec2 vUv;
      void main() {
        float streak = 0.45 + 0.55 * sin(vUv.x * 26.0 + vUv.y * 48.0 - time * 7.0);
        float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
        vec3 col = mix(vec3(0.62, 0.86, 0.95), vec3(0.95, 0.98, 1.0), streak);
        gl_FragColor = vec4(col, (0.28 + streak * 0.45) * edge);
      }
    `,
  });
  const foamMat = new THREE.MeshBasicMaterial({
    color: 0xe7f7ff,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  materials.push(fallMat, foamMat);
  for (const fall of ISLAND_FALLS) {
    const top = islandFloor(fall.lipX, fall.lipZ);
    const bottom = Math.min(0.35, islandFloor(fall.poolX, fall.poolZ));
    const drop = Math.max(8, top - bottom);
    const geo = new THREE.PlaneGeometry(fall.halfWidth * 1.7, drop);
    geometries.push(geo);
    const sheet = new THREE.Mesh(geo, fallMat);
    const dx = fall.poolX - fall.lipX;
    const dz = fall.poolZ - fall.lipZ;
    const yaw = Math.atan2(dx, dz);
    sheet.position.set((fall.lipX + fall.poolX) / 2, bottom + drop / 2, (fall.lipZ + fall.poolZ) / 2);
    sheet.rotation.y = yaw;
    group.add(sheet);
    const ribbon = new THREE.Mesh(geo, fallMat);
    ribbon.position.copy(sheet.position);
    ribbon.position.x += Math.cos(yaw) * 2.1;
    ribbon.position.z -= Math.sin(yaw) * 2.1;
    ribbon.rotation.y = yaw;
    ribbon.scale.set(0.45, 0.96, 1);
    group.add(ribbon);
    const foamGeo = new THREE.CircleGeometry(fall.halfWidth * 0.95, 14);
    geometries.push(foamGeo);
    const foam = new THREE.Mesh(foamGeo, foamMat);
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(fall.poolX, Math.max(0.2, bottom + 0.35), fall.poolZ);
    group.add(foam);
  }

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1500, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        varying vec3 vPos;
        void main() {
          float h = normalize(vPos).y;
          vec3 zenith = vec3(0.28, 0.58, 0.92);
          vec3 horizon = vec3(0.95, 0.78, 0.55);
          gl_FragColor = vec4(mix(horizon, zenith, smoothstep(0.0, 0.45, h)), 1.0);
        }
      `,
    }),
  );
  group.add(sky);
  geometries.push(sky.geometry);
  materials.push(sky.material as THREE.Material);

  const alleys = islandAlleys().map((alley) => ({
    position: new THREE.Vector3(alley.x, islandFloor(alley.x, alley.z), alley.z),
    inward: new THREE.Vector3(alley.ix, 0, alley.iz).normalize(),
    aquatic: alley.aquatic,
  }));

  const disposed = { done: false };
  const animate = (time: number) => {
    if (disposed.done) return;
    clock = time;
    groundMat.uniforms.time.value = time;
    oceanMat.uniforms.time.value = time;
    fallMat.uniforms.time.value = time;
    for (let i = 0; i < palms.length; i += 1) {
      const spot = palms[i];
      dummy.position.copy(spot);
      dummy.rotation.set(Math.sin(time * 1.3 + i) * 0.035, i * 0.7, Math.cos(time * 1.1 + i) * 0.04);
      dummy.scale.setScalar(0.85 + (i % 5) * 0.08);
      dummy.updateMatrix();
      palmMesh.setMatrixAt(i, dummy.matrix);
    }
    if (palms.length) palmMesh.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < canopy.length; i += 1) {
      const spot = canopy[i];
      dummy.position.copy(spot);
      const scale = 0.85 + (i % 5) * 0.16;
      dummy.scale.set(scale, scale * (0.9 + (i % 3) * 0.12), scale);
      dummy.rotation.set(Math.sin(time * 0.8 + i) * 0.02, i * 0.9, 0);
      dummy.updateMatrix();
      canopyMesh.setMatrixAt(i, dummy.matrix);
    }
    if (canopy.length) canopyMesh.instanceMatrix.needsUpdate = true;
  };

  const dispose = () => {
    disposed.done = true;
    geometries.forEach((geo) => geo.dispose());
    materials.forEach((mat) => mat.dispose());
    depthMap.dispose();
  };

  return {
    group,
    obstacles,
    occluders: [lodge, ceiling],
    alleys,
    alleyNodes: [],
    bounds: ISLAND_HALF - 6,
    spawnReach: 90,
    water: {
      surfaceAt: (x, z) => islandSurface(x, z, clock),
      depthAt: (x, z) => sampleIsland(x, z, clock).depth,
    },
    heightAt: (x, z) => islandFloor(x, z),
    animate,
    dispose,
  };
}
