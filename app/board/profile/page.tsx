"use client";

import "./profile.css";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import ActivityCard from "@/app/components/board/ActivityCard";
import DropTile from "@/app/components/board/DropTile";
import DropsBucket from "@/app/components/board/DropsBucket";
import ReactionRail from "@/app/components/board/ReactionRail";
import {
  getLocalActivity,
  type BoardActivity,
} from "@/lib/board/activity";
import { dedupeActivity, mergeActivityWithFeed } from "@/lib/board/feedActivity";
import { EVENTS, readFeed } from "@/lib/boardStore";
import { openHostedPayDropCheckout } from "@/lib/board/payCheckout";
import { readPayDrops, type PayDrop } from "@/lib/board/paydrops";
import { EVT_UPDATED, readBrain, sendWave } from "@/lib/board/bucketBrain";
import { STICKER_PACKS } from "@/lib/board/stickerPacks";
import { resolveLinkPreviewImage } from "@/lib/board/linkPreviewImages";
import {
  normalizeDropCustomizations,
  type DropCustomization,
} from "@/lib/board/dropCustomizations";
import {
  BOARD_VISIT_WHISPERS_EVENT,
  readBoardVisitWhispers,
} from "@/lib/board/visitWhispers";
import {
  createBoardWhisper,
  deriveActivityWhispers,
  getBoardWhisper,
  type BoardWhisper as ProfileWhisper,
} from "@/lib/board/whispers";
import {
  PROFILE_ACTIVITY_CHANNEL_FETCH_LIMIT,
  PROFILE_ACTIVITY_CHANNEL_LIMIT,
  resolveProfileActivityDrops,
} from "@/lib/board/profileActivityChannel";
import {
  STORE_DROP_BOOKMARKS_STORAGE_KEY,
  STORE_DROP_COLLECTION_STORAGE_KEY,
  STORE_DROP_UPDATED_EVENT,
  readStoreDropCollectionSlots,
  syncStoreDropCollection,
  type BoardStoreDrop,
} from "@/lib/board/storeDrops";
import {
  BOARD_PROFILE_STORAGE_KEY,
  sanitizeBoardOptionsForStorage,
  sanitizeProfileForStorage,
  writeLightweightLocalStorage,
} from "@/lib/board/profileStorage";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { ensureImageFileMinResolution } from "@/lib/board/imageQuality";

const PROFILE_STORAGE_KEY = BOARD_PROFILE_STORAGE_KEY;
const OPTIONS_STORAGE_KEY = "board.options.v1";
const PROFILE_UPDATED_EVENT = "board:profile:updated";
const DROP_STORAGE_KEY = "jab_board_drops_v2";
const DROP_DELETED_STORAGE_KEY = "jab_board_drops_deleted_v1";

function activityBelongsToUser(item: BoardActivity, userId: string) {
  const meta = item.meta && typeof item.meta === "object" ? item.meta : null;
  return (
    item.user_id === userId ||
    meta?.recipientUserId === userId ||
    meta?.ownerUserId === userId
  );
}

function activityBelongsToProfile(
  item: BoardActivity,
  profileId: string | null | undefined,
  username: string | null | undefined
) {
  const meta = item.meta && typeof item.meta === "object" ? item.meta : null;
  const cleanUsername = String(username || "").trim().replace(/^@+/, "").toLowerCase();
  const metaUsernames = [
    meta?.authorUsername,
    meta?.ownerUsername,
    meta?.recipientUsername,
    meta?.username,
  ]
    .map((value) => String(value || "").trim().replace(/^@+/, "").toLowerCase())
    .filter(Boolean);

  return (
    (!!profileId && activityBelongsToUser(item, profileId)) ||
    (!!cleanUsername && metaUsernames.includes(cleanUsername))
  );
}

type AuraMoodKey =
  | "locked_in"
  | "joyful"
  | "dreamy"
  | "romantic"
  | "mysterious"
  | "chaotic"
  | "sleepy"
  | "grateful";

type ProfilePayload = {
  displayName?: string;
  bio?: string;
  glowColor?: string;
  avatarDataUrl?: string | null;
  avatarUrl?: string | null;
  avatarPath?: string | null;
  visionSlots?: (string | null)[];
  visionSlotPaths?: (string | null)[];
  coverDataUrl?: string | null;
  coverPath?: string | null;
  auraMood?: AuraMoodKey;
};

type BoardOptionsSettings = {
  auraColor?: keyof typeof AURA_HEX;
  auraIntensity?: number;
};

type StaticProfile = {
  displayName: string;
  handle: string;
  bio: string;
  glowColor: string;
  auraMood: AuraMoodKey;
  avatarDataUrl: string | null;
  coverDataUrl: string | null;
  visionSlots: (string | null)[];
  avatarPath?: string | null;
  coverPath?: string | null;
  visionSlotPaths?: (string | null)[];
  /** Current Board energy level (0–100), persisted in board_style. */
  energyLevel?: number;
};

type FriendZoneFallbackParams = {
  name: string;
  avatar: string;
  state: string;
  lastActive: string;
};

type RemoteBoardStyle = {
  displayName?: string;
  bio?: string;
  glowColor?: string;
  auraColor?: keyof typeof AURA_HEX;
  avatarDataUrl?: string | null;
  avatarPath?: string | null;
  coverDataUrl?: string | null;
  coverPath?: string | null;
  visionSlots?: (string | null)[];
  visionSlotPaths?: (string | null)[];
  auraMood?: AuraMoodKey;
  bucketStats?: BucketStats;
  boardDrops?: unknown[];
  boardDropsDeleted?: unknown[];
  visibility?: "public" | "private";
  energyLevel?: number;
};

type RemoteProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url?: string | null;
  board_style?: RemoteBoardStyle | null;
};

function normalizeNameKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeUserKey(value: string) {
  return value.trim().toLowerCase().replace(/^@+/, "");
}

function normalizeProfileRouteKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9_]/g, "");
}

function readLocalProfileRouteKey() {
  if (typeof window === "undefined") return "";

  try {
    const optionsRaw = window.localStorage.getItem(OPTIONS_STORAGE_KEY);
    const profileRaw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    const options = optionsRaw ? JSON.parse(optionsRaw) : null;
    const profile = profileRaw ? JSON.parse(profileRaw) : null;
    const displayName = String(options?.displayName || profile?.displayName || "").trim();
    const displayKey = displayName ? normalizeNameKey(displayName) : "";
    if (displayKey === "johnandy") return "johnandy";

    const directUsername =
      normalizeProfileRouteKey(options?.username) ||
      normalizeProfileRouteKey(profile?.username) ||
      normalizeProfileRouteKey(profile?.handle);

    if (directUsername) return directUsername;

    return displayKey;
  } catch {
    return "";
  }
}

function resolveBoardGlow(
  boardStyle: RemoteBoardStyle | null | undefined,
  fallbackGlow: string
) {
  if (typeof boardStyle?.auraColor === "string" && AURA_HEX[boardStyle.auraColor]) {
    return AURA_HEX[boardStyle.auraColor];
  }
  if (typeof boardStyle?.glowColor === "string" && boardStyle.glowColor.trim()) {
    return boardStyle.glowColor.trim();
  }
  return fallbackGlow;
}

type DropType = "YouTube" | "Music" | "News" | "Link" | "Media" | "Pay" | "Doc";
type MediaKind = "image" | "video" | "audio";
type PayProviderMode = "payment_link" | "stripe_connect" | "authorize_net_accept_hosted";

type DropItem = {
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
  mediaUrl?: string;
  priceCents?: number;
  description?: string;
  linkUrl?: string;
  payProvider?: PayProviderMode;
  customizations?: DropCustomization;
};

type RemoteBoardDrop = DropItem;

type BucketStats = {
  pass: number;
  pin: number;
  push: number;
  waves: number;
  mutuals: number;
  updatedAt?: number;
};

function BoardWhisper({ whisper }: { whisper: ProfileWhisper }) {
  return (
    <p className={`board-whisper ${whisper.tone ?? "system"}`} aria-label="Board Whisper">
      {whisper.text}
    </p>
  );
}

function StoreDropCollectionSlot({ drop, index }: { drop: BoardStoreDrop | null; index: number }) {
  if (!drop) {
    return (
      <div className="store-slot empty">
        <div className="store-empty-orb" />
        <div className="store-empty-title">Empty Slot</div>
        <div className="store-empty-sub">Collect or bookmark a Store Drop to display it here.</div>
      </div>
    );
  }

  const isBookmarked = drop.status === "bookmarked";

  return (
    <a
      href={drop.productUrl}
      target="_blank"
      rel="noreferrer"
      className={`store-slot filled ${drop.status}`}
      aria-label={`Open ${drop.title}`}
    >
      {isBookmarked ? <span className="store-star" aria-label="Bookmarked artifact">★</span> : null}
      <img className="store-slot-img" src={drop.imageUrl} alt={drop.title} />
      <div className="store-slot-shade" />
      <div className="store-slot-copy">
        {drop.artifactNumber ? <div className="store-artifact">{drop.artifactNumber}</div> : null}
        <div className="store-title">{drop.title}</div>
        <div className={`store-badge ${drop.status}`}>
          {drop.status === "collected" ? "Collected" : "Saved Artifact"}
        </div>
      </div>
    </a>
  );
}

function StoreCollectionPanel({
  slots,
  className = "",
}: {
  slots: Array<BoardStoreDrop | null>;
  className?: string;
}) {
  return (
    <section className={`inner-tile store-collection-card ${className}`.trim()}>
      <div className="tile-head">
        <div>
          <div className="tile-title">Store Drops Collection</div>
          <div className="tile-sub">Collected artifacts and saved Store Drops from Explore.</div>
        </div>
      </div>
      <div className="store-collection-grid">
        {slots.map((drop, index) => (
          <StoreDropCollectionSlot
            key={drop?.id ?? `empty-store-slot-${index}`}
            drop={drop}
            index={index}
          />
        ))}
      </div>
    </section>
  );
}

