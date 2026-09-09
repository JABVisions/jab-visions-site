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
import {
  readBrain,
  writeBrain,
  type BucketEntry,
  type BucketMemoryDrop,
} from "@/lib/board/bucketBrain";
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

function saveCommentToBucketBrain(comment: DropComment, dropTitle?: string) {
  if (typeof window === "undefined") return;

  const activityId = `comment:${comment.dropId}:${comment.remoteId || comment.id}`;
  const item: BucketMemoryDrop = {
    id: activityId,
    created_at: comment.createdAt,
    user_id: comment.userId ?? null,
    kind: "drop_comment",
    title: dropTitle ? `Comment on ${dropTitle}` : "Drop comment",
    body: comment.body,
    href: null,
    image_url: comment.avatarUrl ?? null,
    meta: {
      dropId: comment.dropId,
      commentId: comment.remoteId || comment.id,
      reactionType: "comment",
      source: "drop_comments",
      username: comment.username,
      displayName: comment.displayName,
    },
  };

  const prev = readBrain();
  const entry: BucketEntry = {
    activityId,
    savedAt: Date.now(),
    item,
  };
  const nextPin = [
    entry,
    ...(prev.pin ?? []).filter((existing) => existing.activityId !== activityId),
  ].slice(0, 240);

  writeBrain({
    ...prev,
    pin: nextPin,
    updatedAt: Date.now(),
  });
}

export default function DropCommentsDrawer({ open, onClose, dropId, dropTitle }: Props) {
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
    try {
      const comment = await addDropCommentRemote({
        dropId,
        userId: viewer.userId,
        username: viewer.username,
        displayName: viewer.displayName,
        avatarUrl: viewer.avatarUrl,
        body,
      });
      // Saving into the bucket brain is a best-effort side effect; never let it
      // block the comment from showing or strand the composer in "Sending".
      try {
        saveCommentToBucketBrain(comment, dropTitle);
      } catch {
        /* ignore brain write failures */
      }
      setComments(readDropComments(dropId));
      setDraft("");
      setSyncNote(
        comment.remoteId
          ? "Comment synced to Supabase."
          : "Comment saved locally until Supabase is ready."
      );
    } catch (error) {
      // The comment may still have been written locally; reflect whatever is
      // stored and surface the issue instead of silently hanging.
      setComments(readDropComments(dropId));
      setSyncNote(
        error instanceof Error
          ? `Comment couldn't sync: ${error.message}`
          : "Comment couldn't sync. Please try again."
      );
    } finally {
      setSaving(false);
    }
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
          <button className={styles.send} type="button" onClick={submit} disabled={!draft.trim() || saving}>
            {saving ? "Sending" : "Send"}
          </button>
        </div>
      </aside>
    </div>,
    document.body
  );
}
