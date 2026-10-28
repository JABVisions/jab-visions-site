"use client";

import { uploadBoardMediaFile } from "@/lib/board/boardMediaUpload";

export type DropbookDraftAsset = {
  key: string;
  fileName: string;
  mimeType: string;
  storagePath?: string;
  signedUrl?: string;
};

export type DropbookDraftState = {
  type: "dropbook-draft";
  title?: string;
  updatedAt: number;
  bookColor: string;
  cover: Record<string, unknown> | null;
  pages: Array<Record<string, unknown>>;
  documents: Record<string, unknown>;
  files: DropbookDraftAsset[];
};

export async function saveDropbookDraft(
  id: string,
  snapshot: Omit<DropbookDraftState, "type" | "files" | "updatedAt">,
  assets: Map<string, File>
) {
  if (!id) return;
  const files: DropbookDraftAsset[] = [];
  for (const [key, file] of assets) {
    const uploaded = await uploadBoardMediaFile(file, { folder: `drafts/dropbooks/${id}` });
    files.push({
      key,
      fileName: file.name || key,
      mimeType: file.type || "application/octet-stream",
      storagePath: uploaded.storagePath,
    });
  }
  const editorState: DropbookDraftState = {
    type: "dropbook-draft",
    updatedAt: Date.now(),
    bookColor: snapshot.bookColor,
    cover: snapshot.cover,
    pages: snapshot.pages,
    documents: snapshot.documents,
    files,
  };
  const response = await fetch("/api/board/drop-drafts", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, dropType: "dropbook", editorState }),
  });
  if (!response.ok) throw new Error("Dropbook draft could not be synced.");
}

export async function deleteDropbookDraft(id: string) {
  if (!id) return;
  await fetch(`/api/board/drop-drafts?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });
}
