/**
 * Skin economy. Prices are in Signal Points, the one currency the raid already
 * pays out; there is no separate cosmetic wallet and no real-money path.
 * Change a price here (or with the env override) and every tile, check and
 * purchase reads the new figure. A skin already bought keeps what was paid.
 */
function envPrice(raw: string | undefined): number | null {
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

export const SKIN_ECONOMY = {
  /** Price for any purchasable skin whose collection does not set its own. */
  defaultPrice: 1000,
  /** Per-collection prices. 0 makes every skin in the collection free and owned from the start. */
  collectionPrice: {
    movie_pack_vol1: envPrice(process.env.NEXT_PUBLIC_RAID_MOVIE_SKIN_PRICE) ?? 0,
  } as Record<string, number>,
  /**
   * Free test unlock for checking models without grinding Signal Points.
   * Always on in development; set NEXT_PUBLIC_RAID_SKIN_TEST_UNLOCK=1 to allow it on a deployment.
   */
  testUnlock: process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_RAID_SKIN_TEST_UNLOCK === '1',
};

export function skinPrice(collection: string | null): number {
  if (collection && collection in SKIN_ECONOMY.collectionPrice) return SKIN_ECONOMY.collectionPrice[collection];
  return SKIN_ECONOMY.defaultPrice;
}
