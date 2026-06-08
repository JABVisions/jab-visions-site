"use client";

import { supabaseBrowser } from "@/lib/supabase/browser";

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
  // Persist to Supabase (optimistic; local write already happened).
  void persistStoreDropRemote(savedDrop, "bookmarked");
  return next;
}

export function unbookmarkStoreDrop(id: string) {
  const next = readStoreDropBookmarks().filter((item) => item.id !== id);
  writeList(STORE_DROP_BOOKMARKS_STORAGE_KEY, next);
  void removeStoreDropRemote(id);
  return next;
}

export function collectStoreDrop(drop: StoreDropInput) {
  const collected = readCollectedStoreDrops();
  if (collected.some((item) => item.id === drop.id)) return collected;
  const savedDrop: BoardStoreDrop = {
    ...drop,
    status: "collected",
    collectedAt: new Date().toISOString(),
  };
  const next = [savedDrop, ...collected].slice(0, 80);
  writeList(STORE_DROP_COLLECTION_STORAGE_KEY, next);
  void persistStoreDropRemote(savedDrop, "collected");
  return next;
}

/* ----------------------------- Supabase layer -----------------------------
   Table: public.store_drop_collection (see BOARD_SYSTEMS_PLAN.md for the SQL).
   The local lists above stay the optimistic/offline cache; these functions
   mirror them to Supabase so a user's collection persists per account and
   across devices. All gracefully no-op when signed out or the table is absent. */

function rowToStoreDrop(row: any): BoardStoreDrop | null {
  const id = String(row?.drop_id ?? "").trim();
  const title = String(row?.title ?? "").trim();
  const imageUrl = String(row?.image_url ?? "").trim();
  const productUrl = String(row?.product_url ?? "").trim();
  if (!id || !title || !imageUrl || !productUrl) return null;
  return {
    id,
    title,
    imageUrl,
    productUrl,
    price: typeof row?.price === "string" ? row.price : undefined,
    artifactNumber: typeof row?.artifact_no === "string" ? row.artifact_no : undefined,
    status: row?.status === "collected" ? "collected" : "bookmarked",
    collectedAt: typeof row?.created_at === "string" ? row.created_at : undefined,
    bookmarkedAt: typeof row?.created_at === "string" ? row.created_at : undefined,
  };
}

export async function persistStoreDropRemote(drop: BoardStoreDrop, status: StoreDropStatus) {
  try {
    const sb = supabaseBrowser();
    const { data: auth } = await sb.auth.getUser();
    if (!auth?.user) return;
    await sb.from("store_drop_collection").upsert(
      {
        user_id: auth.user.id,
        drop_id: drop.id,
        title: drop.title,
        image_url: drop.imageUrl,
        product_url: drop.productUrl,
        price: drop.price ?? null,
        artifact_no: drop.artifactNumber ?? null,
        status,
      },
      { onConflict: "user_id,drop_id" }
    );
  } catch {
    // Offline / table missing — local cache still holds the change.
  }
}

export async function removeStoreDropRemote(dropId: string) {
  try {
    const sb = supabaseBrowser();
    const { data: auth } = await sb.auth.getUser();
    if (!auth?.user) return;
    await sb
      .from("store_drop_collection")
      .delete()
      .eq("user_id", auth.user.id)
      .eq("drop_id", dropId);
  } catch {
    // ignore
  }
}

/** Pull the account's collection from Supabase into the local cache. Returns all rows. */
export async function syncStoreDropCollection(): Promise<BoardStoreDrop[]> {
  try {
    const sb = supabaseBrowser();
    const { data: auth } = await sb.auth.getUser();
    if (!auth?.user) {
      return [...readCollectedStoreDrops(), ...readStoreDropBookmarks()];
    }
    const { data } = await sb
      .from("store_drop_collection")
      .select("*")
      .eq("user_id", auth.user.id);
    const rows = (data ?? [])
      .map(rowToStoreDrop)
      .filter((x): x is BoardStoreDrop => Boolean(x));

    writeList(
      STORE_DROP_COLLECTION_STORAGE_KEY,
      rows.filter((d) => d.status === "collected")
    );
    writeList(
      STORE_DROP_BOOKMARKS_STORAGE_KEY,
      rows.filter((d) => d.status === "bookmarked")
    );
    return rows;
  } catch {
    return [...readCollectedStoreDrops(), ...readStoreDropBookmarks()];
  }
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
