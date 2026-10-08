"use client";

import { parseDropStudioV5Snapshot, type DropStudioV5Session } from "@/lib/board/dropStudioV5";

const ENDPOINT = "/api/board/drop-drafts";
const MIN_SYNC_MS = 8000;
const pending = new Map<string, { timer: number; lastRun: number }>();

async function postSession(draftId: string, session: DropStudioV5Session) {
  try {
    await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: draftId, dropType: "video", editorState: session }),
    });
  } catch {
    // Local autosave remains the source of truth.
  }
}

export function queueDropStudioV5CloudSync(draftId: string, session: DropStudioV5Session) {
  if (typeof window === "undefined" || !draftId) return;
  const existing = pending.get(draftId);
  if (existing) window.clearTimeout(existing.timer);
  const since = existing ? Date.now() - existing.lastRun : MIN_SYNC_MS;
  const delay = since >= MIN_SYNC_MS ? 400 : MIN_SYNC_MS - since;
  const timer = window.setTimeout(() => {
    pending.delete(draftId);
    void postSession(draftId, session);
  }, delay);
  pending.set(draftId, { timer, lastRun: existing?.lastRun ?? 0 });
}

export async function fetchDropStudioV5Cloud(draftId: string): Promise<DropStudioV5Session | null> {
  if (!draftId) return null;
  try {
    const response = await fetch(`${ENDPOINT}?id=${encodeURIComponent(draftId)}`, { cache: "no-store" });
    if (!response.ok) return null;
    const body = (await response.json()) as { drafts?: Array<{ editor_state?: unknown }> };
    return parseDropStudioV5Snapshot(body.drafts?.[0]?.editor_state);
  } catch {
    return null;
  }
}
