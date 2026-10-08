import * as THREE from 'three';

/**
 * Load-time geometry repairs for known defects in generated (Tripo) models.
 * Each repair is opt-in per model so a legitimately multi-shell figure (hair,
 * jackets, straps) is never touched by accident.
 */
export interface GlbRepair {
  /**
   * Limbs the generator grew twice, as one list of bone names per limb (root
   * joint first, tip last). Both copies ride the same bones and neither lines
   * up with them. Per limb, the copy nearest the knee joint is kept and slid
   * onto the bones; the other copy is folded onto the kept one, a hair under
   * its surface, so it vanishes while still patching the gaps the generator
   * left where the two copies ran through each other. Stretches where the
   * copies have already merged into one shape are left whole and only
   * re-centred.
   */
  dedupeLimbs?: string[][];
}

const _m = new THREE.Matrix4();
const _bindInverse = new THREE.Matrix4();
const _axis = new THREE.Vector3();
const _u = new THREE.Vector3();
const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _facing = new THREE.Vector3();

/** Limb weight from which a vertex is dragged along with the limb at all. */
const LIMB_ANY = 0.02;
/** Limb weight below which a vertex belongs to the body, not the limb surface. */
const LIMB_MIN = 0.2;
/** Limb weight from which a vertex counts as solidly on the limb. */
const LIMB_SOLID = 0.5;
/** Thickness of the cross-section bands walked along the limb. */
const BAND = 0.03;
/** Fraction of the knee→ankle segment, below the knee, used to find the two copies. */
const SEED_SPAN = 0.3;
/** Smallest copy offset worth treating as a duplicate. */
const MIN_OFFSET = 0.05;
/** Bearing samples describing each copy's outline within a band. */
const PROFILE_BINS = 24;
/** Bands over which the fold eases in at each end of the split stretch. */
const FOLD_EASE = 3;
/**
 * Radius scale applied when folding the lost copy onto the kept one: just
 * under the kept surface, so it is hidden without z-fighting yet still shows
 * through wherever the kept surface has a gap.
 */
const FOLD_SCALE = 0.97;

export function applyGlbRepair(root: THREE.Object3D, repair: GlbRepair, label: string) {
  root.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    if (repair.dedupeLimbs?.length) {
      const result = dedupeLimbs(mesh, repair.dedupeLimbs);
      if (result) {
        console.info(
          '[raid] %s: folded duplicate limb copies (%d vertices, %d bridging faces cut) on %s',
          label,
          result.folded,
          result.cut,
          result.limbs.join(', '),
        );
      }
    }
  });
}

interface LimbScan {
  bones: string[];
  /** Displacement to apply, xyz per vertex. */
  move: Float32Array;
  /** Outward normal for folded vertices (zero elsewhere) and how far to adopt it, per vertex. */
  facing: Float32Array;
  facingBlend: Float32Array;
  /** Vertices that sat on the lost copy. */
  folded: number;
}

/** Joint position in geometry space (bindMatrix maps geometry to the skeleton's bind space). */
function jointPosition(mesh: THREE.SkinnedMesh, boneIndex: number, out: THREE.Vector3) {
  _bindInverse.copy(mesh.bindMatrix).invert();
  _m.copy(mesh.skeleton.boneInverses[boneIndex]).invert().premultiply(_bindInverse);
  return out.setFromMatrixPosition(_m);
}

