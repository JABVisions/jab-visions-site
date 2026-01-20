// app/components/board/work/storage.ts
export type PlacedDropKind = "youtube" | "music" | "link" | "media";

export type PlacedDropAsset = {
  id: string;
  kind: PlacedDropKind;
  title: string;
  createdAt: number;
  // optional payload fields you can expand later
  url?: string;
};

const KEY = "jab_work_placed_assets_v1";

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getPlacedDropAssets(): PlacedDropAsset[] {
  if (typeof window === "undefined") return [];
  return safeParse<PlacedDropAsset[]>(localStorage.getItem(KEY), []);
}

export function setPlacedDropAssets(items: PlacedDropAsset[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function placeDropAsset(asset: Omit<PlacedDropAsset, "id" | "createdAt">) {
  const items = getPlacedDropAssets();
  const next: PlacedDropAsset = {
    id: crypto?.randomUUID?.() ?? String(Date.now()),
    createdAt: Date.now(),
    ...asset,
  };
  setPlacedDropAssets([next, ...items]);
  return next;
}
