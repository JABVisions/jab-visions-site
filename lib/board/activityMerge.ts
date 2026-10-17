import type { BoardActivity } from "@/lib/board/activity";
import { activityForumPath } from "@/lib/board/boardAuthor";
import {
  activityLooksLikeStoredImage,
  activityLooksLikeStoredVideo,
  activityLooksLikeStreamingMusicDrop,
  preferFeedMediaUrl,
  preferStreamingHref,
} from "@/lib/board/feedDropMedia";
import {
  applyForumRoomFeedCopy,
  isGeneratedProfileDropBody,
  recoverForumNavigationMeta,
} from "@/lib/board/forumRoomFeedCopy";
import { isProjectRoomDropActivity } from "@/lib/board/projectRoomDrop";
import { isSoundCloudUrl } from "@/lib/board/soundCloudEmbed";

export type ActivityDropFamily =
  | "streaming_music"
  | "stored_video"
  | "project_notebook"
  | "stored_image"
  | "other";

function metaRecord(item: BoardActivity | null | undefined): Record<string, any> {
  return item?.meta && typeof item.meta === "object" ? item.meta : {};
}

function metaString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function isMusicServiceHref(url?: string | null) {
  const src = String(url || "").trim();
  if (!src) return false;
  if (isSoundCloudUrl(src)) return true;
  const host = hostOf(src);
  return host.includes("spotify.com") || host.includes("music.apple.com");
}

function activityMusicHints(item: BoardActivity): string[] {
  const meta = metaRecord(item);
  const preview = meta.preview && typeof meta.preview === "object" ? meta.preview : {};
  return [
    item.href,
    meta.embedUrl,
    preview.embedUrl,
    meta.url,
    meta.linkUrl,
    meta.mediaUrl,
  ].map((value) => metaString(value));
}

export function activityIsMusicServiceDrop(item: BoardActivity): boolean {
  const meta = metaRecord(item);
  const dropType = metaString(
    meta.dropType,
    meta.drop_flavor,
    meta.dropFlavor
  ).toLowerCase();
  if (
    dropType.includes("music") ||
    dropType.includes("spotify") ||
    dropType.includes("soundcloud") ||
    dropType.includes("apple")
  ) {
    return true;
  }
  return activityMusicHints(item).some((value) => isMusicServiceHref(value));
}

export function activityDropFamily(item: BoardActivity): ActivityDropFamily {
  if (isProjectRoomDropActivity(item) || activityLooksLikeStoredVideo(item)) {
    return "stored_video";
  }
  if (activityIsMusicServiceDrop(item)) return "streaming_music";
  if (activityLooksLikeStreamingMusicDrop(item)) {
    const dropType = metaString(
      metaRecord(item).dropType,
      metaRecord(item).drop_flavor
    ).toLowerCase();
    if (dropType.includes("youtube")) return "other";
    if (activityMusicHints(item).some((value) => hostOf(value).includes("youtube") || hostOf(value).includes("youtu.be"))) {
      return "other";
    }
    return "streaming_music";
  }
  const meta = metaRecord(item);
  if (
    String(meta.kind ?? "") === "project_drop" ||
    String(meta.cardStyle ?? "") === "project_drop" ||
    String(meta.dropType ?? "") === "project" ||
    /^Project Drop:\s*/i.test(item.title ?? "")
  ) {
    return "project_notebook";
  }
  if (activityLooksLikeStoredImage(item)) return "stored_image";
  return "other";
}

/** SoundCloud / Music Drops never collapse into a Project Room video or notebook card. */
export function activityFamiliesCompatible(left: BoardActivity, right: BoardActivity) {
  const a = activityDropFamily(left);
  const b = activityDropFamily(right);
  if (a === b) return true;
  if (a === "streaming_music" || b === "streaming_music") return false;
  if (a === "stored_video" || b === "stored_video") {
    return a === "other" || b === "other";
  }
  if (a === "project_notebook" || b === "project_notebook") return false;
  return true;
}