function dedupeLimbs(mesh: THREE.SkinnedMesh, limbs: string[][]) {
  const geometry = mesh.geometry;
  const index = geometry.index;
  const quantized = geometry.attributes.position;
  const skinIndex = geometry.attributes.skinIndex;
  const skinWeight = geometry.attributes.skinWeight;
  if (!index || !quantized || !skinIndex || !skinWeight) return null;
  // Tripo exports quantised (normalised int16, interleaved) positions whose
  // range the feet already sit on the edge of; any slide would wrap them to
  // the far side of the model. Work on a plain float copy instead.
  const position = new THREE.BufferAttribute(new Float32Array(quantized.count * 3), 3);
  for (let i = 0; i < quantized.count; i += 1) position.setXYZ(i, quantized.getX(i), quantized.getY(i), quantized.getZ(i));
  const names = mesh.skeleton.bones.map((b) => b.name);
  const count = position.count;
  const indices = index.array;

  // Each vertex follows the limb it is mostly skinned to, moving by its total
  // limb weight: a vertex where two copies of different limbs were welded
  // together (the inner knees) is fully a leg vertex even though its weight is
  // split between the two legs, and must travel all the way with one of them.
  const candidates = limbs
    .map((bones) => ({ bones, ids: bones.map((n) => names.indexOf(n)) }))
    .filter((c) => c.ids.length >= 3 && c.ids.every((i) => i >= 0));
  if (!candidates.length) return null;
  const weights = candidates.map(({ ids }) => {
    const weight = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      for (let k = 0; k < 4; k += 1) {
        if (ids.includes(skinIndex.getComponent(i, k))) weight[i] += skinWeight.getComponent(i, k);
      }
    }
    return weight;
  });
  const owner = new Int8Array(count).fill(-1);
  for (let i = 0; i < count; i += 1) {
    let best = 0;
    let total = 0;
    for (let l = 0; l < weights.length; l += 1) {
      total += weights[l][i];
      if (weights[l][i] > weights[best][i]) best = l;
    }
    for (let l = 0; l < weights.length; l += 1) weights[l][i] = l === best ? Math.min(1, total) : 0;
    if (total >= LIMB_SOLID) owner[i] = best;
  }

  const scans: LimbScan[] = [];
  candidates.forEach(({ bones, ids }, l) => {
    const scan = scanLimb(mesh, ids, bones, weights[l], position);
    if (scan) scans.push(scan);
  });
  if (!scans.length) return null;

  // Folded vertices face outward from the kept copy; their old normals could
  // point into it and shade the patch they cover as a dark backface.
  const quantizedNormal = geometry.attributes.normal;
  const normal = quantizedNormal ? new THREE.BufferAttribute(new Float32Array(count * 3), 3) : null;
  if (normal && quantizedNormal) {
    for (let i = 0; i < count; i += 1) normal.setXYZ(i, quantizedNormal.getX(i), quantizedNormal.getY(i), quantizedNormal.getZ(i));
  }
  let folded = 0;
  for (const scan of scans) {
    folded += scan.folded;
    for (let i = 0; i < count; i += 1) {
      const dx = scan.move[i * 3];
      const dy = scan.move[i * 3 + 1];
      const dz = scan.move[i * 3 + 2];
      if (dx === 0 && dy === 0 && dz === 0) continue;
      position.setXYZ(i, position.getX(i) + dx, position.getY(i) + dy, position.getZ(i) + dz);
      const blend = scan.facingBlend[i];
      if (normal && blend > 0) {
        _p.fromBufferAttribute(normal, i)
          .multiplyScalar(1 - blend)
          .addScaledVector(_facing.fromArray(scan.facing, i * 3), blend)
          .normalize();
        normal.setXYZ(i, _p.x, _p.y, _p.z);
      }
    }
  }
  if (!folded) return null;
  if (normal) geometry.setAttribute('normal', normal);

  // Faces that joined one limb straight to another only existed because two
  // copies ran into each other; now that the limbs stand apart they would
  // stretch across the gap. The folded copies cover whatever they leave open.
  const kept: number[] = [];
  let cut = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t];
    const b = indices[t + 1];
    const c = indices[t + 2];
    const first = owner[a] >= 0 ? owner[a] : owner[b] >= 0 ? owner[b] : owner[c];
    if ((owner[a] >= 0 && owner[a] !== first) || (owner[b] >= 0 && owner[b] !== first) || (owner[c] >= 0 && owner[c] !== first)) {
      cut += 1;
      continue;
    }
    kept.push(a, b, c);
  }
  if (cut) geometry.setIndex(kept);
  geometry.setAttribute('position', position);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { folded, cut, limbs: scans.map((s) => s.bones[0]) };
}

interface Band {
  /** Cross-section centre of every limb vertex in the band. */
  m: [number, number];
  /** Copy centres (index 0 on the −offset side) when the band shows two copies. */
  c: [number, number, number, number];
  /** Mean radius of each copy. */
  r: [number, number];
  /** Radius of each copy by bearing around its centre (`PROFILE_BINS` samples). */
  profile: [Float32Array, Float32Array];
  /** False where the copies have merged into one shape. */
  split: boolean;
  /** True once the band held enough vertices for `m` and `c` to mean anything. */
  measured: boolean;
  /** Solid limb vertices in the band. */
  n: number;
}

