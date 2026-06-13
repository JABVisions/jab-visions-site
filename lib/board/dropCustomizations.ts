export type DropStudioTextLabel = {
  id: string;
  text: string;
  x: number;
  y: number;
};

export type DropStudioSticker = {
  id: string;
  // "emoji" today; "image" (or a pack-specific kind) for future BOARD packs.
  type: "emoji" | string;
  value: string;
  label: string;
  // Optional asset source for non-emoji (image) stickers, and the pack it came
  // from. Lets BOARD-specific sticker packs render later without a schema change.
  src?: string;
  pack?: string;
  x: number;
  y: number;
};

export type DropStudioActionButton = {
  label: string;
  actionType: string;
  href?: string;
};

export type DropStudioEffects = {
  filter?: string | null;
  overlay?: string | null;
  /** Portrait 4:5 (default) or landscape 16:9 chip — lives in customizations JSON. */
  frame?: "portrait" | "landscape" | null;
  rotation?: 0 | 90 | 180 | 270 | null;
};

export type DropCustomization = {
  textLabels?: DropStudioTextLabel[];
  stickers?: DropStudioSticker[];
  actionButton?: DropStudioActionButton | null;
  effects?: DropStudioEffects;
};

function clampPosition(value: unknown, fallback: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.max(4, Math.min(96, number)) : fallback;
}

function cleanId(value: unknown, prefix: string, index: number) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : `${prefix}-${index}`;
}

function cleanEffectValue(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32)
    : null;
}

export function normalizeDropCustomizations(
  input: unknown
): DropCustomization | undefined {
  if (!input || typeof input !== "object") return undefined;
  const source = input as Record<string, unknown>;

  const textLabels = Array.isArray(source.textLabels)
    ? source.textLabels
        .map((entry, index) => {
          if (!entry || typeof entry !== "object") return null;
          const label = entry as Record<string, unknown>;
          const text = typeof label.text === "string" ? label.text.trim().slice(0, 48) : "";
          if (!text) return null;
          return {
            id: cleanId(label.id, "text", index),
            text,
            x: clampPosition(label.x, 50),
            y: clampPosition(label.y, 30),
          };
        })
        .filter((entry): entry is DropStudioTextLabel => Boolean(entry))
        .slice(0, 8)
    : [];

  const stickers = Array.isArray(source.stickers)
    ? source.stickers
        .map((entry, index) => {
          if (!entry || typeof entry !== "object") return null;
          const sticker = entry as Record<string, unknown>;
          const value =
            typeof sticker.value === "string" && sticker.value.trim()
              ? sticker.value.trim().slice(0, 64)
              : typeof sticker.label === "string"
                ? sticker.label.trim().slice(0, 24)
                : "";
          if (!value) return null;
          const label =
            typeof sticker.label === "string" && sticker.label.trim()
              ? sticker.label.trim().slice(0, 24)
              : value;
          const src =
            typeof sticker.src === "string" && sticker.src.trim()
              ? sticker.src.trim().slice(0, 512)
              : undefined;
          const pack =
            typeof sticker.pack === "string" && sticker.pack.trim()
              ? sticker.pack.trim().slice(0, 48)
              : undefined;
          return {
            id: cleanId(sticker.id, "sticker", index),
            type:
              typeof sticker.type === "string" && sticker.type.trim()
                ? sticker.type.trim().slice(0, 24)
                : "emoji",
            value,
            label,
            ...(src ? { src } : {}),
            ...(pack ? { pack } : {}),
            x: clampPosition(sticker.x, 50),
            y: clampPosition(sticker.y, 50),
          };
        })
        .filter((entry): entry is DropStudioSticker => Boolean(entry))
        .slice(0, 12)
    : [];

  const rawButton =
    source.actionButton && typeof source.actionButton === "object"
      ? (source.actionButton as Record<string, unknown>)
      : null;
  const buttonLabel =
    rawButton && typeof rawButton.label === "string"
      ? rawButton.label.trim().slice(0, 32)
      : "";
  const actionButton = buttonLabel
    ? {
        label: buttonLabel,
        actionType:
          typeof rawButton?.actionType === "string" && rawButton.actionType.trim()
            ? rawButton.actionType.trim().slice(0, 32)
            : buttonLabel.toLowerCase().replace(/\s+/g, "-"),
        ...(typeof rawButton?.href === "string" && rawButton.href.trim()
          ? { href: rawButton.href.trim() }
          : {}),
      }
    : null;

  const rawEffects =
    source.effects && typeof source.effects === "object"
      ? (source.effects as Record<string, unknown>)
      : null;
  const filter = rawEffects ? cleanEffectValue(rawEffects.filter) : null;
  const overlay = rawEffects ? cleanEffectValue(rawEffects.overlay) : null;
  const frame: DropStudioEffects["frame"] =
    rawEffects?.frame === "landscape" || rawEffects?.frame === "portrait"
      ? rawEffects.frame
      : null;
  const rotRaw = rawEffects ? Number(rawEffects.rotation) : 0;
  const rotation =
    rotRaw === 90 || rotRaw === 180 || rotRaw === 270 ? (rotRaw as 90 | 180 | 270) : null;
  const effects =
    filter || overlay || frame || rotation
      ? { filter, overlay, frame, rotation }
      : undefined;

  if (!textLabels.length && !stickers.length && !actionButton && !effects) return undefined;
  return { textLabels, stickers, actionButton, ...(effects ? { effects } : {}) };
}

export function compactDropCustomizations(
  input: DropCustomization | null | undefined
) {
  return normalizeDropCustomizations(input);
}

export function hasDropCustomizations(
  input: DropCustomization | null | undefined
) {
  return Boolean(compactDropCustomizations(input));
}
