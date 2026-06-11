// File: app/components/board/ActivityCard.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./ActivityCard.css";
import {
  appendLocalActivity,
  getLocalActivity,
  removeLocalActivity,
  type BoardActivity,
} from "@/lib/board/activity";
import { readBrain, withdrawFromBrain } from "@/lib/board/bucketBrain";
import { removeDrops as removeUniversalDrops } from "@/lib/board/drops/storage";
import { resolveLinkPreviewImage } from "@/lib/board/linkPreviewImages";
import { fetchLinkPreview } from "@/lib/board/linkPreview";
import { openHostedPayDropCheckout } from "@/lib/board/payCheckout";
import { EVENTS as BOARD_STORE_EVENTS, removeDrops as removeFeedDrops } from "@/lib/boardStore";
import { normalizeDropCustomizations } from "@/lib/board/dropCustomizations";
import {
  findLocalDropByAnyId,
  getDropSignedUrl,
  loadDropMediaForFeed,
  persistDropEdit,
} from "@/lib/board/boardDropEditStore";
import { EyeToggle } from "./icons/EyeToggle";
import { normalizeRichText, type RichTextValue } from "@/lib/board/richText";
import { RichText } from "./RichTextField";
import {
  DROP_COMMENTS_UPDATED_EVENT,
  getDropCommentCount,
  syncDropCommentCounts,
} from "@/lib/board/dropComments";
import {
  hasUploadedMusicStorage,
  isAudioFileUrl,
  isMusicDropType,
  isStreamingMusicUrl,
  resolveStoredAudioSrc,
  resolveStoredMediaCoords,
} from "@/lib/board/musicPlayback";
import { supabaseBrowser } from "@/lib/supabase/browser";
import DropCommentsDrawer from "./DropCommentsDrawer";
import AudioDropPlayer from "./AudioDropPlayer";
import DropStudioOverlay from "./DropStudioOverlay";
import RemovableDropBadge from "./RemovableDropBadge";
import { PayOnBoardButton } from "./PayOnBoardButton";
import {
  isLikelyImageUrl as isBoardImageUrl,
  normalizeBoardDropType,
  resolveDropMediaKind,
  resolveDropMediaKindFromMeta,
  secondaryAttachmentLabelFromMeta,
} from "@/lib/board/dropDisplay";
import { parseBoardStorageFromUrl } from "@/lib/board/musicPlayback";
import type { DropItem } from "@/lib/board/dropItem";

import {
  ANNOUNCEMENT_VIBES,
  AURA_HEX,
  DROP_KIND_DISPLAY_RENAMES,
  EVT_BUCKET_UPDATED,
  EVT_DEPOSIT,
  activityOwnedByCurrentUser,
  clsx,
  colorFromAura,
  computeEmbed,
  createPushedDrop,
  currentUserKey,
  fallbackAuraColor,
  formatAnnouncementVibe,
  formatDropKindLabel,
  formatDropTime,
  formatHandle,
  formatPriceFromCents,
  getExt,
  getInitials,
  guessMediaKind,
  hasUserAlreadyPushed,
  isExternalHref,
  isLikelyImageUrl,
  metaString,
  normalizeIdentityKey,
  pushedRootId,
  readLocalProfileIdentity,
  storedUrl,
  toAppleMusicEmbed,
  toSoundCloudEmbed,
  toSpotifyEmbed,
  toYouTubeEmbed,
  ytId,
  type EmbedKind,
} from "./activityCardShared";


/* --------------------------- component --------------------------- */

type Props = {
  item: BoardActivity;
  compact?: boolean;
  onRemove?: (dropId: string) => void;
};

