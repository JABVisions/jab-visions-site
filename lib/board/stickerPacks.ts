// File: lib/board/stickerPacks.ts
// Sticker packs for the Vision Drop Studio.
//
// Today every pack is an emoji pack. The structure is intentionally future-
// friendly: an "image" pack (BOARD-specific sticker art) can be added later by
// providing items with a `src`, and the studio + overlay already know how to
// render those. No schema change needed when packs ship.

export type StickerPackKind = "emoji" | "image";

export type StickerItem = {
  /** Emoji glyph for emoji packs, or a stable asset key for image packs. */
  value: string;
  label: string;
  /** Image source for image packs (BOARD sticker art); omit for emoji. */
  src?: string;
};

export type StickerPack = {
  id: string;
  name: string;
  kind: StickerPackKind;
  items: StickerItem[];
};

function emojiItems(glyphs: string[]): StickerItem[] {
  return glyphs.map((g) => ({ value: g, label: g }));
}

export const STICKER_PACKS: StickerPack[] = [
  {
    id: "creative",
    name: "Creative",
    kind: "emoji",
    items: emojiItems(["🎬", "🎥", "📸", "🎤", "🎧", "🎵", "✍️", "📖", "🎨", "💻"]),
  },
  {
    id: "mood",
    name: "Mood",
    kind: "emoji",
    items: emojiItems(["✨", "💫", "🌊", "🔥", "💖", "💎", "🌙", "☁️", "🫧", "🪩"]),
  },
  {
    id: "signal",
    name: "Signal",
    kind: "emoji",
    items: emojiItems(["⚡️", "🔮", "👁️", "🌐", "🌀", "📡", "🚨", "💥", "⭐️"]),
  },
  {
    id: "fun",
    name: "Fun",
    kind: "emoji",
    items: emojiItems(["😂", "😍", "😭", "😎", "🤍", "💋", "🫶", "🧠", "🛸"]),
  },
  // Future: BOARD-specific art packs, e.g.
  // { id: "board-classics", name: "BOARD", kind: "image", items: [
  //   { value: "orb", label: "Orb", src: "/stickers/board/orb.png" }, ...
  // ] },
];

/** Resolve the DropStudioSticker `type` value for a given pack kind. */
export function stickerTypeForPack(kind: StickerPackKind): string {
  return kind === "image" ? "image" : "emoji";
}
