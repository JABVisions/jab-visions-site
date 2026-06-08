// File: app/components/board/ActivityCard.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  appendLocalActivity,
  getLocalActivity,
  removeLocalActivity,
  type BoardActivity,
} from "@/lib/board/activity";
import { readBrain } from "@/lib/board/bucketBrain";
import { removeDrops as removeUniversalDrops } from "@/lib/board/drops/storage";
import { resolveLinkPreviewImage } from "@/lib/board/linkPreviewImages";
import { fetchLinkPreview } from "@/lib/board/linkPreview";
import { openHostedPayDropCheckout } from "@/lib/board/payCheckout";
import { EVENTS as BOARD_STORE_EVENTS, removeDrops as removeFeedDrops } from "@/lib/boardStore";
import { normalizeDropCustomizations } from "@/lib/board/dropCustomizations";
import {
  DROP_COMMENTS_UPDATED_EVENT,
  getDropCommentCount,
} from "@/lib/board/dropComments";
import { supabaseBrowser } from "@/lib/supabase/browser";
import DropCommentsDrawer from "./DropCommentsDrawer";
import DropStudioOverlay from "./DropStudioOverlay";
import RemovableDropBadge from "./RemovableDropBadge";

const EVT_DEPOSIT = "board:bucketBrain:deposit";
const EVT_OPEN = "board:bucketBrain:open";
const EVT_BUCKET_UPDATED = "board:bucketBrain:updated";
const fallbackAuraColor = "#8ee7ff";

const AURA_HEX: Record<string, string> = {
  sloth_pink: "#FF4FD8",
  lust_blue: "#2D7CFF",
  greed_black: "#111111",
  pride_yellow: "#FFD12D",
  envy_red: "#FF2D2D",
  gluttony_orange: "#FF7A1A",
  wrath_purple: "#7A44FF",
  lilly_yellowgreen: "#B7FF2D",
};

const ANNOUNCEMENT_VIBES: Record<string, string> = {
  hype: "🔥 Hype",
  happy: "😊 Happy",
  chill: "🌿 Chill",
  bored: "😐 Bored",
  serious: "🧠 Serious",
  sad: "😔 Sad",
  creepy: "👁️ Creepy",
  funny: "😂 Funny",
  nostalgic: "🕰️ Nostalgic",
  chaos: "🧨 Chaos",
  victory: "🏆 Victory",
  locked_in: "🎧 Locked In",
  romantic: "💞 Romantic",
  plot_twist: "🌀 Plot Twist",
  aesthetic: "🪩 Aesthetic",
  sleepy: "🛌 Sleepy",
  rage: "💥 Rage",
  mystic: "🔮 Mystic",
  tea: "🍵 Tea",
};

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

// Some internal drop "kind" values use legacy/technical names that should
// surface to users under friendlier labels (e.g. "media" -> "Vision").
const DROP_KIND_DISPLAY_RENAMES: Record<string, string> = {
  media: "vision",
  image: "vision",
  video: "vision",
};

function formatDropKindLabel(value: string) {
  const clean = value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const lower = clean.toLowerCase();
  const renamed = DROP_KIND_DISPLAY_RENAMES[lower] ?? clean;
  return /\bdrop\b/i.test(renamed) ? renamed.toUpperCase() : `${renamed.toUpperCase()} DROP`;
}

function metaString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function storedUrl(...values: unknown[]) {
  const clean = metaString(...values);
  return clean.startsWith("data:") ? "" : clean;
}

function colorFromAura(value: unknown) {
  const key = typeof value === "string" ? value.trim() : "";
  return (key && AURA_HEX[key]) || key || "";
}

function getInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("");
  return initials || "B";
}

function formatHandle(value: string) {
  const clean = value.trim().replace(/^@+/, "");
  return clean ? `@${clean}` : "";
}

function formatAnnouncementVibe(value: unknown) {
  const key = typeof value === "string" ? value.trim() : "";
  if (!key) return "";
  return ANNOUNCEMENT_VIBES[key] || key.replace(/[_-]+/g, " ");
}

function readLocalProfileIdentity() {
  try {
    if (typeof window === "undefined") throw new Error("local profile is client-only");
    const profileRaw = window.localStorage.getItem("jab_board_profile_v2");
    const optionsRaw = window.localStorage.getItem("board.options.v1");
    const profile = profileRaw ? JSON.parse(profileRaw) : null;
    const options = optionsRaw ? JSON.parse(optionsRaw) : null;
    const auraKey = typeof options?.auraColor === "string" ? options.auraColor : "";
    const glowColor =
      colorFromAura(auraKey) ||
      metaString(profile?.glowColor, profile?.avatarGlow) ||
      "#FF4FD8";

    return {
      username: metaString(options?.username, profile?.username),
      displayName: metaString(options?.displayName, profile?.displayName, profile?.name),
      avatarSrc: storedUrl(
        profile?.avatarUrl,
        profile?.avatarDataUrl,
        options?.avatarUrl,
        options?.avatarDataUrl
      ),
      glowColor,
      auraIntensity:
        typeof options?.auraIntensity === "number"
          ? Math.max(0, Math.min(100, options.auraIntensity))
          : 72,
    };
  } catch {
    return {
      username: "",
      displayName: "",
      avatarSrc: "",
      glowColor: "#FF4FD8",
      auraIntensity: 72,
    };
  }
}

