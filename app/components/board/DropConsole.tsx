// File: app/components/board/DropConsole.tsx
"use client";

import "./DropConsole.css";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

import { createActivity, type BoardActivityKind } from "@/lib/board/activity";
import { readCurrentBoardIdentity } from "@/lib/board/currentProfile";
import { isAudioFileUrl } from "@/lib/board/musicPlayback";
import { newId, pushDrop } from "@/lib/board/drops/storage";
import { emitBoardDropSignal } from "@/lib/board/dropSignals";
import { fetchLinkPreview } from "@/lib/board/linkPreview";
import {
  compactDropCustomizations,
  type DropCustomization,
} from "@/lib/board/dropCustomizations";
import {
  DROP_FLAVOR_LABEL,
  DROP_FLAVOR_LINK_ROW,
  DROP_FLAVOR_STUDIO_ROW,
  DROP_FLAVOR_SUB,
  type DropFlavorKey,
} from "@/lib/board/dropFlavors";

import {
  createThread,
  EVENTS,
  readForums,
  seedForumsIfEmpty,
  type BoardUser,
} from "@/lib/boardStore";
import DropStudio from "./DropStudio";
import DropStudioOverlay from "./DropStudioOverlay";
import DropStudioStage from "./DropStudioStage";
import { RichTextField } from "./RichTextField";
import {
  normalizeRichText,
  richTextFromPlain,
  richToPlain,
  type RichTextValue,
} from "@/lib/board/richText";
import {
  DESCRIPT_SHARE_EVENT,
  descriptPlainText,
  type DescriptDestination,
  type DescriptDoc,
} from "@/lib/board/descriptDocs";

/* -------------------------------------------------------------------------- */
/* utils */
/* -------------------------------------------------------------------------- */

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type DropMode = "announcement" | "forum_post" | "board_drop";

const MODE_LABEL: Record<DropMode, string> = {
  announcement: "Announcement",
  forum_post: "Thread Drop",
  board_drop: "Board Drop",
};

const MODE_HINT: Record<DropMode, string> = {
  announcement: "Status updates, but more fun. Broadcast to the whole Board.",
  forum_post: "Start a conversation room in the community.",
  board_drop: "Extensions of your Board with staple attachments.",
};

// Drop flavor type, order, and labels are centralized in lib/board/dropFlavors.ts
// so the Drop hierarchy stays identical across every creation surface.
type DropFlavor = DropFlavorKey;
type PayProviderMode = "payment_link" | "stripe_connect";
type StudioCaptureMode = "photo" | "video" | "audio" | "art" | "descript";

type AnnouncementVibe =
  | "hype"
  | "happy"
  | "chill"
  | "bored"
  | "serious"
  | "sad"
  | "creepy"
  | "funny"
  | "nostalgic"
  | "chaos"
  | "victory"
  | "locked_in"
  | "romantic"
  | "plot_twist"
  | "aesthetic"
  | "sleepy"
  | "rage"
  | "mystic"
  | "tea";

const VIBE_OPTIONS: Array<{ value: AnnouncementVibe; label: string }> = [
  { value: "hype", label: "🔥 Hype" },
  { value: "happy", label: "😊 Happy" },
  { value: "chill", label: "🌿 Chill" },
  { value: "bored", label: "😐 Bored" },
  { value: "serious", label: "🧠 Serious" },
  { value: "sad", label: "😔 Sad" },
  { value: "creepy", label: "👁️ Creepy" },
  { value: "funny", label: "😂 Funny" },
  { value: "nostalgic", label: "🕰️ Nostalgic" },
  { value: "chaos", label: "🧨 Chaos" },
  { value: "victory", label: "🏆 Victory" },
  { value: "locked_in", label: "🎧 Locked In" },
  { value: "romantic", label: "💞 Romantic" },
  { value: "plot_twist", label: "🌀 Plot Twist" },
  { value: "aesthetic", label: "🪩 Aesthetic" },
  { value: "sleepy", label: "🛌 Sleepy" },
  { value: "rage", label: "💥 Rage" },
  { value: "mystic", label: "🔮 Mystic" },
  { value: "tea", label: "🍵 Tea" },
];

function modeToKind(m: DropMode): BoardActivityKind {
  if (m === "announcement") return "announcement";
  if (m === "forum_post") return "forum_post";
  return "board_drop";
}

function isExternalHref(href: string) {
  return /^https?:\/\//i.test(href);
}

function attachmentPlaceholder(flavor: DropFlavor) {
  switch (flavor) {
    case "youtube":
      return "Paste YouTube link";
    case "music":
      return "Paste Spotify / SoundCloud / YouTube Music link";
    case "news":
      return "Paste article link";
    case "link":
      return "Paste any link";
    case "doc":
      return "Paste doc link (Drive / PDF / Notion / etc.)";
    case "pay":
      return "Paste external payment/support link";
    case "media":
      return "Paste image/video link (or upload below)";
    default:
      return "Paste link";
  }
}