export default function ActivityCard({
  item,
  compact,
  onRemove,
}: Props) {
  const [toast, setToast] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const toastFadeTimerRef = useRef<number | null>(null);
  const toastClearTimerRef = useRef<number | null>(null);
  const [embedFailed, setEmbedFailed] = useState(false);
  const [signedPreviewImage, setSignedPreviewImage] = useState<string>("");
  // Image fetched on the client for link drops whose stored record has no
  // thumbnail (e.g. an Instagram reel saved before the preview resolved).
  const [hydratedImage, setHydratedImage] = useState<string>("");
  const [payCheckoutBusy, setPayCheckoutBusy] = useState(false);
  const [isRemovingDrop, setIsRemovingDrop] = useState(false);
  const [selectedReactions, setSelectedReactions] = useState({
    pass: false,
    pin: false,
    push: false,
  });
  // Transient sonar burst when a drop's signal is amplified (Push).
  const cardRef = useRef<HTMLDivElement>(null);
  const [amplifyBurst, setAmplifyBurst] = useState(false);
  const [burstAnchor, setBurstAnchor] = useState<{
    cx: number;
    cy: number;
    span: number;
  } | null>(null);
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

  // Live overrides so an in-place edit (via the board-wide editor) shows here
  // immediately without a reload.
  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  const [bodyOverride, setBodyOverride] = useState<string | null>(null);
  // Media overrides: an edit can replace the image/video/audio (new storage path)
  // and change the overlay. The feed item itself only carries a baked image URL,
  // so without these the card would keep showing the pre-edit media.
  const [mediaImageOverride, setMediaImageOverride] = useState<string | null>(null);
  const [mediaKindOverride, setMediaKindOverride] = useState<string | null>(null);
  const [customizationsOverride, setCustomizationsOverride] =
    useState<ReturnType<typeof normalizeDropCustomizations> | null>(null);
  const [titleRichOverride, setTitleRichOverride] = useState<RichTextValue | null>(null);
  const [descRichOverride, setDescRichOverride] = useState<RichTextValue | null>(null);
  // Bumped whenever this drop is edited, to re-resolve its canonical media.
  const [mediaRefreshTick, setMediaRefreshTick] = useState(0);
  const [visibilityOverride, setVisibilityOverride] = useState<"public" | "private" | null>(
    null
  );
  // Supabase boardDrops hydration — desktop has this in localStorage; mobile does not.
  const [musicHasStoredFile, setMusicHasStoredFile] = useState(false);
  const [musicHydrating, setMusicHydrating] = useState(false);

  const title = titleOverride ?? (item?.title || "Drop");
  const body = bodyOverride ?? ((item as any)?.body || (item as any)?.text || "");
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
  const dropCustomizations =
    customizationsOverride ??
    normalizeDropCustomizations(meta?.customizations ?? preview?.customizations);
  // Comments are keyed to the canonical drop id (not the feed activity row id),
  // so they save and load consistently across the feed, grid, and profile.
  const commentDropId = metaString(meta?.dropId, meta?.originalDropId, (item as any)?.id);

  // Inline-formatted title/description (edit override → feed meta → none).
  const titleRich =
    titleRichOverride ?? normalizeRichText(meta?.titleRich ?? preview?.titleRich);
  const descRich =
    descRichOverride ?? normalizeRichText(meta?.descriptionRich ?? preview?.descriptionRich);
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
  // Prefer the freshly-loaded Supabase profile avatar so it always reflects the
  // user's CURRENT picture; the meta.* snapshot (baked at drop-creation) is only
  // a fallback for before the profile lookup resolves.
  const authorAvatarSrc = storedUrl(
    authorProfile.avatarSrc,
    meta?.authorAvatar,
    meta?.avatarUrl,
    meta?.avatarDataUrl,
    meta?.recipientAvatar
  );
  const ownsActivity =
    Boolean(authorUserId) &&
    Boolean(currentAuthUserId) &&
    authorUserId === currentAuthUserId
      ? true
      : activityOwnedByCurrentUser(item, meta, viewerIdentity);
  const isCurrentUserDrop = item?.kind === "board_drop" && ownsActivity;
  // Drops AND announcements the viewer owns can be managed (edit + remove).
  const canManageDrop =
    ownsActivity && (item?.kind === "board_drop" || item?.kind === "announcement");

  // Stored-media coordinates can live on the feed item's `meta.preview` (the
  // shape the card signs its image from) OR directly on `meta`. Resolve from
  // both so detection matches what actually renders.
  const mediaBucket = metaString(meta?.preview?.bucket, meta?.bucket);
  const mediaStoragePath = metaString(meta?.preview?.storagePath, meta?.storagePath);
  // The owner's authoritative drop record (board_style.boardDrops) is the source
  // of truth the profile renders from. Prefer it over the activity meta, whose
  // media fields can go stale (e.g. an edited image still carrying an old "audio"
  // kind/path → a Voice player on an image). Falls back to meta for others' drops.
  const canonicalBoardDrop = useMemo(
    () =>
      findLocalDropByAnyId(
        metaString(meta?.dropId),
        metaString(meta?.originalDropId),
        id
      ),
    [meta, id, mediaRefreshTick]
  );
  const dropVisibility: "public" | "private" =
    visibilityOverride ??
    (canonicalBoardDrop?.visibility as "public" | "private" | undefined) ??
    (meta?.visibility as "public" | "private" | undefined) ??
    "public";
  const canonicalMediaKind = canonicalBoardDrop
    ? resolveDropMediaKind(canonicalBoardDrop) ?? ""
    : "";
  const feedMediaKind =
    canonicalMediaKind ||
    resolveDropMediaKindFromMeta(meta as Record<string, unknown>) ||
    metaString(meta?.mediaKind, meta?.preview?.mediaKind);
  const feedDropType = String(meta?.dropType ?? item?.kind ?? "").toLowerCase();
  const musicDropType = feedDropType || metaString(meta?.dropType, meta?.drop_flavor);
  const dropMediaUrl = metaString(meta?.mediaUrl);
  const storedMediaCoords = resolveStoredMediaCoords({
    bucket: mediaBucket,
    storagePath: mediaStoragePath,
    mediaUrl: dropMediaUrl,
    href,
  });
  const storedMediaBucket = storedMediaCoords?.bucket || mediaBucket;
  const storedMediaPath = storedMediaCoords?.storagePath || mediaStoragePath;

  // Feed `board_drop` items don't carry bucket/storagePath — only a rendered
  // media URL (meta.mediaUrl / meta.preview.image / image_url). Treat that URL
  // as the media source, but ONLY for genuinely media-bearing drops so a link
  // or news thumbnail never counts. Drop Studio loads from this URL when no
  // storage path exists, then re-uploads on save.
  const isMediaBearingDrop =
    feedDropType.includes("media") ||
    feedDropType.includes("pay") ||
    feedDropType.includes("music") ||
    feedDropType.includes("audio") ||
    Boolean(feedMediaKind);
  const mediaUrl = isMediaBearingDrop
    ? metaString(
        meta?.mediaUrl,
        feedMediaKind === "audio" ? "" : meta?.preview?.image,
        feedMediaKind === "audio" ? "" : (item as any)?.image_url
      )
    : "";

  function flashToast(message: string | null, duration = 1200) {
    if (toastFadeTimerRef.current) window.clearTimeout(toastFadeTimerRef.current);
    if (toastClearTimerRef.current) window.clearTimeout(toastClearTimerRef.current);
    if (!message) {
      setToastVisible(false);
      setToast(null);
      return;
    }
    setToast(message);
    setToastVisible(true);
    toastFadeTimerRef.current = window.setTimeout(
      () => setToastVisible(false),
      Math.max(180, duration - 280)
    );
    toastClearTimerRef.current = window.setTimeout(() => {
      setToast(null);
      setToastVisible(false);
    }, duration);
  }

  function resolveEditableDropRecord(): DropItem | null {
    if (canonicalBoardDrop) return canonicalBoardDrop;
    if (item?.kind !== "board_drop") return null;
    const { fallbackDrop } = buildEditableDrop();
    return fallbackDrop as DropItem;
  }

  // Reconstruct a drop record from the feed item so it stays editable even when
  // it isn't in the local cache or server list yet. Shared by the Edit and Drop
  // Public/Private toggle parity with the profile board. Persists against the
  // authoritative boardDrops record (so we never overwrite it with a partial
  // feed payload); persistDropEdit fires board:drop:updated so this card refreshes.
  async function toggleDropVisibility() {
    const base = resolveEditableDropRecord();
    if (!base) return;
    const current = dropVisibility;
    const next: "public" | "private" = current === "public" ? "private" : "public";
    setVisibilityOverride(next);
    try {
      await persistDropEdit({ ...base, visibility: next, updatedAt: Date.now() });
      flashToast(next === "private" ? "Drop is now private" : "Drop is now public", 1000);
    } catch {
      setVisibilityOverride(null);
    }
  }

  // Studio buttons; the editor prefers the authoritative record and only uses
  // this as a fallback.
  function buildEditableDrop() {
    if (item?.kind === "announcement") {
      const activityId = id;
      const annMedia =
        announcementMediaUrl ||
        resolvedPreviewImage ||
        (typeof (item as any)?.image_url === "string" ? (item as any).image_url : "") ||
        "";
      const annKind =
        announcementMediaType === "video"
          ? "video"
          : announcementMediaType === "image" || isLikelyImageUrl(annMedia)
            ? "image"
            : undefined;
      const fallbackDrop = {
        id: activityId,
        title,
        type: "Media" as const,
        createdAt: Date.parse((item as any)?.created_at) || Date.now(),
        description: body || undefined,
        mediaUrl: annMedia || undefined,
        mediaKind: annKind,
        customizations: dropCustomizations,
        editSource: "announcement" as const,
        sourceActivityId: activityId,
      };
      return { dropId: activityId, fallbackDrop };
    }

    const dropId = metaString(meta?.dropId, meta?.originalDropId, id);
    const dt = String(meta?.dropType ?? item?.kind ?? "").toLowerCase();
    const mappedType =
      dt.includes("thought") ? "Thought"
      : dt.includes("pay") ? "Pay"
      : dt.includes("music") || dt.includes("audio") ? "Music"
      : dt.includes("youtube") ? "YouTube"
      : dt.includes("news") ? "News"
      : dt.includes("doc") ? "Doc"
      : dt === "link" ? "Link"
      : "Media";
    const fallbackDrop = {
      id: dropId,
      title,
      type: mappedType,
      createdAt: Date.parse((item as any)?.created_at) || Date.now(),
      description: metaString(meta?.description) || body || undefined,
      thoughtText: metaString(meta?.thoughtText) || undefined,
      url: metaString(meta?.url) || href || undefined,
      linkUrl: metaString(meta?.linkUrl) || undefined,
      bucket: mediaBucket || undefined,
      storagePath: mediaStoragePath || undefined,
      mediaUrl: mediaUrl || undefined,
      mediaKind: (meta?.mediaKind ?? meta?.preview?.mediaKind) || undefined,
      mime: metaString(meta?.mime, meta?.preview?.mime) || undefined,
      fileName: metaString(meta?.fileName, meta?.preview?.fileName) || undefined,
      priceCents: typeof meta?.priceCents === "number" ? meta.priceCents : undefined,
      paymentLink: metaString(meta?.paymentLink) || undefined,
      visibility: (meta?.visibility as any) || undefined,
      customizations: dropCustomizations,
      editSource: "board_drop" as const,
    };
    return { dropId, fallbackDrop };
  }

  function openDropStudioEditor() {
    try {
      const { dropId, fallbackDrop } = buildEditableDrop();
      const dropMedia = fallbackDrop as {
        mediaUrl?: string;
        bucket?: string;
        storagePath?: string;
      };
      const opensDescriptStudio =
        fallbackDrop.type === "Doc" ||
        fallbackDrop.type === "Thought" ||
        fallbackDrop.type === "Pay";
      const hasStudioMedia = !!(
        dropMedia.mediaUrl || (dropMedia.bucket && dropMedia.storagePath)
      );
      const eventName = opensDescriptStudio || hasStudioMedia ? "board:drop:studio" : "board:drop:edit";
      window.dispatchEvent(
        new CustomEvent(eventName, {
          detail: { dropId, drop: fallbackDrop },
        })
      );
    } catch {
      // ignore
    }
  }

  async function applyMediaFromDrop(drop: {
    bucket?: string;
    storagePath?: string;
    mediaUrl?: string;
    mediaKind?: string;
    customizations?: unknown;
  }) {
    if (typeof drop.mediaKind === "string" && drop.mediaKind) {
      setMediaKindOverride(drop.mediaKind);
    }
    if ("customizations" in drop) {
      setCustomizationsOverride(normalizeDropCustomizations(drop.customizations as any) ?? null);
    }
    try {
      if (drop.bucket && drop.storagePath) {
        const url = await getDropSignedUrl(drop.bucket, drop.storagePath, 60 * 45);
        if (url) {
          setMediaImageOverride(url);
          setSignedPreviewImage(url);
        }
      } else if (typeof drop.mediaUrl === "string" && drop.mediaUrl) {
        setMediaImageOverride(drop.mediaUrl);
        setSignedPreviewImage(drop.mediaUrl);
      }
    } catch {
      // keep the existing feed image if we can't resolve edited media
    }
  }

  // Reflect an in-place edit on this card without waiting for a feed reload.
  useEffect(() => {
    const myDropIds = new Set(
      [meta?.dropId, meta?.originalDropId, id].filter(
        (x): x is string => typeof x === "string" && x.length > 0
      )
    );
    function matchesDropId(dropId: unknown) {
      return typeof dropId === "string" && dropId.length > 0 && myDropIds.has(dropId);
    }
    function applyDropPatch(d: Record<string, unknown>) {
      if (typeof d.title === "string") setTitleOverride(d.title);
      const nextBody =
        d.type === "Thought" ? d.thoughtText ?? d.description : d.description;
      if (typeof nextBody === "string") setBodyOverride(nextBody);
      // RichText prefers formatted html over plain — always refresh overrides
      // or stale meta.titleRich keeps showing the pre-edit title on mobile cards.
      if ("titleRich" in d) {
        setTitleRichOverride(normalizeRichText(d.titleRich) ?? null);
      }
      if ("descriptionRich" in d) {
        setDescRichOverride(normalizeRichText(d.descriptionRich) ?? null);
      }
      if (d.visibility === "public" || d.visibility === "private") {
        setVisibilityOverride(d.visibility);
      }
      void applyMediaFromDrop({
        bucket: typeof d.bucket === "string" ? d.bucket : undefined,
        storagePath: typeof d.storagePath === "string" ? d.storagePath : undefined,
        mediaUrl: typeof d.mediaUrl === "string" ? d.mediaUrl : undefined,
        mediaKind: typeof d.mediaKind === "string" ? d.mediaKind : undefined,
        customizations: d.customizations,
      });
      setMediaRefreshTick((t) => t + 1);
    }
    function onDropUpdated(e: Event) {
      const detail = (e as CustomEvent).detail || {};
      if (!matchesDropId(detail.dropId)) return;
      applyDropPatch((detail.drop as Record<string, unknown>) || {});
    }
    function onActivityUpdated(e: Event) {
      const updated = (e as CustomEvent<BoardActivity>).detail;
      if (!updated || updated.id !== id) return;
      if (typeof updated.title === "string") setTitleOverride(updated.title);
      if (typeof updated.body === "string") setBodyOverride(updated.body);
      const m = updated.meta;
      if (m && typeof m === "object") {
        if ("titleRich" in m) {
          setTitleRichOverride(normalizeRichText(m.titleRich) ?? null);
        }
        if ("descriptionRich" in m) {
          setDescRichOverride(normalizeRichText(m.descriptionRich) ?? null);
        }
        const preview =
          m.preview && typeof m.preview === "object" ? (m.preview as Record<string, unknown>) : null;
        void applyMediaFromDrop({
          bucket: typeof m.bucket === "string" ? m.bucket : (preview?.bucket as string | undefined),
          storagePath:
            typeof m.storagePath === "string"
              ? m.storagePath
              : (preview?.storagePath as string | undefined),
          mediaUrl:
            (typeof updated.image_url === "string" && updated.image_url) ||
            (typeof updated.href === "string" && updated.href) ||
            (typeof m.mediaUrl === "string" ? m.mediaUrl : undefined) ||
            (typeof preview?.image === "string" ? preview.image : undefined),
          mediaKind:
            (typeof m.mediaKind === "string" ? m.mediaKind : undefined) ||
            (typeof preview?.mediaKind === "string" ? preview.mediaKind : undefined),
          customizations: m.customizations,
        });
      }
      setMediaRefreshTick((t) => t + 1);
    }
    window.addEventListener("board:drop:updated", onDropUpdated as EventListener);
    window.addEventListener("board:activity:updated", onActivityUpdated as EventListener);
    return () => {
      window.removeEventListener("board:drop:updated", onDropUpdated as EventListener);
      window.removeEventListener("board:activity:updated", onActivityUpdated as EventListener);
    };
  }, [meta, id]);

  // Feed activity items bake the media URL at creation time, so an edit (new
  // storage path / new overlay) never shows through the stale feed payload.
  // Resolve the drop's CURRENT media from the canonical local boardDrops by id
  // and sign a fresh URL — on mount and whenever this drop is edited. Mobile
  // devices often lack local cache; always fall back to server meta + signing.
  useEffect(() => {
    let cancelled = false;
    const isMusic = isMusicDropType(musicDropType);
    const treatsAsAudio = isMusic || feedMediaKind === "audio";

    async function applyPlayableUrl(url: string, kind?: string | null) {
      if (cancelled || !url) return;
      setSignedPreviewImage(url);
      setMediaImageOverride(url);
      // An explicit visual kind from the authoritative record wins over the
      // meta-derived "treatsAsAudio" guess (prevents an image showing as audio).
      if (kind === "image" || kind === "video") setMediaKindOverride(kind);
      else if (treatsAsAudio || kind === "audio") setMediaKindOverride("audio");
    }

    async function signFromServerMeta() {
      if (storedMediaBucket && storedMediaPath) {
        const url = await getDropSignedUrl(storedMediaBucket, storedMediaPath, 60 * 45);
        if (url) {
          await applyPlayableUrl(url, "audio");
          return;
        }
      }
      const direct = [dropMediaUrl, href].find(
        (url) => url && isAudioFileUrl(url) && !isStreamingMusicUrl(url)
      );
      if (direct && treatsAsAudio) await applyPlayableUrl(direct, "audio");
    }

    const canonical = findLocalDropByAnyId(
      metaString(meta?.dropId),
      metaString(meta?.originalDropId),
      id
    );

    if (!canonical) {
      void signFromServerMeta();
      return () => {
        cancelled = true;
      };
    }

    const serverEditedAt = typeof meta?.editedAt === "number" ? meta.editedAt : 0;
    const localEditedAt =
      typeof (canonical as { updatedAt?: number }).updatedAt === "number"
        ? (canonical as { updatedAt?: number }).updatedAt!
        : 0;
    const localIsStale = Boolean(serverEditedAt && serverEditedAt > localEditedAt);

    // Media (kind + file) comes from the authoritative boardDrops record
    // regardless of the text-freshness guard — so an edited image never falls
    // back to a stale audio kind/path. The guard still protects the text fields.
    if (canonical.mediaKind) setMediaKindOverride(canonical.mediaKind);
    const canonicalCustomizations = normalizeDropCustomizations(
      (canonical as { customizations?: unknown }).customizations
    );
    if (!localIsStale && canonicalCustomizations) {
      setCustomizationsOverride(canonicalCustomizations);
    }
    if (!localIsStale && "titleRich" in canonical) {
      setTitleRichOverride(normalizeRichText(canonical.titleRich) ?? null);
    }
    if (!localIsStale && "descriptionRich" in canonical) {
      setDescRichOverride(normalizeRichText(canonical.descriptionRich) ?? null);
    }

    void (async () => {
      try {
        if (canonical.bucket && canonical.storagePath) {
          const url = await getDropSignedUrl(canonical.bucket, canonical.storagePath, 60 * 45);
          if (url) await applyPlayableUrl(url, canonical.mediaKind ?? null);
          else await signFromServerMeta();
        } else {
          await signFromServerMeta();
        }
        if (
          !cancelled &&
          !storedMediaBucket &&
          !storedMediaPath &&
          canonical.mediaUrl
        ) {
          await applyPlayableUrl(canonical.mediaUrl, canonical.mediaKind ?? null);
        }
      } catch {
        // keep the existing feed image if we can't resolve the canonical media
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    meta,
    id,
    mediaRefreshTick,
    storedMediaBucket,
    storedMediaPath,
    musicDropType,
    feedMediaKind,
    dropMediaUrl,
    href,
  ]);

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
  const displayAuraPower = isPushed
    ? Math.min(1, authorAuraPower + 0.18)
    : authorAuraPower;
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
  // Prefer a fresh edit override, then the RESOLVED kind (concrete image file/
  // mime beats a stale stored "audio" kind), then the raw meta value. Fixes a
  // drawn-image Pay/Vision drop rendering as a Voice player in the feed.
  const mediaKind =
    mediaKindOverride ||
    canonicalMediaKind ||
    resolveDropMediaKindFromMeta(meta) ||
    metaString(meta?.mediaKind, preview?.mediaKind);
  const announcementMediaUrl = metaString(meta?.announcement_media_url);
  const announcementMediaType = metaString(meta?.announcement_media_type);
  const announcementImageUrl =
    announcementMediaType === "image" || isLikelyImageUrl(announcementMediaUrl)
      ? announcementMediaUrl
      : "";
  const resolvedPreviewImage =
    mediaImageOverride ||
    signedPreviewImage ||
    resolveLinkPreviewImage(href, previewImage || announcementImageUrl) ||
    hydratedImage ||
    "";
  const storedVideoSrc = mediaImageOverride || signedPreviewImage;
  const isStoredVideoDrop = mediaKind === "video" && !!storedVideoSrc;
  const hasStoredAudioPath = !!(storedMediaBucket && storedMediaPath);
  const isUploadedMusicDrop = hasUploadedMusicStorage({
    mediaKind,
    dropType: musicDropType,
    bucket: storedMediaBucket,
    storagePath: storedMediaPath,
    mediaUrl: dropMediaUrl,
    href,
  });
  const storedAudioSrc = resolveStoredAudioSrc({
    mediaKind,
    dropType: musicDropType,
    signedUrl: mediaImageOverride || signedPreviewImage,
    mediaUrl: dropMediaUrl,
    href:
      href && isAudioFileUrl(href) && !isStreamingMusicUrl(href) ? href : "",
    hasStoragePath: hasStoredAudioPath,
  });
  const isStoredAudioDrop = !!storedAudioSrc;
  const showFullSongPlayer =
    isStoredAudioDrop || isUploadedMusicDrop || musicHasStoredFile;
  const showAnnouncementImage =
    item?.kind === "announcement" &&
    !!resolvedPreviewImage &&
    !isStoredVideoDrop &&
    !showFullSongPlayer;

  // Hydrate uploaded music from authoritative boardDrops (same path Drop Studio uses).
  // Feed meta often only has the Spotify href; the file lives on boardDrops.
  useEffect(() => {
    setMusicHasStoredFile(false);
    setMusicHydrating(false);

    if (!isMusicDropType(musicDropType)) return;

    const alreadyUploaded = hasUploadedMusicStorage({
      mediaKind,
      dropType: musicDropType,
      bucket: storedMediaBucket,
      storagePath: storedMediaPath,
      mediaUrl: dropMediaUrl,
      href,
    });
    if (alreadyUploaded) {
      setMusicHasStoredFile(true);
      return;
    }

    const dropId = metaString(meta?.dropId, meta?.originalDropId);
    if (!dropId) return;

    setMusicHydrating(true);
    const ownerUserId = metaString(authorUserId, meta?.authorId);
    let cancelled = false;

    void (async () => {
      try {
        const drop = await loadDropMediaForFeed(dropId, ownerUserId);
        if (cancelled || !drop) return;

        const coords = resolveStoredMediaCoords({
          bucket: drop.bucket,
          storagePath: drop.storagePath,
          mediaUrl: drop.mediaUrl || drop.url || drop.linkUrl,
          href: drop.url || drop.linkUrl,
        });
        const directAudio = [drop.mediaUrl, drop.url, drop.linkUrl].find(
          (url) =>
            typeof url === "string" &&
            url &&
            isAudioFileUrl(url) &&
            !isStreamingMusicUrl(url)
        );

        if (!coords && !directAudio) return;

        setMusicHasStoredFile(true);
        setMediaKindOverride("audio");

        if (coords) {
          const url = await getDropSignedUrl(coords.bucket, coords.storagePath, 60 * 45);
          if (!cancelled && url) {
            setSignedPreviewImage(url);
            setMediaImageOverride(url);
          }
        } else if (directAudio && !cancelled) {
          setSignedPreviewImage(directAudio);
          setMediaImageOverride(directAudio);
        }
      } finally {
        if (!cancelled) setMusicHydrating(false);
      }
    })();

    return () => {
      cancelled = true;
      setMusicHydrating(false);
    };
  }, [
    id,
    musicDropType,
    mediaKind,
    storedMediaBucket,
    storedMediaPath,
    dropMediaUrl,
    href,
    authorUserId,
    meta,
    mediaRefreshTick,
  ]);

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
        setSelectedReactions({ pass: false, pin: false, push: false });
        return;
      }
      const brain = readBrain();
      setSelectedReactions({
        pass: (brain.pass ?? []).some((entry) => String(entry.activityId) === id),
        pin: (brain.pin ?? []).some((entry) => String(entry.activityId) === id),
        push: (brain.push ?? []).some((entry) => String(entry.activityId) === id),
      });
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
    const syncCommentCount = () => setCommentCount(getDropCommentCount(commentDropId));
    syncCommentCount();
    // Pull the authoritative count from Supabase so the feed shows it without
    // opening the drawer.
    void syncDropCommentCounts([commentDropId]).then(syncCommentCount).catch(() => {});
    window.addEventListener(DROP_COMMENTS_UPDATED_EVENT, syncCommentCount as EventListener);
    window.addEventListener("storage", syncCommentCount as EventListener);
    return () => {
      window.removeEventListener(DROP_COMMENTS_UPDATED_EVENT, syncCommentCount as EventListener);
      window.removeEventListener("storage", syncCommentCount as EventListener);
    };
  }, [commentDropId]);

  useEffect(() => {
    let cancelled = false;

    // Only clear/sign when there's a storage path to sign. Otherwise leave
    // signedPreviewImage alone so the canonical-media effect below (which owns
    // the image for feed drops) isn't clobbered.
    if (!storedMediaBucket || !storedMediaPath) return;

    // Only skip when local cache has authoritative storage coords (canonical effect
    // owns signing). A partial local row on mobile must not block server signing.
    const local = findLocalDropByAnyId(
      metaString(meta?.dropId),
      metaString(meta?.originalDropId),
      id
    );
    if (local?.bucket && local?.storagePath) return;

    setSignedPreviewImage("");

    async function signPreviewImage() {
      try {
        const url = await getDropSignedUrl(storedMediaBucket, storedMediaPath, 60 * 45);
        if (!cancelled && url) {
          setSignedPreviewImage(url);
          if (isMusicDropType(musicDropType) || feedMediaKind === "audio") {
            setMediaImageOverride(url);
            setMediaKindOverride("audio");
          }
        }
      } catch {
        // Fall back to image_url/previewImage if storage signing fails.
      }
    }

    void signPreviewImage();

    return () => {
      cancelled = true;
    };
  }, [storedMediaBucket, storedMediaPath, musicDropType, feedMediaKind, meta, id, mediaRefreshTick]);

  // Recover a working image when only a stored Supabase URL is available with no
  // re-signable path. Older announcements saved a PUBLIC url against a PRIVATE
  // bucket, so the link 403s and the image never renders. Parse the bucket/path
  // back out of the URL and sign it. (The effect above owns the case where a
  // path is already present.)
  useEffect(() => {
    if (storedMediaBucket && storedMediaPath) return;
    const candidate = announcementMediaUrl || previewImage || "";
    const m = candidate.match(
      /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/([^?]+)/
    );
    if (!m) return;
    const bucket = decodeURIComponent(m[1]);
    const path = decodeURIComponent(m[2]);
    let cancelled = false;
    void (async () => {
      try {
        const supabase = supabaseBrowser();
        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUrl(path, 60 * 45);
        if (!cancelled && !error && data?.signedUrl) setSignedPreviewImage(data.signedUrl);
      } catch {
        // Leave the existing (possibly broken) URL; nothing better to show.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [announcementMediaUrl, previewImage, storedMediaBucket, storedMediaPath]);

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

    const normalized = normalizeBoardDropType(explicitDropKind);
    if (normalized) return formatDropKindLabel(normalized);

    const priceHint =
      typeof meta?.priceCents === "number"
        ? meta.priceCents
        : typeof preview?.priceCents === "number"
          ? preview.priceCents
          : 0;
    if (priceHint > 0) return formatDropKindLabel("Pay");

    const k = String((item as any)?.kind || (item as any)?.type || "drop");
    return formatDropKindLabel(k);
  }, [item, meta, preview]);
  const badgeLabel = metaString(meta?.badgeLabel, preview?.badgeLabel);
  const secondaryMetaLabel = useMemo(() => secondaryAttachmentLabelFromMeta(meta), [meta]);
  const previewKindLabel = secondaryMetaLabel || kindLabel;
  const activityMediaKind = useMemo(() => resolveDropMediaKindFromMeta(meta), [meta]);
  const normalizedDropType = useMemo(
    () => normalizeBoardDropType(metaString(meta?.dropType, meta?.drop_flavor, preview?.dropType)),
    [meta, preview]
  );
  const isThoughtDrop =
    feedDropType.includes("thought") || normalizedDropType === "Thought";
  const isBoardVisionDrop =
    feedDropType.includes("media") ||
    feedDropType.includes("vision") ||
    normalizedDropType === "Media";
  const isBoardStorageMedia =
    !!(storedMediaBucket && storedMediaPath) ||
    !!(href && parseBoardStorageFromUrl(href));

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
  const preferNativeAudioPreview =
    !showFullSongPlayer &&
    activityMediaKind === "audio" &&
    (isThoughtDrop || isPayDrop || isBoardStorageMedia || isStoredAudioDrop);
  const preferNativeImagePreview =
    !!resolvedPreviewImage &&
    !isStoredVideoDrop &&
    !showFullSongPlayer &&
    !preferNativeAudioPreview &&
    (activityMediaKind === "image" ||
      isThoughtDrop ||
      isBoardVisionDrop ||
      (isPayDrop && activityMediaKind !== "video" && activityMediaKind !== "audio") ||
      (isBoardStorageMedia &&
        isBoardImageUrl(resolvedPreviewImage || href || dropMediaUrl || "")));
  const showCapturedOnMediaOverlay =
    Boolean(badgeLabel) && preferNativeImagePreview && Boolean(resolvedPreviewImage);
  const preferNativeBoardMedia = preferNativeImagePreview || preferNativeAudioPreview;
  const priceLabel = formatPriceFromCents(priceCents);

  // The feed item's `href` (and thus the embedded media URL) is baked when the
  // drop is created, so an edit never reaches it. When we've resolved the drop's
  // CURRENT media from the canonical store (mediaImageOverride), use that as the
  // embedded media so edits — drawings, replaced photo/video — show in the feed.
  const embed = useMemo(() => {
    if (
      mediaImageOverride &&
      (mediaKindOverride === "image" ||
        mediaKindOverride === "video" ||
        mediaKindOverride === "audio")
    ) {
      const kind: EmbedKind =
        mediaKindOverride === "video"
          ? "video"
          : mediaKindOverride === "audio"
            ? "audio"
            : "image";
      return { kind, url: mediaImageOverride };
    }
    return computeEmbed(href);
  }, [href, mediaImageOverride, mediaKindOverride]);
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
  const compactSpotify = !!compact && embed.kind === "spotify";

  // Show embed unless user forces fallback or embed fails. Uploaded music uses
  // the full-song player — never a streaming preview embed (Spotify, etc.).
  const showEmbed =
    !!embed.url &&
    !embedFailed &&
    embed.kind !== "none" &&
    !showFullSongPlayer &&
    !(isMusicDropType(musicDropType) && musicHydrating);

  function signal(folder: "pass" | "pin" | "push") {
    if (!id) return;
    const currentUser = readLocalProfileIdentity();
    const alreadySelected = (readBrain()[folder] ?? []).some(
      (entry) => String(entry.activityId) === id
    );

    if (alreadySelected) {
      withdrawFromBrain(folder, id);
      setSelectedReactions((prev) => ({ ...prev, [folder]: false }));

      if (folder === "push") {
        const userId = currentUserKey(currentUser);
        const originalDropId = pushedRootId(item, meta);
        removeLocalActivity((activity) => {
          const activityMeta =
            activity.meta && typeof activity.meta === "object" ? activity.meta : null;
          return (
            Boolean(activityMeta?.isPushed) &&
            String(activityMeta?.originalDropId || "") === originalDropId &&
            String(activityMeta?.pushedByUserId || "") === userId
          );
        });
      }

      const word = folder === "pass" ? "PASS" : folder === "pin" ? "PIN" : "PUSH";
      flashToast(`${word} retracted`, 900);
      return;
    }

    window.dispatchEvent(
      new CustomEvent(EVT_DEPOSIT, {
        detail: { folder, activityId: id, item },
      })
    );

    setSelectedReactions((prev) => ({ ...prev, [folder]: true }));

    if (folder === "push") {
      // Amplify the signal: fire the sonar burst regardless of dedupe so the
      // gesture always feels alive. Portal to document.body so rings escape
      // column dividers and stack above the whole board.
      const rect = cardRef.current?.getBoundingClientRect();
      if (rect) {
        const span = Math.max(rect.width, rect.height, 220);
        setBurstAnchor({
          cx: rect.left + rect.width / 2,
          cy: rect.top + rect.height / 2,
          span,
        });
      }
      setAmplifyBurst(true);
      window.setTimeout(() => {
        setAmplifyBurst(false);
        setBurstAnchor(null);
      }, 1200);

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

    const word = folder === "pass" ? "PASS" : folder === "pin" ? "PIN" : "PUSH";
    flashToast(folder === "push" ? "Signal amplified" : `${word} saved to Bucket`, 1200);
  }

  async function openPayCheckout() {
    if (!isPayDrop) return;

    // Only treat the href as a checkout destination when this Pay Drop is an
    // explicit external payment link. Otherwise (Stripe "Pay on Board" drops) we
    // must go through Stripe Checkout — never open the drop's image/link.
    const explicitPaymentLink =
      metaString(meta?.payProvider) === "payment_link" &&
      metaString(meta?.paymentLink, meta?.checkoutUrl);
    if (explicitPaymentLink) {
      window.open(explicitPaymentLink, "_blank", "noopener,noreferrer");
      return;
    }

    try {
      setPayCheckoutBusy(true);
      await openHostedPayDropCheckout({
        payDropId,
        title,
        description: body,
        amountCents: priceCents,
        destinationAccountId: metaString(meta?.recipientStripeAccountId) || undefined,
      });
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "Could not open Stripe checkout."
      );
    } finally {
      setPayCheckoutBusy(false);
    }
  }

  async function removeDropFromBoard() {
    if (!id || !canManageDrop) return;
    if (isRemovingDrop) return;
    if (!window.confirm("Remove this drop from your Board?")) return;

    setIsRemovingDrop(true);
    try {
      await performDropRemoval();
    } catch (error) {
      console.error("Failed to remove drop from Board:", error);
      if (typeof flashToast === "function") {
        flashToast("Couldn't remove this drop. Try again.", 1800);
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
    flashToast("Drop removed", 1200);
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

  const reactionAura = userAuraColor || fallbackAuraColor;
  const amplifyPortal =
    amplifyBurst &&
    burstAnchor &&
    typeof document !== "undefined"
      ? createPortal(
          <div
            className="amplifyRingsPortal"
            style={{
              left: burstAnchor.cx - (burstAnchor.span * 2.2) / 2,
              top: burstAnchor.cy - (burstAnchor.span * 2.2) / 2,
              width: burstAnchor.span * 2.2,
              height: burstAnchor.span * 2.2,
            }}
            aria-hidden
          >
            <div
              className="amplifyRings"
              style={
                {
                  "--reaction-aura": reactionAura,
                } as React.CSSProperties
              }
            >
              <span />
              <span />
              <span />
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
    <div
      ref={cardRef}
      className={clsx(
        "card",
        compact && "compact",
        compactSpotify && "compactSpotify",
        item?.kind === "announcement" && "announcementDrop",
        isPushed && "pushedDrop",
        isPayDrop && "payDropCard",
        dropVisibility === "private" && item?.kind === "board_drop" && "privateDropCard",
        amplifyBurst && "cardAmplifying"
      )}
      style={
        {
          "--author-glow": authorGlow,
          "--author-aura-power": String(displayAuraPower),
          "--reaction-aura": reactionAura,
        } as React.CSSProperties
      }
    >
      {isPushed ? <div className="pushedByLabel">⚡ Amplified by {pushedByName}</div> : null}
      <div className="head">
        <div className="headCopy">
          {/* Row 1: drop-type badge on the left, secondary media label across on the right. */}
          <div className="metaRow">
            <RemovableDropBadge
              label={kindLabel}
              canRemove={canManageDrop}
              onRemove={removeDropFromBoard}
              isRemoving={isRemovingDrop}
            />
            {announcementVibeLabel ? (
              <span className="metaBadge vibeBadge">{announcementVibeLabel}</span>
            ) : null}
            {badgeLabel && !showCapturedOnMediaOverlay ? (
              <span className="metaBadge">{badgeLabel}</span>
            ) : null}
            {isPayDrop && priceLabel ? <span className="metaBadge">{priceLabel}</span> : null}
            {canonicalBoardDrop?.draftCount ? (
              <span className="metaBadge draftBadge" title="Drafts saved in Drop Studio">
                🗂 {canonicalBoardDrop.draftCount}
              </span>
            ) : null}
            {secondaryMetaLabel ? (
              <span className="metaBadge studioSubBadge metaSecondary">{secondaryMetaLabel}</span>
            ) : null}
          </div>

          {timeLabel ? (
            <div className="metaRow2">
              <span className="metaBadge timeBadge">{timeLabel}</span>
            </div>
          ) : null}

          <div className="title">
            <RichText as="span" value={titleRich} plain={title} />
          </div>
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

      {/* ✅ EMBED (now media-aware) */}
      {showEmbed ? (
        <div className={clsx("embed", embed.kind)}>
          {embed.kind === "image" && (
            <div className="mediaFrame">
              <img
                src={embed.url}
                alt={title || "Vision drop"}
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

          {embed.kind === "spotify" ? (
            <div className="embedNote">
              Streaming embeds may play a preview clip. Upload the audio file as a Music Drop for full in-Board playback.
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
      !showFullSongPlayer &&
      !preferNativeBoardMedia ? (
        <a
          className="linkPreview"
          href={href}
          target={external ? "_blank" : undefined}
          rel={external ? "noreferrer" : undefined}
        >
          <div className="linkPreviewArt">
            {secondaryMetaLabel ? (
              <div className="linkCoverHostChip">
                <span>{secondaryMetaLabel}</span>
              </div>
            ) : null}
            <img className="linkPreviewImg" src={resolvedPreviewImage} alt="" loading="lazy" />
            <div className="linkPreviewShade" />
            <div className="linkPreviewCopy">
              <div className="linkPreviewLabel">{previewKindLabel}</div>
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
            src={storedVideoSrc}
            controls
            playsInline
            preload="metadata"
            onError={() => setEmbedFailed(true)}
          />
          <DropStudioOverlay customizations={dropCustomizations} />
        </div>
      ) : null}

      {!showEmbed &&
      preferNativeAudioPreview &&
      !showFullSongPlayer &&
      storedAudioSrc ? (
        <div className="mediaFrame storedAudioFrame">
          <div className="audioLabel">
            {secondaryMetaLabel?.toUpperCase() || (isThoughtDrop ? "Vocal" : isPayDrop ? "Audio" : "Full song")}
          </div>
          <AudioDropPlayer src={storedAudioSrc} onError={() => setEmbedFailed(true)} />
        </div>
      ) : null}

      {!showEmbed && (showFullSongPlayer || (isMusicDropType(musicDropType) && musicHydrating)) ? (
        <div className="mediaFrame storedAudioFrame">
          <div className="audioLabel">
            {secondaryMetaLabel?.toUpperCase() || (isPayDrop ? "Audio" : "Full song")}
          </div>
          {storedAudioSrc ? (
            <AudioDropPlayer src={storedAudioSrc} onError={() => setEmbedFailed(true)} />
          ) : (
            <div className="audioLoading">Loading full song…</div>
          )}
        </div>
      ) : null}

      {!showEmbed &&
      resolvedPreviewImage &&
      !showAnnouncementImage &&
      !isStoredVideoDrop &&
      !showFullSongPlayer &&
      preferNativeImagePreview ? (
        <div className="activityImagePreview">
          {secondaryMetaLabel || showCapturedOnMediaOverlay ? (
            <div className="media-overlay-badges">
              {secondaryMetaLabel ? (
                <span className="activityMediaChip">{secondaryMetaLabel}</span>
              ) : null}
              {showCapturedOnMediaOverlay ? (
                <span className="media-captured-badge">{badgeLabel}</span>
              ) : null}
            </div>
          ) : null}
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
      !showFullSongPlayer ? (
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
            {secondaryMetaLabel ? (
              <div className="linkCoverHostChip">
                <span>{secondaryMetaLabel}</span>
              </div>
            ) : null}
            <div className="linkPreviewCopy">
              <div className="linkPreviewLabel">{previewKindLabel}</div>
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

      {/* Description sits directly under the media attachment. */}
      {body ? (
        <div className="body">
          <RichText as="span" value={descRich} plain={body} />
        </div>
      ) : null}

      {isPayDrop ? (
        <PayOnBoardButton busy={payCheckoutBusy} onClick={() => void openPayCheckout()} />
      ) : null}

      {/* Reaction rail: PASS · PIN · PUSH, then Drop Studio tools (matches Board Drop Collection) */}
      <div className="rail" aria-label="Reaction rail">
        <div className="railRow railRowTop">
          <div className="railCluster" aria-label="Drop reactions">
            <button
              type="button"
              className={clsx("rbtn pass", selectedReactions.pass && "selected")}
              onClick={(event) => {
                event.stopPropagation();
                signal("pass");
              }}
              title="PASS (acknowledge)"
              aria-label="Pass"
            >
              <span className="glyph" aria-hidden>
                <PassGlyph />
              </span>
            </button>

            <button
              type="button"
              className={clsx("rbtn pin", selectedReactions.pin && "selected")}
              onClick={(event) => {
                event.stopPropagation();
                signal("pin");
              }}
              title="PIN (save)"
              aria-label="Pin"
            >
              <span className="glyph" aria-hidden>
                <StarGlyph />
              </span>
            </button>

            <button
              type="button"
              className={clsx("rbtn push", selectedReactions.push && "selected")}
              onClick={(event) => {
                event.stopPropagation();
                signal("push");
              }}
              title="PUSH (boost)"
              aria-label="Push"
            >
              <span className="glyph" aria-hidden>
                <ArrowGlyph />
              </span>
            </button>
          </div>
        </div>

        <div className="activityDropActionStack">
          <button
            type="button"
            className="rbtn activityDropComment"
            onClick={() => setCommentsOpen(true)}
            title="Comment"
          >
            <span className="lbl">
              Comment{commentCount ? ` ${commentCount}` : ""}
            </span>
          </button>

          {canManageDrop ? (
            <div className="activityDropToolsSlot">
              {item?.kind === "board_drop" ? (
                <button
                  type="button"
                  className={`visEye activityDropEye vis-${dropVisibility}`}
                  onClick={() => void toggleDropVisibility()}
                  aria-pressed={dropVisibility === "private"}
                  aria-label={`${
                    dropVisibility === "public" ? "Public" : "Private"
                  } drop — tap to toggle`}
                  title={`${
                    dropVisibility === "public" ? "Public" : "Private"
                  } — tap to toggle`}
                >
                  <EyeToggle open={dropVisibility === "public"} />
                </button>
              ) : null}

              <button
                type="button"
                className="drop-studio-editor-btn activityDropStudio"
                onClick={openDropStudioEditor}
                title="Edit this drop in Drop Studio Editor"
              >
                <span className="drop-studio-editor-glyph" aria-hidden>
                  🎬
                </span>
                <span className="drop-studio-editor-lbl">
                  Drop Studio<span className="dse-word-editor">&nbsp;Editor</span>
                </span>
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <DropCommentsDrawer
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        dropId={commentDropId}
        dropTitle={title}
      />

      {toast ? (
        <div className={clsx("toast", !toastVisible && "toastOut")}>{toast}</div>
      ) : null}

      {/* Dynamic, compact-dependent values; static rules live in ActivityCard.css */}
      <style>{`
        .authorAvatarFrame {
          --avatar-size: ${compact ? "42px" : "50px"};
        }
        @media (max-width: 620px) {
          .authorAvatarFrame {
            --avatar-size: 40px;
          }
        }
        .linkPreviewArt {
          min-height: ${compact ? "170px" : "230px"};
        }
        .linkPreviewTitle {
          font-size: ${compact ? "16px" : "20px"};
        }
        .activityImage {
          max-height: ${compact ? "min(540px, 58vh)" : "min(1080px, 85vh)"};
        }
        .activityImagePreview:not(.announcementMedia) .activityImage {
          max-height: ${compact ? "min(540px, 58vh)" : "min(1080px, 85vh)"};
        }
        .announcementMedia {
          min-height: ${compact ? "380px" : "560px"};
        }
        .img {
          max-height: ${compact ? "min(540px, 58vh)" : "min(1080px, 85vh)"};
        }
      `}</style>
    </div>
    {amplifyPortal}
    </>
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
