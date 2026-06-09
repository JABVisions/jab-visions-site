"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import ActivityCard from "@/app/components/board/ActivityCard";
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
import { resolveLinkPreviewImage } from "@/lib/board/linkPreviewImages";
import {
  normalizeDropCustomizations,
  type DropCustomization,
} from "@/lib/board/dropCustomizations";
import { recordBoardVisitWhisper } from "@/lib/board/visitWhispers";
import {
  PROFILE_ACTIVITY_WHISPERS,
  type BoardWhisper as ProfileWhisper,
} from "@/lib/board/whispers";
import { supabaseBrowser } from "@/lib/supabase/browser";
import DropStudioOverlay from "@/app/components/board/DropStudioOverlay";

const PROFILE_STORAGE_KEY = "jab_board_profile_v2";
const OPTIONS_STORAGE_KEY = "board.options.v1";
const DROP_STORAGE_KEY = "jab_board_drops_v2";
const DROP_DELETED_STORAGE_KEY = "jab_board_drops_deleted_v1";
const ACTIVITY_CHANNEL_LIMIT = 80;

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

function displayDropType(type: DropType) {
  return type === "Media" ? "Vision" : type;
}

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

export default function ProfileBoardViewPage({
  params,
}: {
  params: { username: string };
}) {
  const searchParams = useSearchParams();

  const routeKey = normalizeUserKey(decodeURIComponent(params.username));
  const fallbackName = searchParams.get("name")?.trim() || "";
  const fallbackAvatar = searchParams.get("avatar")?.trim() || "";
  const fallbackState = searchParams.get("state")?.trim() || "";
  const fallbackLastActive = searchParams.get("lastActive")?.trim() || "";

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
  const [remoteUserId, setRemoteUserId] = useState<string | null>(null);
  const [selfUser, setSelfUser] = useState("");
  const [waveNotice, setWaveNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSelfUser() {
      try {
        const sb = supabaseBrowser();
        const {
          data: { user },
        } = await sb.auth.getUser();

        if (!user) {
          if (!cancelled) setSelfUser("");
          return;
        }

        const { data: profileRow } = await sb
          .from("profiles")
          .select("username")
          .eq("id", user.id)
          .maybeSingle();

        const nextSelf = normalizeUserKey(
          String(profileRow?.username || user.email?.split("@")[0] || "")
        );
        if (!cancelled) setSelfUser(nextSelf);
      } catch {
        if (!cancelled) setSelfUser("");
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
    if (!routeKey || !selfUser || routeKey === selfUser) return;
    recordBoardVisitWhisper({
      owner: routeKey,
      visitor: selfUser,
      visitorLabel: `@${selfUser}`,
    });
  }, [routeKey, selfUser]);

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
    const base = STATIC_PROFILES[routeKey] ?? fallbackFromOrb;
    setProfile(base);
    setAuraIntensity(70);
    setBucketStats(null);
    setRemoteUserId(null);
  }, [routeKey, fallbackFromOrb]);

  useEffect(() => {
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
          glowColor: resolveBoardGlow(boardStyle, base.glowColor),
          auraMood: boardStyle?.auraMood ?? base.auraMood,
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
          `/api/board/activity?limit=${ACTIVITY_CHANNEL_LIMIT}`,
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

        setRecentDrops(dedupeActivity(visibleItems));
        setRecentDropsLoading(false);
      } catch {
        if (cancelled) return;
        setRecentDrops([]);
        setRecentDropsLoading(false);
      }
    }

    void loadRemoteRecentDrops();

    return () => {
      cancelled = true;
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
        ).slice(0, ACTIVITY_CHANNEL_LIMIT)
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
      if (isDropTileActivity(detail) && (!dropId || !readLocalDropIds().includes(dropId))) return;
      setRecentDrops((prev) => dedupeActivity([detail, ...prev]).slice(0, ACTIVITY_CHANNEL_LIMIT));
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
        const deletedIds = Array.from(new Set(remoteDeletedIds));

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
        const mergedDrops = mergeDrops(
          remoteDrops,
          activityDrops
        ).filter(
          (drop) => !deletedIds.includes(drop.id)
        );

        if (!cancelled) {
          setBoardDrops(mergedDrops);
          setBoardDropsLoading(false);
        }
      } catch {
        if (!cancelled) setBoardDrops([]);
      } finally {
        if (!cancelled) setBoardDropsLoading(false);
      }
    }

    void syncBoardDrops();

    function onStorage(event: StorageEvent) {
      if (
        event.key === null ||
        event.key === DROP_STORAGE_KEY ||
        event.key === DROP_DELETED_STORAGE_KEY
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
  const boardDropActivityFallback = useMemo(
    () =>
      recentDrops.filter((item) => {
        const kind = String((item as any)?.kind || (item as any)?.type || "");
        const title = String(item.title || "");
        return kind === "board_drop" && !title.startsWith("Project Drop:");
      }),
    [recentDrops]
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

  return (
    <main className="min-h-screen board-bg text-black">
      <section className="mx-auto max-w-[1500px] px-4 pb-24 pt-14 sm:px-6 lg:px-8">
        <div className="poster-board" style={{ boxShadow: aura.ring, borderColor: aura.border }}>
          <div className="board-top">
            <div>
              <div className="board-title">JAB Visions™ Board</div>
              <div className="board-subtitle">View-only profile board</div>
            </div>

            <div className="board-top-right">
              <Link href="/board/explore" className="board-pill-link">
                ← Explore
              </Link>
              {routeKey === "johnandy" ? (
                <Link href="/board/profile" className="board-pill-cta">
                  Open editable board
                </Link>
              ) : null}
            </div>
          </div>

          <div className="profile-grid">
            <div className="left-column">
              <section className="inner-tile">
                <div className="tile-head">
                  <div>
                    <div className="tile-title">Vision Wall</div>
                    <div className="tile-sub">Snapshots from this board era.</div>
                  </div>
                </div>

                <div className="vision-grid">
                  {profile.visionSlots.map((img, idx) => (
                    <div key={idx} className="vision-slot">
                      {img ? (
                        <img className="vision-img" src={img} alt={`Vision slot ${idx + 1}`} />
                      ) : (
                        <div className="vision-empty">
                          <div className="plus">+</div>
                          <div className="label">NO DROP</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <section className="inner-tile">
                <div className="tile-head">
                  <div>
                    <div className="tile-title">Aura Snapshot</div>
                    <div className="tile-sub">Current board signal.</div>
                  </div>
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
                      <span className="snap-value">Active</span>
                    </div>
                  </div>

                  <div className="snap-card">
                    <div className="snap-label">Intent</div>
                    <div className="snap-value">Public Board</div>
                  </div>
                </div>
              </section>

              <section className="inner-tile">
                <div className="tile-head board-drop-head">
                  <div>
                    <div className="tile-title">Board Drop</div>
                    <div className="tile-sub">This board’s saved drop collection.</div>
                  </div>
                  <div className="board-drop-side-avatar" style={{ boxShadow: aura.ring, borderColor: aura.border }}>
                    <div className="board-drop-side-avatar-inner">
                      {profile.avatarDataUrl ? (
                        <img src={profile.avatarDataUrl} alt={profile.displayName} className="board-drop-side-avatar-img" />
                      ) : (
                        <div className="board-drop-side-avatar-fallback">
                          {profile.displayName.slice(0, 1)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {boardDropsLoading ? (
                  <div className="note-card">
                    <div className="note-title">Loading board drops…</div>
                    <div className="note-text">
                      Pulling the saved drop collection from this board tile.
                    </div>
                  </div>
                ) : boardDrops.length > 0 ? (
                  <div className="board-drop-stack">
                    {boardDrops.map((drop) => {
                      const signedKey =
                        drop.bucket && drop.storagePath
                          ? `${drop.bucket}:${drop.storagePath}`
                          : "";
                      const signedUrl = signedKey ? signedUrlByKey[signedKey] : undefined;
                      const isMedia =
                        drop.type === "Media" || drop.type === "Pay" || drop.mediaKind === "audio";
                      const isSpotifyEmbed =
                        typeof drop.embedUrl === "string" &&
                        drop.embedUrl.includes("open.spotify.com/embed");
                      const isAppleMusicEmbed =
                        typeof drop.embedUrl === "string" &&
                        drop.embedUrl.includes("embed.music.apple.com");
                      const embedHeight = getBoardDropEmbedHeight(drop.embedUrl);
                      const isLinkDrop = (drop.type === "Link" || drop.type === "News") && !!drop.url;
                      const linkCover = resolveLinkPreviewImage(
                        drop.url,
                        drop.previewImage || (drop.url ? newsCoverUrl(drop.url) : null)
                      );
                      const linkTitle = drop.previewTitle || drop.headline || drop.title;
                      const linkLabel = drop.type === "News" ? "News Drop" : "Link Drop";

                      return (
                        <div key={drop.id} className="board-drop-item">
                          <div className="board-drop-top">
                            <div className="board-drop-title">{drop.title}</div>
                            <div className="board-drop-badges">
                              <span className="board-drop-badge">{displayDropType(drop.type)}</span>
                              {drop.hostLabel ? (
                                <span className="board-drop-badge ghost">{drop.hostLabel}</span>
                              ) : null}
                              {drop.priceCents ? (
                                <span className="board-drop-badge ghost">
                                  {formatPriceFromCents(drop.priceCents)}
                                </span>
                              ) : null}
                            </div>
                          </div>

                          {isMedia && signedUrl ? (
                            <div
                              className={`board-drop-media-frame ${
                                drop.mediaKind === "video"
                                  ? "video"
                                  : drop.mediaKind === "audio"
                                    ? "audio"
                                    : "image"
                              }`}
                            >
                              {drop.mediaKind === "audio" ? (
                                <div className="board-drop-audio">
                                  <div className="board-drop-audio-label">Full song</div>
                                  <audio className="board-drop-audio-player" src={signedUrl} controls preload="metadata" />
                                </div>
                              ) : drop.mediaKind === "video" ? (
                                <video className="board-drop-media" src={signedUrl} controls playsInline preload="metadata" />
                              ) : (
                                <img className="board-drop-media" src={signedUrl} alt={drop.title} />
                              )}
                              {drop.type === "Media" ? (
                                <DropStudioOverlay customizations={drop.customizations} />
                              ) : null}
                            </div>
                          ) : drop.embedUrl ? (
                            <div
                              className={`board-drop-embed ${isSpotifyEmbed ? "spotify" : ""} ${isAppleMusicEmbed ? "apple-music" : ""}`}
                              style={{ height: `${embedHeight}px` }}
                            >
                              <iframe
                                src={drop.embedUrl}
                                title={drop.title}
                                width="100%"
                                height={String(embedHeight)}
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                allowFullScreen
                                loading="lazy"
                                scrolling="no"
                                className={isSpotifyEmbed ? "spotify-frame" : undefined}
                              />
                            </div>
                          ) : isLinkDrop ? (
                            <a className="board-link-preview" href={drop.url} target="_blank" rel="noreferrer">
                              <div className="board-link-art">
                                {linkCover ? (
                                  <img
                                    className="board-link-img"
                                    src={linkCover}
                                    alt=""
                                    loading="lazy"
                                    onError={(e) => {
                                      (e.currentTarget as HTMLImageElement).style.display = "none";
                                    }}
                                  />
                                ) : null}
                                <div className="board-link-shade" />
                                <div className="board-link-host">{drop.hostLabel ?? (drop.type === "News" ? "NEWS" : "LINK")}</div>
                                <div className="board-link-copy">
                                  <div className="board-link-label">{linkLabel}</div>
                                  <div className="board-link-title">{linkTitle}</div>
                                  {drop.previewDescription ? (
                                    <div className="board-link-desc">{drop.previewDescription}</div>
                                  ) : null}
                                </div>
                              </div>
                              <div className="board-link-url">{drop.url}</div>
                            </a>
                          ) : null}

                          {drop.description ? (
                            <div className="board-drop-description">{drop.description}</div>
                          ) : null}

                          {drop.url || drop.linkUrl || drop.payProvider === "authorize_net_accept_hosted" || signedUrl ? (
                            <div className="board-drop-links">
                              {drop.url ? (
                                <a href={drop.url} target="_blank" rel="noreferrer" className="board-drop-link">
                                  Open source
                                </a>
                              ) : null}
                              {drop.type === "Pay" && (drop.linkUrl || drop.payProvider === "authorize_net_accept_hosted") ? (
                                <button
                                  type="button"
                                  className="board-drop-link"
                                  onClick={() => void openPayCheckout(drop)}
                                  disabled={payCheckoutBusyId === drop.id}
                                >
                                  {payCheckoutBusyId === drop.id ? "Opening..." : "Open checkout"}
                                </button>
                              ) : null}
                              {drop.type === "Doc" && signedUrl ? (
                                <a href={signedUrl} target="_blank" rel="noreferrer" className="board-drop-link">
                                  Open doc
                                </a>
                              ) : null}
                            </div>
                          ) : null}

                          <div className="board-drop-rail">
                            <ReactionRail
                              activityId={`boarddrop:${routeKey}:${drop.id}`}
                              size="sm"
                              item={{
                                id: `boarddrop:${routeKey}:${drop.id}`,
                                created_at: new Date(
                                  drop.createdAt || Date.now()
                                ).toISOString(),
                                user_id: null,
                                kind: "board_drop",
                                title: drop.title,
                                body: drop.description || "",
                                href:
                                  signedUrl ||
                                  drop.url ||
                                  drop.linkUrl ||
                                  drop.embedUrl ||
                                  null,
                                image_url:
                                  drop.mediaKind === "image"
                                    ? signedUrl || drop.previewImage || null
                                    : drop.previewImage || null,
                                meta: {
                                  dropType: drop.type,
                                  mediaKind: drop.mediaKind,
                                  bucket: drop.bucket,
                                  storagePath: drop.storagePath,
                                  previewImage: drop.previewImage,
                                  previewTitle: drop.previewTitle,
                                  previewDescription: drop.previewDescription,
                                  embedUrl: drop.embedUrl,
                                  linkUrl: drop.linkUrl,
                                  payProvider: drop.payProvider,
                                  priceCents: drop.priceCents,
                                },
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : boardDropActivityFallback.length > 0 ? (
                  <div className="recent-drops-stack">
                    {boardDropActivityFallback.map((item) => (
                      <ActivityCard key={`board-fallback-${item.id}`} item={item} compact />
                    ))}
                  </div>
                ) : (
                  <div className="note-card">
                    <div className="note-title">No board drops yet.</div>
                    <div className="note-text">
                      This view-only board will show the saved Board Drop collection once drops have been added.
                    </div>
                  </div>
                )}
              </section>
            </div>

            <div className="center-column">
              <section className="inner-tile identity">
                <div className="identity-row">
                  <div className="avatar-shell" style={{ boxShadow: aura.ring, borderColor: aura.border }}>
                    <div className="avatar-inner">
                      {profile.avatarDataUrl ? (
                        <img src={profile.avatarDataUrl} alt={profile.displayName} className="avatar-img" />
                      ) : (
                        <div className="avatar-placeholder">{profile.displayName.slice(0, 1)}</div>
                      )}
                    </div>
                  </div>

                  <div className="identity-meta">
                    <h1 className="name">{profile.displayName}</h1>
                    <div className="handle">{profile.handle}</div>
                    <p className="bio">{profile.bio}</p>
                    <div className="status-pill">View-only board</div>
                  </div>
                </div>
              </section>

              <section className="inner-tile">
                <div className="tile-head">
                  <div>
                    <div className="tile-title">Activity Channel</div>
                    <div className="tile-sub">Drops, signals, and soft Board Whispers moving through this profile.</div>
                  </div>
                </div>

                {recentDropsLoading ? (
                  <div className="note-card">
                    <div className="note-title">Loading Activity Channel…</div>
                    <div className="note-text">
                      Pulling live board activity into this profile preview.
                    </div>
                  </div>
                ) : recentDrops.length > 0 ? (
                  <div className="recent-drops-stack activity-feed-stack">
                    <BoardWhisper whisper={PROFILE_ACTIVITY_WHISPERS[0]} />
                    {recentDrops.map((item, index) => {
                      const whisper = PROFILE_ACTIVITY_WHISPERS[index + 1];

                      return (
                        <div key={item.id} className="activity-feed-entry">
                          <ActivityCard item={item} compact />
                          {whisper ? <BoardWhisper whisper={whisper} /> : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="note-card">
                    <div className="note-title">No activity yet.</div>
                    <div className="note-text">
                      This board preview will show drops, signals, and whispers as soon as they land.
                    </div>
                  </div>
                )}
              </section>
            </div>

            <div className="right-column">
              <section className="inner-tile cover">
                <div className="tile-head">
                  <div>
                    <div className="tile-title">Cover Poster</div>
                    <div className="tile-sub">Signature board framing.</div>
                  </div>
                </div>

                <div className="cover-shell">
                  {profile.coverDataUrl ? (
                    <img className="cover-img" src={profile.coverDataUrl} alt="Cover poster" />
                  ) : (
                    <div className="cover-empty">
                      <div className="plus">+</div>
                      <div className="label">NO COVER</div>
                    </div>
                  )}
                </div>
              </section>

              <section className="inner-tile">
                <div className="tile-head">
                  <div>
                    <div className="tile-title">Friend Zone</div>
                    <div className="tile-sub">Social parameters around this board.</div>
                  </div>
                </div>

                <div className="friend-zone-card">
                  <div className="friend-zone-status">
                    <div className="friend-zone-label">Orbit status</div>
                    <div className="friend-zone-value">
                      {orbitState === "idle"
                        ? "Not connected"
                        : orbitState === "requested"
                          ? "Request pending"
                          : "In Friend Zone"}
                    </div>
                  </div>

                  <div className="friend-zone-actions">
                    <button
                      type="button"
                      className={`friend-zone-btn ${orbitState === "requested" ? "on" : ""}`}
                      onClick={waveAtProfileBoard}
                    >
                      {orbitState === "requested" ? "Wave sent" : "Wave"}
                    </button>
                    <button
                      type="button"
                      className={`friend-zone-btn ${orbitState === "connected" ? "on" : ""}`}
                      onClick={waveAtProfileBoard}
                    >
                      {orbitState === "connected" ? "In Friend Zone" : "Add to Friend Zone"}
                    </button>
                  </div>

                  {waveNotice ? <div className="friend-zone-notice">{waveNotice}</div> : null}

                  <div className="friend-zone-links">
                    <Link href="/board/friend-zone" className="friend-zone-link">
                      Open Friend Zone
                    </Link>
                    <Link href="/board/options" className="friend-zone-link">
                      View boundaries
                    </Link>
                  </div>
                </div>
              </section>

              <section className="inner-tile bucket-panel">
                <div className="tile-head">
                  <div>
                    <div className="tile-title">Drops Bucket</div>
                    <div className="tile-sub">
                      Carry this board&apos;s signals with pass, pin, and push interactions.
                    </div>
                  </div>
                </div>

                <div className="bucket-wrap">
                  <DropsBucket
                    title={`${profile.displayName}'s Drops Bucket`}
                    subtitle="Pass, pin, and push the drops you want to carry forward from this board."
                    selfUser={routeKey}
                    statsOverride={bucketStats ?? undefined}
                  />
                </div>
              </section>
            </div>
          </div>
        </div>
      </section>

      <style jsx global>{`
        .board-bg {
          background:
            radial-gradient(1100px 700px at 20% 12%, rgba(0, 255, 150, 0.1), transparent 60%),
            radial-gradient(900px 600px at 85% 28%, rgba(255, 0, 190, 0.1), transparent 55%),
            linear-gradient(180deg, #fff7c9, #fff3b0);
        }

        .poster-board {
          position: relative;
          width: 100%;
          max-width: 100%;
          border-radius: 34px;
          border: 2px solid rgba(0, 0, 0, 0.12);
          overflow: hidden;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0.55)),
            repeating-linear-gradient(
              0deg,
              rgba(0, 0, 0, 0.03) 0px,
              rgba(0, 0, 0, 0.03) 1px,
              transparent 1px,
              transparent 10px
            ),
            repeating-linear-gradient(
              90deg,
              rgba(0, 0, 0, 0.02) 0px,
              rgba(0, 0, 0, 0.02) 1px,
              transparent 1px,
              transparent 12px
            );
          backdrop-filter: blur(10px);
          padding: 18px;
        }

        .board-top {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
          margin-bottom: 18px;
        }

        .board-title {
          font-size: 30px;
          font-weight: 900;
          letter-spacing: -0.04em;
          color: #1c1a13;
        }

        .board-subtitle {
          margin-top: 4px;
          color: rgba(0, 0, 0, 0.6);
        }

        .board-top-right {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .board-pill-link,
        .board-pill-cta {
          border-radius: 999px;
          padding: 10px 14px;
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.16em;
        }

        .board-pill-link {
          background: rgba(255, 255, 255, 0.75);
          border: 1px solid rgba(0, 0, 0, 0.1);
        }

        .board-pill-cta {
          background: rgba(27, 24, 15, 0.95);
          color: #fff4c0;
        }

        .profile-grid {
          display: grid;
          grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.15fr) minmax(0, 0.95fr);
          gap: 16px;
          min-width: 0;
        }

        .left-column,
        .center-column,
        .right-column {
          display: grid;
          gap: 16px;
          align-content: start;
          min-width: 0;
        }

        .inner-tile {
          min-width: 0;
          border-radius: 28px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(246, 240, 194, 0.92);
          padding: 16px;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
        }

        .tile-head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
          min-width: 0;
        }

        .tile-title {
          font-size: 18px;
          font-weight: 900;
          color: #18150f;
        }

        .tile-sub {
          margin-top: 4px;
          font-size: 12px;
          color: rgba(0, 0, 0, 0.55);
        }

        .vision-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }

        .vision-slot,
        .cover-shell {
          border-radius: 20px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          overflow: hidden;
          background: rgba(0, 0, 0, 0.06);
        }

        .vision-slot {
          aspect-ratio: 1 / 1;
        }

        .vision-img,
        .cover-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .vision-empty,
        .cover-empty {
          height: 100%;
          display: grid;
          place-items: center;
          color: rgba(0, 0, 0, 0.4);
          text-align: center;
          padding: 14px;
        }

        .plus {
          font-size: 28px;
          font-weight: 900;
          line-height: 1;
        }

        .label {
          margin-top: 4px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }

        .snap-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .snap-card {
          border-radius: 20px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(255, 251, 221, 0.7);
          padding: 14px;
        }

        .snap-label {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(0, 0, 0, 0.45);
        }

        .snap-value {
          margin-top: 8px;
          font-weight: 800;
          color: #1a1711;
        }

        .energy-bar {
          margin-top: 10px;
          height: 8px;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.08);
          overflow: hidden;
        }

        .energy-fill {
          height: 100%;
          border-radius: 999px;
        }

        .signal-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 8px;
        }

        .signal-dot {
          width: 12px;
          height: 12px;
          border-radius: 999px;
          display: inline-block;
        }

        .identity-row {
          display: flex;
          gap: 16px;
          align-items: center;
        }

        .avatar-shell {
          width: 120px;
          height: 120px;
          flex-shrink: 0;
          border-radius: 999px;
          border: 2px solid rgba(0, 0, 0, 0.1);
          display: grid;
          place-items: center;
          background: rgba(255, 255, 255, 0.4);
        }

        .avatar-inner {
          width: 98px;
          height: 98px;
          border-radius: 999px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.45);
          background: rgba(0, 0, 0, 0.08);
        }

        .avatar-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .avatar-placeholder {
          width: 100%;
          height: 100%;
          display: grid;
          place-items: center;
          font-size: 34px;
          font-weight: 900;
          color: rgba(0, 0, 0, 0.55);
        }

        .name {
          font-size: 34px;
          line-height: 1;
          font-weight: 900;
          letter-spacing: -0.04em;
          color: #191611;
        }

        .handle {
          margin-top: 6px;
          font-size: 13px;
          color: rgba(0, 0, 0, 0.48);
        }

        .bio {
          margin-top: 10px;
          line-height: 1.6;
          color: rgba(0, 0, 0, 0.62);
        }

        .identity-meta {
          min-width: 0;
          flex: 1;
        }

        .status-pill {
          margin-top: 12px;
          display: inline-flex;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(255, 255, 255, 0.5);
          padding: 8px 12px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(0, 0, 0, 0.58);
        }

        .note-card {
          border-radius: 22px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(255, 251, 221, 0.78);
          padding: 16px;
        }

        .board-drop-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }

        .board-drop-side-avatar {
          width: 74px;
          height: 74px;
          flex: 0 0 74px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          display: grid;
          place-items: center;
          background:
            radial-gradient(circle at 35% 25%, rgba(255, 255, 255, 0.88), rgba(255, 255, 255, 0.18) 50%, rgba(0, 0, 0, 0.06)),
            rgba(255, 255, 255, 0.52);
        }

        .board-drop-side-avatar-inner {
          width: 54px;
          height: 54px;
          border-radius: 999px;
          overflow: hidden;
          display: grid;
          place-items: center;
          border: 1px solid rgba(255, 255, 255, 0.62);
          background: rgba(0, 0, 0, 0.12);
        }

        .board-drop-side-avatar-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .board-drop-side-avatar-fallback {
          width: 100%;
          height: 100%;
          display: grid;
          place-items: center;
          font-size: 20px;
          font-weight: 950;
          color: rgba(0, 0, 0, 0.58);
          background: rgba(255, 255, 255, 0.36);
        }

        .board-drop-stack {
          display: grid;
          gap: 12px;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          overflow: hidden;
        }

        .board-drop-item {
          border-radius: 20px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(255, 255, 255, 0.66);
          padding: 14px;
          display: grid;
          gap: 10px;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          overflow: hidden;
        }

        .board-drop-top {
          display: flex;
          gap: 10px;
          justify-content: space-between;
          align-items: flex-start;
        }

        .board-drop-title {
          font-weight: 800;
          color: #18150f;
        }

        .board-drop-badges {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .board-drop-badge {
          border-radius: 999px;
          padding: 6px 8px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          background: rgba(0, 160, 80, 0.12);
          color: rgba(0, 160, 80, 0.92);
        }

        .board-drop-badge.ghost {
          background: rgba(0, 0, 0, 0.06);
          color: rgba(0, 0, 0, 0.56);
        }

        .board-drop-media-frame {
          position: relative;
          display: flex;
          justify-content: center;
          width: 100%;
          max-width: 100%;
          margin: 0 auto;
          border-radius: 16px;
          overflow: hidden;
        }

        .board-drop-media-frame.video {
          width: 100%;
        }

        .board-drop-media-frame.audio {
          width: 100%;
        }

        .board-drop-media {
          width: auto;
          height: auto;
          max-width: 100%;
          max-height: min(520px, 72vh);
          border-radius: 16px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          object-fit: contain;
          display: block;
          background:
            radial-gradient(circle at 18% 18%, rgba(255, 0, 190, 0.08), transparent 34%),
            radial-gradient(circle at 80% 22%, rgba(0, 180, 255, 0.08), transparent 34%),
            rgba(0, 0, 0, 0.055);
        }

        .board-drop-media-frame.video .board-drop-media {
          width: 100%;
          height: auto;
          background: #000;
        }

        .board-drop-audio {
          width: 100%;
          display: grid;
          gap: 10px;
          border-radius: 16px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background:
            radial-gradient(circle at 18% 18%, rgba(45, 124, 255, 0.12), transparent 34%),
            radial-gradient(circle at 80% 22%, rgba(255, 0, 190, 0.10), transparent 34%),
            rgba(255, 255, 255, 0.72);
          padding: 14px;
        }

        .board-drop-audio-label {
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(45, 124, 255, 0.86);
        }

        .board-drop-audio-player {
          width: 100%;
        }

        .board-drop-embed {
          border-radius: 16px;
          overflow: hidden;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(23, 23, 23, 0.92);
          height: 220px;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          position: relative;
        }

        .board-drop-embed iframe {
          width: 100%;
          height: 100%;
          max-width: 100%;
          border: 0;
          display: block;
          overflow: hidden;
        }

        .board-drop-embed.spotify {
          min-width: 0;
          background: #282828;
          border-radius: 18px;
          overflow: visible;
        }

        .board-drop-embed.spotify iframe.spotify-frame {
          display: block;
          width: 100%;
          height: 80px;
          border: 0;
          border-radius: 18px;
        }

        .board-drop-embed.spotify iframe {
          min-width: 0;
          width: 1px;
          min-width: 100%;
        }

        .board-drop-description {
          font-size: 13px;
          line-height: 1.6;
          color: rgba(0, 0, 0, 0.62);
        }

        .board-drop-links {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .board-link-preview {
          display: block;
          overflow: hidden;
          border-radius: 18px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(255, 255, 255, 0.68);
          color: inherit;
          text-decoration: none;
        }

        .board-link-art {
          position: relative;
          min-height: 220px;
          overflow: hidden;
          background:
            radial-gradient(circle at 18% 20%, rgba(255, 0, 190, 0.16), transparent 34%),
            radial-gradient(circle at 80% 22%, rgba(0, 180, 255, 0.14), transparent 34%),
            linear-gradient(135deg, rgba(24, 21, 15, 0.92), rgba(76, 66, 43, 0.9));
        }

        .board-link-img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .board-link-shade {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(180deg, rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.78)),
            radial-gradient(circle at 75% 10%, rgba(255, 255, 255, 0.2), transparent 34%);
        }

        .board-link-host {
          position: absolute;
          left: 14px;
          top: 14px;
          max-width: calc(100% - 28px);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
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

        .board-link-copy {
          position: absolute;
          left: 14px;
          right: 14px;
          bottom: 14px;
          color: #fff;
        }

        .board-link-label {
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(200, 255, 230, 0.9);
        }

        .board-link-title {
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

        .board-link-desc {
          margin-top: 7px;
          font-size: 12px;
          line-height: 1.45;
          color: rgba(255, 255, 255, 0.78);
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .board-link-url {
          padding: 12px 14px;
          font-size: 12px;
          color: rgba(0, 0, 0, 0.58);
          overflow-wrap: anywhere;
        }

        .board-drop-rail {
          margin-top: 2px;
        }

        .board-drop-link {
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(255, 255, 255, 0.78);
          padding: 8px 12px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255, 0, 190, 0.82);
          text-decoration: none;
          cursor: pointer;
        }
        .board-drop-link:disabled {
          opacity: 0.58;
          cursor: wait;
        }

        .recent-drops-stack {
          display: grid;
          gap: 12px;
        }

        .activity-feed-stack {
          gap: 10px;
        }

        .activity-feed-entry {
          display: grid;
          gap: 10px;
        }

        .board-whisper {
          margin: 4px 8px 8px;
          text-align: center;
          font-size: 12px;
          line-height: 1.5;
          font-weight: 750;
          font-style: italic;
          letter-spacing: 0.02em;
          opacity: 0.9;
          pointer-events: none;
          text-wrap: balance;
          animation: boardWhisperFloatIn 520ms ease both;
        }

        .board-whisper.profile {
          color: rgba(142, 199, 255, 0.9);
          text-shadow: 0 0 10px rgba(96, 165, 250, 0.22), 0 0 26px rgba(190, 220, 255, 0.14);
        }

        .board-whisper.signal {
          color: rgba(116, 231, 199, 0.9);
          text-shadow: 0 0 10px rgba(110, 231, 183, 0.22), 0 0 26px rgba(170, 255, 230, 0.14);
        }

        .board-whisper.memory {
          color: rgba(178, 132, 224, 0.88);
          text-shadow: 0 0 10px rgba(216, 180, 254, 0.24), 0 0 26px rgba(220, 190, 255, 0.16);
        }

        .board-whisper.friendZone {
          color: rgba(247, 197, 122, 0.9);
          text-shadow: 0 0 10px rgba(253, 224, 171, 0.24), 0 0 26px rgba(255, 232, 190, 0.14);
        }

        .board-whisper.system {
          color: rgba(180, 194, 222, 0.86);
          text-shadow: 0 0 10px rgba(200, 220, 255, 0.16), 0 0 26px rgba(200, 220, 255, 0.12);
        }

        .board-whisper.quiet {
          color: rgba(202, 184, 218, 0.78);
          text-shadow: 0 0 10px rgba(220, 210, 240, 0.14), 0 0 26px rgba(220, 210, 240, 0.1);
        }

        @keyframes boardWhisperFloatIn {
          from {
            opacity: 0;
            transform: translateY(5px);
            filter: blur(2px);
          }

          to {
            opacity: 0.9;
            transform: translateY(0);
            filter: blur(0);
          }
        }

        .note-title {
          font-weight: 900;
          color: #18150f;
        }

        .note-text {
          margin-top: 6px;
          font-size: 14px;
          line-height: 1.6;
          color: rgba(0, 0, 0, 0.62);
        }

        .cover-shell {
          height: 420px;
        }

        .friend-zone-card {
          display: grid;
          gap: 12px;
          border-radius: 20px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(255, 251, 221, 0.78);
          padding: 14px;
        }

        .friend-zone-status {
          border-radius: 16px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          background: rgba(255, 255, 255, 0.62);
          padding: 12px;
        }

        .friend-zone-label {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(0, 0, 0, 0.45);
        }

        .friend-zone-value {
          margin-top: 6px;
          font-size: 16px;
          font-weight: 800;
          color: rgba(0, 160, 80, 1);
        }

        .friend-zone-actions {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .friend-zone-btn {
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(255, 255, 255, 0.78);
          padding: 10px 12px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(255, 0, 190, 0.82);
          transition: transform 160ms ease, filter 160ms ease;
        }

        .friend-zone-btn.on {
          background: rgba(0, 160, 80, 0.14);
          color: rgba(0, 160, 80, 1);
          border-color: rgba(0, 160, 80, 0.2);
        }

        .friend-zone-notice {
          border-radius: 999px;
          border: 1px solid rgba(0, 160, 80, 0.18);
          background: rgba(255, 255, 255, 0.7);
          padding: 8px 12px;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(0, 115, 62, 0.9);
        }

        .friend-zone-links {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .friend-zone-link {
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(255, 255, 255, 0.78);
          padding: 8px 12px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(0, 0, 0, 0.6);
          text-decoration: none;
        }

        .bucket-panel {
          overflow: visible;
        }

        .bucket-wrap {
          margin-top: 4px;
          min-width: 0;
          max-width: 100%;
        }

        .bucket-wrap :global(.bucket) {
          min-width: 0;
          max-width: 100%;
        }

        .bucket-wrap :global(.bucket *) {
          box-sizing: border-box;
        }

        .bucket-wrap :global(.bucket .shell) {
          min-width: 0;
          max-width: 100%;
          background: rgba(255, 251, 221, 0.78);
          border: 1px solid rgba(0, 0, 0, 0.1);
          box-shadow: none;
        }

        .bucket-wrap :global(.bucket .topRow) {
          display: none;
        }

        .bucket-wrap :global(.bucket .openBtn) {
          width: 100%;
          white-space: normal;
        }

        .bucket-wrap :global(.bucket .right) {
          width: 100%;
          min-width: 0;
        }

        .bucket-wrap :global(.bucket .waveBar) {
          align-items: stretch;
          flex-wrap: wrap;
        }

        .bucket-wrap :global(.bucket .waveBtn) {
          flex: 1 1 112px;
          justify-content: center;
          min-width: 0;
        }

        .bucket-wrap :global(.bucket .waveText),
        .bucket-wrap :global(.bucket .folderText) {
          min-width: 0;
          flex-wrap: wrap;
          justify-content: center;
        }

        .bucket-wrap :global(.bucket .waveMeta) {
          flex: 1 1 100%;
          min-width: 0;
          flex-wrap: wrap;
          justify-content: center;
          text-align: center;
        }

        .bucket-wrap :global(.bucket .folderRow) {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .bucket-wrap :global(.bucket .folder) {
          justify-content: center;
          min-width: 0;
          padding-inline: 8px;
        }

        @media (max-width: 1180px) {
          .profile-grid {
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          }

          .center-column {
            grid-column: 1 / -1;
          }
        }

        @media (max-width: 980px) {
          .profile-grid {
            grid-template-columns: 1fr;
          }

          .center-column {
            grid-column: auto;
          }

          .identity-row {
            align-items: flex-start;
          }

          .cover-shell {
            min-height: 320px;
          }

          .friend-zone-actions {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}
