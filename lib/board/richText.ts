// Lightweight, safe rich text for Board drop titles & descriptions.
//
// Model: inline marks (bold / italic / underline) and per-selection typography
// (font-size, letter-spacing, line-height, font-family) are stored as sanitized
// HTML on <span style="…"> wrappers. Legacy field-level fontSize / letterSpacing /
// lineHeight still apply as a base style on the whole field when rendering.

export type RichTextValue = {
  /** Sanitized inline HTML (semantic tags + safe styled spans). */
  html: string;
  /** Legacy field-level font size in px (base style for unmarked text). */
  fontSize?: number;
  /** Legacy field-level letter spacing in em. */
  letterSpacing?: number;
  /** Legacy field-level line height (unitless multiplier). */
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

// Allowed inline tags. SPAN may carry a tightly-whitelisted style attribute.
const ALLOWED_TAGS = new Set(["B", "STRONG", "I", "EM", "U", "BR", "SPAN"]);
const ALLOWED_SPAN_STYLES = new Set([
  "font-size",
  "letter-spacing",
  "line-height",
  "font-family",
]);

const FONT_FAMILY_WHITELIST = [
  'georgia, "times new roman", serif',
  '"sf mono", menlo, consolas, monospace',
  '"avenir next", "nunito", "helvetica neue", sans-serif',
  'impact, "arial black", sans-serif',
  '"comic sans ms", "comic sans", cursive',
];

function isBoldWeight(weight: string): boolean {
  const w = weight.trim().toLowerCase();
  if (!w || w === "normal" || w === "400") return false;
  if (w === "bold" || w === "bolder") return true;
  const n = Number(w);
  return Number.isFinite(n) && n >= 600;
}

function hasUnderline(style: CSSStyleDeclaration): boolean {
  const deco = `${style.textDecoration} ${style.textDecorationLine}`.toLowerCase();
  return deco.includes("underline");
}

/**
 * Browsers often emit `<span style="font-weight: bold">` from execCommand. Our
 * sanitizers drop those styles, so convert styled spans/fonts to semantic tags.
 */
export function safeFontSize(value: string | null | undefined): string {
  const v = (value || "").trim().toLowerCase();
  if (!v) return "";
  if (/^(xx-small|x-small|small|medium|large|x-large|xx-large)$/.test(v)) return v;
  if (/^\d{1,3}(\.\d+)?(px|pt|em|rem|%)$/.test(v)) return v;
  return "";
}

export function safeLetterSpacing(value: string | null | undefined): string {
  const v = (value || "").trim().toLowerCase();
  if (!v) return "";
  if (/^-?\d{1,2}(\.\d+)?(em|px)$/.test(v)) return v;
  return "";
}

export function safeLineHeight(value: string | null | undefined): string {
  const v = (value || "").trim().toLowerCase();
  if (!v) return "";
  if (/^\d{1,2}(\.\d+)?$/.test(v)) return v;
  if (/^\d{1,3}(\.\d+)?(px|em|rem|%)$/.test(v)) return v;
  return "";
}

export function safeFontFamily(value: string | null | undefined): string {
  const v = (value || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!v) return "";
  const exact = FONT_FAMILY_WHITELIST.find((entry) => entry.toLowerCase() === v);
  if (exact) return exact;
  return (
    FONT_FAMILY_WHITELIST.find((entry) => {
      const lead = entry.split(",")[0]?.replace(/"/g, "").trim().toLowerCase();
      return lead ? v.includes(lead) : false;
    }) ?? ""
  );
}

function readSpanStyle(el: HTMLElement): string[] {
  const parts: string[] = [];
  const fontSize = safeFontSize(el.style.fontSize);
  const letterSpacing = safeLetterSpacing(el.style.letterSpacing);
  const lineHeight = safeLineHeight(el.style.lineHeight);
  const fontFamily = safeFontFamily(el.style.fontFamily);
  if (fontSize) parts.push(`font-size:${fontSize}`);
  if (letterSpacing) parts.push(`letter-spacing:${letterSpacing}`);
  if (lineHeight) parts.push(`line-height:${lineHeight}`);
  if (fontFamily) parts.push(`font-family:${fontFamily}`);
  return parts;
}

function applySpanStyle(el: HTMLElement, parts: string[]) {
  el.removeAttribute("style");
  if (!parts.length) return;
  el.setAttribute("style", parts.join(";"));
}

export function sanitizeSpanStyleAttribute(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "";
  const parts: string[] = [];
  for (const chunk of raw.split(";")) {
    const idx = chunk.indexOf(":");
    if (idx <= 0) continue;
    const prop = chunk.slice(0, idx).trim().toLowerCase();
    const val = chunk.slice(idx + 1).trim();
    if (!ALLOWED_SPAN_STYLES.has(prop) || !val) continue;
    if (prop === "font-size") {
      const clean = safeFontSize(val);
      if (clean) parts.push(`font-size:${clean}`);
    } else if (prop === "letter-spacing") {
      const clean = safeLetterSpacing(val);
      if (clean) parts.push(`letter-spacing:${clean}`);
    } else if (prop === "line-height") {
      const clean = safeLineHeight(val);
      if (clean) parts.push(`line-height:${clean}`);
    } else if (prop === "font-family") {
      const clean = safeFontFamily(val);
      if (clean) parts.push(`font-family:${clean}`);
    }
  }
  return parts.join(";");
}

export function normalizeInlineMarkup(html: string): string {
  if (typeof window === "undefined" || !html.trim()) return html;

  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return html;

  function convertSpanLike(el: HTMLElement) {
    const tag = el.tagName.toUpperCase();
    if (tag !== "SPAN" && tag !== "FONT") return;

    const bold = isBoldWeight(el.style.fontWeight);
    const italic = el.style.fontStyle === "italic";
    const underline = hasUnderline(el.style);
    const styleParts = readSpanStyle(el);

    if (!bold && !italic && !underline) {
      if (styleParts.length) {
        const span = doc.createElement("span");
        applySpanStyle(span, styleParts);
        while (el.firstChild) span.appendChild(el.firstChild);
        el.replaceWith(span);
        return;
      }
      const parent = el.parentNode;
      if (!parent) return;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
      return;
    }

    const fragment = doc.createDocumentFragment();
    while (el.firstChild) fragment.appendChild(el.firstChild);

    let wrapped: Node = fragment;
    const wrap = (name: string) => {
      const node = doc.createElement(name);
      node.appendChild(wrapped);
      wrapped = node;
    };

    if (bold) wrap("b");
    if (italic) wrap("i");
    if (underline) wrap("u");
    if (styleParts.length) {
      const span = doc.createElement("span");
      applySpanStyle(span, styleParts);
      span.appendChild(wrapped);
      wrapped = span;
    }

    el.replaceWith(wrapped);
  }

  function walk(node: Node) {
    Array.from(node.childNodes).forEach(walk);
    if (node instanceof HTMLElement) convertSpanLike(node);
  }

  walk(root);
  return root.innerHTML;
}

/**
 * Sanitize rich HTML down to a tiny, attribute-free inline subset. Works in the
 * browser via DOMParser; on the server it falls back to a regex strip so stored
 * values are always safe to render.
 */
function normalizeBoldSpansServer(raw: string): string {
  return raw.replace(
    /<span[^>]*style="[^"]*font-weight:\s*(?:bold|bolder|[6-9]\d{2})[^"]*"[^>]*>([\s\S]*?)<\/span>/gi,
    "<b>$1</b>"
  );
}

export function sanitizeRichHtml(input: unknown): string {
  if (typeof input !== "string" || !input.trim()) return "";
  let raw = input.slice(0, RICH_TEXT_LIMITS.maxLength);
  if (typeof window !== "undefined") {
    raw = normalizeInlineMarkup(raw);
  } else {
    raw = normalizeBoldSpansServer(raw);
  }

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
      if (tag === "SPAN") {
        const style = sanitizeSpanStyleAttribute(el.getAttribute("style"));
        if (style) {
          out += `<span style="${style}">${walk(el)}</span>`;
        } else {
          out += walk(el);
        }
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

/** Plain-text version (tags stripped, <br> → newline) for mirrors and search. */
export function richToPlain(input: unknown): string {
  const html = sanitizeRichHtml(input);
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

function coerceRichTextRecord(input: unknown): Record<string, unknown> | null {
  if (input && typeof input === "object") return input as Record<string, unknown>;
  if (typeof input === "string" && input.trim()) {
    try {
      const parsed = JSON.parse(input);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      // Legacy plain string — treat as unformatted html seed.
      return { html: input };
    }
  }
  return null;
}

/** Normalize + clamp a stored rich value. Returns undefined when there's nothing. */
export function normalizeRichText(input: unknown): RichTextValue | undefined {
  const src = coerceRichTextRecord(input);
  if (!src) return undefined;
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
  return /<(b|strong|i|em|u|span)/i.test(value.html || "");
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
  const html = escapeHtml(str).replace(/\r\n/g, "\n").replace(/\n/g, "<br>");
  return { html };
}
