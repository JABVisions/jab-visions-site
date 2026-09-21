// File: app/components/board/DropConsole.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

import { createActivity, type BoardActivityKind } from "@/lib/board/activity";
import { readCurrentBoardIdentity } from "@/lib/board/currentProfile";
import { newId, pushDrop } from "@/lib/board/drops/storage";
import { emitBoardDropSignal } from "@/lib/board/dropSignals";
import { fetchLinkPreview } from "@/lib/board/linkPreview";
import {
  compactDropCustomizations,
  type DropCustomization,
} from "@/lib/board/dropCustomizations";
import {
  DROP_FLAVOR_ORDER,
  DROP_FLAVOR_LABEL,
  DROP_FLAVOR_SUB,
  type DropFlavorKey,
} from "@/lib/board/dropFlavors";
import { descriptDocToFile, type DescriptDoc } from "@/lib/board/descriptDocs";
import { isDropbookSlideFile } from "@/lib/board/dropbookSlides";
import type { ResolvedDropbookLink } from "@/lib/board/dropbookLink";
import {
  classifiedStudioLinkKind,
  classifyDropbookLinkUrl,
  studioLinkEmbedUrl,
  studioLinkPersistKind,
} from "@/lib/board/dropbookLink";
import { makeEmbedByMode, newsCoverUrl } from "@/lib/board/dropItem";
import { uploadBoardMediaFile } from "@/lib/board/boardMediaUpload";
import { checkUploadSize } from "@/lib/board/uploadLimits";
import type { BoardUploadProgress, BoardUploadProgressHandler } from "@/lib/board/uploadProgress";
import { getCurrentUserId } from "@/lib/board/boardDropEditStore";
import BoardUploadProgressBar from "@/app/components/board/BoardUploadProgressBar";

import {
  createThread,
  EVENTS,
  readForums,
  seedForumsIfEmpty,
  type BoardUser,
} from "@/lib/boardStore";
import { forumPickerRooms, resolveRoomId } from "@/lib/board/rooms/catalog";
import { upsertConversation } from "@/lib/board/rooms/storage";
import LazyDropStudioStage from "./LazyDropStudioStage";
import BoardClientErrorBoundary from "./BoardClientErrorBoundary";
import { DropPrivacyButton } from "./DropPrivacyButton";

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
      return "Paste Spotify, Apple Music, or SoundCloud";
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
  if (flavor === "pay") return "image/*,video/*";
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
  if (flavor === "thought") return "Open Drop Studio for a voice memo or doodle";
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

function inferMediaType(url: string, fileName = "") {
  const u = `${url} ${fileName}`.toLowerCase();
  if (/\.(png|jpg|jpeg|gif|webp|avif|svg|bmp|tif|tiff|heic|heif)(\?|$)/i.test(u)) return "image";
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(u)) return "video";
  if (/\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/i.test(u)) return "audio";
  if (/\/storage\/v1\/object\/public\/board-media\//i.test(u) && /\.(mp3|wav|m4a|aac|ogg|flac)/i.test(fileName)) {
    return "audio";
  }
  if (/\/storage\/v1\/object\/public\/board-media\//i.test(url.toLowerCase())) return "image";
  return "link";
}

function durableAttachUrl(url: string | null | undefined) {
  const src = typeof url === "string" ? url.trim() : "";
  if (!src || src.startsWith("blob:") || src.startsWith("data:")) return null;
  return src;
}

function thoughtFormatFromMedia(mediaType: string | null) {
  if (mediaType === "audio") return "voice";
  if (mediaType === "image") return "doodle";
  return "text";
}

function profileDropType(flavor: DropFlavor) {
  if (flavor === "youtube") return "YouTube";
  if (flavor === "music") return "Music";
  if (flavor === "news") return "News";
  if (flavor === "link") return "Link";
  if (flavor === "doc") return "Doc";
  if (flavor === "pay") return "Pay";
  if (flavor === "thought") return "Thought";
  return "Media";
}

/* -------------------------------------------------------------------------- */
/* component */
/* -------------------------------------------------------------------------- */

type DropConsoleVariant = "tile" | "bare";

function DropConsoleSleepDock({ onWake }: { onWake: () => void }) {
  return (
    <div className="dock">
      <div className="dockLeft">
        <div className="dockTitle">DROP CONSOLE</div>
        <div className="dockSub">Sleeping…</div>
      </div>
      <button type="button" className="dockWake" onClick={onWake}>
        WAKE
      </button>

      <style>{`
        .dock {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border-radius: 20px;
          padding: 12px 14px;
          background: rgba(255, 255, 255, 0.92);
          border: 1px solid rgba(0, 0, 0, 0.08);
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.12);
        }
        .dockTitle {
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgba(0, 170, 160, 1);
        }
        .dockSub {
          margin-top: 6px;
          font-size: 12px;
          font-weight: 800;
          color: rgba(0, 0, 0, 0.48);
        }
        .dockWake {
          border-radius: 16px;
          padding: 12px 14px;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          border: 1px solid rgba(0, 0, 0, 0.16);
          background: rgba(0, 0, 0, 0.84);
          color: rgba(200, 255, 230, 0.95);
          cursor: pointer;
          transition: transform 160ms ease, filter 160ms ease;
        }
        .dockWake:hover {
          transform: translateY(-1px);
          filter: brightness(1.02);
        }
      `}</style>
    </div>
  );
}

