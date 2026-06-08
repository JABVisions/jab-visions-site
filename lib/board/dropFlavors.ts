// File: lib/board/dropFlavors.ts
// Single source of truth for Drop type ordering + labels across every creation
// and selection surface (Drop Console, Profile Drop Tile, DropPad, etc.).
//
// Ordering philosophy: CREATION-FIRST. The Drops a user makes natively on BOARD
// lead (Vision/Media, Thought), then the human-centered Pay Drop, then the
// link-ingest types. Keep this list as the canonical order — surfaces should
// import it rather than hand-rolling their own arrays.

export type DropFlavorKey =
  | "media"
  | "thought"
  | "pay"
  | "youtube"
  | "music"
  | "news"
  | "link"
  | "doc";

export const DROP_FLAVOR_ORDER: DropFlavorKey[] = [
  "media",
  "thought",
  "pay",
  "youtube",
  "music",
  "news",
  "link",
  "doc",
];

export const DROP_FLAVOR_LABEL: Record<DropFlavorKey, string> = {
  media: "Media",
  thought: "Thought",
  pay: "Pay",
  youtube: "YouTube",
  music: "Music",
  news: "News",
  link: "Link",
  doc: "Doc",
};

export const DROP_FLAVOR_SUB: Record<DropFlavorKey, string> = {
  media: "upload",
  thought: "idea",
  pay: "monetize",
  youtube: "video",
  music: "track",
  news: "article",
  link: "card",
  doc: "file",
};

/** Order the overlapping keys of a reduced surface by the canonical order. */
export function orderByFlavor<T extends string>(
  keys: T[],
  toFlavor: (key: T) => DropFlavorKey | null
): T[] {
  const rank = (k: T) => {
    const flavor = toFlavor(k);
    const idx = flavor ? DROP_FLAVOR_ORDER.indexOf(flavor) : -1;
    // Unknown/unique keys sort to the end, preserving their relative order.
    return idx === -1 ? DROP_FLAVOR_ORDER.length : idx;
  };
  return [...keys].sort((a, b) => rank(a) - rank(b));
}
