"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import clsx from "clsx";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { removePayDrop, upsertPayDrop } from "@/lib/board/paydrops";
import {
  appendLocalActivity,
  createActivity,
  syncActivitiesForDropEdit,
  type BoardActivity,
} from "@/lib/board/activity";
import { pushDrop } from "@/lib/board/drops/storage";
import {
  attachmentPreviewLabel,
  mediaAttachmentChipLabel,
  normalizeBoardDropType,
  resolveDropMediaKind,
  secondaryAttachmentLabel,
  storageCoordsFromDrop,
} from "@/lib/board/dropDisplay";
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
  type DropCustomization,
} from "@/lib/board/dropCustomizations";
import { RichText } from "./RichTextField";
import { PayOnBoardButton } from "./PayOnBoardButton";
import RemovableDropBadge from "./RemovableDropBadge";
import { EyeToggle } from "./icons/EyeToggle";
import DropStudioStage from "./DropStudioStage";
import DropCommentsDrawer from "./DropCommentsDrawer";
import AudioDropPlayer from "./AudioDropPlayer";
import DropStudioOverlay from "./DropStudioOverlay";
import {
  DESCRIPT_SHARE_EVENT,
  descriptPlainText,
  type DescriptDestination,
  type DescriptDoc,
} from "@/lib/board/descriptDocs";

import {
  AURA_HEX,
  BUCKET_DOCS,
  BUCKET_MEDIA,
  LINK_MODE_ORDER,
  PROFILE_STORAGE_KEY,
  STORAGE_KEY,
  STUDIO_MODE_ORDER,
  boardTitleFields,
  dedupeDropItems,
  displayDropType,
  embedKindFromUrl,
  emitNewActivity,
  faviconUrl,
  flash,
  formatPriceFromCents,
  hostLabelFromUrl,
  isAudioFile,
  isImageFile,
  makeEmbedByMode,
  newsCoverUrl,
  normalizeDropItems,
  normalizeUrl,
  parsePriceToCents,
  readBestLocalDropItems,
  readDeletedDropIds,
  readLocalDropAvatar,
  rememberDeletedDropId,
  safeId,
  sanitizeFileName,
  scopedStorageKey,
  thoughtFormatFromFile,
  toMediaKind,
  type DropItem,
  type DropType,
  type EmbedKind,
  type MediaKind,
  type PayProviderMode,
  type StudioCaptureMode,
} from "@/lib/board/dropItem";

