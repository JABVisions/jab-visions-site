"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  addDropCommentRemote,
  DROP_COMMENTS_UPDATED_EVENT,
  readDropComments,
  syncDropComments,
  type DropComment,
} from "@/lib/board/dropComments";
import { readCurrentBoardIdentity } from "@/lib/board/currentProfile";
import { pickBoardDisplayName } from "@/lib/board/boardAuthor";
import styles from "./DropCommentsDrawer.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  dropId: string;
  dropTitle?: string;
  dropOwnerUserId?: string;
  canonicalDropId?: string;
  dropHref?: string;
  dropImageUrl?: string;
  highlightCommentId?: string;
};

function readViewerIdentity() {
  if (typeof window === "undefined") {
    return { userId: "local-board-user", username: "board", displayName: "Board User", avatarUrl: "" };
  }

  try {
    const identity = readCurrentBoardIdentity();
    const displayName = pickBoardDisplayName(identity.displayName, identity.username) || identity.displayName;
    const username = String(identity.username || displayName || "board")
      .replace(/^@+/, "")
      .trim()
      .toLowerCase();
    return {
      userId: identity.id || "local-board-user",
      username: username || "board",
      displayName: displayName || "Board User",
      avatarUrl: identity.avatar || "",
    };
  } catch {
    return { userId: "local-board-user", username: "board", displayName: "Board User", avatarUrl: "" };
  }
}

function formatTime(value: string) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(time);
}

export default function DropCommentsDrawer({
  open,
  onClose,
  dropId,
  dropTitle,
  dropOwnerUserId,
  canonicalDropId,
  dropHref,
  dropImageUrl,
  highlightCommentId,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [comments, setComments] = useState<DropComment[]>([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const viewer = useMemo(readViewerIdentity, [open]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open || !dropId) return;
    let cancelled = false;
    const sync = () => setComments(readDropComments(dropId));
    sync();

    setSyncNote("Syncing comments with Board...");
    syncDropComments(dropId)
      .then((next) => {
        if (cancelled) return;
        setComments(next);
        setSyncNote("Synced with Supabase.");
      })
      .catch(() => {
        if (!cancelled) setSyncNote("Comments are local until Supabase is ready.");
      });

    window.addEventListener(DROP_COMMENTS_UPDATED_EVENT, sync as EventListener);
    window.addEventListener("storage", sync as EventListener);
    return () => {
      cancelled = true;
      window.removeEventListener(DROP_COMMENTS_UPDATED_EVENT, sync as EventListener);
      window.removeEventListener("storage", sync as EventListener);
    };
  }, [dropId, open]);

  useEffect(() => {
    if (!open || !highlightCommentId) return;
    const node = document.querySelector(`[data-comment-id="${highlightCommentId}"]`);
    if (node instanceof HTMLElement) node.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [comments, highlightCommentId, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  if (!mounted || !open || !dropId) return null;

  const submit = async () => {
    const body = draft.trim();
    if (!body || saving) return;

    setSaving(true);
    setSyncNote("Sending comment...");
    const comment = await addDropCommentRemote({
      dropId,
      userId: viewer.userId,
      username: viewer.username,
      displayName: viewer.displayName,
      avatarUrl: viewer.avatarUrl,
      body,
      dropOwnerUserId,
      canonicalDropId,
      dropTitle,
      dropHref,
      dropImageUrl,
    });
    setComments(readDropComments(dropId));
    setDraft("");
    setSyncNote(comment.remoteId ? "Comment synced to Supabase." : "Comment saved locally until Supabase is ready.");
    setSaving(false);
  };

  return createPortal(
    <div className={styles.overlay} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-label="Drop comments">
        <header className={styles.header}>
          <div className={styles.headerTop}>
            <div>
              <p className={styles.eyebrow}>Drop Side Channel</p>
              <h2 className={styles.title}>Comment</h2>
            </div>
            <button className={styles.close} type="button" onClick={onClose} aria-label="Close comments">
              ✕
            </button>
          </div>
          {dropTitle ? <p className={styles.dropTitle}>{dropTitle}</p> : null}
          {syncNote ? <p className={styles.syncNote}>{syncNote}</p> : null}
        </header>

        <div className={styles.list}>
          {comments.length === 0 ? (
            <div className={styles.empty}>No comments yet. Start the signal.</div>
          ) : (
            comments.map((comment) => (
              <article
                className={`${styles.comment} ${
                  highlightCommentId &&
                  (comment.id === highlightCommentId || comment.remoteId === highlightCommentId)
                    ? styles.commentHighlight
                    : ""
                }`}
                key={comment.id}
                data-comment-id={comment.remoteId || comment.id}
              >
                <div className={styles.avatar}>
                  {comment.avatarUrl ? <img src={comment.avatarUrl} alt="" /> : (comment.displayName || comment.username).slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <div className={styles.commentHead}>
                    <span className={styles.name}>{comment.displayName || `@${comment.username}`}</span>
                    <time className={styles.time}>{formatTime(comment.createdAt)}</time>
                  </div>
                  <p className={styles.body}>{comment.body}</p>
                </div>
              </article>
            ))
          )}
        </div>

        <div className={styles.composer}>
          <textarea
            className={styles.input}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Drop a comment into this signal..."
            rows={2}
          />
          <button className={styles.send} type="button" onClick={submit} disabled={!draft.trim() || saving}>
            {saving ? "Sending" : "Send"}
          </button>
        </div>
      </aside>
    </div>,
    document.body
  );
}
