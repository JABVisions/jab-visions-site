import { RYDERZ, type RyderId, type RyderSpec } from '../config';
import { preloadRyderGltf, ryderModelMotion } from '../characters';
import { skinnedSpec } from './apply';
import { skinFor, type SkinDef } from './catalog';

/**
 * Runtime side of skins: is a skin's model on the server, does it load, can it
 * animate, and which spec should a scene build for a Ryder right now.
 *
 * - default:  the Ryder's own model
 * - ready:    the skin's model is rigged and plays in every scene
 * - static:   the file loads but has no skeleton; preview only until rigged
 * - missing:  no file at the configured path yet
 * - error:    the file is there but failed to load
 */
export type SkinStatus = 'default' | 'ready' | 'static' | 'missing' | 'error';

const statusOf = new Map<string, Promise<SkinStatus>>();
const settled = new Map<string, SkinStatus>();
const listeners = new Set<() => void>();

function settle(id: string, status: SkinStatus) {
  settled.set(id, status);
  listeners.forEach((listener) => listener());
  return status;
}

async function probe(url: string) {
  try {
    const response = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    return response.ok;
  } catch {
    return false;
  }
}

/** Check a skin once per session. Later callers share the answer. */
export function skinStatus(skin: SkinDef): Promise<SkinStatus> {
  if (!skin.model) return Promise.resolve('default');
  const known = statusOf.get(skin.id);
  if (known) return known;
  const spec = skinnedSpec(RYDERZ[skin.ryderId], skin);
  const check = (async (): Promise<SkinStatus> => {
    if (!(await probe(skin.model!.glb))) return settle(skin.id, 'missing');
    try {
      await preloadRyderGltf(spec);
    } catch (error) {
      console.warn('[raid] skin %s failed to load', skin.id, error);
      return settle(skin.id, 'error');
    }
    const motion = ryderModelMotion(spec);
    if (motion === 'static') console.info('[raid] skin %s has no skeleton; it needs rigging before it can play', skin.id);
    return settle(skin.id, motion === 'animated' ? 'ready' : 'static');
  })();
  statusOf.set(skin.id, check);
  return check;
}

export function peekSkinStatus(skin: SkinDef): SkinStatus | null {
  return skin.model ? settled.get(skin.id) ?? null : 'default';
}

export function onSkinStatus(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether a checked skin can stand in for the default model during play. */
export function skinPlayable(skin: SkinDef, status: SkinStatus | null) {
  if (status === 'default' || status === 'ready') return true;
  return status === 'static' && Boolean(skin.model?.allowStaticPose);
}

// --- Equipped skins ------------------------------------------------------------
// The Ryder manager publishes the local player's choices here so every scene
// (showcase, lineup, MVP stage, engine) resolves the same look without prop
// drilling.

let equipped: Partial<Record<RyderId, string>> = {};

export function publishEquippedSkins(next: Partial<Record<RyderId, string>>) {
  equipped = { ...next };
  listeners.forEach((listener) => listener());
}

export function equippedSkinId(ryderId: RyderId): string | null {
  return equipped[ryderId] ?? null;
}

/** Every equipped skin. The object is replaced on each change, so it is a stable store snapshot. */
export function equippedSkins(): Readonly<Partial<Record<RyderId, string>>> {
  return equipped;
}

export interface Appearance {
  spec: RyderSpec;
  skin: SkinDef;
  status: SkinStatus;
  /** The skin could not be used, so the default model is drawn. */
  fallback: boolean;
}

/**
 * Load and return the spec to build for a Ryder. `skinId` undefined means the
 * local player's equipped skin; null means the default model. `preview` lets
 * an unrigged scan show in the Database, where nothing has to move.
 */
export async function resolveAppearance(
  ryderId: RyderId,
  skinId?: string | null,
  options: { preview?: boolean } = {},
): Promise<Appearance> {
  const base = RYDERZ[ryderId];
  const skin = skinFor(ryderId, skinId === undefined ? equippedSkinId(ryderId) : skinId);
  if (skin.model) {
    const status = await skinStatus(skin);
    const usable = options.preview ? status === 'ready' || status === 'static' : skinPlayable(skin, status);
    if (usable) return { spec: skinnedSpec(base, skin), skin, status, fallback: false };
    await loadBase(base);
    return { spec: base, skin, status, fallback: true };
  }
  await loadBase(base);
  return { spec: base, skin, status: 'default', fallback: false };
}

async function loadBase(spec: RyderSpec) {
  if (!spec.glb && spec.id !== 'lilly') return;
  await preloadRyderGltf(spec).catch((error) => {
    console.warn('[raid] failed to load %s, using block figure', spec.id, error);
  });
}
