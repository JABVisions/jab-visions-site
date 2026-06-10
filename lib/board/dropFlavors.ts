// File: lib/board/dropFlavors.ts
// Single source of truth for Drop type ordering + labels across every creation
// and selection surface (Drop Console, Profile Drop Tile, DropPad, etc.).
//
// Ordering philosophy: user-facing BOARD language. Keep the saved "media"
// flavor intact for compatibility, but present it as "Vision" across the UI.
// Surfaces should import this list rather than hand-rolling their own arrays.

export type DropFlavorKey =
  | "media"
  | "thought"
  | "pay"
  | "youtube"
  | "music"
  | "news"
  | "link"
  | "doc";

/** Full tab order — studio-first row, then link/embed row. */
export const DROP_FLAVOR_ORDER: DropFlavorKey[] = [
  "thought",
  "media",
  "doc",
  "pay",
  "youtube",
  "news",
  "music",
  "link",
];

/** Drop Studio surfaces (top row in creation UIs). */
export const DROP_FLAVOR_STUDIO_ROW: DropFlavorKey[] = ["thought", "media", "doc", "pay"];

/** Link / embed surfaces (second row). */
export const DROP_FLAVOR_LINK_ROW: DropFlavorKey[] = ["youtube", "news", "music", "link"];

export const DROP_FLAVOR_LABEL: Record<DropFlavorKey, string> = {
  thought: "Thought",
  media: "Vision",
  music: "Music",
  youtube: "YouTube",
  link: "Link",
  news: "News",
  doc: "Doc",
  pay: "Pay",
};

export const DROP_FLAVOR_SUB: Record<DropFlavorKey, string> = {
  media: "media",
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
