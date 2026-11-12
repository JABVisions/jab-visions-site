import { RYDERZ, RYDER_ORDER, type RyderId } from '../config';
import type { GlbRepair } from '../mesh-repair';
import type { BoneKey } from '../skeletal';
import { skinPrice } from './config';

/**
 * Cosmetic skins. A skin swaps the model a Ryder is drawn with and nothing
 * else: id, stats, powers, hitbox, voice and timing stay with the Ryder.
 * Every Ryder has a default skin (their existing model). Packs add entries.
 */

export type SkinCategory = 'default' | 'movie' | 'alternate' | 'classic' | 'special' | 'event' | 'prestige';

export const SKIN_CATEGORIES: { id: SkinCategory; label: string; blurb: string }[] = [
  { id: 'default', label: 'Default', blurb: 'The look each Ryder drops in with.' },
  { id: 'movie', label: 'Movie', blurb: 'Live-action appearances from THOSE RYDERZ.' },
  { id: 'alternate', label: 'Alternate Costumes', blurb: 'Other outfits for the same Ryder.' },
  { id: 'classic', label: 'Classic', blurb: 'Earlier looks from the archive.' },
  { id: 'special', label: 'Special Edition', blurb: 'One-off releases.' },
  { id: 'event', label: 'Event', blurb: 'Earned during limited events.' },
  { id: 'prestige', label: 'Prestige', blurb: 'For players who have seen it all.' },
];

export type SkinRarity = 'standard' | 'rare' | 'epic' | 'cinematic';

export const RARITY_LABEL: Record<SkinRarity, string> = {
  standard: 'Standard',
  rare: 'Rare',
  epic: 'Epic',
  cinematic: 'Cinematic',
};

export type SkinUnlock =
  | { kind: 'default' }
  | { kind: 'signal'; cost: number }
  /** Shown with its condition; not purchasable. */
  | { kind: 'condition'; label: string };

export interface SkinModel {
  /** Model file served from /public. Drop the file at this path to supply it; nothing else needs to change. */
  glb: string;
  glbRepair?: GlbRepair;
  /** Rest yaw so the face points along raid-forward (+Z). */
  modelYaw?: number;
  armHang?: number;
  shoulderDrop?: number;
  sashay?: boolean;
  skelKeep?: BoneKey[];
  /**
   * An unrigged scan can only be moved as a rigid statue. Off by default: such
   * a skin is flagged for rigging and the Ryder plays in their default model.
   */
  allowStaticPose?: boolean;
}

export interface SkinVfx {
  /** Cosmetic aura tint. Power behaviour never reads it. */
  aura?: string;
}

export interface SkinCollection {
  id: string;
  title: string;
  subtitle: string;
  category: SkinCategory;
  /** Film-strip treatment for movie packs. */
  badge: 'film' | 'plain';
  order: number;
}

export interface SkinDef {
  id: string;
  ryderId: RyderId;
  name: string;
  collection: string | null;
  category: SkinCategory;
  rarity: SkinRarity;
  description: string;
  thumbnail: string | null;
  /** Null draws the Ryder's own model. */
  model: SkinModel | null;
  unlock: SkinUnlock;
  /** Tile and panel accent. */
  accent: string;
  vfx?: SkinVfx;
  order: number;
}

export const COLLECTIONS: SkinCollection[] = [
  {
    id: 'movie_pack_vol1',
    title: 'THOSE RYDERZ: Movie Skin Pack',
    subtitle: 'Vol. 1',
    category: 'movie',
    badge: 'film',
    order: 0,
  },
];

export function defaultSkinId(ryderId: RyderId) {
  return `${ryderId}_default`;
}

function defaultSkin(ryderId: RyderId, order: number): SkinDef {
  const spec = RYDERZ[ryderId];
  return {
    id: defaultSkinId(ryderId),
    ryderId,
    name: `${spec.name}`,
    collection: null,
    category: 'default',
    rarity: 'standard',
    description: `${spec.name}'s standard look.`,
    thumbnail: spec.icon,
    model: null,
    unlock: { kind: 'default' },
    accent: spec.colorHex,
    order,
  };
}

const MOVIE_PACK = 'movie_pack_vol1';

function movieSkin(ryderId: RyderId, file: string, accent: string, order: number): SkinDef {
  const spec = RYDERZ[ryderId];
  return {
    id: `${ryderId}_movie`,
    ryderId,
    name: `${spec.name} (Movie)`,
    collection: MOVIE_PACK,
    category: 'movie',
    rarity: 'cinematic',
    description: `${spec.name}'s live-action appearance from THOSE RYDERZ. Cosmetic only: kit, stats and powers are unchanged.`,
    thumbnail: `/assets/those-ryderz/skins/${file}.webp`,
    model: { glb: `/assets/those-ryderz/models/skins/${file}.glb` },
    unlock: { kind: 'signal', cost: skinPrice(MOVIE_PACK) },
    accent,
    order,
  };
}

export const SKINS: SkinDef[] = [
  ...RYDER_ORDER.map((id, i) => defaultSkin(id, i)),
  movieSkin('keven', 'keven-movie', '#ff4fa8', 100),
  movieSkin('leo', 'leo-movie', '#ffd23a', 101),
  movieSkin('aaron', 'aaron-movie', '#8f7bff', 102),
];

const BY_ID = new Map(SKINS.map((skin) => [skin.id, skin]));

export function skinById(id: string | null | undefined): SkinDef | null {
  return id ? BY_ID.get(id) ?? null : null;
}

/** The skin when it belongs to that Ryder, else the Ryder's default. */
export function skinFor(ryderId: RyderId, skinId: string | null | undefined): SkinDef {
  const skin = skinById(skinId);
  return skin && skin.ryderId === ryderId ? skin : BY_ID.get(defaultSkinId(ryderId))!;
}

export function isSkinFor(ryderId: string | null | undefined, skinId: unknown): skinId is string {
  if (typeof skinId !== 'string') return false;
  const skin = BY_ID.get(skinId);
  return Boolean(skin && skin.ryderId === ryderId);
}

export function skinsOf(ryderId: RyderId): SkinDef[] {
  return SKINS.filter((skin) => skin.ryderId === ryderId).sort((a, b) => a.order - b.order);
}

export function skinsIn(collection: string): SkinDef[] {
  return SKINS.filter((skin) => skin.collection === collection).sort((a, b) => a.order - b.order);
}

export function collectionById(id: string | null | undefined) {
  return COLLECTIONS.find((entry) => entry.id === id) ?? null;
}
