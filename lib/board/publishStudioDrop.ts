"use client";

import { createActivity } from "@/lib/board/activity";
import {
  canCommitBoardMediaPlayback,
  preferredCommitPlaybackUrl,
  uploadBoardMediaFile,
} from "@/lib/board/boardMediaUpload";
import type { BoardUploadProgressHandler } from "@/lib/board/uploadProgress";
import { getCurrentUserId } from "@/lib/board/boardDropEditStore";
import { compactDropCustomizations, type DropCustomization } from "@/lib/board/dropCustomizations";
import {
  BUCKET_DOCS,
  BUCKET_MEDIA,
  STORAGE_KEY,
  dedupeDropItems,
  emitNewActivity,
  readBestLocalDropItems,
  safeId,
  scopedStorageKey,
  type DropItem,
  type DropType,
  type MediaKind,
} from "@/lib/board/dropItem";
import { DROPS_UPDATED_EVENT } from "@/lib/board/drops/storage";
import { isDropbookSlideFile } from "@/lib/board/dropbookSlides";
import type { ResolvedDropbookLink } from "@/lib/board/dropbookLink";
import { emitBoardDropSignal } from "@/lib/board/dropSignals";
import { boardDropToActivity } from "@/lib/board/boardDropActivity";
import { resolveCurrentBoardIdentity } from "@/lib/board/currentProfile";
import { applyForumDropNavigation, pickBoardDisplayName } from "@/lib/board/boardAuthor";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { DropDestination } from "@/lib/board/dropDestination";
import { isForumRoomDestination, isProjectRoomDestination } from "@/lib/board/dropDestination";
import {
  applyForumRoomFeedCopy,
  copyFromDropDestination,
  forumRoomDropItemTitle,
  keepOriginalForumFeedTitle,
  looksLikeMediaFileName,
} from "@/lib/board/forumRoomFeedCopy";

function dropTypeForFile(file: File): { type: DropType; mediaKind?: MediaKind; fromDescript?: boolean; fromDropbook?: boolean } {
  if (isDropbookSlideFile({ name: file.name, type: file.type })) {
    return { type: "Media", mediaKind: "image", fromDropbook: true };
  }
  if (file.type === "text/html" || /\.html?$/i.test(file.name)) {
    return { type: "Doc", fromDescript: true };
  }
  if (file.type.startsWith("audio/") || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name)) {
    return { type: "Music", mediaKind: "audio" };
  }
  if (file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(file.name)) {
    return { type: "Media", mediaKind: "video" };
  }
  return { type: "Media", mediaKind: "image" };
}

function dropTypeForLink(kind: ResolvedDropbookLink["kind"]): DropType {
  if (kind === "youtube") return "YouTube";
  if (kind === "music") return "Music";
  if (kind === "news") return "News";
  return "Link";
}

function persistLocalDrop(drop: DropItem, userId: string | null) {
  const existing = readBestLocalDropItems();
  const next = dedupeDropItems([drop, ...existing]);
  try {
    const key = scopedStorageKey(STORAGE_KEY, userId) || STORAGE_KEY;
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Safari private mode / quota
  }
  window.dispatchEvent(
    new CustomEvent(DROPS_UPDATED_EVENT, {
      detail: { userId, drops: next },
    })
  );
}

async function persistDropToProfile(drop: DropItem, userId: string): Promise<boolean> {
  try {
    const sb = supabaseBrowser();
    const { data: profile, error: profileError } = await sb
      .from("profiles")
      .select("board_style")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw profileError;
    const boardStyle =
      profile?.board_style && typeof profile.board_style === "object" ? profile.board_style : {};
    const currentDrops = Array.isArray((boardStyle as { boardDrops?: unknown }).boardDrops)
      ? ((boardStyle as { boardDrops: unknown[] }).boardDrops as DropItem[])
      : [];
    const boardDrops = [drop, ...currentDrops.filter((item) => String(item?.id ?? "") !== drop.id)].slice(
      0,
      120
    );
    const { data: updated, error: updateError } = await sb
      .from("profiles")
      .update({ board_style: { ...boardStyle, boardDrops } })
      .eq("id", userId)
      .select("id")
      .maybeSingle();
    if (updateError) throw updateError;
    return Boolean(updated?.id);
  } catch (error) {
    console.error("[publishStudioDrop] profile save failed", error);
    return false;
  }
}

