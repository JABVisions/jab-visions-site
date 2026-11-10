import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RIVERDALE, RIVERDALE_HALF_X, RIVERDALE_HALF_Z } from './config';
import { beamGeometry, keep, keepGeo, placeMatrix, scatter, seededRandom, type BuildKit } from './kit';
import { columnSkins, facade, leafCard, rustSteel, slabConcrete, wallGraffiti } from './surfaces';
import { surfaceMaterial } from '../render/surfaces';
import { beamHeight, columnXs, ledgeTop, NOOK_PILLARS, riverdaleColumns, riverdaleDirt, riverdaleGround, strutHeight } from './terrain';

/**
 * The covered structure: a flat slab on a grid of slender concrete columns,
 * a heavy fascia along the open side, a graffiti-covered retaining wall at the
 * back, and the rust-red steel that ties the columns together: horizontal
 * struts (raised over the embankment so the dirt never crowds them), long X-braces in alternating bays, and slack cables.
 * Columns are instanced per graffiti skin; all steel is one merged mesh.
 */
export function buildStructure(kit: BuildKit) {
  const { group } = kit;
  const top = RIVERDALE.ceiling;
  const rand = seededRandom(907);

  // --- Slab, ribs, fascia and the building above --------------------------------------
  const slabMaps = slabConcrete();
  kit.textures.push(...slabMaps.textures);
  const slabMat = keep(kit, surfaceMaterial(slabMaps, { color: 0x9c9a94, roughness: 0.95, normalAmount: 0.8 }));
  slabMaps.textures.forEach((t) => t.repeat.set(16, 6));
  const slabParts: THREE.BufferGeometry[] = [];
  const slab = new THREE.BoxGeometry(RIVERDALE.length + 1.2, 0.75, RIVERDALE.width + 0.6);
  slab.translate(0, top + 0.375, 0);
  slabParts.push(slab);
  // Downstand ribs every 3 m across the depth, the pattern visible in every photograph.
  for (let x = -RIVERDALE_HALF_X + 1.5; x <= RIVERDALE_HALF_X - 1.4; x += 3) {
    const rib = new THREE.BoxGeometry(0.34, 0.42, RIVERDALE.width);
    rib.translate(x, top - 0.21, 0);
    slabParts.push(rib);
  }
  // Transfer girders carrying the inner rows across the party bay.
  for (const z of [RIVERDALE.columnRows[1], RIVERDALE.columnRows[2]]) {
    const span = RIVERDALE.clearing.halfX * 2 + 1;
    const girder = new THREE.BoxGeometry(span, 1.05, 0.7);
    girder.translate(0, top - 0.52, z);
    slabParts.push(girder);
  }
  // Edge beams along each column row.
  for (const z of RIVERDALE.columnRows) {
    const edge = new THREE.BoxGeometry(RIVERDALE.length, 0.55, 0.5);
    edge.translate(0, top - 0.27, z);
    slabParts.push(edge);
  }
  const fascia = new THREE.BoxGeometry(RIVERDALE.length + 1.2, 2.6, 0.8);
  fascia.translate(0, top + 1, RIVERDALE_HALF_Z + 0.1);
  slabParts.push(fascia);
  const slabGeo = keepGeo(kit, mergeGeometries(slabParts.map((g) => g.toNonIndexed())) ?? slab);
  slabParts.forEach((g) => g.dispose());
  const slabMesh = new THREE.Mesh(slabGeo, slabMat);
  slabMesh.name = 'riverdale-slab';
  slabMesh.castShadow = true;
  slabMesh.receiveShadow = true;
  group.add(slabMesh);
  kit.occluders.push(slabMesh);

  const facadeMap = facade();
  kit.textures.push(facadeMap);
  if (facadeMap) facadeMap.repeat.set(14, 3);
  const facadeMat = keep(kit, new THREE.MeshStandardMaterial({ map: facadeMap, color: 0x8c8a86, roughness: 0.9 }));
  const building = new THREE.Mesh(keepGeo(kit, new THREE.BoxGeometry(RIVERDALE.length + 1, 15, 34)), facadeMat);
  building.position.set(0, top + 2.3 + 7.5, -6);
  building.castShadow = true;
  group.add(building);

  // --- Columns ------------------------------------------------------------------------
  const skins = columnSkins();
  skins.forEach((s) => kit.textures.push(s.map));
  const columnMats = skins.map((s) => keep(kit, new THREE.MeshStandardMaterial({ map: s.map, color: 0xd8d6d0, roughness: 0.92 })));
  const columnGeo = new THREE.BoxGeometry(RIVERDALE.columnSize, 1, RIVERDALE.columnSize);
  columnGeo.translate(0, 0.5, 0);
  const byskin: THREE.Matrix4[][] = skins.map(() => []);
  const columns = riverdaleColumns();
  columns.forEach((c, i) => {
    const base = c.base - 0.4;
    const skin = c.row === 3 || (c.row === 0 && Math.abs(c.x) < 30) ? 1 + ((i * 7) % 3) : (i * 5) % 4;
    byskin[skin].push(placeMatrix(c.x, base, c.z, 0, [1, top - base, 1]));
  });
  byskin.forEach((list, skin) => {
    if (!list.length) return;
    const mesh = scatter(kit, skin === 0 ? columnGeo : columnGeo.clone(), columnMats[skin], list, { shadow: true, name: 'riverdale-columns' });
    kit.occluders.push(mesh);
  });

  // Two wide graffiti pillars on the back-left hide a nook against the wall.
  for (const p of NOOK_PILLARS) {
    const base = riverdaleGround(p.x, p.z) - 0.4;
    const geo = keepGeo(kit, new THREE.BoxGeometry(p.w, top - base, p.d));
    const pillar = new THREE.Mesh(geo, columnMats[3]);
    pillar.position.set(p.x, base + (top - base) / 2, p.z);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    group.add(pillar);
    kit.occluders.push(pillar);
  }

  // Ivy climbs the columns nearest the woods.
  const ivy = leafCard('ivy');
  kit.textures.push(ivy);
  const ivyMat = keep(kit, new THREE.MeshStandardMaterial({ map: ivy, alphaTest: 0.45, side: THREE.DoubleSide, color: 0xb8d0a0, roughness: 0.8 }));
  const vineGeo = new THREE.PlaneGeometry(0.62, 1);
  vineGeo.translate(0, 0.5, 0);
  const vines: THREE.Matrix4[] = [];
  for (const c of columns) {
    const nearWoods = c.row === 3 || Math.abs(c.x) > RIVERDALE_HALF_X - 6;
    if (!nearWoods || rand() < 0.35) continue;
    const h = 2.5 + rand() * 4.5;
    const face = Math.floor(rand() * 4);
    const yaw = (face * Math.PI) / 2;
    const off = RIVERDALE.columnSize / 2 + 0.02;
    vines.push(placeMatrix(c.x + Math.sin(yaw) * off, c.base - 0.2, c.z + Math.cos(yaw) * off, yaw, [1, h, 1]));
  }
  scatter(kit, vineGeo, ivyMat, vines, { name: 'riverdale-vines' });

  // --- Back retaining wall --------------------------------------------------------------
  const wallBase = riverdaleDirt(0, -RIVERDALE_HALF_Z) - 2.2;
  const wallMat = keep(kit, surfaceMaterial(slabMaps, { color: 0x8e8c86, roughness: 0.95, normalAmount: 0.8 }));
  const wall = new THREE.Mesh(keepGeo(kit, new THREE.BoxGeometry(RIVERDALE.length + 1.2, top - wallBase + 0.2, 0.7)), wallMat);
  wall.position.set(0, wallBase + (top - wallBase) / 2, -RIVERDALE_HALF_Z - 0.35);
  wall.receiveShadow = true;
  group.add(wall);
  kit.occluders.push(wall);
  const panelCount = 7;
  const panelW = RIVERDALE.length / panelCount;
  for (let i = 0; i < panelCount; i += 1) {
    const map = wallGraffiti(1201 + i * 37);
    kit.textures.push(map);
    const mat = keep(kit, new THREE.MeshStandardMaterial({ map, roughness: 0.9, color: 0xd8d6d0 }));
    const x = -RIVERDALE_HALF_X + panelW * (i + 0.5);
    const ground = riverdaleGround(x, -RIVERDALE_HALF_Z + 0.4);
    const h = panelW / 4;
    const panel = new THREE.Mesh(keepGeo(kit, new THREE.PlaneGeometry(panelW, h)), mat);
    panel.position.set(x, ground + h / 2 - 0.15, -RIVERDALE_HALF_Z + 0.01);
    panel.receiveShadow = true;
    group.add(panel);
  }

  // --- Loading ledge on the embankment ------------------------------------------------
  {
    const l = RIVERDALE.ledge;
    const lTop = ledgeTop();
    const low = Math.min(riverdaleDirt(l.x0, l.z1), riverdaleDirt(l.x1, l.z1)) - 0.6;
    const ledge = new THREE.Mesh(keepGeo(kit, new THREE.BoxGeometry(l.x1 - l.x0, lTop - low, l.z1 - l.z0)), wallMat);
    ledge.position.set((l.x0 + l.x1) / 2, low + (lTop - low) / 2, (l.z0 + l.z1) / 2);
    ledge.castShadow = true;
    ledge.receiveShadow = true;
    group.add(ledge);
    kit.occluders.push(ledge);
  }

  // --- Steel ----------------------------------------------------------------------------
  const steelMaps = rustSteel();
  kit.textures.push(...steelMaps.textures);
  const steelMat = keep(kit, surfaceMaterial(steelMaps, { color: 0xc06a5a, roughness: 0.7, metalness: 0.45, normalAmount: 1 }));
  const steel: THREE.BufferGeometry[] = [];
  const at = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const xs = columnXs();
  const present = new Set(columns.map((c) => `${c.x}:${c.z}`));
  const has = (x: number, z: number) => present.has(`${x}:${z}`);
  const half = RIVERDALE.columnSize / 2;
  const headroom = (x: number, z: number) => riverdaleGround(x, z) + 3.4;
  RIVERDALE.columnRows.forEach((z, row) => {
    for (let i = 0; i < xs.length - 1; i += 1) {
      const x0 = xs[i];
      const x1 = xs[i + 1];
      if (!has(x0, z) || !has(x1, z)) continue;
      const strut = beamHeight(x0, z, x1, z);
      steel.push(beamGeometry(at(x0 + half, strut, z), at(x1 - half, strut, z), 0.12, 0.32));
      // Alternate bays on the outer rows carry the long X-braces.
      const outer = row === 0 || row === 3;
      if (outer && (i + row) % 2 === 0) {
        const low0 = Math.max(headroom(x0, z), strut - 2.6);
        const low1 = Math.max(headroom(x1, z), strut - 2.6);
        steel.push(beamGeometry(at(x0 + half, top - 0.5, z + 0.12), at(x1 - half, Math.min(low1, strut - 0.3), z + 0.12), 0.1, 0.24));
        steel.push(beamGeometry(at(x0 + half, Math.min(low0, strut - 0.3), z - 0.12), at(x1 - half, top - 0.5, z - 0.12), 0.1, 0.24));
      }
    }
  });
  // Cross struts between rows, and diagonals reaching in from the ends like the far bays in the photos.
  for (const x of xs) {
    for (let r = 0; r < RIVERDALE.columnRows.length - 1; r += 1) {
      const z0 = RIVERDALE.columnRows[r];
      const z1 = RIVERDALE.columnRows[r + 1];
      if (!has(x, z0) || !has(x, z1)) continue;
      const strut = beamHeight(x, z0, x, z1);
      steel.push(beamGeometry(at(x, strut - 0.4, z0 + half), at(x, strut - 0.4, z1 - half), 0.12, 0.3));
      if (Math.abs(x) > RIVERDALE.clearing.halfX && (Math.round(x / 9) + r) % 3 === 0) {
        steel.push(beamGeometry(at(x + 0.12, top - 0.5, z0 + half), at(x + 0.12, strut - 0.5, z1 - half), 0.1, 0.24));
      }
    }
  }
  // Bolted plates where the steel meets each column.
  for (const c of columns) {
    const plate = new THREE.BoxGeometry(RIVERDALE.columnSize + 0.08, 0.5, RIVERDALE.columnSize + 0.08);
    plate.translate(c.x, strutHeight(c.x, c.z), c.z);
    steel.push(plate);
  }
  // Long diagonal over the party bay from the transfer girder down to the front row.
  const strut = RIVERDALE.strutY;
  steel.push(beamGeometry(at(-RIVERDALE.clearing.halfX, top - 0.9, RIVERDALE.columnRows[2]), at(-4.5, strut, RIVERDALE.columnRows[3] - half), 0.12, 0.3));
  steel.push(beamGeometry(at(RIVERDALE.clearing.halfX, top - 0.9, RIVERDALE.columnRows[1]), at(4.5, strut, RIVERDALE.columnRows[0] + half), 0.12, 0.3));
  const steelGeo = keepGeo(kit, mergeGeometries(steel.map((g) => g.toNonIndexed())) ?? new THREE.BoxGeometry(0.1, 0.1, 0.1));
  steel.forEach((g) => g.dispose());
  const steelMesh = new THREE.Mesh(steelGeo, steelMat);
  steelMesh.name = 'riverdale-steel';
  steelMesh.castShadow = true;
  steelMesh.receiveShadow = true;
  group.add(steelMesh);

  // Slack cables strung between columns.
  const cablePoints: number[] = [];
  for (let k = 0; k < 14; k += 1) {
    const a = columns[Math.floor(rand() * columns.length)];
    const b = columns.find((c) => c !== a && Math.abs(c.x - a.x) <= 9.1 && Math.abs(c.z - a.z) <= 9.1 && rand() < 0.5);
    if (!b) continue;
    const y0 = beamHeight(a.x, a.z, b.x, b.z) - 0.8 - rand() * 1.5;
    const sag = 0.6 + rand();
    let prev: THREE.Vector3 | null = null;
    for (let s = 0; s <= 10; s += 1) {
      const t = s / 10;
      const p = new THREE.Vector3(a.x + (b.x - a.x) * t, y0 - Math.sin(Math.PI * t) * sag, a.z + (b.z - a.z) * t);
      if (prev) cablePoints.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
      prev = p;
    }
  }
  const cableGeo = keepGeo(kit, new THREE.BufferGeometry());
  cableGeo.setAttribute('position', new THREE.Float32BufferAttribute(cablePoints, 3));
  const cables = new THREE.LineSegments(cableGeo, keep(kit, new THREE.LineBasicMaterial({ color: 0x1c1a18 })));
  group.add(cables);

  return { columns };
}
