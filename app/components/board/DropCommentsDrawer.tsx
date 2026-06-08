"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  addDropComment,
  DROP_COMMENTS_UPDATED_EVENT,
  readDropComments,
  type DropComment,
} from "@/lib/board/dropComments";
import styles from "./DropCommentsDrawer.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  dropId: string;
  dropTitle?: string;
};

function readViewerIdentity() {
  if (typeof window === "undefined") {
    return { userId: "local-board-user", username: "board", displayName: "Board User", avatarUrl: "" };
  }

  try {
    const raw = window.localStorage.getItem("jab_board_profile_v2");
    const parsed = raw ? JSON.parse(raw) : null;
    const displayName = String(parsed?.displayName ?? parsed?.name ?? "Board User").trim();
    const username = String(parsed?.username ?? displayName ?? "board")
      .replace(/^@+/, "")
      .trim()
      .toLowerCase();
    return {
      userId: String(parsed?.userId ?? parsed?.id ?? "local-board-user"),
      username: username || "board",
      displayName: displayName || "Board User",
      avatarUrl: String(parsed?.avatarSrc ?? parsed?.avatarUrl ?? parsed?.avatarDataUrl ?? ""),
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

export default function DropCommentsDrawer({ open, onClose, dropId, dropTitle }: Props) {
  const [mounted, setMounted] = useState(false);
  const [comments, setComments] = useState<DropComment[]>([]);
  const [draft, setDraft] = useState("");
  const viewer = useMemo(readViewerIdentity, [open]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open || !dropId) return;
    const sync = () => setComments(readDropComments(dropId));
    sync();
    window.addEventListener(DROP_COMMENTS_UPDATED_EVENT, sync as EventListener);
    window.addEventListener("storage", sync as EventListener);
    return () => {
      window.removeEventListener(DROP_COMMENTS_UPDATED_EVENT, sync as EventListener);
      window.removeEventListener("storage", sync as EventListener);
    };
  }, [dropId, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  if (!mounted || !open || !dropId) return null;

  const submit = () => {
    const body = draft.trim();
    if (!body) return;
    const comment = addDropComment({
      dropId,
      userId: viewer.userId,
      username: viewer.username,
      displayName: viewer.displayName,
      avatarUrl: viewer.avatarUrl,
      body,
    });
    setComments((current) => [...current, comment]);
    setDraft("");
    // TODO: replace local storage write with Supabase comment persistence when Board comments table is ready.
  };

  return createPortal(
    <div className={styles.overlay} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-label="Drop comments">
        <header className={styles.header}>
          <div className={styles.headerTop}>
            <div>
              <p className={styles.eyebrow}>Drop Side Channel</p>
              <h2 className={styles.title}>Comments</h2>
            </div>
            <button className={styles.close} type="button" onClick={onClose} aria-label="Close comments">
              ✕
            </button>
          </div>
          {dropTitle ? <p className={styles.dropTitle}>{dropTitle}</p> : null}
        </header>

        <div className={styles.list}>
          {comments.length === 0 ? (
            <div className={styles.empty}>No comments yet. Start the signal.</div>
          ) : (
            comments.map((comment) => (
              <article className={styles.comment} key={comment.id}>
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
          <button className={styles.send} type="button" onClick={submit} disabled={!draft.trim()}>
            Send
          </button>
        </div>
      </aside>
    </div>,
    document.body
  );
}