function applyForumActivityCopy(
  activity: ReturnType<typeof boardDropToActivity>,
  destination: DropDestination | null | undefined,
  actorName: string
) {
  const forumDestination = isForumRoomDestination(destination) ? destination : null;
  activity.meta = {
    ...(activity.meta || {}),
    source: forumDestination ? "forum_room_studio" : "drop_studio",
    origin: forumDestination ? "create" : null,
    destinationType: destination?.type || "feed",
    roomId: forumDestination?.roomId || null,
    roomName: forumDestination?.roomName || null,
    roomIcon: forumDestination?.roomIcon || null,
    conversationTitle:
      forumDestination?.type === "room_conversation" ? forumDestination.conversationTitle || null : null,
    conversationId: forumDestination?.type === "room_conversation" ? forumDestination.conversationId : null,
    authorName: pickBoardDisplayName(actorName, activity.meta?.authorName) || activity.meta?.authorName || null,
  };
  const roomCopy = copyFromDropDestination(destination, { actorName });
  if (roomCopy && !keepOriginalForumFeedTitle({ title: activity.title, body: activity.body, meta: activity.meta })) {
    const rewritten = applyForumRoomFeedCopy({
      title: activity.title,
      body: activity.body,
      meta: activity.meta as Record<string, unknown>,
    });
    activity.title = rewritten?.title || roomCopy.title;
    activity.body = rewritten?.body || roomCopy.body;
  }
  return forumDestination ? applyForumDropNavigation(activity) : activity;
}

function assertNotWorkBoard(destination: DropDestination | null | undefined) {
  if (isProjectRoomDestination(destination)) {
    throw new Error("Forum Room publish must not write a Project Room / Work Board Drop.");
  }
}

export async function publishStudioFileDrop(input: {
  file: File;
  source: "capture" | "upload";
  customizations?: DropCustomization;
  destination?: DropDestination | null;
  onProgress?: BoardUploadProgressHandler;
  title?: string;
}): Promise<DropItem> {
  assertNotWorkBoard(input.destination);
  const userId = await getCurrentUserId();
  const identity = await resolveCurrentBoardIdentity(userId);
  const id = safeId();
  const kind = dropTypeForFile(input.file);
  const bucket = kind.type === "Doc" ? BUCKET_DOCS : BUCKET_MEDIA;
  const uploaded = await uploadBoardMediaFile(input.file, {
    bucket,
    folder: id,
    onProgress: input.onProgress,
  });
  if (!canCommitBoardMediaPlayback(uploaded)) {
    throw new Error("This file didn't finish saving to Board storage. Stay here and try again.");
  }
  const mediaUrl = preferredCommitPlaybackUrl(uploaded) || uploaded.signedUrl || uploaded.publicUrl;
  const customizations = compactDropCustomizations(input.customizations);
  const typeLabel = kind.fromDropbook ? "Dropbook" : kind.type === "Media" ? "Vision" : kind.type;
  const fileStem = input.file.name.replace(/\.[^.]+$/, "");
  const namedTitle =
    input.title?.trim() && !looksLikeMediaFileName(input.title)
      ? input.title.trim()
      : fileStem && !looksLikeMediaFileName(fileStem)
        ? fileStem
        : "";
  const roomCopy = copyFromDropDestination(input.destination, { actorName: identity.displayName });
  const keepNamed =
    Boolean(namedTitle) || kind.fromDescript === true || kind.fromDropbook === true;
  const dropTitle = keepNamed
    ? namedTitle || `${typeLabel} Drop`
    : roomCopy
      ? forumRoomDropItemTitle({
          roomId: isForumRoomDestination(input.destination) ? input.destination.roomId : null,
          roomName: isForumRoomDestination(input.destination) ? input.destination.roomName : null,
          fallback: `${typeLabel} Drop`,
        })
      : `${typeLabel} Drop`;
  const drop: DropItem = {
    id,
    title: dropTitle,
    type: kind.type,
    createdAt: Date.now(),
    bucket: uploaded.bucket,
    storagePath: uploaded.storagePath,
    url: mediaUrl || undefined,
    mediaUrl: mediaUrl || undefined,
    fileName: input.file.name,
    fileSize: input.file.size,
    mime: input.file.type,
    mediaKind: kind.mediaKind,
    mediaSource: input.source,
    visibility: "public",
    fromDescript: kind.fromDescript || undefined,
    ...(kind.fromDropbook ? { fromDropbook: true } : {}),
    ...(customizations ? { customizations } : {}),
  };

  persistLocalDrop(drop, userId);
  if (userId && userId !== "local") {
    void persistDropToProfile(drop, userId);
  }

  const activity = applyForumActivityCopy(
    boardDropToActivity(drop, {
      userId,
      activityId: `room_drop_${drop.id}`,
      author: {
        displayName: identity.displayName,
        username: identity.username,
        avatarSrc: identity.avatar,
      },
    }),
    input.destination,
    identity.displayName
  );

  try {
    const sb = supabaseBrowser();
    const result = await createActivity(sb, {
      user_id: userId,
      kind: "board_drop",
      title: activity.title,
      body: activity.body,
      href: activity.href,
      image_url: activity.image_url,
      meta: activity.meta,
    });
    emitNewActivity(result.activity);
  } catch {
    emitNewActivity(activity);
  }

  emitBoardDropSignal({
    type: "drop_created",
    dropId: drop.id,
    userId,
    title: activity.title || drop.title,
    meta: {
      source: isForumRoomDestination(input.destination) ? "forum_room_studio" : "drop_studio",
      destinationType: input.destination?.type || "feed",
      roomId: isForumRoomDestination(input.destination) ? input.destination.roomId : null,
    },
  });

  return drop;
}

