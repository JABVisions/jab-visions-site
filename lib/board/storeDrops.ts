"use client";

export type StoreDropStatus = "collected" | "bookmarked";

export type BoardStoreDrop = {
  id: string;
  title: string;
  artifactNumber?: string;
  imageUrl: string;
  productUrl: string;
  price?: string;
  status: StoreDropStatus;
  collectedAt?: string;
  bookmarkedAt?: string;
};

export const STORE_DROP_BOOKMARKS_STORAGE_KEY = "jab_board_store_drop_bookmarks_v1";
export const STORE_DROP_COLLECTION_STORAGE_KEY = "jab_board_store_drop_collection_v1";
export const STORE_DROP_UPDATED_EVENT = "board:store-drops:updated";

type StoreDropInput = Omit<BoardStoreDrop, "status" | "bookmarkedAt" | "collectedAt">;

function safeParseList(raw: string | null): BoardStoreDrop[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item): BoardStoreDrop | null => {
        if (!item || typeof item !== "object") return null;
        const id = String((item as any).id ?? "").trim();
        const title = String((item as any).title ?? "").trim();
        const imageUrl = String((item as any).imageUrl ?? (item as any).image ?? "").trim();
        const productUrl = String((item as any).productUrl ?? (item as any).href ?? "").trim();
        if (!id || !title || !imageUrl || !productUrl) return null;

        const status = (item as any).status === "collected" ? "collected" : "bookmarked";
        return {
          id,
          title,
          artifactNumber:
            typeof (item as any).artifactNumber === "string"
              ? (item as any).artifactNumber
              : typeof (item as any).artifactId === "string"
                ? (item as any).artifactId
                : undefined,
          imageUrl,
          productUrl,
          price: typeof (item as any).price === "string" ? (item as any).price : undefined,
          status,
          collectedAt:
            typeof (item as any).collectedAt === "string" ? (item as any).collectedAt : undefined,
          bookmarkedAt:
            typeof (item as any).bookmarkedAt === "string" ? (item as any).bookmarkedAt : undefined,
        };
      })
      .filter(Boolean) as BoardStoreDrop[];
  } catch {
    return [];
  }
}

function readList(key: string) {
  if (typeof window === "undefined") return [];
  return safeParseList(window.localStorage.getItem(key));
}

function writeList(key: string, items: BoardStoreDrop[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(STORE_DROP_UPDATED_EVENT));
  window.dispatchEvent(new StorageEvent("storage", { key }));
}

export function readStoreDropBookmarks() {
  return readList(STORE_DROP_BOOKMARKS_STORAGE_KEY).filter(
    (item) => item.status === "bookmarked"
  );
}

export function readCollectedStoreDrops() {
  return readList(STORE_DROP_COLLECTION_STORAGE_KEY).filter(
    (item) => item.status === "collected"
  );
}

export function isStoreDropBookmarked(id: string) {
  return readStoreDropBookmarks().some((item) => item.id === id);
}

export function bookmarkStoreDrop(drop: StoreDropInput) {
  const bookmarks = readStoreDropBookmarks();
  if (bookmarks.some((item) => item.id === drop.id)) return bookmarks;

  const savedDrop: BoardStoreDrop = {
      ...drop,
      status: "bookmarked",
      bookmarkedAt: new Date().toISOString(),
  };
  const next: BoardStoreDrop[] = [
    savedDrop,
    ...bookmarks,
  ].slice(0, 80);

  writeList(STORE_DROP_BOOKMARKS_STORAGE_KEY, next);
  return next;
}

export function unbookmarkStoreDrop(id: string) {
  const next = readStoreDropBookmarks().filter((item) => item.id !== id);
  writeList(STORE_DROP_BOOKMARKS_STORAGE_KEY, next);
  return next;
}

export function toggleStoreDropBookmark(drop: StoreDropInput) {
  if (isStoreDropBookmarked(drop.id)) {
    unbookmarkStoreDrop(drop.id);
    return false;
  }

  bookmarkStoreDrop(drop);
  return true;
}

export function readStoreDropCollectionSlots(slotCount = 4): Array<BoardStoreDrop | null> {
  const collected = readCollectedStoreDrops();
  const collectedIds = new Set(collected.map((item) => item.id));
  const bookmarks = readStoreDropBookmarks().filter((item) => !collectedIds.has(item.id));

  const filled = [
    ...collected.sort((a, b) => String(b.collectedAt ?? "").localeCompare(String(a.collectedAt ?? ""))),
    ...bookmarks.sort((a, b) => String(b.bookmarkedAt ?? "").localeCompare(String(a.bookmarkedAt ?? ""))),
  ].slice(0, slotCount);

  return Array.from({ length: slotCount }, (_, index) => filled[index] ?? null);
}