function currentUserKey(identity: ReturnType<typeof readLocalProfileIdentity>) {
  return (
    metaString(identity.username, identity.displayName)
      .toLowerCase()
      .replace(/^@+/, "")
      .replace(/[^a-z0-9_.-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "board-user"
  );
}

function normalizeIdentityKey(value: unknown) {
  return metaString(value)
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function activityOwnedByCurrentUser(
  item: BoardActivity,
  meta: Record<string, any> | null,
  currentIdentity: ReturnType<typeof readLocalProfileIdentity>
) {
  const currentKeys = [
    currentUserKey(currentIdentity),
    normalizeIdentityKey(currentIdentity.username),
    normalizeIdentityKey(currentIdentity.displayName),
  ].filter(Boolean);
  const ownerKeys = [
    (item as any)?.user_id,
    meta?.authorId,
    meta?.ownerUserId,
    meta?.userId,
    meta?.authorUsername,
    meta?.ownerUsername,
    meta?.username,
    meta?.authorName,
    meta?.displayName,
  ]
    .map(normalizeIdentityKey)
    .filter(Boolean);

  return ownerKeys.some((key) => currentKeys.includes(key));
}

function pushedRootId(item: BoardActivity, meta: Record<string, any> | null) {
  return metaString(meta?.originalDropId, meta?.dropId, item.id);
}

function hasUserAlreadyPushed(
  feedItems: BoardActivity[],
  originalDropId: string,
  userId: string
) {
  return feedItems.some((feedItem) => {
    const meta = feedItem.meta && typeof feedItem.meta === "object" ? feedItem.meta : null;
    return (
      Boolean(meta?.isPushed) &&
      String(meta?.originalDropId || "") === originalDropId &&
      String(meta?.pushedByUserId || "") === userId
    );
  });
}

function createPushedDrop(
  originalDrop: BoardActivity,
  currentUser: ReturnType<typeof readLocalProfileIdentity>
): BoardActivity {
  const originalMeta =
    originalDrop.meta && typeof originalDrop.meta === "object" ? originalDrop.meta : {};
  const pushedAt = new Date().toISOString();
  const pusherId = currentUserKey(currentUser);
  const originalDropId = pushedRootId(originalDrop, originalMeta);

  return {
    ...originalDrop,
    id: `push-${originalDropId}-${pusherId}-${Date.now()}`,
    meta: {
      ...originalMeta,
      isPushed: true,
      pushedByUserId: pusherId,
      pushedByName:
        metaString(currentUser.displayName, currentUser.username) || "Someone",
      pushedAt,
      originalDropId,
      originalAuthorId:
        metaString((originalMeta as any).originalAuthorId, originalDrop.user_id) || null,
      reactionType: "push",
    },
  };
}

function formatPriceFromCents(cents?: number) {
  if (!cents || cents <= 0) return "";
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDropTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = Date.now();
  const diff = Math.max(0, now - date.getTime());
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "just now";
  if (diff < hour) {
    const count = Math.max(1, Math.floor(diff / minute));
    return `${count}m ago`;
  }
  if (diff < day) {
    const count = Math.max(1, Math.floor(diff / hour));
    return `${count}h ago`;
  }
  if (diff < day * 7) {
    const count = Math.max(1, Math.floor(diff / day));
    return `${count}d ago`;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/* --------------------------- embed helpers --------------------------- */

type EmbedKind =
  | "youtube"
  | "spotify"
  | "apple_music"
  | "soundcloud"
  | "image"
  | "video"
  | "audio"
  | "none";

function isExternalHref(href: string) {
  return /^https?:\/\//i.test(href);
}

function isLikelyImageUrl(href: string) {
  const clean = href.toLowerCase();
  return (
    /\.(png|jpg|jpeg|gif|webp|avif|svg|bmp|tif|tiff|heic|heif)(\?|#|$)/i.test(clean) ||
    /\/storage\/v1\/object\/public\/board-media\//i.test(clean)
  );
}

function getExt(url: string) {
  const clean = url.split("?")[0].split("#")[0];
  const dot = clean.lastIndexOf(".");
  if (dot === -1) return "";
  return clean.slice(dot + 1).toLowerCase();
}

function guessMediaKind(url: string): EmbedKind {
  const ext = getExt(url);

  // Images
  if (["png", "jpg", "jpeg", "webp", "gif", "avif", "svg", "bmp", "tif", "tiff", "heic", "heif"].includes(ext)) return "image";
  if (isLikelyImageUrl(url)) return "image";

  // Video
  if (["mp4", "webm", "mov", "m4v"].includes(ext)) return "video";

  // Audio
  if (["mp3", "wav", "m4a", "aac", "ogg", "flac"].includes(ext)) return "audio";

  return "none";
}

function ytId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.replace("/", "") || null;
    }
    if (u.hostname.includes("youtube.com")) {
      return (
        u.searchParams.get("v") ||
        u.pathname.split("/").filter(Boolean).pop() ||
        null
      );
    }
  } catch {}
  return null;
}

function toYouTubeEmbed(url: string, origin?: string): string | null {
  const id = ytId(url);
  if (!id) return null;

  const params = new URLSearchParams({
    modestbranding: "1",
    rel: "0",
    playsinline: "1",
  });

  if (origin) params.set("origin", origin);

  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
}

function toSpotifyEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/open\.spotify\.com$/i.test(u.hostname)) return null;
    return `https://open.spotify.com/embed${u.pathname}`;
  } catch {
    return null;
  }
}

function toAppleMusicEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host === "embed.music.apple.com") return u.toString();
    if (host !== "music.apple.com") return null;

    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "embed") {
      return `https://embed.music.apple.com/${parts.slice(1).join("/")}${u.search}`;
    }
    if (parts.length < 3) return null;

    return `https://embed.music.apple.com${u.pathname}${u.search}`;
  } catch {
    return null;
  }
}

/**
 * ✅ FIX: only treat URLs as SoundCloud if they are actually SoundCloud domains.
 */
function toSoundCloudEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();

    const isSC =
      host === "soundcloud.com" ||
      host.endsWith(".soundcloud.com") ||
      host === "snd.sc" ||
      host.endsWith(".snd.sc") ||
      host === "on.soundcloud.com" ||
      host.endsWith(".on.soundcloud.com");

    if (!isSC) return null;

    return `https://w.soundcloud.com/player/?url=${encodeURIComponent(
      url
    )}&auto_play=false&visual=true`;
  } catch {
    return null;
  }
}

function computeEmbed(href: string): { kind: EmbedKind; url: string } {
  if (!href) return { kind: "none", url: "" };

  const origin =
    typeof window !== "undefined" ? window.location.origin : undefined;

  // 1) YouTube
  const yt = toYouTubeEmbed(href, origin);
  if (yt) return { kind: "youtube", url: yt };

  // 2) Spotify
  const sp = toSpotifyEmbed(href);
  if (sp) return { kind: "spotify", url: sp };

  // 3) Apple Music
  const am = toAppleMusicEmbed(href);
  if (am) return { kind: "apple_music", url: am };

  // 4) SoundCloud (ONLY if soundcloud hostname)
  const sc = toSoundCloudEmbed(href);
  if (sc) return { kind: "soundcloud", url: sc };

  // 5) Media files (image/video/audio)
  const mk = guessMediaKind(href);
  if (mk !== "none") return { kind: mk, url: href };

  return { kind: "none", url: "" };
}

/* --------------------------- component --------------------------- */

type Props = {
  item: BoardActivity;
  compact?: boolean;
  openBucketOnSignal?: boolean; // feels “command-center-ish”
  onRemove?: (dropId: string) => void;
};