function scanLimb(
  mesh: THREE.SkinnedMesh,
  ids: number[],
  bones: string[],
  weight: Float32Array,
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
): LimbScan | null {
  const count = position.count;
  const joints = ids.map((id) => jointPosition(mesh, id, new THREE.Vector3()));
  const root = joints[0];
  const knee = joints[1];
  const ankle = joints[2];
  const tip = joints[joints.length - 1];
  _axis.subVectors(tip, root);
  if (_axis.lengthSq() < 1e-8) return null;
  _axis.normalize();
  _u.set(1, 0, 0);
  if (Math.abs(_axis.x) > 0.8) _u.set(0, 0, 1);
  _u.cross(_axis).normalize();
  _v.crossVectors(_axis, _u).normalize();

  // Cross-section coordinates: s along the axis, (a, b) across it.
  const s = new Float32Array(count);
  const a = new Float32Array(count);
  const b = new Float32Array(count);
  const limb: number[] = [];
  let sMin = Infinity;
  let sMax = -Infinity;
  for (let i = 0; i < count; i += 1) {
    if (weight[i] < LIMB_ANY) continue;
    _p.fromBufferAttribute(position, i).sub(root);
    s[i] = _p.dot(_axis);
    a[i] = _p.dot(_u);
    b[i] = _p.dot(_v);
    limb.push(i);
    sMin = Math.min(sMin, s[i]);
    sMax = Math.max(sMax, s[i]);
  }
  if (limb.length < 200) return null;

  // Find the copy offset just below the knee, where two legs stand clearly apart.
  const jointS = joints.map((j) => _p.subVectors(j, root).dot(_axis));
  const jointA = joints.map((j) => _p.subVectors(j, root).dot(_u));
  const jointB = joints.map((j) => _p.subVectors(j, root).dot(_v));
  const seedLo = Math.min(jointS[1], jointS[1] + SEED_SPAN * (jointS[2] - jointS[1]));
  const seedHi = Math.max(jointS[1], jointS[1] + SEED_SPAN * (jointS[2] - jointS[1]));
  const seeds = limb.filter((i) => weight[i] >= 0.6 && s[i] >= seedLo && s[i] <= seedHi);
  if (seeds.length < 120) return null;
  const offset = principalOffset(seeds, a, b);
  const offsetLength = Math.hypot(offset[0], offset[1]);
  if (offsetLength < MIN_OFFSET) return null;
  const dir: [number, number] = [offset[0] / offsetLength, offset[1] / offsetLength];
  const seedBand = measureBand(seeds, seeds, a, b, dir, offsetLength);
  if (!seedBand.split) return null;

  // Measure every band along the limb the same way. The copies form one
  // contiguous split stretch around the knee; isolated split verdicts beyond
  // it (a foot band that happens to look like two lumps) are ignored, and
  // single fused bands inside it are bridged.
  const bandCount = Math.ceil((sMax - sMin) / BAND) + 1;
  const bandOf = (i: number) => Math.min(bandCount - 1, Math.floor((s[i] - sMin) / BAND));
  const members: number[][] = Array.from({ length: bandCount }, () => []);
  const all: number[][] = Array.from({ length: bandCount }, () => []);
  for (const i of limb) {
    if (weight[i] >= LIMB_MIN) all[bandOf(i)].push(i);
    if (weight[i] >= LIMB_SOLID) members[bandOf(i)].push(i);
  }
  const bands = members.map((list, k) => measureBand(list, all[k], a, b, dir, offsetLength));
  const kneeBand = Math.min(bandCount - 1, Math.max(0, Math.floor(((seedLo + seedHi) / 2 - sMin) / BAND)));
  let lo = kneeBand;
  let hi = kneeBand;
  while (lo > 0 && (bands[lo - 1].split || (lo > 1 && bands[lo - 2].split))) lo -= 1;
  while (hi < bandCount - 1 && (bands[hi + 1].split || (hi < bandCount - 2 && bands[hi + 2].split))) hi += 1;
  bands.forEach((band, k) => {
    band.split = k >= lo && k <= hi && band.measured;
  });
  let largest = 0;
  for (const band of bands) largest = Math.max(largest, band.n);

  // Keep the copy whose knee sits nearest the knee joint.
  const c = seedBand.c;
  const d0 = Math.hypot(c[0] - jointA[1], c[1] - jointB[1]);
  const d1 = Math.hypot(c[2] - jointA[1], c[3] - jointB[1]);
  const keep = d0 <= d1 ? 0 : 1;
  const lose = 1 - keep;

  // Per-band slide that puts the kept copy (or the merged shape) on the bone
  // chain. Below the ankle the foot moves rigidly with the ankle. Empty bands
  // borrow from their neighbours and the result is smoothed so the limb bends
  // gently instead of stepping between bands.
  const ankleBand = Math.min(bandCount - 1, Math.max(0, Math.floor((jointS[2] - sMin) / BAND)));
  const raw = new Float32Array(bandCount * 2);
  const has = new Uint8Array(bandCount);
  for (let k = 0; k < bandCount; k += 1) {
    const band = bands[k];
    // Sparse bands near the hip only hold the outer face of the thigh and
    // would bias the centre, so they inherit from the full bands below.
    if (!band.measured || band.n < largest * 0.25 || k > ankleBand) continue;
    const sMid = sMin + (k + 0.5) * BAND;
    const [ta, tb] = boneTarget(sMid, jointS, jointA, jointB);
    const ca = band.split ? band.c[keep * 2] : band.m[0];
    const cb = band.split ? band.c[keep * 2 + 1] : band.m[1];
    raw[k * 2] = ca - ta;
    raw[k * 2 + 1] = cb - tb;
    has[k] = 1;
  }
  fillGaps(raw, has, bandCount);
  const shift = smooth(raw, bandCount, 2);

  // Ease the fold in over the first bands at either end of the split stretch,
  // so the lost copy tapers into the kept one where the two shapes merge
  // instead of stepping across.
  const ease = new Float32Array(bandCount);
  for (let k = lo; k <= hi; k += 1) ease[k] = Math.min(1, (k - lo + 1) / FOLD_EASE, (hi - k + 1) / FOLD_EASE);

  const move = new Float32Array(count * 3);
  const facing = new Float32Array(count * 3);
  const facingBlend = new Float32Array(count);
  let folded = 0;
  for (const i of limb) {
    const w = weight[i];
    const band = bands[bandOf(i)];
    // Interpolate between band centres so everything is continuous in s.
    const t = Math.min(bandCount - 1, Math.max(0, (s[i] - sMin) / BAND - 0.5));
    const k0 = Math.floor(t);
    const k1 = Math.min(bandCount - 1, k0 + 1);
    const f = t - k0;
    // Anything at least half leg slides the whole way, so the hem of the
    // shorts travels with the thigh instead of being left as a ledge above it;
    // the rest of the hips follow in proportion to their leg weight.
    const slide = Math.min(1, w / LIMB_SOLID);
    let da = -slide * (shift[k0 * 2] * (1 - f) + shift[k1 * 2] * f);
    let db = -slide * (shift[k0 * 2 + 1] * (1 - f) + shift[k1 * 2 + 1] * f);
    if (band.split) {
      // Blend the two copies' centres from the neighbouring split bands.
      const b0 = bands[k0].split ? bands[k0] : band;
      const b1 = bands[k1].split ? bands[k1] : band;
      const ka = b0.c[keep * 2] * (1 - f) + b1.c[keep * 2] * f;
      const kb = b0.c[keep * 2 + 1] * (1 - f) + b1.c[keep * 2 + 1] * f;
      const la = b0.c[lose * 2] * (1 - f) + b1.c[lose * 2] * f;
      const lb = b0.c[lose * 2 + 1] * (1 - f) + b1.c[lose * 2 + 1] * f;
      const dk = Math.hypot(a[i] - ka, b[i] - kb);
      const dl = Math.hypot(a[i] - la, b[i] - lb);
      if (dl < dk) {
        // Project the vertex radially from the kept copy's centre onto the kept
        // outline. The whole lost copy collapses onto the side of the kept one
        // it was next to, so faces that joined the two never cut across the
        // kept copy's interior, and the gap it chewed into that side is covered.
        const theta = Math.atan2(b[i] - kb, a[i] - ka);
        const radius = profileAt(b0.profile[keep], theta) * (1 - f) + profileAt(b1.profile[keep], theta) * f;
        const ta = ka + Math.cos(theta) * radius * FOLD_SCALE;
        const tb = kb + Math.sin(theta) * radius * FOLD_SCALE;
        // The lost copy folds fully as soon as a vertex is more leg than body, so
        // its thigh closes onto the kept one right under the hem instead of
        // smearing across the gap; only the hem ring itself stays put.
        const solid = Math.min(1, Math.max(0, (w - LIMB_MIN) / (LIMB_SOLID - LIMB_MIN)));
        const g = solid * (ease[k0] * (1 - f) + ease[k1] * f);
        da += g * (ta - a[i]);
        db += g * (tb - b[i]);
        _facing.set(0, 0, 0).addScaledVector(_u, Math.cos(theta)).addScaledVector(_v, Math.sin(theta));
        facing[i * 3] = _facing.x;
        facing[i * 3 + 1] = _facing.y;
        facing[i * 3 + 2] = _facing.z;
        facingBlend[i] = g;
        folded += 1;
      }
    }
    _p.set(0, 0, 0).addScaledVector(_u, da).addScaledVector(_v, db);
    move[i * 3] = _p.x;
    move[i * 3 + 1] = _p.y;
    move[i * 3 + 2] = _p.z;
  }
  return { bones, move, facing, facingBlend, folded };
}

