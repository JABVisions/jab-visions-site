"use client";

import type {
  BoardActivity,
  BoardActivityKind,
} from "@/lib/board/activity";
import { readDrops, type UniversalDrop } from "@/lib/board/drops/storage";
import { resolveBoardProjects } from "@/lib/board/projects";
import type { FeedDrop } from "@/lib/boardStore";
import { persistableFeedMediaHref, preferStreamingHref, isStreamingDropHref } from "@/lib/board/feedDropMedia";
import {
  activityFromProjectRoomPost,
  projectRoomPostHasMedia,
} from "@/lib/board/projectRoomDrop";
import { projectDropInfoHref } from "@/lib/board/projectNotebookBus";
import { dedupeActivity } from "@/lib/board/activityMerge";

export { dedupeActivity };

function safeIso(value: unknown) {
  const fallback = Date.now();
  let time = fallback;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    time = value;
  } else if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      time = numeric;
    } else {
      const parsed = new Date(value).getTime();
      if (Number.isFinite(parsed) && parsed > 0) time = parsed;
    }
  }
  return new Date(time).toISOString();
}

export function feedDropToActivity(drop: FeedDrop): BoardActivity {
  const kind: BoardActivityKind =
    drop.type === "forum_thread" || drop.type === "forum_reply"
      ? "forum_post"
      : "status";

  return {
    id: `feed_${drop.id}`,
    created_at: safeIso(drop.createdAt),
    user_id: drop.authorId || null,
    kind,
    title: drop.title || null,
    body: drop.text,
    href: drop.href ?? null,
    image_url:
      typeof drop.meta?.preview?.image === "string"
        ? drop.meta.preview.image
        : typeof drop.meta?.image_url === "string"
          ? drop.meta.image_url
          : null,
    meta: {
      source: "board_store_feed",
      authorName: drop.authorName,
      dropType: drop.type,
      ...(drop.meta ?? {}),
    },
  };
}

export function projectToActivity(project: ReturnType<typeof resolveBoardProjects>[number]): BoardActivity {
  return {
    id: `project_drop_${project.id}`,
    created_at: safeIso(project.createdAt),
    user_id: project.authorId ?? null,
    kind: "board_drop",
    title: `Project Drop: ${project.title}`,
    body:
      project.logline ||
      `${project.contactName || "Host"} is planning a ${project.projectType.toLowerCase()} project.`,
    href: projectDropInfoHref(project.id),
    image_url: project.media?.kind === "image" ? project.media.src : null,
    meta: {
      kind: "project_drop",
      cardStyle: "project_drop",
      projectId: project.id,
      projectType: project.projectType,
      location: project.location || null,
      status: project.status,
      rolesNeeded: project.rolesNeeded || null,
      startDate: project.startDate || null,
      endDate: project.endDate || null,
      unionStatus: project.unionStatus || null,
      compensationType: project.compensationType || null,
      rate: project.rate || null,
      contactName: project.contactName || null,
      contactEmail: project.contactEmail || null,
      notes: project.notes || null,
      description: project.logline || null,
      goal: project.goal || null,
      milestone: project.milestone || null,
      source: project.source || "project_notebook",
      authorId: project.authorId || null,
      authorName: project.authorName || project.contactName || null,
      authorUsername: project.authorUsername || null,
      authorAvatar: project.authorAvatar || null,
      authorGlow: project.authorGlow || null,
      authorAuraIntensity: project.authorAuraIntensity ?? null,
      productionTitle: project.productionTitle || null,
      roleTitle: project.roleTitle || null,
      department: project.department || null,
      payRange: project.payRange || null,
      remoteOrInPerson: project.remoteOrInPerson || null,
      deadline: project.deadline || null,
      auditionInstructions: project.auditionInstructions || null,
      applicationLink: project.applicationLink || null,
      attachedFiles: project.attachedFiles || null,
      payDropEligible: project.payDropEligible ?? null,
      signalSeed: {
        type: "project_drop_created",
        projectId: project.id,
      },
    },
  };
}