function CoverPosterPanel({
  coverDataUrl,
  coverInputRef,
  onExpand,
  className = "",
}: {
  coverDataUrl: string | null;
  coverInputRef: React.RefObject<HTMLInputElement | null>;
  onExpand: (src: string) => void;
  className?: string;
}) {
  return (
    <section className={`inner-tile cover profile-panel-cover ${className}`.trim()}>
      <div className="tile-head">
        <div>
          <div className="tile-title">Cover Poster</div>
          <div className="tile-sub">A vertical cover that frames your whole board vibe.</div>
        </div>
      </div>

      <div className="cover-shell">
        {coverDataUrl ? (
          <button
            type="button"
            className="cover-button"
            onClick={() => onExpand(coverDataUrl)}
            aria-label="Expand cover poster"
          >
            <img className="cover-img" src={coverDataUrl} alt="Cover poster" />
            <span className="cover-expand-hint">Expand poster</span>
          </button>
        ) : (
          <button
            type="button"
            className="cover-empty"
            onClick={() => coverInputRef.current?.click()}
          >
            <div className="plus">+</div>
            <div className="label">UPLOAD COVER</div>
          </button>
        )}
      </div>

      <p className="cover-hint">
        Think: magazine cover, film poster, or banner. Tap the poster to expand it, or use Update Cover to swap.
      </p>
      <div className="vision-cta-row">
        <button
          type="button"
          className="tiny-cta"
          onClick={() => coverInputRef.current?.click()}
        >
          Update cover →
        </button>
      </div>
    </section>
  );
}

const AURA_HEX = {
  sloth_pink: "#FF4FD8",
  lust_blue: "#2D7CFF",
  greed_black: "#111111",
  pride_yellow: "#FFD12D",
  envy_red: "#FF2D2D",
  gluttony_orange: "#FF7A1A",
  wrath_purple: "#7A44FF",
  lilly_yellowgreen: "#B7FF2D",
} as const;

function signalLabelFromColor(hex: string) {
  const normalized = hex.trim().toLowerCase();
  const labels: Record<string, string> = {
    "#ff4fd8": "Sleepy Pink",
    "#2d7cff": "Dreamy Blue",
    "#111111": "Selfish Black",
    "#ffd12d": "Pride Yellow",
    "#ff2d2d": "Really Red",
    "#ff7a1a": "Cautious Orange",
    "#7a44ff": "Royal Purple",
    "#b7ff2d": "Nature Green",
  };

  return labels[normalized] ?? "Signal Active";
}

function normalizeDeletedDropIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.map(String).filter(Boolean);
}