export default function DropConsole({
  variant = "tile",
}: {
  variant?: DropConsoleVariant;
}) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [meId, setMeId] = useState<string | null>(null);

  // IMPORTANT: start asleep by default
  const [sleeping, setSleeping] = useState(true);
  const [hasAwakened, setHasAwakened] = useState(false);

  const [mode, setMode] = useState<DropMode>("board_drop");
  const [dropFlavor, setDropFlavor] = useState<DropFlavor>("media");

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [attachUrl, setAttachUrl] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [dropCustomizations, setDropCustomizations] = useState<DropCustomization>({});
  const [dropDesc, setDropDesc] = useState("");
  const [mediaSource, setMediaSource] = useState<"upload" | "capture" | null>(null);
  const [thoughtText, setThoughtText] = useState("");
  const [dropVisibility, setDropVisibility] = useState<"public" | "private">("public");

  const [tagsInput, setTagsInput] = useState("");
  const [payProvider, setPayProvider] =
    useState<PayProviderMode>("stripe_connect");
  const [payPrice, setPayPrice] = useState("");
  const [payDesc, setPayDesc] = useState("");
  const [payLink, setPayLink] = useState("");
  const [docDesc, setDocDesc] = useState("");

  // Forum Post mode
  const [forumId, setForumId] = useState<string>("lobby");
  const [forumOptions, setForumOptions] = useState<
    Array<{ id: string; title: string }>
  >([]);

  // Announcement mode
  const [vibe, setVibe] = useState<AnnouncementVibe>("hype");
  const [announceMediaUrl, setAnnounceMediaUrl] = useState("");
  const [announceMediaName, setAnnounceMediaName] = useState("");
  const [announceStudioOpen, setAnnounceStudioOpen] = useState(false);
  const [announceCustomizations, setAnnounceCustomizations] = useState<DropCustomization>({});

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<BoardUploadProgress | null>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const localPreviewUrlRef = useRef("");
  const pendingMediaFileRef = useRef<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState("");
  const [attachedStorage, setAttachedStorage] = useState<{
    bucket: string;
    storagePath: string;
  } | null>(null);

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

  useEffect(() => {
    if (!sleeping) setHasAwakened(true);
  }, [sleeping]);

  useEffect(() => {
    if (!posting) return;
    const timer = window.setTimeout(() => setPosting(false), 120_000);
    return () => window.clearTimeout(timer);
  }, [posting]);

  useEffect(() => {
    return () => {
      if (localPreviewUrlRef.current) URL.revokeObjectURL(localPreviewUrlRef.current);
    };
  }, []);

  /* forums */
  useEffect(() => {
    seedForumsIfEmpty();
    const roomOptions = forumPickerRooms();
    const db = readForums();
    const legacy = db.forums
      .filter((forum) => !roomOptions.some((room) => room.id === forum.id || resolveRoomId(forum.id) === room.id))
      .map((forum) => ({ id: resolveRoomId(forum.id) || forum.id, title: forum.title }));
    const nextOptions = [...roomOptions, ...legacy];
    setForumOptions(nextOptions);

    const hasLobby = nextOptions.some((f) => f.id === "lobby");
    if (hasLobby) setForumId("lobby");
    else if (nextOptions.length > 0) setForumId(nextOptions[0].id);

    const onForums = () => {
      const rooms = forumPickerRooms();
      setForumOptions(rooms);
      const stillExists = rooms.some((f) => f.id === forumId);
      if (!stillExists) {
        setForumId(rooms[0]?.id ?? "lobby");
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

  async function uploadToBoardMedia(
    file: File,
    source: "upload" | "capture" = "upload",
    onProgress?: BoardUploadProgressHandler
  ) {
    setUploadErr(null);

    const tooLarge = checkUploadSize(file);
    if (tooLarge) {
      setUploadErr(tooLarge);
      return null;
    }

    pendingMediaFileRef.current = file;
    if (localPreviewUrlRef.current) {
      URL.revokeObjectURL(localPreviewUrlRef.current);
      localPreviewUrlRef.current = "";
    }
    const localUrl = URL.createObjectURL(file);
    localPreviewUrlRef.current = localUrl;
    setMediaPreviewUrl(localUrl);

    setUploading(true);
    setUploadProgress(null);
    if (mode === "announcement") {
      setAnnounceMediaUrl(localUrl);
      setAnnounceMediaName(file.name);
    }
    if (mode === "board_drop") {
      setUploadedFileName(file.name);
      setMediaSource(source);
      if (dropFlavor === "media") setDropCustomizations({});
    }

    try {
      const bucket = mode === "board_drop" && dropFlavor === "doc" ? "board-docs" : "board-media";
      const uploaded = await uploadBoardMediaFile(file, {
        bucket,
        folder: `uploads/${meId ?? "demo"}`,
        onProgress: (progress) => {
          setUploadProgress(progress);
          onProgress?.(progress);
        },
      });
      const url = durableAttachUrl(uploaded?.publicUrl) || durableAttachUrl(uploaded?.signedUrl);
      if (!uploaded || !url) {
        setUploadErr("The mix is on this device, but it has not uploaded to Board yet. Keep this screen open and try again.");
        return null;
      }
      if (mode === "announcement") {
        setAnnounceMediaUrl(url);
        setAnnounceMediaName(file.name);
      }
      if (mode === "board_drop") {
        setAttachUrl(url);
        setUploadedFileName(file.name);
        setMediaSource(source);
        setAttachedStorage({ bucket: uploaded.bucket, storagePath: uploaded.storagePath });
      }
      pendingMediaFileRef.current = null;
      if (localPreviewUrlRef.current) {
        URL.revokeObjectURL(localPreviewUrlRef.current);
        localPreviewUrlRef.current = "";
      }
      setMediaPreviewUrl("");
      setPostMsg("Media attached ✓");
      window.setTimeout(() => setPostMsg(null), 1500);
      return url;
    } catch (e: any) {
      setUploadErr(
        e?.message || "Upload failed. Keep this screen open — the mix is still on this device."
      );
      return null;
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  async function persistBoardDropToProfile(drop: Record<string, unknown>): Promise<boolean> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const userId = await getCurrentUserId();
        if (!userId) {
          await new Promise((resolve) => window.setTimeout(resolve, 500 * (attempt + 1)));
          continue;
        }

        const { data: profile, error: profileError } = await sb
          .from("profiles")
          .select("board_style")
          .eq("id", userId)
          .maybeSingle();
        if (profileError) throw profileError;

        const boardStyle =
          profile?.board_style && typeof profile.board_style === "object"
            ? profile.board_style
            : {};
        const currentDrops = Array.isArray((boardStyle as any).boardDrops)
          ? (boardStyle as any).boardDrops
          : [];
        const dropId = String(drop.id ?? "");
        const boardDrops = [
          drop,
          ...currentDrops.filter((item: any) => String(item?.id ?? "") !== dropId),
        ].slice(0, 120);

        const { data: updatedProfile, error: updateError } = await sb
          .from("profiles")
          .update({ board_style: { ...boardStyle, boardDrops } })
          .eq("id", userId)
          .select("id")
          .maybeSingle();
        if (updateError) throw updateError;
        if (!updatedProfile?.id) throw new Error("News Drop save did not update a profile row.");
        return true;
      } catch (error) {
        console.error("[DropConsole] Board Drop profile save failed", error);
        await new Promise((resolve) => window.setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
    return false;
  }

  async function durableMediaCustomizations(
    input: DropCustomization | undefined,
    dropId: string
  ): Promise<DropCustomization | undefined> {
    const overlay = input?.artOverlayUrl;
    if (!overlay?.startsWith("data:image/")) return input;
    try {
      const auth = await Promise.race([
        sb.auth.getUser(),
        new Promise<{ data: { user: null } }>((resolve) =>
          window.setTimeout(() => resolve({ data: { user: null } }), 4_000)
        ),
      ]);
      if (!auth.data.user?.id) return input;

      const response = await fetch(overlay);
      const blob = await response.blob();
      const extension = blob.type.includes("webp") ? "webp" : "png";
      const path = `${auth.data.user.id}/${dropId}-art-layer/${Date.now()}-art-layer.${extension}`;
      const upload = uploadBoardMediaFile(
        new File([blob], `art-layer.${extension}`, { type: blob.type || "image/png" }),
        { bucket: "board-media", folder: `${auth.data.user.id}/${dropId}-art-layer` }
      );
      const uploaded = await Promise.race([
        upload,
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 12_000)),
      ]);
      if (!uploaded) return input;
      const publicUrl = uploaded.signedUrl || uploaded.publicUrl;
      if (!publicUrl) return input;
      return { ...input, artOverlayUrl: publicUrl };
    } catch {
      return input;
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
      let durableAttach = durableAttachUrl(attachUrl);
      if (!durableAttach && pendingMediaFileRef.current) {
        durableAttach = await uploadToBoardMedia(
          pendingMediaFileRef.current,
          mediaSource ?? "capture"
        );
        if (!durableAttach) {
          throw new Error("The Voice Studio mix is still uploading. Wait for Media attached ✓, then drop.");
        }
      }
      const cleanAttach =
        mode === "board_drop" && dropFlavor === "pay" && payProvider === "payment_link"
          ? payLink.trim() || durableAttach || null
          : durableAttach;
      const linkKind = cleanAttach ? classifyDropbookLinkUrl(cleanAttach) : null;
      const savedFlavor: DropFlavor =
        dropFlavor === "thought" ||
        dropFlavor === "pay" ||
        dropFlavor === "doc" ||
        dropFlavor === "media"
          ? dropFlavor
          : linkKind === "youtube" ||
              linkKind === "news" ||
              linkKind === "music" ||
              linkKind === "link"
            ? linkKind
            : dropFlavor;
      const tags = parseTags(tagsInput);
      const payPriceCents = dropFlavor === "pay" ? parsePriceToCents(payPrice) : null;
      const boardDropDescription =
        dropFlavor === "pay"
          ? payDesc.trim()
          : dropFlavor === "doc"
          ? docDesc.trim()
          : dropDesc.trim();
      const mediaCustomizations =
        mode === "board_drop" && dropFlavor === "media"
          ? compactDropCustomizations(dropCustomizations)
          : undefined;
      const attachMediaType = cleanAttach ? inferMediaType(cleanAttach, uploadedFileName) : null;
      const uploadedAudio =
        attachMediaType === "audio" ||
        /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(uploadedFileName);
      const musicEmbed =
        savedFlavor === "music" && cleanAttach
          ? makeEmbedByMode("Music", cleanAttach)
          : null;
      const thoughtFormat =
        dropFlavor === "thought"
          ? uploadedAudio
            ? "voice"
            : thoughtFormatFromMedia(attachMediaType)
          : null;
      const isHtmlDocument =
        /\.html?$/i.test(uploadedFileName) ||
        /\.html?(?:$|[?#])/i.test(cleanAttach ?? "");
      const isDropbookSlide = isDropbookSlideFile({
        name: uploadedFileName,
        url: cleanAttach,
      });
      const fromDescript =
        mode === "board_drop" &&
        dropFlavor === "doc" &&
        isHtmlDocument;
      const storedBoardDropDescription = boardDropDescription;
      const identity = readCurrentBoardIdentity();
      const boardDropId = mode === "board_drop" ? newId(savedFlavor) : null;
      const savedMediaCustomizations =
        boardDropId && mediaCustomizations
          ? await durableMediaCustomizations(mediaCustomizations, boardDropId)
          : mediaCustomizations;

      if (mode === "board_drop") {
        cleanBody =
          dropFlavor === "thought"
            ? thoughtText.trim() ||
              boardDropDescription ||
              (cleanTitle ? `Thought Drop: ${cleanTitle}` : cleanAttach ? "Thought attachment saved to Board." : "")
            : dropFlavor === "pay"
            ? boardDropDescription || (cleanTitle ? `Pay Drop: ${cleanTitle}` : "")
            : dropFlavor === "doc"
            ? storedBoardDropDescription || (cleanTitle ? `Doc Drop: ${cleanTitle}` : "")
            : storedBoardDropDescription
            ? storedBoardDropDescription
            : cleanTitle
            ? `New ${savedFlavor} drop added to Board.`
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
          forumId: resolveRoomId(forumId) || forumId,
          title: threadTitle,
          body: cleanBody,
          author: me,
        });

        upsertConversation({
          id: t.id,
          roomId: resolveRoomId(forumId) || "lobby",
          title: t.title,
          body: t.body,
          authorName: me.displayName,
          createdAt: new Date(t.createdAt).toISOString(),
          replies: [],
        });

        autoHref = `/board/forums/${encodeURIComponent(
          resolveRoomId(forumId) || "lobby"
        )}?conversation=${encodeURIComponent(t.id)}`;
      }

      // Board Drop: preview if external attachment
      let preview: any = null;
      if (
        mode === "board_drop" &&
        cleanAttach &&
        !isDropbookSlide &&
        isExternalHref(cleanAttach)
      ) {
        preview = await fetchLinkPreview(cleanAttach);
      }
      if (musicEmbed?.embedUrl) {
        preview = {
          url: preview?.url ?? cleanAttach,
          provider: preview?.provider ?? musicEmbed.hostLabel ?? null,
          title: preview?.title ?? null,
          description: preview?.description ?? null,
          image: preview?.image ?? null,
          embedUrl: musicEmbed.embedUrl,
          type: preview?.type ?? "music",
        };
      }

      // Announcement media: store as href so ActivityCard can embed
      const cleanAnnMedia = durableAttachUrl(announceMediaUrl);
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

      const boardDropProfileSave =
        mode === "board_drop" && boardDropId
          ? persistBoardDropToProfile({
              id: boardDropId,
              title: cleanTitle || preview?.title || `${profileDropType(savedFlavor)} Drop`,
              type: profileDropType(savedFlavor),
              createdAt: Date.now(),
              url: cleanAttach || undefined,
              embedUrl: musicEmbed?.embedUrl ?? preview?.embedUrl ?? null,
              hostLabel: musicEmbed?.hostLabel ?? preview?.provider ?? null,
              headline: savedFlavor === "news" ? preview?.title ?? cleanTitle ?? undefined : undefined,
              previewTitle: preview?.title ?? undefined,
              previewDescription: preview?.description ?? undefined,
              previewImage: preview?.image ?? undefined,
              previewImages: Array.isArray(preview?.images)
                ? preview.images.slice(0, 4)
                : preview?.image
                  ? [preview.image]
                  : undefined,
              description: storedBoardDropDescription || cleanBody || undefined,
              fileName: uploadedFileName || undefined,
              bucket: attachedStorage?.bucket,
              storagePath: attachedStorage?.storagePath,
              mediaUrl: cleanAttach || undefined,
              mediaKind:
                savedFlavor === "music"
                  ? uploadedAudio
                    ? "audio"
                    : undefined
                  : dropFlavor === "thought"
                    ? thoughtFormat === "voice"
                      ? "audio"
                      : thoughtFormat === "doodle"
                        ? "image"
                        : undefined
                    : dropFlavor === "doc"
                      ? undefined
                      : attachMediaType === "video"
                        ? "video"
                        : attachMediaType === "image"
                          ? "image"
                          : undefined,
              mediaSource: mediaSource ?? undefined,
              fromDescript: fromDescript || undefined,
              fromDropbook: isDropbookSlide || undefined,
              visibility: dropVisibility,
              thoughtText: dropFlavor === "thought" ? thoughtText.trim() || cleanBody : undefined,
              thoughtFormat: dropFlavor === "thought" ? thoughtFormat : undefined,
              priceCents: dropFlavor === "pay" ? payPriceCents ?? undefined : undefined,
              payProvider: dropFlavor === "pay" ? payProvider : undefined,
              paymentLink: dropFlavor === "pay" ? payLink.trim() || undefined : undefined,
              linkUrl: dropFlavor === "pay" ? payLink.trim() || undefined : undefined,
              customizations: savedMediaCustomizations ?? undefined,
            })
          : Promise.resolve(false);

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
                drop_flavor: savedFlavor,
                dropType: isDropbookSlide ? "dropbook" : savedFlavor,
                dropId: boardDropId,
                fileName: uploadedFileName || null,
                bucket: attachedStorage?.bucket ?? null,
                storagePath: attachedStorage?.storagePath ?? null,
                mediaUrl: cleanAttach || null,
                embedUrl: musicEmbed?.embedUrl ?? preview?.embedUrl ?? null,
                hostLabel: musicEmbed?.hostLabel ?? preview?.provider ?? null,
                mediaKind:
                  savedFlavor === "music"
                    ? uploadedAudio
                      ? "audio"
                      : null
                    : dropFlavor === "thought"
                    ? uploadedAudio
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
                      : "image"
                    : dropFlavor === "doc"
                    ? "doc"
                    : null,
                customizations: savedMediaCustomizations ?? null,
                description: storedBoardDropDescription || null,
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
                fromDescript: fromDescript || null,
                fromDropbook: isDropbookSlide || null,
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
                drop_flavor: savedFlavor,
                dropType: isDropbookSlide ? "dropbook" : savedFlavor,
                dropId: boardDropId,
                fileName: uploadedFileName || null,
                bucket: attachedStorage?.bucket ?? null,
                storagePath: attachedStorage?.storagePath ?? null,
                mediaUrl: cleanAttach || null,
                embedUrl: musicEmbed?.embedUrl ?? preview?.embedUrl ?? null,
                hostLabel: musicEmbed?.hostLabel ?? preview?.provider ?? null,
                mediaKind:
                  savedFlavor === "music"
                    ? uploadedAudio
                      ? "audio"
                      : null
                    : dropFlavor === "thought"
                    ? uploadedAudio
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
                      : "image"
                    : dropFlavor === "doc"
                    ? "doc"
                    : null,
                customizations: savedMediaCustomizations ?? null,
                description: storedBoardDropDescription || null,
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
                fromDescript: fromDescript || null,
                fromDropbook: isDropbookSlide || null,
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
              }
            : {}),
        },
      });

      const boardDropSavedToProfile = await Promise.race([
        boardDropProfileSave,
        new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), 8_000)),
      ]);
      if (
        mode === "board_drop" &&
        res.source !== "db" &&
        !boardDropSavedToProfile
      ) {
        throw new Error("The Drop could not be saved. Check your connection and try again.");
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
      setBody("");
      setAttachUrl("");
      setUploadedFileName("");
      setAttachedStorage(null);
      setMediaPreviewUrl("");
      pendingMediaFileRef.current = null;
      setDropCustomizations({});
      setDropDesc("");
      setThoughtText("");
      setDropVisibility("public");
      setMediaSource(null);
      setTagsInput("");
      setAnnounceMediaUrl("");
      setAnnounceMediaName("");
      setAnnounceCustomizations({});
      setPayPrice("");
      setPayDesc("");
      setPayLink("");
      setDocDesc("");

      setPostMsg("Dropped ✓");
      window.setTimeout(() => setPostMsg(null), 1500);
    } catch (err: any) {
      setPostErr(err?.message || "Drop failed.");
    } finally {
      setPosting(false);
    }
  }

  async function publishStudioLinkDrop(link: ResolvedDropbookLink) {
    const persistKind = studioLinkPersistKind(link);
    const flavor: DropFlavor =
      persistKind === "youtube"
        ? "youtube"
        : persistKind === "news"
          ? "news"
          : persistKind === "music"
            ? "music"
            : "link";
    const embedUrl = studioLinkEmbedUrl(link) ?? null;
    const identity = readCurrentBoardIdentity();
    const dropId = newId(flavor);
    const titleText = link.title.trim() || `${DROP_FLAVOR_LABEL[flavor]} Drop`;
    const bodyText = link.description?.trim() || `New ${DROP_FLAVOR_LABEL[flavor]} drop added to Board.`;
    const previewImage =
      persistKind === "news"
        ? link.image ?? newsCoverUrl(link.url) ?? null
        : link.image ?? null;
    const preview = {
      url: link.url,
      provider: link.provider ?? null,
      title: link.title,
      description: link.description ?? null,
      image: previewImage,
      embedUrl,
      type: persistKind === "youtube" ? "video" : persistKind === "music" ? "music" : "link",
    };

    const res = await createActivity(sb, {
      user_id: meId,
      kind: "board_drop",
      title: titleText,
      body: bodyText,
      href: link.url,
      image_url: previewImage,
      meta: {
        source: "drop_studio",
        drop_flavor: flavor,
        dropType: flavor,
        dropId,
        visibility: dropVisibility,
        authorId: identity.id,
        authorName: identity.displayName,
        authorUsername: identity.username || null,
        authorAvatar: identity.avatar || null,
        authorGlow: identity.glow,
        authorAuraIntensity: identity.auraIntensity,
        preview,
      },
    });

    await persistBoardDropToProfile({
      id: dropId,
      title: titleText,
      type: profileDropType(flavor),
      createdAt: Date.now(),
      url: link.url,
      embedUrl,
      hostLabel: link.provider ?? null,
      headline: persistKind === "news" ? link.title : undefined,
      previewTitle: link.title,
      previewDescription: link.description,
      previewImage,
      description: bodyText,
      visibility: dropVisibility,
    });

    emitNewActivity({
      id: res.activity.id,
      created_at: res.activity.created_at,
      user_id: res.activity.user_id,
      kind: "board_drop",
      title: titleText,
      body: bodyText,
      href: link.url,
      image_url: previewImage,
      meta: {
        source: "drop_studio",
        drop_flavor: flavor,
        dropType: flavor,
        dropId,
        visibility: dropVisibility,
        preview,
        authorId: identity.id,
        authorName: identity.displayName,
        authorUsername: identity.username || null,
        authorAvatar: identity.avatar || null,
      },
    });
    emitBoardDropSignal({
      type: "drop_created",
      dropId,
      userId: meId,
      title: titleText,
      meta: { source: "drop_studio", dropType: flavor, visibility: dropVisibility },
    });
    setDropFlavor(flavor);
    setTitle(titleText);
    setDropVisibility("public");
    setPostMsg(dropVisibility === "private" ? "Private drop saved ✓" : "Dropped ✓");
    window.setTimeout(() => setPostMsg(null), 1500);
  }

  // -------------------------
  // SLEEP DOCK (does NOT overlay your buckets)
  // -------------------------
  if (sleeping && !hasAwakened) {
    const dock = <DropConsoleSleepDock onWake={() => setSleeping(false)} />;
    if (variant === "bare") return dock;
    return <div style={{ width: "100%" }}>{dock}</div>;
  }

  const content = (
    <div className="dc">
      <LazyDropStudioStage
        open={announceStudioOpen && mode === "announcement"}
        initialFile={null}
        initialMode="photo"
        allowedModes={["photo", "video", "audio", "art", "descript"]}
        descriptDestination="announcement"
        value={announceCustomizations}
        onChange={setAnnounceCustomizations}
        onComplete={async (file, _source, onProgress) => {
          const url = await uploadToBoardMedia(file, "capture", onProgress);
          if (!url) throw new Error("Couldn't upload this mix. Try Mix to Drop again.");
          setAnnounceStudioOpen(false);
        }}
        onDescriptComplete={async (doc: DescriptDoc) => {
          const plainText = doc.plainText.trim();
          setTitle((current) => current.trim() || doc.title);
          if (plainText && !body.trim()) setBody(plainText);
          void uploadToBoardMedia(descriptDocToFile(doc), "capture");
          setAnnounceStudioOpen(false);
        }}
        onLinkComplete={async (link) => {
          await publishStudioLinkDrop(link);
          setAnnounceStudioOpen(false);
        }}
        onClose={() => setAnnounceStudioOpen(false)}
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

            <div className="dcDropTypeRow" role="tablist" aria-label="Drop type">
              {DROP_FLAVOR_ORDER.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={clsx("dcTypeBtn", dropFlavor === t && "on")}
                  onClick={() => {
                    setDropFlavor(t);
                    setAttachUrl("");
                    setUploadedFileName("");
                    setAttachedStorage(null);
                    setMediaPreviewUrl("");
                    pendingMediaFileRef.current = null;
                    setDropDesc("");
                    setThoughtText("");
                    setMediaSource(null);
                    setDropCustomizations({});
                    if (t !== "pay") {
                      setPayPrice("");
                      setPayDesc("");
                      setPayLink("");
                      setPayProvider("stripe_connect");
                    }
                    if (t !== "doc") setDocDesc("");
                  }}
                >
                  <span>{DROP_FLAVOR_LABEL[t].toUpperCase()}</span>
                  <small>{DROP_FLAVOR_SUB[t]}</small>
                </button>
              ))}
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
                {!forumOptions.some((f) => f.id === "lobby") && (
                  <option value="lobby">Lobby</option>
                )}
                {forumOptions.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title}
                  </option>
                ))}
              </select>
                  <div className="dcFieldHelp">Pick the Room this conversation lives in.</div>
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

          {/* Announcement media — Drop Studio only (no paste-link field) */}
          {mode === "announcement" && (
            <div className="dcField">
              <div className="dcFieldLabel">Announcement Media</div>

              <div className="mediaActionRow" aria-label="Announcement media actions">
                <button
                  type="button"
                  className={clsx("mediaAction", "uploadAction", uploading && "busy")}
                  onClick={() => setAnnounceStudioOpen(true)}
                  disabled={uploading}
                >
                  {uploading ? "Uploading..." : "Open Drop Studio"}
                </button>
              </div>

              <div className="fileMeta fileStatus">
                {announceMediaName || announceMediaUrl ? (
                  <span className="fileName">{announceMediaName || "Media attached"}</span>
                ) : (
                  <span className="fileName dim">Optional — design media in Drop Studio</span>
                )}
                {uploading ? <span className="fileSize">Uploading...</span> : null}
              </div>
              {uploadProgress ? (
                <div style={{ marginTop: 10 }}>
                  <BoardUploadProgressBar progress={uploadProgress} title="Uploading" />
                </div>
              ) : null}

              {announceMediaUrl ? (
                <div className="consoleMediaPreview">
                  {inferMediaType(announceMediaUrl) === "video" ||
                  /\.(mp4|webm|mov|m4v)$/i.test(announceMediaName) ? (
                    <video src={announceMediaUrl} controls playsInline />
                  ) : inferMediaType(announceMediaUrl) === "audio" ||
                    /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(announceMediaName) ? (
                    <audio src={announceMediaUrl} controls preload="metadata" />
                  ) : (
                    <img src={announceMediaUrl} alt="Announcement media preview" />
                  )}
                  <button
                    type="button"
                    className="mediaAction"
                    onClick={() => {
                      setAnnounceMediaUrl("");
                      setAnnounceMediaName("");
                      setAnnounceCustomizations({});
                    }}
                  >
                    Remove
                  </button>
                </div>
              ) : null}

              {uploadErr && <div className="dcErr">{uploadErr}</div>}
              <div className="dcFieldHelp">
                Open Drop Studio to capture, upload, or design the announcement visual.
              </div>
            </div>
          )}

          {/* Title */}
          <div className="dcField">
            <div className="dcFieldLabel">Title</div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={mode === "forum_post" ? "Thread title (optional)" : "Title"}
              className="dcInput"
            />
          </div>

          {mode === "board_drop" ? (
            <BoardDropConsoleFields
              setTitle={setTitle}
              dropFlavor={dropFlavor}
              setDropFlavor={setDropFlavor}
              attachUrl={attachUrl}
              setAttachUrl={setAttachUrl}
              mediaPreviewUrl={mediaPreviewUrl}
              uploadedFileName={uploadedFileName}
              uploading={uploading}
              uploadProgress={uploadProgress}
              uploadErr={uploadErr}
              uploadToBoardMedia={uploadToBoardMedia}
              dropDesc={dropDesc}
              setDropDesc={setDropDesc}
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
              onLinkComplete={publishStudioLinkDrop}
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

            <button type="submit" disabled={posting || uploading} className="dcSubmit">
              {uploading ? "Uploading mix…" : posting ? "Dropping…" : "Add a Drop"}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        .dc { width: 100%; }
        .dcInner { padding: 16px; }

        .dcTitleRow { display: flex; align-items: center; gap: 10px; }
        .dcTitle { margin: 0; font-size: 16px; font-weight: 950; color: rgba(0,170,160,1); }
        .dcHint { margin: 6px 0 0; font-size: 12px; color: rgba(0,0,0,0.52); }

        .dcSleep {
          border-radius: 999px; padding: 8px 10px; font-size: 10px;
          font-weight: 950; letter-spacing: 0.18em; text-transform: uppercase;
          border: 1px solid rgba(0,0,0,0.12);
          background: rgba(0,0,0,0.84); color: rgba(255,255,255,0.92);
          cursor: pointer;
        }

        .dcModePills { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 10px; }
        .dcModePill {
          border-radius: 999px;
          padding: 8px 12px;
          border: 1px solid rgba(0,0,0,0.12);
          background: rgba(255,255,255,0.70);
          color: rgba(0,0,0,0.62);
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          cursor: pointer;
          transition: transform 160ms ease, filter 160ms ease, background 160ms ease;
        }
        .dcModePill:hover { transform: translateY(-1px); filter: brightness(1.02); }
        .dcModePill.on {
          background: rgba(0,0,0,0.86);
          color: rgba(200,255,230,0.95);
          border-color: rgba(0,0,0,0.18);
        }

        .dcSection { margin-top: 12px; }
        .dcSectionHead { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
        .dcSectionLabel { font-size: 11px; font-weight: 950; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(0,0,0,0.52); }
        .dcSectionNote { font-size: 12px; color: rgba(0,0,0,0.46); font-weight: 800; }

        .dcPills { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 10px; }
        .dcDropTypeRow {
          margin-top: 8px;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
          min-width: 0;
          max-width: 100%;
        }
        .dcTypeBtn {
          min-width: 0;
          width: 100%;
          border-radius: 999px;
          padding: 8px 10px;
          border: 1px solid rgba(0,0,0,0.12);
          background: rgba(255,255,255,0.70);
          color: rgba(0,0,0,0.62);
          cursor: pointer;
          display: inline-grid;
          gap: 4px;
          text-align: left;
          transition: transform 160ms ease, filter 160ms ease, background 160ms ease;
        }
        .dcTypeBtn:hover { transform: translateY(-1px); filter: brightness(1.02); }
        .dcTypeBtn span {
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .dcTypeBtn small {
          font-size: 12px;
          font-weight: 650;
          color: rgba(0,0,0,0.48);
        }
        .dcTypeBtn.on {
          background: rgba(0,0,0,0.86);
          color: rgba(200,255,230,0.95);
          border-color: rgba(0,0,0,0.18);
        }
        .dcTypeBtn.on small { color: rgba(255,255,255,0.70); }

        .dcForm { margin-top: 12px; display: grid; gap: 12px; }

        .dcFieldLabel { font-size: 11px; font-weight: 950; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(0,0,0,0.52); margin-bottom: 6px; }
        .dcInput {
          width: 100%;
          border-radius: 16px;
          border: 1px solid rgba(0,0,0,0.12);
          background: rgba(255,255,255,0.72);
          padding: 12px 14px;
          outline: none;
          color: rgba(0,0,0,0.72);
          font-weight: 750;
          min-width: 0;
        }
        .dcTextarea {
          width: 100%;
          border-radius: 16px;
          border: 1px solid rgba(0,0,0,0.12);
          background: rgba(255,255,255,0.72);
          padding: 12px 14px;
          outline: none;
          resize: vertical;
          color: rgba(0,0,0,0.72);
          font-weight: 750;
          min-width: 0;
        }
        .dcInput:focus, .dcTextarea:focus {
          box-shadow:
            0 0 0 2px rgba(160,220,255,0.68),
            0 0 18px rgba(160,220,255,0.28);
          border-color: rgba(160,220,255,0.75);
          background: rgba(255,255,255,0.84);
        }

        .dcFieldHelp { margin-top: 6px; font-size: 12px; color: rgba(0,0,0,0.46); font-weight: 800; }
        .fileLine {
          display: grid;
          gap: 8px;
        }
        .fileInput {
          position: absolute;
          width: 1px;
          height: 1px;
          opacity: 0;
          pointer-events: none;
        }
        .fileMeta {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
          min-width: 0;
          max-width: 100%;
        }
        .fileName {
          font-weight: 900;
          color: rgba(0,0,0,0.68);
          min-width: 0;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .fileName.dim {
          color: rgba(0,0,0,0.45);
        }
        .fileSize {
          font-size: 12px;
          color: rgba(0,0,0,0.50);
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .fileStatus {
          margin-top: 8px;
          min-height: 18px;
        }
        .payProviderRow {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .providerChip {
          border: 1px solid rgba(0,0,0,0.12);
          background: rgba(255,255,255,0.84);
          color: rgba(0,0,0,0.58);
          border-radius: 999px;
          padding: 9px 12px;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          cursor: pointer;
        }
        .providerChip.on {
          background: rgba(0,0,0,0.86);
          color: rgba(255,255,255,0.92);
        }
        .payGatewayNote {
          font-size: 12px;
          color: rgba(0,0,0,0.56);
          font-weight: 700;
        }

        .dcTagsPreview { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 8px; }
        .dcTagChip {
          border-radius: 999px; padding: 6px 10px; font-size: 11px;
          font-weight: 900; letter-spacing: 0.08em;
          border: 1px solid rgba(0,0,0,0.10);
          background: rgba(255,255,255,0.78);
          color: rgba(0,0,0,0.60);
        }

        .mediaRow { display: grid; gap: 10px; align-items: center; }

        .mediaActionRow {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          margin-top: 10px;
        }

        .mediaAction {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 38px;
          border-radius: 999px;
          padding: 9px 14px;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          cursor: pointer;
          white-space: nowrap;
          transition:
            transform 160ms ease,
            box-shadow 160ms ease,
            filter 160ms ease,
            border-color 160ms ease;
        }

        .mediaAction:hover {
          transform: translateY(-1px);
          filter: brightness(1.02);
        }

        .uploadBtn {
          border-radius: 999px;
          padding: 10px 14px;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          border: 1px solid rgba(0,0,0,0.16);
          background: rgba(0,0,0,0.86);
          color: rgba(200,255,230,0.95);
          cursor: pointer;
          white-space: nowrap;
          transition: transform 160ms ease, filter 160ms ease;
        }
        .uploadBtn:hover { transform: translateY(-1px); filter: brightness(1.02); }
        .uploadBtn.busy { opacity: 0.7; cursor: not-allowed; }
        .uploadAction {
          border: 1px solid rgba(0,0,0,0.16);
          background:
            radial-gradient(circle at 22% 18%, rgba(200,255,230,0.18), transparent 38%),
            rgba(0,0,0,0.88);
          color: rgba(200,255,230,0.95);
          box-shadow: inset 0 0 14px rgba(255,255,255,0.06);
        }
        .uploadAction:hover {
          box-shadow:
            0 0 18px rgba(0, 180, 150, 0.12),
            inset 0 0 14px rgba(255,255,255,0.08);
        }
        .uploadAction.busy {
          opacity: 0.62;
          cursor: wait;
          pointer-events: none;
        }
        .captureRow {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 10px;
        }
        .captureAction {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          padding: 9px 14px;
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
        .captureAction:hover {
          transform: translateY(-1px);
          filter: brightness(1.02);
          box-shadow: 0 0 18px rgba(0, 180, 150, 0.15);
        }
        .captureAction.busy {
          opacity: 0.62;
          pointer-events: none;
        }
        .captureHelp {
          margin-top: 7px;
          font-size: 11px;
          font-weight: 750;
          color: rgba(0, 0, 0, 0.45);
        }
        .consoleMediaPreview {
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(0, 120, 105, 0.2);
          border-radius: 16px;
          background: rgba(3, 24, 24, 0.92);
          box-shadow: 0 0 20px rgba(0, 180, 150, 0.12);
        }
        .consoleMediaPreview img,
        .consoleMediaPreview video {
          display: block;
          width: 100%;
          max-height: 280px;
          object-fit: contain;
          background: rgba(2, 12, 14, 0.96);
        }
        .consoleMediaPreview span {
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

        .thoughtAttachmentPreview {
          position: relative;
          overflow: hidden;
          border-radius: 20px;
          border: 1px solid rgba(0, 190, 170, 0.22);
          background:
            radial-gradient(circle at 20% 10%, rgba(170,255,230,0.22), transparent 40%),
            rgba(255, 255, 255, 0.72);
          box-shadow: inset 0 0 22px rgba(0, 190, 170, 0.08);
        }
        .thoughtAttachmentPreview img,
        .thoughtAttachmentPreview audio {
          width: 100%;
          display: block;
        }
        .thoughtAttachmentPreview img {
          max-height: 210px;
          object-fit: contain;
          background: rgba(0, 0, 0, 0.84);
        }
        .thoughtAttachmentPreview span {
          display: inline-flex;
          margin: 9px;
          border-radius: 999px;
          padding: 5px 8px;
          background: rgba(0, 30, 30, 0.72);
          color: rgba(210, 255, 244, 0.92);
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .thoughtTextarea {
          min-height: 92px;
          background:
            radial-gradient(circle at 0% 0%, rgba(145,255,225,0.16), transparent 35%),
            rgba(255,255,255,0.78);
        }

        .dcErr { font-size: 13px; font-weight: 800; color: rgba(190,0,0,0.75); }
        .dcOk { font-size: 13px; font-weight: 800; color: rgba(0,120,90,0.85); }

        .dcBottom { margin-top: 2px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .dcFoot { font-size: 12px; color: rgba(0,0,0,0.52); }
        .dcFootLink a {
          display: inline-block; margin-top: 6px; font-size: 12px; font-weight: 900;
          letter-spacing: 0.08em; text-transform: uppercase;
          color: rgba(255,0,190,0.85); text-decoration: underline; text-underline-offset: 4px;
        }

        .dcSubmit {
          border-radius: 16px;
          padding: 12px 16px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          border: 1px solid rgba(0,0,0,0.16);
          background: rgba(0,0,0,0.86);
          color: rgba(200,255,230,0.95);
          cursor: pointer;
          transition: transform 140ms ease, filter 140ms ease;
        }
        .dcSubmit:hover { transform: translateY(-1px); filter: brightness(1.02); }
        .dcSubmit:disabled { opacity: 0.65; cursor: not-allowed; transform: none; }

        @media (max-width: 520px) {
          .mediaRow { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );

  const consoleBody =
    variant === "bare" ? (
      content
    ) : (
      <div className="dcTileWrap">
        <div className="dcTileRim" aria-hidden />
        {content}

        <style>{`
          .dcTileWrap {
            position: relative;
            border-radius: 28px;
            background: rgba(255, 255, 255, 0.92);
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

  const dock = <DropConsoleSleepDock onWake={() => setSleeping(false)} />;
  return (
    <>
      {sleeping ? (variant === "bare" ? dock : <div style={{ width: "100%" }}>{dock}</div>) : null}
      <div hidden={sleeping}>{consoleBody}</div>
    </>
  );
}

function BoardDropConsoleFields({
  setTitle,
  dropFlavor,
  setDropFlavor,
  attachUrl,
  setAttachUrl,
  mediaPreviewUrl,
  uploadedFileName,
  uploading,
  uploadProgress,
  uploadErr,
  uploadToBoardMedia,
  dropDesc,
  setDropDesc,
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
  onLinkComplete,
}: {
  setTitle: React.Dispatch<React.SetStateAction<string>>;
  dropFlavor: DropFlavor;
  setDropFlavor: (value: DropFlavor) => void;
  attachUrl: string;
  setAttachUrl: (value: string) => void;
  mediaPreviewUrl: string;
  uploadedFileName: string;
  uploading: boolean;
  uploadProgress: BoardUploadProgress | null;
  uploadErr: string | null;
  uploadToBoardMedia: (
    file: File,
    source?: "upload" | "capture",
    onProgress?: BoardUploadProgressHandler
  ) => Promise<string | null>;
  dropDesc: string;
  setDropDesc: (value: string) => void;
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
  onLinkComplete?: (link: ResolvedDropbookLink) => void | Promise<void>;
}) {
  const [studioOpen, setStudioOpen] = useState(false);
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
      <LazyDropStudioStage
        open={studioOpen}
        initialFile={null}
        initialMode={dropFlavor === "thought" || dropFlavor === "music" ? "audio" : "photo"}
        allowedModes={
          dropFlavor === "thought"
            ? ["audio", "art", "descript"]
            : ["photo", "video", "audio", "art", "descript"]
        }
        descriptDestination="doc"
        value={customizations}
        onChange={setCustomizations}
        onComplete={async (file, _source, onProgress) => {
          if (isDropbookSlideFile({ name: file.name, type: file.type })) {
            setDropFlavor("media");
            setTitle((current) => current.trim() || "Dropbook");
            setDropDesc("");
          }
          const url = await uploadToBoardMedia(file, "capture", onProgress);
          if (!url) throw new Error("Couldn't upload this mix. Try Mix to Drop again.");
        }}
        onDescriptComplete={async (doc: DescriptDoc) => {
          const plainText = doc.plainText.trim();
          setDropFlavor("doc");
          setTitle((current) => current.trim() || doc.title);
          setDocDesc(plainText);
          const url = await uploadToBoardMedia(descriptDocToFile(doc), "capture");
          if (!url) throw new Error("Couldn't upload this document. Try again.");
        }}
        onLinkComplete={async (link) => {
          if (!onLinkComplete) throw new Error("Could not post this link.");
          await onLinkComplete(link);
          setStudioOpen(false);
        }}
        onClose={() => setStudioOpen(false)}
      />
      <BoardClientErrorBoundary name="drop-console-fields" resetLabel="Try Drop Console again">
      {dropFlavor === "pay" ? (
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
      ) : null}

      {showFileLine || showUrlField ? (
        <div className="dcField">
          <div className="mediaActionRow" aria-label="Drop media actions">
            <DropPrivacyButton visibility={dropVisibility} onChange={setDropVisibility} />
            <button
              type="button"
              className="mediaAction uploadAction"
              onClick={() => setStudioOpen(true)}
            >
              Open Drop Studio
            </button>
            {dropFlavor !== "media" &&
            dropFlavor !== "thought" &&
            dropFlavor !== "youtube" &&
            dropFlavor !== "news" &&
            dropFlavor !== "link" ? (
              <label
                className={clsx("mediaAction", "uploadAction", uploading && "busy")}
              >
                <span>{uploading ? "Uploading..." : "Upload"}</span>
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
            ) : null}
          </div>
          {showFileLine ? (
            <>
              <div className="fileMeta fileStatus">
                {uploadedFileName ? (
                  <span className="fileName">{uploadedFileName}</span>
                ) : (
                  <span className="fileName dim">{uploadLabelForFlavor(dropFlavor)}</span>
                )}
                {uploading ? <span className="fileSize">Uploading...</span> : null}
              </div>
              {uploadProgress ? (
                <div style={{ marginTop: 10 }}>
                  <BoardUploadProgressBar progress={uploadProgress} title="Uploading" />
                </div>
              ) : null}
              {dropFlavor === "media" || dropFlavor === "thought" || dropFlavor === "pay" ? (
                <div className="captureHelp">
                  {dropFlavor === "pay"
                    ? "Open Drop Studio or attach context for this payment request."
                    : dropFlavor === "thought"
                      ? "Open Drop Studio for Voice, Art, or Descript. The eye sets Public or Private."
                      : "Open the editor to design this media drop."}
                </div>
              ) : null}
              {uploadErr ? <div className="dcErr">{uploadErr}</div> : null}
            </>
          ) : null}
        </div>
      ) : null}

      {dropFlavor === "pay" && (mediaPreviewUrl || attachUrl) ? (
        <div className="consoleMediaPreview">
          {inferMediaType(attachUrl || mediaPreviewUrl, uploadedFileName) === "video" || /\.(mp4|webm|mov|m4v)$/i.test(uploadedFileName) ? (
            <video src={mediaPreviewUrl || attachUrl} controls playsInline />
          ) : (
            <img src={mediaPreviewUrl || attachUrl} alt="Pay Drop request context" />
          )}
          {mediaSource === "capture" ? <span>Captured on Board</span> : null}
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
              Voice memo or doodle/image is optional in Drop Studio. Private drops stay out of the Community Feed.
            </div>
          </div>

          {(mediaPreviewUrl || attachUrl) ? (
            <div className="thoughtAttachmentPreview">
              {inferMediaType(attachUrl || mediaPreviewUrl, uploadedFileName) === "audio" ||
              /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(uploadedFileName) ? (
                <audio src={mediaPreviewUrl || attachUrl} controls preload="metadata" />
              ) : (
                <img src={mediaPreviewUrl || attachUrl} alt="Thought attachment" />
              )}
              <span>
                {inferMediaType(attachUrl || mediaPreviewUrl, uploadedFileName) === "audio" ||
                /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(uploadedFileName)
                  ? "Voice memo thought"
                  : "Doodle/image thought"}
              </span>
            </div>
          ) : null}
        </>
      ) : null}

      {showUrlField || dropFlavor === "music" ? (
        <div className="dcField">
          <input
            value={attachUrl}
            onChange={(e) => {
              const next = e.target.value;
              setAttachUrl(next);
              const classified = classifiedStudioLinkKind(next);
              if (
                classified &&
                (dropFlavor === "youtube" ||
                  dropFlavor === "news" ||
                  dropFlavor === "music" ||
                  dropFlavor === "link")
              ) {
                setDropFlavor(classified);
              }
            }}
            placeholder={
              dropFlavor === "music"
                ? "Paste Spotify, Apple Music, or SoundCloud"
                : attachmentPlaceholder(dropFlavor)
            }
            className="dcInput"
          />
        </div>
      ) : null}

      {dropFlavor !== "pay" && dropFlavor !== "doc" && dropFlavor !== "thought" ? (
        <div className="dcField">
          <textarea
            className="dcTextarea"
            placeholder={
              dropFlavor === "media"
                ? "Add context, credit, mood, or what this drop is about..."
                : "Add a description..."
            }
            value={dropDesc}
            onChange={(e) => setDropDesc(e.target.value)}
            rows={3}
          />
        </div>
      ) : null}

      {dropFlavor === "pay" ? (
        <>
          <div className="dcField">
            <input
              className="dcInput"
              placeholder="Price (ex: 19.99)"
              value={payPrice}
              onChange={(e) => setPayPrice(e.target.value)}
              inputMode="decimal"
            />
          </div>
          <div className="dcField">
            <textarea
              className="dcTextarea"
              placeholder="Description (optional)"
              value={payDesc}
              onChange={(e) => setPayDesc(e.target.value)}
              rows={3}
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
          <textarea
            className="dcTextarea"
            placeholder="Notes (optional) - logline, context, etc."
            value={docDesc}
            onChange={(e) => setDocDesc(e.target.value)}
            rows={3}
          />
        </div>
      ) : null}
      </BoardClientErrorBoundary>
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
