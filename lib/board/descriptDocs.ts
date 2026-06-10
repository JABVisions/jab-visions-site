"use client";

// Descript — Drop Studio's document mode. Longer, polished written drops
// (scripts, lyrics, essays, journals) saved locally so they can be finished and
// shared later. Stored in localStorage, first-seen-wins, with an optional owner
// id when auth is available. Kept deliberately separate from media drafts
// (dropDrafts.ts) and other Drop Studio state.

import { supabaseBrowser } from "@/lib/supabase/browser";
import { normalizeInlineMarkup } from "@/lib/board/richText";

export const DESCRIPT_DOCS_STORAGE_KEY = "jab_descript_docs_v1";
export const DESCRIPT_THEME_KEY = "jab_descript_theme_v1";
export const DESCRIPT_DOCS_UPDATED_EVENT = "board:descript-docs:updated";
/** Fired when a Descript is shared to Board, so a host can post it as a drop. */
export const DESCRIPT_SHARE_EVENT = "board:descript:share";

const MAX_DOCS = 100;
// Guard against a runaway paste blowing the localStorage quota (~400KB of HTML).
const MAX_HTML_LENGTH = 400_000;

/** How a Descript was started — drives analytics + Bucket Brain context later. */
export type DescriptSourceKind = "blank" | "template" | "upload" | "capture";

/** Where a finished Descript is headed when published (future routing). */
export type DescriptDestination = "thought" | "pay" | "doc" | "work" | "announcement";

export type DescriptDoc = {
  id: string;
  title: string;
  /** Sanitized rich HTML body. */
  html: string;
  /** Plain-text mirror (counts, search, feed fallback). */
  plainText: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  userId?: string | null;
  /** Provenance + future-routing metadata (all optional, non-breaking). */
  sourceKind?: DescriptSourceKind;
  templateKey?: string;
  /** Destination chosen at publish time (Thought / Pay / Doc / Work / …). */
  destination?: DescriptDestination;
  /** When stored inside a Work Drop project container. */
  workDropId?: string;
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export type DescriptTheme = "night" | "day";

export function readDescriptTheme(): DescriptTheme {
  if (!canUseStorage()) return "night";
  try {
    return window.localStorage.getItem(DESCRIPT_THEME_KEY) === "day" ? "day" : "night";
  } catch {
    return "night";
  }
}

export function saveDescriptTheme(theme: DescriptTheme) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(DESCRIPT_THEME_KEY, theme);
  } catch {
    // ignore
  }
}

export function readDescriptDocs(): DescriptDoc[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(DESCRIPT_DOCS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (d) => d && typeof d.id === "string" && typeof d.html === "string"
    ) as DescriptDoc[];
  } catch {
    return [];
  }
}

function writeDescriptDocs(docs: DescriptDoc[]) {
  if (!canUseStorage()) return;
  const ordered = [...docs]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_DOCS);
  try {
    window.localStorage.setItem(DESCRIPT_DOCS_STORAGE_KEY, JSON.stringify(ordered));
  } catch {
    try {
      window.localStorage.setItem(
        DESCRIPT_DOCS_STORAGE_KEY,
        JSON.stringify(ordered.slice(0, 20))
      );
    } catch {
      return;
    }
  }
  try {
    window.dispatchEvent(new CustomEvent(DESCRIPT_DOCS_UPDATED_EVENT));
  } catch {}
}

export function findDescriptDoc(id: string): DescriptDoc | null {
  if (!id) return null;
  return readDescriptDocs().find((d) => d.id === id) ?? null;
}

