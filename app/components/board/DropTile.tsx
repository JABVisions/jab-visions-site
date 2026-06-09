"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { removePayDrop, upsertPayDrop } from "@/lib/board/paydrops";
import { appendLocalActivity, createActivity, type BoardActivity } from "@/lib/board/activity";
import { pushDrop } from "@/lib/board/drops/storage";
import { emitBoardDropSignal } from "@/lib/board/dropSignals";
import { fetchLinkPreview } from "@/lib/board/linkPreview";
import { resolveLinkPreviewImage } from "@/lib/board/linkPreviewImages";
import { openHostedPayDropCheckout } from "@/lib/board/payCheckout";
import {
  DROP_COMMENTS_UPDATED_EVENT,
  getDropCommentCount,
} from "@/lib/board/dropComments";
import {
  compactDropCustomizations,
  normalizeDropCustomizations,
  type DropCustomization,
} from "@/lib/board/dropCustomizations";
import { DROP_FLAVOR_ORDER, type DropFlavorKey } from "@/lib/board/dropFlavors";
import RemovableDropBadge from "./RemovableDropBadge";
import DropStudioStage from "./DropStudioStage";
import DropCommentsDrawer from "./DropCommentsDrawer";
import DropStudioOverlay from "./DropStudioOverlay";

type DropType =
  | "YouTube"
  | "Music"
  | "News"
  | "Link"
  | "Media"
  | "Pay"
  | "Doc"
  | "Thought";
type MediaKind = "image" | "video" | "audio";
type PayProviderMode = "payment_link" | "stripe_connect";
type StudioCaptureMode = "photo" | "video" | "audio" | "art";

// Map the canonical (creation-first) flavor order to this surface's DropType
// labels, so the Drop tabs match the Drop Console and every other surface.
const MODE_BY_FLAVOR: Record<DropFlavorKey, DropType> = {
  media: "Media",
  thought: "Thought",
  pay: "Pay",
  youtube: "YouTube",
  music: "Music",
  news: "News",
  link: "Link",
  doc: "Doc",
};
const MODE_ORDER: DropType[] = DROP_FLAVOR_ORDER.map((k) => MODE_BY_FLAVOR[k]);

function displayDropType(type: DropType) {
  return type === "Media" ? "Vision" : type;
}

export type DropItem = {
  id: string;
  title: string;
  type: DropType;
  createdAt: number;

  url?: string;
  embedUrl?: string | null;
  hostLabel?: string;
  headline?: string;
  previewTitle?: string;
  previewDescription?: string;
  previewImage?: string;

  bucket?: string;
  storagePath?: string;
  fileName?: string;
  fileSize?: number;
  mime?: string;
  mediaKind?: MediaKind;

  priceCents?: number;
  description?: string;
  linkUrl?: string;
  payProvider?: PayProviderMode;
  paymentRequestType?: "direct" | "link";
  paymentLink?: string;
  mediaSource?: "upload" | "capture";
  badgeLabel?: string;
  recipientUserId?: string;
  recipientUsername?: string;
  recipientDisplayName?: string;
  recipientStripeAccountId?: string;
  customizations?: DropCustomization;
  visibility?: "public" | "private";
  thoughtFormat?: "text" | "voice" | "doodle";
  thoughtText?: string;
};

const STORAGE_KEY = "jab_board_drops_v2";
const DELETED_STORAGE_KEY = "jab_board_drops_deleted_v1";
const BUCKET_MEDIA = "board-media";
const BUCKET_DOCS = "board-docs";
const PROFILE_STORAGE_KEY = "jab_board_profile_v2";
const OPTIONS_STORAGE_KEY = "board.options.v1";

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

function scopedStorageKey(base: string, userId: string | null) {
  return userId ? `${base}:${userId}` : null;
}

function safeId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function flash(setter: (v: string | null) => void, text: string, ms = 1600) {
  setter(text);
  window.setTimeout(() => setter(null), ms);
}

function readLocalDropAvatar() {
  if (typeof window === "undefined") {
    return { avatarSrc: "", glowColor: "#FF4FD8", auraIntensity: 72 };
  }

  try {
    const profileRaw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    const optionsRaw = window.localStorage.getItem(OPTIONS_STORAGE_KEY);
    const profile = profileRaw ? JSON.parse(profileRaw) : null;
    const options = optionsRaw ? JSON.parse(optionsRaw) : null;
    const auraKey = typeof options?.auraColor === "string" ? options.auraColor : "";
    const glowColor =
      (auraKey && AURA_HEX[auraKey]) ||
      (typeof profile?.glowColor === "string" && profile.glowColor.trim()) ||
      "#FF4FD8";

    return {
      avatarSrc:
        (typeof profile?.avatarDataUrl === "string" && profile.avatarDataUrl.trim()) ||
        (typeof profile?.avatarUrl === "string" && profile.avatarUrl.trim()) ||
        "",
      glowColor,
      auraIntensity:
        typeof options?.auraIntensity === "number"
          ? Math.max(0, Math.min(100, options.auraIntensity))
          : 72,
    };
  } catch {
    return { avatarSrc: "", glowColor: "#FF4FD8", auraIntensity: 72 };
  }
}

function normalizeUrl(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim();
  if (!s) return null;

  try {
    return new URL(s).toString();
  } catch { }

  try {
    return new URL(`https://${s}`).toString();
  } catch {
    return null;
  }
}

function hostLabelFromUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const h = u.hostname.replace(/^www\./, "");
    return h.toUpperCase();
  } catch {
    return "LINK";
  }
}

function faviconUrl(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const d = u.hostname.replace(/^www\./, "");
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=64`;
  } catch {
    return null;
  }
}

function newsCoverUrl(rawUrl: string): string | null {
  const fallback = resolveLinkPreviewImage(rawUrl, null);
  if (fallback) return fallback;

  try {
    const u = new URL(rawUrl);
    const target = u.toString();
    return `https://image.thum.io/get/width/1200/crop/800/noanimate/${target}`;
  } catch {
    return null;
  }
}

function sanitizeFileName(name: string) {
  return name.replace(/[\/\\?%*:|"<>]/g, "-").slice(0, 140);
}

function formatPriceFromCents(cents?: number) {
  if (!cents || cents <= 0) return "";
  return `$${(cents / 100).toFixed(2)}`;
}

function parsePriceToCents(raw: string): number | null {
  const s = raw.trim().replace(/^\$/g, "");
  if (!s) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function toMediaKind(value: unknown): MediaKind | undefined {
  return value === "image" || value === "video" || value === "audio" ? value : undefined;
}

function isAudioFile(file: File) {
  return (
    file.type.startsWith("audio/") ||
    /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name)
  );
}

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

function thoughtFormatFromFile(file: File | null): DropItem["thoughtFormat"] {
  if (!file) return "text";
  if (isAudioFile(file)) return "voice";
  if (isImageFile(file)) return "doodle";
  return "text";
}

function readDeletedDropIds(userId: string | null) {
  const key = scopedStorageKey(DELETED_STORAGE_KEY, userId);
  if (!key) return [];

  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function rememberDeletedDropId(id: string, userId: string | null) {
  const key = scopedStorageKey(DELETED_STORAGE_KEY, userId);
  if (!key) return;

  const ids = readDeletedDropIds(userId);
  const next = Array.from(new Set([id, ...ids])).slice(0, 500);
  localStorage.setItem(key, JSON.stringify(next));
  window.dispatchEvent(new StorageEvent("storage", { key }));
}

function youtubeIdFromUrl(u: URL): string | null {
  const host = u.hostname.toLowerCase();

  if (host.includes("youtu.be")) {
    const id = u.pathname.replace("/", "").trim();
    return id || null;
  }

  const v = u.searchParams.get("v");
  if (v) return v;

  const parts = u.pathname.split("/").filter(Boolean);
  if (parts[0] === "shorts" && parts[1]) return parts[1];
  if (parts[0] === "embed" && parts[1]) return parts[1];

  return null;
}

function toYouTubeEmbed(rawUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  const id = youtubeIdFromUrl(u);
  if (!id) return null;
  return `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1`;
}

function toSpotifyEmbed(rawUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!u.hostname.toLowerCase().includes("spotify.com")) return null;

  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  const type = parts[0];
  const id = parts[1];
  const allowed = new Set(["track", "album", "playlist", "artist", "episode", "show"]);
  if (!allowed.has(type) || !id) return null;

  return `https://open.spotify.com/embed/${type}/${id}`;
}

function toSoundCloudEmbed(rawUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!u.hostname.toLowerCase().includes("soundcloud.com")) return null;

  const encoded = encodeURIComponent(u.toString());
  return `https://w.soundcloud.com/player/?url=${encoded}&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&visual=true`;
}

function toAppleMusicEmbed(rawUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }

  const host = u.hostname.toLowerCase();
  if (host === "embed.music.apple.com") return u.toString();
  if (host !== "music.apple.com") return null;

  const parts = u.pathname.split("/").filter(Boolean);
  if (parts[0] === "embed") return `https://embed.music.apple.com/${parts.slice(1).join("/")}${u.search}`;
  if (parts.length < 3) return null;

  return `https://embed.music.apple.com${u.pathname}${u.search}`;
}

function makeEmbedByMode(
  mode: DropType,
  rawUrl: string
): { embedUrl: string | null; hostLabel: string } {
  const hostLabel = hostLabelFromUrl(rawUrl);

  if (mode === "YouTube") return { embedUrl: toYouTubeEmbed(rawUrl), hostLabel: "YOUTUBE" };

  if (mode === "Music") {
    const s = toSpotifyEmbed(rawUrl);
    if (s) return { embedUrl: s, hostLabel: "SPOTIFY" };
    const sc = toSoundCloudEmbed(rawUrl);
    if (sc) return { embedUrl: sc, hostLabel: "SOUNDCLOUD" };
    const am = toAppleMusicEmbed(rawUrl);
    if (am) return { embedUrl: am, hostLabel: "APPLE MUSIC" };
    const yt = toYouTubeEmbed(rawUrl);
    if (yt) return { embedUrl: yt, hostLabel: "YOUTUBE" };
    return { embedUrl: null, hostLabel };
  }

  if (mode === "News") return { embedUrl: null, hostLabel };
  if (mode === "Link") return { embedUrl: null, hostLabel };

  return { embedUrl: null, hostLabel };
}

type EmbedKind =
  | "spotify_track"
  | "spotify_large"
  | "soundcloud"
  | "apple_music_track"
  | "apple_music_album"
  | "youtube"
  | "generic";

function embedKindFromUrl(embedUrl: string): EmbedKind {
  try {
    const u = new URL(embedUrl);
    const host = u.hostname.toLowerCase();

    if (host.includes("open.spotify.com")) {
      const parts = u.pathname.split("/").filter(Boolean);
      const type = parts[1];
      if (type === "track" || type === "episode") return "spotify_track";
      return "spotify_large";
    }

    if (host.includes("w.soundcloud.com")) return "soundcloud";
    if (host.includes("embed.music.apple.com")) {
      return u.searchParams.has("i") || u.pathname.includes("/song/")
        ? "apple_music_track"
        : "apple_music_album";
    }
    if (host.includes("youtube.com")) return "youtube";
    return "generic";
  } catch {
    return "generic";
  }
}

function emitNewActivity(payload: any) {
  try {
    window.dispatchEvent(new CustomEvent("board:activity:new", { detail: payload }));
  } catch {
    // no-op
  }
}

