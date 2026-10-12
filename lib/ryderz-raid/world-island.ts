import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Obstacle, World } from './world';
import {
  ISLAND_HALF,
  ISLAND_SPAN,
  islandAlleys,
  islandFloor,
  islandSurface,
  sampleIsland,
} from './island/terrain';

/**
 * Island Paradise. Built the first time the arena is selected.
 * Terrain is four chunks so the camera can cull a distant quarter.
 * Palms and rocks are instanced. The ocean is one shaded surface whose
 * waves match islandSurface, so the gameplay waterline and the picture agree.
 */

const CHUNK = 4;
const SEGMENT = 10;

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
        col = mix(col, grass, smoothstep(1.6, 4.0, h));
        col = mix(col, rock, smoothstep(14.0, 26.0, h));
        float slope = 1.0 - clamp(vNormal.y, 0.0, 1.0);
        col = mix(col, rock, smoothstep(0.35, 0.72, slope));
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
      if (sample.depth > 0.25 || sample.floor < 1.7 || sample.floor > 10) continue;
      if (Math.abs(jitterX - 128) < 46 && Math.abs(jitterZ - 96) < 38) continue;
      if (Math.hypot(jitterX - 8, jitterZ - 48) < 26) continue;
      if (Math.hypot(jitterX + 76, jitterZ - 248) < 18) continue;
      if (((x / 16) ^ (z / 16)) % 3 === 0) continue;
      spots.push(new THREE.Vector3(jitterX, sample.floor, jitterZ));
    }
  }
  return spots;
}

function placeRocks() {
  const spots: { pos: THREE.Vector3; scale: number }[] = [];
  for (let i = 0; i < 180; i += 1) {
    const angle = i * 2.399;
    const radius = 40 + (i % 17) * 16;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius * 0.9 - 20;
    const sample = sampleIsland(x, z);
    if (sample.floor < -8 || (sample.depth === 0 && sample.floor < 1.2)) continue;
    const scale = sample.depth > 1 ? 1.4 + (i % 5) * 0.35 : 0.8 + (i % 4) * 0.4;
    spots.push({ pos: new THREE.Vector3(x, sample.floor, z), scale });
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
    if (rock.scale > 1.5 && rock.pos.y > -1) {
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

  const caveMat = new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 1 });
  materials.push(caveMat);
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(42, 0.8, 12), caveMat);
  ceiling.position.set(66, 5.6, -128);
  group.add(ceiling);
  geometries.push(ceiling.geometry);
  obstacles.push({ kind: 'box', minX: 46, maxX: 90, minZ: -134.2, maxZ: -132.2 });
  obstacles.push({ kind: 'box', minX: 46, maxX: 90, minZ: -123.8, maxZ: -121.8 });

  const fallMat = new THREE.MeshBasicMaterial({
    color: 0xd7f4ff,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  materials.push(fallMat);
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(6, 14), fallMat);
  fall.position.set(-22, 10, -134);
  fall.rotation.y = 0.4;
  group.add(fall);
  geometries.push(fall.geometry);

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
    fall.position.y = 10 + Math.sin(time * 2.2) * 0.15;
    fallMat.opacity = 0.42 + Math.sin(time * 3) * 0.08;
    for (let i = 0; i < palms.length; i += 1) {
      const spot = palms[i];
      dummy.position.copy(spot);
      dummy.rotation.set(Math.sin(time * 1.3 + i) * 0.035, i * 0.7, Math.cos(time * 1.1 + i) * 0.04);
      dummy.scale.setScalar(0.85 + (i % 5) * 0.08);
      dummy.updateMatrix();
      palmMesh.setMatrixAt(i, dummy.matrix);
    }
    if (palms.length) palmMesh.instanceMatrix.needsUpdate = true;
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
