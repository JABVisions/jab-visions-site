import { RYDER_ORDER, type RyderId } from '../config';
import { COLLECTIONS, SKINS, skinById, skinsIn, type SkinDef } from './catalog';
import { SKIN_ECONOMY } from './config';

/** One owned skin. `paid` is what was charged at the time, so a later price change never refunds or rebills it. */
export interface OwnedSkin {
  at: number;
  paid: number;
  /** Granted by the test unlock rather than bought. */
  test?: boolean;
}

export interface Wardrobe {
  owned: Record<string, OwnedSkin>;
  /** Equipped skin per Ryder. Absent means the default model. */
  equipped: Partial<Record<RyderId, string>>;
}

export function emptyWardrobe(): Wardrobe {
  return { owned: {}, equipped: {} };
}

/**
 * Read a stored wardrobe. Saves from before skins have none and come back
 * empty; unknown skins, a skin equipped on the wrong Ryder, or one never
 * bought are dropped rather than trusted.
 */
export function sanitizeWardrobe(raw: unknown): Wardrobe {
  const wardrobe = emptyWardrobe();
  if (!raw || typeof raw !== 'object') return wardrobe;
  const data = raw as { owned?: unknown; equipped?: unknown };
  if (data.owned && typeof data.owned === 'object') {
    for (const [id, entry] of Object.entries(data.owned as Record<string, unknown>)) {
      const skin = skinById(id);
      if (!skin || skin.unlock.kind === 'default' || !entry || typeof entry !== 'object') continue;
      const at = Number((entry as OwnedSkin).at);
      const paid = Number((entry as OwnedSkin).paid);
      wardrobe.owned[id] = {
        at: Number.isFinite(at) && at > 0 ? Math.floor(at) : 0,
        paid: Number.isFinite(paid) && paid > 0 ? Math.floor(paid) : 0,
        ...((entry as OwnedSkin).test ? { test: true } : {}),
      };
    }
  }
  if (data.equipped && typeof data.equipped === 'object') {
    for (const ryderId of RYDER_ORDER) {
      const id = (data.equipped as Record<string, unknown>)[ryderId];
      if (typeof id !== 'string') continue;
      const skin = skinById(id);
      if (skin && skin.ryderId === ryderId && ownsSkin(wardrobe, skin) && skin.unlock.kind !== 'default') wardrobe.equipped[ryderId] = id;
    }
  }
  return wardrobe;
}

export function ownsSkin(wardrobe: Wardrobe, skin: SkinDef) {
  return skin.unlock.kind === 'default' || skin.unlock.kind === 'free' || skin.id in wardrobe.owned;
}

/** Signal Points held by bought skins. A skin that has since gone free stops counting, which hands its price back. */
export function spentOnSkins(wardrobe: Wardrobe) {
  return Object.entries(wardrobe.owned).reduce((sum, [id, entry]) => (skinById(id)?.unlock.kind === 'signal' ? sum + entry.paid : sum), 0);
}

export type SkinUnlockCheck =
  | { ok: true; cost: number }
  | { ok: false; cost: number; reason: 'owned' | 'unknown' | 'not-for-sale' | 'short'; short?: number };

export function checkSkinUnlock(wardrobe: Wardrobe, skinId: string, available: number): SkinUnlockCheck {
  const skin = skinById(skinId);
  if (!skin) return { ok: false, cost: 0, reason: 'unknown' };
  if (ownsSkin(wardrobe, skin)) return { ok: false, cost: 0, reason: 'owned' };
  if (skin.unlock.kind !== 'signal') return { ok: false, cost: 0, reason: 'not-for-sale' };
  const cost = Math.max(0, Math.floor(skin.unlock.cost));
  if (available < cost) return { ok: false, cost, reason: 'short', short: cost - Math.max(0, available) };
  return { ok: true, cost };
}

/** Wardrobe after buying a skin. Callers check first; this never charges twice. */
export function withSkinBought(wardrobe: Wardrobe, skinId: string, cost: number, at: number): Wardrobe {
  if (skinId in wardrobe.owned) return wardrobe;
  return { ...wardrobe, owned: { ...wardrobe.owned, [skinId]: { at, paid: cost } } };
}

export function withSkinGranted(wardrobe: Wardrobe, skinId: string, at: number): Wardrobe | null {
  const skin = skinById(skinId);
  if (!SKIN_ECONOMY.testUnlock || !skin || ownsSkin(wardrobe, skin)) return null;
  return { ...wardrobe, owned: { ...wardrobe.owned, [skinId]: { at, paid: 0, test: true } } };
}

export function withSkinEquipped(wardrobe: Wardrobe, skinId: string): Wardrobe | null {
  const skin = skinById(skinId);
  if (!skin || !ownsSkin(wardrobe, skin)) return null;
  const equipped = { ...wardrobe.equipped };
  if (skin.unlock.kind === 'default') delete equipped[skin.ryderId];
  else equipped[skin.ryderId] = skin.id;
  return { ...wardrobe, equipped };
}

export function equippedSkinOf(wardrobe: Wardrobe, ryderId: RyderId): SkinDef {
  const id = wardrobe.equipped[ryderId];
  const skin = skinById(id);
  return skin && skin.ryderId === ryderId ? skin : SKINS.find((entry) => entry.ryderId === ryderId && entry.unlock.kind === 'default')!;
}

export function collectionProgress(wardrobe: Wardrobe) {
  return COLLECTIONS.map((collection) => {
    const skins = skinsIn(collection.id);
    return { collection, owned: skins.filter((skin) => ownsSkin(wardrobe, skin)).length, total: skins.length };
  });
}
