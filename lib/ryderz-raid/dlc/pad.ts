/**
 * JAB Visions: Paranormal Activity Division.
 * Expansion id `pad-expansion-01`. This is a content package: no purchase,
 * entitlement, or lock. Drop a character GLB path below when the file is in
 * `public/` and the existing loader will skin it. Until then the raid uses
 * the labeled placeholder figures.
 */

export const PAD_EXPANSION_ID = 'pad-expansion-01';

export const PAD_ARENA_ID = 'training-pad';

export const PAD_RYDER_IDS = ['kid-paranormal', 'agent-nyx'] as const;

export type PadRyderId = (typeof PAD_RYDER_IDS)[number];

/**
 * Future GLB slots. Set a public URL such as
 * `/assets/those-ryderz/models/kid-paranormal.glb` once the file exists.
 * Null keeps the placeholder and never fetches a missing model.
 */
export const PAD_CHARACTER_GLB: Record<PadRyderId, string | null> = {
  'kid-paranormal': '/assets/those-ryderz/models/kid-paranormal.glb?v=1',
  'agent-nyx': null,
};

/** Extra facility meshes can be listed here and loaded by the arena when present. */
export const PAD_ENVIRONMENT_GLBS: string[] = [];

export function isPadRyder(id: string): id is PadRyderId {
  return (PAD_RYDER_IDS as readonly string[]).includes(id);
}

export function padCharacterMeta(id: string): { universe: string; category: 'jab-visions' } | null {
  if (!isPadRyder(id)) return null;
  return { universe: 'JAB Visions: Paranormal Activity Division', category: 'jab-visions' };
}