function activitySortTime(item: BoardActivity) {
  const meta = metaRecord(item);
  const value = meta.pushedAt ?? item.created_at;
  const time = new Date(String(value || "")).getTime();
  return Number.isFinite(time) ? time : 0;
}

function preferMusicHref(preferred?: string | null, fallback?: string | null) {
  const a = String(preferred || "").trim();
  const b = String(fallback || "").trim();
  if (isMusicServiceHref(a)) return a;
  if (isMusicServiceHref(b)) return b;
  return preferStreamingHref(preferred, fallback) || preferFeedMediaUrl(preferred, fallback);
}

function filledMetaText(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed === "null" || trimmed === "undefined") return "";
  return trimmed;
}

const FORUM_SOURCES = new Set(["forum_room_studio", "forum_room_share"]);
const FORUM_ORIGINS = new Set(["create", "share", "conversation"]);

function preferForumMetaValue(
  key: string,
  preferred: Record<string, any>,
  fallback: Record<string, any>
) {
  const primary = filledMetaText(preferred[key]);
  const secondary = filledMetaText(fallback[key]);
  if (key === "source") {
    if (FORUM_SOURCES.has(primary)) return primary;
    if (FORUM_SOURCES.has(secondary)) return secondary;
    return primary || secondary;
  }
  if (key === "origin") {
    if (FORUM_ORIGINS.has(primary)) return primary;
    if (!primary && FORUM_ORIGINS.has(secondary)) return secondary;
    return primary || secondary;
  }
  return primary || secondary;
}

function isForumAttributionCopy(title: unknown, body: unknown) {
  const heading = String(title || "").trim();
  const sentence = String(body || "").trim();
  return (
    /^added a drop to\s+/i.test(heading) ||
    /\b(?:added a drop to|replied with a drop|shared a drop in)\b/i.test(sentence)
  );
}

function isGenericProfileDropCopy(title: unknown, body: unknown) {
  if (isForumAttributionCopy(title, body)) return false;
  const heading = String(title || "").trim();
  const sentence = String(body || "").trim();
  return /^drop in\s+/i.test(heading) || isGeneratedProfileDropBody(sentence);
}

/** Keep the Forum Room sentence when the profile board copy is the generic fallback. */
function preferForumFeedCopy(preferred: BoardActivity, fallback: BoardActivity) {
  const preferredForum = isForumAttributionCopy(preferred.title, preferred.body);
  const fallbackForum = isForumAttributionCopy(fallback.title, fallback.body);
  const preferredGeneric = isGenericProfileDropCopy(preferred.title, preferred.body);
  const fallbackGeneric = isGenericProfileDropCopy(fallback.title, fallback.body);
  if (fallbackForum && preferredGeneric) return fallback;
  if (preferredForum && fallbackGeneric) return preferred;
  return null;
}

export function presentForumDrop(item: BoardActivity): BoardActivity {
  if (!item) return item;
  const recovered = recoverForumNavigationMeta(metaRecord(item), item.title, item.body);
  const rewritten = applyForumRoomFeedCopy({
    title: item.title,
    body: item.body,
    meta: recovered,
  });
  const next: BoardActivity = {
    ...item,
    title: rewritten?.title || item.title,
    body: rewritten?.body || item.body,
    meta: recovered,
  };
  const forumHref = activityForumPath(next);
  if (!forumHref) return next;
  return {
    ...next,
    meta: {
      ...recovered,
      forumHref,
    },
  };
}

