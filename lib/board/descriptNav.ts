/** Navigation helpers for Descript Mode — heading outline + page/section jumper. */

export type DescriptHeadingItem = {
  id: string;
  level: 1 | 2 | 3;
  text: string;
};

export type DescriptPageItem = {
  index: number;
  label: string;
  anchorId: string;
};

const ANCHOR_PREFIX = "descript-h-";
const PAGE_PREFIX = "descript-p-";

function anchorId(prefix: string, index: number) {
  return `${prefix}${index}`;
}

/** Stamp stable ids on headings and return the live outline. */
export function scanDescriptHeadings(root: HTMLElement | null): DescriptHeadingItem[] {
  if (!root) return [];
  const items: DescriptHeadingItem[] = [];
  root.querySelectorAll("h1,h2,h3").forEach((node, index) => {
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const level = tag === "h1" ? 1 : tag === "h2" ? 2 : 3;
    if (!el.id) el.id = anchorId(ANCHOR_PREFIX, index);
    const text = (el.textContent || "").trim() || `Heading ${index + 1}`;
    items.push({ id: el.id, level, text });
  });
  return items;
}

/**
 * Build page/section jumps. Prefer each H2 as a page; otherwise chunk top-level
 * blocks (~10 nodes) so long imports without headings still paginate.
 */
export function buildDescriptPages(root: HTMLElement | null): DescriptPageItem[] {
  if (!root) return [{ index: 0, label: "Start", anchorId: "" }];

  const h2Nodes = Array.from(root.querySelectorAll("h2")) as HTMLElement[];
  if (h2Nodes.length >= 1) {
    return h2Nodes.map((el, index) => {
      if (!el.id) el.id = anchorId(PAGE_PREFIX, index);
      const label = (el.textContent || "").trim() || `Page ${index + 1}`;
      return { index, label, anchorId: el.id };
    });
  }

  const blocks = Array.from(root.children).filter(
    (n) => (n.textContent || "").trim().length > 0
  ) as HTMLElement[];
  if (blocks.length <= 10) {
    return [{ index: 0, label: "Start", anchorId: blocks[0]?.id || "" }];
  }

  const CHUNK = 10;
  const pages: DescriptPageItem[] = [];
  for (let i = 0; i < blocks.length; i += CHUNK) {
    const first = blocks[i];
    if (!first.id) first.id = anchorId(PAGE_PREFIX, pages.length);
    const preview =
      (first.textContent || "").trim().replace(/\s+/g, " ").slice(0, 52) ||
      `Page ${pages.length + 1}`;
    pages.push({
      index: pages.length,
      label: preview,
      anchorId: first.id,
    });
  }
  return pages.length ? pages : [{ index: 0, label: "Start", anchorId: "" }];
}

export function scrollToDescriptAnchor(
  scrollRoot: HTMLElement | null,
  anchorId: string
) {
  if (!scrollRoot) return;
  if (!anchorId) {
    scrollRoot.scrollTop = 0;
    return;
  }
  const safe = anchorId.replace(/[^a-zA-Z0-9_-]/g, "");
  const target =
    scrollRoot.querySelector(`#${safe}`) ||
    scrollRoot.ownerDocument?.getElementById(safe);
  if (target instanceof HTMLElement) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}
