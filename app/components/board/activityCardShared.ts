// Constants and pure helpers for ActivityCard.
// Extracted verbatim from ActivityCard.tsx (no behavior change).

import type { BoardActivity } from "@/lib/board/activity";

export const EVT_DEPOSIT = "board:bucketBrain:deposit";
export const EVT_OPEN = "board:bucketBrain:open";
export const EVT_BUCKET_UPDATED = "board:bucketBrain:updated";
export const fallbackAuraColor = "#8ee7ff";

export const AURA_HEX: Record<string, string> = {
  sloth_pink: "#FF4FD8",
  lust_blue: "#2D7CFF",
  greed_black: "#111111",
  pride_yellow: "#FFD12D",
  envy_red: "#FF2D2D",
  gluttony_orange: "#FF7A1A",
  wrath_purple: "#7A44FF",
  lilly_yellowgreen: "#B7FF2D",
};

export const ANNOUNCEMENT_VIBES: Record<string, string> = {
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

export function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

// Some internal drop "kind" values use legacy/technical names that should
// surface to users under friendlier labels (e.g. "media" -> "Vision").
export const DROP_KIND_DISPLAY_RENAMES: Record<string, string> = {
  media: "vision",
  image: "vision",
  video: "vision",
};

export function formatDropKindLabel(value: string) {
  const clean = value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const lower = clean.toLowerCase();
  const renamed = DROP_KIND_DISPLAY_RENAMES[lower] ?? clean;
  return /\bdrop\b/i.test(renamed) ? renamed.toUpperCase() : `${renamed.toUpperCase()} DROP`;
}

export function metaString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function storedUrl(...values: unknown[]) {
  const clean = metaString(...values);
  return clean.startsWith("data:") ? "" : clean;
}

export function colorFromAura(value: unknown) {
  const key = typeof value === "string" ? value.trim() : "";
  return (key && AURA_HEX[key]) || key || "";
}

export function getInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("");
  return initials || "B";
}

export function formatHandle(value: string) {
  const clean = value.trim().replace(/^@+/, "");
  return clean ? `@${clean}` : "";
}

export function formatAnnouncementVibe(value: unknown) {
  const key = typeof value === "string" ? value.trim() : "";
  if (!key) return "";
  return ANNOUNCEMENT_VIBES[key] || key.replace(/[_-]+/g, " ");
}

export function readLocalProfileIdentity() {
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

export function currentUserKey(identity: ReturnType<typeof readLocalProfileIdentity>) {
  return (
    metaString(identity.username, identity.displayName)
      .toLowerCase()
      .replace(/^@+/, "")
      .replace(/[^a-z0-9_.-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "board-user"
  );
}

export function normalizeIdentityKey(value: unknown) {
  return metaString(value)
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function activityOwnedByCurrentUser(
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

export function pushedRootId(item: BoardActivity, meta: Record<string, any> | null) {
  return metaString(meta?.originalDropId, meta?.dropId, item.id);
}

export function hasUserAlreadyPushed(
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

export function createPushedDrop(
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

export function formatPriceFromCents(cents?: number) {
  if (!cents || cents <= 0) return "";
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatDropTime(value?: string | null) {
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

export type EmbedKind =
  | "youtube"
  | "spotify"
  | "apple_music"
  | "soundcloud"
  | "image"
  | "video"
  | "audio"
  | "none";

export function isExternalHref(href: string) {
  return /^https?:\/\//i.test(href);
}

export function isLikelyImageUrl(href: string) {
  const clean = href.toLowerCase();
  return (
    /\.(png|jpg|jpeg|gif|webp|avif|svg|bmp|tif|tiff|heic|heif)(\?|#|$)/i.test(clean) ||
    /\/storage\/v1\/object\/public\/board-media\//i.test(clean)
  );
}

export function getExt(url: string) {
  const clean = url.split("?")[0].split("#")[0];
  const dot = clean.lastIndexOf(".");
  if (dot === -1) return "";
  return clean.slice(dot + 1).toLowerCase();
}

export function guessMediaKind(url: string): EmbedKind {
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

export function ytId(url: string): string | null {
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

export function toYouTubeEmbed(url: string, origin?: string): string | null {
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

export function toSpotifyEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/open\.spotify\.com$/i.test(u.hostname)) return null;
    return `https://open.spotify.com/embed${u.pathname}`;
  } catch {
    return null;
  }
}

export function toAppleMusicEmbed(url: string): string | null {
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
export function toSoundCloudEmbed(url: string): string | null {
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

export function computeEmbed(href: string): { kind: EmbedKind; url: string } {
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

  // 5) Vision/media files (image/video/audio)
  const mk = guessMediaKind(href);
  if (mk !== "none") return { kind: mk, url: href };

  return { kind: "none", url: "" };
}