export default function ActivityCard({
  item,
  compact,
  openBucketOnSignal = false,
  onRemove,
}: Props) {
  const [toast, setToast] = useState<string | null>(null);
  const [embedFailed, setEmbedFailed] = useState(false);
  const [signedPreviewImage, setSignedPreviewImage] = useState<string>("");
  // Image fetched on the client for link drops whose stored record has no
  // thumbnail (e.g. an Instagram reel saved before the preview resolved).
  const [hydratedImage, setHydratedImage] = useState<string>("");
  const [payCheckoutBusy, setPayCheckoutBusy] = useState(false);
  const [isRemovingDrop, setIsRemovingDrop] = useState(false);
  const [selectedReaction, setSelectedReaction] = useState<"pass" | "pin" | "push" | null>(null);
  // Transient sonar burst when a drop's signal is amplified (Push).
  const [amplifyBurst, setAmplifyBurst] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [userAuraColor, setUserAuraColor] = useState(fallbackAuraColor);
  const [announcementImagePosition, setAnnouncementImagePosition] = useState({ x: 50, y: 50 });
  const [announcementDrag, setAnnouncementDrag] = useState<{
    clientX: number;
    clientY: number;
    x: number;
    y: number;
  } | null>(null);
  const [authorProfile, setAuthorProfile] = useState(() => ({
    username: "",
    displayName: "",
    avatarSrc: "",
    glowColor: "#FF4FD8",
    auraIntensity: 72,
  }));
  // Stable snapshot of the VIEWER's own identity, captured once on mount.
  // (authorProfile gets overwritten with the drop AUTHOR's profile once it
  // loads from Supabase, so it can't be reused as "current user" for an
  // ownership check — that produced false negatives/positives.)
  const [viewerIdentity, setViewerIdentity] = useState(() => ({
    username: "",
    displayName: "",
    avatarSrc: "",
    glowColor: "#FF4FD8",
    auraIntensity: 72,
  }));
  // The authenticated Supabase user id for the viewer, used for a robust
  // id-based ownership check (drops store the author's user_id as a uuid).
  const [currentAuthUserId, setCurrentAuthUserId] = useState("");

  const title = item?.title || "Drop";
  const body = (item as any)?.body || (item as any)?.text || "";
  const id = String((item as any)?.id || "");
  const timeLabel = formatDropTime((item as any)?.created_at);

  // Be tolerant: href can be stored a few ways depending on older drops
  const href =
    (typeof (item as any)?.href === "string" && (item as any).href) ||
    (typeof (item as any)?.url === "string" && (item as any).url) ||
    (typeof (item as any)?.link === "string" && (item as any).link) ||
    "";
  const rawMeta = (item as any)?.meta;
  const meta = rawMeta && typeof rawMeta === "object" ? rawMeta : null;
  const preview = meta?.preview ?? meta ?? null;
  const dropCustomizations = normalizeDropCustomizations(
    meta?.customizations ?? preview?.customizations
  );
  const authorUserId = String((item as any)?.user_id || "");
  const authorName = metaString(
    meta?.authorName,
    meta?.recipientDisplayName,
    meta?.contactName,
    meta?.displayName,
    meta?.name,
    authorProfile.displayName,
    "Board"
  );
  const authorUsername = metaString(
    meta?.authorUsername,
    meta?.ownerUsername,
    meta?.recipientUsername,
    meta?.username,
    authorProfile.username
  ).replace(/^@+/, "");
  const authorHandle = formatHandle(authorUsername || authorName);
  const authorAvatarSrc = storedUrl(
    meta?.authorAvatar,
    meta?.avatarUrl,
    meta?.avatarDataUrl,
    meta?.recipientAvatar,
    authorProfile.avatarSrc
  );
  const isCurrentUserDrop =
    item?.kind === "board_drop" &&
    (Boolean(authorUserId) &&
    Boolean(currentAuthUserId) &&
    authorUserId === currentAuthUserId
      ? true
      : activityOwnedByCurrentUser(item, meta, viewerIdentity));
  const authorGlow =
    colorFromAura(meta?.authorAuraColor) ||
    colorFromAura(meta?.auraColor) ||
    metaString(meta?.authorGlow, meta?.avatarGlow, meta?.glowColor, authorProfile.glowColor) ||
    "#FF4FD8";
  const authorAuraPower =
    typeof meta?.authorAuraIntensity === "number"
      ? Math.max(0.22, Math.min(1, meta.authorAuraIntensity / 100))
      : Math.max(0.22, Math.min(1, authorProfile.auraIntensity / 100));
  const isPushed = Boolean(meta?.isPushed);
  const pushedByName = metaString(meta?.pushedByName, meta?.pushedByUsername, "Someone");
  const announcementVibeLabel =
    item?.kind === "announcement" ? formatAnnouncementVibe(meta?.announcement_vibe) : "";
  const previewImage =
    (typeof (item as any)?.image_url === "string" && (item as any).image_url) ||
    (typeof preview?.image === "string" && preview.image) ||
    (typeof preview?.previewImage === "string" && preview.previewImage) ||
    "";
  const previewTitle =
    (typeof preview?.title === "string" && preview.title) ||
    (typeof preview?.previewTitle === "string" && preview.previewTitle) ||
    title;
  const previewDescription =
    (typeof preview?.description === "string" && preview.description) ||
    (typeof preview?.previewDescription === "string" && preview.previewDescription) ||
    "";
  const previewBucket =
    typeof preview?.bucket === "string" && preview.bucket ? preview.bucket : "";
  const previewStoragePath =
    typeof preview?.storagePath === "string" && preview.storagePath ? preview.storagePath : "";
  const mediaKind = metaString(meta?.mediaKind, preview?.mediaKind);
  const announcementMediaUrl = metaString(meta?.announcement_media_url);
  const announcementMediaType = metaString(meta?.announcement_media_type);
  const announcementImageUrl =
    announcementMediaType === "image" || isLikelyImageUrl(announcementMediaUrl)
      ? announcementMediaUrl
      : "";
  const resolvedPreviewImage =
    signedPreviewImage ||
    resolveLinkPreviewImage(href, previewImage || announcementImageUrl) ||
    hydratedImage ||
    "";
  const isStoredVideoDrop = mediaKind === "video" && !!signedPreviewImage;
  const isStoredAudioDrop = mediaKind === "audio" && !!signedPreviewImage;
  const showAnnouncementImage =
    item?.kind === "announcement" &&
    !!resolvedPreviewImage &&
    !isStoredVideoDrop &&
    !isStoredAudioDrop;

  useEffect(() => {
    setAnnouncementImagePosition({ x: 50, y: 50 });
    setAnnouncementDrag(null);
  }, [id, resolvedPreviewImage]);

  useEffect(() => {
    const identity = readLocalProfileIdentity();
    setAuthorProfile(identity);
    setViewerIdentity(identity);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadCurrentAuthUser() {
      try {
        const sb = supabaseBrowser();
        const { data } = await sb.auth.getUser();
        const uid = metaString(data?.user?.id);
        if (!cancelled && uid) setCurrentAuthUserId(uid);
      } catch {
        // Ownership still falls back to the local-identity comparison below.
      }
    }
    void loadCurrentAuthUser();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const syncReactionState = () => {
      const identity = readLocalProfileIdentity();
      setUserAuraColor(identity.glowColor || fallbackAuraColor);
      if (!id) {
        setSelectedReaction(null);
        return;
      }
      const brain = readBrain();
      const selected = (["pass", "pin", "push"] as const).find((folder) =>
        (brain[folder] ?? []).some((entry) => String(entry.activityId) === id)
      );
      setSelectedReaction(selected ?? null);
    };

    syncReactionState();
    window.addEventListener(EVT_BUCKET_UPDATED, syncReactionState as EventListener);
    window.addEventListener("storage", syncReactionState as EventListener);
    return () => {
      window.removeEventListener(EVT_BUCKET_UPDATED, syncReactionState as EventListener);
      window.removeEventListener("storage", syncReactionState as EventListener);
    };
  }, [id]);

  useEffect(() => {
    const syncCommentCount = () => setCommentCount(getDropCommentCount(id));
    syncCommentCount();
    window.addEventListener(DROP_COMMENTS_UPDATED_EVENT, syncCommentCount as EventListener);
    window.addEventListener("storage", syncCommentCount as EventListener);
    return () => {
      window.removeEventListener(DROP_COMMENTS_UPDATED_EVENT, syncCommentCount as EventListener);
      window.removeEventListener("storage", syncCommentCount as EventListener);
    };
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    setSignedPreviewImage("");

    if (!previewBucket || !previewStoragePath) return;

    async function signPreviewImage() {
      try {
        const supabase = supabaseBrowser();
        const { data, error } = await supabase.storage
          .from(previewBucket)
          .createSignedUrl(previewStoragePath, 60 * 45);

        if (!cancelled && !error && data?.signedUrl) {
          setSignedPreviewImage(data.signedUrl);
        }
      } catch {
        // Fall back to image_url/previewImage if storage signing fails.
      }
    }

    void signPreviewImage();

    return () => {
      cancelled = true;
    };
  }, [previewBucket, previewStoragePath]);

  useEffect(() => {
    let cancelled = false;

    async function loadAuthorProfile() {
      if (!authorUserId) return;

      try {
        const supabase = supabaseBrowser();
        const { data, error } = await supabase
          .from("profiles")
          .select("username, display_name, avatar_url, avatar_path, board_style")
          .eq("id", authorUserId)
          .maybeSingle();

        if (cancelled || error || !data) return;

        const boardStyle =
          data.board_style && typeof data.board_style === "object" ? data.board_style : {};
        let avatarSrc = metaString(
          (boardStyle as any).avatarDataUrl,
          (boardStyle as any).avatarUrl,
          data.avatar_url
        );
        const avatarPath = metaString((boardStyle as any).avatarPath, data.avatar_path);

        if (avatarPath) {
          const { data: signed } = await supabase.storage
            .from("board-avatars")
            .createSignedUrl(avatarPath, 60 * 45);
          if (!cancelled && signed?.signedUrl) avatarSrc = signed.signedUrl;
        }

        if (cancelled) return;

        setAuthorProfile((current) => ({
          username: metaString(data.username, current.username),
          displayName: metaString(data.display_name, current.displayName),
          avatarSrc: avatarSrc || current.avatarSrc,
          glowColor:
            colorFromAura((boardStyle as any).auraColor) ||
            metaString((boardStyle as any).glowColor, current.glowColor) ||
            "#FF4FD8",
          auraIntensity:
            typeof (boardStyle as any).auraIntensity === "number"
              ? Math.max(0, Math.min(100, (boardStyle as any).auraIntensity))
              : current.auraIntensity,
        }));
      } catch {
        // Keep local/meta author identity if the profile lookup is unavailable.
      }
    }

    void loadAuthorProfile();

    return () => {
      cancelled = true;
    };
  }, [authorUserId]);

  const kindLabel = useMemo(() => {
    const explicitDropKind = metaString(
      meta?.dropType,
      meta?.drop_flavor,
      meta?.dropFlavor,
      preview?.dropType,
      preview?.drop_flavor,
      preview?.dropFlavor,
      preview?.kind,
      preview?.type
    );

    if (explicitDropKind) return formatDropKindLabel(explicitDropKind);

    const k = String((item as any)?.kind || (item as any)?.type || "drop");
    return formatDropKindLabel(k);
  }, [item, meta, preview]);
  const badgeLabel = metaString(meta?.badgeLabel, preview?.badgeLabel);

  const payDropId = metaString(meta?.dropId, preview?.dropId, id);
  const payProvider = metaString(meta?.payProvider, preview?.payProvider);
  const priceCents =
    typeof meta?.priceCents === "number"
      ? meta.priceCents
      : typeof preview?.priceCents === "number"
        ? preview.priceCents
        : 0;
  const isPayDrop =
    /\bpay drop\b/i.test(kindLabel) ||
    payProvider === "authorize_net_accept_hosted" ||
    payProvider === "payment_link" ||
    priceCents > 0;
  const priceLabel = formatPriceFromCents(priceCents);

  const embed = useMemo(() => computeEmbed(href), [href]);
  const external = href ? isExternalHref(href) : false;

  // Host + favicon for the universal link-drop cover (shown when a link has no
  // OG image, e.g. a gated Instagram reel). Guarantees every link drop renders
  // as a thumbnail card instead of a bare URL.
  const coverHost = useMemo(() => {
    if (!href) return "";
    try {
      return new URL(href).hostname.replace(/^www\./, "").toUpperCase();
    } catch {
      return "";
    }
  }, [href]);
  const coverFavicon = useMemo(() => {
    if (!href) return "";
    try {
      const h = new URL(href).hostname.replace(/^www\./, "");
      return h ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(h)}&sz=128` : "";
    } catch {
      return "";
    }
  }, [href]);

  // Pull the real thumbnail for link drops that have no stored image. This is
  // what surfaces the Instagram post image (same one iMessage shows) for reels
  // saved before the preview pipeline could resolve it.
  useEffect(() => {
    setHydratedImage("");

    if (!href || !external) return;
    if (previewImage || signedPreviewImage || announcementImageUrl) return;
    if (isPayDrop || mediaKind === "video" || mediaKind === "audio") return;

    let cancelled = false;
    (async () => {
      const preview = await fetchLinkPreview(href).catch(() => null);
      if (cancelled) return;
      const img = resolveLinkPreviewImage(href, preview?.image ?? null);
      if (img) setHydratedImage(img);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    href,
    external,
    previewImage,
    signedPreviewImage,
    announcementImageUrl,
    isPayDrop,
    mediaKind,
  ]);
  const attachmentLabel =
    embed.kind === "spotify"
      ? "Play full track in Spotify"
      : embed.kind === "apple_music"
        ? "Open in Apple Music"
        : "Open attachment";
  const compactSpotify = !!compact && embed.kind === "spotify";

  // Show embed unless user forces fallback or embed fails
  const showEmbed = !!embed.url && !embedFailed && embed.kind !== "none";

  function signal(folder: "pass" | "pin" | "push") {
    if (!id) return;
    const currentUser = readLocalProfileIdentity();

    window.dispatchEvent(
      new CustomEvent(EVT_DEPOSIT, {
        detail: { folder, activityId: id, item },
      })
    );

    setSelectedReaction(folder);

    if (folder === "push") {
      // Amplify the signal: fire the sonar burst regardless of dedupe so the
      // gesture always feels alive.
      setAmplifyBurst(true);
      window.setTimeout(() => setAmplifyBurst(false), 1100);

      const userId = currentUserKey(currentUser);
      const originalDropId = pushedRootId(item, meta);
      const localActivity = getLocalActivity();
      const alreadyPushed = hasUserAlreadyPushed(localActivity, originalDropId, userId);

      if (!alreadyPushed) {
        const pushedDrop = createPushedDrop(item, currentUser);
        appendLocalActivity(pushedDrop);
        window.dispatchEvent(
          new CustomEvent("board:activity:new", { detail: pushedDrop })
        );
        window.dispatchEvent(
          new CustomEvent("board:whisper:create", {
            detail: {
              type: "drop_push",
              dropId: originalDropId,
              userId,
              text: `${pushedDrop.meta?.pushedByName || "Someone"} amplified a drop's signal back into orbit.`,
              createdAt: pushedDrop.meta?.pushedAt || new Date().toISOString(),
            },
          })
        );
      }
    }

    if (openBucketOnSignal) {
      window.dispatchEvent(new CustomEvent(EVT_OPEN, { detail: { folder } }));
    }

    const word = folder === "pass" ? "PASS" : folder === "pin" ? "PIN" : "PUSH";
    setToast(folder === "push" ? "Signal amplified" : `${word} saved to Bucket`);
    window.setTimeout(() => setToast(null), 1200);
  }

  async function openPayCheckout() {
    if (!isPayDrop) return;

    if (href) {
      window.open(href, "_blank", "noopener,noreferrer");
      return;
    }

    try {
      setPayCheckoutBusy(true);
      await openHostedPayDropCheckout({
        payDropId,
        title,
        description: body,
        amountCents: priceCents,
      });
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "Could not open National Bankcard checkout."
      );
    } finally {
      setPayCheckoutBusy(false);
    }
  }

  async function removeDropFromBoard() {
    if (!id || !isCurrentUserDrop) return;
    if (isRemovingDrop) return;
    if (!window.confirm("Remove this drop from your Board?")) return;

    setIsRemovingDrop(true);
    try {
      await performDropRemoval();
    } catch (error) {
      console.error("Failed to remove drop from Board:", error);
      if (typeof setToast === "function") {
        setToast("Couldn't remove this drop. Try again.");
        window.setTimeout(() => setToast(null), 1800);
      }
    } finally {
      setIsRemovingDrop(false);
    }
  }

  async function performDropRemoval() {
    if (!id) return;
    const dropId = metaString(meta?.dropId, meta?.originalDropId, id);
    removeLocalActivity((activity) => {
      const activityMeta =
        activity.meta && typeof activity.meta === "object"
          ? (activity.meta as Record<string, any>)
          : null;
      return (
        activity.id === id ||
        activity.id === dropId ||
        metaString(activityMeta?.dropId, activityMeta?.originalDropId) === dropId
      );
    });
    removeUniversalDrops(
      (drop) =>
        drop.id === id ||
        drop.id === dropId ||
        metaString(drop.meta?.activityId, drop.meta?.dropId) === id ||
        metaString(drop.meta?.activityId, drop.meta?.dropId) === dropId
    );
    removeFeedDrops((drop) => {
      const feedMeta = drop.meta && typeof drop.meta === "object" ? drop.meta : null;
      return (
        drop.id === id ||
        drop.id === dropId ||
        metaString(feedMeta?.activityId, feedMeta?.dropId) === id ||
        metaString(feedMeta?.activityId, feedMeta?.dropId) === dropId
      );
    });

    try {
      const sb = supabaseBrowser();
      const { data: auth } = await sb.auth.getUser();
      const authUserId = auth?.user?.id;
      if (authUserId && authorUserId === authUserId) {
        await sb.from("board_activity").delete().eq("id", id).eq("user_id", authUserId);
      }
    } catch {
      // Board remains local-first; remote deletion can retry later when Supabase is reachable.
    }

    window.dispatchEvent(new CustomEvent("board:drop:removed", { detail: { id, dropId } }));
    window.dispatchEvent(new CustomEvent(BOARD_STORE_EVENTS.feedUpdated));
    onRemove?.(id);
    setToast("Drop removed");
    window.setTimeout(() => setToast(null), 1200);
  }

  function clampPan(value: number) {
    return Math.max(0, Math.min(100, value));
  }

  function startAnnouncementDrag(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setAnnouncementDrag({
      clientX: event.clientX,
      clientY: event.clientY,
      x: announcementImagePosition.x,
      y: announcementImagePosition.y,
    });
  }

  function moveAnnouncementDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!announcementDrag) return;
    const deltaX = event.clientX - announcementDrag.clientX;
    const deltaY = event.clientY - announcementDrag.clientY;

    setAnnouncementImagePosition({
      x: clampPan(announcementDrag.x - deltaX * 0.16),
      y: clampPan(announcementDrag.y - deltaY * 0.16),
    });
  }

  function endAnnouncementDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (announcementDrag) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      setAnnouncementDrag(null);
    }
  }

  return (
    <div
      className={clsx(
        "card",
        compact && "compact",
        compactSpotify && "compactSpotify",
        item?.kind === "announcement" && "announcementDrop",
        isPushed && "pushedDrop"
      )}
      style={
        {
          "--author-glow": authorGlow,
          "--author-aura-power": String(authorAuraPower),
          "--reaction-aura": userAuraColor || fallbackAuraColor,
        } as React.CSSProperties
      }
    >
      {amplifyBurst ? (
        <div className="amplifyRings" aria-hidden>
          <span />
          <span />
        </div>
      ) : null}
      {isPushed ? <div className="pushedByLabel">⚡ Amplified by {pushedByName}</div> : null}
      <div className="head">
        <div className="headCopy">
          <div className="metaRow">
            <RemovableDropBadge
              label={kindLabel}
              canRemove={isCurrentUserDrop}
              onRemove={removeDropFromBoard}
              isRemoving={isRemovingDrop}
            />
            {announcementVibeLabel ? (
              <span className="metaBadge vibeBadge">{announcementVibeLabel}</span>
            ) : null}
            {badgeLabel ? <span className="metaBadge">{badgeLabel}</span> : null}
            {isPayDrop && priceLabel ? <span className="metaBadge">{priceLabel}</span> : null}
            {timeLabel ? <span className="metaBadge timeBadge">{timeLabel}</span> : null}
          </div>
          <div className="title">{title}</div>
        </div>

        <div className="authorMark" aria-label={`Drop by ${authorHandle || authorName}`}>
          {authorHandle ? <span className="authorHandle">{authorHandle}</span> : null}
          <div className="authorAvatarFrame">
            <div className="authorAvatarInner">
              {authorAvatarSrc ? (
                <img
                  className="authorAvatarImg"
                  src={authorAvatarSrc}
                  alt={authorName || authorHandle || "Board avatar"}
                  loading="lazy"
                />
              ) : (
                <span className="authorAvatarFallback" aria-hidden>
                  {getInitials(authorName || authorHandle)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {body ? <div className="body">{body}</div> : null}

      {isPayDrop ? (
        <div className="dropActions" aria-label="Pay Drop actions">
          <button
            type="button"
            className="checkoutBtn"
            onClick={openPayCheckout}
            disabled={payCheckoutBusy}
          >
            {payCheckoutBusy ? "Opening..." : "Checkout ->"}
          </button>
        </div>
      ) : null}

      {/* ✅ EMBED (now media-aware) */}
      {showEmbed ? (
        <div className={clsx("embed", embed.kind)}>
          {embed.kind === "image" && (
            <div className="mediaFrame">
              <img
                src={embed.url}
                alt={title || "Media drop"}
                className="img"
                loading="lazy"
                onError={() => setEmbedFailed(true)}
              />
              <DropStudioOverlay customizations={dropCustomizations} />
            </div>
          )}

          {embed.kind === "video" && (
            <div className="mediaFrame">
              <video
                className="vid"
                src={embed.url}
                controls
                playsInline
                onError={() => setEmbedFailed(true)}
              />
              <DropStudioOverlay customizations={dropCustomizations} />
            </div>
          )}

          {embed.kind === "audio" && (
            <div className="mediaFrame">
              <audio
                className="aud"
                src={embed.url}
                controls
                onError={() => setEmbedFailed(true)}
              />
            </div>
          )}

          {(embed.kind === "youtube" ||
            embed.kind === "spotify" ||
            embed.kind === "apple_music" ||
            embed.kind === "soundcloud") && (
            <iframe
              title={`embed-${embed.kind}-${id}`}
              src={embed.url}
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              onError={() => setEmbedFailed(true)}
            />
          )}

          <div className="embedFoot">
            {href ? (
              <a
                className="embedLink"
                href={href}
                target={external ? "_blank" : undefined}
                rel={external ? "noreferrer" : undefined}
              >
                {attachmentLabel}
              </a>
            ) : (
              <span className="embedLink dim">No attachment</span>
            )}

            {href ? (
              <button
                type="button"
                className="embedFallback"
                onClick={() => setEmbedFailed(true)}
                title="If the embed is blocked, switch to link view"
              >
                Embed blocked? Show link
              </button>
            ) : null}
          </div>

          {embed.kind === "spotify" ? (
            <div className="embedNote">
              Spotify’s web embed may play a preview clip in some browser sessions. Use the link above for full playback in Spotify.
            </div>
          ) : null}
        </div>
      ) : null}

      {!showEmbed && showAnnouncementImage ? (
        <div
          className={clsx("activityImagePreview announcementMedia", announcementDrag && "dragging")}
          style={
            {
              "--announcement-image": `url("${resolvedPreviewImage.replace(/"/g, '\\"')}")`,
            } as React.CSSProperties
          }
          onPointerDown={startAnnouncementDrag}
          onPointerMove={moveAnnouncementDrag}
          onPointerUp={endAnnouncementDrag}
          onPointerCancel={endAnnouncementDrag}
          onDoubleClick={() => setAnnouncementImagePosition({ x: 50, y: 50 })}
          title="Drag to reposition. Double-click to recenter."
        >
          <img
            className="activityImage"
            src={resolvedPreviewImage}
            alt={title || "Announcement image"}
            loading="lazy"
            draggable={false}
            style={{
              objectPosition: `${announcementImagePosition.x}% ${announcementImagePosition.y}%`,
            }}
          />
        </div>
      ) : null}

      {!showEmbed &&
      !showAnnouncementImage &&
      href &&
      resolvedPreviewImage &&
      !isPayDrop &&
      !isStoredVideoDrop &&
      !isStoredAudioDrop ? (
        <a
          className="linkPreview"
          href={href}
          target={external ? "_blank" : undefined}
          rel={external ? "noreferrer" : undefined}
        >
          <div className="linkPreviewArt">
            <img className="linkPreviewImg" src={resolvedPreviewImage} alt="" loading="lazy" />
            <div className="linkPreviewShade" />
            <div className="linkPreviewCopy">
              <div className="linkPreviewLabel">{kindLabel}</div>
              <div className="linkPreviewTitle">{previewTitle}</div>
              {previewDescription ? (
                <div className="linkPreviewDesc">{previewDescription}</div>
              ) : null}
            </div>
          </div>
        </a>
      ) : null}

      {!showEmbed && isStoredVideoDrop ? (
        <div className="mediaFrame storedVideoFrame">
          <video
            className="vid"
            src={signedPreviewImage}
            controls
            playsInline
            preload="metadata"
            onError={() => setEmbedFailed(true)}
          />
          <DropStudioOverlay customizations={dropCustomizations} />
        </div>
      ) : null}

      {!showEmbed && isStoredAudioDrop ? (
        <div className="mediaFrame storedAudioFrame">
          <div className="audioLabel">Full song</div>
          <audio
            className="aud"
            src={signedPreviewImage}
            controls
            preload="metadata"
            onError={() => setEmbedFailed(true)}
          />
        </div>
      ) : null}

      {!showEmbed &&
      resolvedPreviewImage &&
      !showAnnouncementImage &&
      (!href || isPayDrop) &&
      !isStoredVideoDrop &&
      !isStoredAudioDrop ? (
        <div className="activityImagePreview">
          <img
            className="activityImage"
            src={resolvedPreviewImage}
            alt={title || "Board drop image"}
            loading="lazy"
          />
          <DropStudioOverlay customizations={dropCustomizations} />
        </div>
      ) : null}

      {/* Universal cover fallback: any external link with no real image still
          gets a branded thumbnail card instead of a bare URL. */}
      {!showEmbed &&
      href &&
      external &&
      !resolvedPreviewImage &&
      !isPayDrop &&
      !isStoredVideoDrop &&
      !isStoredAudioDrop ? (
        <a
          className="linkPreview linkCoverFallback"
          href={href}
          target="_blank"
          rel="noreferrer"
        >
          <div className="linkPreviewArt">
            {coverFavicon ? (
              <img
                className="linkCoverWatermark"
                src={coverFavicon}
                alt=""
                loading="lazy"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : null}
            <div className="linkPreviewShade" />
            <div className="linkCoverHostChip">
              {coverFavicon ? (
                <img
                  className="linkCoverFav"
                  src={coverFavicon}
                  alt=""
                  loading="lazy"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : null}
              <span>{coverHost || "LINK"}</span>
            </div>
            <div className="linkPreviewCopy">
              <div className="linkPreviewLabel">{kindLabel}</div>
              <div className="linkPreviewTitle">{previewTitle}</div>
              {previewDescription ? (
                <div className="linkPreviewDesc">{previewDescription}</div>
              ) : null}
            </div>
          </div>
        </a>
      ) : !showEmbed && href && !resolvedPreviewImage ? (
        <a
          className="href"
          href={href}
          target={external ? "_blank" : undefined}
          rel={external ? "noreferrer" : undefined}
        >
          {href}
        </a>
      ) : null}

      {/* ✅ Reaction rail stays in card */}
      <div className="rail" aria-label="Reaction rail">
        <button
          type="button"
          className={clsx("rbtn pass", selectedReaction === "pass" && "selected")}
          onClick={() => signal("pass")}
          title="PASS (acknowledge)"
        >
          <span className="glyph" aria-hidden>
            <PassGlyph />
          </span>
          <span className="lbl">PASS</span>
        </button>

        <button
          type="button"
          className={clsx("rbtn pin", selectedReaction === "pin" && "selected")}
          onClick={() => signal("pin")}
          title="PIN (save)"
        >
          <span className="glyph" aria-hidden>
            <StarGlyph />
          </span>
          <span className="lbl">PIN</span>
        </button>

        <button
          type="button"
          className={clsx("rbtn push", selectedReaction === "push" && "selected")}
          onClick={() => signal("push")}
          title="PUSH (boost)"
        >
          <span className="glyph" aria-hidden>
            <ArrowGlyph />
          </span>
          <span className="lbl">PUSH</span>
        </button>

        <button
          type="button"
          className="rbtn comments"
          onClick={() => setCommentsOpen(true)}
          title="Comment"
        >
          <span className="glyph" aria-hidden>
            <CommentGlyph />
          </span>
          <span className="lbl">Comment{commentCount ? ` ${commentCount}` : ""}</span>
        </button>

      </div>

      <DropCommentsDrawer
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        dropId={id}
        dropTitle={title}
      />

      {toast ? <div className="toast">{toast}</div> : null}

      <style>{`
        .card {
          position: relative;
          border-radius: 22px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(255, 255, 255, 0.78);
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.1);
          padding: 12px;
          overflow: hidden;
        }

        .announcementDrop {
          padding-bottom: 0;
        }

        .announcementDrop .rail {
          margin: 12px 0 12px;
        }

        .pushedDrop {
          border: 1.5px solid rgba(255, 221, 87, 0.9);
          box-shadow:
            0 0 18px rgba(255, 221, 87, 0.22),
            inset 0 0 18px rgba(255, 221, 87, 0.08),
            0 16px 40px rgba(0, 0, 0, 0.1);
        }

        /* Signal amplification: a brief sonar burst in the user's aura when a
           drop is Pushed — amplifying the signal rather than reposting it. */
        .amplifyRings {
          position: absolute;
          inset: 0;
          z-index: 4;
          display: grid;
          place-items: center;
          pointer-events: none;
        }
        .amplifyRings span {
          position: absolute;
          width: 46px;
          height: 46px;
          border-radius: 999px;
          border: 2px solid var(--reaction-aura, ${fallbackAuraColor});
          opacity: 0;
          animation: amplifyRing 1000ms cubic-bezier(0.22, 0.61, 0.36, 1) forwards;
        }
        .amplifyRings span:nth-child(2) {
          animation-delay: 150ms;
        }
        @keyframes amplifyRing {
          0% {
            transform: scale(0.55);
            opacity: 0.5;
          }
          100% {
            transform: scale(9);
            opacity: 0;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .amplifyRings span {
            animation-duration: 1ms;
          }
        }

        .pushedByLabel {
          display: inline-flex;
          width: fit-content;
          margin-bottom: 0.55rem;
          padding: 0.28rem 0.55rem;
          border-radius: 999px;
          font-size: 0.72rem;
          font-weight: 950;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: rgba(255, 234, 146, 0.95);
          background: rgba(255, 221, 87, 0.12);
          border: 1px solid rgba(255, 221, 87, 0.32);
          text-shadow: 0 0 10px rgba(255, 221, 87, 0.24);
        }

        .head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
        }

        .headCopy {
          min-width: 0;
          display: grid;
          gap: 6px;
          flex: 1 1 auto;
        }

        .metaRow {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          gap: 8px;
          flex-wrap: wrap;
        }

        .kind,
        .metaBadge {
          display: inline-flex;
          align-items: center;
          min-height: 24px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(255, 255, 255, 0.74);
          padding: 5px 9px;
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(0, 140, 135, 0.95);
        }

        .metaBadge {
          color: rgba(0, 0, 0, 0.58);
          background: rgba(255, 255, 255, 0.64);
          letter-spacing: 0.08em;
        }

        .timeBadge {
          color: rgba(0, 0, 0, 0.52);
        }

        .vibeBadge {
          color: rgba(48, 36, 10, 0.78);
          background: rgba(255, 231, 128, 0.46);
          border-color: rgba(255, 198, 64, 0.38);
          letter-spacing: 0.06em;
        }

        .title {
          font-size: 14px;
          font-weight: 950;
          color: rgba(0, 0, 0, 0.76);
          letter-spacing: 0.02em;
          overflow-wrap: anywhere;
        }

        .authorMark {
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          justify-content: flex-end;
          gap: 9px;
          max-width: 48%;
          padding-top: 1px;
        }

        .authorHandle {
          min-width: 0;
          max-width: 126px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          border-radius: 999px;
          padding: 6px 9px;
          border: 1px solid color-mix(in srgb, var(--author-glow) 32%, rgba(0, 0, 0, 0.1));
          background: rgba(255, 255, 255, 0.68);
          color: rgba(0, 0, 0, 0.66);
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.04em;
          box-shadow:
            0 0 calc(10px + 12px * var(--author-aura-power)) color-mix(in srgb, var(--author-glow) 24%, transparent),
            inset 0 1px 0 rgba(255, 255, 255, 0.72);
        }

        .authorAvatarFrame {
          --avatar-size: ${compact ? "42px" : "50px"};
          width: var(--avatar-size);
          height: var(--avatar-size);
          border-radius: 999px;
          padding: 3px;
          background:
            radial-gradient(circle at 30% 18%, rgba(255, 255, 255, 0.9), transparent 28%),
            color-mix(in srgb, var(--author-glow) 72%, rgba(255, 255, 255, 0.86));
          border: 1px solid color-mix(in srgb, var(--author-glow) 45%, rgba(255, 255, 255, 0.76));
          box-shadow:
            0 0 calc(14px + 30px * var(--author-aura-power)) calc(1px + 5px * var(--author-aura-power)) color-mix(in srgb, var(--author-glow) 42%, transparent),
            0 10px 22px rgba(0, 0, 0, 0.16),
            inset 0 1px 0 rgba(255, 255, 255, 0.76);
        }

        .authorAvatarInner {
          width: 100%;
          height: 100%;
          border-radius: inherit;
          overflow: hidden;
          display: grid;
          place-items: center;
          background:
            radial-gradient(circle at 40% 30%, rgba(255, 255, 255, 0.28), transparent 34%),
            rgba(0, 0, 0, 0.84);
          border: 1px solid rgba(255, 255, 255, 0.72);
        }

        .authorAvatarImg {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .authorAvatarFallback {
          color: #fff;
          font-size: 13px;
          font-weight: 950;
          letter-spacing: 0.08em;
          text-shadow: 0 0 12px color-mix(in srgb, var(--author-glow) 72%, transparent);
        }

        .body {
          margin-top: 8px;
          font-size: 12px;
          font-weight: 800;
          color: rgba(0, 0, 0, 0.58);
          white-space: pre-wrap;
          line-height: 1.45;
        }

        .dropActions {
          margin-top: 12px;
          display: flex;
          justify-content: flex-start;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .checkoutBtn {
          min-height: 36px;
          border-radius: 999px;
          padding: 9px 14px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(255, 255, 255, 0.88);
          color: rgba(0, 0, 0, 0.68);
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.02em;
          cursor: pointer;
          box-shadow: 0 10px 24px rgba(0, 0, 0, 0.08);
          transition: transform 140ms ease, filter 140ms ease;
        }

        .checkoutBtn:hover:not(:disabled) {
          transform: translateY(-1px);
          filter: brightness(1.02);
        }

        .checkoutBtn:disabled {
          cursor: wait;
          opacity: 0.68;
        }

        /* embed */
        .embed {
          margin-top: 12px;
          border-radius: 18px;
          overflow: hidden;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(0, 0, 0, 0.04);
        }

        iframe {
          width: 100%;
          height: 240px;
          border: none;
          display: block;
          background: rgba(255, 255, 255, 0.06);
        }

        .embed.spotify iframe {
          height: 160px;
        }

        .embed.apple_music iframe {
          height: 175px;
        }

        .embed.image,
        .embed.video,
        .embed.audio {
          width: fit-content;
          max-width: 100%;
          border: 0;
          background: transparent;
        }

        .embed.audio {
          width: 100%;
        }

        .linkPreview {
          display: block;
          margin-top: 12px;
          overflow: hidden;
          border-radius: 18px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(0, 0, 0, 0.06);
          text-decoration: none;
        }

        .linkPreviewArt {
          position: relative;
          min-height: ${compact ? "170px" : "230px"};
          overflow: hidden;
          background:
            radial-gradient(circle at 18% 20%, rgba(255, 0, 190, 0.16), transparent 34%),
            radial-gradient(circle at 80% 22%, rgba(0, 180, 255, 0.14), transparent 34%),
            linear-gradient(135deg, rgba(24, 21, 15, 0.92), rgba(76, 66, 43, 0.9));
        }

        .linkPreviewImg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .linkPreviewShade {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.78));
        }

        .linkPreviewCopy {
          position: absolute;
          left: 14px;
          right: 14px;
          bottom: 14px;
          color: #fff;
        }

        .linkPreviewLabel {
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(200, 255, 230, 0.9);
        }

        .linkPreviewTitle {
          margin-top: 6px;
          font-size: ${compact ? "16px" : "20px"};
          line-height: 1.1;
          font-weight: 950;
          letter-spacing: -0.02em;
          text-shadow: 0 2px 12px rgba(0, 0, 0, 0.42);
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .linkPreviewDesc {
          margin-top: 7px;
          font-size: 12px;
          line-height: 1.45;
          color: rgba(255, 255, 255, 0.78);
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .linkCoverWatermark {
          position: absolute;
          right: -28px;
          top: 50%;
          width: 240px;
          height: 240px;
          transform: translateY(-50%);
          object-fit: contain;
          opacity: 0.16;
          pointer-events: none;
        }

        .linkCoverHostChip {
          position: absolute;
          top: 14px;
          left: 14px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.42);
          border: 1px solid rgba(255, 255, 255, 0.18);
          color: rgba(255, 255, 255, 0.92);
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          backdrop-filter: blur(4px);
        }

        .linkCoverFav {
          width: 16px;
          height: 16px;
          border-radius: 4px;
          display: block;
        }

        .activityImagePreview {
          position: relative;
          margin-top: 12px;
          overflow: hidden;
          border-radius: 18px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background:
            radial-gradient(circle at 18% 18%, rgba(255, 0, 190, 0.08), transparent 34%),
            radial-gradient(circle at 80% 22%, rgba(0, 180, 255, 0.08), transparent 34%),
            rgba(0, 0, 0, 0.055);
        }

        .activityImage {
          width: auto;
          max-width: 100%;
          max-height: ${compact ? "260px" : "420px"};
          margin: 0 auto;
          display: block;
          object-fit: contain;
        }

        .announcementMedia {
          display: block;
          width: calc(100% + 24px);
          max-width: none;
          min-height: ${compact ? "380px" : "560px"};
          margin: 14px -12px 0;
          border-radius: 0;
          border-left: 0;
          border-right: 0;
          background:
            var(--announcement-image) center / cover no-repeat,
            rgba(255, 255, 255, 0.58);
          cursor: grab;
          touch-action: none;
          user-select: none;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.62),
            inset 0 -1px 0 rgba(0, 0, 0, 0.08);
        }

        .announcementMedia.dragging {
          cursor: grabbing;
        }

        .announcementMedia .activityImage {
          width: 100%;
          height: 100%;
          max-height: none;
          object-fit: cover;
          display: block;
          pointer-events: none;
        }

        .mediaFrame {
          position: relative;
          width: fit-content;
          max-width: 100%;
          overflow: hidden;
          border-radius: 16px;
          background: rgba(0, 0, 0, 0.06);
        }

        .storedVideoFrame {
          margin-top: 12px;
        }

        .storedAudioFrame {
          width: 100%;
          margin-top: 12px;
          padding: 12px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          background:
            radial-gradient(circle at 18% 20%, rgba(255, 0, 190, 0.1), transparent 32%),
            radial-gradient(circle at 84% 12%, rgba(0, 180, 255, 0.1), transparent 34%),
            rgba(255, 255, 255, 0.64);
        }

        .audioLabel {
          margin: 0 0 8px;
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(0, 0, 0, 0.58);
        }

        .img {
          width: auto;
          max-width: 100%;
          max-height: ${compact ? "260px" : "420px"};
          height: auto;
          display: block;
        }

        .vid {
          width: auto;
          max-width: 100%;
          display: block;
          background: #000;
          max-height: 520px;
        }

        .aud {
          width: 100%;
          display: block;
          padding: 10px;
        }

        .embedFoot {
          display: flex;
          gap: 10px;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.55);
          border-top: 1px solid rgba(0, 0, 0, 0.08);
        }

        .embedLink {
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(255, 0, 190, 0.85);
          text-decoration: underline;
          text-underline-offset: 4px;
        }

        .embedLink.dim {
          color: rgba(0, 0, 0, 0.45);
          text-decoration: none;
        }

        .embedFallback {
          border-radius: 999px;
          padding: 8px 10px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(255, 255, 255, 0.82);
          color: rgba(0, 0, 0, 0.7);
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          cursor: pointer;
        }

        .embedNote {
          padding: 10px 12px 12px;
          border-top: 1px solid rgba(0, 0, 0, 0.06);
          font-size: 11px;
          font-weight: 800;
          color: rgba(0, 0, 0, 0.52);
          background: rgba(255, 255, 255, 0.45);
        }

        .href {
          display: inline-block;
          margin-top: 10px;
          font-size: 11px;
          font-weight: 900;
          color: rgba(255, 0, 190, 0.85);
          text-decoration: underline;
          text-underline-offset: 4px;
          word-break: break-word;
        }

        .rail {
          margin-top: 12px;
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .rbtn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          border-radius: 999px;
          padding: 10px 12px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(255, 255, 255, 0.82);
          cursor: pointer;
          color: rgba(0, 0, 0, 0.62);
          transition: transform 140ms ease, filter 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
        }

        .rbtn:hover {
          transform: translateY(-1px);
          filter: brightness(1.02);
          border-color: color-mix(in srgb, var(--reaction-aura, ${fallbackAuraColor}) 50%, rgba(0, 0, 0, 0.1));
          box-shadow: 0 0 0 6px color-mix(in srgb, var(--reaction-aura, ${fallbackAuraColor}) 12%, transparent);
        }

        /* Aura identity stays visible across every action, including Comment. */
        .rbtn:hover .lbl,
        .rbtn:hover .glyph {
          color: var(--reaction-aura, ${fallbackAuraColor});
        }

        .glyph {
          width: 18px;
          height: 18px;
          display: grid;
          place-items: center;
        }

        .lbl {
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(0, 0, 0, 0.62);
        }

        .rbtn.selected {
          color: var(--reaction-aura, ${fallbackAuraColor});
          border-color: var(--reaction-aura, ${fallbackAuraColor});
          box-shadow: 0 0 18px color-mix(in srgb, var(--reaction-aura, ${fallbackAuraColor}) 27%, transparent);
          text-shadow: 0 0 12px var(--reaction-aura, ${fallbackAuraColor});
        }

        .rbtn.selected .lbl {
          color: var(--reaction-aura, ${fallbackAuraColor});
          text-shadow: 0 0 12px var(--reaction-aura, ${fallbackAuraColor});
        }

        /* Per-action hovers now unified under .rbtn:hover so the active aura
           tints Pass/Pin/Push/Comment identically. */

        .remove:hover {
          border-color: rgba(0, 0, 0, 0.18);
          box-shadow: 0 0 0 6px rgba(0, 0, 0, 0.055);
        }

        .toast {
          position: absolute;
          right: 12px;
          bottom: 12px;
          border-radius: 999px;
          padding: 9px 12px;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.06em;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(255, 255, 255, 0.9);
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.12);
          color: rgba(0, 0, 0, 0.72);
        }

        .compact .body {
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .compactSpotify {
          padding: 10px;
        }

        .compactSpotify .head {
          gap: 8px;
        }

        .compactSpotify .authorHandle {
          display: none;
        }

        .compactSpotify .authorAvatarFrame {
          --avatar-size: 34px;
        }

        .compactSpotify .title {
          font-size: 12px;
          line-height: 1.2;
        }

        .compactSpotify .body {
          display: none;
        }

        .compactSpotify .embed {
          margin-top: 8px;
          border: none;
          background: transparent;
        }

        .compactSpotify iframe {
          height: 152px;
        }

        .compactSpotify .embedFoot,
        .compactSpotify .embedNote {
          display: none;
        }

        @media (max-width: 620px) {
          .head {
            align-items: flex-start;
            gap: 10px;
          }

          .authorMark {
            max-width: 54%;
            gap: 7px;
          }

          .authorHandle {
            max-width: 96px;
            font-size: 9px;
            padding-inline: 7px;
          }

          .authorAvatarFrame {
            --avatar-size: 40px;
          }
        }
      `}</style>
    </div>
  );
}

/* ---------- glyphs ---------- */

function PassGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M8.2 11.2V5.9c0-.9.7-1.6 1.6-1.6s1.6.7 1.6 1.6v4.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M11.4 10V4.9c0-.9.7-1.6 1.6-1.6s1.6.7 1.6 1.6V10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M14.6 10.2V5.7c0-.88.72-1.6 1.6-1.6.88 0 1.6.72 1.6 1.6V13"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M7.1 12.3l-.25-2.3c-.1-.9-.85-1.55-1.72-1.45-.88.1-1.52.9-1.42 1.78l.38 3.4c.2 1.8 1.2 3.45 2.7 4.4l1.05.66c1.2.76 2.6 1.17 4.02 1.17h1.55c2.9 0 5.25-2.35 5.25-5.25V13"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StarGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.8l2.9 6.1 6.7.9-4.9 4.7 1.2 6.6L12 18l-5.9 3.1 1.2-6.6L2.4 9.8l6.7-.9L12 2.8z"
        fill="transparent"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 4l7 7-1.7 1.7L13.2 8.6V20h-2.4V8.6L6.7 12.7 5 11l7-7z"
        fill="transparent"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CommentGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4.5 6.8c0-1.25 1.02-2.3 2.3-2.3h10.4c1.28 0 2.3 1.05 2.3 2.3v6.6c0 1.25-1.02 2.3-2.3 2.3h-5.4L7.2 19v-3.3h-.4c-1.28 0-2.3-1.05-2.3-2.3V6.8z"
        fill="transparent"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}