export async function publishStudioLinkDrop(input: {
  link: ResolvedDropbookLink;
  destination?: DropDestination | null;
}): Promise<DropItem> {
  assertNotWorkBoard(input.destination);
  const userId = await getCurrentUserId();
  const identity = await resolveCurrentBoardIdentity(userId);
  const type = dropTypeForLink(input.link.kind);
  const namedTitle = String(input.link.title || "").trim();
  const roomCopy = copyFromDropDestination(input.destination, { actorName: identity.displayName });
  const drop: DropItem = {
    id: safeId(),
    title: namedTitle
      ? namedTitle
      : roomCopy
        ? forumRoomDropItemTitle({
            roomId: isForumRoomDestination(input.destination) ? input.destination.roomId : null,
            roomName: isForumRoomDestination(input.destination) ? input.destination.roomName : null,
            fallback: `${type} Drop`,
          })
        : `${type} Drop`,
    type,
    createdAt: Date.now(),
    url: input.link.url,
    embedUrl: input.link.embedUrl || null,
    hostLabel: input.link.provider,
    previewTitle: input.link.title,
    previewDescription: input.link.description,
    previewImage: input.link.image,
    previewImages: input.link.image ? [input.link.image] : undefined,
    linkUrl: input.link.url,
    visibility: "public",
  };

  persistLocalDrop(drop, userId);
  if (userId && userId !== "local") {
    void persistDropToProfile(drop, userId);
  }

  const activity = applyForumActivityCopy(
    boardDropToActivity(drop, {
      userId,
      activityId: `room_drop_${drop.id}`,
      author: {
        displayName: identity.displayName,
        username: identity.username,
        avatarSrc: identity.avatar,
      },
    }),
    input.destination,
    identity.displayName
  );
  try {
    const sb = supabaseBrowser();
    const result = await createActivity(sb, {
      user_id: userId,
      kind: "board_drop",
      title: activity.title,
      body: activity.body,
      href: activity.href,
      image_url: activity.image_url,
      meta: activity.meta,
    });
    emitNewActivity(result.activity);
  } catch {
    emitNewActivity(activity);
  }
  emitBoardDropSignal({
    type: "drop_created",
    dropId: drop.id,
    userId,
    title: activity.title || drop.title,
    meta: {
      source: isForumRoomDestination(input.destination) ? "forum_room_studio" : "drop_studio",
      destinationType: input.destination?.type || "feed",
      roomId: isForumRoomDestination(input.destination) ? input.destination.roomId : null,
    },
  });
  return drop;
}