/** Tags: allow "#music #nyc", "music, nyc", "music nyc" */
function parseTags(raw: string): string[] {
  const cleaned = raw.replace(/\n/g, " ").replace(/,/g, " ").trim();
  if (!cleaned) return [];
  const parts = cleaned
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => t.replace(/^#/, "").toLowerCase())
    .filter((t) => /^[a-z0-9_-]{1,32}$/.test(t));
  return Array.from(new Set(parts)).slice(0, 12);
}

function parsePriceToCents(raw: string): number | null {
  const s = raw.trim().replace(/^\$/g, "");
  if (!s) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function fileAcceptForFlavor(flavor: DropFlavor) {
  if (flavor === "media") return "image/*,video/*";
  if (flavor === "music") return "audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac";
  if (flavor === "pay") return "image/*,video/*,audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac";
  if (flavor === "thought") return "image/*,audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac";
  if (flavor === "doc") {
    return ".pdf,.doc,.docx,.txt,.rtf,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown";
  }
  return "";
}

function uploadLabelForFlavor(flavor: DropFlavor) {
  if (flavor === "music") return "Upload audio for full song playback";
  if (flavor === "doc") return "Upload doc (PDF/DOC/TXT/MD)";
  if (flavor === "pay") return "Upload or capture request context";
  if (flavor === "thought") return "Optional voice memo or doodle/image";
  return "Upload photo or video";
}

/** Broadcast to CommunityFeed so it can prepend immediately (no refresh). */
function emitNewActivity(payload: any) {
  try {
    window.dispatchEvent(
      new CustomEvent("board:activity:new", { detail: payload })
    );
  } catch {
    // no-op
  }
}

function inferMediaType(url: string) {
  const u = url.toLowerCase();
  if (/\.(png|jpg|jpeg|gif|webp|avif|svg|bmp|tif|tiff|heic|heif)(\?|$)/i.test(u)) return "image";
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(u)) return "video";
  if (/\.(mp3|wav|m4a|aac|ogg|flac|weba)(\?|$)/i.test(u)) return "audio";
  if (isAudioFileUrl(url)) return "audio";
  if (/\/storage\/v1\/object\/public\/board-media\//i.test(u)) return "link";
  return "link";
}

function musicMediaKind(
  attachUrl: string | null,
  fileName: string,
  attachMediaType: string | null
) {
  if (attachMediaType === "audio") return "audio";
  if (isAudioFileUrl(attachUrl || "")) return "audio";
  if (/\.(mp3|m4a|wav|aac|ogg|flac|weba)$/i.test(fileName)) return "audio";
  return null;
}

function thoughtFormatFromMedia(mediaType: string | null) {
  if (mediaType === "audio") return "voice";
  if (mediaType === "image") return "doodle";
  return "text";
}

/* -------------------------------------------------------------------------- */
/* component */
/* -------------------------------------------------------------------------- */

type DropConsoleVariant = "tile" | "bare";

export default function DropConsole({
  variant = "tile",
}: {
  variant?: DropConsoleVariant;
}) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [meId, setMeId] = useState<string | null>(null);

  // IMPORTANT: start asleep by default
  const [sleeping, setSleeping] = useState(true);

  const [mode, setMode] = useState<DropMode>("board_drop");
  const [dropFlavor, setDropFlavor] = useState<DropFlavor>("media");

  const [title, setTitle] = useState("");
  const [titleRich, setTitleRich] = useState<RichTextValue>({ html: "" });
  const [body, setBody] = useState("");
  const [attachUrl, setAttachUrl] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [uploadedBucket, setUploadedBucket] = useState<string | null>(null);
  const [uploadedStoragePath, setUploadedStoragePath] = useState<string | null>(null);
  const [studioMode, setStudioMode] = useState<StudioCaptureMode | null>(null);
  const [dropCustomizations, setDropCustomizations] = useState<DropCustomization>({});
  const [dropDesc, setDropDesc] = useState("");
  const [dropDescRich, setDropDescRich] = useState<RichTextValue>({ html: "" });
  const [mediaSource, setMediaSource] = useState<"upload" | "capture" | null>(null);
  const [thoughtText, setThoughtText] = useState("");
  const [dropVisibility, setDropVisibility] = useState<"public" | "private">("public");
  const [payDescRich, setPayDescRich] = useState<RichTextValue>({ html: "" });
  const [docDescRich, setDocDescRich] = useState<RichTextValue>({ html: "" });

  const [tagsInput, setTagsInput] = useState("");
  const [payProvider, setPayProvider] =
    useState<PayProviderMode>("stripe_connect");
  const [payPrice, setPayPrice] = useState("");
  const [payDesc, setPayDesc] = useState("");
  const [payLink, setPayLink] = useState("");
  const [docDesc, setDocDesc] = useState("");

  // Forum Post mode
  const [forumId, setForumId] = useState<string>("general");
  const [forumOptions, setForumOptions] = useState<
    Array<{ id: string; title: string }>
  >([]);

  // Announcement mode
  const [vibe, setVibe] = useState<AnnouncementVibe>("hype");
  const [announceMediaUrl, setAnnounceMediaUrl] = useState("");

  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  const [posting, setPosting] = useState(false);
  const [postMsg, setPostMsg] = useState<string | null>(null);
  const [postErr, setPostErr] = useState<string | null>(null);

  /* auth */
  useEffect(() => {
    sb.auth.getUser().then(({ data }) => {
      setMeId(data.user?.id ?? null);
    });
  }, [sb]);

  /* wake event */
  useEffect(() => {
    const onOpen = () => setSleeping(false);
    window.addEventListener("board:dropconsole:open", onOpen as EventListener);
    return () =>
      window.removeEventListener(
        "board:dropconsole:open",
        onOpen as EventListener
      );
  }, []);

  /* forums */
  useEffect(() => {
    seedForumsIfEmpty();
    const db = readForums();
    const nextOptions = db.forums.map((f) => ({ id: f.id, title: f.title }));
    setForumOptions(nextOptions);

    const hasGeneral = nextOptions.some((f) => f.id === "general");
    if (hasGeneral) setForumId("general");
    else if (nextOptions.length > 0) setForumId(nextOptions[0].id);

    const onForums = () => {
      const next = readForums();
      const opts = next.forums.map((f) => ({ id: f.id, title: f.title }));
      setForumOptions(opts);

      const stillExists = opts.some((f) => f.id === forumId);
      if (!stillExists) {
        const hasGen = opts.some((f) => f.id === "general");
        setForumId(hasGen ? "general" : opts[0]?.id ?? "general");
      }
    };

    window.addEventListener(EVENTS.forumsUpdated, onForums as EventListener);
    return () =>
      window.removeEventListener(
        EVENTS.forumsUpdated,
        onForums as EventListener
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bodyPlaceholder =
    mode === "announcement"
      ? "What’s the announcement?"
      : mode === "forum_post"
      ? "Start a conversation… ask a question, share a thought, or invite opinions."
      : "Describe the drop. Make it feel like a cutout on your Board.";

  async function uploadToBoardMedia(file: File, source: "upload" | "capture" = "upload") {
    setUploadErr(null);
    setUploading(true);

    try {
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const bucket = mode === "board_drop" && dropFlavor === "doc" ? "board-docs" : "board-media";
      const path = `uploads/${meId ?? "demo"}/${Date.now()}_${Math.random()
        .toString(16)
        .slice(2)}.${ext}`;

      const { error } = await sb.storage
        .from(bucket)
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || undefined,
        });

      if (error) throw error;

      const pub = sb.storage.from(bucket).getPublicUrl(path);
      const url = pub.data.publicUrl;

      if (mode === "announcement") setAnnounceMediaUrl(url);
      if (mode === "board_drop") {
        setAttachUrl(url);
        setUploadedFileName(file.name);
        setUploadedBucket(bucket);
        setUploadedStoragePath(path);
        setMediaSource(source);
        if (dropFlavor === "media" && source === "upload") setDropCustomizations({});
      }

      setPostMsg("Media attached ✓");
      window.setTimeout(() => setPostMsg(null), 1500);
    } catch (e: any) {
      setUploadErr(
        e?.message || "Upload failed. Check board-media bucket + policies."
      );
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPosting(true);
    setPostErr(null);
    setPostMsg(null);

    try {
      const kind = modeToKind(mode);

      const cleanTitle = title.trim() || null;
      let cleanBody = body.trim();
      const cleanAttach =
        mode === "board_drop" && dropFlavor === "pay" && payProvider === "payment_link"
          ? payLink.trim() || attachUrl.trim() || null
          : attachUrl.trim() || null;
      const tags = parseTags(tagsInput);
      const payPriceCents = dropFlavor === "pay" ? parsePriceToCents(payPrice) : null;
      const boardDropDescription =
        dropFlavor === "pay"
          ? richToPlain(payDescRich.html) || payDesc.trim()
          : dropFlavor === "doc"
          ? richToPlain(docDescRich.html) || docDesc.trim()
          : richToPlain(dropDescRich.html) || dropDesc.trim();
      // Inline-formatted title/description for the feed + tile to render.
      const titleRichMeta = normalizeRichText(titleRich) ?? null;
      const descriptionRichMeta =
        dropFlavor === "thought"
          ? null
          : dropFlavor === "pay"
          ? normalizeRichText(payDescRich) ?? null
          : dropFlavor === "doc"
          ? normalizeRichText(docDescRich) ?? null
          : normalizeRichText(dropDescRich) ?? null;
      const annMediaDraft = mode === "announcement" ? announceMediaUrl.trim() : "";
      // Save Drop Studio customizations (text / stickers / effects) for ANY board
      // drop that can carry media — Thought (art/photo), Vision, Pay — plus
      // announcements with media. compactDropCustomizations() returns undefined
      // when there are none, so flavors without overlays simply store nothing.
      const mediaCustomizations =
        mode === "board_drop"
          ? compactDropCustomizations(dropCustomizations)
          : mode === "announcement" && annMediaDraft
            ? compactDropCustomizations(dropCustomizations)
            : undefined;
      const attachMediaType = cleanAttach ? inferMediaType(cleanAttach) : null;
      const resolvedMusicKind =
        dropFlavor === "music"
          ? musicMediaKind(cleanAttach, uploadedFileName, attachMediaType)
          : null;
      const thoughtFormat =
        dropFlavor === "thought" ? thoughtFormatFromMedia(attachMediaType) : null;
      const identity = readCurrentBoardIdentity();
      const boardDropId = mode === "board_drop" ? newId(dropFlavor) : null;

      if (mode === "board_drop") {
        cleanBody =
          dropFlavor === "thought"
            ? thoughtText.trim() ||
              boardDropDescription ||
              (cleanTitle ? `Thought Drop: ${cleanTitle}` : cleanAttach ? "Thought attachment saved to Board." : "")
            : dropFlavor === "pay"
            ? boardDropDescription || (cleanTitle ? `Pay Drop: ${cleanTitle}` : "")
            : dropFlavor === "doc"
            ? boardDropDescription || (cleanTitle ? `Doc Drop: ${cleanTitle}` : "")
            : boardDropDescription
            ? boardDropDescription
            : cleanTitle
            ? `New ${dropFlavor} drop added to Board.`
            : "";
      }

      if (!cleanBody) {
        throw new Error(
          mode === "board_drop" && dropFlavor === "thought"
            ? "Add a thought or attach a voice memo/doodle."
            : mode === "board_drop"
              ? "Add a title."
              : "Add a description."
        );
      }
      if (dropFlavor === "pay" && mode === "board_drop" && payPrice.trim() && payPriceCents === null) {
        throw new Error("Enter a valid Pay Drop price.");
      }

      // Forum Post: auto-create thread + href to thread
      let autoHref: string | null = null;
      if (mode === "forum_post") {
        const me: BoardUser = { id: meId ?? "demo", displayName: "Board User" };

        const threadTitle =
          cleanTitle ??
          (cleanBody.length > 72
            ? `${cleanBody.slice(0, 72).trim()}…`
            : cleanBody);

        const t = createThread({
          forumId,
          title: threadTitle,
          body: cleanBody,
          author: me,
        });

        autoHref = `/board/forums?forum=${encodeURIComponent(
          forumId
        )}&thread=${encodeURIComponent(t.id)}`;
      }

      // Board Drop: preview if external attachment
      let preview: any = null;
      if (mode === "board_drop" && cleanAttach && isExternalHref(cleanAttach)) {
        preview = await fetchLinkPreview(cleanAttach);
      }

      // Announcement media: store as href so ActivityCard can embed
      const cleanAnnMedia = announceMediaUrl.trim() || null;
      const annMediaType = cleanAnnMedia ? inferMediaType(cleanAnnMedia) : null;

      const resolvedHref =
        mode === "forum_post"
          ? autoHref
          : mode === "board_drop"
          ? cleanAttach
          : mode === "announcement"
          ? cleanAnnMedia
          : null;
      const directImageUrl =
        mode === "board_drop" &&
        cleanAttach &&
        (dropFlavor === "media" || dropFlavor === "pay" || dropFlavor === "thought") &&
        attachMediaType === "image"
          ? cleanAttach
          : null;

      const res = await createActivity(sb, {
        user_id: meId,
        kind,
        title: cleanTitle,
        body: cleanBody,
        href: resolvedHref,
        image_url:
          mode === "board_drop"
            ? (preview?.image ?? directImageUrl ?? null)
            : mode === "announcement" && annMediaType === "image"
            ? cleanAnnMedia
            : null,
        meta: {
          source: "drop_console",
          tags,

          ...(mode === "board_drop"
            ? {
                drop_flavor: dropFlavor,
                dropType: dropFlavor,
                dropId: boardDropId,
                fileName: uploadedFileName || null,
                bucket: uploadedBucket,
                storagePath: uploadedStoragePath,
                mediaUrl: resolvedMusicKind === "audio" ? cleanAttach : null,
                mediaKind:
                  dropFlavor === "music"
                    ? resolvedMusicKind
                    : dropFlavor === "thought"
                    ? attachMediaType === "audio"
                      ? "audio"
                      : attachMediaType === "image"
                        ? "image"
                        : "text"
                    : dropFlavor === "media"
                    ? inferMediaType(cleanAttach || "") === "video" ||
                      /\.(mp4|webm|mov|m4v)$/i.test(uploadedFileName)
                      ? "video"
                      : "image"
                    : dropFlavor === "pay"
                    ? inferMediaType(cleanAttach || "") === "video" ||
                      /\.(mp4|webm|mov|m4v)$/i.test(uploadedFileName)
                      ? "video"
                      : inferMediaType(cleanAttach || "") === "audio" ||
                        /\.(mp3|m4a|wav|aac|ogg|flac|weba)$/i.test(uploadedFileName)
                        ? "audio"
                        : "image"
                    : dropFlavor === "doc"
                    ? "doc"
                    : null,
                customizations: mediaCustomizations ?? null,
                description: boardDropDescription || null,
                titleRich: titleRichMeta,
                descriptionRich: descriptionRichMeta,
                visibility: dropVisibility,
                thoughtText: dropFlavor === "thought" ? thoughtText.trim() || cleanBody : null,
                thoughtFormat,
                authorId: identity.id,
                authorName: identity.displayName,
                authorUsername: identity.username || null,
                authorAvatar: identity.avatar || null,
                authorGlow: identity.glow,
                authorAuraIntensity: identity.auraIntensity,
                mediaSource: mediaSource,
                badgeLabel: mediaSource === "capture" ? "Captured on Board" : null,
                ...(dropFlavor === "pay"
                  ? {
                      payProvider,
                      paymentRequestType: payProvider === "payment_link" ? "link" : "direct",
                      priceCents: payPriceCents,
                      paymentLink: payLink.trim() || null,
                      linkUrl: payLink.trim() || null,
                    }
                  : {}),
                preview: preview
                  ? {
                      url: preview.url ?? cleanAttach,
                      provider: preview.provider ?? null,
                      title: preview.title ?? null,
                      description: preview.description ?? null,
                      image: preview.image ?? null,
                      embedUrl: preview.embedUrl ?? null,
                      type: preview.type ?? "link",
                    }
                  : null,
              }
            : {}),

          ...(mode === "forum_post" ? { forum_id: forumId } : {}),
          ...(mode === "announcement"
            ? {
                announcement_vibe: vibe,
                announcement_media_url: cleanAnnMedia,
                announcement_media_type: annMediaType,
                customizations: mediaCustomizations ?? null,
                mediaKind:
                  annMediaType === "video"
                    ? "video"
                    : annMediaType === "image"
                      ? "image"
                      : null,
                titleRich: titleRichMeta,
                descriptionRich: descriptionRichMeta,
              }
            : {}),
        },
      });

      emitNewActivity({
        id: res.activity.id,
        created_at: res.activity.created_at,
        user_id: res.activity.user_id,
        kind,
        title: cleanTitle,
        body: cleanBody,
        href: resolvedHref,
        image_url:
          mode === "board_drop"
            ? (preview?.image ?? directImageUrl ?? null)
            : mode === "announcement" && annMediaType === "image"
            ? cleanAnnMedia
            : null,
          meta: {
            source: "drop_console",
            tags,
          ...(mode === "board_drop"
            ? {
                drop_flavor: dropFlavor,
                dropType: dropFlavor,
                dropId: boardDropId,
                fileName: uploadedFileName || null,
                bucket: uploadedBucket,
                storagePath: uploadedStoragePath,
                mediaUrl: resolvedMusicKind === "audio" ? cleanAttach : null,
                mediaKind:
                  dropFlavor === "music"
                    ? resolvedMusicKind
                    : dropFlavor === "thought"
                    ? attachMediaType === "audio"
                      ? "audio"
                      : attachMediaType === "image"
                        ? "image"
                        : "text"
                    : dropFlavor === "media"
                    ? inferMediaType(cleanAttach || "") === "video" ||
                      /\.(mp4|webm|mov|m4v)$/i.test(uploadedFileName)
                      ? "video"
                      : "image"
                    : dropFlavor === "pay"
                    ? inferMediaType(cleanAttach || "") === "video" ||
                      /\.(mp4|webm|mov|m4v)$/i.test(uploadedFileName)
                      ? "video"
                      : inferMediaType(cleanAttach || "") === "audio" ||
                        /\.(mp3|m4a|wav|aac|ogg|flac|weba)$/i.test(uploadedFileName)
                        ? "audio"
                        : "image"
                    : dropFlavor === "doc"
                    ? "doc"
                    : null,
                customizations: mediaCustomizations ?? null,
                description: boardDropDescription || null,
                titleRich: titleRichMeta,
                descriptionRich: descriptionRichMeta,
                visibility: dropVisibility,
                thoughtText: dropFlavor === "thought" ? thoughtText.trim() || cleanBody : null,
                thoughtFormat,
                authorId: identity.id,
                authorName: identity.displayName,
                authorUsername: identity.username || null,
                authorAvatar: identity.avatar || null,
                authorGlow: identity.glow,
                authorAuraIntensity: identity.auraIntensity,
                mediaSource,
                badgeLabel: mediaSource === "capture" ? "Captured on Board" : null,
                ...(dropFlavor === "pay"
                  ? {
                      payProvider,
                      paymentRequestType: payProvider === "payment_link" ? "link" : "direct",
                      priceCents: payPriceCents,
                      paymentLink: payLink.trim() || null,
                      linkUrl: payLink.trim() || null,
                    }
                  : {}),
                preview,
              }
            : {}),
          ...(mode === "forum_post" ? { forum_id: forumId } : {}),
          ...(mode === "announcement"
            ? {
                announcement_vibe: vibe,
                announcement_media_url: cleanAnnMedia,
                announcement_media_type: annMediaType,
                customizations: mediaCustomizations ?? null,
                mediaKind:
                  annMediaType === "video"
                    ? "video"
                    : annMediaType === "image"
                      ? "image"
                      : null,
                titleRich: titleRichMeta,
                descriptionRich: descriptionRichMeta,
              }
            : {}),
        },
      });

      if (mode === "board_drop" && dropFlavor === "music" && resolvedMusicKind === "audio") {
        const dropId = boardDropId ?? newId("music");
        if (dropVisibility === "public") {
          pushDrop({
            id: dropId,
            type: "music",
            title: cleanTitle || "Music Drop",
            createdAt: Date.now(),
            url: cleanAttach || undefined,
            mediaUrl: cleanAttach || undefined,
            mediaKind: "audio",
            bucket: uploadedBucket || undefined,
            storagePath: uploadedStoragePath || undefined,
            fileName: uploadedFileName || undefined,
            description: boardDropDescription || undefined,
            visibility: dropVisibility,
            authorId: identity.id,
            authorName: identity.displayName,
            authorUsername: identity.username || undefined,
            authorAvatar: identity.avatar || undefined,
            authorGlow: identity.glow,
            authorAuraIntensity: identity.auraIntensity,
            source: "drop_console",
            origin: "board_drop_console",
            meta: {
              activityId: res.activity.id,
              tags,
              descriptionRich: descriptionRichMeta,
            },
          });
        }
      }

      if (mode === "board_drop" && dropFlavor === "thought") {
        const dropId = boardDropId ?? newId("thought");
        if (dropVisibility === "public") {
          pushDrop({
            id: dropId,
            type: "thought",
            title: cleanTitle || "Thought Drop",
            createdAt: Date.now(),
            url: cleanAttach || undefined,
            mediaUrl: cleanAttach || undefined,
            // Keep the storage path so the feed can sign a fresh URL — a bare
            // public URL 403s on the private board-media bucket (silent audio).
            bucket: uploadedBucket || undefined,
            storagePath: uploadedStoragePath || undefined,
            fileName: uploadedFileName || undefined,
            mediaKind:
              attachMediaType === "audio"
                ? "audio"
                : attachMediaType === "image"
                  ? "image"
                  : undefined,
            description: boardDropDescription || undefined,
            visibility: dropVisibility,
            thoughtFormat: thoughtFormat ?? "text",
            thoughtText: thoughtText.trim() || cleanBody,
            authorId: identity.id,
            authorName: identity.displayName,
            authorUsername: identity.username || undefined,
            authorAvatar: identity.avatar || undefined,
            authorGlow: identity.glow,
            authorAuraIntensity: identity.auraIntensity,
            source: "drop_console",
            origin: "board_drop_console",
            meta: {
              activityId: res.activity.id,
              tags,
            },
          });
        }
        emitBoardDropSignal({
          type: "thought_drop_created",
          dropId,
          userId: meId,
          title: cleanTitle || "Thought Drop",
          meta: {
            visibility: dropVisibility,
            thoughtFormat,
            source: "drop_console",
          },
        });
      }

      setTitle("");
      setTitleRich({ html: "" });
      setBody("");
      setAttachUrl("");
      setUploadedFileName("");
      setUploadedBucket(null);
      setUploadedStoragePath(null);
      setDropCustomizations({});
      setDropDesc("");
      setDropDescRich({ html: "" });
      setThoughtText("");
      setDropVisibility("public");
      setMediaSource(null);
      setTagsInput("");
      setAnnounceMediaUrl("");
      setPayPrice("");
      setPayDesc("");
      setPayDescRich({ html: "" });
      setPayLink("");
      setDocDesc("");
      setDocDescRich({ html: "" });

      setPostMsg("Dropped ✓");
      window.setTimeout(() => setPostMsg(null), 1500);
    } catch (err: any) {
      setPostErr(err?.message || "Drop failed.");
    } finally {
      setPosting(false);
    }
  }

  const showMediaUploadForBoardDrop =
    mode === "board_drop" && dropFlavor === "media";

  const studioAllowedModes = useMemo<StudioCaptureMode[]>(
    () =>
      // Thought = voice + art + descript; Pay = every media + descript; Vision = camera + art only.
      mode === "board_drop" && dropFlavor === "thought"
        ? ["audio", "art", "descript"]
        : mode === "board_drop" && dropFlavor === "pay"
          ? ["photo", "video", "audio", "art", "descript"]
          : mode === "board_drop" && dropFlavor === "doc"
            ? ["descript"]
            : mode === "board_drop" && dropFlavor === "music"
              ? ["audio"]
              : ["photo", "video", "art"],
    [dropFlavor, mode]
  );

  const descriptDestination = useMemo<DescriptDestination>(() => {
    if (mode === "announcement") return "announcement";
    if (dropFlavor === "thought") return "thought";
    if (dropFlavor === "pay") return "pay";
    return "doc";
  }, [dropFlavor, mode]);

  useEffect(() => {
    function onDescriptShare(event: Event) {
      const doc = (event as CustomEvent<DescriptDoc>).detail;
      if (!doc) return;
      const plain = doc.plainText?.trim() || descriptPlainText(doc.html);
      const cleanTitle = doc.title?.trim() || "Untitled Descript";
      setSleeping(false);
      setTitle(cleanTitle);
      setTitleRich(richTextFromPlain(cleanTitle));
      const dest = doc.destination ?? "doc";
      if (dest === "announcement") {
        setMode("announcement");
        setBody(plain);
      } else if (dest === "thought") {
        setMode("board_drop");
        setDropFlavor("thought");
        setThoughtText(plain);
      } else if (dest === "pay") {
        setMode("board_drop");
        setDropFlavor("pay");
        setPayDesc(plain);
        setPayDescRich(richTextFromPlain(plain));
      } else {
        setMode("board_drop");
        setDropFlavor("doc");
        setDocDesc(plain);
        setDocDescRich(richTextFromPlain(plain));
      }
      setStudioMode(null);
    }
    window.addEventListener(DESCRIPT_SHARE_EVENT, onDescriptShare as EventListener);
    return () => window.removeEventListener(DESCRIPT_SHARE_EVENT, onDescriptShare as EventListener);
  }, []);

  // -------------------------
  // SLEEP DOCK (does NOT overlay your buckets)
  // -------------------------
  if (sleeping) {
    const dock = (
      <div className="dock">
        <div className="dockLeft">
          <div className="dockTitle">DROP CONSOLE</div>
          <div className="dockSub">Sleeping…</div>
        </div>
        <button type="button" className="dockWake" onClick={() => setSleeping(false)}>
          WAKE
        </button>

      </div>
    );

    if (variant === "bare") return dock;
    return <div style={{ width: "100%" }}>{dock}</div>;
  }

  const content = (
    <div className="dc">
      <DropStudioStage
        open={studioMode !== null}
        initialFile={null}
        initialMode={studioMode ?? (dropFlavor === "doc" ? "descript" : "photo")}
        allowedModes={studioAllowedModes}
        descriptDestination={descriptDestination}
        value={dropCustomizations}
        onChange={setDropCustomizations}
        onClose={() => setStudioMode(null)}
        onComplete={(file) => uploadToBoardMedia(file, "capture")}
      />
      <div className="dcInner">
        <div className="dcTop">
          <div>
            <div className="dcTitleRow">
              <h3 className="dcTitle">Drop Console</h3>
              <button
                type="button"
                className="dcSleep"
                onClick={() => setSleeping(true)}
                title="Put console to sleep"
              >
                SLEEP
              </button>
            </div>
            <p className="dcHint">{MODE_HINT[mode]}</p>
          </div>
        </div>

        {/* MODE PILLS */}
        <div className="dcModePills">
          {(["board_drop", "forum_post", "announcement"] as DropMode[]).map(
            (m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={clsx("dcModePill", mode === m && "on")}
              >
                {MODE_LABEL[m].toUpperCase()}
              </button>
            )
          )}
        </div>

        {/* Drop type pills (board_drop only) */}
        {mode === "board_drop" && (
          <div className="dcSection">
            <div className="dcSectionHead">
              <div className="dcSectionLabel">Drop Type</div>
              <div className="dcSectionNote">Staple attachments (embed-first).</div>
            </div>

            <div className="dcDropTypeRows" role="tablist" aria-label="Drop type">
              <div className="dcDropTypeRow dcDropTypeRowStudio">
                {DROP_FLAVOR_STUDIO_ROW.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={clsx("dcTypeBtn", dropFlavor === t && "on")}
                    onClick={() => {
                      setDropFlavor(t);
                      setAttachUrl("");
                      setUploadedFileName("");
                      setDropDesc("");
                      setDropDescRich({ html: "" });
                      setThoughtText("");
                      setMediaSource(null);
                      setDropCustomizations({});
                      if (t !== "pay") {
                        setPayPrice("");
                        setPayDesc("");
                        setPayDescRich({ html: "" });
                        setPayLink("");
                        setPayProvider("stripe_connect");
                      }
                      if (t !== "doc") {
                        setDocDesc("");
                        setDocDescRich({ html: "" });
                      }
                      setDropVisibility("public");
                    }}
                  >
                    <span>{DROP_FLAVOR_LABEL[t].toUpperCase()}</span>
                    <small>{DROP_FLAVOR_SUB[t]}</small>
                  </button>
                ))}
              </div>
              <div className="dcDropTypeRow dcDropTypeRowLinks">
                {DROP_FLAVOR_LINK_ROW.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={clsx("dcTypeBtn", dropFlavor === t && "on")}
                    onClick={() => {
                      setDropFlavor(t);
                      setAttachUrl("");
                      setUploadedFileName("");
                      setDropDesc("");
                      setDropDescRich({ html: "" });
                      setThoughtText("");
                      setMediaSource(null);
                      setDropCustomizations({});
                      if (t !== "pay") {
                        setPayPrice("");
                        setPayDesc("");
                        setPayDescRich({ html: "" });
                        setPayLink("");
                        setPayProvider("stripe_connect");
                      }
                      if (t !== "doc") {
                        setDocDesc("");
                        setDocDescRich({ html: "" });
                      }
                      setDropVisibility("public");
                    }}
                  >
                    <span>{DROP_FLAVOR_LABEL[t].toUpperCase()}</span>
                    <small>{DROP_FLAVOR_SUB[t]}</small>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} className="dcForm">
          {mode === "forum_post" && (
            <div className="dcField">
              <div className="dcFieldLabel">Forum</div>
              <select
                value={forumId}
                onChange={(e) => setForumId(e.target.value)}
                className="dcInput"
              >
                {!forumOptions.some((f) => f.id === "general") && (
                  <option value="general">General</option>
                )}
                {forumOptions.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title}
                  </option>
                ))}
              </select>
              <div className="dcFieldHelp">Pick where this conversation lives.</div>
            </div>
          )}

          {mode === "announcement" && (
            <div className="dcField">
              <div className="dcFieldLabel">Vibe Check</div>
              <select
                value={vibe}
                onChange={(e) => setVibe(e.target.value as AnnouncementVibe)}
                className="dcInput"
              >
                {VIBE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <div className="dcFieldHelp">Mood helps people read the room.</div>
            </div>
          )}

          {/* Announcement media */}
          {mode === "announcement" && (
            <div className="dcField">
              <div className="dcFieldLabel">Announcement Media</div>

              <div className="mediaRow">
                <input
                  value={announceMediaUrl}
                  onChange={(e) => setAnnounceMediaUrl(e.target.value)}
                  placeholder="Paste image/video link (optional)"
                  className="dcInput"
                />
              </div>

              <div className="mediaActionRow" aria-label="Announcement media actions">
                <button
                  type="button"
                  className={clsx("mediaAction", "studioAction", uploading && "busy")}
                  onClick={() => setStudioMode("photo")}
                  disabled={uploading}
                >
                  🎬 Open Drop Studio
                </button>
              </div>

              {announceMediaUrl && inferMediaType(announceMediaUrl) === "image" ? (
                <div className="annStudioPreview">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={announceMediaUrl} alt="Announcement preview" className="annStudioImg" />
                  <DropStudioOverlay customizations={dropCustomizations} />
                </div>
              ) : null}

              {uploadErr && <div className="dcErr">{uploadErr}</div>}
              <div className="dcFieldHelp">
                Uploads to <b>board-media</b>. On phones, the capture buttons open
                this device&apos;s camera.
              </div>
            </div>
          )}

          {/* Title */}
          <div className="dcField">
            <div className="dcFieldLabel">Title</div>
            <RichTextField
              value={titleRich}
              onChange={(v) => {
                setTitleRich(v);
                setTitle(richToPlain(v.html));
              }}
              ariaLabel="Title"
              minHeight={52}
              placeholder={mode === "forum_post" ? "Thread title (optional)" : "Title"}
            />
          </div>

          {mode === "board_drop" ? (
            <BoardDropConsoleFields
              dropFlavor={dropFlavor}
              attachUrl={attachUrl}
              setAttachUrl={setAttachUrl}
              uploadedFileName={uploadedFileName}
              uploading={uploading}
              uploadErr={uploadErr}
              uploadToBoardMedia={uploadToBoardMedia}
              onClearMedia={() => {
                setAttachUrl("");
                setUploadedFileName("");
                setMediaSource(null);
                setDropCustomizations({});
              }}
              onOpenCamera={setStudioMode}
              dropDesc={dropDesc}
              setDropDesc={setDropDesc}
              dropDescRich={dropDescRich}
              setDropDescRich={setDropDescRich}
              mediaSource={mediaSource}
              payProvider={payProvider}
              setPayProvider={setPayProvider}
              payPrice={payPrice}
              setPayPrice={setPayPrice}
              payDesc={payDesc}
              setPayDesc={setPayDesc}
              payLink={payLink}
              setPayLink={setPayLink}
              docDesc={docDesc}
              setDocDesc={setDocDesc}
              customizations={dropCustomizations}
              setCustomizations={setDropCustomizations}
              thoughtText={thoughtText}
              setThoughtText={setThoughtText}
              dropVisibility={dropVisibility}
              setDropVisibility={setDropVisibility}
              payDescRich={payDescRich}
              setPayDescRich={setPayDescRich}
              docDescRich={docDescRich}
              setDocDescRich={setDocDescRich}
            />
          ) : (
            <>
              {/* Tags */}
              <div className="dcField">
                <div className="dcFieldLabel">Tags</div>
                <input
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="e.g. #music #nyc  or  music, nyc, filmmaking"
                  className="dcInput"
                />
                <div className="dcFieldHelp">Used later for Explore matching + search.</div>

                {parseTags(tagsInput).length > 0 && (
                  <div className="dcTagsPreview">
                    {parseTags(tagsInput).map((t) => (
                      <span key={t} className="dcTagChip">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Body */}
              <div className="dcField">
                <div className="dcFieldLabel">
                  {mode === "forum_post" ? "Thread starter" : "Message"}
                </div>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={4}
                  placeholder={bodyPlaceholder}
                  className="dcTextarea"
                />
              </div>
            </>
          )}

          {postErr && <div className="dcErr">{postErr}</div>}
          {postMsg && <div className="dcOk">{postMsg}</div>}

          <div className="dcBottom">
            <div className="dcFoot">
              Appears in <b>Community Feed</b> + your <b>Profile</b>.
              <div className="dcFootLink">
                <Link href="/board/profile">Open Profile</Link>
              </div>
            </div>

            <button type="submit" disabled={posting} className="dcSubmit">
              {posting ? "Dropping…" : "Add a Drop"}
            </button>
          </div>
        </form>
      </div>

    </div>
  );

  if (variant === "bare") return content;

  return (
    <div className="dcTileWrap">
      <div className="dcTileRim" aria-hidden />
      {content}

      <style>{`
        .dcTileWrap {
          position: relative;
          border-radius: 28px;
          background: #ffffff;
          border: 1px solid rgba(0, 0, 0, 0.08);
          box-shadow: 0 14px 40px rgba(0, 0, 0, 0.12);
          overflow: hidden;
        }
        .dcTileRim {
          pointer-events: none;
          position: absolute;
          inset: 0;
          border-radius: 28px;
          box-shadow: inset 0 2px 0 rgba(160, 220, 255, 0.65),
            inset 0 0 0 1px rgba(160, 220, 255, 0.7),
            inset 0 0 0 2px rgba(255, 255, 255, 0.7);
          z-index: 0;
        }
        .dc { position: relative; z-index: 1; }
      `}</style>
    </div>
  );
}

function DropVisibilityRow({
  value,
  onChange,
}: {
  value: "public" | "private";
  onChange: (value: "public" | "private") => void;
}) {
  return (
    <div className="visibilityRow" aria-label="Drop visibility">
      <button
        type="button"
        className={clsx("providerChip", value === "public" && "on")}
        onClick={() => onChange("public")}
      >
        Public
      </button>
      <button
        type="button"
        className={clsx("providerChip", value === "private" && "on")}
        onClick={() => onChange("private")}
      >
        Private
      </button>
    </div>
  );
}

function BoardDropConsoleFields({
  dropFlavor,
  attachUrl,
  setAttachUrl,
  uploadedFileName,
  uploading,
  uploadErr,
  uploadToBoardMedia,
  onClearMedia,
  onOpenCamera,
  dropDesc,
  setDropDesc,
  dropDescRich,
  setDropDescRich,
  mediaSource,
  payProvider,
  setPayProvider,
  payPrice,
  setPayPrice,
  payDesc,
  setPayDesc,
  payLink,
  setPayLink,
  docDesc,
  setDocDesc,
  customizations,
  setCustomizations,
  thoughtText,
  setThoughtText,
  dropVisibility,
  setDropVisibility,
  payDescRich,
  setPayDescRich,
  docDescRich,
  setDocDescRich,
}: {
  dropFlavor: DropFlavor;
  attachUrl: string;
  setAttachUrl: (value: string) => void;
  uploadedFileName: string;
  uploading: boolean;
  uploadErr: string | null;
  uploadToBoardMedia: (file: File, source?: "upload" | "capture") => void;
  onClearMedia: () => void;
  onOpenCamera: (mode: StudioCaptureMode) => void;
  dropDesc: string;
  setDropDesc: (value: string) => void;
  dropDescRich: RichTextValue;
  setDropDescRich: (value: RichTextValue) => void;
  mediaSource: "upload" | "capture" | null;
  payProvider: PayProviderMode;
  setPayProvider: (value: PayProviderMode) => void;
  payPrice: string;
  setPayPrice: (value: string) => void;
  payDesc: string;
  setPayDesc: (value: string) => void;
  payLink: string;
  setPayLink: (value: string) => void;
  docDesc: string;
  setDocDesc: (value: string) => void;
  customizations: DropCustomization;
  setCustomizations: (value: DropCustomization) => void;
  thoughtText: string;
  setThoughtText: (value: string) => void;
  dropVisibility: "public" | "private";
  setDropVisibility: (value: "public" | "private") => void;
  payDescRich: RichTextValue;
  setPayDescRich: (value: RichTextValue) => void;
  docDescRich: RichTextValue;
  setDocDescRich: (value: RichTextValue) => void;
}) {
  const showUrlField =
    dropFlavor === "youtube" ||
    dropFlavor === "news" ||
    dropFlavor === "link";
  const showFileLine =
    dropFlavor === "media" ||
    dropFlavor === "music" ||
    dropFlavor === "pay" ||
    dropFlavor === "doc" ||
    dropFlavor === "thought";

  return (
    <>
      <DropVisibilityRow value={dropVisibility} onChange={setDropVisibility} />

      {showFileLine ? (
        <div className="dcField">
          <div
            className={clsx(
              "mediaActionRow",
              (dropFlavor === "doc" || dropFlavor === "music") && "pairRow"
            )}
            aria-label="Drop media actions"
          >
            {dropFlavor === "doc" ? (
              <>
                <button
                  type="button"
                  className={clsx("mediaAction", "studioAction", uploading && "busy")}
                  onClick={() => onOpenCamera("descript")}
                  disabled={uploading}
                >
                  🎬 Open Drop Studio
                </button>
                <label className={clsx("mediaAction", "uploadAction", uploading && "busy")}>
                  <span>{uploading ? "Uploading..." : "Upload File"}</span>
                  <input
                    className="fileInput"
                    type="file"
                    accept={fileAcceptForFlavor(dropFlavor)}
                    disabled={uploading}
                    onChange={(e) => {
                      const file = e.currentTarget.files?.[0];
                      if (file) uploadToBoardMedia(file, "upload");
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
              </>
            ) : dropFlavor === "music" ? (
              <>
                <button
                  type="button"
                  className={clsx("mediaAction", "studioAction", uploading && "busy")}
                  onClick={() => onOpenCamera("audio")}
                  disabled={uploading}
                >
                  🎬 Open Drop Studio
                </button>
                <label className={clsx("mediaAction", "uploadAction", uploading && "busy")}>
                  <span>{uploading ? "Uploading..." : "Upload File"}</span>
                  <input
                    className="fileInput"
                    type="file"
                    accept={fileAcceptForFlavor(dropFlavor)}
                    disabled={uploading}
                    onChange={(e) => {
                      const file = e.currentTarget.files?.[0];
                      if (file) uploadToBoardMedia(file, "upload");
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
              </>
            ) : dropFlavor === "media" || dropFlavor === "pay" || dropFlavor === "thought" ? (
              <button
                type="button"
                className={clsx("mediaAction", "studioAction", uploading && "busy")}
                onClick={() => onOpenCamera(dropFlavor === "thought" ? "audio" : "photo")}
                disabled={uploading}
              >
                🎬 Open Drop Studio
              </button>
            ) : (
              <label className={clsx("mediaAction", "uploadAction", uploading && "busy")}>
                <span>{uploading ? "Uploading..." : "Upload File"}</span>
                <input
                  className="fileInput"
                  type="file"
                  accept={fileAcceptForFlavor(dropFlavor)}
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    if (file) uploadToBoardMedia(file, "upload");
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            )}
          </div>
          <div className="fileMeta fileStatus">
            {uploadedFileName ? (
              <span className="fileName">{uploadedFileName}</span>
            ) : (
              <span className="fileName dim">{uploadLabelForFlavor(dropFlavor)}</span>
            )}
            {uploading ? <span className="fileSize">Uploading...</span> : null}
          </div>
          {dropFlavor === "media" ||
          dropFlavor === "pay" ||
          dropFlavor === "thought" ||
          dropFlavor === "doc" ||
          dropFlavor === "music" ? (
            <div className="captureHelp">
              {dropFlavor === "pay"
                ? "Show what this request is for in real time."
                : dropFlavor === "thought"
                ? "Record a vocal thought or capture a quick visual note in Drop Studio."
                : dropFlavor === "doc"
                ? "Write in Descript, then attach your file — Doc Drops use Descript only."
                : dropFlavor === "music"
                ? "Record in Drop Studio or upload an audio file for full song playback."
                : "Upload from your device or open Drop Studio capture."}
            </div>
          ) : null}
          {uploadErr ? <div className="dcErr">{uploadErr}</div> : null}
        </div>
      ) : null}

      {dropFlavor === "pay" && attachUrl ? (
        <div className="consoleMediaPreview">
          <button
            type="button"
            className="dcMediaRemove"
            onClick={onClearMedia}
            aria-label="Remove selected media"
          >
            ✕ Remove
          </button>
          {inferMediaType(attachUrl) === "video" || /\.(mp4|webm|mov|m4v)$/i.test(uploadedFileName) ? (
            <video src={attachUrl} controls playsInline />
          ) : inferMediaType(attachUrl) === "audio" ||
            /\.(mp3|m4a|wav|aac|ogg|flac|weba)$/i.test(uploadedFileName) ? (
            <audio src={attachUrl} controls preload="metadata" />
          ) : (
            <img src={attachUrl} alt="Pay Drop request context" />
          )}
          {mediaSource === "capture" ? <span>Captured on Board</span> : null}
        </div>
      ) : null}

      {dropFlavor === "media" && attachUrl ? (
        <div className="consoleStudioWrap">
          <button
            type="button"
            className="dcMediaRemove"
            onClick={onClearMedia}
            aria-label="Remove selected media"
          >
            ✕ Remove
          </button>
          <DropStudio
            mediaUrl={attachUrl}
            mediaKind={
              inferMediaType(attachUrl) === "video" ||
              /\.(mp4|webm|mov|m4v)$/i.test(uploadedFileName)
                ? "video"
                : "image"
            }
            value={customizations}
            onChange={setCustomizations}
            compact
          />
        </div>
      ) : null}

      {dropFlavor === "thought" ? (
        <>
          <div className="dcField">
            <textarea
              className="dcTextarea thoughtTextarea"
              placeholder="Catch the thought before it leaves..."
              value={thoughtText}
              onChange={(e) => setThoughtText(e.target.value)}
              rows={3}
            />
            <div className="dcFieldHelp">
              Voice memo or doodle/image is optional. Private thoughts stay out of the Community Feed.
            </div>
          </div>

          {attachUrl ? (
            <div className="thoughtAttachmentPreview">
              <button
                type="button"
                className="dcMediaRemove"
                onClick={onClearMedia}
                aria-label="Remove thought attachment"
              >
                ✕ Remove
              </button>
              {inferMediaType(attachUrl) === "audio" ||
              /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(uploadedFileName) ? (
                <audio src={attachUrl} controls preload="metadata" />
              ) : (
                <img src={attachUrl} alt="Thought attachment" />
              )}
              <span>
                {inferMediaType(attachUrl) === "audio" ? "Voice memo thought" : "Doodle/image thought"}
              </span>
            </div>
          ) : null}
        </>
      ) : null}

      {showUrlField || dropFlavor === "music" ? (
        <div className="dcField">
          <input
            value={attachUrl}
            onChange={(e) => setAttachUrl(e.target.value)}
            placeholder={
              dropFlavor === "music"
                ? "Or paste Spotify / Apple Music / SoundCloud / YouTube"
                : attachmentPlaceholder(dropFlavor)
            }
            className="dcInput"
          />
        </div>
      ) : null}

      {dropFlavor !== "pay" && dropFlavor !== "doc" && dropFlavor !== "thought" ? (
        <div className="dcField">
          <div className="dcFieldLabel">Description</div>
          <RichTextField
            value={dropDescRich}
            onChange={(v) => {
              setDropDescRich(v);
              setDropDesc(richToPlain(v.html));
            }}
            ariaLabel="Description"
            placeholder={
              dropFlavor === "media"
                ? "Add context, credit, mood, or what this drop is about..."
                : "Add a description..."
            }
            minHeight={66}
          />
        </div>
      ) : null}

      {dropFlavor === "pay" ? (
        <>
          <div className="payProviderRow">
            <button
              type="button"
              className={clsx("providerChip", payProvider === "stripe_connect" && "on")}
              onClick={() => setPayProvider("stripe_connect")}
            >
              Pay on Board
            </button>
            <button
              type="button"
              className={clsx("providerChip", payProvider === "payment_link" && "on")}
              onClick={() => setPayProvider("payment_link")}
            >
              Add Payment Link
            </button>
          </div>
          <div className="dcField">
            <div className="dcFieldLabel">Price</div>
            <input
              className="dcInput"
              placeholder="Price (ex: 19.99)"
              value={payPrice}
              onChange={(e) => setPayPrice(e.target.value)}
              inputMode="decimal"
            />
          </div>
          <div className="dcField">
            <div className="dcFieldLabel">Description</div>
            <RichTextField
              value={payDescRich}
              onChange={(v) => {
                setPayDescRich(v);
                setPayDesc(richToPlain(v.html));
              }}
              ariaLabel="Pay drop description"
              placeholder="Description (optional)"
              minHeight={66}
            />
          </div>
          <div className="dcField">
            <input
              className="dcInput"
              placeholder={
                payProvider === "payment_link"
                  ? "External payment/support link"
                  : "Optional fallback link"
              }
              value={payLink}
              onChange={(e) => setPayLink(e.target.value)}
            />
          </div>
          {payProvider === "stripe_connect" ? (
            <div className="payGatewayNote">
              Supporters check out securely on Stripe and funds land in your connected Stripe payout account. Connect Stripe once in Options → Banking to start receiving Pay Drops.
            </div>
          ) : null}
        </>
      ) : null}

      {dropFlavor === "doc" ? (
        <div className="dcField">
          <div className="dcFieldLabel">Description</div>
          <RichTextField
            value={docDescRich}
            onChange={(v) => {
              setDocDescRich(v);
              setDocDesc(richToPlain(v.html));
            }}
            ariaLabel="Doc drop notes"
            placeholder="Notes (optional) - logline, context, etc."
            minHeight={66}
          />
        </div>
      ) : null}
    </>
  );
}

function Pill({
  on,
  label,
  sub,
  onClick,
  strong,
}: {
  on: boolean;
  label: string;
  sub: string;
  onClick: () => void;
  strong?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx("pill", on && "on", strong && "strong")}
    >
      <div className="pillTop">{label}</div>
      <div className={clsx("pillSub", on ? "on" : "")}>{sub}</div>

      <style>{`
        .pill {
          min-width: 112px;
          border-radius: 16px;
          padding: 10px 12px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: rgba(255, 255, 255, 0.72);
          text-align: left;
          cursor: pointer;
          transition: transform 140ms ease, filter 140ms ease,
            background 140ms ease;
        }
        .pill:hover { transform: translateY(-1px); filter: brightness(1.01); }
        .pill.on {
          background: rgba(0, 0, 0, 0.86);
          border-color: rgba(0, 0, 0, 0.18);
        }
        .pillTop {
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(0, 0, 0, 0.62);
        }
        .pill.on .pillTop { color: rgba(200, 255, 230, 0.95); }
        .pillSub { margin-top: 6px; font-size: 12px; color: rgba(0, 0, 0, 0.48); }
        .pillSub.on { color: rgba(255, 255, 255, 0.7); }
      `}</style>
    </button>
  );
}