export function newDescriptId() {
  return `descript_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

/**
 * Create or update a Descript document. Pass an existing `id` to update in place
 * (preserving createdAt). Returns the saved doc, or null if storage is missing.
 */
export function saveDescriptDoc(input: {
  id?: string;
  title: string;
  html: string;
  plainText: string;
  description?: string;
  userId?: string | null;
  sourceKind?: DescriptSourceKind;
  templateKey?: string;
  destination?: DescriptDestination;
  workDropId?: string;
}): DescriptDoc | null {
  if (!canUseStorage()) return null;
  const now = Date.now();
  const existing = input.id ? findDescriptDoc(input.id) : null;

  const doc: DescriptDoc = {
    id: input.id || newDescriptId(),
    title: (input.title || "").slice(0, 200),
    html: (input.html || "").slice(0, MAX_HTML_LENGTH),
    plainText: input.plainText || "",
    description: input.description?.slice(0, 600) || undefined,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    userId: input.userId ?? existing?.userId ?? null,
    sourceKind: input.sourceKind ?? existing?.sourceKind,
    templateKey: input.templateKey ?? existing?.templateKey,
    destination: input.destination ?? existing?.destination,
    workDropId: input.workDropId ?? existing?.workDropId,
  };

  const next = [doc, ...readDescriptDocs().filter((d) => d.id !== doc.id)];
  writeDescriptDocs(next);
  return doc;
}

export function removeDescriptDoc(id: string) {
  writeDescriptDocs(readDescriptDocs().filter((d) => d.id !== id));
}

/** Best-effort current user id (for stamping owner). Never throws. */
export async function getDescriptOwnerId(): Promise<string | null> {
  try {
    const sb = supabaseBrowser();
    const { data } = await sb.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* sanitization — a broader (but still safe) subset than the inline rich text  */
/* field, so headings, quotes, lists and alignment survive.                    */
/* -------------------------------------------------------------------------- */

const ALLOWED_TAGS = new Set([
  "P", "DIV", "BR", "H1", "H2", "H3",
  "BLOCKQUOTE", "UL", "OL", "LI",
  "B", "STRONG", "I", "EM", "U", "SPAN",
]);

const ALLOWED_ALIGN = new Set(["left", "center", "right", "justify"]);

/**
 * Reduce Descript body HTML to a safe structural subset. Strips every tag
 * outside the allowlist (keeping their text), removes ALL attributes except a
 * whitelisted `text-align` style, and drops scripts/styles entirely. Falls back
 * to a plain-text-ish strip on the server where DOMParser is unavailable.
 */
export function sanitizeDescriptHtml(input: unknown): string {
  let raw = typeof input === "string" ? input : "";
  if (!raw) return "";
  if (typeof window !== "undefined" && typeof DOMParser !== "undefined") {
    raw = normalizeInlineMarkup(raw);
  }
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    // Server fallback: strip all tags, keep text.
    return raw.replace(/<[^>]*>/g, "").slice(0, MAX_HTML_LENGTH);
  }

  const doc = new DOMParser().parseFromString(raw, "text/html");

  const walk = (node: Node) => {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        const tag = el.tagName.toUpperCase();
        if (tag === "SCRIPT" || tag === "STYLE") {
          el.remove();
          continue;
        }
        if (!ALLOWED_TAGS.has(tag)) {
          // Unwrap: replace the element with its (recursively cleaned) children.
          walk(el);
          const parent = el.parentNode;
          if (parent) {
            while (el.firstChild) parent.insertBefore(el.firstChild, el);
            parent.removeChild(el);
          }
          continue;
        }
        // Allowed tag: strip every attribute except a safe text-align style.
        const align =
          el.style?.textAlign && ALLOWED_ALIGN.has(el.style.textAlign)
            ? el.style.textAlign
            : "";
        for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name);
        if (align) el.setAttribute("style", `text-align:${align}`);
        walk(el);
      } else if (child.nodeType !== Node.TEXT_NODE) {
        child.parentNode?.removeChild(child);
      }
    }
  };

  walk(doc.body);
  return doc.body.innerHTML.slice(0, MAX_HTML_LENGTH);
}

/** Plain text from a (sanitized) HTML body — used for counts and previews. */
export function descriptPlainText(html: unknown): string {
  const raw = typeof html === "string" ? html : "";
  if (!raw) return "";
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
  const doc = new DOMParser().parseFromString(raw, "text/html");
  return (doc.body.textContent || "").replace(/ /g, " ");
}

export function countWords(text: string): number {
  const t = (text || "").trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

export function countCharacters(text: string): number {
  return (text || "").length;
}
