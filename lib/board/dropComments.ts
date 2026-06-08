"use client";

export const DROP_COMMENTS_STORAGE_KEY = "jab_board_drop_comments_v1";
export const DROP_COMMENTS_UPDATED_EVENT = "board:drop-comments:updated";

export type DropComment = {
  id: string;
  remoteId?: string;
  dropId: string;
  userId?: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  body: string;
  createdAt: string;
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `comment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function safeParse(raw: string | null): DropComment[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isDropComment) : [];
  } catch {
    return [];
  }
}

function isDropComment(value: any): value is DropComment {
  return (
    value &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    typeof value.dropId === "string" &&
    typeof value.username === "string" &&
    typeof value.body === "string" &&
    typeof value.createdAt === "string"
  );
}

function dispatchDropCommentsUpdated(dropId?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(DROP_COMMENTS_UPDATED_EVENT, { detail: { dropId } })
  );
  window.dispatchEvent(new StorageEvent("storage", { key: DROP_COMMENTS_STORAGE_KEY }));
}

export function readAllDropComments(): DropComment[] {
  if (!canUseStorage()) return [];
  return safeParse(window.localStorage.getItem(DROP_COMMENTS_STORAGE_KEY));
}

function writeAllDropComments(comments: DropComment[], changedDropId?: string) {
  if (!canUseStorage()) return;
  const sorted = [...comments].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  window.localStorage.setItem(DROP_COMMENTS_STORAGE_KEY, JSON.stringify(sorted.slice(-1200)));
  dispatchDropCommentsUpdated(changedDropId);
}

export function readDropComments(dropId: string): DropComment[] {
  const id = String(dropId || "").trim();
  if (!id) return [];
  return readAllDropComments()
    .filter((comment) => comment.dropId === id)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export function getDropCommentCount(dropId: string) {
  return readDropComments(dropId).length;
}

function normalizeComment(value: any): DropComment | null {
  if (!value || typeof value !== "object") return null;
  const id = String(value.remoteId || value.id || "").trim();
  const dropId = String(value.dropId || value.drop_id || "").trim();
  const body = String(value.body || "").trim();
  if (!id || !dropId || !body) return null;

  return {
    id,
    remoteId: typeof value.remoteId === "string" ? value.remoteId : id,
    dropId,
    userId: typeof value.userId === "string" ? value.userId : undefined,
    username: String(value.username || "board").replace(/^@+/, "").toLowerCase(),
    displayName: typeof value.displayName === "string" ? value.displayName : undefined,
    avatarUrl: typeof value.avatarUrl === "string" ? value.avatarUrl : undefined,
    body,
    createdAt:
      typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
  };
}

function mergeRemoteComments(dropId: string, remote: DropComment[]) {
  if (!canUseStorage()) return remote;

  const id = String(dropId || "").trim();
  const existing = readAllDropComments();
  const otherDrops = existing.filter((comment) => comment.dropId !== id);
  const localForDrop = existing.filter(
    (comment) => comment.dropId === id && !comment.remoteId
  );
  const byId = new Map<string, DropComment>();

  for (const comment of [...remote, ...localForDrop]) {
    byId.set(comment.remoteId || comment.id, comment);
  }

  const merged = [...otherDrops, ...Array.from(byId.values())];
  writeAllDropComments(merged, id);
  return readDropComments(id);
}

export async function syncDropComments(dropId: string): Promise<DropComment[]> {
  const id = String(dropId || "").trim();
  if (!id || typeof window === "undefined") return readDropComments(id);

  try {
    const params = new URLSearchParams({ dropId: id });
    const res = await fetch(`/api/board/drop-comments?${params.toString()}`, {
      method: "GET",
      cache: "no-store",
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload?.ok) return readDropComments(id);

    const remote = (Array.isArray(payload.comments) ? payload.comments : [])
      .map(normalizeComment)
      .filter((comment: DropComment | null): comment is DropComment => Boolean(comment));

    return mergeRemoteComments(id, remote);
  } catch {
    return readDropComments(id);
  }
}

export async function syncDropCommentCounts(dropIds: string[]): Promise<Record<string, number>> {
  const ids = Array.from(new Set(dropIds.map((id) => String(id || "").trim()).filter(Boolean)));
  const fallback = ids.reduce<Record<string, number>>((acc, id) => {
    acc[id] = getDropCommentCount(id);
    return acc;
  }, {});

  if (!ids.length || typeof window === "undefined") return fallback;

  try {
    const params = new URLSearchParams({ dropIds: ids.join(",") });
    const res = await fetch(`/api/board/drop-comments?${params.toString()}`, {
      method: "GET",
      cache: "no-store",
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload?.ok) return fallback;

    const remote = (Array.isArray(payload.comments) ? payload.comments : [])
      .map(normalizeComment)
      .filter((comment: DropComment | null): comment is DropComment => Boolean(comment));

    for (const id of ids) {
      mergeRemoteComments(
        id,
        remote.filter((comment: DropComment) => comment.dropId === id)
      );
    }

    return { ...fallback, ...(payload.counts ?? {}) };
  } catch {
    return fallback;
  }
}

export function addDropComment(
  input: Omit<DropComment, "id" | "createdAt"> & {
    id?: string;
    createdAt?: string;
  }
) {
  const comment: DropComment = {
    id: input.id ?? makeId(),
    remoteId: input.id,
    dropId: input.dropId,
    userId: input.userId,
    username: input.username || "board",
    displayName: input.displayName,
    avatarUrl: input.avatarUrl,
    body: input.body,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };

  if (!canUseStorage()) return comment;

  const next = [...readAllDropComments(), comment].slice(-1200);
  writeAllDropComments(next, comment.dropId);
  return comment;
}

export async function addDropCommentRemote(
  input: Omit<DropComment, "id" | "createdAt"> & {
    id?: string;
    createdAt?: string;
  }
) {
  if (typeof window === "undefined") return addDropComment(input);

  try {
    const res = await fetch("/api/board/drop-comments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const payload = await res.json().catch(() => null);

    if (!res.ok || !payload?.ok || !payload.comment) {
      throw new Error(payload?.message || "Drop comment could not sync.");
    }

    const remote = normalizeComment(payload.comment);
    if (!remote) throw new Error("Drop comment synced, but response was invalid.");

    mergeRemoteComments(remote.dropId, [...readDropComments(remote.dropId), remote]);
    return remote;
  } catch {
    return addDropComment(input);
  }
}