function normalizeDropItems(input: unknown, userId: string | null): DropItem[] {
  if (!Array.isArray(input)) return [];

  const deletedIds = readDeletedDropIds(userId);
  return dedupeDropItems(input
    .filter((x) => x && typeof x === "object")
    .map((x: any): DropItem => ({
      id: String(x.id ?? safeId()),
      title: String(x.title ?? "Untitled"),
      type: (x.type as DropType) ?? "Link",
      createdAt: Number(x.createdAt ?? Date.now()),
      url: typeof x.url === "string" ? x.url : undefined,
      embedUrl: typeof x.embedUrl === "string" ? x.embedUrl : null,
      hostLabel: typeof x.hostLabel === "string" ? x.hostLabel : undefined,
      headline: typeof x.headline === "string" ? x.headline : undefined,
      previewTitle: typeof x.previewTitle === "string" ? x.previewTitle : undefined,
      previewDescription:
        typeof x.previewDescription === "string" ? x.previewDescription : undefined,
      previewImage: typeof x.previewImage === "string" ? x.previewImage : undefined,
      bucket: typeof x.bucket === "string" ? x.bucket : undefined,
      storagePath: typeof x.storagePath === "string" ? x.storagePath : undefined,
      fileName: typeof x.fileName === "string" ? x.fileName : undefined,
      fileSize: typeof x.fileSize === "number" ? x.fileSize : undefined,
      mime: typeof x.mime === "string" ? x.mime : undefined,
      mediaKind: toMediaKind(x.mediaKind),
      priceCents: typeof x.priceCents === "number" ? x.priceCents : undefined,
      description: typeof x.description === "string" ? x.description : undefined,
      linkUrl: typeof x.linkUrl === "string" ? x.linkUrl : undefined,
      payProvider:
        x.payProvider === "payment_link"
          ? "payment_link"
          : x.payProvider === "stripe_connect" ||
              x.payProvider === "authorize_net_accept_hosted"
            ? "stripe_connect"
            : undefined,
      paymentRequestType:
        x.paymentRequestType === "direct" || x.paymentRequestType === "link"
          ? x.paymentRequestType
          : undefined,
      paymentLink: typeof x.paymentLink === "string" ? x.paymentLink : undefined,
      mediaSource:
        x.mediaSource === "capture" || x.mediaSource === "upload"
          ? x.mediaSource
          : undefined,
      badgeLabel: typeof x.badgeLabel === "string" ? x.badgeLabel : undefined,
      recipientUserId:
        typeof x.recipientUserId === "string" && x.recipientUserId.trim()
          ? x.recipientUserId.trim()
          : undefined,
      recipientUsername:
        typeof x.recipientUsername === "string" && x.recipientUsername.trim()
          ? x.recipientUsername.trim().toLowerCase()
          : undefined,
      recipientDisplayName:
        typeof x.recipientDisplayName === "string" && x.recipientDisplayName.trim()
          ? x.recipientDisplayName.trim()
          : undefined,
      recipientStripeAccountId:
        typeof x.recipientStripeAccountId === "string" && x.recipientStripeAccountId.trim()
          ? x.recipientStripeAccountId.trim()
          : undefined,
      customizations: normalizeDropCustomizations(x.customizations),
      visibility:
        x.visibility === "private" || x.visibility === "public"
          ? x.visibility
          : undefined,
      thoughtFormat:
        x.thoughtFormat === "text" || x.thoughtFormat === "voice" || x.thoughtFormat === "doodle"
          ? x.thoughtFormat
          : undefined,
      thoughtText: typeof x.thoughtText === "string" ? x.thoughtText : undefined,
    }))
    .filter((d) => d.id && d.title && !deletedIds.includes(d.id)));
}

function dropDedupeKey(drop: DropItem) {
  const title = drop.title.trim().toLowerCase();
  const url = drop.url || drop.linkUrl || "";
  const storage = drop.bucket && drop.storagePath ? `${drop.bucket}:${drop.storagePath}` : "";
  const typedTitle = title ? `${drop.type}:${title}` : "";
  return typedTitle || url || storage || drop.id;
}

function dropCompletenessScore(drop: DropItem) {
  return (
    (drop.bucket && drop.storagePath ? 4 : 0) +
    (drop.previewImage ? 3 : 0) +
    (drop.embedUrl ? 2 : 0) +
    (drop.url || drop.linkUrl ? 1 : 0)
  );
}

function dedupeDropItems(items: DropItem[]) {
  const map = new Map<string, DropItem>();

  for (const item of items) {
    const key = dropDedupeKey(item);
    const previous = map.get(key);
    if (!previous) {
      map.set(key, item);
      continue;
    }

    const previousScore = dropCompletenessScore(previous);
    const nextScore = dropCompletenessScore(item);
    if (nextScore > previousScore || item.createdAt > previous.createdAt) {
      map.set(key, item);
    }
  }

  return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
}

function readBestLocalDropItems() {
  if (typeof window === "undefined") return [];
  const map = new Map<string, DropItem>();

  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key || (key !== STORAGE_KEY && !key.startsWith(`${STORAGE_KEY}:`))) continue;
    try {
      const raw = window.localStorage.getItem(key);
      const items = normalizeDropItems(raw ? JSON.parse(raw) : [], null);
      for (const item of items) {
        if (!map.has(item.id)) map.set(item.id, item);
      }
    } catch {
      // ignore bad local drop cache
    }
  }

  return dedupeDropItems(Array.from(map.values()));
}