export function universalDropToActivity(drop: UniversalDrop): BoardActivity | null {
  if (!drop?.id || drop.visibility === "private") return null;

  const meta = drop.meta && typeof drop.meta === "object" ? drop.meta : {};
  const streamingHref =
    preferStreamingHref(drop.url, drop.embedUrl) ||
    (isStreamingDropHref(drop.mediaUrl) ? drop.mediaUrl : null);
  const href =
    streamingHref ||
    persistableFeedMediaHref(drop.url) ||
    persistableFeedMediaHref(drop.mediaUrl);
  const imageUrl =
    drop.imageUrl ||
    (drop.mediaKind === "image" &&
    !isStreamingDropHref(drop.mediaUrl) &&
    !isStreamingDropHref(drop.url)
      ? drop.mediaUrl || drop.url || null
      : null);
  const title =
    drop.type === "project" && !/^Project Drop:/i.test(drop.title)
      ? `Project Drop: ${drop.title}`
      : drop.title || (drop.type === "thought" ? "Thought Drop" : "Board Drop");
  const body =
    drop.thoughtText ||
    drop.description ||
    (drop.type === "thought"
      ? "A thought landed on Board."
      : `New ${drop.type} drop added to Board.`);

  return {
    id: `universal_${drop.id}`,
    created_at: safeIso(drop.createdAt),
    user_id: drop.authorId ?? null,
    kind: "board_drop",
    title,
    body,
    href,
    image_url: imageUrl,
    meta: {
      ...meta,
      source: drop.source || meta.source || "board_drops_storage",
      origin: drop.origin || meta.origin || null,
      dropId: drop.id,
      dropType: drop.type,
      drop_flavor: drop.type,
      description: drop.description || null,
      visibility: drop.visibility || "public",
      thoughtFormat: drop.thoughtFormat || null,
      thoughtText: drop.thoughtText || null,
      authorId: drop.authorId || null,
      authorName: drop.authorName || null,
      authorUsername: drop.authorUsername || null,
      authorAvatar: drop.authorAvatar || null,
      authorGlow: drop.authorGlow || null,
      authorAuraIntensity: drop.authorAuraIntensity ?? null,
      mediaKind:
        isStreamingDropHref(streamingHref) && drop.mediaKind !== "audio"
          ? null
          : drop.mediaKind || null,
      mediaUrl: drop.mediaUrl || drop.url || null,
      embedUrl: drop.embedUrl || meta.embedUrl || null,
      preview: imageUrl
        ? {
            image: imageUrl,
            title,
            description: drop.description || drop.thoughtText || null,
            embedUrl: drop.embedUrl || meta.embedUrl || null,
          }
        : drop.embedUrl || meta.embedUrl
          ? {
              ...(meta.preview && typeof meta.preview === "object" ? meta.preview : {}),
              embedUrl: drop.embedUrl || meta.embedUrl,
            }
          : meta.preview ?? null,
      signalSeed: {
        type: drop.type === "thought" ? "thought_drop_created" : "drop_created",
        dropId: drop.id,
      },
    },
  };
}

export function notebookRoomDropActivities(): BoardActivity[] {
  return resolveBoardProjects().flatMap((project) => [
    ...(Array.isArray(project.roomPosts) ? project.roomPosts : [])
      .filter((post) => projectRoomPostHasMedia(post))
      .map((post) => activityFromProjectRoomPost(post, project)),
  ]);
}

export function hydrateFeedWithNotebook(items: BoardActivity[]): BoardActivity[] {
  return dedupeActivity([
    ...items.filter(Boolean),
    ...(readDrops().map(universalDropToActivity).filter(Boolean) as BoardActivity[]),
    ...notebookRoomDropActivities(),
  ]);
}

export function mergeActivityWithFeed(
  activityItems: BoardActivity[],
  feedItems: FeedDrop[]
) {
  return dedupeActivity([
    ...activityItems.filter(Boolean),
    ...feedItems.map(feedDropToActivity),
    ...(readDrops().map(universalDropToActivity).filter(Boolean) as BoardActivity[]),
    ...resolveBoardProjects().map(projectToActivity),
    ...notebookRoomDropActivities(),
  ]);
}
