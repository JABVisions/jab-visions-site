"use client";

import type {
  BoardActivity,
  BoardActivityKind,
} from "@/lib/board/activity";
import { readDrops, type UniversalDrop } from "@/lib/board/drops/storage";
import { patchMusicActivity } from "@/lib/board/musicMigration";
import { normalizeRichText } from "@/lib/board/richText";
import { resolveBoardProjects } from "@/lib/board/projects";
import type { FeedDrop } from "@/lib/boardStore";

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

function activitySortTime(item: BoardActivity) {
  const meta = item.meta && typeof item.meta === "object" ? item.meta : null;
  const value = meta?.pushedAt ?? item.created_at;
  const time = new Date(String(value || "")).getTime();
  return Number.isFinite(time) ? time : 0;
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

export function dedupeActivity(items: BoardActivity[]) {
  const map = new Map<string, BoardActivity>();
  const aliases = new Map<string, string>();

  for (const item of items) {
    if (!item?.id) continue;
    const meta = item.meta && typeof item.meta === "object" ? item.meta : null;
    const isPushed = Boolean(meta?.isPushed);
    const ownerKey =
      typeof meta?.ownerUsername === "string" && meta.ownerUsername
        ? meta.ownerUsername
        : item.user_id
          ? String(item.user_id)
          : "";
    const dropId =
      typeof meta?.dropId === "string" && meta.dropId
        ? `drop:${ownerKey}:${meta.dropId}`
        : typeof meta?.projectId === "string" && meta.projectId
          ? `project:${ownerKey}:${meta.projectId}`
          : "";
    const isProjectDrop =
      String(meta?.kind ?? "").includes("project") ||
      String(meta?.cardStyle ?? "").includes("project") ||
      /^Project Drop:\s*/i.test(item.title ?? "");
    const titleKey = item.title
      ? `title:${item.kind}:${ownerKey}:${item.title.trim().toLowerCase()}`
      : "";
    const bodyKey = item.body
      ? `body:${item.kind}:${ownerKey}:${item.body.trim().toLowerCase()}`
      : "";
    const hrefKey = item.href ? `href:${item.href}` : "";
    const imageKey = item.image_url ? `image:${item.image_url}` : "";
    const titleBodyKey =
      titleKey && bodyKey ? `${titleKey}:${bodyKey}` : titleKey || bodyKey;
    const generatedCaptionKey =
      titleKey && /^New .+ drop (added to Board|from .+)\.?$/i.test(item.body ?? "")
        ? `generated:${item.kind}:${item.title?.trim().toLowerCase()}`
        : "";
    const isRecoveredMirror = /^New .+ drop from .+/i.test(item.body ?? "");
    const hasStrongIdentity = Boolean(dropId || hrefKey || imageKey);
    const pushKey = isPushed
      ? `push:${meta?.originalDropId || item.id}:${meta?.pushedByUserId || ""}`
      : "";
    const itemAliases = isPushed
      ? [pushKey || item.id]
      : [
          dropId,
          hrefKey,
          imageKey,
          isProjectDrop ? titleBodyKey : "",
          !dropId && !hrefKey && !imageKey ? titleBodyKey : "",
        ].filter(Boolean);
    const weakAliases = [generatedCaptionKey].filter(Boolean);
    const matchableAliases =
      isPushed
        ? itemAliases
        : hasStrongIdentity && !isRecoveredMirror
        ? itemAliases
        : [...itemAliases, ...weakAliases];
    const matchedAlias = matchableAliases.find((alias) => aliases.has(alias));
    const key = matchedAlias
      ? aliases.get(matchedAlias)!
      : isPushed
        ? pushKey || item.id
        : dropId || hrefKey || imageKey || item.id || titleBodyKey;
    const previous = map.get(key);
    if (!previous) {
      map.set(key, item);
      for (const alias of itemAliases) aliases.set(alias, key);
      for (const alias of weakAliases) {
        if (!aliases.has(alias)) aliases.set(alias, key);
      }
      continue;
    }

    const previousScore =
      (previous.image_url ? 2 : 0) + (previous.href ? 1 : 0) + (previous.meta ? 1 : 0);
    const nextScore = (item.image_url ? 2 : 0) + (item.href ? 1 : 0) + (item.meta ? 1 : 0);
    if (nextScore > previousScore || activitySortTime(item) > activitySortTime(previous)) {
      map.set(key, item);
    }
    for (const alias of itemAliases) aliases.set(alias, key);
    for (const alias of weakAliases) {
      if (!aliases.has(alias)) aliases.set(alias, key);
    }
  }

  return Array.from(map.values()).sort((a, b) => activitySortTime(b) - activitySortTime(a));
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
    href: "/board/work",
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
  const titleRich =
    normalizeRichText((drop as { titleRich?: unknown }).titleRich) ??
    normalizeRichText(meta.titleRich);
  const descriptionRich =
    normalizeRichText((drop as { descriptionRich?: unknown }).descriptionRich) ??
    normalizeRichText(meta.descriptionRich);
  const imageUrl =
    drop.imageUrl ||
    (drop.mediaKind === "image" ? drop.mediaUrl || drop.url || null : null);
  const href = drop.mediaUrl || drop.url || null;
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
      ...(titleRich ? { titleRich } : {}),
      ...(descriptionRich ? { descriptionRich } : {}),
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
      mediaKind: drop.mediaKind || null,
      mediaUrl: drop.mediaUrl || null,
      bucket: drop.bucket || (meta.bucket as string | undefined) || null,
      storagePath: drop.storagePath || (meta.storagePath as string | undefined) || null,
      fileName: drop.fileName || (meta.fileName as string | undefined) || null,
      preview: imageUrl
        ? {
            image: imageUrl,
            title,
            description: drop.description || drop.thoughtText || null,
            bucket: drop.bucket || (meta.bucket as string | undefined) || null,
            storagePath: drop.storagePath || (meta.storagePath as string | undefined) || null,
            mediaKind: drop.mediaKind || null,
          }
        : drop.bucket && drop.storagePath
          ? {
              ...(meta.preview && typeof meta.preview === "object" ? meta.preview : {}),
              bucket: drop.bucket,
              storagePath: drop.storagePath,
              mediaKind: drop.mediaKind || null,
            }
          : meta.preview ?? null,
      signalSeed: {
        type: drop.type === "thought" ? "thought_drop_created" : "drop_created",
        dropId: drop.id,
      },
    },
  };
}

export function mergeActivityWithFeed(
  activityItems: BoardActivity[],
  feedItems: FeedDrop[]
) {
  return dedupeActivity([
    ...activityItems
      .filter(Boolean)
      .map((item) => patchMusicActivity(item).item),
    ...feedItems.map(feedDropToActivity).map((item) => patchMusicActivity(item).item),
    ...(readDrops()
      .map(universalDropToActivity)
      .filter(Boolean)
      .map((item) => patchMusicActivity(item as BoardActivity).item) as BoardActivity[]),
    ...resolveBoardProjects().map(projectToActivity),
  ]);
}