/** Radius of a copy at bearing `theta`, interpolated between profile bins. */
function profileAt(profile: Float32Array, theta: number) {
  const bins = profile.length;
  const x = ((theta / (2 * Math.PI)) * bins + bins * 10) % bins;
  const j0 = Math.floor(x);
  const j1 = (j0 + 1) % bins;
  const f = x - j0;
  return profile[j0] * (1 - f) + profile[j1] * f;
}

/** Cross-section position of the bone chain at `s` (piecewise linear between joints). */
function boneTarget(s: number, jointS: number[], jointA: number[], jointB: number[]): [number, number] {
  const last = jointS.length - 1;
  if (s <= jointS[0]) return [jointA[0], jointB[0]];
  for (let j = 0; j < last; j += 1) {
    if (s <= jointS[j + 1]) {
      const span = jointS[j + 1] - jointS[j];
      const f = span > 1e-6 ? (s - jointS[j]) / span : 0;
      return [jointA[j] + (jointA[j + 1] - jointA[j]) * f, jointB[j] + (jointB[j + 1] - jointB[j]) * f];
    }
  }
  return [jointA[last], jointB[last]];
}

function fillGaps(values: Float32Array, has: Uint8Array, n: number) {
  let lastKnown = -1;
  for (let k = 0; k < n; k += 1) {
    if (has[k]) {
      if (lastKnown < 0) for (let j = 0; j < k; j += 1) values.set(values.subarray(k * 2, k * 2 + 2), j * 2);
      lastKnown = k;
    } else if (lastKnown >= 0) {
      values.set(values.subarray(lastKnown * 2, lastKnown * 2 + 2), k * 2);
    }
  }
}

