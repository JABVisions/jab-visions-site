"use client";

import { useEffect, useState } from "react";
import DropCommentsDrawer from "@/app/components/board/DropCommentsDrawer";
import {
  BOARD_ACTIVITY_NAV_EVENT,
  BOARD_OPEN_DROP_COMMENTS_EVENT,
} from "@/lib/board/notifications";
import { handleActivityNavigation } from "@/lib/board/activityNavigation";
import type { BoardNotification } from "@/lib/board/notifications";

type CommentTarget = {
  dropId: string;
  commentId?: string;
  title?: string;
  href?: string;
  imageUrl?: string;
};

export default function ActivityNavigationHost() {
  const [comments, setComments] = useState<CommentTarget | null>(null);

  useEffect(() => {
    const onNav = (event: Event) => {
      const detail = (event as CustomEvent<{ notification: BoardNotification }>).detail;
      if (detail?.notification) handleActivityNavigation(detail.notification);
    };
    const onComments = (event: Event) => {
      const detail = (event as CustomEvent<CommentTarget>).detail;
      if (detail?.dropId) setComments(detail);
    };
    window.addEventListener(BOARD_ACTIVITY_NAV_EVENT, onNav as EventListener);
    window.addEventListener(BOARD_OPEN_DROP_COMMENTS_EVENT, onComments as EventListener);
    return () => {
      window.removeEventListener(BOARD_ACTIVITY_NAV_EVENT, onNav as EventListener);
      window.removeEventListener(BOARD_OPEN_DROP_COMMENTS_EVENT, onComments as EventListener);
    };
  }, []);

  if (!comments?.dropId) return null;

  return (
    <DropCommentsDrawer
      open
      onClose={() => setComments(null)}
      dropId={comments.dropId}
      dropTitle={comments.title}
      dropHref={comments.href}
      dropImageUrl={comments.imageUrl}
      highlightCommentId={comments.commentId}
    />
  );
}