export default function DropTile() {
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [avatarSrc, setAvatarSrc] = useState("");
  const [avatarGlow, setAvatarGlow] = useState("#FF4FD8");
  const [avatarAuraIntensity, setAvatarAuraIntensity] = useState(72);
  const [mode, setMode] = useState<DropType>("Media");
  const [title, setTitle] = useState("");
  const [dropDesc, setDropDesc] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [payPrice, setPayPrice] = useState("");
  const [payDesc, setPayDesc] = useState("");
  const [payLink, setPayLink] = useState("");
  const [payProvider, setPayProvider] = useState<PayProviderMode>("stripe_connect");
  const [docDesc, setDocDesc] = useState("");
  const [thoughtText, setThoughtText] = useState("");
  const [thoughtVisibility, setThoughtVisibility] = useState<"public" | "private">("public");
  const [drops, setDrops] = useState<DropItem[]>([]);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [commentsDropId, setCommentsDropId] = useState<string | null>(null);
  const [commentCountByDrop, setCommentCountByDrop] = useState<Record<string, number>>({});
  const [payCheckoutBusyId, setPayCheckoutBusyId] = useState<string | null>(null);
  const [mediaSource, setMediaSource] = useState<"upload" | "capture" | null>(null);
  const [selectedMediaPreview, setSelectedMediaPreview] = useState("");
  const [dropCustomizations, setDropCustomizations] = useState<DropCustomization>({});
  const [studioMode, setStudioMode] = useState<StudioCaptureMode | null>(null);
  const [studioInitialFile, setStudioInitialFile] = useState<File | null>(null);

  const signedUrlRef = useRef<Record<string, string>>({});
  const [signedUrlByKey, setSignedUrlByKey] = useState<Record<string, string>>({});
  // Tracks link/news drops we've already tried to back-fill a thumbnail for,
  // so the hydration effect never re-fetches the same drop in a loop.
  const previewHydrationRef = useRef<Set<string>>(new Set());

  const studioAllowedModes = useMemo<StudioCaptureMode[]>(
    // Thought Drops are voice + art thoughts (no camera). Vision Drops own the
    // camera features (Vision/Video) plus Art.
    () => (mode === "Thought" ? ["audio", "art"] : ["photo", "video", "art"]),
    [mode]
  );

  function openStudio(nextMode: StudioCaptureMode, initial: File | null = null) {
    setStudioInitialFile(initial);
    setStudioMode(nextMode);
  }

  function closeStudio() {
    setStudioMode(null);
    setStudioInitialFile(null);
  }

  useEffect(() => {
    if (!file || (mode !== "Media" && mode !== "Pay" && mode !== "Thought")) {
      setSelectedMediaPreview("");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setSelectedMediaPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file, mode]);

  useEffect(() => {
    const syncCommentCounts = () => {
      const next: Record<string, number> = {};
      for (const drop of drops) next[drop.id] = getDropCommentCount(drop.id);
      setCommentCountByDrop(next);
    };

    syncCommentCounts();
    window.addEventListener(DROP_COMMENTS_UPDATED_EVENT, syncCommentCounts as EventListener);
    window.addEventListener("storage", syncCommentCounts as EventListener);
    return () => {
      window.removeEventListener(DROP_COMMENTS_UPDATED_EVENT, syncCommentCounts as EventListener);
      window.removeEventListener("storage", syncCommentCounts as EventListener);
    };
  }, [drops]);

  useEffect(() => {
    const localAvatar = readLocalDropAvatar();
    setAvatarSrc(localAvatar.avatarSrc);
    setAvatarGlow(localAvatar.glowColor);
    setAvatarAuraIntensity(localAvatar.auraIntensity);

    let cancelled = false;

    async function loadAuthUser() {
      const supabase = supabaseBrowser();
      const { data } = await supabase.auth.getUser();
      const nextUserId = data.user?.id ?? null;
      if (!cancelled) setUserId(nextUserId);
      if (!nextUserId) {
        if (!cancelled) {
          setUsername(null);
          setDisplayName(null);
        }
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("username, display_name, avatar_url, avatar_path, board_style")
        .eq("id", nextUserId)
        .maybeSingle();
      if (!cancelled) {
        setUsername(String(profile?.username || "").toLowerCase() || null);
        setDisplayName(String(profile?.display_name || "").trim() || null);

        const boardStyle =
          profile?.board_style && typeof profile.board_style === "object"
            ? (profile.board_style as Record<string, any>)
            : {};
        setStripeAccountId(
          typeof boardStyle.stripeAccountId === "string" && boardStyle.stripeAccountId.trim()
            ? boardStyle.stripeAccountId.trim()
            : null
        );
        const avatarPath =
          typeof profile?.avatar_path === "string" && profile.avatar_path.trim()
            ? profile.avatar_path.trim()
            : typeof boardStyle.avatarPath === "string" && boardStyle.avatarPath.trim()
              ? boardStyle.avatarPath.trim()
              : "";
        let signedAvatar = "";

        if (avatarPath) {
          const { data: signed } = await supabase.storage
            .from("board-avatars")
            .createSignedUrl(avatarPath, 60 * 45);
          signedAvatar = signed?.signedUrl || "";
        }

        if (!cancelled) {
          setAvatarSrc(
            signedAvatar ||
              (typeof boardStyle.avatarDataUrl === "string" && boardStyle.avatarDataUrl.trim()) ||
              (typeof profile?.avatar_url === "string" && profile.avatar_url.trim()) ||
              localAvatar.avatarSrc
          );
          setAvatarGlow(
            (typeof boardStyle.auraColor === "string" && AURA_HEX[boardStyle.auraColor]) ||
              (typeof boardStyle.glowColor === "string" && boardStyle.glowColor.trim()) ||
              localAvatar.glowColor
          );
          setAvatarAuraIntensity(
            typeof boardStyle.auraIntensity === "number"
              ? Math.max(0, Math.min(100, boardStyle.auraIntensity))
              : localAvatar.auraIntensity
          );
        }
      }
    }

    void loadAuthUser();

    const supabase = supabaseBrowser();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
      setUsername(null);
      setDisplayName(null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    return () => {
      signedUrlRef.current = {};
      setSignedUrlByKey({});
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setDrops(readBestLocalDropItems());
      return;
    }

    let cancelled = false;

    function applyLocalDrops() {
      const key = scopedStorageKey(STORAGE_KEY, userId);
      const scopedRaw = key ? localStorage.getItem(key) : null;
      const raw =
        scopedRaw ||
        (username === "johnandy" ? localStorage.getItem(STORAGE_KEY) : null);
      if (!raw) return false;

      const parsed = JSON.parse(raw);
      const safe = normalizeDropItems(parsed, userId);
      if (!safe.length) return false;

      setDrops(safe);
      return true;
    }

    async function applyRemoteDrops() {
      try {
        const supabase = supabaseBrowser();
        const { data: profile } = await supabase
          .from("profiles")
          .select("board_style")
          .eq("id", userId)
          .maybeSingle();

        const boardStyle =
          profile?.board_style && typeof profile.board_style === "object"
            ? (profile.board_style as any)
            : null;
        const remoteDrops = normalizeDropItems(boardStyle?.boardDrops, userId);
        if (!remoteDrops.length || cancelled) return;

        setDrops(remoteDrops);
        const key = scopedStorageKey(STORAGE_KEY, userId);
        if (key) localStorage.setItem(key, JSON.stringify(remoteDrops));
      } catch {
        // keep local drops
      }
    }

    try {
      applyLocalDrops();
      void applyRemoteDrops();
    } catch {
      // ignore bad localStorage data
    }

    return () => {
      cancelled = true;
    };
  }, [userId, username]);

  async function syncDropsToSupabase(next: DropItem[]) {
    try {
      const sess = await requireSession();
      if (!sess) return;

      const { supabase, userId } = sess;
      const { data: profile } = await supabase
        .from("profiles")
        .select("board_style")
        .eq("id", userId)
        .maybeSingle();

      const currentStyle =
        profile?.board_style && typeof profile.board_style === "object"
          ? profile.board_style
          : {};

      await supabase
        .from("profiles")
        .upsert({
          id: userId,
          board_style: {
            ...currentStyle,
            boardDrops: next,
            boardDropsDeleted: readDeletedDropIds(userId),
          },
        }, { onConflict: "id" });
    } catch {
      // Keep local drop tile state if profile sync fails.
    }
  }

  async function syncBoardDropActivity(item: DropItem) {
    try {
      if (item.type === "Thought" && item.visibility === "private") {
        const localActivity: BoardActivity = {
          id: `private_thought_${item.id}`,
          created_at: new Date(item.createdAt || Date.now()).toISOString(),
          user_id: userId,
          kind: "board_drop",
          title: item.title || "Thought Drop",
          body: item.thoughtText || item.description || "Private thought saved to Board.",
          href: null,
          image_url: null,
          meta: {
            source: "board_drop_tile",
            dropId: item.id,
            dropType: "thought",
            drop_flavor: "thought",
            visibility: "private",
            thoughtText: item.thoughtText || null,
            thoughtFormat: item.thoughtFormat || "text",
            description: item.description || null,
            authorUsername: username ?? null,
            authorName: displayName ?? username ?? null,
            authorAvatar: avatarSrc || null,
            authorGlow: avatarGlow,
            authorAuraIntensity: avatarAuraIntensity,
            mediaKind: item.mediaKind ?? null,
            storagePath: item.storagePath ?? null,
            bucket: item.bucket ?? null,
            fileName: item.fileName ?? null,
          },
        };
        appendLocalActivity(localActivity);
        window.dispatchEvent(new StorageEvent("storage", { key: "jab_board_activity_v1" }));
        emitBoardDropSignal({
          type: "thought_drop_created",
          dropId: item.id,
          userId,
          title: item.title || "Thought Drop",
          meta: { visibility: "private", source: "board_drop_tile" },
        });
        return;
      }

      const sess = await requireSession();
      if (!sess) return;

      const imageUrl =
        item.type === "Media" && item.mediaKind === "image" && item.bucket && item.storagePath
          ? await getSignedUrl(item.bucket, item.storagePath)
        : item.type === "Thought" && item.mediaKind === "image" && item.bucket && item.storagePath
          ? await getSignedUrl(item.bucket, item.storagePath)
        : item.type === "Pay" && item.bucket && item.storagePath
          ? await getSignedUrl(item.bucket, item.storagePath)
          : item.type === "Link" || item.type === "News"
            ? item.previewImage ?? null
          : null;

      const href =
        item.type === "Pay"
          ? item.linkUrl ?? null
          : item.type === "Doc" || item.type === "Media" || item.type === "Thought"
            ? item.url ?? null
            : item.url ?? null;

      const body =
        item.type === "Thought"
          ? item.thoughtText?.trim() || item.description?.trim() || "A thought landed on Board."
          : item.description?.trim() ||
        (item.type === "Pay" && item.priceCents
          ? `Pay Drop live for ${formatPriceFromCents(item.priceCents)}.`
          : item.type === "Doc"
            ? "New document drop added to Board."
            : item.type === "Media"
              ? "New media drop added to Board."
              : `New ${item.type.toLowerCase()} drop added to Board.`);

      const result = await createActivity(sess.supabase, {
        user_id: sess.userId,
        kind: "board_drop",
        title: item.title,
        body,
        href,
        image_url: imageUrl,
        meta: {
          source: "board_drop_tile",
          dropId: item.id,
          dropType: item.type,
          authorUsername: username ?? null,
          authorName: displayName ?? username ?? null,
          authorAvatar: avatarSrc || null,
          authorGlow: avatarGlow,
          authorAuraIntensity: avatarAuraIntensity,
          hostLabel: item.hostLabel ?? null,
          embedUrl: item.embedUrl ?? null,
          previewTitle: item.previewTitle ?? null,
          previewDescription: item.previewDescription ?? null,
          previewImage: item.previewImage ?? null,
          description: item.description ?? null,
          visibility: item.type === "Thought" ? item.visibility ?? "public" : "public",
          thoughtText: item.type === "Thought" ? item.thoughtText ?? body : null,
          thoughtFormat: item.type === "Thought" ? item.thoughtFormat ?? "text" : null,
          priceCents: item.priceCents ?? null,
          payProvider: item.payProvider ?? null,
          paymentRequestType: item.paymentRequestType ?? null,
          paymentLink: item.paymentLink ?? item.linkUrl ?? null,
          recipientUserId: item.recipientUserId ?? sess.userId,
          recipientUsername: item.recipientUsername ?? username ?? null,
          recipientDisplayName: item.recipientDisplayName ?? displayName ?? username ?? null,
          recipientStripeAccountId: item.recipientStripeAccountId ?? stripeAccountId ?? null,
          mediaKind: item.mediaKind ?? null,
          mediaSource: item.mediaSource ?? null,
          badgeLabel: item.badgeLabel ?? null,
          storagePath: item.storagePath ?? null,
          bucket: item.bucket ?? null,
          fileName: item.fileName ?? null,
          customizations: item.customizations ?? null,
        },
      });

      if (item.type === "Thought" && (item.visibility ?? "public") === "public") {
        pushDrop({
          id: item.id,
          type: "thought",
          title: item.title || "Thought Drop",
          createdAt: item.createdAt,
          description: item.description,
          visibility: "public",
          thoughtFormat: item.thoughtFormat || "text",
          thoughtText: item.thoughtText || body,
          mediaUrl: item.url,
          mediaKind: item.mediaKind === "audio" ? "audio" : item.mediaKind === "image" ? "image" : undefined,
          authorId: sess.userId,
          authorName: displayName ?? username ?? "Board User",
          authorUsername: username ?? undefined,
          authorAvatar: avatarSrc || undefined,
          authorGlow: avatarGlow,
          authorAuraIntensity: avatarAuraIntensity,
          source: "board_drop_tile",
          origin: "profile_board",
          meta: {
            activityId: result.activity.id,
            bucket: item.bucket ?? null,
            storagePath: item.storagePath ?? null,
            fileName: item.fileName ?? null,
          },
        });
        emitBoardDropSignal({
          type: "thought_drop_created",
          dropId: item.id,
          userId: sess.userId,
          title: item.title || "Thought Drop",
          meta: { visibility: "public", source: "board_drop_tile" },
        });
      }

      emitNewActivity(result.activity);
    } catch {
      // keep local drop state even if activity sync fails
    }
  }

  function persist(next: DropItem[]) {
    const cleaned = dedupeDropItems(next);
    setDrops(cleaned);
    try {
      const key = scopedStorageKey(STORAGE_KEY, userId);
      if (key) localStorage.setItem(key, JSON.stringify(cleaned));
    } catch { }
    void syncDropsToSupabase(cleaned);
  }

  const hint = useMemo(() => {
    if (mode === "Media") return "Upload a photo or video. It becomes a Vision Drop instantly.";
    if (mode === "Pay") return "Show what you're raising support for, set a price, and let supporters pay you on Board via Stripe (or add your own external payment link).";
    if (mode === "Thought") return "Catch a quick idea. Add text, a voice memo, or a doodle/image.";
    if (mode === "Doc") {
      return "Upload a script/resume/essay (PDF/DOC). Big files later via resumable upload.";
    }
    if (mode === "YouTube") return "Paste a YouTube link. It embeds instantly.";
    if (mode === "Music") return "Upload an audio file for full in-Board playback, or paste Spotify, Apple Music, SoundCloud, or YouTube.";
    if (mode === "News") return "Paste a news/article link. It becomes a magazine cover card.";
    return "Paste any link. It becomes a clean drop card.";
  }, [mode]);

  async function requireSession() {
    const supabase = supabaseBrowser();
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user?.id) return null;
    return { supabase, userId: data.session.user.id };
  }

  async function getSignedUrl(bucket: string, path: string, expiresIn = 60 * 30) {
    const key = `${bucket}:${path}`;
    if (signedUrlRef.current[key]) return signedUrlRef.current[key];

    const supabase = supabaseBrowser();
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);

    if (error || !data?.signedUrl) return null;

    signedUrlRef.current[key] = data.signedUrl;
    setSignedUrlByKey((p) => ({ ...p, [key]: data.signedUrl }));
    return data.signedUrl;
  }

  async function addLinkDrop() {
    const normalized = normalizeUrl(url);
    if (!normalized) return flash(setMsg, "Paste a valid link.", 1600);

    const t = title.trim() || "Untitled";
    const { embedUrl, hostLabel } = makeEmbedByMode(mode, normalized);

    if ((mode === "YouTube" || mode === "Music") && !embedUrl) {
      return flash(setMsg, "That link can’t be embedded. Try a different URL format.", 2000);
    }

    const preview =
      mode === "Link" || mode === "News"
        ? await fetchLinkPreview(normalized).catch(() => null)
        : null;

    const next: DropItem[] = [
      {
        id: safeId(),
        title: t,
        type:
          mode === "YouTube"
            ? "YouTube"
            : mode === "Music"
              ? "Music"
              : mode === "News"
                ? "News"
                : "Link",
        url: normalized,
        embedUrl: embedUrl ?? null,
        hostLabel,
        headline: mode === "News" ? preview?.title ?? t : undefined,
        previewTitle: preview?.title ?? undefined,
        previewDescription: preview?.description ?? undefined,
        previewImage: resolveLinkPreviewImage(normalized, preview?.image) ?? undefined,
        description: dropDesc.trim() || undefined,
        createdAt: Date.now(),
      },
      ...drops,
    ];

    persist(next);
    void syncBoardDropActivity(next[0]);
    setTitle("");
    setDropDesc("");
    setUrl("");
    flash(setMsg, "Added ✓", 1200);
  }

  async function uploadFileToStorage(opts: {
    bucket: string;
    file: File;
    dropId: string;
  }): Promise<{ bucket: string; storagePath: string } | null> {
    const sess = await requireSession();
    if (!sess) {
      flash(setMsg, "You must be logged in to upload.", 2000);
      return null;
    }

    const { supabase, userId } = sess;
    const sizeMb = opts.file.size / (1024 * 1024);

    if (sizeMb > 800) {
      flash(setMsg, "Huge file. Browser uploads may fail. Resumable upload is next.", 3200);
    }

    const cleanName = sanitizeFileName(opts.file.name);
    const storagePath = `${userId}/${opts.dropId}/${Date.now()}-${cleanName}`;

    const { error } = await supabase.storage.from(opts.bucket).upload(storagePath, opts.file, {
      upsert: true,
      contentType: opts.file.type || "application/octet-stream",
      cacheControl: "3600",
    });

    if (error) {
      console.error("Storage upload error:", error);
      flash(setMsg, `Upload failed: ${error.message}`, 2600);
      return null;
    }

    return { bucket: opts.bucket, storagePath };
  }

  async function addMediaDrop() {
    if (!file) return flash(setMsg, "Choose a photo or video first.", 1600);

    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) return flash(setMsg, "Unsupported file type. Use image/video.", 2000);

    const t = title.trim() || "Untitled";
    const id = safeId();

    const up = await uploadFileToStorage({ bucket: BUCKET_MEDIA, file, dropId: id });
    if (!up) return;
    const customizations = compactDropCustomizations(dropCustomizations);

    const next: DropItem[] = [
      {
        id,
        title: t,
        type: "Media",
        createdAt: Date.now(),
        bucket: up.bucket,
        storagePath: up.storagePath,
        fileName: file.name,
        fileSize: file.size,
        mime: file.type,
        mediaKind: isVideo ? "video" : "image",
        description: dropDesc.trim() || undefined,
        mediaSource: mediaSource ?? "upload",
        badgeLabel: mediaSource === "capture" ? "Captured on Board" : undefined,
        ...(customizations ? { customizations } : {}),
      },
      ...drops,
    ];

    persist(next);
    void syncBoardDropActivity(next[0]);
    setTitle("");
    setDropDesc("");
    setFile(null);
    setMediaSource(null);
    setDropCustomizations({});
    flash(setMsg, "Vision Drop added ✓", 1400);
  }

  async function addMusicFileDrop() {
    if (!file) return flash(setMsg, "Choose an audio file first, or paste a music link.", 1800);

    const isAudio =
      file.type.startsWith("audio/") ||
      /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name);
    if (!isAudio) return flash(setMsg, "Music file must be audio: MP3, M4A, WAV, AAC, OGG, or FLAC.", 2400);

    const t = title.trim() || file.name.replace(/\.[^.]+$/, "") || "Untitled";
    const id = safeId();

    const up = await uploadFileToStorage({ bucket: BUCKET_MEDIA, file, dropId: id });
    if (!up) return;

    const next: DropItem[] = [
      {
        id,
        title: t,
        type: "Music",
        createdAt: Date.now(),
        bucket: up.bucket,
        storagePath: up.storagePath,
        fileName: file.name,
        fileSize: file.size,
        mime: file.type || "audio/mpeg",
        mediaKind: "audio",
        hostLabel: "AUDIO FILE",
        description: dropDesc.trim() || undefined,
      },
      ...drops,
    ];

    persist(next);
    void syncBoardDropActivity(next[0]);
    setTitle("");
    setDropDesc("");
    setFile(null);
    setUrl("");
    flash(setMsg, "Music file added ✓", 1400);
  }

  async function addDocDrop() {
    if (!file) return flash(setMsg, "Choose a document first.", 1600);

    const t = title.trim() || "Untitled";
    const id = safeId();

    const up = await uploadFileToStorage({ bucket: BUCKET_DOCS, file, dropId: id });
    if (!up) return;

    const next: DropItem[] = [
      {
        id,
        title: t,
        type: "Doc",
        createdAt: Date.now(),
        bucket: up.bucket,
        storagePath: up.storagePath,
        fileName: file.name,
        fileSize: file.size,
        mime: file.type,
        description: docDesc.trim() || undefined,
      },
      ...drops,
    ];

    persist(next);
    void syncBoardDropActivity(next[0]);
    setTitle("");
    setFile(null);
    setDocDesc("");
    flash(setMsg, "Doc added ✓", 1400);
  }

  async function addThoughtDrop() {
    const cleanThought = thoughtText.trim();
    const cleanDesc = dropDesc.trim();
    const cleanTitle = title.trim();

    if (!cleanThought && !cleanDesc && !cleanTitle && !file) {
      return flash(setMsg, "Add a thought or attach a voice memo/doodle.", 1800);
    }

    const thoughtFormat = thoughtFormatFromFile(file);
    if (file && !isAudioFile(file) && !isImageFile(file)) {
      return flash(setMsg, "Thought attachments can be audio or image.", 2000);
    }

    const id = safeId();
    let uploaded: { bucket: string; storagePath: string } | null = null;

    if (file) {
      uploaded = await uploadFileToStorage({ bucket: BUCKET_MEDIA, file, dropId: id });
      if (!uploaded) return;
    }

    const next: DropItem[] = [
      {
        id,
        title: cleanTitle || "Thought Drop",
        type: "Thought",
        createdAt: Date.now(),
        ...(uploaded
          ? {
              bucket: uploaded.bucket,
              storagePath: uploaded.storagePath,
              fileName: file?.name,
              fileSize: file?.size,
              mime: file?.type,
              mediaKind: file && isAudioFile(file) ? "audio" : "image",
              mediaSource: mediaSource ?? "upload",
              badgeLabel: mediaSource === "capture" ? "Captured on Board" : undefined,
            }
          : {}),
        description: cleanDesc || undefined,
        visibility: thoughtVisibility,
        thoughtFormat,
        thoughtText: cleanThought || undefined,
      },
      ...drops,
    ];

    persist(next);
    void syncBoardDropActivity(next[0]);
    setTitle("");
    setDropDesc("");
    setThoughtText("");
    setThoughtVisibility("public");
    setFile(null);
    setMediaSource(null);
    flash(setMsg, thoughtVisibility === "private" ? "Private thought saved ✓" : "Thought dropped ✓", 1400);
  }

  async function addPayDrop() {
    if (!file) return flash(setMsg, "Upload or capture proof/context first.", 1600);
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) return flash(setMsg, "Pay Drop media must be an image or video.", 2000);

    const cents = parsePriceToCents(payPrice);
    if (cents === null) return flash(setMsg, "Enter a valid price (ex: 19.99).", 2000);
    if (cents <= 0) return flash(setMsg, "Price must be greater than 0.", 2000);

    const t = title.trim() || "Untitled";
    const id = safeId();

    const up = await uploadFileToStorage({ bucket: BUCKET_MEDIA, file, dropId: id });
    if (!up) return;

    const normalizedLinkUrl = payLink.trim() ? normalizeUrl(payLink) : null;
    if (payProvider === "payment_link" && payLink.trim() && !normalizedLinkUrl) {
      return flash(setMsg, "Checkout link looks invalid. Fix it or clear it.", 2200);
    }
    if (payProvider === "payment_link" && !normalizedLinkUrl) {
      return flash(setMsg, "Paste the checkout link for this Pay Drop.", 2200);
    }

    const recipientUserId = userId ?? undefined;
    const recipientUsername = username ?? undefined;
    const recipientDisplayName = displayName ?? username ?? undefined;
    const recipientStripeAccountId = stripeAccountId ?? undefined;
    const customizations = compactDropCustomizations(dropCustomizations);
    const next: DropItem[] = [
      {
        id,
        title: t,
        type: "Pay",
        createdAt: Date.now(),
        bucket: up.bucket,
        storagePath: up.storagePath,
        fileName: file.name,
        fileSize: file.size,
        mime: file.type,
        mediaKind: isVideo ? "video" : "image",
        priceCents: cents,
        description: payDesc.trim() || undefined,
        linkUrl: normalizedLinkUrl ?? undefined,
        payProvider,
        paymentRequestType: payProvider === "payment_link" ? "link" : "direct",
        paymentLink: normalizedLinkUrl ?? undefined,
        mediaSource: mediaSource ?? "upload",
        badgeLabel: mediaSource === "capture" ? "Captured on Board" : undefined,
        customizations,
        recipientUserId,
        recipientUsername,
        recipientDisplayName,
        recipientStripeAccountId,
      },
      ...drops,
    ];

    persist(next);
    void syncBoardDropActivity(next[0]);
    upsertPayDrop(
      {
        id,
        title: t,
        description: payDesc.trim() || undefined,
        amountCents: cents,
        recipientUserId,
        recipientUsername,
        recipientDisplayName,
        recipientStripeAccountId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        provider: payProvider,
        status:
          payProvider === "stripe_connect"
            ? "gateway_setup_required"
            : "active",
        checkoutMode:
          payProvider === "stripe_connect"
            ? "embedded_hosted"
            : "external_link",
        checkoutUrl: normalizedLinkUrl ?? undefined,
        gatewayLabel:
          payProvider === "stripe_connect"
            ? "Stripe"
            : "External Payment Link",
        bucket: up.bucket,
        storagePath: up.storagePath,
        mediaKind: isVideo ? "video" : "image",
        mediaSource: mediaSource ?? "upload",
      },
      userId
    );

    setTitle("");
    setFile(null);
    setPayPrice("");
    setPayDesc("");
    setPayLink("");
    setPayProvider("stripe_connect");
    setMediaSource(null);
    setDropCustomizations({});
    flash(setMsg, "Pay drop added ✓", 1400);
  }

  function addDrop() {
    if (mode === "Media") void addMediaDrop();
    else if (mode === "Music" && file) void addMusicFileDrop();
    else if (mode === "Doc") void addDocDrop();
    else if (mode === "Pay") void addPayDrop();
    else if (mode === "Thought") void addThoughtDrop();
    else addLinkDrop();
  }

  async function removeDrop(id: string) {
    const drop = drops.find((d) => d.id === id);

    if (drop?.bucket && drop.storagePath) {
      try {
        const sess = await requireSession();
        if (sess) {
          await sess.supabase.storage.from(drop.bucket).remove([drop.storagePath]);
        }
      } catch (e) {
        console.warn("Remove from storage failed (continuing):", e);
      }
    }

    if (viewerId === id) {
      setViewerOpen(false);
      setViewerId(null);
    }

    const next = drops.filter((d) => d.id !== id);
    rememberDeletedDropId(id, userId);
    persist(next);
    if (drop?.type === "Pay") removePayDrop(id, userId);
  }

  function openViewer(id: string) {
    setViewerId(id);
    setViewerOpen(true);
  }

  function closeViewer() {
    setViewerOpen(false);
    setViewerId(null);
  }

  async function openPayCheckout(drop: DropItem) {
    const explicitPaymentLink =
      drop.payProvider === "payment_link" && (drop.paymentLink || drop.linkUrl);

    if (explicitPaymentLink) {
      window.open(explicitPaymentLink, "_blank", "noopener,noreferrer");
      return;
    }

    const shouldUseHostedCheckout =
      drop.payProvider === "stripe_connect" ||
      (drop.type === "Pay" && !!drop.priceCents);

    if (!shouldUseHostedCheckout) {
      flash(setMsg, "This Pay Drop needs a checkout link.", 2200);
      return;
    }

    try {
      setPayCheckoutBusyId(drop.id);
      await openHostedPayDropCheckout({
        payDropId: drop.id,
        title: drop.title,
        description: drop.description,
        amountCents: drop.priceCents ?? 0,
        destinationAccountId: drop.recipientStripeAccountId ?? stripeAccountId ?? undefined,
        recipientUserId: drop.recipientUserId ?? userId ?? undefined,
        recipientUsername: drop.recipientUsername ?? username ?? undefined,
        recipientDisplayName: drop.recipientDisplayName ?? displayName ?? username ?? undefined,
      });
      flash(setMsg, "Opening secure checkout…", 1400);
    } catch (error) {
      flash(
        setMsg,
        error instanceof Error ? error.message : "Could not open Stripe checkout.",
        3600
      );
    } finally {
      setPayCheckoutBusyId(null);
    }
  }

  useEffect(() => {
    if (!viewerOpen) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeViewer();
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewerOpen]);

  const viewerDrop = useMemo(() => {
    if (!viewerOpen || !viewerId) return null;
    return drops.find((d) => d.id === viewerId) ?? null;
  }, [viewerOpen, viewerId, drops]);

  const viewerSignedKey =
    viewerDrop?.bucket && viewerDrop.storagePath ? `${viewerDrop.bucket}:${viewerDrop.storagePath}` : "";
  const viewerSignedUrl = viewerSignedKey ? signedUrlByKey[viewerSignedKey] : undefined;

  useEffect(() => {
    let cancelled = false;

    async function hydrateSignedUrls() {
      const fileDrops = drops.filter((d) => d.bucket && d.storagePath);

      for (const d of fileDrops) {
        if (!d.bucket || !d.storagePath) continue;
        const key = `${d.bucket}:${d.storagePath}`;
        if (signedUrlRef.current[key] || signedUrlByKey[key]) continue;

        const url = await getSignedUrl(d.bucket, d.storagePath, 60 * 45);
        if (cancelled) return;
        if (!url) continue;
      }
    }

    hydrateSignedUrls();
    return () => {
      cancelled = true;
    };
  }, [drops, signedUrlByKey]);

  // Back-fill thumbnails for link/news drops that were saved before the
  // preview pipeline could resolve an image (e.g. an Instagram link that
  // returned nothing on first post). Runs once per drop per session.
  useEffect(() => {
    const targets = drops.filter(
      (d) =>
        (d.type === "Link" || d.type === "News") &&
        !!d.url &&
        !d.previewImage &&
        !previewHydrationRef.current.has(d.id)
    );
    if (!targets.length) return;

    let cancelled = false;

    (async () => {
      const patches: Record<string, Partial<DropItem>> = {};

      for (const d of targets) {
        previewHydrationRef.current.add(d.id);
        const preview = await fetchLinkPreview(d.url!).catch(() => null);
        if (cancelled) return;

        const image = resolveLinkPreviewImage(d.url!, preview?.image ?? null);
        const patch: Partial<DropItem> = {};
        if (image) patch.previewImage = image;
        if (preview?.title) {
          patch.previewTitle = preview.title;
          if (d.type === "News") patch.headline = preview.title;
        }
        if (preview?.description) patch.previewDescription = preview.description;

        if (Object.keys(patch).length) patches[d.id] = patch;
      }

      if (cancelled || !Object.keys(patches).length) return;

      const next = drops.map((d) => (patches[d.id] ? { ...d, ...patches[d.id] } : d));
      persist(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [drops]);

  const showUrlField =
    mode === "YouTube" || mode === "News" || mode === "Link";

  const fileAccept =
    mode === "Media"
      ? "image/*,video/*"
      : mode === "Music"
        ? "audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac"
      : mode === "Pay"
        ? "image/*,video/*"
      : mode === "Thought"
        ? "image/*,audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac"
        : ".pdf,.doc,.docx,.txt,.rtf,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown";

  return (
    <div className="inner-tile drop-tile">
      <div className="tile-head drop-tile-head">
        <div>
          <div className="tile-title">Board Drop</div>
          <div className="tile-sub">Place media, pay, docs, and links into your space.</div>
          <div className="tile-sub tiny">
            Buckets: <b>{BUCKET_MEDIA}</b> + <b>{BUCKET_DOCS}</b>
          </div>
        </div>
        <div
          className="drop-avatar-frame"
          style={
            {
              "--drop-avatar-glow": avatarGlow,
              "--drop-avatar-power": String(Math.max(0.22, avatarAuraIntensity / 100)),
            } as CSSProperties
          }
          aria-label="Board Drop avatar"
        >
          <div className="drop-avatar-inner">
            {avatarSrc ? (
              <img
                src={avatarSrc}
                alt={displayName || username || "Board avatar"}
                className="drop-avatar-img"
                draggable={false}
              />
            ) : (
              <div className="drop-avatar-fallback" aria-hidden>
                {(displayName || username || "B").slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mode-row" role="tablist" aria-label="Drop type">
        {MODE_ORDER.map((m) => (
          <button
            key={m}
            type="button"
            className={`mode-btn ${mode === m ? "on" : ""}`}
            onClick={() => {
              setMode(m);
              setMsg(null);

              if (m === "Media" || m === "Doc" || m === "Pay" || m === "Thought") setUrl("");
              if (m === "YouTube" || m === "News" || m === "Link") setFile(null);
              if (m !== "Media") setDropCustomizations({});
              setMediaSource(null);
              setDropDesc("");
              if (m !== "Thought") {
                setThoughtText("");
                setThoughtVisibility("public");
              }

              if (m !== "Pay") {
                setPayPrice("");
                setPayDesc("");
                setPayLink("");
                setPayProvider("stripe_connect");
              }
              if (m !== "Doc") setDocDesc("");
            }}
          >
            {displayDropType(m)}
          </button>
        ))}
      </div>

      <div className="drop-form">
        <input
          className="drop-input"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        {mode === "Pay" ? (
          <>
            <div className="pay-provider-row">
              <button
                type="button"
                className={`provider-chip ${payProvider === "stripe_connect" ? "on" : ""}`}
                onClick={() => setPayProvider("stripe_connect")}
              >
                Pay on Board
              </button>
              <button
                type="button"
                className={`provider-chip ${payProvider === "payment_link" ? "on" : ""}`}
                onClick={() => setPayProvider("payment_link")}
              >
                Add Payment Link
              </button>
            </div>

            <div className="drop-file-control">
              <div className="capture-actions">
                <label className="capture-action upload-action">
                  Upload
                  <input
                    className="file-input"
                    type="file"
                    accept={fileAccept}
                    onChange={(e) => {
                      setFile(e.target.files?.[0] ?? null);
                      setMediaSource(e.target.files?.[0] ? "upload" : null);
                    }}
                  />
                </label>
                <button type="button" className="capture-action" onClick={() => openStudio("photo")}>
                  Capture
                </button>
              </div>
              <div className="file-meta file-status">
                {file ? (
                  <>
                    <span className="file-name">{file.name}</span>
                    <span className="file-size">{Math.round(file.size / 1024)} KB</span>
                  </>
                ) : (
                  <span className="file-name dim">Upload or capture request context.</span>
                )}
              </div>
              {selectedMediaPreview ? (
                <div className="selected-media-preview">
                  {file?.type.startsWith("video/") ? (
                    <video src={selectedMediaPreview} controls playsInline />
                  ) : (
                    <img src={selectedMediaPreview} alt="Pay Drop context preview" />
                  )}
                  {mediaSource === "capture" ? <span>Captured on Board</span> : null}
                </div>
              ) : null}
              <div className="capture-help">Show what this request is for in real time.</div>
            </div>

            <input
              className="drop-input"
              placeholder="Price (ex: 19.99)"
              value={payPrice}
              onChange={(e) => setPayPrice(e.target.value)}
              inputMode="decimal"
            />

            <textarea
              className="drop-textarea"
              placeholder="Description (optional)"
              value={payDesc}
              onChange={(e) => setPayDesc(e.target.value)}
              rows={3}
            />

            <input
              className="drop-input"
              placeholder={
                payProvider === "payment_link"
                  ? "Checkout link"
                  : "Optional fallback link"
              }
              value={payLink}
              onChange={(e) => setPayLink(e.target.value)}
            />

            {payProvider === "stripe_connect" ? (
              <div className="pay-gateway-note">
                Supporters check out securely on Stripe and funds land in your connected Stripe payout account. Connect Stripe once in Options → Banking to start receiving Pay Drops.
              </div>
            ) : null}
          </>
        ) : mode === "Doc" ? (
          <>
            <div className="drop-file-control">
              <label className="capture-action upload-action">
                Upload
                <input
                  className="file-input"
                  type="file"
                  accept={fileAccept}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <div className="file-meta file-status">
                {file ? (
                  <>
                    <span className="file-name">{file.name}</span>
                    <span className="file-size">{Math.round(file.size / 1024)} KB</span>
                  </>
                ) : (
                  <span className="file-name dim">Upload doc (PDF/DOC/TXT/MD)</span>
                )}
              </div>
            </div>

            <textarea
              className="drop-textarea"
              placeholder="Notes (optional) – logline, context, etc."
              value={docDesc}
              onChange={(e) => setDocDesc(e.target.value)}
              rows={3}
            />
          </>
        ) : mode === "Media" ? (
          <div className="media-capture-field">
            <button
              type="button"
              className="capture-action studio-open-cta"
              onClick={() => openStudio(file?.type.startsWith("video/") ? "video" : "photo", file)}
            >
              {file ? "Edit in Drop Studio" : "Open Drop Studio"}
            </button>

            {selectedMediaPreview ? (
              <button
                type="button"
                className="studio-launch-preview drop-studio-media-frame"
                onClick={() => openStudio(file?.type.startsWith("video/") ? "video" : "photo", file)}
                aria-label="Edit this Vision in Drop Studio"
              >
                {file?.type.startsWith("video/") ? (
                  <video src={selectedMediaPreview} muted playsInline />
                ) : (
                  <img src={selectedMediaPreview} alt="Vision drop preview" />
                )}
                <DropStudioOverlay customizations={dropCustomizations} />
              </button>
            ) : (
              <div className="capture-help">
                Capture or upload a Vision inside Drop Studio — Board's creation sheet.
              </div>
            )}

            <textarea
              className="drop-textarea"
              placeholder="Add context, credit, mood, or what this drop is about…"
              value={dropDesc}
              onChange={(e) => setDropDesc(e.target.value)}
              rows={3}
            />
          </div>
        ) : mode === "Thought" ? (
          <div className="thought-field">
            <div className="pay-provider-row">
              <button
                type="button"
                className={`provider-chip ${thoughtVisibility === "public" ? "on" : ""}`}
                onClick={() => setThoughtVisibility("public")}
              >
                Public
              </button>
              <button
                type="button"
                className={`provider-chip ${thoughtVisibility === "private" ? "on" : ""}`}
                onClick={() => setThoughtVisibility("private")}
              >
                Private
              </button>
            </div>

            <textarea
              className="drop-textarea thought-input"
              placeholder="Catch the thought before it leaves..."
              value={thoughtText}
              onChange={(e) => setThoughtText(e.target.value)}
              rows={4}
            />

            <div className="drop-file-control">
              <div className="capture-actions">
                <label className="capture-action upload-action">
                  Upload
                  <input
                    className="file-input"
                    type="file"
                    accept={fileAccept}
                    onChange={(e) => {
                      setFile(e.currentTarget.files?.[0] ?? null);
                      setMediaSource(e.currentTarget.files?.[0] ? "upload" : null);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
                <button type="button" className="capture-action" onClick={() => openStudio("audio")}>
                  Capture
                </button>
              </div>
              <div className="file-meta file-status">
                {file ? (
                  <>
                    <span className="file-name">{file.name}</span>
                    <span className="file-size">{Math.round(file.size / 1024)} KB</span>
                  </>
                ) : (
                  <span className="file-name dim">Record a voice memo, or upload a doodle/image.</span>
                )}
              </div>
            </div>

            {selectedMediaPreview ? (
              <div className="thought-selected-preview">
                {file && isAudioFile(file) ? (
                  <audio src={selectedMediaPreview} controls preload="metadata" />
                ) : (
                  <img src={selectedMediaPreview} alt="Thought attachment preview" />
                )}
                <span>{file && isAudioFile(file) ? "Voice memo thought" : "Doodle/image thought"}</span>
              </div>
            ) : null}

            <textarea
              className="drop-textarea"
              placeholder="Description (optional)"
              value={dropDesc}
              onChange={(e) => setDropDesc(e.target.value)}
              rows={3}
            />

            <div className="capture-help">
              Public thoughts can enter the Community Feed. Private thoughts stay in your Activity Channel.
            </div>
          </div>
        ) : mode === "Music" ? (
          <>
            <div className="drop-file-control">
              <label className="capture-action upload-action">
                Upload
                <input
                  className="file-input"
                  type="file"
                  accept={fileAccept}
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setMediaSource(e.target.files?.[0] ? "upload" : null);
                    if (e.target.files?.[0]) setUrl("");
                  }}
                />
              </label>
              <div className="file-meta file-status">
                {file ? (
                  <>
                    <span className="file-name">{file.name}</span>
                    <span className="file-size">{Math.round(file.size / 1024)} KB</span>
                  </>
                ) : (
                  <span className="file-name dim">Upload audio for full song playback</span>
                )}
              </div>
            </div>
            <input
              className="drop-input"
              placeholder="Or paste Spotify / Apple Music / SoundCloud / YouTube"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (e.target.value.trim()) setFile(null);
              }}
            />
            <textarea
              className="drop-textarea"
              placeholder="Add a description…"
              value={dropDesc}
              onChange={(e) => setDropDesc(e.target.value)}
              rows={3}
            />
          </>
        ) : showUrlField ? (
          <>
            <input
              className="drop-input"
              placeholder={
                mode === "Link"
                  ? "Paste a link"
                  : mode === "News"
                    ? "Paste a news/article/magazine link"
                    : "Paste YouTube link"
              }
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <textarea
              className="drop-textarea"
              placeholder="Add a description…"
              value={dropDesc}
              onChange={(e) => setDropDesc(e.target.value)}
              rows={3}
            />
          </>
        ) : null}

        <button className="drop-add" onClick={addDrop}>
          ADD A DROP
        </button>

        {msg ? <div className="drop-msg">{msg}</div> : <div className="drop-hint">{hint}</div>}
      </div>

      <div className="drop-list">
        {drops.length === 0 ? (
          <div className="drop-empty">
            <div className="drop-empty-title">No Drops yet</div>
            <div className="drop-empty-sub">
              Choose a mode, then add a Drop. Embeds and uploads show instantly.
            </div>
          </div>
        ) : (
          drops.map((d) => {
            const isMedia = d.type === "Media";
            const isAudioMusic = d.type === "Music" && d.mediaKind === "audio";
            const isDoc = d.type === "Doc";
            const isPay = d.type === "Pay";
            const isThought = d.type === "Thought";
            const isNews = d.type === "News";
            const isLinky = d.type === "Link";

            const canEmbed = !!d.embedUrl;
            const kind: EmbedKind = d.embedUrl ? embedKindFromUrl(d.embedUrl) : "generic";

            const fav = d.url ? faviconUrl(d.url) : null;
            const cover = d.url ? newsCoverUrl(d.url) : null;
            const linkCover = resolveLinkPreviewImage(d.url, d.previewImage || cover);
            const linkTitle = d.previewTitle || d.headline || d.title;
            const linkDescription = d.previewDescription;

            const signedKey = d.bucket && d.storagePath ? `${d.bucket}:${d.storagePath}` : "";
            const signedUrl = signedKey ? signedUrlByKey[signedKey] : undefined;

            return (
              <div key={d.id} className="drop-item">
                <div className="drop-titleTop">{d.title}</div>

                <div className="drop-metaRow">
                  <div className="drop-badges">
                    <RemovableDropBadge
                      label={displayDropType(d.type).toUpperCase()}
                      canRemove
                      onRemove={() => removeDrop(d.id)}
                    />
                    {d.hostLabel ? <span className="badge ghost">{d.hostLabel}</span> : null}
                    {isPay && d.priceCents ? (
                      <span className="badge ghost">{formatPriceFromCents(d.priceCents)}</span>
                    ) : null}
                    {d.badgeLabel ? <span className="badge ghost">{d.badgeLabel}</span> : null}
                    {isThought ? (
                      <span className="badge ghost">{(d.visibility ?? "public").toUpperCase()}</span>
                    ) : null}
                    {isThought && d.thoughtFormat ? (
                      <span className="badge ghost">{d.thoughtFormat.toUpperCase()}</span>
                    ) : null}
                    {!isPay && d.fileName ? <span className="badge ghost">{d.fileName}</span> : null}
                  </div>

                  <div className="drop-actions">
                    {d.url ? (
                      <a className="drop-open" href={d.url} target="_blank" rel="noreferrer">
                        OPEN
                      </a>
                    ) : null}

                    {isPay ? (
                      <button
                        className="drop-mini"
                        type="button"
                        onClick={() => void openPayCheckout(d)}
                        disabled={payCheckoutBusyId === d.id}
                      >
                        {payCheckoutBusyId === d.id ? "Opening…" : "Checkout →"}
                      </button>
                    ) : null}

                    {isDoc && signedUrl ? (
                      <a className="drop-mini" href={signedUrl} target="_blank" rel="noreferrer">
                        OPEN DOC →
                      </a>
                    ) : null}

                    {isMedia || isAudioMusic || (isThought && signedUrl) ? (
                      <button className="drop-mini" onClick={() => openViewer(d.id)}>
                        {isAudioMusic || d.mediaKind === "audio" ? "PLAY FULL" : "EXPAND"}
                      </button>
                    ) : null}

                    <button className="drop-mini" type="button" onClick={() => setCommentsDropId(d.id)}>
                      Comment{commentCountByDrop[d.id] ? ` ${commentCountByDrop[d.id]}` : ""}
                    </button>

                    {!isMedia && !canEmbed && isLinky && d.url ? (
                      <a className="drop-mini" href={d.url} target="_blank" rel="noreferrer">
                        Open →
                      </a>
                    ) : null}
                  </div>
                </div>

                {d.description && !isPay && !isDoc ? (
                  <div className="drop-description">{d.description}</div>
                ) : null}

                {isThought && d.thoughtText ? (
                  <div className="thought-body">{d.thoughtText}</div>
                ) : null}

                {isAudioMusic || (isThought && d.mediaKind === "audio") ? (
                  <div className={`audio-drop-card ${isThought ? "thought-audio-card" : ""}`}>
                    <div className="audio-drop-label">{isThought ? "VOICE MEMO" : "FULL SONG"}</div>
                    {signedUrl ? (
                      <audio src={signedUrl} controls preload="metadata" />
                    ) : (
                      <div className="media-missing">
                        <div className="media-missing-title">Audio preparing…</div>
                        <div className="media-missing-sub">If this just uploaded, give it a moment.</div>
                      </div>
                    )}
                  </div>
                ) : isThought && d.mediaKind === "image" ? (
                  <div className="media-thumb natural-media thought-media-thumb" aria-label="Thought image preview">
                    {signedUrl ? (
                      <img src={signedUrl} alt={d.title} />
                    ) : (
                      <div className="media-missing">
                        <div className="media-missing-title">Thought image preparing…</div>
                        <div className="media-missing-sub">If this just uploaded, give it a moment.</div>
                      </div>
                    )}
                  </div>
                ) : isMedia || isPay ? (
                  <div
                    className={`media-thumb ${isMedia ? "natural-media" : ""} ${isPay ? "pay-thumb" : ""}`}
                    aria-label={isPay ? "Pay drop image" : "Vision drop preview"}
                  >
                    {signedUrl ? (
                      <div className="drop-studio-media-frame">
                        {d.mediaKind === "video" ? (
                          <video src={signedUrl} controls playsInline preload="metadata" />
                        ) : (
                          <img src={signedUrl} alt={d.title} />
                        )}
                        {isMedia ? (
                          <DropStudioOverlay customizations={d.customizations} />
                        ) : null}
                      </div>
                    ) : (
                      <div className="media-missing">
                        <div className="media-missing-title">Vision media not available</div>
                        <div className="media-missing-sub">
                          If this just uploaded, refresh once. If it persists, check Storage policies.
                        </div>
                      </div>
                    )}
                  </div>
                ) : canEmbed ? (
                  <div className={`embed-shell ${kind}`}>
                    <iframe
                      src={d.embedUrl!}
                      title={d.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      loading="lazy"
                      referrerPolicy="strict-origin-when-cross-origin"
                    />
                  </div>
                ) : isNews && d.url ? (
                  <a className="newsCover" href={d.url} target="_blank" rel="noreferrer">
                    <div className="newsTopBar">
                      <span className="newsPill">NEWS DROP</span>
                      <span className="newsSource">
                        {fav ? <img className="newsFav" src={fav} alt="" /> : null}
                        <span className="newsHost">{d.hostLabel ?? "ARTICLE"}</span>
                      </span>
                    </div>

                    <div className="newsArt">
                      {d.previewImage || cover ? (
                        <img
                          className="newsImg"
                          src={d.previewImage || cover || ""}
                          alt=""
                          loading="lazy"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : null}

                      <div className="newsOverlay" />
                      <div className="newsHeadline">
                        <div className="newsHeadlineLabel">COVER STORY</div>
                        <div className="newsHeadlineText">{linkTitle}</div>
                      </div>
                    </div>

                    <div className="newsFooter">
                      <span className="newsUrl">{d.url}</span>
                      <span className="newsOpen">OPEN →</span>
                    </div>
                  </a>
                ) : isDoc ? (
                  <div className="doc-card">
                    <div className="doc-row">
                      <div className="doc-left">
                        <div className="doc-name">{d.fileName ?? "Document"}</div>
                        <div className="doc-meta">
                          {d.fileSize ? `${Math.round(d.fileSize / 1024)} KB` : null}
                          {d.mime ? ` • ${d.mime}` : null}
                        </div>
                      </div>
                      {signedUrl ? (
                        <a className="doc-open" href={signedUrl} target="_blank" rel="noreferrer">
                          OPEN →
                        </a>
                      ) : (
                        <span className="doc-wait">Preparing…</span>
                      )}
                    </div>

                    {d.description ? <div className="doc-desc">{d.description}</div> : null}
                  </div>
                ) : d.url ? (
                  <a className="link-card link-cover-card" href={d.url} target="_blank" rel="noreferrer">
                    <div className="link-preview-art">
                      {linkCover ? (
                        <img
                          className="link-preview-img"
                          src={linkCover}
                          alt=""
                          loading="lazy"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : null}
                      <div className="link-preview-overlay" />
                      <div className="link-preview-host">
                        {fav ? <img className="newsFav" src={fav} alt="" /> : null}
                        <span>{d.hostLabel ?? "LINK"}</span>
                      </div>
                      <div className="link-preview-copy">
                        <div className="link-preview-label">Link Drop</div>
                        <div className="link-preview-title">{linkTitle}</div>
                        {linkDescription ? (
                          <div className="link-preview-desc">{linkDescription}</div>
                        ) : null}
                      </div>
                    </div>
                    <div className="link-row">
                      <div className="link-url">{d.url}</div>
                      <span className="link-open">OPEN ORIGINAL →</span>
                    </div>
                  </a>
                ) : null}

                {isPay && d.description ? <div className="pay-desc">{d.description}</div> : null}
              </div>
            );
          })
        )}
      </div>

      {viewerOpen && viewerDrop && (viewerDrop.type === "Media" || viewerDrop.type === "Pay" || viewerDrop.type === "Thought" || viewerDrop.mediaKind === "audio") ? (
        <div
          className="viewerOverlay"
          role="dialog"
          aria-label="Vision media viewer"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeViewer();
          }}
        >
          <div className="viewerPanel">
            <div className="viewerTop">
              <div className="viewerTitle">
                {viewerDrop.title}
                {viewerDrop.type === "Pay" && viewerDrop.priceCents ? (
                  <span className="viewerPrice">{formatPriceFromCents(viewerDrop.priceCents)}</span>
                ) : null}
              </div>
              <button className="viewerClose" type="button" onClick={closeViewer} aria-label="Close">
                ✕
              </button>
            </div>

            <div className="viewerBody">
              {viewerDrop.bucket && viewerDrop.storagePath ? (
                viewerSignedUrl || signedUrlByKey[viewerSignedKey] ? (
                  viewerDrop.mediaKind === "audio" ? (
                    <div className="viewerAudio">
                      <div className="viewerAudioTitle">{viewerDrop.fileName || viewerDrop.title}</div>
                      <audio src={(viewerSignedUrl || signedUrlByKey[viewerSignedKey])!} controls autoPlay />
                    </div>
                  ) : viewerDrop.mediaKind === "video" ? (
                    <div className="viewer-studio-frame">
                      <video src={(viewerSignedUrl || signedUrlByKey[viewerSignedKey])!} controls autoPlay playsInline />
                      {viewerDrop.type === "Media" ? (
                        <DropStudioOverlay customizations={viewerDrop.customizations} />
                      ) : null}
                    </div>
                  ) : (
                    <div className="viewer-studio-frame">
                      <img src={(viewerSignedUrl || signedUrlByKey[viewerSignedKey])!} alt={viewerDrop.title} />
                      {viewerDrop.type === "Media" ? (
                        <DropStudioOverlay customizations={viewerDrop.customizations} />
                      ) : null}
                    </div>
                  )
                ) : (
                  <div className="media-missing big">
                    <div className="media-missing-title">Preparing preview…</div>
                    <div className="media-missing-sub">
                      If it doesn’t load after a refresh, check Storage policies.
                    </div>
                  </div>
                )
              ) : (
                <div className="media-missing big">
                  <div className="media-missing-title">Vision media not available</div>
                  <div className="media-missing-sub">Missing storage reference.</div>
                </div>
              )}
            </div>

            {viewerDrop.type === "Pay" ? (
              <div className="viewerActions">
                <button
                  type="button"
                  className="viewerCheckout"
                  onClick={() => void openPayCheckout(viewerDrop)}
                  disabled={payCheckoutBusyId === viewerDrop.id}
                >
                  {payCheckoutBusyId === viewerDrop.id ? "Opening checkout…" : "Open checkout"}
                </button>
              </div>
            ) : null}

            <div className="viewerHint">Press ESC to exit.</div>
          </div>
        </div>
      ) : null}

      <DropStudioStage
        open={studioMode !== null}
        initialFile={studioInitialFile}
        initialMode={studioMode ?? (mode === "Thought" ? "audio" : "photo")}
        allowedModes={studioAllowedModes}
        value={dropCustomizations}
        onChange={setDropCustomizations}
        onComplete={(captured, src) => {
          setFile(captured);
          setMediaSource(src);
        }}
        onClose={closeStudio}
      />

      <DropCommentsDrawer
        open={Boolean(commentsDropId)}
        onClose={() => setCommentsDropId(null)}
        dropId={commentsDropId ?? ""}
        dropTitle={drops.find((drop) => drop.id === commentsDropId)?.title}
      />

      <style>{`
        .drop-tile {
          width: 100%;
          max-width: 100%;
          min-width: 0;
          overflow: hidden;
          box-sizing: border-box;
        }

        .drop-tile *,
        .drop-tile *::before,
        .drop-tile *::after {
          box-sizing: border-box;
        }

        .drop-studio-media-frame,
        .viewer-studio-frame {
          position: relative;
          width: 100%;
          overflow: hidden;
          border-radius: inherit;
        }

        /* Profile grid: standard Board Drop frame so Vision tiles stay uniform.
           (The expand viewer keeps the full media, so it's excluded.) */
        .drop-studio-media-frame {
          aspect-ratio: 4 / 5;
          margin: 0 auto;
        }
        .drop-studio-media-frame > img,
        .drop-studio-media-frame > video {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .viewer-studio-frame > img,
        .viewer-studio-frame > video {
          display: block;
          width: 100%;
        }

        .drop-tile-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }

        .drop-avatar-frame {
          --drop-avatar-glow: #ff4fd8;
          --drop-avatar-power: 0.72;
          width: 74px;
          height: 74px;
          flex: 0 0 74px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(255, 255, 255, 0.48);
          background:
            radial-gradient(circle at 35% 25%, rgba(255, 255, 255, 0.82), rgba(255, 255, 255, 0.18) 48%, rgba(0, 0, 0, 0.08)),
            color-mix(in srgb, var(--drop-avatar-glow) 10%, rgba(255, 255, 255, 0.68));
          box-shadow:
            0 0 calc(16px + 30px * var(--drop-avatar-power)) calc(1px + 8px * var(--drop-avatar-power)) color-mix(in srgb, var(--drop-avatar-glow) 46%, transparent),
            0 10px 26px rgba(0, 0, 0, 0.14),
            inset 0 0 0 1px rgba(255, 255, 255, 0.42);
        }

        .drop-avatar-inner {
          width: 54px;
          height: 54px;
          border-radius: 999px;
          overflow: hidden;
          display: grid;
          place-items: center;
          border: 1px solid rgba(255, 255, 255, 0.62);
          background:
            radial-gradient(circle at 30% 18%, rgba(255, 255, 255, 0.34), transparent 42%),
            rgba(0, 0, 0, 0.16);
          box-shadow: inset 0 0 16px rgba(0, 0, 0, 0.12);
        }

        .drop-avatar-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .drop-avatar-fallback {
          width: 100%;
          height: 100%;
          display: grid;
          place-items: center;
          font-size: 20px;
          font-weight: 950;
          color: rgba(0, 0, 0, 0.55);
          background: rgba(255, 255, 255, 0.35);
        }

        .mode-row {
          margin-top: 12px;
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          min-width: 0;
          max-width: 100%;
        }
        .mode-btn {
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: rgba(255, 255, 255, 0.7);
          color: rgba(0, 0, 0, 0.62);
          cursor: pointer;
        }
        .mode-btn.on {
          background: rgba(0, 0, 0, 0.86);
          color: rgba(200, 255, 230, 0.95);
          border-color: rgba(0, 0, 0, 0.18);
        }

        @media (max-width: 560px) {
          .drop-tile-head {
            align-items: flex-start;
          }

          .drop-avatar-frame {
            width: 62px;
            height: 62px;
            flex-basis: 62px;
          }

          .drop-avatar-inner {
            width: 46px;
            height: 46px;
          }
        }

        .drop-form {
          margin-top: 12px;
          display: grid;
          gap: 10px;
          width: 100%;
          min-width: 0;
          max-width: 100%;
        }

        .drop-input {
          width: 100%;
          border-radius: 16px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: rgba(255, 255, 255, 0.72);
          padding: 12px 14px;
          outline: none;
        }

        .drop-textarea {
          width: 100%;
          border-radius: 16px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: rgba(255, 255, 255, 0.72);
          padding: 12px 14px;
          outline: none;
          resize: vertical;
        }

        .file-line {
          display: grid;
          gap: 8px;
        }
        .file-input {
          position: absolute;
          width: 1px;
          height: 1px;
          opacity: 0;
          pointer-events: none;
        }
        .file-meta {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
          min-width: 0;
          max-width: 100%;
        }
        .file-name {
          font-weight: 900;
          color: rgba(0, 0, 0, 0.68);
          min-width: 0;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .file-name.dim {
          color: rgba(0, 0, 0, 0.45);
        }
        .file-size {
          font-size: 12px;
          color: rgba(0, 0, 0, 0.5);
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .drop-file-control {
          display: grid;
          gap: 8px;
        }
        .file-status {
          min-height: 18px;
        }
        .media-capture-field {
          display: grid;
          gap: 9px;
        }
        .studio-open-cta {
          width: 100%;
          font-weight: 950;
          letter-spacing: 0.08em;
          border-color: rgba(126, 226, 255, 0.5);
          box-shadow: 0 0 16px rgba(126, 226, 255, 0.22);
        }
        .studio-launch-preview {
          display: block;
          width: 100%;
          max-width: 360px;
          margin: 0 auto;
          padding: 0;
          border-radius: 16px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          overflow: hidden;
          background: #000;
          cursor: pointer;
        }
        .studio-launch-preview > img,
        .studio-launch-preview > video {
          display: block;
          width: 100%;
        }
        .capture-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .capture-action {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          padding: 9px 12px;
          border: 1px solid rgba(0, 120, 105, 0.24);
          background: rgba(220, 255, 246, 0.72);
          color: rgba(0, 92, 80, 0.82);
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          cursor: pointer;
          transition: transform 160ms ease, box-shadow 160ms ease, filter 160ms ease;
        }
        .capture-action.upload-action {
          position: relative;
          overflow: hidden;
          border-color: rgba(0, 0, 0, 0.16);
          background:
            radial-gradient(circle at 24% 18%, rgba(200,255,230,0.18), transparent 40%),
            rgba(0, 0, 0, 0.86);
          color: rgba(200, 255, 230, 0.96);
          box-shadow: inset 0 0 14px rgba(255, 255, 255, 0.06);
        }
        .capture-action:hover {
          transform: translateY(-1px);
          filter: brightness(1.02);
          box-shadow: 0 0 18px rgba(0, 180, 150, 0.15);
        }
        .capture-action.upload-action:hover {
          box-shadow:
            0 0 18px rgba(0, 180, 150, 0.14),
            inset 0 0 14px rgba(255, 255, 255, 0.08);
        }
        .capture-help {
          font-size: 11px;
          font-weight: 750;
          color: rgba(0, 0, 0, 0.45);
        }
        .selected-media-preview {
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(0, 120, 105, 0.2);
          border-radius: 15px;
          background: rgba(3, 24, 24, 0.9);
          box-shadow: 0 0 20px rgba(0, 180, 150, 0.12);
        }
        .selected-media-preview img,
        .selected-media-preview video {
          display: block;
          width: 100%;
          max-height: 280px;
          object-fit: contain;
          background: rgba(2, 12, 14, 0.96);
        }
        .selected-media-preview span {
          position: absolute;
          top: 9px;
          left: 9px;
          border: 1px solid rgba(140, 255, 230, 0.25);
          border-radius: 999px;
          padding: 5px 8px;
          background: rgba(0, 28, 28, 0.72);
          color: rgba(210, 255, 244, 0.92);
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .thought-field {
          display: grid;
          gap: 10px;
        }
        .thought-input {
          min-height: 108px;
          background:
            radial-gradient(circle at 18% 12%, rgba(255, 79, 216, 0.08), transparent 36%),
            radial-gradient(circle at 82% 18%, rgba(45, 124, 255, 0.08), transparent 38%),
            rgba(255, 255, 255, 0.74);
        }
        .thought-selected-preview {
          position: relative;
          overflow: hidden;
          border-radius: 18px;
          border: 1px solid rgba(0, 120, 105, 0.18);
          background:
            radial-gradient(circle at 15% 16%, rgba(255, 79, 216, 0.14), transparent 40%),
            radial-gradient(circle at 85% 20%, rgba(45, 124, 255, 0.14), transparent 42%),
            rgba(255, 255, 255, 0.72);
          padding: 12px;
        }
        .thought-selected-preview img {
          display: block;
          width: auto;
          max-width: 100%;
          max-height: 260px;
          margin: 0 auto;
          border-radius: 14px;
          object-fit: contain;
        }
        .thought-selected-preview audio {
          display: block;
          width: 100%;
        }
        .thought-selected-preview span {
          display: inline-flex;
          width: fit-content;
          margin-top: 8px;
          border-radius: 999px;
          padding: 5px 8px;
          background: rgba(0, 0, 0, 0.82);
          color: rgba(211, 255, 236, 0.94);
          font-size: 9px;
          font-weight: 950;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .drop-add {
          border-radius: 16px;
          padding: 12px 14px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          border: 1px solid rgba(0, 0, 0, 0.16);
          background: rgba(0, 0, 0, 0.86);
          color: rgba(200, 255, 230, 0.95);
          cursor: pointer;
          transition: transform 160ms ease, filter 160ms ease;
        }
        .drop-add:hover {
          transform: translateY(-1px);
          filter: brightness(1.02);
        }

        .drop-msg {
          margin-top: 2px;
          font-size: 13px;
          color: rgba(0, 0, 0, 0.65);
          font-weight: 700;
        }
        .drop-hint {
          margin-top: 2px;
          font-size: 13px;
          color: rgba(0, 0, 0, 0.52);
        }
        .pay-provider-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .provider-chip {
          border: 1px solid rgba(0,0,0,0.12);
          background: rgba(255,255,255,0.84);
          color: rgba(0,0,0,0.58);
          border-radius: 999px;
          padding: 9px 12px;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .provider-chip.on {
          background: rgba(0,0,0,0.86);
          color: rgba(255,255,255,0.92);
        }
        .pay-gateway-note {
          font-size: 12px;
          color: rgba(0,0,0,0.56);
          font-weight: 700;
        }

        .drop-list {
          margin-top: 14px;
          display: grid;
          gap: 12px;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          overflow: hidden;
        }

        .drop-empty {
          border-radius: 18px;
          border: 1px dashed rgba(0, 0, 0, 0.18);
          background: rgba(255, 255, 255, 0.62);
          padding: 14px;
        }
        .drop-empty-title {
          font-weight: 900;
          color: rgba(0, 0, 0, 0.68);
        }
        .drop-empty-sub {
          margin-top: 6px;
          font-size: 13px;
          color: rgba(0, 0, 0, 0.58);
        }

        .drop-item {
          border-radius: 18px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(255, 255, 255, 0.68);
          padding: 12px 14px;
          display: grid;
          gap: 10px;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          overflow: hidden;
        }

        .drop-titleTop {
          font-weight: 950;
          color: rgba(0, 160, 80, 1);
          letter-spacing: 0.02em;
          min-width: 0;
          max-width: 100%;
          overflow-wrap: anywhere;
        }

        .drop-metaRow {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          gap: 10px;
          flex-wrap: wrap;
          min-width: 0;
          max-width: 100%;
        }

        .drop-actions {
          display: inline-flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
          justify-content: flex-start;
          width: 100%;
          min-width: 0;
          max-width: 100%;
        }

        .drop-open {
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(255, 0, 190, 0.85);
          text-decoration: underline;
          text-underline-offset: 4px;
        }

        .drop-mini {
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 800;
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: rgba(255, 255, 255, 0.7);
          color: rgba(0, 0, 0, 0.65);
          cursor: pointer;
          text-decoration: none;
        }

        .drop-badges {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
          min-width: 0;
          max-width: 100%;
          /* Was overflow:hidden, which clipped the removable label's slide/glow.
             Keep the row contained via wrapping + per-badge ellipsis instead. */
          overflow: visible;
        }
        /* The removable drop-type label keeps its own clip; never let it shrink
           or distort beside the ghost pills. */
        .drop-badges > :global(.kindRemovable) {
          flex: 0 0 auto;
        }

        .badge {
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.72);
          border: 1px solid rgba(0, 0, 0, 0.12);
          color: rgba(0, 0, 0, 0.65);
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .badge.ghost {
          background: rgba(255, 255, 255, 0.52);
          color: rgba(0, 0, 0, 0.52);
        }

        .embed-shell {
          width: 100%;
          max-width: 100%;
          min-width: 0;
          border-radius: 18px;
          overflow: hidden;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(255, 255, 255, 0.6);
        }
        .embed-shell iframe {
          width: 100%;
          max-width: 100%;
          border: 0;
          display: block;
        }

        .embed-shell.spotify_track,
        .embed-shell.spotify_large {
          width: 100%;
        }

        .embed-shell.spotify_track iframe {
          height: 152px;
        }
        .embed-shell.spotify_large iframe {
          height: 352px;
        }
        .embed-shell.soundcloud iframe {
          height: 300px;
        }
        .embed-shell.apple_music_track iframe {
          height: 175px;
        }
        .embed-shell.apple_music_album iframe {
          height: 450px;
        }
        .embed-shell.youtube iframe {
          height: 220px;
        }
        .embed-shell.generic iframe {
          height: 220px;
        }

        @media (max-width: 640px) {
          .embed-shell.spotify_large iframe {
            height: 320px;
          }
          .embed-shell.youtube iframe {
            height: 200px;
          }
          .embed-shell.soundcloud iframe {
            height: 260px;
          }
          .embed-shell.apple_music_album iframe {
            height: 420px;
          }
        }

        .newsCover {
          display: block;
          border-radius: 18px;
          overflow: hidden;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(0, 0, 0, 0.82);
          text-decoration: none;
          color: white;
          transition: transform 160ms ease, filter 160ms ease;
        }
        .newsCover:hover {
          transform: translateY(-1px);
          filter: brightness(1.02);
        }

        .newsTopBar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.08);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .newsPill {
          display: inline-flex;
          align-items: center;
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          background: rgba(255, 0, 190, 0.22);
          border: 1px solid rgba(255, 0, 190, 0.3);
          color: rgba(255, 255, 255, 0.92);
          white-space: nowrap;
        }
        .newsSource {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.86);
          white-space: nowrap;
          max-width: 58%;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .newsFav {
          width: 16px;
          height: 16px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.18);
        }
        .newsHost {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .newsArt {
          position: relative;
          aspect-ratio: 16 / 9;
          background: radial-gradient(1200px 420px at 15% 15%, rgba(255, 0, 190, 0.22), transparent 60%),
            radial-gradient(900px 420px at 80% 45%, rgba(0, 255, 150, 0.18), transparent 62%),
            linear-gradient(135deg, rgba(0, 0, 0, 0.92), rgba(0, 0, 0, 0.7));
          overflow: hidden;
        }

        .newsImg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          opacity: 0.88;
        }

        .newsOverlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(0, 0, 0, 0.25), rgba(0, 0, 0, 0.78));
        }

        .newsHeadline {
          position: absolute;
          left: 12px;
          right: 12px;
          bottom: 12px;
          display: grid;
          gap: 6px;
        }
        .newsHeadlineLabel {
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.8);
        }
        .newsHeadlineText {
          font-size: 18px;
          line-height: 1.1;
          font-weight: 950;
          letter-spacing: 0.01em;
          color: rgba(255, 255, 255, 0.95);
          text-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .newsFooter {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.06);
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }
        .newsUrl {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.7);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 72%;
        }
        .newsOpen {
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(200, 255, 230, 0.92);
          white-space: nowrap;
        }

        @media (max-width: 640px) {
          .newsHeadlineText {
            font-size: 16px;
          }
        }

        .media-thumb {
          width: 100%;
          max-width: 100%;
          min-width: 0;
          border: 0;
          padding: 0;
          background: transparent;
          cursor: default;
          border-radius: 18px;
          overflow: hidden;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background:
            radial-gradient(circle at 18% 18%, rgba(255, 0, 190, 0.08), transparent 34%),
            radial-gradient(circle at 80% 22%, rgba(0, 180, 255, 0.08), transparent 34%),
            rgba(255, 255, 255, 0.6);
        }
        .media-thumb.pay-thumb {
          cursor: default;
        }
        .media-thumb.natural-media {
          width: 100%;
          max-width: 100%;
          justify-self: start;
          border: 0;
          border-radius: 0;
          overflow: visible;
          background: transparent;
        }
        .media-thumb img,
        .media-thumb video {
          width: auto;
          height: auto;
          max-width: 100%;
          min-width: 0;
          margin: 0 auto;
          display: block;
          object-fit: contain;
          max-height: min(520px, 72vh);
        }
        .media-thumb.natural-media img,
        .media-thumb.natural-media video {
          max-width: 100%;
          border-radius: 14px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(0, 0, 0, 0.055);
        }
        .media-thumb video {
          width: 100%;
          min-height: 180px;
          background: #000;
        }
        .media-thumb.natural-media video {
          width: auto;
          height: auto;
          max-width: 100%;
          min-height: 0;
        }

        .audio-drop-card {
          width: 100%;
          max-width: 100%;
          min-width: 0;
          border-radius: 18px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background:
            radial-gradient(circle at 18% 18%, rgba(45, 124, 255, 0.12), transparent 34%),
            radial-gradient(circle at 80% 22%, rgba(255, 0, 190, 0.10), transparent 34%),
            rgba(255, 255, 255, 0.72);
          padding: 14px;
          display: grid;
          gap: 10px;
        }
        .audio-drop-label {
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(45, 124, 255, 0.86);
        }
        .audio-drop-card audio {
          width: 100%;
          max-width: 100%;
          display: block;
        }
        .thought-audio-card {
          border-color: rgba(0, 120, 105, 0.16);
          background:
            radial-gradient(circle at 16% 18%, rgba(255, 79, 216, 0.12), transparent 34%),
            radial-gradient(circle at 78% 16%, rgba(45, 124, 255, 0.12), transparent 36%),
            rgba(255, 255, 255, 0.72);
        }
        .thought-media-thumb img {
          max-height: min(360px, 62vh);
        }

        .media-missing {
          border-radius: 18px;
          border: 1px dashed rgba(0, 0, 0, 0.18);
          background: rgba(255, 255, 255, 0.62);
          padding: 14px;
          text-align: left;
        }
        .media-missing.big {
          width: 100%;
          height: 360px;
          display: grid;
          place-items: center;
          text-align: center;
        }
        .media-missing-title {
          font-weight: 950;
          color: rgba(0, 0, 0, 0.68);
        }
        .media-missing-sub {
          margin-top: 6px;
          font-size: 13px;
          color: rgba(0, 0, 0, 0.56);
        }

        .viewerOverlay {
          position: fixed;
          inset: 0;
          z-index: 80;
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(6px);
          display: grid;
          place-items: center;
          padding: 20px;
        }
        .viewerPanel {
          width: min(1040px, calc(100vw - 40px));
          max-height: calc(100vh - 44px);
          border-radius: 24px;
          background: rgba(255, 242, 166, 0.96);
          border: 1px solid rgba(0, 0, 0, 0.18);
          box-shadow: 0 30px 120px rgba(0, 0, 0, 0.35);
          overflow: hidden;
          display: grid;
          grid-template-rows: auto 1fr auto;
        }
        .viewerTop {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 14px;
          background: rgba(255, 255, 255, 0.55);
          border-bottom: 1px solid rgba(0, 0, 0, 0.1);
        }
        .viewerTitle {
          font-weight: 950;
          color: rgba(0, 0, 0, 0.72);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 78%;
          display: inline-flex;
          align-items: center;
          gap: 10px;
        }
        .viewerPrice {
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: rgba(255, 255, 255, 0.65);
          color: rgba(0, 0, 0, 0.62);
        }
        .viewerClose {
          height: 38px;
          width: 38px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.14);
          background: rgba(255, 255, 255, 0.78);
          cursor: pointer;
          font-weight: 900;
        }
        .viewerBody {
          padding: 16px;
          display: grid;
          place-items: center;
          background: rgba(255, 255, 255, 0.32);
          min-height: 0;
          overflow: auto;
        }
        /* Present the expanded drop as a large module: the media fills the
           available space rather than being pinned to a small fixed height
           inside a scrolling card. */
        .viewerBody .viewer-studio-frame {
          width: auto;
          max-width: 100%;
          display: inline-block;
          line-height: 0;
        }
        .viewerBody img,
        .viewerBody video,
        .viewerBody .viewer-studio-frame > img,
        .viewerBody .viewer-studio-frame > video {
          width: auto;
          max-width: 100%;
          max-height: calc(100vh - 220px);
          border-radius: 18px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: #000;
          object-fit: contain;
        }
        .viewerAudio {
          width: 100%;
          display: grid;
          gap: 14px;
          border-radius: 20px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          background:
            radial-gradient(circle at 20% 20%, rgba(45, 124, 255, 0.18), transparent 34%),
            radial-gradient(circle at 78% 18%, rgba(255, 0, 190, 0.14), transparent 32%),
            rgba(255, 255, 255, 0.72);
          padding: 18px;
        }
        .viewerAudioTitle {
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(0, 0, 0, 0.64);
          overflow-wrap: anywhere;
        }
        .viewerAudio audio {
          width: 100%;
        }
        .viewerActions {
          padding: 0 14px 10px;
          background: rgba(255, 255, 255, 0.32);
        }
        .viewerCheckout {
          width: 100%;
          border: 1px solid rgba(0, 0, 0, 0.14);
          border-radius: 16px;
          background: rgba(0, 0, 0, 0.86);
          color: rgba(200, 255, 230, 0.96);
          padding: 12px 14px;
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          cursor: pointer;
        }
        .viewerCheckout:disabled,
        .drop-mini:disabled {
          opacity: 0.58;
          cursor: wait;
        }
        .viewerHint {
          padding: 10px 14px 14px 14px;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(0, 0, 0, 0.55);
        }

        .doc-card {
          border-radius: 18px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(255, 255, 255, 0.62);
          padding: 12px 14px;
          display: grid;
          gap: 10px;
        }
        .doc-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        .doc-name {
          font-weight: 950;
          color: rgba(0, 0, 0, 0.7);
        }
        .doc-meta {
          margin-top: 4px;
          font-size: 12px;
          color: rgba(0, 0, 0, 0.55);
          font-weight: 800;
          letter-spacing: 0.06em;
        }
        .doc-open {
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255, 0, 190, 0.85);
          text-decoration: underline;
          text-underline-offset: 4px;
        }
        .doc-wait {
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(0, 0, 0, 0.5);
        }
        .doc-desc {
          font-size: 13px;
          color: rgba(0, 0, 0, 0.6);
          line-height: 1.4;
          overflow-wrap: anywhere;
        }

        .drop-description {
          margin: -2px 0 4px;
          white-space: pre-wrap;
          color: rgba(0, 0, 0, 0.62);
          font-size: 13px;
          font-weight: 700;
          line-height: 1.45;
          overflow-wrap: anywhere;
        }
        .thought-body {
          border-radius: 18px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          background:
            radial-gradient(circle at 12% 10%, rgba(255, 79, 216, 0.12), transparent 42%),
            radial-gradient(circle at 88% 18%, rgba(45, 124, 255, 0.10), transparent 46%),
            rgba(255, 255, 255, 0.72);
          padding: 13px 14px;
          color: rgba(0, 0, 0, 0.72);
          font-size: 14px;
          font-weight: 800;
          line-height: 1.5;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }

        .pay-desc {
          font-size: 13px;
          color: rgba(0, 0, 0, 0.6);
          line-height: 1.4;
          overflow-wrap: anywhere;
        }

        .link-card {
          border-radius: 18px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(255, 255, 255, 0.62);
          padding: 12px 14px;
          display: grid;
          gap: 8px;
          color: inherit;
          text-decoration: none;
          overflow: hidden;
        }
        .link-cover-card {
          padding: 0;
          background: rgba(255, 255, 255, 0.72);
        }
        .link-preview-art {
          position: relative;
          min-height: 210px;
          overflow: hidden;
          background:
            radial-gradient(circle at 18% 18%, rgba(255, 0, 190, 0.16), transparent 34%),
            radial-gradient(circle at 78% 26%, rgba(0, 180, 255, 0.16), transparent 34%),
            linear-gradient(135deg, rgba(24, 21, 15, 0.92), rgba(78, 67, 40, 0.88));
        }
        .link-preview-img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .link-preview-overlay {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(180deg, rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.78)),
            radial-gradient(circle at 70% 10%, rgba(255, 255, 255, 0.22), transparent 34%);
        }
        .link-preview-host {
          position: absolute;
          left: 14px;
          top: 14px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          max-width: calc(100% - 28px);
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.32);
          background: rgba(0, 0, 0, 0.48);
          padding: 7px 10px;
          color: rgba(255, 255, 255, 0.92);
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          backdrop-filter: blur(10px);
        }
        .link-preview-host span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .link-preview-copy {
          position: absolute;
          left: 14px;
          right: 14px;
          bottom: 14px;
          color: #fff;
        }
        .link-preview-label {
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(200, 255, 230, 0.9);
        }
        .link-preview-title {
          margin-top: 6px;
          font-size: 20px;
          line-height: 1.1;
          font-weight: 950;
          letter-spacing: -0.02em;
          text-shadow: 0 2px 12px rgba(0, 0, 0, 0.42);
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .link-preview-desc {
          margin-top: 7px;
          font-size: 12px;
          line-height: 1.45;
          color: rgba(255, 255, 255, 0.78);
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .link-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
          padding: 12px 14px;
        }
        .link-host {
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(0, 0, 0, 0.62);
        }
        .link-open {
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255, 0, 190, 0.85);
          text-decoration: underline;
          text-underline-offset: 4px;
        }
        .link-url {
          font-size: 13px;
          color: rgba(0, 0, 0, 0.58);
          overflow-wrap: anywhere;
        }

        .tile-sub.tiny {
          margin-top: 6px;
          font-size: 12px;
          opacity: 0.75;
        }
      `}</style>
    </div>
  );
}