function smooth(values: Float32Array, n: number, radius: number) {
  const out = new Float32Array(values.length);
  for (let k = 0; k < n; k += 1) {
    let sa = 0;
    let sb = 0;
    let total = 0;
    for (let j = Math.max(0, k - radius); j <= Math.min(n - 1, k + radius); j += 1) {
      sa += values[j * 2];
      sb += values[j * 2 + 1];
      total += 1;
    }
    out[k * 2] = sa / total;
    out[k * 2 + 1] = sb / total;
  }
  return out;
}

/** Offset between the two halves of a cross-section split along its principal direction. */
function principalOffset(seeds: number[], a: Float32Array, b: Float32Array): [number, number] {
  let ma = 0;
  let mb = 0;
  for (const i of seeds) {
    ma += a[i];
    mb += b[i];
  }
  ma /= seeds.length;
  mb /= seeds.length;
  let saa = 0;
  let sab = 0;
  let sbb = 0;
  for (const i of seeds) {
    saa += (a[i] - ma) ** 2;
    sab += (a[i] - ma) * (b[i] - mb);
    sbb += (b[i] - mb) ** 2;
  }
  const theta = 0.5 * Math.atan2(2 * sab, saa - sbb);
  const ea = Math.cos(theta);
  const eb = Math.sin(theta);
  const half = [0, 0, 0, 0];
  const n = [0, 0];
  for (const i of seeds) {
    const side = (a[i] - ma) * ea + (b[i] - mb) * eb < 0 ? 0 : 1;
    half[side * 2] += a[i];
    half[side * 2 + 1] += b[i];
    n[side] += 1;
  }
  if (!n[0] || !n[1]) return [0, 0];
  return [half[2] / n[1] - half[0] / n[0], half[3] / n[1] - half[1] / n[0]];
}

/**
 * Splits a band's cross-section into two clusters along the copy offset and
 * decides whether they really are two copies: the clusters must sit most of
 * an offset apart and neither may be a thin sliver along the offset (which is
 * what the two halves of a single merged ring look like).
 */
