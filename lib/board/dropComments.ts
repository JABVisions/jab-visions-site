"use client";

export const DROP_COMMENTS_STORAGE_KEY = "jab_board_drop_comments_v1";
export const DROP_COMMENTS_UPDATED_EVENT = "board:drop-comments:updated";

export type DropComment = {
  id: string;
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

export function readAllDropComments(): DropComment[] {
  if (!canUseStorage()) return [];
  return safeParse(window.localStorage.getItem(DROP_COMMENTS_STORAGE_KEY));
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

export function addDropComment(
  input: Omit<DropComment, "id" | "createdAt"> & {
    id?: string;
    createdAt?: string;
  }
) {
  const comment: DropComment = {
    id: input.id ?? makeId(),
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
  window.localStorage.setItem(DROP_COMMENTS_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(
    new CustomEvent(DROP_COMMENTS_UPDATED_EVENT, { detail: { dropId: comment.dropId } })
  );
  window.dispatchEvent(new StorageEvent("storage", { key: DROP_COMMENTS_STORAGE_KEY }));
  return comment;
}
