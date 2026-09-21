export type DropStudioTextLabel = {
  id: string;
  text: string;
  x: number;
  y: number;
  /** Layer state — all optional/default-true|false so old saved drops still work. */
  visible?: boolean;
  locked?: boolean;
  opacity?: number;
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
  visible?: boolean;
  locked?: boolean;
  opacity?: number;
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

/** One independent, non-destructive drawing surface in Drop Studio's Art Mode. */
export type DropStudioArtLayer = {
  id: string;
  name: string;
  /** Transparent PNG for this layer's strokes. Omitted while a layer is empty. */
  dataUrl?: string;
  visible: boolean;
  locked: boolean;
  /** 0..1 */
  opacity: number;
};

export type DropStudioLayerKind = "art" | "text" | "sticker";

/** One entry in the unified, freely-reorderable Art Mode layer stack (bottom → top). */
export type DropStudioLayerRef = {
  id: string;
  kind: DropStudioLayerKind;
};

/** The legacy single-flattened-art-layer id used before per-layer data existed. */
export const LEGACY_ART_LAYER_ID = "art-legacy";

export type DropCustomization = {
  textLabels?: DropStudioTextLabel[];
  stickers?: DropStudioSticker[];
  actionButton?: DropStudioActionButton | null;
  effects?: DropStudioEffects;
  /**
   * Flattened composite of every art layer, kept in sync whenever artLayers
   * changes. Backward-compat field: older code (feed display, export/flatten)
   * that doesn't know about layers still gets one correct PNG to draw.
   */
  artOverlayUrl?: string;
  /** Independent drawing layers backing the Art Palette (new, layer-aware). */
  artLayers?: DropStudioArtLayer[];
  /** Full z-order across art layers, text labels, and stickers, bottom → top. */
  layerStack?: DropStudioLayerRef[];
};

const MAX_ART_LAYERS = 8;
const MAX_ART_LAYER_DATAURL_BYTES = 1_800_000;
const MAX_ARTOVERLAY_BYTES = 2_000_000;

function clampPosition(value: unknown, fallback: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.max(4, Math.min(96, number)) : fallback;
}

function clampOpacity(value: unknown, fallback = 1) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
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

function cleanImageDataUrl(value: unknown, maxBytes: number): string | undefined {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return undefined;
  if (raw.length > maxBytes) return undefined;
  return /^(data:image\/(?:png|webp);base64,|https?:\/\/)/i.test(raw) ? raw : undefined;
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
            visible: label.visible === false ? false : true,
            locked: label.locked === true,
            opacity: clampOpacity(label.opacity, 1),
          };
        })
        .filter((entry) => entry !== null)
        .slice(0, 8) as DropStudioTextLabel[]
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
            visible: sticker.visible === false ? false : true,
            locked: sticker.locked === true,
            opacity: clampOpacity(sticker.opacity, 1),
          };
        })
        .filter((entry) => entry !== null)
        .slice(0, 12) as DropStudioSticker[]
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

  const artOverlayUrl = cleanImageDataUrl(source.artOverlayUrl, MAX_ARTOVERLAY_BYTES);

  const artLayers = Array.isArray(source.artLayers)
    ? source.artLayers
        .map((entry, index) => {
          if (!entry || typeof entry !== "object") return null;
          const layer = entry as Record<string, unknown>;
          const id = cleanId(layer.id, "art", index);
          const name =
            typeof layer.name === "string" && layer.name.trim()
              ? layer.name.trim().slice(0, 40)
              : `Layer ${index + 1}`;
          const dataUrl = cleanImageDataUrl(layer.dataUrl, MAX_ART_LAYER_DATAURL_BYTES);
          return {
            id,
            name,
            ...(dataUrl ? { dataUrl } : {}),
            visible: layer.visible === false ? false : true,
            locked: layer.locked === true,
            opacity: clampOpacity(layer.opacity, 1),
          } satisfies DropStudioArtLayer;
        })
        .filter((entry) => entry !== null)
        .slice(0, MAX_ART_LAYERS) as DropStudioArtLayer[]
    : [];

  const knownIds = new Set<string>([
    ...artLayers.map((l) => l.id),
    ...textLabels.map((l) => l.id),
    ...stickers.map((l) => l.id),
  ]);
  const layerStack = Array.isArray(source.layerStack)
    ? source.layerStack
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const ref = entry as Record<string, unknown>;
          const kind = ref.kind;
          if (kind !== "art" && kind !== "text" && kind !== "sticker") return null;
          const id = typeof ref.id === "string" ? ref.id : "";
          if (!id || !knownIds.has(id)) return null;
          return { id, kind } satisfies DropStudioLayerRef;
        })
        .filter((entry) => entry !== null)
        .slice(0, MAX_ART_LAYERS + 8 + 12) as DropStudioLayerRef[]
    : [];

  if (
    !textLabels.length &&
    !stickers.length &&
    !actionButton &&
    !effects &&
    !artOverlayUrl &&
    !artLayers.length
  ) {
    return undefined;
  }
  return {
    textLabels,
    stickers,
    actionButton,
    ...(effects ? { effects } : {}),
    ...(artOverlayUrl ? { artOverlayUrl } : {}),
    ...(artLayers.length ? { artLayers } : {}),
    ...(layerStack.length ? { layerStack } : {}),
  };
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