// Re-export so existing `import type { DropItem } from ".../DropTile"` callers
// (boardDropEditStore, musicMigration) keep working unchanged.
export type { DropItem } from "@/lib/board/dropItem";


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

  // ---- Edit an existing drop (owner only) ----
  const [editDrop, setEditDrop] = useState<DropItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editPayPrice, setEditPayPrice] = useState("");
  const [editPayLink, setEditPayLink] = useState("");
  const [editVisibility, setEditVisibility] = useState<"public" | "private">("public");
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editCustomizations, setEditCustomizations] = useState<DropCustomization>({});
  const [editStudioMode, setEditStudioMode] = useState<StudioCaptureMode | null>(null);
  const [editStudioInitialFile, setEditStudioInitialFile] = useState<File | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const editStudioAllowedModes = useMemo<StudioCaptureMode[]>(() => {
    if (!editDrop) return ["photo", "video", "audio", "art"];
    if (editDrop.type === "Doc") return ["descript"];
    if (editDrop.type === "Thought") return ["audio", "art", "descript"];
    if (editDrop.type === "Pay") return ["photo", "video", "audio", "art", "descript"];
    return ["photo", "video", "art"];
  }, [editDrop]);

  const editDescriptDestination = useMemo<DescriptDestination>(() => {
    if (editDrop?.type === "Thought") return "thought";
    if (editDrop?.type === "Pay") return "pay";
    return "doc";
  }, [editDrop]);

  function openEdit(d: DropItem) {
    setEditDrop(d);
    setEditTitle(d.title || "");
    setEditDesc(
      (d.type === "Thought" ? d.thoughtText : d.type === "Pay" ? d.description : d.description) || ""
    );
    setEditUrl(d.url || d.linkUrl || "");
    setEditPayPrice(d.priceCents ? (d.priceCents / 100).toFixed(2) : "");
    setEditPayLink(d.paymentLink || d.linkUrl || "");
    setEditVisibility(d.visibility ?? "public");
    setEditFile(null);
    setEditCustomizations(d.customizations || {});
  }

  function closeEdit() {
    setEditDrop(null);
    setEditFile(null);
    setEditStudioMode(null);
    setEditStudioInitialFile(null);
    setEditSaving(false);
  }

  // The board-wide editor (BoardDropEditModal) persists edits to localStorage +
  // Supabase and fires `board:drop:updated`. Re-read local drops so this grid
  // reflects the change immediately without a reload.
  useEffect(() => {
    function onUpdated() {
      setDrops(readBestLocalDropItems());
    }
    window.addEventListener("board:drop:updated", onUpdated);
    return () => window.removeEventListener("board:drop:updated", onUpdated);
  }, []);

  async function openEditStudio() {
    const d = editDrop;
    if (!d) return;
    let initial: File | null = null;
    if (d.bucket && d.storagePath) {
      try {
        const url = await getSignedUrl(d.bucket, d.storagePath);
        if (url) {
          const res = await fetch(url);
          const blob = await res.blob();
          initial = new File([blob], d.fileName || "drop-media", {
            type: blob.type || d.mime || "application/octet-stream",
          });
        }
      } catch {
        initial = null;
      }
    }
    setEditStudioInitialFile(initial);
    setEditStudioMode(d.mediaKind === "audio" ? "audio" : d.mediaKind === "video" ? "video" : "photo");
  }

  async function saveEdit() {
    const d = editDrop;
    if (!d) return;
    setEditSaving(true);
    try {
      let media: Partial<DropItem> = {
        bucket: d.bucket,
        storagePath: d.storagePath,
        mediaKind: d.mediaKind,
        fileName: d.fileName,
        mime: d.mime,
        fileSize: d.fileSize,
      };
      if (editFile) {
        const up = await uploadFileToStorage({ bucket: BUCKET_MEDIA, file: editFile, dropId: d.id });
        if (up) {
          const isAudio = isAudioFile(editFile);
          media = {
            bucket: up.bucket,
            storagePath: up.storagePath,
            mediaKind: isAudio ? "audio" : editFile.type.startsWith("video/") ? "video" : "image",
            fileName: editFile.name,
            mime: editFile.type,
            fileSize: editFile.size,
          };
        }
      }

      const cents = d.type === "Pay" ? parsePriceToCents(editPayPrice) : d.priceCents;
      const cleanLink = editPayLink.trim() ? normalizeUrl(editPayLink) : null;
      const updated: DropItem = {
        ...d,
        ...boardTitleFields(editTitle, d.title),
        description:
          d.type === "Thought" ? d.description : editDesc.trim() || undefined,
        thoughtText: d.type === "Thought" ? editDesc.trim() || undefined : d.thoughtText,
        visibility: d.type === "Thought" ? editVisibility : d.visibility,
        url:
          d.type === "Link" || d.type === "News" || d.type === "YouTube" || d.type === "Music"
            ? (editUrl.trim() ? normalizeUrl(editUrl) ?? d.url : d.url)
            : d.url,
        priceCents: d.type === "Pay" ? cents ?? d.priceCents : d.priceCents,
        paymentLink: d.type === "Pay" ? cleanLink ?? undefined : d.paymentLink,
        linkUrl: d.type === "Pay" ? cleanLink ?? d.linkUrl : d.linkUrl,
        customizations: compactDropCustomizations(editCustomizations) ?? d.customizations,
        updatedAt: Date.now(),
        ...media,
      };

      const next = drops.map((x) => (x.id === d.id ? updated : x));
      persist(next);

      // Propagate the edit to the shared feed (board_activity) so it shows on
      // every device — not just this one's local cache. Mirrors the board-wide
      // editor's persistDropEdit behavior.
      try {
        let mediaPreviewUrl: string | null = null;
        if (updated.bucket && updated.storagePath) {
          mediaPreviewUrl = await getSignedUrl(updated.bucket, updated.storagePath, 60 * 45);
        } else if (updated.mediaUrl) {
          mediaPreviewUrl = updated.mediaUrl;
        }
        await syncActivitiesForDropEdit({ ...updated, mediaPreviewUrl });
      } catch {
        // local persist already stands
      }

      if (updated.type === "Pay") {
        upsertPayDrop(
          {
            id: updated.id,
            title: updated.title,
            description: updated.description || undefined,
            amountCents: updated.priceCents ?? 0,
            recipientUserId: updated.recipientUserId,
            recipientUsername: updated.recipientUsername,
            recipientDisplayName: updated.recipientDisplayName,
            recipientStripeAccountId: updated.recipientStripeAccountId,
            createdAt: updated.createdAt,
            updatedAt: Date.now(),
            provider: updated.payProvider ?? "stripe_connect",
            status: updated.payProvider === "stripe_connect" ? "gateway_setup_required" : "active",
            checkoutMode:
              updated.payProvider === "stripe_connect" ? "embedded_hosted" : "external_link",
            checkoutUrl: updated.paymentLink ?? undefined,
            gatewayLabel:
              updated.payProvider === "stripe_connect" ? "Stripe" : "External Payment Link",
            bucket: updated.bucket,
            storagePath: updated.storagePath,
            mediaKind:
              updated.mediaKind === "video"
                ? "video"
                : updated.mediaKind === "audio"
                  ? "audio"
                  : "image",
            mediaSource: updated.mediaSource ?? "upload",
          },
          userId
        );
      }

      flash(setMsg, "Drop updated ✓", 1500);
      closeEdit();
    } catch (err) {
      flash(setMsg, err instanceof Error ? err.message : "Couldn't update drop.", 2400);
      setEditSaving(false);
    }
  }

  const signedUrlRef = useRef<Record<string, string>>({});
  const [signedUrlByKey, setSignedUrlByKey] = useState<Record<string, string>>({});
  // Tracks link/news drops we've already tried to back-fill a thumbnail for,
  // so the hydration effect never re-fetches the same drop in a loop.
  const previewHydrationRef = useRef<Set<string>>(new Set());

  const studioAllowedModes = useMemo<StudioCaptureMode[]>(
    // Doc Drops are Descript-only. Thought = voice + art + Descript. Pay = all
    // media + Descript. Vision = camera + art only.
    () =>
      mode === "Doc"
        ? ["descript"]
        : mode === "Thought"
          ? ["audio", "art", "descript"]
          : mode === "Pay"
            ? ["photo", "video", "audio", "art", "descript"]
            : ["photo", "video", "art"],
    [mode]
  );

  const studioDescriptDestination = useMemo<DescriptDestination>(() => {
    if (mode === "Thought") return "thought";
    if (mode === "Pay") return "pay";
    return "doc";
  }, [mode]);

  function openStudio(nextMode: StudioCaptureMode, initial: File | null = null) {
    setStudioInitialFile(initial);
    setStudioMode(nextMode);
  }

  function closeStudio() {
    setStudioMode(null);
    setStudioInitialFile(null);
  }

  useEffect(() => {
    function onDescriptShare(event: Event) {
      const doc = (event as CustomEvent<DescriptDoc>).detail;
      if (!doc) return;
      const plain = doc.plainText?.trim() || descriptPlainText(doc.html);
      const cleanTitle = doc.title?.trim();
      if (cleanTitle) setTitle(cleanTitle);
      if (plain) {
        const dest = doc.destination ?? studioDescriptDestination;
        if (dest === "thought") setThoughtText(plain);
        else if (dest === "pay") setPayDesc(plain);
        else setDocDesc(plain);
      }
      setStudioMode(null);
    }
    window.addEventListener(DESCRIPT_SHARE_EVENT, onDescriptShare as EventListener);
    return () => window.removeEventListener(DESCRIPT_SHARE_EVENT, onDescriptShare as EventListener);
  }, [studioDescriptDestination]);

  // Clear any media a user attached (upload or capture) before posting, so they
  // can swap it out or start over. Resets the file, its source, the Studio
  // initial file, and any Drop Studio customizations tied to that media.
  function clearSelectedMedia() {
    setFile(null);
    setMediaSource(null);
    setStudioInitialFile(null);
    setSelectedMediaPreview("");
    setDropCustomizations({});
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
        // Surface the private thought to the profile Activity Channel live, the
        // same way public drops broadcast, so it appears without a reload.
        emitNewActivity(localActivity);
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

      const signedMediaUrl =
        item.bucket && item.storagePath ? await getSignedUrl(item.bucket, item.storagePath) : null;

      const imageUrl =
        item.type === "Media" && item.mediaKind === "image" && signedMediaUrl
          ? signedMediaUrl
        : item.type === "Thought" && item.mediaKind === "image" && signedMediaUrl
          ? signedMediaUrl
        : item.type === "Pay" && signedMediaUrl
          ? signedMediaUrl
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
          mediaUrl:
            item.type === "Music" && item.mediaKind === "audio"
              ? signedMediaUrl
              : null,
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

  // Public/Private toggle straight from the profile board tile (parity with Drop
  // Console + Work Board). Flips visibility, persists to boardDrops + Supabase,
  // mirrors to the feed activity row, and notifies any other mounted surface.
  function toggleDropVisibility(d: DropItem) {
    const next: "public" | "private" =
      (d.visibility ?? "public") === "public" ? "private" : "public";
    const updated: DropItem = { ...d, visibility: next, updatedAt: Date.now() };
    persist(drops.map((x) => (x.id === d.id ? updated : x)));
    void (async () => {
      try {
        let mediaPreviewUrl: string | null = null;
        if (updated.bucket && updated.storagePath) {
          mediaPreviewUrl = await getSignedUrl(updated.bucket, updated.storagePath, 60 * 45);
        } else if (updated.mediaUrl) {
          mediaPreviewUrl = updated.mediaUrl;
        }
        await syncActivitiesForDropEdit({ ...updated, mediaPreviewUrl });
      } catch {
        // local persist already stands
      }
      try {
        window.dispatchEvent(
          new CustomEvent("board:drop:updated", { detail: { dropId: updated.id, drop: updated } })
        );
      } catch {}
    })();
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

    const titleFields = boardTitleFields(title);
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
        ...titleFields,
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
        headline: mode === "News" ? preview?.title ?? titleFields.title : undefined,
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

    const titleFields = boardTitleFields(title);
    const id = safeId();

    const up = await uploadFileToStorage({ bucket: BUCKET_MEDIA, file, dropId: id });
    if (!up) return;
    const customizations = compactDropCustomizations(dropCustomizations);

    const next: DropItem[] = [
      {
        id,
        ...titleFields,
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

    const titleFields = boardTitleFields(
      title,
      file.name.replace(/\.[^.]+$/, "") || "Untitled"
    );
    const id = safeId();

    const up = await uploadFileToStorage({ bucket: BUCKET_MEDIA, file, dropId: id });
    if (!up) return;

    const next: DropItem[] = [
      {
        id,
        ...titleFields,
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

    const titleFields = boardTitleFields(title);
    const id = safeId();

    const up = await uploadFileToStorage({ bucket: BUCKET_DOCS, file, dropId: id });
    if (!up) return;

    const next: DropItem[] = [
      {
        id,
        ...titleFields,
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

    const titleFields = boardTitleFields(title, "Thought Drop");

    const next: DropItem[] = [
      {
        id,
        ...titleFields,
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
    const isAudio = isAudioFile(file);
    if (!isImage && !isVideo && !isAudio)
      return flash(setMsg, "Pay Drop media must be an image, video, or audio file.", 2200);
    const payMediaKind: MediaKind = isVideo ? "video" : isAudio ? "audio" : "image";

    const cents = parsePriceToCents(payPrice);
    if (cents === null) return flash(setMsg, "Enter a valid price (ex: 19.99).", 2000);
    if (cents <= 0) return flash(setMsg, "Price must be greater than 0.", 2000);

    const titleFields = boardTitleFields(title);
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
        ...titleFields,
        type: "Pay",
        createdAt: Date.now(),
        bucket: up.bucket,
        storagePath: up.storagePath,
        fileName: file.name,
        fileSize: file.size,
        mime: file.type,
        mediaKind: payMediaKind,
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
        title: titleFields.title,
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
        mediaKind: payMediaKind,
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
      const seen = new Set<string>();

      for (const d of drops) {
        const coords = storageCoordsFromDrop(d);
        if (!coords) continue;
        const key = `${coords.bucket}:${coords.storagePath}`;
        if (seen.has(key) || signedUrlRef.current[key] || signedUrlByKey[key]) continue;
        seen.add(key);

        const url = await getSignedUrl(coords.bucket, coords.storagePath, 60 * 45);
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
        ? "image/*,video/*,audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac"
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

      <div className="mode-rows" role="tablist" aria-label="Drop type">
        <div className="mode-row mode-row-studio">
          {STUDIO_MODE_ORDER.map((m) => (
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
        <div className="mode-row mode-row-links">
          {LINK_MODE_ORDER.map((m) => (
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
      </div>

      <div className="drop-form">
        <textarea
          className="drop-input drop-title-input"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          rows={2}
          aria-label="Title"
        />

        {mode === "Pay" ? (
          <>
            <button
              type="button"
              className="capture-action studio-open-cta"
              onClick={() => openStudio("descript")}
            >
              Open Drop Studio
            </button>

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
                  <button
                    type="button"
                    className="media-remove-btn"
                    onClick={clearSelectedMedia}
                    aria-label="Remove selected media"
                  >
                    ✕ Remove
                  </button>
                  {file?.type.startsWith("video/") ? (
                    <video src={selectedMediaPreview} controls playsInline />
                  ) : file && isAudioFile(file) ? (
                    <audio src={selectedMediaPreview} controls preload="metadata" />
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
            <div className="media-capture-field">
              <button
                type="button"
                className="capture-action studio-open-cta"
                onClick={() => openStudio("descript")}
              >
                Open Drop Studio
              </button>
              <div className="capture-help">
                Write and format in Descript — Doc Drops use Descript only. Attach your file below.
              </div>
            </div>

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
                    <button
                      type="button"
                      className="media-remove-btn inline"
                      onClick={clearSelectedMedia}
                      aria-label="Remove document"
                    >
                      ✕ Remove
                    </button>
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
              <div className="studio-preview-wrap">
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
                <button
                  type="button"
                  className="media-remove-btn"
                  onClick={clearSelectedMedia}
                  aria-label="Remove this Vision"
                >
                  ✕ Remove
                </button>
              </div>
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
            <button
              type="button"
              className="capture-action studio-open-cta"
              onClick={() => openStudio("descript")}
            >
              Open Drop Studio
            </button>

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
                <button
                  type="button"
                  className="media-remove-btn"
                  onClick={clearSelectedMedia}
                  aria-label="Remove thought attachment"
                >
                  ✕ Remove
                </button>
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
            // Normalize the stored type so non-canonical values (e.g. "thought",
            // "Pay Drop") still hit the right render branch. Strict === checks were
            // letting these fall through to the link-card body — the "distorted"
            // drops. Labels already normalized, so only the branch flags were off.
            const dropType = normalizeBoardDropType(d.type);
            const isMedia = dropType === "Media";
            const isDoc = dropType === "Doc";
            const isPay = dropType === "Pay";
            const isThought = dropType === "Thought";
            const isNews = dropType === "News";
            const isLinky = dropType === "Link";
            const isAudioMusic = dropType === "Music" && resolveDropMediaKind(d) === "audio";
            // Drop types created/edited through Drop Studio carry a draft count.
            const usesDropStudio = isMedia || isPay || isThought;

            const canEmbed = !!d.embedUrl;
            const kind: EmbedKind = d.embedUrl ? embedKindFromUrl(d.embedUrl) : "generic";

            const fav = d.url ? faviconUrl(d.url) : null;
            const cover = d.url ? newsCoverUrl(d.url) : null;
            const linkCover = resolveLinkPreviewImage(d.url, d.previewImage || cover);
            const linkTitle = d.previewTitle || d.headline || d.title;
            const linkDescription = d.previewDescription;

            const storageCoords = storageCoordsFromDrop(d);
            const signedKey = storageCoords
              ? `${storageCoords.bucket}:${storageCoords.storagePath}`
              : d.bucket && d.storagePath
                ? `${d.bucket}:${d.storagePath}`
                : "";
            const signedUrl = signedKey ? signedUrlByKey[signedKey] : undefined;
            const resolvedMediaKind = resolveDropMediaKind(d);
            const mainTypeLabel = displayDropType(d.type).toUpperCase();
            const secondaryLabel = secondaryAttachmentLabel(d);
            const mediaChipLabel = mediaAttachmentChipLabel(d);
            const thoughtImageSrc =
              resolvedMediaKind === "image"
                ? signedUrl || d.mediaUrl || d.url || undefined
                : undefined;
            const previewLabel = attachmentPreviewLabel(d);
            const mediaPending = !!signedKey && !signedUrl;
            const hasInlineOpenLink = (isNews || isLinky) && !!d.url;
            const showFooterOpenOriginal =
              !!d.url && !hasInlineOpenLink && !isThought && !isPay;
            const showFooterOpenDoc = isDoc && !!signedUrl;

            return (
              <div key={d.id} className="drop-item">
                <div className="drop-titleTop">
                  <RichText as="span" value={d.titleRich} plain={d.title} />
                </div>

                <div className="drop-metaRow">
                  <div className="drop-badges">
                    <RemovableDropBadge
                      label={displayDropType(d.type).toUpperCase()}
                      canRemove
                      onRemove={() => removeDrop(d.id)}
                    />
                    {secondaryLabel ? (
                      <span className="badge ghost secondary">{secondaryLabel}</span>
                    ) : null}
                    {isPay && d.priceCents ? (
                      <span className="badge ghost">{formatPriceFromCents(d.priceCents)}</span>
                    ) : null}
                    {/* Comment is the inline action in the type row: badge > label > comment. */}
                    <button
                      className="drop-mini drop-comment-inline"
                      type="button"
                      onClick={() => setCommentsDropId(d.id)}
                    >
                      Comment{commentCountByDrop[d.id] ? ` ${commentCountByDrop[d.id]}` : ""}
                    </button>
                  </div>
                </div>

                {/* Media attachment renders ABOVE the description (below it now). */}
                <div className={clsx("drop-attachment-block", isPay && "pay-drop-attachment")}>
                {isAudioMusic || ((isThought || isPay) && resolvedMediaKind === "audio") ? (
                  <div className={`audio-drop-card ${isThought ? "thought-audio-card" : ""}`}>
                    <div className="audio-drop-label">
                      {secondaryLabel?.toUpperCase() || (isThought ? "VOCAL" : isPay ? "AUDIO" : "FULL SONG")}
                    </div>
                    {signedUrl ? (
                      <AudioDropPlayer src={signedUrl} />
                    ) : mediaPending ? (
                      <div className="media-missing">
                        <div className="media-missing-title">Audio preparing…</div>
                        <div className="media-missing-sub">If this just uploaded, give it a moment.</div>
                      </div>
                    ) : (
                      <div className="media-missing">
                        <div className="media-missing-title">Audio unavailable</div>
                        <div className="media-missing-sub">Refresh once. If it persists, check Storage policies.</div>
                      </div>
                    )}
                  </div>
                ) : isThought && resolvedMediaKind === "image" ? (
                  <div className="media-thumb natural-media thought-media-thumb" aria-label="Thought art preview">
                    {mediaChipLabel ? <span className="media-attachment-chip">{mediaChipLabel}</span> : null}
                    {thoughtImageSrc ? (
                      <div className="drop-studio-media-frame">
                        <img src={thoughtImageSrc} alt={d.title} />
                      </div>
                    ) : mediaPending ? (
                      <div className="media-missing">
                        <div className="media-missing-title">Art preparing…</div>
                        <div className="media-missing-sub">If this just uploaded, give it a moment.</div>
                      </div>
                    ) : (
                      <div className="media-missing">
                        <div className="media-missing-title">Art unavailable</div>
                        <div className="media-missing-sub">Refresh once. If it persists, check Storage policies.</div>
                      </div>
                    )}
                  </div>
                ) : isMedia || (isPay && resolvedMediaKind && resolvedMediaKind !== "audio") ? (
                  <div
                    className={clsx(
                      "media-thumb",
                      isMedia && "natural-media",
                      isPay && "pay-thumb"
                    )}
                    aria-label={isPay ? "Pay drop image" : "Vision drop preview"}
                  >
                    {isMedia && mediaChipLabel ? (
                      <span className="media-attachment-chip">{mediaChipLabel}</span>
                    ) : null}
                    {signedUrl ? (
                      <div className="drop-studio-media-frame">
                        {resolvedMediaKind === "video" ? (
                          <video src={signedUrl} controls playsInline preload="metadata" />
                        ) : (
                          <img src={signedUrl} alt={d.title} />
                        )}
                        {isMedia ? (
                          <DropStudioOverlay customizations={d.customizations} />
                        ) : null}
                      </div>
                    ) : mediaPending ? (
                      <div className="media-missing">
                        <div className="media-missing-title">Media preparing…</div>
                        <div className="media-missing-sub">If this just uploaded, give it a moment.</div>
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
                      {signedUrl ? null : <span className="doc-wait">Preparing…</span>}
                    </div>

                    {d.description ? <div className="doc-desc">{d.description}</div> : null}
                  </div>
                ) : d.url && !isThought && !isPay ? (
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
                      {mediaChipLabel ? (
                        <div className="link-preview-host">
                          <span>{mediaChipLabel}</span>
                        </div>
                      ) : null}
                      <div className="link-preview-copy">
                        <div className="link-preview-label">{previewLabel}</div>
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

                {/* "Captured on Board" provenance chip — directly under the media,
                    above the Drop Studio Editor button. */}
                {d.badgeLabel ? (
                  <div className="drop-captured-row">
                    <span className="badge ghost captured-badge">{d.badgeLabel}</span>
                  </div>
                ) : null}

                {d.description && !isPay && !isDoc ? (
                  <div className="drop-description">
                    <RichText as="span" value={d.descriptionRich} plain={d.description} />
                  </div>
                ) : null}

                {isPay && d.description ? (
                  <div className="pay-desc pay-desc-top">
                    <RichText as="span" value={d.descriptionRich} plain={d.description} />
                  </div>
                ) : null}

                {isThought && d.thoughtText ? (
                  <div className="thought-body">{d.thoughtText}</div>
                ) : null}

                {(showFooterOpenOriginal || showFooterOpenDoc) ? (
                  <div className="drop-attachment-links">
                    {showFooterOpenOriginal ? (
                      <a className="drop-collection-open" href={d.url} target="_blank" rel="noreferrer">
                        Open Original →
                      </a>
                    ) : null}
                    {showFooterOpenDoc ? (
                      <a className="drop-collection-open" href={signedUrl} target="_blank" rel="noreferrer">
                        Open doc →
                      </a>
                    ) : null}
                  </div>
                ) : null}

                <div className="drop-studio-slot">
                  {/* Public/Private toggle sits at the bottom-left of the Studio
                      button (compact eye: open = public, closed = private). */}
                  <button
                    type="button"
                    className={`vis-eye vis-${d.visibility ?? "public"}`}
                    onClick={() => toggleDropVisibility(d)}
                    aria-pressed={(d.visibility ?? "public") === "private"}
                    aria-label={`${
                      (d.visibility ?? "public") === "public" ? "Public" : "Private"
                    } drop — tap to toggle`}
                    title={`${
                      (d.visibility ?? "public") === "public" ? "Public" : "Private"
                    } — tap to toggle`}
                  >
                    <EyeToggle open={(d.visibility ?? "public") === "public"} />
                  </button>
                  {usesDropStudio && (d.draftCount ?? 0) > 0 ? (
                    <span className="drop-counts" title="Drafts saved in Drop Studio">
                      🗂 {d.draftCount}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="drop-studio-editor-btn"
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent("board:drop:edit", {
                          detail: { dropId: d.id, drop: d },
                        })
                      )
                    }
                    title="Edit this drop in Drop Studio Editor"
                  >
                    <span className="drop-studio-editor-glyph" aria-hidden>
                      🎬
                    </span>
                    <span className="drop-studio-editor-lbl">Drop Studio Editor</span>
                  </button>
                </div>
                </div>

                {isPay ? (
                  <div className="pay-drop-footer">
                    <PayOnBoardButton
                      variant="collection"
                      busy={payCheckoutBusyId === d.id}
                      onClick={() => void openPayCheckout(d)}
                    />
                  </div>
                ) : null}
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
                      <AudioDropPlayer src={(viewerSignedUrl || signedUrlByKey[viewerSignedKey])!} autoPlay />
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
                <PayOnBoardButton
                  busy={payCheckoutBusyId === viewerDrop.id}
                  onClick={() => void openPayCheckout(viewerDrop)}
                />
              </div>
            ) : null}

            <div className="viewerHint">Press ESC to exit.</div>
          </div>
        </div>
      ) : null}

      <DropStudioStage
        open={studioMode !== null}
        initialFile={studioInitialFile}
        initialMode={
          studioMode ?? (mode === "Doc" ? "descript" : mode === "Thought" ? "audio" : "photo")
        }
        allowedModes={studioAllowedModes}
        descriptDestination={studioDescriptDestination}
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

      {editDrop ? (
        <div
          className="edit-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Edit drop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !editSaving) closeEdit();
          }}
        >
          <div className="edit-sheet">
            <div className="edit-head">
              <div>
                <div className="edit-eyebrow">{editDrop.type} Drop</div>
                <h3 className="edit-title-h">Edit Drop</h3>
              </div>
              <button
                type="button"
                className="edit-close"
                onClick={() => !editSaving && closeEdit()}
                aria-label="Close editor"
              >
                ✕
              </button>
            </div>

            <div className="edit-body">
              <label className="edit-label">Title</label>
              <textarea
                className="edit-input edit-title-input"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Title"
                rows={2}
                aria-label="Title"
              />

              {editDrop.type === "Link" ||
              editDrop.type === "News" ||
              editDrop.type === "YouTube" ||
              editDrop.type === "Music" ? (
                <>
                  <label className="edit-label">Link</label>
                  <input
                    className="edit-input"
                    value={editUrl}
                    onChange={(e) => setEditUrl(e.target.value)}
                    placeholder="https://…"
                  />
                </>
              ) : null}

              <label className="edit-label">
                {editDrop.type === "Thought" ? "Thought" : "Description"}
              </label>
              <textarea
                className="edit-textarea"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={3}
                placeholder="Add context…"
              />

              {editDrop.type === "Pay" ? (
                <>
                  <label className="edit-label">Price (ex: 19.99)</label>
                  <input
                    className="edit-input"
                    value={editPayPrice}
                    onChange={(e) => setEditPayPrice(e.target.value)}
                    inputMode="decimal"
                    placeholder="19.99"
                  />
                  <label className="edit-label">Checkout / payment link</label>
                  <input
                    className="edit-input"
                    value={editPayLink}
                    onChange={(e) => setEditPayLink(e.target.value)}
                    placeholder="Optional payment link"
                  />
                </>
              ) : null}

              {editDrop.type === "Thought" ? (
                <div className="edit-visibility">
                  {(["public", "private"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      className={`edit-vis ${editVisibility === v ? "on" : ""}`}
                      onClick={() => setEditVisibility(v)}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              ) : null}

              {editDrop.bucket && editDrop.storagePath ? (
                <div className="edit-media-row">
                  <button
                    type="button"
                    className="edit-studio-btn"
                    onClick={() => void openEditStudio()}
                  >
                    🎬 {editFile ? "Re-edit media in Drop Studio" : "Edit media in Drop Studio"}
                  </button>
                  {editFile ? (
                    <span className="edit-media-note">New media staged ✓</span>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="edit-actions">
              <button
                type="button"
                className="edit-cancel"
                onClick={() => !editSaving && closeEdit()}
                disabled={editSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="edit-save"
                onClick={() => void saveEdit()}
                disabled={editSaving}
              >
                {editSaving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <DropStudioStage
        open={editStudioMode !== null}
        initialFile={editStudioInitialFile}
        initialMode={editStudioMode ?? (editDrop?.type === "Doc" ? "descript" : "photo")}
        allowedModes={editStudioAllowedModes}
        descriptDestination={editDescriptDestination}
        value={editCustomizations}
        onChange={setEditCustomizations}
        onComplete={(captured) => {
          setEditFile(captured);
          setEditStudioMode(null);
        }}
        onClose={() => setEditStudioMode(null)}
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

        /* Profile media drops fill the standard 4:5 Board frame (cover) so they
           read identically to the feed instead of sitting small with letterbox
           bars. */
        .media-thumb.natural-media .drop-studio-media-frame {
          aspect-ratio: 4 / 5;
          width: 100%;
          max-width: 100%;
          height: auto;
          margin: 0 auto;
          border-radius: 14px;
          overflow: hidden;
        }
        .media-thumb.natural-media .drop-studio-media-frame > img,
        .media-thumb.natural-media .drop-studio-media-frame > video {
          width: 100%;
          height: 100%;
          max-width: 100%;
          max-height: none;
          object-fit: cover;
          border: 0;
          background: transparent;
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

        .mode-rows {
          margin-top: 12px;
          display: grid;
          gap: 10px;
          min-width: 0;
          max-width: 100%;
        }
        .mode-row {
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
        .studio-preview-wrap {
          position: relative;
          display: grid;
          gap: 8px;
        }
        .media-remove-btn {
          position: absolute;
          top: 9px;
          right: 9px;
          z-index: 3;
          border: 1px solid rgba(255, 120, 160, 0.55);
          border-radius: 999px;
          padding: 6px 11px;
          background: rgba(28, 6, 14, 0.82);
          color: #ffd7e3;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
          backdrop-filter: blur(4px);
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
          transition: transform 140ms ease, filter 140ms ease;
        }
        .media-remove-btn:hover {
          transform: translateY(-1px);
          filter: brightness(1.08);
        }
        .media-remove-btn.inline {
          position: static;
          padding: 4px 9px;
          background: rgba(120, 20, 40, 0.12);
          color: rgba(150, 20, 50, 0.95);
          border-color: rgba(150, 20, 50, 0.35);
          box-shadow: none;
          backdrop-filter: none;
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
          gap: 6px;
          align-content: start;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          overflow: hidden;
        }

        .drop-titleTop {
          font-weight: 650;
          color: rgba(0, 160, 80, 1);
          letter-spacing: 0.02em;
          min-width: 0;
          max-width: 100%;
          overflow-wrap: anywhere;
          white-space: pre-wrap;
        }

        .drop-titleTop :global(b),
        .drop-titleTop :global(strong) {
          font-weight: 900;
        }
        .drop-title-input {
          resize: vertical;
          min-height: 52px;
          line-height: 1.35;
          font-family: inherit;
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
        /* Comment shares the badge row, so size it to the 24px pill height. */
        .drop-comment-inline {
          display: inline-flex;
          align-items: center;
          height: 24px;
          padding: 0 12px;
          font-size: 11px;
          line-height: 1;
          flex: 0 0 auto;
        }
        /* "Captured on Board" chip sits left-aligned under the media. */
        .drop-captured-row {
          display: flex;
          justify-content: flex-start;
        }
        /* Sub-stats row under the type badge: Public/Private + drop counts. */
        .drop-substats {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          min-width: 0;
        }
        .drop-counts {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.04em;
          color: rgba(0, 0, 0, 0.5);
        }
        .drop-counts:empty {
          display: none;
        }
        .draft-count {
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        /* Public/Private toggle — a small circular eye button (open = public,
           closed = private). */
        .vis-eye {
          flex: 0 0 auto;
          width: 26px;
          height: 26px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          border-radius: 999px;
          cursor: pointer;
          border: 1px solid rgba(0, 140, 135, 0.28);
          background: rgba(220, 252, 240, 0.7);
          color: rgba(0, 140, 135, 0.95);
          transition: background 140ms ease, border-color 140ms ease, color 140ms ease,
            transform 120ms ease;
        }
        .vis-eye:hover {
          transform: translateY(-1px);
          border-color: rgba(0, 140, 135, 0.5);
        }
        .vis-eye.vis-private {
          color: rgba(120, 60, 160, 0.95);
          background: rgba(238, 230, 255, 0.72);
          border-color: rgba(120, 60, 160, 0.28);
        }
        /* Creator-only control — subtle, not a public reaction. */
        .edit-mini {
          border-color: rgba(126, 64, 255, 0.28);
          background: rgba(126, 64, 255, 0.08);
          color: rgba(90, 40, 200, 0.92);
        }
        .edit-mini:hover {
          background: rgba(126, 64, 255, 0.16);
          box-shadow: 0 0 14px rgba(126, 64, 255, 0.18);
        }
        .drop-attachment-block {
          display: grid;
          gap: 8px;
          width: 100%;
          min-width: 0;
          align-content: start;
        }

        .drop-attachment-links {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
        }

        .drop-studio-slot {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding-top: 2px;
        }

        .drop-collection-open {
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255, 0, 190, 0.85);
          text-decoration: underline;
          text-underline-offset: 4px;
        }

        .drop-studio-editor-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border-radius: 999px;
          padding: 10px 16px;
          border: 1px solid rgba(255, 90, 170, 0.42);
          background: rgba(255, 64, 160, 0.08);
          color: rgba(190, 30, 120, 0.95);
          cursor: pointer;
          font-family: inherit;
        }

        .drop-studio-editor-btn:hover {
          background: rgba(255, 64, 160, 0.16);
          box-shadow: 0 0 16px rgba(255, 90, 170, 0.28);
          color: rgba(210, 40, 130, 0.98);
        }

        .drop-studio-editor-glyph {
          font-size: 15px;
          line-height: 1;
        }

        .drop-studio-editor-lbl {
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }

        /* ---- Edit drop modal ---- */
        .edit-overlay {
          position: fixed;
          inset: 0;
          z-index: 100040;
          display: grid;
          place-items: center;
          padding: 16px;
          background: rgba(6, 10, 16, 0.6);
          backdrop-filter: blur(8px);
        }
        .edit-sheet {
          width: min(440px, 100%);
          max-height: min(86vh, 760px);
          display: flex;
          flex-direction: column;
          border-radius: 26px;
          overflow: hidden;
          border: 1px solid rgba(132, 244, 231, 0.3);
          background:
            radial-gradient(circle at 16% 0%, rgba(126, 64, 255, 0.16), transparent 42%),
            linear-gradient(180deg, rgba(10, 14, 22, 0.96), rgba(8, 10, 18, 0.98));
          color: #eef7ff;
          box-shadow: 0 30px 90px rgba(0, 0, 0, 0.5);
        }
        .edit-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 16px 18px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .edit-eyebrow {
          font-size: 10px;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          color: rgba(170, 140, 255, 0.85);
        }
        .edit-title-h {
          margin: 3px 0 0;
          font-size: 1.4rem;
          font-weight: 900;
        }
        .edit-close {
          width: 34px;
          height: 34px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.08);
          color: #eef7ff;
          cursor: pointer;
        }
        .edit-body {
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          padding: 16px 18px;
          display: grid;
          gap: 8px;
        }
        .edit-label {
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(180, 210, 230, 0.62);
          margin-top: 6px;
        }
        .edit-title-input {
          min-height: 52px;
          line-height: 1.35;
          resize: vertical;
        }
        .edit-input,
        .edit-textarea {
          width: 100%;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.06);
          color: #eef7ff;
          padding: 11px 13px;
          font: inherit;
          font-size: 14px;
          outline: none;
        }
        .edit-textarea {
          resize: vertical;
          min-height: 72px;
        }
        .edit-input::placeholder,
        .edit-textarea::placeholder {
          color: rgba(220, 235, 245, 0.4);
        }
        .edit-visibility {
          display: flex;
          gap: 8px;
          margin-top: 6px;
        }
        .edit-vis {
          border-radius: 999px;
          padding: 8px 14px;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(232, 255, 248, 0.7);
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(167, 244, 232, 0.2);
          cursor: pointer;
        }
        .edit-vis.on {
          color: #06121a;
          background: radial-gradient(circle at 30% 20%, #fff, #7ee2ff);
          border-color: rgba(255, 255, 255, 0.5);
        }
        .edit-media-row {
          margin-top: 12px;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 10px;
        }
        .edit-studio-btn {
          border-radius: 14px;
          padding: 11px 14px;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.04em;
          color: rgba(245, 252, 255, 0.94);
          background:
            radial-gradient(circle at 30% 18%, rgba(255, 255, 255, 0.14), transparent 55%),
            rgba(126, 226, 255, 0.14);
          border: 1px solid rgba(126, 226, 255, 0.4);
          cursor: pointer;
        }
        .edit-media-note {
          font-size: 11px;
          font-weight: 800;
          color: rgba(150, 255, 220, 0.9);
        }
        .edit-actions {
          flex: 0 0 auto;
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          padding: 14px 18px 18px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }
        .edit-cancel {
          border-radius: 999px;
          padding: 11px 18px;
          font-size: 12px;
          font-weight: 900;
          color: rgba(232, 246, 255, 0.82);
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.18);
          cursor: pointer;
        }
        .edit-save {
          border-radius: 999px;
          padding: 11px 22px;
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #06121a;
          background: radial-gradient(circle at 30% 20%, #fff, #7ee2ff);
          border: 1px solid rgba(255, 255, 255, 0.5);
          cursor: pointer;
        }
        .edit-save:disabled,
        .edit-cancel:disabled {
          opacity: 0.55;
          cursor: not-allowed;
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
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 24px;
          flex: 0 0 auto;
          box-sizing: border-box;
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          line-height: 1;
          padding: 0 10px;
          /* Match the feed's secondary pills (.metaBadge) exactly so profile
             and feed read identically. */
          padding-top: 1px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.74);
          border: 1px solid rgba(0, 0, 0, 0.1);
          color: rgba(0, 0, 0, 0.58);
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          vertical-align: middle;
        }
        .badge.ghost {
          background: rgba(255, 255, 255, 0.64);
          color: rgba(0, 0, 0, 0.58);
          border-color: rgba(0, 0, 0, 0.08);
        }
        .badge.secondary {
          color: rgba(0, 120, 105, 0.88);
          background: rgba(220, 252, 240, 0.72);
          border-color: rgba(0, 140, 120, 0.18);
        }
        .media-attachment-chip {
          position: absolute;
          top: 12px;
          left: 12px;
          z-index: 2;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 24px;
          padding: 0 10px;
          padding-top: 1px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.28);
          background: rgba(0, 0, 0, 0.48);
          color: rgba(255, 255, 255, 0.94);
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          line-height: 1;
          backdrop-filter: blur(8px);
          pointer-events: none;
        }
        .media-thumb.natural-media,
        .thought-media-thumb {
          position: relative;
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
          aspect-ratio: 4 / 3;
          max-height: min(240px, 52vw);
          display: grid;
          place-items: center;
          overflow: hidden;
          background:
            radial-gradient(circle at 18% 18%, rgba(52, 211, 153, 0.14), transparent 38%),
            radial-gradient(circle at 82% 22%, rgba(255, 0, 190, 0.08), transparent 34%),
            rgba(255, 255, 255, 0.72);
        }
        .media-thumb.pay-thumb .drop-studio-media-frame {
          width: 100%;
          height: 100%;
          min-height: 0;
          display: grid;
          place-items: center;
          overflow: hidden;
        }
        .media-thumb.pay-thumb img,
        .media-thumb.pay-thumb video {
          width: 100%;
          height: 100%;
          max-width: 100%;
          max-height: 100%;
          min-height: 0;
          object-fit: cover;
          border-radius: 14px;
        }
        .pay-drop-attachment .audio-drop-card {
          padding: 12px;
        }
        .pay-drop-footer {
          width: 100%;
          min-width: 0;
        }
        .media-thumb.natural-media {
          width: 100%;
          max-width: 100%;
          justify-self: start;
          border: 0;
          border-radius: 0;
          overflow: visible;
          background: transparent;
          padding: 0;
          margin: 0;
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
          width: auto;
          height: auto;
          max-width: 100%;
          max-height: min(420px, 62vh);
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
          font-weight: 600;
          line-height: 1.45;
          overflow-wrap: anywhere;
        }

        .drop-description :global(b),
        .drop-description :global(strong) {
          font-weight: 900;
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
        .pay-desc-top {
          margin-bottom: 2px;
          border-radius: 14px;
          border: 1px solid rgba(16, 120, 80, 0.12);
          background: rgba(240, 253, 244, 0.55);
          padding: 10px 12px;
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
          justify-content: center;
          height: 24px;
          max-width: calc(100% - 28px);
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.32);
          background: rgba(0, 0, 0, 0.48);
          padding: 0 10px;
          padding-top: 1px;
          color: rgba(255, 255, 255, 0.92);
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          line-height: 1;
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