function measureBand(
  members: number[],
  all: number[],
  a: Float32Array,
  b: Float32Array,
  dir: [number, number],
  offsetLength: number,
): Band {
  const band: Band = {
    m: [0, 0],
    c: [0, 0, 0, 0],
    r: [0, 0],
    profile: [new Float32Array(PROFILE_BINS), new Float32Array(PROFILE_BINS)],
    split: false,
    measured: false,
    n: members.length,
  };
  if (members.length < 8) return band;
  for (const i of all) {
    band.m[0] += a[i];
    band.m[1] += b[i];
  }
  band.m[0] /= all.length;
  band.m[1] /= all.length;
  let ma = 0;
  let mb = 0;
  for (const i of members) {
    ma += a[i];
    mb += b[i];
  }
  ma /= members.length;
  mb /= members.length;
  const c = band.c;
  c[0] = ma - (dir[0] * offsetLength) / 2;
  c[1] = mb - (dir[1] * offsetLength) / 2;
  c[2] = ma + (dir[0] * offsetLength) / 2;
  c[3] = mb + (dir[1] * offsetLength) / 2;
  const label = new Uint8Array(members.length);
  const n = [0, 0];
  for (let iteration = 0; iteration < 10; iteration += 1) {
    const sum = [0, 0, 0, 0];
    n[0] = 0;
    n[1] = 0;
    members.forEach((i, j) => {
      const d0 = Math.hypot(a[i] - c[0], b[i] - c[1]);
      const d1 = Math.hypot(a[i] - c[2], b[i] - c[3]);
      const k = d0 <= d1 ? 0 : 1;
      label[j] = k;
      sum[k * 2] += a[i];
      sum[k * 2 + 1] += b[i];
      n[k] += 1;
    });
    for (let k = 0; k < 2; k += 1) {
      if (n[k] < 4) continue;
      c[k * 2] = sum[k * 2] / n[k];
      c[k * 2 + 1] = sum[k * 2 + 1] / n[k];
    }
  }
  if (n[0] < 4 || n[1] < 4) return band;
  band.measured = true;
  // Cluster 0 stays on the −offset side.
  if ((c[2] - c[0]) * dir[0] + (c[3] - c[1]) * dir[1] < 0) {
    band.c = [c[2], c[3], c[0], c[1]];
    n.reverse();
    for (let j = 0; j < label.length; j += 1) label[j] = 1 - label[j];
  }
  const along = [0, 0];
  const across = [0, 0];
  const binSum = [new Float32Array(PROFILE_BINS), new Float32Array(PROFILE_BINS)];
  const binCount = [new Uint16Array(PROFILE_BINS), new Uint16Array(PROFILE_BINS)];
  members.forEach((i, j) => {
    const k = label[j];
    const da = a[i] - band.c[k * 2];
    const db = b[i] - band.c[k * 2 + 1];
    const d = da * dir[0] + db * dir[1];
    along[k] += d * d;
    across[k] += da * da + db * db - d * d;
    const radius = Math.hypot(da, db);
    band.r[k] += radius;
    const bin = Math.round((Math.atan2(db, da) / (2 * Math.PI)) * PROFILE_BINS + PROFILE_BINS * 10) % PROFILE_BINS;
    binSum[k][bin] += radius;
    binCount[k][bin] += 1;
  });
  for (let k = 0; k < 2; k += 1) {
    band.r[k] /= n[k];
    fillProfile(band.profile[k], binSum[k], binCount[k], band.r[k]);
  }
  const separation = (band.c[2] - band.c[0]) * dir[0] + (band.c[3] - band.c[1]) * dir[1];
  const sliver = (k: number) => Math.sqrt(along[k] / Math.max(1e-9, across[k])) < 0.4;
  band.split = separation >= 0.6 * offsetLength && !sliver(0) && !sliver(1);
  return band;
}

/**
 * Mean radius per bearing bin; bins with no vertices (a gap the other copy
 * cut into this one) are bridged by interpolating round to the nearest
 * filled bins on either side.
 */
function fillProfile(profile: Float32Array, sum: Float32Array, count: Uint16Array, fallback: number) {
  const bins = profile.length;
  let filled = 0;
  for (let j = 0; j < bins; j += 1) {
    if (count[j]) {
      profile[j] = sum[j] / count[j];
      filled += 1;
    }
  }
  if (!filled) {
    profile.fill(fallback);
    return;
  }
  for (let j = 0; j < bins; j += 1) {
    if (count[j]) continue;
    let before = 1;
    while (!count[(j - before + bins) % bins]) before += 1;
    let after = 1;
    while (!count[(j + after) % bins]) after += 1;
    const pb = profile[(j - before + bins) % bins];
    const pa = profile[(j + after) % bins];
    profile[j] = (pb * after + pa * before) / (before + after);
  }
}