export function mergeActivityRecords(
  preferred: BoardActivity,
  fallback: BoardActivity
): BoardActivity {
  const preferredMeta = metaRecord(preferred);
  const fallbackMeta = metaRecord(fallback);
  const preferredPreview =
    preferredMeta.preview && typeof preferredMeta.preview === "object"
      ? preferredMeta.preview
      : {};
  const fallbackPreview =
    fallbackMeta.preview && typeof fallbackMeta.preview === "object"
      ? fallbackMeta.preview
      : {};
  const musicFirst = activityIsMusicServiceDrop(preferred)
    ? preferred
    : activityIsMusicServiceDrop(fallback)
      ? fallback
      : null;
  const href = musicFirst
    ? preferMusicHref(musicFirst.href, musicFirst === preferred ? fallback.href : preferred.href)
    : preferMusicHref(preferred.href, fallback.href);
  const forumCopy = musicFirst ? null : preferForumFeedCopy(preferred, fallback);
  const forumMeta = {
    roomId: preferForumMetaValue("roomId", preferredMeta, fallbackMeta),
    forumRoomId: preferForumMetaValue("forumRoomId", preferredMeta, fallbackMeta),
    roomName: preferForumMetaValue("roomName", preferredMeta, fallbackMeta),
    roomIcon: preferForumMetaValue("roomIcon", preferredMeta, fallbackMeta),
    destinationType: preferForumMetaValue("destinationType", preferredMeta, fallbackMeta),
    conversationId: preferForumMetaValue("conversationId", preferredMeta, fallbackMeta),
    conversationTitle: preferForumMetaValue("conversationTitle", preferredMeta, fallbackMeta),
    forumHref: preferForumMetaValue("forumHref", preferredMeta, fallbackMeta),
    source: preferForumMetaValue("source", preferredMeta, fallbackMeta),
    origin: preferForumMetaValue("origin", preferredMeta, fallbackMeta),
  };

  return {
    ...fallback,
    ...preferred,
    ...(musicFirst
      ? {
          title: musicFirst.title || preferred.title || fallback.title,
          body: musicFirst.body || preferred.body || fallback.body,
        }
      : forumCopy
        ? {
            title: forumCopy.title || preferred.title || fallback.title,
            body: forumCopy.body || preferred.body || fallback.body,
          }
        : {
            title: preferred.title || fallback.title,
            body: preferred.body || fallback.body,
          }),
    href,
    image_url: preferred.image_url || fallback.image_url,
    meta: {
      ...fallbackMeta,
      ...preferredMeta,
      ...Object.fromEntries(Object.entries(forumMeta).filter(([, value]) => value)),
      origin: forumMeta.origin || preferredMeta.origin || fallbackMeta.origin || null,
      dropId: preferredMeta.dropId || fallbackMeta.dropId || null,
      mediaKind: musicFirst
        ? musicFirst.meta?.mediaKind || preferredMeta.mediaKind || fallbackMeta.mediaKind || null
        : preferredMeta.mediaKind || fallbackMeta.mediaKind || null,
      embedUrl:
        (musicFirst && (musicFirst.meta?.embedUrl || musicFirst.meta?.preview?.embedUrl)) ||
        preferredMeta.embedUrl ||
        fallbackMeta.embedUrl ||
        preferredPreview.embedUrl ||
        fallbackPreview.embedUrl ||
        null,
      mediaUrl:
        preferMusicHref(preferredMeta.mediaUrl, fallbackMeta.mediaUrl) ||
        preferredMeta.mediaUrl ||
        fallbackMeta.mediaUrl ||
        null,
      bucket: preferredMeta.bucket || fallbackMeta.bucket || null,
      storagePath: preferredMeta.storagePath || fallbackMeta.storagePath || null,
      cardStyle: preferredMeta.cardStyle || fallbackMeta.cardStyle || null,
      projectId: musicFirst
        ? musicFirst.meta?.projectId || null
        : preferredMeta.projectId || fallbackMeta.projectId || null,
      preview: {
        ...fallbackPreview,
        ...preferredPreview,
        bucket:
          preferredPreview.bucket ||
          fallbackPreview.bucket ||
          preferredMeta.bucket ||
          fallbackMeta.bucket,
        storagePath:
          preferredPreview.storagePath ||
          fallbackPreview.storagePath ||
          preferredMeta.storagePath ||
          fallbackMeta.storagePath,
        mediaKind:
          preferredPreview.mediaKind ||
          fallbackPreview.mediaKind ||
          preferredMeta.mediaKind,
        embedUrl:
          (musicFirst && (musicFirst.meta?.embedUrl || musicFirst.meta?.preview?.embedUrl)) ||
          preferredPreview.embedUrl ||
          fallbackPreview.embedUrl ||
          preferredMeta.embedUrl ||
          fallbackMeta.embedUrl ||
          null,
      },
    },
  };
}

