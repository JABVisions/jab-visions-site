import {
  BOARD_ACTIVITY_NAV_EVENT,
  BOARD_OPEN_DROP_COMMENTS_EVENT,
  BOARD_OPEN_FRIENDZONE_CHAT_EVENT,
  destinationForActivity,
  type BoardNotification,
} from "@/lib/board/notifications";
import { openForumRoom, parseForumHref } from "@/lib/board/boardAuthor";
import { openProjectDropInfo, projectIdFromWorkHref } from "@/lib/board/projectNotebookBus";

export type ActivityNavigationDetail = {
  notification: BoardNotification;
};

export function navigateActivity(notification: BoardNotification) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(BOARD_ACTIVITY_NAV_EVENT, { detail: { notification } })
  );
}

export function handleActivityNavigation(notification: BoardNotification) {
  if (typeof window === "undefined") return;
  const destination = destinationForActivity(notification);

  if (destination.kind === "conversation") {
    window.dispatchEvent(
      new CustomEvent(BOARD_OPEN_FRIENDZONE_CHAT_EVENT, {
        detail: {
          friendId: destination.actorUserId || "",
          username: destination.actorUsername || "",
          name: String(notification.metadata?.actorName || destination.actorUsername || "Board User"),
          avatar: String(notification.metadata?.actorAvatar || ""),
          conversationId: destination.conversationId || "",
        },
      })
    );
    return;
  }

  if (destination.kind === "drop") {
    window.dispatchEvent(
      new CustomEvent(BOARD_OPEN_DROP_COMMENTS_EVENT, {
        detail: {
          dropId: destination.dropId,
          commentId: destination.commentId || "",
          href: destination.href || notification.href || "",
          title: String(notification.metadata?.dropTitle || ""),
          imageUrl: notification.imageUrl || "",
        },
      })
    );
    return;
  }

  if (destination.kind === "profile") {
    const username = String(destination.username || "").replace(/^@+/, "");
    const href = username
      ? `/board/profile/${encodeURIComponent(username)}`
      : "/board/profile";
    window.location.assign(href);
    return;
  }

  if (destination.kind === "href" && destination.href) {
    if (parseForumHref(destination.href)) {
      openForumRoom(destination.href);
      return;
    }
    const projectId = projectIdFromWorkHref(destination.href);
    if (projectId && window.location.pathname.startsWith("/board/work")) {
      openProjectDropInfo(projectId);
      return;
    }
    if (destination.href.startsWith("/") && !destination.href.startsWith("//")) {
      window.location.assign(destination.href);
      return;
    }
    window.open(destination.href, "_blank", "noopener,noreferrer");
  }
}
