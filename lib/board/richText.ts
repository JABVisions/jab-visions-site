// Lightweight, safe rich text for Board drop titles & descriptions.
//
// Model: inline marks (bold / italic / underline) are stored as sanitized HTML;
// size + letter spacing + line spacing are FIELD-LEVEL numeric styles applied to
// the whole field. Keeping the allowed-tag set tiny (no attributes at all) makes
// sanitization trivial and the XSS surface effectively nil.

export type RichTextValue = {
  /** Sanitized inline HTML (only <b>/<strong>/<i>/<em>/<u>/<br>). */
  html: string;
  /** Field-level font size in px. */
  fontSize?: number;
  /** Field-level letter spacing in em. */
  letterSpacing?: number;
  /** Field-level line height (unitless multiplier). */
  lineHeight?: number;
};

export const RICH_TEXT_LIMITS = {
  fontSize: { min: 10, max: 56, step: 1 },
  letterSpacing: { min: -0.05, max: 0.5, step: 0.01 },
  lineHeight: { min: 0.9, max: 2.4, step: 0.05 },
  maxLength: 4000,
} as const;

function clampNumber(value: unknown, min: number, max: number): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, n));
}

// Allowed inline tags. Everything else (including all attributes) is dropped.
const ALLOWED_TAGS = new Set(["B", "STRONG", "I", "EM", "U", "BR"]);

/**
 * Sanitize rich HTML down to a tiny, attribute-free inline subset. Works in the
 * browser via DOMParser; on the server it falls back to a regex strip so stored
 * values are always safe to render.
 */
export function sanitizeRichHtml(input: unknown): string {
  if (typeof input !== "string" || !input.trim()) return "";
  const raw = input.slice(0, RICH_TEXT_LIMITS.maxLength);

  if (typeof window === "undefined" || typeof window.DOMParser === "undefined") {
    // Server / no-DOM fallback: strip every tag except the allowed inline marks,
    // and remove any attributes from those.
    return raw
      .replace(/<\/?([a-zA-Z0-9]+)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (_m, tag: string) => {
        const upper = String(tag).toUpperCase();
        if (!ALLOWED_TAGS.has(upper)) return "";
        const lower = upper.toLowerCase();
        return upper === "BR" ? "<br>" : _m.startsWith("</") ? `</${lower}>` : `<${lower}>`;
      })
      .replace(/<script[\s\S]*?<\/script>/gi, "");
  }

  const doc = new DOMParser().parseFromString(`<div>${raw}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return "";

  function walk(node: Node): string {
    let out = "";
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        out += escapeHtml(child.textContent ?? "");
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const el = child as Element;
      const tag = el.tagName.toUpperCase();
      if (tag === "BR") {
        out += "<br>";
        return;
      }
      if (ALLOWED_TAGS.has(tag)) {
        const lower = tag.toLowerCase();
        out += `<${lower}>${walk(el)}</${lower}>`;
      } else {
        // Unknown element: keep its text content but drop the tag itself.
        // Block-level wrappers (DIV/P that browsers create on Enter) become a
        // line break so multi-line content is preserved.
        const isBlock = tag === "DIV" || tag === "P";
        if (isBlock && out && !out.endsWith("<br>")) out += "<br>";
        out += walk(el);
      }
    });
    return out;
  }

  return walk(root).slice(0, RICH_TEXT_LIMITS.maxLength);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Plain-text version (tags stripped, <br> → space) for search, feed titles, etc. */
export function richToPlain(input: unknown): string {
  const html = sanitizeRichHtml(input);
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalize + clamp a stored rich value. Returns undefined when there's nothing. */
export function normalizeRichText(input: unknown): RichTextValue | undefined {
  if (!input || typeof input !== "object") return undefined;
  const src = input as Record<string, unknown>;
  const html = sanitizeRichHtml(src.html);
  const fontSize = clampNumber(
    src.fontSize,
    RICH_TEXT_LIMITS.fontSize.min,
    RICH_TEXT_LIMITS.fontSize.max
  );
  const letterSpacing = clampNumber(
    src.letterSpacing,
    RICH_TEXT_LIMITS.letterSpacing.min,
    RICH_TEXT_LIMITS.letterSpacing.max
  );
  const lineHeight = clampNumber(
    src.lineHeight,
    RICH_TEXT_LIMITS.lineHeight.min,
    RICH_TEXT_LIMITS.lineHeight.max
  );

  // Only meaningful if there's text OR a non-default field style.
  if (!richToPlain(html) && fontSize == null && letterSpacing == null && lineHeight == null) {
    return undefined;
  }
  const value: RichTextValue = { html };
  if (fontSize != null) value.fontSize = fontSize;
  if (letterSpacing != null) value.letterSpacing = letterSpacing;
  if (lineHeight != null) value.lineHeight = lineHeight;
  return value;
}

/** True when the value carries any inline formatting or a field-level style. */
export function hasRichFormatting(value: RichTextValue | null | undefined): boolean {
  if (!value) return false;
  if (value.fontSize != null || value.letterSpacing != null || value.lineHeight != null) {
    return true;
  }
  return /<(b|strong|i|em|u)>/i.test(value.html || "");
}

/** Build the field-level inline style object for rendering. */
export function richTextStyle(
  value: RichTextValue | null | undefined
): React.CSSProperties | undefined {
  if (!value) return undefined;
  const style: React.CSSProperties = {};
  if (value.fontSize != null) style.fontSize = `${value.fontSize}px`;
  if (value.letterSpacing != null) style.letterSpacing = `${value.letterSpacing}em`;
  if (value.lineHeight != null) style.lineHeight = String(value.lineHeight);
  return Object.keys(style).length ? style : undefined;
}

/** Make a RichTextValue from plain text (used to seed the editor from legacy drops). */
export function richTextFromPlain(text: unknown): RichTextValue {
  const str = typeof text === "string" ? text : "";
  return { html: escapeHtml(str) };
}