function familyAlias(family: ActivityDropFamily, alias: string) {
  return alias ? `${family}:${alias}` : "";
}

/**
 * Merge feed/activity rows by drop id (and canonical media URL), never by
 * “one music slot” or title. Different families — SoundCloud Music vs a
 * Project Room audition video — stay separate even if ids collide.
 */
export function dedupeActivity(items: BoardActivity[]) {
  const map = new Map<string, BoardActivity>();
  const aliases = new Map<string, string>();

  for (const raw of items) {
    if (!raw?.id) continue;
    const item = presentForumDrop(raw);
    const meta = metaRecord(item);
    const family = activityDropFamily(item);
    const isPushed = Boolean(meta.isPushed);
    const isRecipientActivity = meta.activityAudience === "recipient";
    const ownerKey =
      typeof meta.ownerUsername === "string" && meta.ownerUsername
        ? meta.ownerUsername
        : item.user_id
          ? String(item.user_id)
          : "";
    const rawDropId = typeof meta.dropId === "string" ? meta.dropId.trim() : "";
    const dropId = rawDropId ? `drop:${ownerKey}:${rawDropId}` : "";
    const isNotebookProject =
      family === "project_notebook" &&
      typeof meta.projectId === "string" &&
      meta.projectId;
    const projectNotebookKey = isNotebookProject
      ? `project:${ownerKey}:${meta.projectId}`
      : "";
    const storagePath = String(meta.storagePath || meta.preview?.storagePath || "").trim();
    const storageKey = storagePath
      ? `storage:${storagePath.split("?")[0].replace(/^\/+/, "")}`
      : "";
    const roomDropKey = rawDropId ? `dropid:${rawDropId}` : "";
    const titleKey = item.title
      ? `title:${item.kind}:${ownerKey}:${item.title.trim().toLowerCase()}`
      : "";
    const bodyKey = item.body
      ? `body:${item.kind}:${ownerKey}:${item.body.trim().toLowerCase()}`
      : "";
    const hrefKey = item.href ? `href:${item.href}` : "";
    const canonicalMusicHref = activityMusicHints(item).find((value) => isMusicServiceHref(value));
    const musicUrlKey = canonicalMusicHref
      ? `music:${canonicalMusicHref.split("?")[0].replace(/\/+$/, "").toLowerCase()}`
      : "";
    const normalizedTitle = item.title?.trim().toLowerCase() ?? "";
    const normalizedBodyPrefix =
      item.body
        ?.trim()
        .toLowerCase()
        .replace(/\s+/g, " ")
        .slice(0, 240) ?? "";
    const isHtmlDocument =
      meta.fromDescript === true ||
      /\.html?(?:$|[?#])/i.test(item.href ?? "") ||
      /\.html?$/i.test(typeof meta.fileName === "string" ? meta.fileName : "");
    const descriptContentKey =
      normalizedTitle &&
      normalizedBodyPrefix &&
      (isHtmlDocument || (item.kind === "board_drop" && normalizedBodyPrefix.length >= 120))
        ? `descript-content:${ownerKey}:${normalizedTitle}:${normalizedBodyPrefix}`
        : "";
    const imageKey = item.image_url ? `image:${item.image_url}` : "";
    const titleBodyKey = titleKey && bodyKey ? `${titleKey}:${bodyKey}` : titleKey || bodyKey;
    const generatedCaptionKey =
      titleKey && /^New .+ drop (added to Board|from .+)\.?$/i.test(item.body ?? "")
        ? `generated:${item.kind}:${item.title?.trim().toLowerCase()}`
        : "";
    const isRecoveredMirror = /^New .+ drop from .+/i.test(item.body ?? "");
    const hasStrongIdentity = Boolean(
      dropId || roomDropKey || hrefKey || imageKey || storageKey || musicUrlKey
    );
    const pushKey = isPushed
      ? `push:${meta.originalDropId || item.id}:${meta.pushedByUserId || ""}`
      : "";
    const rawAliases = isRecipientActivity
      ? [`recipient:${item.id}`]
      : isPushed
        ? [pushKey || item.id]
        : [
            dropId,
            roomDropKey,
            projectNotebookKey,
            musicUrlKey,
            storageKey,
            hrefKey,
            imageKey,
            descriptContentKey,
            isNotebookProject ? titleBodyKey : "",
            !dropId && !hrefKey && !imageKey && !storageKey && !musicUrlKey ? titleBodyKey : "",
          ].filter(Boolean);
    const itemAliases = isRecipientActivity || isPushed
      ? rawAliases
      : rawAliases.map((alias) => familyAlias(family, alias)).filter(Boolean);
    const weakAliases = [generatedCaptionKey]
      .filter(Boolean)
      .map((alias) => (isRecipientActivity || isPushed ? alias : familyAlias(family, alias)));
    const matchableAliases =
      isRecipientActivity
        ? itemAliases
        : isPushed
          ? itemAliases
          : hasStrongIdentity && !isRecoveredMirror
            ? itemAliases
            : [...itemAliases, ...weakAliases];
    const matchedAlias = matchableAliases.find((alias) => {
      const existingKey = aliases.get(alias);
      if (!existingKey) return false;
      const existing = map.get(existingKey);
      if (existing && !activityFamiliesCompatible(existing, item)) return false;
      return true;
    });
    const key = matchedAlias
      ? aliases.get(matchedAlias)!
      : isRecipientActivity
        ? itemAliases[0]
        : isPushed
          ? pushKey || item.id
          : familyAlias(
              family,
              dropId ||
                roomDropKey ||
                musicUrlKey ||
                storageKey ||
                hrefKey ||
                imageKey ||
                item.id ||
                titleBodyKey
            );
    const previous = map.get(key);
    if (!previous) {
      map.set(key, item);
      for (const alias of itemAliases) aliases.set(alias, key);
      for (const alias of weakAliases) {
        if (!aliases.has(alias)) aliases.set(alias, key);
      }
      continue;
    }

    if (!activityFamiliesCompatible(previous, item)) {
      const isolatedKey = familyAlias(family, `${item.id}:${rawDropId || ""}`);
      map.set(isolatedKey, item);
      for (const alias of itemAliases) aliases.set(alias, isolatedKey);
      continue;
    }

    const previousScore =
      (previous.image_url ? 2 : 0) + (previous.href ? 1 : 0) + (previous.meta ? 1 : 0);
    const nextScore = (item.image_url ? 2 : 0) + (item.href ? 1 : 0) + (item.meta ? 1 : 0);
    const preferNext =
      nextScore > previousScore ||
      (nextScore === previousScore && activitySortTime(item) > activitySortTime(previous));
    map.set(
      key,
      presentForumDrop(
        preferNext
          ? mergeActivityRecords(item, previous)
          : mergeActivityRecords(previous, item)
      )
    );
    for (const alias of itemAliases) aliases.set(alias, key);
    for (const alias of weakAliases) {
      if (!aliases.has(alias)) aliases.set(alias, key);
    }
  }

  return Array.from(map.values()).sort((a, b) => activitySortTime(b) - activitySortTime(a));
}
