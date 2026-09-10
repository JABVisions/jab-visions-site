// Descript doc embedding — decides when a Thought/Doc drop should be presented
// as a laminated, self-scrolling document sheet instead of raw inline text.
// Restored from the Drop Studio 3 build's glossy 4:5 Descript chip and narrowed
// so short thoughts keep their existing flat presentation.

/** Below this the text fits a card, so the flat inline body still reads better. */
export const DESCRIPT_EMBED_MIN_CHARS = 560;
/** A doc-shaped body: several separated blocks rather than one paragraph. */
export const DESCRIPT_EMBED_MIN_BLOCKS = 4;

function metaString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/** Canonical drop flavor from feed meta (thought, doc, media, …). */
function dropFlavor(
  meta: Record<string, unknown> | null | undefined,
  preview?: Record<string, unknown> | null | undefined
): string {
  return metaString(
    meta?.dropType,
    meta?.drop_flavor,
    meta?.dropFlavor,
    preview?.dropType
  ).toLowerCase();
}

/** Auto-written captions carry no reader value, so they never earn a doc sheet. */
export function isGenericBoardDropCaption(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return true;
  return (
    /^New .+ drop added to Board\.?$/i.test(trimmed) ||
    /^New .+ drop from .+\.?$/i.test(trimmed) ||
    /^A thought landed on Board\.?$/i.test(trimmed) ||
    /^Private thought saved to Board\.?$/i.test(trimmed)
  );
}

/** The document text a Thought/Doc drop should show, preferring its own field. */
export function resolveDescriptDocText(
  meta: Record<string, unknown> | null | undefined,
  body?: string | null
): string {
  const flavor = dropFlavor(meta);
  const thoughtText = metaString(meta?.thoughtText);
  const description = metaString(meta?.description);
  const plainBody = typeof body === "string" ? body.trim() : "";
  const bodyCandidate = isGenericBoardDropCaption(plainBody) ? "" : plainBody;

  if (flavor.includes("doc")) return description || thoughtText || bodyCandidate;
  return thoughtText || description || bodyCandidate;
}

/** Long enough that rendering it inline would run the card off the screen. */
export function isLongFormDropText(text: string) {
  const trimmed = (text || "").trim();
  if (!trimmed) return false;
  if (trimmed.length >= DESCRIPT_EMBED_MIN_CHARS) return true;
  const blocks = trimmed.split(/\n\s*\n/).filter((block) => block.trim()).length;
  return blocks >= DESCRIPT_EMBED_MIN_BLOCKS;
}

/**
 * Whether a drop should render the laminated Descript doc embed. Descript-
 * authored Thought/Doc drops always do; anything else only when its text is
 * long-form, so one-line thoughts keep the flat body they have today.
 */
export function shouldEmbedDescriptDoc(opts: {
  meta?: Record<string, unknown> | null;
  body?: string | null;
  fromDescript?: boolean;
  hasVisualMedia?: boolean;
}): { show: boolean; text: string } {
  const flavor = dropFlavor(opts.meta);
  const text = resolveDescriptDocText(opts.meta, opts.body);
  if (!text || opts.hasVisualMedia || isGenericBoardDropCaption(text)) {
    return { show: false, text: "" };
  }

  const isDocLike = flavor.includes("thought") || flavor.includes("doc");
  if (!isDocLike) return { show: false, text: "" };

  const fromDescript = opts.fromDescript === true || opts.meta?.fromDescript === true;
  if (fromDescript || isLongFormDropText(text)) return { show: true, text };
  return { show: false, text: "" };
}