/**
 * The unified Art Mode layer order (bottom → top), covering art layers, text
 * labels, and stickers as one freely-interleaved stack.
 *
 * Backward compatible: a drop saved before layers existed has no `layerStack`
 * (and usually no `artLayers`, just a single flattened `artOverlayUrl`) — in
 * that case this synthesizes the same order Drop Studio always rendered in
 * (art beneath every text label beneath every sticker), so nothing visually
 * changes for old drops until someone actually reorders them.
 */
export function resolveLayerStack(value?: DropCustomization | null): DropStudioLayerRef[] {
  if (!value) return [];
  const byId = new Map<string, DropStudioLayerKind>();
  for (const l of value.artLayers ?? []) byId.set(l.id, "art");
  for (const t of value.textLabels ?? []) byId.set(t.id, "text");
  for (const s of value.stickers ?? []) byId.set(s.id, "sticker");

  if (value.layerStack?.length) {
    const seen = new Set<string>();
    const filtered = value.layerStack.filter((ref) => {
      if (seen.has(ref.id) || byId.get(ref.id) !== ref.kind) return false;
      seen.add(ref.id);
      return true;
    });
    const missing: DropStudioLayerRef[] = [];
    byId.forEach((kind, id) => {
      if (!seen.has(id)) missing.push({ id, kind });
    });
    return [...filtered, ...missing];
  }

  const legacyArt: DropStudioLayerRef[] = value.artLayers?.length
    ? value.artLayers.map((l) => ({ id: l.id, kind: "art" as const }))
    : value.artOverlayUrl
      ? [{ id: LEGACY_ART_LAYER_ID, kind: "art" as const }]
      : [];
  const textRefs = (value.textLabels ?? []).map((t) => ({ id: t.id, kind: "text" as const }));
  const stickerRefs = (value.stickers ?? []).map((s) => ({ id: s.id, kind: "sticker" as const }));
  return [...legacyArt, ...textRefs, ...stickerRefs];
}

/** Resolve one layer ref to its renderable image src (handles the legacy synthetic art layer). */
export function resolveArtLayerSrc(
  value: DropCustomization | null | undefined,
  ref: DropStudioLayerRef
): string | undefined {
  if (ref.kind !== "art") return undefined;
  if (ref.id === LEGACY_ART_LAYER_ID && !value?.artLayers?.some((l) => l.id === ref.id)) {
    return value?.artOverlayUrl;
  }
  return value?.artLayers?.find((l) => l.id === ref.id)?.dataUrl;
}