function readLocalDeletedDropIds(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(DROP_DELETED_STORAGE_KEY);
    return normalizeDeletedDropIds(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
}

function activityDropId(item: BoardActivity): string | null {
  const meta = item.meta && typeof item.meta === "object" ? (item.meta as any) : null;
  return typeof meta?.dropId === "string" && meta.dropId ? meta.dropId : null;
}

function isDropTileActivity(item: BoardActivity) {
  const meta = item.meta && typeof item.meta === "object" ? (item.meta as any) : null;
  const source = String(meta?.source ?? "");
  return (
    source === "board_drop_tile" ||
    source === "drop_console" ||
    source === "profiles.board_style.boardDrops" ||
    source === "board_drops" ||
    source.includes("board_drop")
  );
}

function isPrivateThoughtActivity(item: BoardActivity) {
  const meta = item.meta && typeof item.meta === "object" ? (item.meta as any) : null;
  const isThought =
    String(meta?.dropType ?? "").toLowerCase() === "thought" ||
    String(meta?.drop_flavor ?? "").toLowerCase() === "thought";
  return (
    String(meta?.visibility ?? "").toLowerCase() === "private" &&
    (isThought || String(item.id || "").startsWith("private_thought_"))
  );
}

function isProjectDropActivity(item: BoardActivity) {
  const meta = item.meta && typeof item.meta === "object" ? (item.meta as any) : null;
  return (
    String(meta?.kind ?? "").includes("project") ||
    String(meta?.cardStyle ?? "").includes("project") ||
    String(meta?.dropType ?? "").includes("project") ||
    typeof meta?.projectId === "string" ||
    /^Project Drop:\s*/i.test(item.title ?? "")
  );
}

function filterDeletedActivity(items: BoardActivity[], deletedIds: string[]) {
  if (!deletedIds.length) return items;
  const deleted = new Set(deletedIds);
  return items.filter((item) => {
    const dropId = activityDropId(item);
    return !dropId || !deleted.has(dropId);
  });
}

function readLocalDropIds(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(DROP_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item: any) => String(item?.id ?? ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function boardDropIdsFromStyle(boardDrops: unknown): string[] {
  if (!Array.isArray(boardDrops)) return [];
  return boardDrops
    .map((item: any) => String(item?.id ?? ""))
    .filter(Boolean);
}

function filterCurrentDropTileActivity(items: BoardActivity[], extraDropIds: string[] = []) {
  const currentDropIds = new Set([...readLocalDropIds(), ...extraDropIds]);
  const hasKnownDropIds = currentDropIds.size > 0;

  return items.filter((item) => {
    // Private thoughts are owner-only and live solely in local storage — they're
    // never synced to the server boardDrops set, so they'd otherwise be filtered
    // out by the known-drop-id check below. Always keep them on the owner's feed.
    if (isPrivateThoughtActivity(item)) return true;
    if (item.kind === "board_drop" && !String(item.title || "").startsWith("Project Drop:")) {
      if (!isDropTileActivity(item)) return false;
    }
    if (!isDropTileActivity(item)) return true;
    const dropId = activityDropId(item);
    if (!dropId) return item.kind !== "board_drop";
    return !hasKnownDropIds || currentDropIds.has(dropId);
  });
}

const AURA_MOODS: Record<AuraMoodKey, { emoji: string; label: string }> = {
  locked_in: { emoji: "🎧", label: "Locked In" },
  joyful: { emoji: "✨", label: "Joyful" },
  dreamy: { emoji: "☁️", label: "Dreamy" },
  romantic: { emoji: "💞", label: "Romantic" },
  mysterious: { emoji: "🔮", label: "Mysterious" },
  chaotic: { emoji: "🌀", label: "Chaotic" },
  sleepy: { emoji: "🌙", label: "Sleepy" },
  grateful: { emoji: "🤍", label: "Grateful" },
};

const EMPTY_VISION = Array.from({ length: 6 }, () => null) as (string | null)[];

const STATIC_PROFILES: Record<string, StaticProfile> = {
  johnandy: {
    displayName: "John Andy",
    handle: "@johnandy",
    bio: "Writer, director, lead actor, and builder of the JAB Visions universe.",
    glowColor: "#FF4FD8",
    auraMood: "locked_in",
    avatarDataUrl: "/assets/john_andy_headshot.jpg",
    coverDataUrl: null,
    visionSlots: EMPTY_VISION,
  },
  keven: {
    displayName: "Keven Hart",
    handle: "@kevenhart",
    bio: "Pink current in motion.",
    glowColor: "#FF4FD8",
    auraMood: "joyful",
    avatarDataUrl: null,
    coverDataUrl: null,
    visionSlots: EMPTY_VISION,
  },
  ruby: {
    displayName: "Ruby Wong",
    handle: "@rubywong",
    bio: "Crimson drift and cloned signal.",
    glowColor: "#FF2D2D",
    auraMood: "chaotic",
    avatarDataUrl: null,
    coverDataUrl: null,
    visionSlots: EMPTY_VISION,
  },
  leo: {
    displayName: "Leo Montana",
    handle: "@leomontana",
    bio: "Golden pride on the field.",
    glowColor: "#FFD12D",
    auraMood: "locked_in",
    avatarDataUrl: null,
    coverDataUrl: null,
    visionSlots: EMPTY_VISION,
  },
  aaron: {
    displayName: "Aaron Addams",
    handle: "@aaronaddams",
    bio: "Shadow gatekeeper energy.",
    glowColor: "#111111",
    auraMood: "mysterious",
    avatarDataUrl: null,
    coverDataUrl: null,
    visionSlots: EMPTY_VISION,
  },
  zoe: {
    displayName: "Zoe Folie",
    handle: "@zoefolie",
    bio: "Blue orbit and reckless spark.",
    glowColor: "#2D7CFF",
    auraMood: "dreamy",
    avatarDataUrl: null,
    coverDataUrl: null,
    visionSlots: EMPTY_VISION,
  },
  lilly: {
    displayName: "Lilly James",
    handle: "@lillyjames",
    bio: "Wild famine pulse.",
    glowColor: "#B7FF2D",
    auraMood: "chaotic",
    avatarDataUrl: null,
    coverDataUrl: null,
    visionSlots: EMPTY_VISION,
  },
};

function titleCase(input: string) {
  return input
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function buildGenericProfile(identifier: string): StaticProfile {
  const clean = identifier.trim().toLowerCase();
  return {
    displayName: "Board User",
    handle: clean && !clean.includes("-") ? `@${clean}` : "@board-user",
    bio: "Public Board signal active.",
    glowColor: "#FF4FD8",
    auraMood: "locked_in",
    avatarDataUrl: null,
    coverDataUrl: null,
    visionSlots: EMPTY_VISION,
    avatarPath: null,
    coverPath: null,
    visionSlotPaths: EMPTY_VISION,
    energyLevel: 60,
  };
}

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatPriceFromCents(cents?: number) {
  if (!cents || cents <= 0) return "";
  return `$${(cents / 100).toFixed(2)}`;
}

function newsCoverUrl(rawUrl: string): string | null {
  const fallback = resolveLinkPreviewImage(rawUrl, null);
  if (fallback) return fallback;

  try {
    const u = new URL(rawUrl);
    return `https://image.thum.io/get/width/1200/crop/800/noanimate/${u.toString()}`;
  } catch {
    return null;
  }
}

function getBoardDropEmbedHeight(embedUrl?: string | null) {
  if (!embedUrl) return 220;
  if (embedUrl.includes("embed.music.apple.com")) {
    return embedUrl.includes("?i=") || embedUrl.includes("&i=") || embedUrl.includes("/song/")
      ? 175
      : 450;
  }
  if (!embedUrl.includes("open.spotify.com/embed")) return 220;
  return 80;
}

export default function BoardProfileHubPage() {
  const [routeKey, setRouteKey] = useState("");
  const [profileRouteLoading, setProfileRouteLoading] = useState(true);
  const [fallbackParams, setFallbackParams] = useState<FriendZoneFallbackParams>({
    name: "",
    avatar: "",
    state: "",
    lastActive: "",
  });
  const fallbackName = fallbackParams.name;
  const fallbackAvatar = fallbackParams.avatar;
  const fallbackState = fallbackParams.state;
  const fallbackLastActive = fallbackParams.lastActive;

  const fallbackFromOrb = useMemo<StaticProfile>(() => {
    return {
      ...buildGenericProfile(routeKey),
      displayName: fallbackName || titleCase(routeKey) || "Board User",
      handle: routeKey ? `@${routeKey}` : "@board-user",
      bio:
        fallbackState || fallbackLastActive
          ? `${
              fallbackState
                ? `${titleCase(fallbackState)} Friend Zone signal.`
                : "Friend Zone signal."
            }${fallbackLastActive ? ` ${fallbackLastActive}.` : ""}`
          : "Public Board signal active.",
      avatarDataUrl: fallbackAvatar || null,
    };
  }, [routeKey, fallbackName, fallbackAvatar, fallbackState, fallbackLastActive]);

  const fallback = STATIC_PROFILES[routeKey] ?? fallbackFromOrb;
  const [profile, setProfile] = useState<StaticProfile>(fallback);
  const [auraIntensity, setAuraIntensity] = useState(70);
  const [recentDrops, setRecentDrops] = useState<BoardActivity[]>([]);
  const [recentDropsLoading, setRecentDropsLoading] = useState(true);
  const [boardDrops, setBoardDrops] = useState<DropItem[]>([]);
  const [boardDropsLoading, setBoardDropsLoading] = useState(true);
  const [signedUrlByKey, setSignedUrlByKey] = useState<Record<string, string>>({});
  const [payCheckoutBusyId, setPayCheckoutBusyId] = useState<string | null>(null);
  const [orbitState, setOrbitState] = useState<"idle" | "requested" | "connected">("idle");
  const [bucketStats, setBucketStats] = useState<BucketStats | null>(null);
  const [stickerBinOpen, setStickerBinOpen] = useState(false);
  const passCount = useMemo(
    () =>
      bucketStats?.pass ??
      (typeof window !== "undefined" ? readBrain().pass.length : 0),
    [bucketStats]
  );
  const [remoteUserId, setRemoteUserId] = useState<string | null>(null);
  const [selfUser, setSelfUser] = useState("");
  const [visitWhispers, setVisitWhispers] = useState<ProfileWhisper[]>([]);
  const [waveNotice, setWaveNotice] = useState<string | null>(null);
  const [storeDropSlots, setStoreDropSlots] = useState<Array<BoardStoreDrop | null>>(
    () => Array.from({ length: 4 }, () => null)
  );
  const [expandedPhoto, setExpandedPhoto] = useState<{ src: string; label: string } | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const visionInputRef = useRef<HTMLInputElement | null>(null);
  const pendingVisionSlotRef = useRef(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFallbackParams({
      name: params.get("name")?.trim() || "",
      avatar: params.get("avatar")?.trim() || "",
      state: params.get("state")?.trim() || "",
      lastActive: params.get("lastActive")?.trim() || "",
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSelfUser() {
      const localRouteKey = readLocalProfileRouteKey();
      if (localRouteKey && !cancelled) {
        setRouteKey(localRouteKey);
      }

      try {
        const profileRes = await fetch("/api/board/posts/profile", { cache: "no-store" });
        const profileJson = profileRes.ok ? await profileRes.json() : null;
        const profileRow = profileJson?.profile ?? null;
        const nextSelf =
          localRouteKey ||
          normalizeProfileRouteKey(profileRow?.username) ||
          normalizeProfileRouteKey(profileRow?.display_name);

        if (nextSelf) {
          if (!cancelled) {
            setSelfUser(nextSelf);
            setRouteKey(nextSelf);
            if (typeof profileRow?.id === "string") setRemoteUserId(profileRow.id);
          }
          return;
        }

        const sb = supabaseBrowser();
        const {
          data: { user },
        } = await sb.auth.getUser();

        const fallbackSelf = normalizeProfileRouteKey(
          user?.email?.split("@")[0] || localRouteKey || "johnandy"
        );

        if (!cancelled) {
          setSelfUser(fallbackSelf);
          setRouteKey(fallbackSelf);
        }
      } catch {
        const localRouteKey = readLocalProfileRouteKey() || "johnandy";
        if (!cancelled) {
          setSelfUser(localRouteKey);
          setRouteKey(localRouteKey);
        }
      } finally {
        if (!cancelled) setProfileRouteLoading(false);
      }
    }

    void loadSelfUser();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function refreshOrbitState() {
      if (!selfUser || !routeKey || selfUser === routeKey) {
        setOrbitState("idle");
        return;
      }

      const brain = readBrain();
      const sentWave = brain.waves.some((wave) => wave.from === selfUser && wave.to === routeKey);
      const mutual = brain.mutuals.some((entry) => {
        const a = normalizeUserKey(entry.a);
        const b = normalizeUserKey(entry.b);
        return (a === selfUser && b === routeKey) || (a === routeKey && b === selfUser);
      });

      setOrbitState(mutual ? "connected" : sentWave ? "requested" : "idle");
    }

    refreshOrbitState();
    window.addEventListener(EVT_UPDATED, refreshOrbitState);
    return () => window.removeEventListener(EVT_UPDATED, refreshOrbitState);
  }, [selfUser, routeKey]);

  useEffect(() => {
    function syncStoreDrops() {
      setStoreDropSlots(readStoreDropCollectionSlots(4));
    }

    function onStoreStorage(event: StorageEvent) {
      if (
        event.key === null ||
        event.key === STORE_DROP_BOOKMARKS_STORAGE_KEY ||
        event.key === STORE_DROP_COLLECTION_STORAGE_KEY
      ) {
        syncStoreDrops();
      }
    }

    syncStoreDrops();
    // Pull the account's persisted collection from Supabase; the local write it
    // performs re-fires STORE_DROP_UPDATED_EVENT and refreshes the slots.
    void syncStoreDropCollection();
    window.addEventListener(STORE_DROP_UPDATED_EVENT, syncStoreDrops as EventListener);
    window.addEventListener("storage", onStoreStorage);

    return () => {
      window.removeEventListener(STORE_DROP_UPDATED_EVENT, syncStoreDrops as EventListener);
      window.removeEventListener("storage", onStoreStorage);
    };
  }, []);

  useEffect(() => {
    if (!routeKey) return;

    function refreshVisitWhispers() {
      setVisitWhispers(
        readBoardVisitWhispers(routeKey)
          .slice(0, 5)
          .map((visit): ProfileWhisper => ({
            id: visit.id,
            type: "whisper",
            tone: "profile",
            text: getBoardWhisper("profile_view", visit.id).text,
            createdAt: visit.createdAt,
            eventType: "profile_view",
          }))
      );
    }

    refreshVisitWhispers();
    window.addEventListener(
      BOARD_VISIT_WHISPERS_EVENT,
      refreshVisitWhispers as EventListener
    );
    window.addEventListener("storage", refreshVisitWhispers as EventListener);

    return () => {
      window.removeEventListener(
        BOARD_VISIT_WHISPERS_EVENT,
        refreshVisitWhispers as EventListener
      );
      window.removeEventListener("storage", refreshVisitWhispers as EventListener);
    };
  }, [routeKey]);

  function waveAtProfileBoard() {
    const target = normalizeUserKey(routeKey);

    if (!selfUser) {
      setWaveNotice("Log in to wave at this board.");
      window.setTimeout(() => setWaveNotice(null), 1600);
      return;
    }

    if (!target || target === selfUser) {
      setWaveNotice("This is your own board.");
      window.setTimeout(() => setWaveNotice(null), 1600);
      return;
    }

    sendWave(selfUser, target);
    setOrbitState("requested");
    setWaveNotice(`Wave sent to @${target}.`);
    window.setTimeout(() => setWaveNotice(null), 1600);
  }

  useEffect(() => {
    if (!routeKey) return;

    const base = STATIC_PROFILES[routeKey] ?? fallbackFromOrb;
    setProfile(base);
    setAuraIntensity(70);
    setBucketStats(null);
    setRemoteUserId(null);

    if (routeKey !== "johnandy") return;

    try {
      const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
      const optionsRaw = window.localStorage.getItem(OPTIONS_STORAGE_KEY);
      const stored = raw
        ? sanitizeProfileForStorage(JSON.parse(raw) as ProfilePayload)
        : null;
      const options = optionsRaw
        ? sanitizeBoardOptionsForStorage(JSON.parse(optionsRaw) as BoardOptionsSettings)
        : null;

      const glowColor =
        options?.auraColor && AURA_HEX[options.auraColor]
          ? AURA_HEX[options.auraColor]
          : stored?.glowColor ?? base.glowColor;

      setProfile({
        ...base,
        displayName: stored?.displayName?.trim() || base.displayName,
        bio: stored?.bio?.trim() || base.bio,
        glowColor,
        auraMood: stored?.auraMood ?? base.auraMood,
        avatarDataUrl: stored?.avatarPath
          ? null
          : stored?.avatarDataUrl !== undefined
            ? stored.avatarDataUrl ?? null
            : stored?.avatarUrl ?? base.avatarDataUrl,
        avatarPath: stored?.avatarPath ?? base.avatarPath,
        coverDataUrl:
          stored?.coverDataUrl !== undefined ? stored.coverDataUrl ?? null : base.coverDataUrl,
        coverPath: stored?.coverPath ?? base.coverPath,
        visionSlots:
          Array.isArray(stored?.visionSlots) && stored?.visionSlots.length === 6
            ? stored.visionSlots.map((slot) => (typeof slot === "string" ? slot : null))
            : base.visionSlots,
        visionSlotPaths:
          Array.isArray(stored?.visionSlotPaths) && stored?.visionSlotPaths.length === 6
            ? stored.visionSlotPaths.map((slot) => (typeof slot === "string" ? slot : null))
            : base.visionSlotPaths,
      });
      setAuraIntensity(clamp(options?.auraIntensity ?? 70, 0, 100));
    } catch {
      setProfile(base);
    }
  }, [routeKey, fallbackFromOrb]);

  useEffect(() => {
    if (!routeKey) return;

    let cancelled = false;

    async function loadRemoteProfile() {
      try {
        const sb = supabaseBrowser();
        let profileRow: RemoteProfileRow | null = null;

        const { data: byUsername, error: usernameError } = await sb
          .from("profiles")
          .select("id, username, display_name, bio, avatar_url, board_style")
          .eq("username", routeKey)
          .maybeSingle();

        if (usernameError) throw usernameError;
        profileRow = (byUsername as RemoteProfileRow | null) ?? null;

        if (!profileRow) {
          const { data: byId, error: idError } = await sb
            .from("profiles")
            .select("id, username, display_name, bio, avatar_url, board_style")
            .eq("id", routeKey)
            .maybeSingle();

          if (idError) throw idError;
          profileRow = (byId as RemoteProfileRow | null) ?? null;
        }

        if (cancelled || !profileRow) return;
        setRemoteUserId(profileRow.id);

        const boardStyle =
          profileRow.board_style && typeof profileRow.board_style === "object"
            ? profileRow.board_style
            : null;
        const localOptions =
          routeKey === "johnandy"
            ? (() => {
                try {
                  const raw = window.localStorage.getItem(OPTIONS_STORAGE_KEY);
                  return raw ? (JSON.parse(raw) as BoardOptionsSettings) : null;
                } catch {
                  return null;
                }
              })()
            : null;
        const localProfile =
          routeKey === "johnandy"
            ? (() => {
                try {
                  const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
                  return raw ? (JSON.parse(raw) as ProfilePayload) : null;
                } catch {
                  return null;
                }
              })()
            : null;
        const localGlowColor =
          localOptions?.auraColor && AURA_HEX[localOptions.auraColor]
            ? AURA_HEX[localOptions.auraColor]
            : typeof localProfile?.glowColor === "string"
              ? localProfile.glowColor
              : null;

        if (boardStyle?.visibility === "private") return;

        const remoteUsername = String(profileRow.username || "").trim().toLowerCase();
        const base =
          STATIC_PROFILES[remoteUsername] ??
          STATIC_PROFILES[routeKey] ??
          fallbackFromOrb;
        const displayNameFromRow =
          typeof profileRow.display_name === "string"
            ? profileRow.display_name.trim()
            : "";
        const rowNameMatchesUsername =
          displayNameFromRow &&
          remoteUsername &&
          normalizeNameKey(displayNameFromRow) === normalizeNameKey(remoteUsername);

        setProfile({
          ...base,
          displayName:
            (typeof boardStyle?.displayName === "string" &&
              boardStyle.displayName.trim()) ||
            (rowNameMatchesUsername ? "" : displayNameFromRow) ||
            base.displayName,
          handle: remoteUsername ? `@${remoteUsername}` : base.handle,
          bio:
            (typeof boardStyle?.bio === "string" && boardStyle.bio.trim()) ||
            (typeof profileRow.bio === "string" && profileRow.bio.trim()) ||
            base.bio,
          glowColor: localGlowColor || resolveBoardGlow(boardStyle, base.glowColor),
          auraMood: boardStyle?.auraMood ?? base.auraMood,
          energyLevel:
            typeof boardStyle?.energyLevel === "number"
              ? Math.max(0, Math.min(100, boardStyle.energyLevel))
              : base.energyLevel,
          avatarDataUrl:
            (typeof boardStyle?.avatarDataUrl === "string" &&
              boardStyle.avatarDataUrl.trim()) ||
            (typeof profileRow.avatar_url === "string" &&
              profileRow.avatar_url.trim()) ||
            base.avatarDataUrl,
          avatarPath:
            typeof boardStyle?.avatarPath === "string" ? boardStyle.avatarPath : base.avatarPath,
          coverDataUrl:
            (typeof boardStyle?.coverDataUrl === "string" &&
              boardStyle.coverDataUrl.trim()) ||
            base.coverDataUrl,
          coverPath:
            typeof boardStyle?.coverPath === "string" ? boardStyle.coverPath : base.coverPath,
          visionSlots:
            Array.isArray(boardStyle?.visionSlots) &&
            boardStyle.visionSlots.length === 6
              ? boardStyle.visionSlots.map((slot) =>
                  typeof slot === "string" ? slot : null
                )
              : base.visionSlots,
          visionSlotPaths:
            Array.isArray(boardStyle?.visionSlotPaths) &&
            boardStyle.visionSlotPaths.length === 6
              ? boardStyle.visionSlotPaths.map((slot) =>
                  typeof slot === "string" ? slot : null
                )
              : base.visionSlotPaths,
        });
      } catch {
        // Keep fallback profile shell if Supabase lookup fails.
      }
    }

    void loadRemoteProfile();

    async function loadRemoteBucketStats() {
      try {
        const sb = supabaseBrowser();
        let profileRow:
          | { username: string | null; board_style?: RemoteBoardStyle | null }
          | null = null;

        const { data: byUsername, error: usernameError } = await sb
          .from("profiles")
          .select("username, board_style")
          .eq("username", routeKey)
          .maybeSingle();

        if (usernameError) throw usernameError;
        profileRow = byUsername ?? null;

        if (!profileRow) {
          const { data: byId, error: idError } = await sb
            .from("profiles")
            .select("username, board_style")
            .eq("id", routeKey)
            .maybeSingle();

          if (idError) throw idError;
          profileRow = byId ?? null;
        }

        if (cancelled || !profileRow) return;

        const boardStyle =
          profileRow?.board_style && typeof profileRow.board_style === "object"
            ? profileRow.board_style
            : {};
        const rawStats = (boardStyle as any).bucketStats;

        if (!rawStats || typeof rawStats !== "object") {
          setBucketStats(null);
          return;
        }

        setBucketStats({
          pass: Number(rawStats.pass ?? 0),
          pin: Number(rawStats.pin ?? 0),
          push: Number(rawStats.push ?? 0),
          waves: Number(rawStats.waves ?? 0),
          mutuals: Number(rawStats.mutuals ?? 0),
          updatedAt:
            typeof rawStats.updatedAt === "number" ? rawStats.updatedAt : undefined,
        });
      } catch {
        setBucketStats(null);
      }
    }

    void loadRemoteBucketStats();

    const intervalId = window.setInterval(() => {
      void loadRemoteBucketStats();
    }, 8000);

    function onFocus() {
      void loadRemoteBucketStats();
    }

    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, [routeKey, fallbackFromOrb]);

  useEffect(() => {
    if (!remoteUserId) {
      return;
    }

    const userId = remoteUserId;
    let cancelled = false;

    async function loadRemoteRecentDrops() {
      try {
        const sb = supabaseBrowser();
        const { data: profileData } = await sb
          .from("profiles")
          .select("board_style")
          .eq("id", userId)
          .maybeSingle();
        const response = await fetch(
          `/api/board/activity?limit=${PROFILE_ACTIVITY_CHANNEL_FETCH_LIMIT}`,
          { cache: "no-store" }
        );
        if (!response.ok) throw new Error("Could not load Board activity.");
        const payload = await response.json();
        if (cancelled) return;

        const remoteItems = Array.isArray(payload?.items)
          ? (payload.items.filter((item: unknown) => item && typeof item === "object") as BoardActivity[])
          : [];
        const mergedItems = mergeActivityWithFeed(
          [...remoteItems, ...getLocalActivity()],
          readFeed()
        );
        const items = mergedItems.filter((item) =>
          activityBelongsToProfile(item, userId, routeKey)
        );
        const boardStyle =
          profileData?.board_style && typeof profileData.board_style === "object"
            ? (profileData.board_style as RemoteBoardStyle)
            : null;
        const deletedIds = normalizeDeletedDropIds(boardStyle?.boardDropsDeleted);
        const remoteDropIds = boardDropIdsFromStyle(boardStyle?.boardDrops);

        const visibleItems =
          routeKey === "johnandy"
            ? filterCurrentDropTileActivity(items, remoteDropIds)
            : filterDeletedActivity(items, deletedIds);

        setRecentDrops(
          dedupeActivity(visibleItems).slice(0, PROFILE_ACTIVITY_CHANNEL_LIMIT)
        );
        setRecentDropsLoading(false);
      } catch {
        if (cancelled) return;
        const localActivity = getLocalActivity();
        const sharedFeed = readFeed();
        setRecentDrops(
          filterDeletedActivity(
            mergeActivityWithFeed(localActivity, sharedFeed).filter((item) =>
              activityBelongsToProfile(item, userId, routeKey)
            ),
            readLocalDeletedDropIds()
          ).slice(0, PROFILE_ACTIVITY_CHANNEL_LIMIT)
        );
        setRecentDropsLoading(false);
      }
    }

    void loadRemoteRecentDrops();

    return () => {
      cancelled = true;
    };
  }, [remoteUserId, routeKey]);

  // Private thoughts are owner-local and never come back from the server, so the
  // remote load path above can't surface a freshly-saved one. Listen for them
  // directly (event + local storage) and merge into the Activity Channel live.
  useEffect(() => {
    function mergePrivateThought(detail: BoardActivity | null) {
      if (!detail || !isPrivateThoughtActivity(detail)) return;
      if (!activityBelongsToProfile(detail, remoteUserId, routeKey)) return;
      const dropId = activityDropId(detail);
      if (dropId && readLocalDeletedDropIds().includes(dropId)) return;
      setRecentDrops((prev) => dedupeActivity([detail, ...prev]).slice(0, PROFILE_ACTIVITY_CHANNEL_LIMIT));
      setRecentDropsLoading(false);
    }

    function onActivityNew(event: Event) {
      mergePrivateThought((event as CustomEvent<BoardActivity>).detail ?? null);
    }

    function onActivityStorage(event: StorageEvent) {
      if (event.key !== null && event.key !== "jab_board_activity_v1") return;
      const deleted = readLocalDeletedDropIds();
      const privates = getLocalActivity().filter(
        (item) =>
          isPrivateThoughtActivity(item) &&
          activityBelongsToProfile(item, remoteUserId, routeKey) &&
          !(activityDropId(item) && deleted.includes(activityDropId(item)!))
      );
      if (!privates.length) return;
      setRecentDrops((prev) => dedupeActivity([...privates, ...prev]).slice(0, PROFILE_ACTIVITY_CHANNEL_LIMIT));
    }

    window.addEventListener("board:activity:new", onActivityNew as EventListener);
    window.addEventListener("storage", onActivityStorage as EventListener);
    return () => {
      window.removeEventListener("board:activity:new", onActivityNew as EventListener);
      window.removeEventListener("storage", onActivityStorage as EventListener);
    };
  }, [remoteUserId, routeKey]);

  useEffect(() => {
    if (remoteUserId) {
      return;
    }

    function syncRecentDrops() {
      const localActivity = getLocalActivity();
      const sharedFeed = readFeed();
      setRecentDrops(
        filterDeletedActivity(
          filterCurrentDropTileActivity(
            mergeActivityWithFeed(localActivity, sharedFeed).filter((item) =>
              activityBelongsToProfile(item, null, routeKey)
            )
          ),
          readLocalDeletedDropIds()
        ).slice(0, PROFILE_ACTIVITY_CHANNEL_LIMIT)
      );
      setRecentDropsLoading(false);
    }

    function onStorage(event: StorageEvent) {
      if (
        event.key === null ||
        event.key === "jab_board_activity_v1" ||
        event.key === "jab_board_feed_v1" ||
        event.key === DROP_DELETED_STORAGE_KEY ||
        event.key?.startsWith("jab_board_projects_v2")
      ) {
        syncRecentDrops();
      }
    }

    function onFeedUpdated() {
      syncRecentDrops();
    }

    function onActivityNew(event: Event) {
      const detail = (event as CustomEvent<BoardActivity>).detail;
      if (!detail) return;
      const dropId = activityDropId(detail);
      if (dropId && readLocalDeletedDropIds().includes(dropId)) return;
      if (
        !isPrivateThoughtActivity(detail) &&
        isDropTileActivity(detail) &&
        (!dropId || !readLocalDropIds().includes(dropId))
      )
        return;
      setRecentDrops((prev) => dedupeActivity([detail, ...prev]).slice(0, PROFILE_ACTIVITY_CHANNEL_LIMIT));
      setRecentDropsLoading(false);
    }

    syncRecentDrops();

    window.addEventListener("storage", onStorage);
    window.addEventListener(EVENTS.feedUpdated, onFeedUpdated as EventListener);
    window.addEventListener("board:projects:updated", onFeedUpdated as EventListener);
    window.addEventListener("board:activity:new", onActivityNew as EventListener);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(EVENTS.feedUpdated, onFeedUpdated as EventListener);
      window.removeEventListener("board:projects:updated", onFeedUpdated as EventListener);
      window.removeEventListener("board:activity:new", onActivityNew as EventListener);
    };
  }, [remoteUserId]);

  useEffect(() => {
    if (!routeKey) return;

    let cancelled = false;

    function normalizeDrops(input: unknown): DropItem[] {
      if (!Array.isArray(input)) return [];
      return input
        .filter((x) => x && typeof x === "object")
        .map((x: any): RemoteBoardDrop => ({
          id: String(x.id ?? ""),
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
          mediaKind:
            x.mediaKind === "image" || x.mediaKind === "video" || x.mediaKind === "audio"
              ? x.mediaKind
              : undefined,
          priceCents: typeof x.priceCents === "number" ? x.priceCents : undefined,
          description: typeof x.description === "string" ? x.description : undefined,
          linkUrl: typeof x.linkUrl === "string" ? x.linkUrl : undefined,
          payProvider:
            x.payProvider === "authorize_net_accept_hosted" ||
            x.payProvider === "payment_link"
              ? x.payProvider
              : undefined,
          customizations: normalizeDropCustomizations(x.customizations),
        }))
        .filter((item) => item.id);
    }

    function mergeDrops(...groups: DropItem[][]) {
      const map = new Map<string, DropItem>();
      for (const group of groups) {
        for (const drop of group) {
          if (!drop?.id) continue;
          const existing = map.get(drop.id);
          map.set(drop.id, {
            ...(existing ?? {}),
            ...drop,
            bucket: drop.bucket ?? existing?.bucket,
            storagePath: drop.storagePath ?? existing?.storagePath,
            mediaKind: drop.mediaKind ?? existing?.mediaKind,
            previewImage: drop.previewImage ?? existing?.previewImage,
            linkUrl: drop.linkUrl ?? existing?.linkUrl,
            payProvider: drop.payProvider ?? existing?.payProvider,
          });
        }
      }

      return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
    }

    function inferDropTypeFromActivity(item: BoardActivity, meta: any): DropType {
      const explicit = String(meta?.dropType ?? "");
      if (
        explicit === "YouTube" ||
        explicit === "Music" ||
        explicit === "News" ||
        explicit === "Link" ||
        explicit === "Media" ||
        explicit === "Pay" ||
        explicit === "Doc"
      ) {
        return explicit;
      }

      const flavor = String(meta?.drop_flavor ?? "").toLowerCase();
      if (flavor === "media") return "Media";
      if (flavor === "music") return "Music";
      if (flavor === "youtube") return "YouTube";
      if (flavor === "doc") return "Doc";

      const href = typeof item.href === "string" ? item.href.toLowerCase() : "";
      if (href.includes("youtube.com") || href.includes("youtu.be")) return "YouTube";
      if (
        href.includes("spotify.com") ||
        href.includes("music.apple.com") ||
        href.includes("soundcloud.com")
      ) {
        return "Music";
      }
      return "Link";
    }

    function activityToDrop(item: BoardActivity): DropItem | null {
      const isProjectDrop = String(item.title || "").startsWith("Project Drop:");
      if (item.kind !== "board_drop" || isProjectDrop) return null;

      const meta = item.meta && typeof item.meta === "object" ? (item.meta as any) : null;
      const dropId =
        typeof meta?.dropId === "string" && meta.dropId
          ? meta.dropId
          : item.id
            ? `activity_${item.id}`
            : "";
      if (!dropId) return null;

      const safeType = inferDropTypeFromActivity(item, meta);
      const preview = meta?.preview && typeof meta.preview === "object" ? meta.preview : null;
      const previewImage =
        typeof meta?.previewImage === "string"
          ? meta.previewImage
          : typeof preview?.image === "string"
            ? preview.image
            : typeof item.image_url === "string"
              ? item.image_url
              : undefined;
      const href = typeof item.href === "string" ? item.href : undefined;

      return {
        id: dropId,
        title: item.title || "Untitled",
        type: safeType,
        createdAt: item.created_at ? new Date(item.created_at).getTime() : Date.now(),
        url: href,
        embedUrl:
          typeof meta?.embedUrl === "string"
            ? meta.embedUrl
            : typeof preview?.embedUrl === "string"
              ? preview.embedUrl
              : null,
        hostLabel: typeof meta?.hostLabel === "string" ? meta.hostLabel : undefined,
        previewTitle:
          typeof meta?.previewTitle === "string"
            ? meta.previewTitle
            : typeof preview?.title === "string"
              ? preview.title
              : undefined,
        previewDescription:
          typeof meta?.previewDescription === "string"
            ? meta.previewDescription
            : typeof preview?.description === "string"
              ? preview.description
              : undefined,
        previewImage: resolveLinkPreviewImage(href, previewImage) ?? undefined,
        bucket: typeof meta?.bucket === "string" ? meta.bucket : undefined,
        storagePath: typeof meta?.storagePath === "string" ? meta.storagePath : undefined,
        fileName: typeof meta?.fileName === "string" ? meta.fileName : undefined,
        mediaKind:
          meta?.mediaKind === "image" || meta?.mediaKind === "video" || meta?.mediaKind === "audio"
            ? meta.mediaKind
            : undefined,
        mediaUrl: typeof meta?.mediaUrl === "string" ? meta.mediaUrl : undefined,
        priceCents: typeof meta?.priceCents === "number" ? meta.priceCents : undefined,
        description: typeof item.body === "string" ? item.body : undefined,
        linkUrl: safeType === "Pay" && href ? href : undefined,
        payProvider:
          meta?.payProvider === "authorize_net_accept_hosted" ||
          meta?.payProvider === "payment_link"
            ? meta.payProvider
            : undefined,
        customizations: normalizeDropCustomizations(
          meta?.customizations ?? preview?.customizations
        ),
      };
    }

    function payDropToDrop(drop: PayDrop): DropItem {
      return {
        id: drop.id,
        title: drop.title,
        type: "Pay",
        createdAt: drop.createdAt || drop.updatedAt || Date.now(),
        bucket: drop.bucket,
        storagePath: drop.storagePath,
        mediaKind: drop.mediaKind,
        priceCents: drop.amountCents,
        description: drop.description,
        linkUrl: drop.checkoutUrl,
        payProvider: drop.provider,
      };
    }

    async function syncBoardDrops() {
      try {
        const sb = supabaseBrowser();
        let profileRow: { id?: string | null; board_style?: RemoteBoardStyle | null } | null = null;

        const { data: byUsername } = await sb
          .from("profiles")
          .select("id, board_style")
          .eq("username", routeKey)
          .maybeSingle();

        profileRow = byUsername ?? null;

        if (!profileRow) {
          const { data: byId } = await sb
            .from("profiles")
            .select("id, board_style")
            .eq("id", routeKey)
            .maybeSingle();

          profileRow = byId ?? null;
        }

        const boardStyle =
          profileRow?.board_style && typeof profileRow.board_style === "object"
            ? profileRow.board_style
            : null;
        const remoteDeletedIds = normalizeDeletedDropIds(boardStyle?.boardDropsDeleted);
        const localDeletedIds = routeKey === "johnandy" ? readLocalDeletedDropIds() : [];
        const deletedIds = Array.from(new Set([...remoteDeletedIds, ...localDeletedIds]));

        const raw = routeKey === "johnandy" ? window.localStorage.getItem(DROP_STORAGE_KEY) : null;
        const parsed = raw ? JSON.parse(raw) : [];
        const localDrops = routeKey === "johnandy" ? normalizeDrops(parsed) : [];
        const localPayDrops = routeKey === "johnandy" ? readPayDrops(null, true).map(payDropToDrop) : [];
        const remoteDrops = normalizeDrops(boardStyle?.boardDrops);

        let activityDrops: DropItem[] = [];
        if (profileRow?.id) {
          const { data: activityRows } = await sb
            .from("board_activity")
            .select("*")
            .eq("user_id", profileRow.id)
            .eq("kind", "board_drop")
            .order("created_at", { ascending: false })
            .limit(60);

          activityDrops = Array.isArray(activityRows)
            ? activityRows
                .map((item) => activityToDrop(item as BoardActivity))
                .filter((item): item is DropItem => Boolean(item))
            : [];
        }
        const localActivityDrops =
          routeKey === "johnandy"
            ? getLocalActivity()
                .filter((item) => activityBelongsToProfile(item, profileRow?.id, routeKey))
                .map(activityToDrop)
                .filter((item): item is DropItem => Boolean(item))
            : [];

        const mergedDrops = mergeDrops(
          remoteDrops,
          activityDrops,
          localActivityDrops,
          localPayDrops,
          localDrops
        ).filter(
          (drop) => !deletedIds.includes(drop.id)
        );

        if (!cancelled) {
          setBoardDrops(mergedDrops);
          setBoardDropsLoading(false);
        }
      } catch {
        if (!cancelled && routeKey === "johnandy") {
          const raw = window.localStorage.getItem(DROP_STORAGE_KEY);
          const parsed = raw ? JSON.parse(raw) : [];
          const localDrops = normalizeDrops(parsed);
          const localPayDrops = readPayDrops(null, true).map(payDropToDrop);
          const localActivityDrops = getLocalActivity()
            .filter((item) => activityBelongsToProfile(item, null, routeKey))
            .map(activityToDrop)
            .filter((item): item is DropItem => Boolean(item));
          const deletedIds = readLocalDeletedDropIds();
          setBoardDrops(
            mergeDrops(localActivityDrops, localPayDrops, localDrops).filter(
              (drop) => !deletedIds.includes(drop.id)
            )
          );
          return;
        }
        if (!cancelled) setBoardDrops([]);
      } finally {
        if (!cancelled) setBoardDropsLoading(false);
      }
    }

    void syncBoardDrops();

    function onStorage(event: StorageEvent) {
      if (
        routeKey === "johnandy" &&
        (event.key === null ||
          event.key === DROP_STORAGE_KEY ||
          event.key === DROP_DELETED_STORAGE_KEY)
      ) {
        void syncBoardDrops();
      }
    }

    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
    };
  }, [routeKey]);

  useEffect(() => {
    function onDropUpdated(e: Event) {
      const detail = (e as CustomEvent).detail || {};
      const dropId = typeof detail.dropId === "string" ? detail.dropId : "";
      const drop = detail.drop;
      if (!dropId || !drop || typeof drop !== "object") return;
      setBoardDrops((prev) =>
        prev.map((d) => (d.id === dropId ? { ...d, ...(drop as DropItem) } : d))
      );
    }
    window.addEventListener("board:drop:updated", onDropUpdated as EventListener);
    return () =>
      window.removeEventListener("board:drop:updated", onDropUpdated as EventListener);
  }, []);

  useEffect(() => {
    if (!boardDrops.length) return;
    let cancelled = false;

    async function hydrateSignedUrls() {
      const supabase = supabaseBrowser();
      const next: Record<string, string> = {};

      for (const drop of boardDrops) {
        if (!drop.bucket || !drop.storagePath) continue;
        const key = `${drop.bucket}:${drop.storagePath}`;
        if (signedUrlByKey[key]) continue;

        const { data, error } = await supabase.storage
          .from(drop.bucket)
          .createSignedUrl(drop.storagePath, 60 * 45);

        if (cancelled || error || !data?.signedUrl) continue;
        next[key] = data.signedUrl;
      }

      if (!cancelled && Object.keys(next).length > 0) {
        setSignedUrlByKey((prev) => ({ ...prev, ...next }));
      }
    }

    hydrateSignedUrls();
    return () => {
      cancelled = true;
    };
  }, [boardDrops, signedUrlByKey]);

  useEffect(() => {
    let cancelled = false;

    async function refreshProfileImageUrls() {
      const avatarPath = profile.avatarPath;
      const coverPath = profile.coverPath;
      const visionPaths =
        Array.isArray(profile.visionSlotPaths) && profile.visionSlotPaths.length === 6
          ? profile.visionSlotPaths
          : [];

      if (!avatarPath && !coverPath && !visionPaths.some(Boolean)) return;

      const supabase = supabaseBrowser();
      const patch: Partial<StaticProfile> = {};

      if (avatarPath) {
        const { data } = await supabase.storage
          .from("board-avatars")
          .createSignedUrl(avatarPath, 60 * 60 * 24 * 7);
        if (data?.signedUrl) patch.avatarDataUrl = data.signedUrl;
      }

      if (coverPath) {
        const { data } = await supabase.storage
          .from("board-images")
          .createSignedUrl(coverPath, 60 * 60 * 24 * 7);
        if (data?.signedUrl) patch.coverDataUrl = data.signedUrl;
      }

      if (visionPaths.some(Boolean)) {
        const nextSlots = [...profile.visionSlots];
        for (let i = 0; i < visionPaths.length; i += 1) {
          const path = visionPaths[i];
          if (!path) continue;
          const { data } = await supabase.storage
            .from("board-images")
            .createSignedUrl(path, 60 * 60 * 24 * 7);
          if (data?.signedUrl) nextSlots[i] = data.signedUrl;
        }
        patch.visionSlots = nextSlots;
      }

      if (!cancelled && Object.keys(patch).length > 0) {
        setProfile((prev) => ({ ...prev, ...patch }));
      }
    }

    void refreshProfileImageUrls();

    return () => {
      cancelled = true;
    };
  }, [profile.avatarPath, profile.coverPath, profile.visionSlotPaths, profile.visionSlots]);

  const aura = useMemo(() => {
    const intensity = auraIntensity / 100;
    return {
      border: hexToRgba(profile.glowColor, 0.38 + intensity * 0.22),
      ring: `0 0 0 1px ${hexToRgba(profile.glowColor, 0.16 + intensity * 0.14)}, 0 0 ${22 + intensity * 20}px ${hexToRgba(profile.glowColor, 0.18)}, 0 0 ${48 + intensity * 36}px ${hexToRgba(profile.glowColor, 0.22)}`,
      glow: hexToRgba(profile.glowColor, 0.18 + intensity * 0.18),
    };
  }, [profile.glowColor, auraIntensity]);

  const mood = AURA_MOODS[profile.auraMood] ?? AURA_MOODS.locked_in;
  const signalLabel = signalLabelFromColor(profile.glowColor);
  const boardDropActivityFallback = useMemo(
    () =>
      recentDrops.filter((item) => {
        const kind = String((item as any)?.kind || (item as any)?.type || "");
        const title = String(item.title || "");
        return kind === "board_drop" && !title.startsWith("Project Drop:");
      }),
    [recentDrops]
  );

  const profileActivityChannelDrops = useMemo(
    () =>
      resolveProfileActivityDrops(recentDrops, boardDrops, {
        userId: remoteUserId,
        username: routeKey,
        displayName: profile.displayName,
      }, { viewerIsOwner: true }),
    [recentDrops, boardDrops, remoteUserId, routeKey, profile.displayName]
  );

  async function openPayCheckout(drop: DropItem) {
    const explicitPaymentLink = drop.payProvider === "payment_link" && drop.linkUrl;

    if (explicitPaymentLink) {
      window.open(explicitPaymentLink, "_blank", "noopener,noreferrer");
      return;
    }

    const shouldUseHostedCheckout =
      drop.payProvider === "stripe_connect" ||
      drop.payProvider === "authorize_net_accept_hosted" ||
      (drop.type === "Pay" && !!drop.priceCents);

    if (!shouldUseHostedCheckout) {
      return;
    }

    try {
      setPayCheckoutBusyId(drop.id);
      await openHostedPayDropCheckout({
        payDropId: drop.id,
        title: drop.title,
        description: drop.description,
        amountCents: drop.priceCents ?? 0,
      });
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Could not open National Bankcard checkout."
      );
    } finally {
      setPayCheckoutBusyId(null);
    }
  }

  function readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error ?? new Error("Could not read image file."));
      reader.readAsDataURL(file);
    });
  }

  function writeLocalProfilePatch(patch: Partial<ProfilePayload>) {
    try {
      const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
      const current = raw ? JSON.parse(raw) : {};
      const nextProfile = sanitizeProfileForStorage({
        ...current,
        ...patch,
      });
      writeLightweightLocalStorage(PROFILE_STORAGE_KEY, nextProfile);

      if (remoteUserId) {
        writeLightweightLocalStorage(`${PROFILE_STORAGE_KEY}:${remoteUserId}`, nextProfile);
      }

      const optionsRaw = window.localStorage.getItem(OPTIONS_STORAGE_KEY);
      const options = optionsRaw ? JSON.parse(optionsRaw) : {};
      const optionPatch: Partial<ProfilePayload> = {};
      if ("avatarDataUrl" in patch) optionPatch.avatarDataUrl = null;
      if ("avatarUrl" in patch) optionPatch.avatarUrl = patch.avatarUrl ?? null;
      if ("avatarPath" in patch) optionPatch.avatarPath = patch.avatarPath ?? null;
      if ("coverDataUrl" in patch) optionPatch.coverDataUrl = null;
      if ("coverPath" in patch) optionPatch.coverPath = patch.coverPath ?? null;
      if ("visionSlots" in patch) optionPatch.visionSlots = patch.visionSlots;
      if ("visionSlotPaths" in patch) optionPatch.visionSlotPaths = patch.visionSlotPaths;
      writeLightweightLocalStorage(
        OPTIONS_STORAGE_KEY,
        sanitizeBoardOptionsForStorage({ ...options, ...optionPatch })
      );

      window.dispatchEvent(new Event("storage"));
      window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT, { detail: nextProfile }));
    } catch {
      // Profile still updates visually even if local persistence is unavailable.
    }
  }

  // Surface an energy change as an immediate pastel whisper in the Activity Channel.
  function notifyEnergyChange(level: number) {
    setVisitWhispers((prev) =>
      [
        createBoardWhisper({
          id: `energy-${Date.now()}`,
          tone: "signal",
          text: `Energy set to ${level}. Your board hums at a new frequency.`,
        }),
        ...prev,
      ].slice(0, 6)
    );
  }

  async function persistBoardStylePatch(patch: Partial<RemoteBoardStyle>) {
    try {
      const sb = supabaseBrowser();
      const { data: auth } = await sb.auth.getUser();
      const userId = auth?.user?.id;
      if (!userId) return;
      if (remoteUserId && remoteUserId !== userId) return;

      const { data } = await sb
        .from("profiles")
        .select("board_style")
        .eq("id", userId)
        .maybeSingle();
      const boardStyle =
        data?.board_style && typeof data.board_style === "object"
          ? (data.board_style as RemoteBoardStyle)
          : {};

      await sb
        .from("profiles")
        .update({
          board_style: sanitizeProfileForStorage({
            ...boardStyle,
            ...patch,
          }),
        })
        .eq("id", userId);
    } catch {
      // Local-first profile edits should not fail just because remote sync is unavailable.
    }
  }

  function fileExtension(file: File) {
    const fromName = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (fromName) return fromName;
    if (file.type.includes("png")) return "png";
    if (file.type.includes("webp")) return "webp";
    return "jpg";
  }

  async function uploadProfileImagePath(
    file: File,
    bucket: "board-avatars" | "board-images",
    label: string
  ) {
    const sb = supabaseBrowser();
    const { data: auth } = await sb.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return "";

    const path = `${userId}/${label}-${Date.now()}.${fileExtension(file)}`;
    const { error } = await sb.storage
      .from(bucket)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type || "image/jpeg",
      });

    if (error) return "";
    return path;
  }

  async function handleAvatarFile(file: File | null) {
    if (!file || !file.type.startsWith("image/")) return;
    const processed = await ensureImageFileMinResolution(file);
    const dataUrl = await readFileAsDataUrl(processed);
    setProfile((prev) => ({ ...prev, avatarDataUrl: dataUrl }));

    const path = await uploadProfileImagePath(processed, "board-avatars", "avatar");
    if (path) {
      setProfile((prev) => ({ ...prev, avatarPath: path }));
      writeLocalProfilePatch({ avatarDataUrl: null, avatarPath: path });
      void persistBoardStylePatch({ avatarDataUrl: null, avatarPath: path });
    } else {
      writeLocalProfilePatch({ avatarDataUrl: null });
      void persistBoardStylePatch({ avatarDataUrl: null });
    }
  }

  async function handleCoverFile(file: File | null) {
    if (!file || !file.type.startsWith("image/")) return;
    const processed = await ensureImageFileMinResolution(file);
    const dataUrl = await readFileAsDataUrl(processed);
    setProfile((prev) => ({ ...prev, coverDataUrl: dataUrl }));

    const path = await uploadProfileImagePath(processed, "board-images", "cover");
    if (path) {
      setProfile((prev) => ({ ...prev, coverPath: path }));
      writeLocalProfilePatch({ coverDataUrl: null, coverPath: path });
      void persistBoardStylePatch({ coverDataUrl: null, coverPath: path });
    } else {
      writeLocalProfilePatch({ coverDataUrl: null });
      void persistBoardStylePatch({ coverDataUrl: null });
    }
  }

  async function handleVisionFile(file: File | null, slotIndex: number) {
    if (!file || !file.type.startsWith("image/")) return;
    const index = Math.max(0, Math.min(5, slotIndex));
    const processed = await ensureImageFileMinResolution(file);
    const dataUrl = await readFileAsDataUrl(processed);
    const nextSlots = [...profile.visionSlots];
    nextSlots[index] = dataUrl;
    const nextPaths =
      Array.isArray(profile.visionSlotPaths) && profile.visionSlotPaths.length === 6
        ? [...profile.visionSlotPaths]
        : Array.from({ length: 6 }, () => null);

    setProfile((prev) => ({ ...prev, visionSlots: nextSlots }));

    const path = await uploadProfileImagePath(processed, "board-images", `vision-${index + 1}`);
    if (path) {
      nextPaths[index] = path;
      setProfile((prev) => ({ ...prev, visionSlotPaths: nextPaths }));
      writeLocalProfilePatch({ visionSlots: nextSlots, visionSlotPaths: nextPaths });
      void persistBoardStylePatch({ visionSlotPaths: nextPaths });
    } else {
      writeLocalProfilePatch({ visionSlots: nextSlots });
    }
  }

  function removeAvatar() {
    setProfile((prev) => ({ ...prev, avatarDataUrl: null, avatarPath: null }));
    writeLocalProfilePatch({ avatarDataUrl: null, avatarPath: null });
    void persistBoardStylePatch({ avatarDataUrl: null, avatarPath: null });
  }

  return (
    <main className="min-h-screen board-bg text-black">
      <input
        ref={avatarInputRef}
        className="sr-only-file"
        type="file"
        accept="image/*"
        onChange={(event) => {
          void handleAvatarFile(event.currentTarget.files?.[0] ?? null);
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={coverInputRef}
        className="sr-only-file"
        type="file"
        accept="image/*"
        onChange={(event) => {
          void handleCoverFile(event.currentTarget.files?.[0] ?? null);
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={visionInputRef}
        className="sr-only-file"
        type="file"
        accept="image/*"
        onChange={(event) => {
          void handleVisionFile(
            event.currentTarget.files?.[0] ?? null,
            pendingVisionSlotRef.current
          );
          event.currentTarget.value = "";
        }}
      />
      <section className="profile-board-section mx-auto max-w-[1500px] pb-24 pt-14">
        <div className="poster-board" style={{ boxShadow: aura.ring, borderColor: aura.border }}>
          <div className="board-top">
            <div>
              <div className="board-title">JAB Visions™ Board</div>
              <div className="board-subtitle">
                {profileRouteLoading
                  ? "Loading your saved profile board..."
                  : "Profile: your personal vision wall inside the Board"}
              </div>
            </div>

            <div className="board-top-right">
              <Link href="/board" className="board-pill-link">
                ← Back
              </Link>
              <Link href="/board/options" className="board-pill-link">
                Options
              </Link>
              <Link href="/board/options" className="board-pill-cta">
                Add photos + avatar
              </Link>
            </div>
          </div>

          <div className="profile-grid">
            <div className="left-column">
              <div className="profile-left-stack">
              <section className="inner-tile profile-panel-vision">
                <div className="tile-head">
                  <div>
                    <div className="tile-title">Vision Wall</div>
                    <div className="tile-sub">Six snapshots of what you’re becoming.</div>
                  </div>
                </div>

                <div className="vision-grid">
                  {profile.visionSlots.map((img, idx) => (
                    <div key={idx} className="vision-slot">
                      {img ? (
                        <>
                          <button
                            type="button"
                            className="vision-image-button"
                            onClick={() =>
                              setExpandedPhoto({ src: img, label: `Vision wall slot ${idx + 1}` })
                            }
                            aria-label={`Expand vision wall slot ${idx + 1}`}
                          >
                            <img className="vision-img" src={img} alt={`Vision slot ${idx + 1}`} />
                            <span className="vision-expand-hint">Expand</span>
                          </button>
                          <button
                            type="button"
                            className="vision-replace-btn"
                            onClick={() => {
                              pendingVisionSlotRef.current = idx;
                              visionInputRef.current?.click();
                            }}
                          >
                            Replace
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="vision-empty"
                          onClick={() => {
                            pendingVisionSlotRef.current = idx;
                            visionInputRef.current?.click();
                          }}
                          aria-label={`Add vision wall slot ${idx + 1}`}
                        >
                          <div className="plus">+</div>
                          <div className="label">ADD PHOTO</div>
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <p className="vision-hint">
                  Tip: these can be moodboards, goals, film stills, or icons of your era. Tap a slot to add or swap.
                </p>
                <div className="vision-cta-row">
                  <button
                    type="button"
                    className="tiny-cta"
                    onClick={() => {
                      pendingVisionSlotRef.current = profile.visionSlots.findIndex((slot) => !slot);
                      if (pendingVisionSlotRef.current < 0) pendingVisionSlotRef.current = 0;
                      visionInputRef.current?.click();
                    }}
                  >
                    Update vision wall →
                  </button>
                </div>
              </section>

              <div className="profile-panel-drops">
                <DropTile />
              </div>
              </div>
            </div>

            <div className="center-column">
              <div className="profile-right-stack">
              <CoverPosterPanel
                coverDataUrl={profile.coverDataUrl}
                coverInputRef={coverInputRef}
                onExpand={(src) => setExpandedPhoto({ src, label: "Cover poster" })}
                className=""
              />
              <section className="inner-tile identity profile-panel-identity">
                <div className="identity-row">
                  <button
                    type="button"
                    className="avatar-shell avatar-shell-button"
                    style={{ boxShadow: aura.ring, borderColor: aura.border }}
                    onClick={() => {
                      if (profile.avatarDataUrl) {
                        setExpandedPhoto({ src: profile.avatarDataUrl, label: `${profile.displayName} avatar` });
                      } else {
                        avatarInputRef.current?.click();
                      }
                    }}
                    aria-label={profile.avatarDataUrl ? "Expand profile avatar" : "Add profile avatar"}
                  >
                    <div className="avatar-inner">
                      {profile.avatarDataUrl ? (
                        <img src={profile.avatarDataUrl} alt={profile.displayName} className="avatar-img" />
                      ) : (
                        <div className="avatar-placeholder">{profile.displayName.slice(0, 1)}</div>
                      )}
                    </div>
                  </button>

                  <div className="identity-meta">
                    <h1 className="name">{profile.displayName}</h1>
                    <div className="status-pill aura-active">Aura active</div>
                    <p className="bio">{profile.bio}</p>
                    <div className="profile-pills">
                      <span>Drops: <b>{boardDropsLoading ? "..." : boardDrops.length}</b></span>
                      <span>Glow: <b>{signalLabel}</b></span>
                      <span>Mode: <b>Public</b></span>
                    </div>

                    <div
                      className="energy-row"
                      style={
                        {
                          "--board-glow": profile.glowColor,
                          "--energy": `${profile.energyLevel ?? 60}%`,
                        } as React.CSSProperties
                      }
                    >
                      <div className="energy-head">
                        <span className="energy-label">Energy</span>
                        <span className="energy-value">{profile.energyLevel ?? 60}</span>
                      </div>
                      <input
                        className="energy-slider"
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={profile.energyLevel ?? 60}
                        onChange={(e) =>
                          setProfile((p) => ({ ...p, energyLevel: Number(e.target.value) }))
                        }
                        onPointerUp={() => {
                          const level = profile.energyLevel ?? 60;
                          void persistBoardStylePatch({ energyLevel: level });
                          notifyEnergyChange(level);
                        }}
                        aria-label="Energy level"
                      />
                    </div>
                    <div className="micro-row">
                      <div className="micro-tile">
                        <span className="micro-num">{passCount}</span>
                        <span className="micro-cap">Passes</span>
                      </div>
                      <Link href="/board/work" className="micro-tile micro-link">
                        <span className="micro-ico" aria-hidden>🗂️</span>
                        <span className="micro-cap">Work Board</span>
                      </Link>
                      <button
                        type="button"
                        className="micro-tile micro-link"
                        onClick={() => setStickerBinOpen(true)}
                      >
                        <span className="micro-ico" aria-hidden>🩷</span>
                        <span className="micro-cap">Sticker Bin</span>
                      </button>
                    </div>
                    <div className="avatar-actions">
                      <button
                        type="button"
                        className="board-pill-link"
                        onClick={() => avatarInputRef.current?.click()}
                      >
                        Change avatar
                      </button>
                      <button
                        type="button"
                        className="board-pill-link"
                        onClick={removeAvatar}
                      >
                        Remove avatar
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              <section className="inner-tile profile-panel-aura">
                <div className="tile-head">
                  <div>
                    <div className="tile-title">Aura Snapshot</div>
                    <div className="tile-sub">Shape the pulse of your board right here from Profile.</div>
                  </div>
                  <span className="aura-swatch" style={{ background: profile.glowColor, boxShadow: `0 0 24px ${aura.glow}` }} />
                </div>

                <div className="snap-grid">
                  <div className="snap-card">
                    <div className="snap-label">Energy</div>
                    <div className="snap-value">{auraIntensity}%</div>
                    <div className="energy-bar">
                      <div className="energy-fill" style={{ width: `${auraIntensity}%`, background: profile.glowColor }} />
                    </div>
                  </div>

                  <div className="snap-card">
                    <div className="snap-label">Vibe</div>
                    <div className="snap-value">
                      {mood.emoji} {mood.label}
                    </div>
                  </div>

                  <div className="snap-card">
                    <div className="snap-label">Signal</div>
                    <div className="signal-row">
                      <span className="signal-dot" style={{ background: profile.glowColor, boxShadow: `0 0 18px ${aura.glow}` }} />
                      <span className="snap-value">{signalLabel}</span>
                    </div>
                  </div>

                  <div className="snap-card">
                    <div className="snap-label">Intent</div>
                    <div className="snap-value">Friend Zone</div>
                  </div>
                </div>
              </section>

              <section className="inner-tile profile-panel-activity">
                <div className="tile-head">
                  <div>
                    <div className="tile-title">Activity Channel</div>
                    <div className="tile-sub">Drops, signals, and soft Board Whispers moving through this profile.</div>
                  </div>
                  <Link href="/board/feed" className="tiny-cta">Open feed</Link>
                </div>

                {recentDropsLoading ? (
                  <div className="note-card">
                    <div className="note-title">Loading Activity Channel…</div>
                    <div className="note-text">
                      Pulling live board activity into this profile preview.
                    </div>
                  </div>
                ) : profileActivityChannelDrops.length > 0 ? (
                  <div className="recent-drops-stack activity-feed-stack">
                    {visitWhispers.map((whisper) => (
                      <BoardWhisper key={whisper.id} whisper={whisper} />
                    ))}

                    {profileActivityChannelDrops.map((item, index) => {
                      const whispers = deriveActivityWhispers(item, index);

                      return (
                        <div key={item.id} className="activity-feed-entry">
                          <ActivityCard item={item} compact />
                          {whispers.map((whisper) => (
                            <BoardWhisper key={whisper.id} whisper={whisper} />
                          ))}
                        </div>
                      );
                    })}
                  </div>
                ) : visitWhispers.length > 0 ? (
                  <div className="recent-drops-stack activity-feed-stack">
                    {visitWhispers.map((whisper) => (
                      <BoardWhisper key={whisper.id} whisper={whisper} />
                    ))}
                  </div>
                ) : (
                  <div className="note-card">
                    <div className="note-title">No activity yet.</div>
                    <div className="note-text">
                      Drops, signals, and whispers will show here as soon as they land.
                    </div>
                  </div>
                )}
              </section>
              </div>
            </div>

          </div>

          <StoreCollectionPanel
            slots={storeDropSlots}
            className="profile-store-drops-bottom"
          />
        </div>
      </section>

      {expandedPhoto ? (
        <div
          className="photo-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={expandedPhoto.label}
          onClick={() => setExpandedPhoto(null)}
        >
          <button
            type="button"
            className="photo-lightbox-close"
            onClick={() => setExpandedPhoto(null)}
          >
            Close
          </button>
          <img
            className="photo-lightbox-img"
            src={expandedPhoto.src}
            alt={expandedPhoto.label}
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}


      {stickerBinOpen ? (
        <div
          className="sticker-bin-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Sticker collection bin"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setStickerBinOpen(false);
          }}
        >
          <div className="sticker-bin">
            <div className="sticker-bin-head">
              <div>
                <div className="sticker-bin-eyebrow">Collection</div>
                <h3 className="sticker-bin-title">Sticker Bin</h3>
              </div>
              <button
                type="button"
                className="sticker-bin-close"
                onClick={() => setStickerBinOpen(false)}
                aria-label="Close sticker bin"
              >
                ✕
              </button>
            </div>
            <div className="sticker-bin-body">
              {STICKER_PACKS.map((pack) => (
                <div className="sticker-pack" key={pack.id}>
                  <div className="sticker-pack-name">{pack.name}</div>
                  <div className="sticker-bin-grid">
                    {pack.items.map((item) => (
                      <div
                        className="sticker-cell"
                        key={`${pack.id}-${item.value}`}
                        title={item.label}
                      >
                        {item.src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.src} alt={item.label} />
                        ) : (
                          <span>{item.value}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      ) : null}
    </main>
  );
}
