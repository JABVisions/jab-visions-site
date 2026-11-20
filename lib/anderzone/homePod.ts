import { regionById, tileKind } from "./world";

export const FURNITURE_CATALOG = [
  { id: "bed", label: "Pet Bed", w: 1, h: 1 },
  { id: "lamp", label: "Signal Lamp", w: 1, h: 1 },
  { id: "table", label: "Low Table", w: 2, h: 1 },
  { id: "cushion", label: "Floor Cushion", w: 1, h: 1 },
  { id: "plant", label: "Orbit Plant", w: 1, h: 1 },
] as const;

export type FurnitureKind = (typeof FURNITURE_CATALOG)[number]["id"];
export type VisitorAccess = "private" | "friends" | "public";

export type PlacedFurniture = {
  id: string;
  kind: FurnitureKind;
  x: number;
  y: number;
  rotation: 0 | 1 | 2 | 3;
};

export type InventoryItem = { kind: FurnitureKind; qty: number };

export type HomePod = {
  id: string;
  ownerId: string;
  version: number;
  visitorAccess: VisitorAccess;
  layout: PlacedFurniture[];
  inventory: InventoryItem[];
};

export type EditorState = {
  saved: PlacedFurniture[];
  draft: PlacedFurniture[];
  past: PlacedFurniture[][];
  future: PlacedFurniture[][];
  selectedId: string | null;
};

export function starterInventory(): InventoryItem[] {
  return FURNITURE_CATALOG.map((item) => ({ kind: item.id, qty: 1 }));
}

export function createStarterPod(ownerId: string): HomePod {
  return {
    id: `pod-${ownerId}`,
    ownerId,
    version: 1,
    visitorAccess: "private",
    layout: [],
    inventory: starterInventory(),
  };
}

export function ensureStarterPod(ownerId: string, existing: HomePod | null, alreadyGranted: boolean) {
  if (existing) return { pod: existing, grantedNow: false, alreadyGranted: true };
  if (alreadyGranted) return { pod: null, grantedNow: false, alreadyGranted: true };
  return { pod: createStarterPod(ownerId), grantedNow: true, alreadyGranted: true };
}

export function canVisit(pod: Pick<HomePod, "ownerId" | "visitorAccess">, viewerId: string) {
  if (pod.ownerId === viewerId) return true;
  return pod.visitorAccess === "public";
}

function catalogItem(kind: FurnitureKind) {
  return FURNITURE_CATALOG.find((item) => item.id === kind)!;
}

export function footprint(item: Pick<PlacedFurniture, "kind" | "x" | "y" | "rotation">) {
  const spec = catalogItem(item.kind);
  const wide = item.rotation % 2 === 1;
  const w = wide ? spec.h : spec.w;
  const h = wide ? spec.w : spec.h;
  const cells: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) cells.push({ x: item.x + x, y: item.y + y });
  }
  return cells;
}

export function placementError(layout: PlacedFurniture[], item: PlacedFurniture, inventory: InventoryItem[]) {
  const region = regionById("home-pod");
  if (!region) return "Home Pod is missing.";
  const owned = inventory.find((entry) => entry.kind === item.kind)?.qty ?? 0;
  const used = layout.filter((entry) => entry.kind === item.kind && entry.id !== item.id).length;
  if (used >= owned) return "That item is not in your inventory.";
  const cells = footprint(item);
  for (const cell of cells) {
    const kind = tileKind(region, cell.x, cell.y);
    if (kind !== "floor") return "Furniture has to sit on open floor.";
    const overlap = layout.some(
      (other) => other.id !== item.id && footprint(other).some((spot) => spot.x === cell.x && spot.y === cell.y)
    );
    if (overlap) return "That spot is already taken.";
  }
  return null;
}

function cloneLayout(layout: PlacedFurniture[]) {
  return layout.map((item) => ({ ...item }));
}

export function createEditor(layout: PlacedFurniture[]): EditorState {
  return { saved: cloneLayout(layout), draft: cloneLayout(layout), past: [], future: [], selectedId: null };
}

function push(editor: EditorState, draft: PlacedFurniture[], selectedId: string | null): EditorState {
  return {
    ...editor,
    past: [...editor.past, cloneLayout(editor.draft)],
    future: [],
    draft,
    selectedId,
  };
}

export function placeItem(editor: EditorState, item: PlacedFurniture, inventory: InventoryItem[]) {
  const error = placementError(editor.draft, item, inventory);
  if (error) return { editor, error };
  return { editor: push(editor, [...editor.draft, item], item.id), error: null };
}

export function moveItem(editor: EditorState, id: string, x: number, y: number, inventory: InventoryItem[]) {
  const current = editor.draft.find((item) => item.id === id);
  if (!current) return { editor, error: "Select a piece first." };
  const next = { ...current, x, y };
  const error = placementError(editor.draft, next, inventory);
  if (error) return { editor, error };
  return {
    editor: push(
      editor,
      editor.draft.map((entry) => (entry.id === id ? next : entry)),
      id
    ),
    error: null,
  };
}

export function rotateItem(editor: EditorState, id: string, inventory: InventoryItem[]) {
  const current = editor.draft.find((item) => item.id === id);
  if (!current) return { editor, error: "Select a piece first." };
  const next = { ...current, rotation: ((current.rotation + 1) % 4) as PlacedFurniture["rotation"] };
  const error = placementError(editor.draft, next, inventory);
  if (error) return { editor, error };
  return {
    editor: push(
      editor,
      editor.draft.map((entry) => (entry.id === id ? next : entry)),
      id
    ),
    error: null,
  };
}

export function removeItem(editor: EditorState, id: string) {
  if (!editor.draft.some((item) => item.id === id)) return editor;
  return push(
    editor,
    editor.draft.filter((item) => item.id !== id),
    null
  );
}

export function undoEdit(editor: EditorState): EditorState {
  const previous = editor.past[editor.past.length - 1];
  if (!previous) return editor;
  return {
    ...editor,
    past: editor.past.slice(0, -1),
    future: [cloneLayout(editor.draft), ...editor.future],
    draft: cloneLayout(previous),
  };
}

export function redoEdit(editor: EditorState): EditorState {
  const next = editor.future[0];
  if (!next) return editor;
  return {
    ...editor,
    past: [...editor.past, cloneLayout(editor.draft)],
    future: editor.future.slice(1),
    draft: cloneLayout(next),
  };
}

export function cancelEdit(editor: EditorState): EditorState {
  return { ...editor, draft: cloneLayout(editor.saved), past: [], future: [], selectedId: null };
}

export function saveEdit(pod: HomePod, editor: EditorState, expectedVersion: number) {
  if (expectedVersion !== pod.version) return { ok: false as const, reason: "version" };
  for (const item of editor.draft) {
    const error = placementError(editor.draft, item, pod.inventory);
    if (error) return { ok: false as const, reason: error };
  }
  const layout = cloneLayout(editor.draft);
  return {
    ok: true as const,
    pod: { ...pod, layout, version: pod.version + 1 },
    editor: { ...editor, saved: layout, past: [], future: [] },
  };
}

export function confirmedPodVersion(responseOk: boolean, body: { ok?: boolean; version?: unknown } | null) {
  if (!responseOk || !body?.ok || typeof body.version !== "number" || !Number.isFinite(body.version)) return null;
  return body.version;
}

export function petBedCenter(layout: PlacedFurniture[]) {
  const bed = layout.find((item) => item.kind === "bed");
  if (!bed) return null;
  return { x: bed.x * 32 + 16, y: bed.y * 32 + 16 };
}
