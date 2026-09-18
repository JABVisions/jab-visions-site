// File: app/components/board/DropStudioStage.tsx
// Drop Studio — Board's creation sheet. A single full-screen liquid-glass
// surface that IS the camera and the editor: live capture (photo/video) or
// upload, then a TikTok-style editor (Text · Stickers · Effects) over the shot.
// No separate demo camera. Mounted as a fixed overlay, never inside a column.

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import DropStudio from "./DropStudio";
import BoardArtCanvas from "./BoardArtCanvas";
import { DropChipStage } from "./DropChipWorkbench";
import chooseStyles from "./dropStudioChoose.module.css";
import chipStyles from "./dropbookShelfChip.module.css";
import "./dropStudioStage.css";
import DescriptStudio from "./DescriptStudio";
import {
  descriptPlainText,
  type DescriptDestination,
  type DescriptDoc,
} from "@/lib/board/descriptDocs";
import {
  BOARD_DROP_ASPECT_CSS,
  dropFrameAspectRatio,
  normalizeDropMediaRotation,
  resolveDropMediaFrame,
} from "@/lib/board/mediaFormat";
import {
  boardDropFramePixelSize,
  canvasToJpegBlob,
  detectFrameFromFile,
  ensureImageFileMinResolution,
  rotateImageFile,
} from "@/lib/board/imageQuality";
import {
  compactDropCustomizations,
  type DropCustomization,
} from "@/lib/board/dropCustomizations";
import { saveDropDraft, draftToFile, ensureVoiceStudioDraftCard, type DropDraft } from "@/lib/board/dropDrafts";
import DropDraftsDrawer from "./DropDraftsDrawer";
import BoardClientErrorBoundary from "./BoardClientErrorBoundary";
import VocalVisualizer from "./VocalVisualizer";
import VoicePresets from "./VoicePresets";
import VoiceStudioSession from "./VoiceStudioSession";
import {
  AudioSessionEngine,
  createAudioSession,
  createSessionHistory,
  decodeAudioFile,
  defaultAlteration,
  duplicateAdlibTrack,
  duplicateClip,
  getAudioContextConstructor,
  moveAdlibTrack,
  pushHistory,
  readStudioLatencyMs,
  redoHistory,
  removeClip,
  removeLane,
  removeTrackById,
  renameTrack,
  renderSessionFile,
  restoreClipOriginal,
  sessionDurationMs,
  sessionHasLane,
  splitClipAtPlayhead,
  studioAudioExtension,
  createStudioTakeCapture,
  getMusicMicStream,
  undoHistory,
  updateClip,
  updateTrackMix,
  upsertLaneFromFile,
  writeStudioLatencyMs,
  type AlterationParams,
  type AudioSession,
  type LaneKind,
  type SessionHistory,
  type StudioTakeCapture,
} from "@/lib/board/audioSession";
import {
  renderVoicePresetFile,
  type VoicePresetKey,
} from "@/lib/board/voicePresetAudio";
import {
  loadLatestVoiceStudioProject,
  loadVoiceStudioProject,
  rememberActiveVoiceStudioDraft,
  saveVoiceStudioProject,
  sessionHasClips,
  voiceStudioEditSignature,
} from "@/lib/board/voiceStudioProject";
import {
  DROPBOOK_MIME,
  type DropbookManifest,
  type DropbookSlide,
} from "@/lib/board/dropbookSlides";
import { resolveDropbookLink, type DropbookLinkKind, type ResolvedDropbookLink } from "@/lib/board/dropbookLink";

type CaptureMode = "photo" | "video" | "audio" | "art" | "descript";
type FacingMode = "user" | "environment";
type Phase = "choose" | "capture" | "edit";

/** A single page/slot in an in-progress Dropbook collection. */
export type DropbookChip = {
  id: string;
  /** Set when a drop is committed to the Dropbook shelf. */
  dropId?: string;
  mode?: CaptureMode;
  previewUrl?: string;
  label?: string;
  /** Descript page — glossy 4:5 chip preview (no image file). */
  descriptDocId?: string;
  descriptTitle?: string;
  descriptPreview?: string;
  /** Session link page (YouTube / music / web) inside a Dropbook. */
  linkKind?: DropbookLinkKind;
  linkUrl?: string;
  linkEmbedUrl?: string;
  linkProvider?: string;
  linkDescription?: string;
};

/** Page zero — the Dropbook's permanent cover identity. */
export type DropbookCover = {
  id: string;
  previewUrl?: string;
  bookColor: string;
  bookColorSet: boolean;
  complete: boolean;
  coverSource?: "blank" | "drop";
  sourceChipId?: string;
  mode?: CaptureMode;
};

const DROPBOOK_MAX_PAGES = 3;
const DROPBOOK_INTRO_MS = 1800;

function createEmptyDropbookCover(): DropbookCover {
  return {
    id: `dropbook-cover-${Date.now()}`,
    bookColor: "#000000",
    bookColorSet: true,
    complete: false,
  };
}

function solidColorBackgroundUrl(hex: string) {
  if (typeof document === "undefined") return "";
  const { width, height } = boardDropFramePixelSize(800, 1000);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.92);
}

/** Book color field with an embedded photo (color shows as a matte frame). */
async function composeCoverBackground(hex: string, photoUrl: string | null) {
  if (typeof document === "undefined") return "";
  if (!photoUrl) return solidColorBackgroundUrl(hex);
  const { width, height } = boardDropFramePixelSize(800, 1000);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return solidColorBackgroundUrl(hex);
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, width, height);
  try {
    const image = await loadStudioImage(photoUrl);
    const pad = Math.round(Math.min(width, height) * 0.07);
    const boxW = width - pad * 2;
    const boxH = height - pad * 2;
    const scale = Math.min(boxW / image.naturalWidth, boxH / image.naturalHeight);
    const drawW = image.naturalWidth * scale;
    const drawH = image.naturalHeight * scale;
    ctx.drawImage(image, (width - drawW) / 2, (height - drawH) / 2, drawW, drawH);
  } catch {
    return solidColorBackgroundUrl(hex);
  }
  return canvas.toDataURL("image/jpeg", 0.92);
}

function loadStudioImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The Art Palette layer could not be loaded."));
    image.src = src;
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("Dropbook page could not be read."));
    reader.readAsDataURL(blob);
  });
}

async function sourceToDataUrl(source: string): Promise<string> {
  if (source.startsWith("data:")) return source;
  const response = await fetch(source);
  if (!response.ok) throw new Error("Dropbook cover could not be read.");
  return blobToDataUrl(await response.blob());
}

async function coverDataUrlToFile(dataUrl: string) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], `dropbook-cover-${Date.now()}.jpg`, {
    type: blob.type || "image/jpeg",
  });
}

function isStudioLetterboxPixel(r: number, g: number, b: number, a: number) {
  if (a < 12) return true;
  return r <= 20 && g <= 24 && b <= 28;
}

/**
 * Find near-black / transparent bars left by an earlier contain-fit flatten
 * (studio fill #02070a). Detection runs on a small downsample so 12MP photos
 * stay cheap. Returns the full frame when the crop would throw away a dark
 * photo rather than bars.
 */
function detectLetterboxCrop(image: HTMLImageElement) {
  const width = Math.max(1, image.naturalWidth);
  const height = Math.max(1, image.naturalHeight);
  const maxEdge = 240;
  const sampleScale = Math.min(1, maxEdge / Math.max(width, height));
  const sampleWidth = Math.max(1, Math.round(width * sampleScale));
  const sampleHeight = Math.max(1, Math.round(height * sampleScale));
  const sample = document.createElement("canvas");
  sample.width = sampleWidth;
  sample.height = sampleHeight;
  const context = sample.getContext("2d", { willReadFrequently: true });
  if (!context) return { sx: 0, sy: 0, sw: width, sh: height };
  context.drawImage(image, 0, 0, sampleWidth, sampleHeight);
  const { data } = context.getImageData(0, 0, sampleWidth, sampleHeight);
  const rowIsBar = (y: number) => {
    let count = 0;
    const row = y * sampleWidth * 4;
    for (let x = 0; x < sampleWidth; x++) {
      const i = row + x * 4;
      if (isStudioLetterboxPixel(data[i], data[i + 1], data[i + 2], data[i + 3])) count++;
    }
    return count / sampleWidth >= 0.92;
  };
  const colIsBar = (x: number) => {
    let count = 0;
    for (let y = 0; y < sampleHeight; y++) {
      const i = (y * sampleWidth + x) * 4;
      if (isStudioLetterboxPixel(data[i], data[i + 1], data[i + 2], data[i + 3])) count++;
    }
    return count / sampleHeight >= 0.92;
  };
  let top = 0;
  let bottom = sampleHeight;
  let left = 0;
  let right = sampleWidth;
  while (top < bottom && rowIsBar(top)) top++;
  while (bottom > top && rowIsBar(bottom - 1)) bottom--;
  while (left < right && colIsBar(left)) left++;
  while (right > left && colIsBar(right - 1)) right--;
  const sampleW = right - left;
  const sampleH = bottom - top;
  if (sampleW < 8 || sampleH < 8) return { sx: 0, sy: 0, sw: width, sh: height };
  if (sampleW * sampleH < sampleWidth * sampleHeight * 0.5) {
    return { sx: 0, sy: 0, sw: width, sh: height };
  }
  const sx = Math.round(left / sampleScale);
  const sy = Math.round(top / sampleScale);
  return {
    sx,
    sy,
    sw: Math.min(width - sx, Math.round(sampleW / sampleScale)),
    sh: Math.min(height - sy, Math.round(sampleH / sampleScale)),
  };
}

/**
 * Art Palette strokes start as a temporary data URL so the editor can update
 * instantly. Flatten image-drop strokes into the actual upload before leaving
 * Drop Studio; Board storage intentionally removes large inline data URLs.
 *
 * The studio monitor is object-fit: cover. Map the overlay onto that same
 * cover crop so the published Vision Drop is edge-to-edge photo plus ink.
 */
async function flattenArtLayerIntoImage(file: File, artOverlayUrl: string): Promise<File> {
  const fileUrl = URL.createObjectURL(file);
  try {
    const [base, overlay] = await Promise.all([
      loadStudioImage(fileUrl),
      loadStudioImage(artOverlayUrl),
    ]);
    const overlayWidth = Math.max(1, overlay.naturalWidth || base.naturalWidth);
    const overlayHeight = Math.max(1, overlay.naturalHeight || base.naturalHeight);
    const crop = detectLetterboxCrop(base);
    const photoW = Math.max(1, crop.sw);
    const photoH = Math.max(1, crop.sh);

    const coverScale = Math.max(overlayWidth / photoW, overlayHeight / photoH);
    const visSx = Math.max(0, -(overlayWidth - photoW * coverScale) / 2 / coverScale);
    const visSy = Math.max(0, -(overlayHeight - photoH * coverScale) / 2 / coverScale);
    const visSw = Math.min(photoW - visSx, overlayWidth / coverScale);
    const visSh = Math.min(photoH - visSy, overlayHeight / coverScale);

    const maxEdge = 2048;
    const downscale = Math.min(1, maxEdge / Math.max(visSw, visSh));
    const outWidth = Math.max(1, Math.round(visSw * downscale));
    const outHeight = Math.max(1, Math.round(visSh * downscale));

    const canvas = document.createElement("canvas");
    canvas.width = outWidth;
    canvas.height = outHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The edited artwork could not be rendered.");

    context.drawImage(
      base,
      crop.sx + visSx,
      crop.sy + visSy,
      visSw,
      visSh,
      0,
      0,
      outWidth,
      outHeight
    );
    context.drawImage(overlay, 0, 0, overlayWidth, overlayHeight, 0, 0, outWidth, outHeight);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92)
    );
    if (!blob) throw new Error("The edited artwork could not be exported.");
    const baseName = file.name.replace(/\.[^.]+$/, "") || "board-art";
    return new File([blob], `${baseName}-art.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(fileUrl);
  }
}

type DropbookShelfSlot =
  | {
      id: string;
      kind: "cover";
      empty: boolean;
      label: string;
      previewUrl?: string;
      bookColor: string;
      complete: boolean;
    }
  | {
      id: string;
      kind: "page";
      empty: false;
      label?: string;
      previewUrl?: string;
      mode?: CaptureMode;
      descriptTitle?: string;
      descriptPreview?: string;
      linkKind?: DropbookLinkKind;
    }
  | {
      id: string;
      kind: "placeholder";
      empty: true;
    };

const DEFAULT_CAPTURE_MODES: CaptureMode[] = ["photo", "video"];
// Every mode shows in the rail; media modes not allowed for this drop are locked.
// Descript (the document editor) is always available — it produces a document,
// not a media file, so it isn't gated by a drop's allowed media types.
const ALL_STUDIO_MODES: CaptureMode[] = ["photo", "video", "audio", "art", "descript"];

function preferredVideoMime() {
  if (typeof MediaRecorder === "undefined") return "";
  return (
    [
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ].find((t) => MediaRecorder.isTypeSupported(t)) ?? ""
  );
}
function extForMime(type: string) {
  if (type.includes("mp4")) return "mp4";
  if (type.includes("webm")) return "webm";
  return "mov";
}

function preferredAudioMime() {
  if (typeof MediaRecorder === "undefined") return "";
  return (
    [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg",
    ].find((t) => MediaRecorder.isTypeSupported(t)) ?? ""
  );
}

function audioExtForMime(type: string) {
  if (type.includes("mp4")) return "m4a";
  if (type.includes("ogg")) return "ogg";
  return "webm";
}

function modeLabel(mode: CaptureMode) {
  if (mode === "audio") return "Voice";
  if (mode === "video") return "Video";
  if (mode === "art") return "Art";
  if (mode === "descript") return "Descript";
  return "Vision";
}

function modeGlyph(mode: CaptureMode) {
  if (mode === "audio") return "🎙️";
  if (mode === "video") return "🎬";
  if (mode === "art") return "🎨";
  if (mode === "descript") return "📝";
  return "👁️";
}

export default function DropStudioStage({
  open,
  initialFile,
  value,
  onChange,
  onComplete,
  onDescriptComplete,
  onLinkComplete,
  onClose,
  studioDraftRef,
  allowedModes = DEFAULT_CAPTURE_MODES,
  initialMode = "photo",
  descriptDestination = "doc",
  initialDescriptDoc = null,
  descriptReturnOnBack = false,
  descriptOnReturn,
}: {
  open: boolean;
  initialFile: File | null;
  value: DropCustomization;
  onChange: (next: DropCustomization) => void;
  onComplete: (file: File, source: "capture" | "upload") => void | Promise<void>;
  onDescriptComplete?: (doc: DescriptDoc) => void | Promise<void>;
  /** Standalone YouTube / music / web Link Drop — not a Dropbook page. */
  onLinkComplete?: (link: ResolvedDropbookLink) => void | Promise<void>;
  onClose: () => void;
  /** Live studio customizations (frame/rotation/etc.) without parent re-renders. */
  studioDraftRef?: React.MutableRefObject<DropCustomization | undefined>;
  allowedModes?: CaptureMode[];
  initialMode?: CaptureMode;
  /** Drop type already chosen in Drop Console — Descript shares back into it. */
  descriptDestination?: DescriptDestination;
  /** Existing Descript content when editing a published Descript drop. */
  initialDescriptDoc?: DescriptDoc | null;
  /** Return from Descript directly to the host Board surface. */
  descriptReturnOnBack?: boolean;
  descriptOnReturn?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileRef = useRef<File | null>(null);
  const urlRef = useRef<string>("");

  const [phase, setPhase] = useState<Phase>("choose");
  const [mode, setMode] = useState<CaptureMode>(initialMode);
  const [facing, setFacing] = useState<FacingMode>("environment");
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaKind, setMediaKind] = useState<"image" | "video" | "audio">("image");
  /** Bumped whenever fileRef changes so preview blob URLs stay in sync (incl. Strict Mode). */
  const [mediaFileTick, setMediaFileTick] = useState(0);
  const [source, setSource] = useState<"capture" | "upload">("capture");
  // Draw-on-photo: reuse the Art canvas seeded with the current image.
  const [drawOpen, setDrawOpen] = useState(false);
  // Save feature: device download, Drafts, and auto-save on capture.
  const draftIdRef = useRef<string>("");
  const previewErrorRetriesRef = useRef(0);
  const wasStudioOpenRef = useRef(false);
  const dropbookPageSeqRef = useRef(0);
  const dropbookPageFilesRef = useRef<Map<string, File>>(new Map());
  const dropbookPageDocsRef = useRef<Map<string, DescriptDoc>>(new Map());
  const editingDropbookPageIdRef = useRef<string | null>(null);
  const [dropbookEditingDescriptDoc, setDropbookEditingDescriptDoc] = useState<DescriptDoc | null>(
    null
  );
  const [saveNote, setSaveNote] = useState("");
  const saveNoteTimerRef = useRef<number | null>(null);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [isDropbookMode, setIsDropbookMode] = useState(false);
  const [dropbookCreating, setDropbookCreating] = useState(false);
  const [dropbookIntroPhase, setDropbookIntroPhase] = useState<"splash" | "workspace" | null>(
    null
  );
  const [dropbookCover, setDropbookCover] = useState<DropbookCover | null>(null);
  const [dropbookPages, setDropbookPages] = useState<DropbookChip[]>([]);
  const [dropbookEditingCover, setDropbookEditingCover] = useState(false);
  const [dropbookCoverMode, setDropbookCoverMode] = useState<"choose" | "blank">("choose");
  const [dropbookCoverBlankColor, setDropbookCoverBlankColor] = useState("#000000");
  const [dropbookCoverPhotoUrl, setDropbookCoverPhotoUrl] = useState<string | null>(null);
  const [coverBlankBackgroundUrl, setCoverBlankBackgroundUrl] = useState("");
  const [dropbookCoverDragOver, setDropbookCoverDragOver] = useState(false);
  const dropbookCoverPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [finishingDropbook, setFinishingDropbook] = useState(false);
  const [dropbookLinkDraft, setDropbookLinkDraft] = useState("");
  const [dropbookLinkBusy, setDropbookLinkBusy] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [voicePreset, setVoicePreset] = useState<VoicePresetKey>("clean");
  const [processingVocal, setProcessingVocal] = useState(false);
  const [voiceStudioOpen, setVoiceStudioOpen] = useState(false);
  const [audioSession, setAudioSession] = useState<AudioSession | null>(null);
  const [studioHeadphonesOk, setStudioHeadphonesOk] = useState(false);
  const [studioLatencyMs, setStudioLatencyMs] = useState(0);
  const [studioPlaying, setStudioPlaying] = useState(false);
  const [studioCountIn, setStudioCountIn] = useState<number | null>(null);
  const [studioMicStream, setStudioMicStream] = useState<MediaStream | null>(null);
  const [studioLaneAnalysers, setStudioLaneAnalysers] = useState<
    Partial<Record<"vocal" | "instrumental" | "audio" | "fx" | "adlib", AnalyserNode>>
  >({});
  const [studioRecordElapsedMs, setStudioRecordElapsedMs] = useState(0);
  const [adlibRecording, setAdlibRecording] = useState(false);
  const [presetPreviewing, setPresetPreviewing] = useState(false);
  const [sessionHistory, setSessionHistory] = useState<SessionHistory>(() => createSessionHistory());
  const studioEngineRef = useRef<AudioSessionEngine | null>(null);
  const studioTakeRef = useRef<StudioTakeCapture | null>(null);
  const adlibTakeRef = useRef<StudioTakeCapture | null>(null);
  const studioRecordGenRef = useRef(0);
  const adlibRecordGenRef = useRef(0);
  const studioCountInTimerRef = useRef<number[]>([]);
  const studioRecordStartedAtRef = useRef(0);
  const studioLoopRef = useRef(false);
  const audioSessionRef = useRef<AudioSession | null>(null);
  const sessionHistoryRef = useRef<SessionHistory>(createSessionHistory());
  const [studioValue, setStudioValue] = useState<DropCustomization>(value);

  const studioFrame = studioValue.effects?.frame;
  const captureMediaFrame = useMemo(
    () => resolveDropMediaFrame(studioValue),
    [studioFrame]
  );
  const editingFlattenedArtwork =
    mediaKind === "image" &&
    /^board-art-/i.test(fileRef.current?.name ?? "") &&
    !studioValue.artOverlayUrl;

  const writeStudioDraft = useCallback(
    (next: DropCustomization) => {
      const compacted = compactDropCustomizations(next) ?? {};
      if (studioDraftRef) studioDraftRef.current = compacted;
      return compacted;
    },
    [studioDraftRef]
  );

  const flushStudioValue = useCallback(() => {
    const compacted = writeStudioDraft(studioValue);
    onChange(compacted);
  }, [onChange, studioValue, writeStudioDraft]);

  const handleStudioChange = useCallback(
    (next: DropCustomization) => {
      const compacted = writeStudioDraft(next);
      // Local only — pushing every rotate/frame toggle to the parent re-renders
      // the full edit modal and freezes the studio.
      setStudioValue(compacted);
    },
    [writeStudioDraft]
  );

  const persistVoiceProjectRef = useRef<() => void>(() => {});
  const lastSavedVoiceSignatureRef = useRef("");
  const wasVoiceStudioOpenRef = useRef(false);
  const [voiceAutoSaveAt, setVoiceAutoSaveAt] = useState(0);
  const [voiceAutoSaving, setVoiceAutoSaving] = useState(false);

  const handleClose = useCallback(() => {
    persistVoiceProjectRef.current();
    flushStudioValue();
    onClose();
  }, [flushStudioValue, onClose]);

  const voiceSessionActive =
    voiceStudioOpen ||
    Boolean(audioSession) ||
    recording ||
    adlibRecording ||
    processingVocal;

  const flashSaveNote = useCallback((message: string) => {
    setSaveNote(message);
    if (saveNoteTimerRef.current) window.clearTimeout(saveNoteTimerRef.current);
    saveNoteTimerRef.current = window.setTimeout(() => setSaveNote(""), 2600);
  }, []);

  useEffect(() => {
    audioSessionRef.current = audioSession;
    studioLoopRef.current = Boolean(audioSession?.loop);
  }, [audioSession]);

  useEffect(() => {
    sessionHistoryRef.current = sessionHistory;
  }, [sessionHistory]);

  const pushSessionEdit = useCallback((mutator: (session: AudioSession) => AudioSession) => {
    setAudioSession((current) => {
      if (!current) return current;
      const nextHistory = pushHistory(sessionHistoryRef.current, current);
      sessionHistoryRef.current = nextHistory;
      setSessionHistory(nextHistory);
      const next = mutator(current);
      audioSessionRef.current = next;
      return next;
    });
  }, []);

  const haltStudioTransport = () => {
    studioCountInTimerRef.current.forEach((id) => window.clearTimeout(id));
    studioCountInTimerRef.current = [];
    setStudioCountIn(null);
    studioEngineRef.current?.stop();
    setStudioPlaying(false);
    setStudioLaneAnalysers({});
  };

  const studioEngine = () => {
    if (!studioEngineRef.current) {
      const engine = new AudioSessionEngine();
      engine.setEndedHandler(() => {
        if (studioLoopRef.current) {
          const session = audioSessionRef.current;
          if (session) {
            void (async () => {
              try {
                const from = session.loop?.inMs ?? 0;
                const analysers = await engine.play(session, from);
                setStudioLaneAnalysers(analysers);
                setStudioPlaying(true);
                setAudioSession((current) =>
                  current ? { ...current, playheadMs: from } : current
                );
              } catch {
                setStudioPlaying(false);
                setStudioLaneAnalysers({});
              }
            })();
            return;
          }
        }
        setStudioPlaying(false);
        // Keep the live mic meter if a take is still armed after the beat ends.
        const vocal = studioTakeRef.current?.analyser;
        setStudioLaneAnalysers(vocal ? { vocal } : {});
        setAudioSession((current) => {
          if (!current) return current;
          const end = sessionDurationMs(current);
          return { ...current, playheadMs: end };
        });
      });
      studioEngineRef.current = engine;
    }
    return studioEngineRef.current;
  };

  const openVoiceStudio = useCallback(() => {
    setError("");
    setStudioLatencyMs(readStudioLatencyMs());
    setAudioSession((current) => {
      let next = current ?? createAudioSession();
      const vocal = fileRef.current;
      if (vocal?.type.startsWith("audio/")) {
        next = upsertLaneFromFile(next, "vocal", vocal, {
          mix: { preset: voicePreset },
          latencyMs: readStudioLatencyMs(),
        });
      }
      return next;
    });
    setVoiceStudioOpen(true);
    void (async () => {
      const restored = await loadLatestVoiceStudioProject();
      if (!restored) return;
      let didRestore = false;
      setAudioSession((current) => {
        if (sessionHasClips(current)) return current;
        didRestore = true;
        draftIdRef.current = restored.draftId;
        rememberActiveVoiceStudioDraft(restored.draftId);
        return restored.session;
      });
      if (!didRestore) return;
      lastSavedVoiceSignatureRef.current = voiceStudioEditSignature(restored.session);
      setVoiceAutoSaveAt(Date.now());
      flashSaveNote("Voice Studio project restored");
    })();
  }, [flashSaveNote, voicePreset]);

  const collapseVoiceStudio = useCallback(() => {
    if (audioSession && sessionHasLane(audioSession, "instrumental")) {
      flashSaveNote("Keep Studio open to mix the instrumental.");
      return;
    }
    persistVoiceProjectRef.current();
    haltStudioTransport();
    setVoiceStudioOpen(false);
  }, [audioSession, flashSaveNote]);

  const removeStudioLane = useCallback(
    (kind: LaneKind) => {
      if (kind !== "vocal" && kind !== "instrumental") return;
      haltStudioTransport();
      setAudioSession((current) => (current ? removeLane(current, kind) : current));
      if (kind === "vocal") {
        const vocal = fileRef.current;
        if (vocal?.type.startsWith("audio/")) {
          fileRef.current = null;
          setMediaUrl("");
          urlRef.current = "";
          setMediaFileTick((tick) => tick + 1);
        }
        flashSaveNote("Vocal removed");
      } else {
        flashSaveNote("Instrumental removed");
      }
    },
    [flashSaveNote]
  );

  const setStudioInstrumental = useCallback((file: File) => {
    setError("");
    setAudioSession((current) => {
      const next = upsertLaneFromFile(current ?? createAudioSession(), "instrumental", file);
      audioSessionRef.current = next;
      return next;
    });
    flashSaveNote("Instrumental loaded — tap + on Vocals or Record to sing over it");
    persistVoiceProjectRef.current();
    void (async () => {
      try {
        const Constructor = getAudioContextConstructor();
        if (!Constructor) return;
        const ctx = new Constructor();
        const decoded = await decodeAudioFile(file, ctx);
        await ctx.close().catch(() => undefined);
        setAudioSession((current) => {
          if (!current) return current;
          return {
            ...current,
            tracks: current.tracks.map((track) => {
              if (track.kind !== "instrumental") return track;
              return {
                ...track,
                clips: track.clips.map((clip) =>
                  clip.file === file || clip.file.name === file.name
                    ? { ...clip, decoded }
                    : clip
                ),
              };
            }),
          };
        });
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Couldn't read that instrumental. Try WAV/MP3."
        );
      }
    })();
  }, [flashSaveNote]);

  const playStudioSession = useCallback(async () => {
    if (!audioSession) return;
    setError("");
    try {
      const fromMs = audioSession.playheadMs || 0;
      const analysers = await studioEngine().play(audioSession, fromMs);
      setStudioLaneAnalysers(analysers);
      setStudioPlaying(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Couldn't play this session.");
      setStudioLaneAnalysers({});
      setStudioPlaying(false);
    }
  }, [audioSession]);

  // Visible record timer while a vocal or ad-lib take is armed.
  useEffect(() => {
    if (!recording && !adlibRecording) {
      setStudioRecordElapsedMs(0);
      studioRecordStartedAtRef.current = 0;
      return;
    }
    studioRecordStartedAtRef.current = performance.now();
    const tick = window.setInterval(() => {
      setStudioRecordElapsedMs(performance.now() - studioRecordStartedAtRef.current);
    }, 200);
    return () => window.clearInterval(tick);
  }, [recording, adlibRecording]);

  // Keep timeline playhead synced during live playback.
  useEffect(() => {
    if (!studioPlaying || recording || adlibRecording) return;
    let frame = 0;
    const tick = () => {
      const engine = studioEngineRef.current;
      if (engine?.isPlaying) {
        const ms = engine.getPlayheadMs();
        setAudioSession((current) =>
          current && Math.abs(current.playheadMs - ms) > 30
            ? { ...current, playheadMs: ms }
            : current
        );
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [studioPlaying, recording, adlibRecording]);

  const commitAdlibTake = useCallback(
    (take: StudioTakeCapture, generation: number) => {
      if (generation !== adlibRecordGenRef.current) return;
      const blob = take.stop();
      const peak = take.peakLevel();
      take.dispose();
      if (adlibTakeRef.current === take) adlibTakeRef.current = null;
      setAdlibRecording(false);
      setStudioMicStream(null);

      if (!blob.size || peak < 0.0008) {
        setError(
          peak < 0.0008
            ? "Ad-lib mic was silent — check permissions, then try again."
            : "That ad-lib take was empty — try again."
        );
        return;
      }

      const file = new File([blob], `studio-adlib-${Date.now()}.wav`, { type: "audio/wav" });
      const offsetMs = audioSessionRef.current?.playheadMs ?? 0;
      pushSessionEdit((current) =>
        upsertLaneFromFile(current, "adlib", file, {
          offsetMs,
          name: `Ad-Lib ${(current.tracks.filter((t) => t.kind === "adlib").length || 0) + 1}`,
        })
      );
      flashSaveNote("Ad-lib lane added");
      persistVoiceProjectRef.current();
    },
    [flashSaveNote, pushSessionEdit]
  );

  const startAdlibRecord = useCallback(async () => {
    if (recording) {
      flashSaveNote("Stop the vocal take before recording an ad-lib.");
      return;
    }
    adlibRecordGenRef.current += 1;
    const generation = adlibRecordGenRef.current;
    haltStudioTransport();
    adlibTakeRef.current?.dispose();
    adlibTakeRef.current = null;
    setError("");
    try {
      const stream = await getMusicMicStream();
      if (generation !== adlibRecordGenRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const ctx = await studioEngine().ensureContext();
      const take = createStudioTakeCapture(ctx, stream);
      adlibTakeRef.current = take;
      setStudioMicStream(stream);
      take.start();
      setStudioLaneAnalysers({ vocal: take.analyser });
      setAdlibRecording(true);
    } catch {
      adlibTakeRef.current?.dispose();
      adlibTakeRef.current = null;
      setAdlibRecording(false);
      setError("Microphone blocked. Allow access to record an ad-lib.");
    }
  }, [flashSaveNote, recording]);

  const stopAdlibRecord = useCallback(() => {
    const take = adlibTakeRef.current;
    const generation = adlibRecordGenRef.current;
    if (take?.isRecording()) {
      commitAdlibTake(take, generation);
      return;
    }
    adlibRecordGenRef.current += 1;
    adlibTakeRef.current?.dispose();
    adlibTakeRef.current = null;
    setAdlibRecording(false);
    setStudioMicStream(null);
  }, [commitAdlibTake]);

  const previewAdlibTrack = useCallback(
    async (trackId: string) => {
      const session = audioSession;
      if (!session) return;
      const track = session.tracks.find((item) => item.id === trackId);
      if (!track?.clips.length) return;
      haltStudioTransport();
      try {
        const soloSession: AudioSession = {
          ...session,
          playheadMs: track.clips[0]?.offsetMs ?? 0,
          tracks: session.tracks.map((item) =>
            item.id === trackId
              ? { ...item, mix: { ...item.mix, muted: false, solo: true } }
              : { ...item, mix: { ...item.mix, solo: false } }
          ),
        };
        const analysers = await studioEngine().play(soloSession, soloSession.playheadMs);
        setStudioLaneAnalysers(analysers);
        setStudioPlaying(true);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Couldn't preview that ad-lib.");
      }
    },
    [audioSession]
  );

  const previewVocalPreset = useCallback(async () => {
    const session = audioSession;
    const vocal = session?.tracks.find((track) => track.kind === "vocal");
    const file = vocal?.clips[0]?.file ?? fileRef.current;
    if (!file?.type.startsWith("audio/")) {
      flashSaveNote("Record a vocal before previewing Voice.");
      return;
    }
    setPresetPreviewing(true);
    try {
      const presetRaw = vocal?.mix.preset;
      const preset: VoicePresetKey =
        !presetRaw || presetRaw === "none" ? voicePreset : presetRaw;
      const previewFile = await renderVoicePresetFile(file, preset);
      const url = URL.createObjectURL(previewFile);
      const audio = new Audio(url);
      await audio.play();
      audio.onended = () => URL.revokeObjectURL(url);
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      flashSaveNote(`Previewing ${preset}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Couldn't preview that preset.");
    } finally {
      setPresetPreviewing(false);
    }
  }, [audioSession, flashSaveNote, voicePreset]);

  const commitStudioTake = useCallback(
    (take: StudioTakeCapture, session: AudioSession, hasBeat: boolean, generation: number) => {
      if (generation !== studioRecordGenRef.current) return;
      studioEngine().stop();
      setStudioPlaying(false);
      setStudioLaneAnalysers({});
      setStudioCountIn(null);

      const blob = take.stop();
      const peak = take.peakLevel();
      take.dispose();
      if (studioTakeRef.current === take) studioTakeRef.current = null;
      streamRef.current = null;
      recorderRef.current = null;
      setStudioMicStream(null);
      setRecording(false);

      if (!blob.size || peak < 0.0008) {
        setError(
          peak < 0.0008
            ? "Mic was silent — check permissions / input device, then try again."
            : "That take was empty — try recording again."
        );
        return;
      }

      const file = new File(
        [blob],
        `studio-vocal-${Date.now()}.wav`,
        { type: "audio/wav" }
      );
      fileRef.current = file;
      setMediaKind("audio");
      setSource("capture");
      setPhase("edit");
      setAudioSession((current) => {
        const next = upsertLaneFromFile(current ?? session, "vocal", file, {
          offsetMs: 0,
          latencyMs: studioLatencyMs,
          mix: { preset: voicePreset },
        });
        audioSessionRef.current = next;
        return next;
      });
      syncMediaPreview();
      flashSaveNote(hasBeat ? "Vocal locked to the beat · auto-saved" : "Vocal take ready · auto-saved");
      persistVoiceProjectRef.current();
    },
    [flashSaveNote, studioLatencyMs, voicePreset]
  );

  const startStudioVocal = useCallback(async () => {
    const session = audioSession ?? createAudioSession();
    const hasBeat = sessionHasLane(session, "instrumental");

    studioRecordGenRef.current += 1;
    const generation = studioRecordGenRef.current;
    haltStudioTransport();
    studioTakeRef.current?.dispose();
    studioTakeRef.current = null;
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStudioMicStream(null);
    setError("");
    setRecording(false);

    try {
      const stream = await getMusicMicStream();
      if (generation !== studioRecordGenRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      // Same AudioContext as the beat. PCM ScriptProcessor capture (not MediaRecorder)
      // so Chromium keeps writing mic samples while the instrumental plays.
      const ctx = await studioEngine().ensureContext();
      if (generation !== studioRecordGenRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const take = createStudioTakeCapture(ctx, stream);
      studioTakeRef.current = take;
      streamRef.current = stream;
      setStudioMicStream(stream);
      take.start();

      if (hasBeat) {
        if (!audioSession) setAudioSession(session);
        const analysers = await studioEngine().playBacking(session, 0);
        if (generation !== studioRecordGenRef.current) {
          take.dispose();
          studioTakeRef.current = null;
          setStudioMicStream(null);
          return;
        }
        if (!take.isRecording()) {
          studioEngine().stop();
          take.dispose();
          studioTakeRef.current = null;
          setStudioMicStream(null);
          setError("Vocal recorder stopped when the beat started. Try again.");
          return;
        }
        setStudioLaneAnalysers({ ...analysers, vocal: take.analyser });
        setStudioPlaying(true);
        setRecording(true);
        setStudioCountIn(3);
        studioCountInTimerRef.current = [2, 1, 0].map((value, index) =>
          window.setTimeout(() => {
            if (generation !== studioRecordGenRef.current) return;
            if (value > 0) setStudioCountIn(value);
            else setStudioCountIn(null);
          }, (index + 1) * 1000)
        );
      } else {
        setStudioLaneAnalysers({ vocal: take.analyser });
        setRecording(true);
      }
    } catch {
      studioTakeRef.current?.dispose();
      studioTakeRef.current = null;
      setStudioMicStream(null);
      setError("Microphone blocked. Allow access, or upload a vocal instead.");
    }
  }, [audioSession]);

  const saveToDevice = useCallback(async () => {
    let file = fileRef.current;
    if (!file) return;
    if (file.type.startsWith("audio/")) {
      const originalFile = file;
      setProcessingVocal(true);
      try {
        if (audioSession && sessionHasLane(audioSession, "instrumental")) {
          file = await renderSessionFile({
            ...audioSession,
            tracks: audioSession.tracks.map((track) =>
              track.kind === "vocal"
                ? {
                    ...track,
                    latencyMs: studioLatencyMs,
                    mix: { ...track.mix, preset: voicePreset },
                  }
                : track
            ),
          });
        } else if (
          audioSession &&
          (sessionHasLane(audioSession, "adlib") || sessionHasLane(audioSession, "fx"))
        ) {
          file = await renderSessionFile(audioSession);
        } else {
          file = await renderVoicePresetFile(file, voicePreset);
        }
      } catch (error) {
        console.error("[DropStudioStage] vocal download enhancement failed", error);
        file = originalFile;
        flashSaveNote("Mix timed out — saving the original voice.");
      } finally {
        setProcessingVocal(false);
      }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name || "drop-studio-media";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    flashSaveNote("Saved to your device ⬇");
  }, [audioSession, flashSaveNote, studioLatencyMs, voicePreset]);

  const saveToDrafts = useCallback(
    async (auto = false, quiet = false) => {
      const session = audioSessionRef.current;
      const file =
        fileRef.current ??
        session?.tracks.flatMap((track) => track.clips).find((clip) => clip.file)?.file;
      if (!file && !sessionHasClips(session)) return false;
      if (!draftIdRef.current) {
        draftIdRef.current = `draft_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
      }
      if (!quiet) setVoiceAutoSaving(true);
      else if (auto) setVoiceAutoSaving(true);
      let saved = false;
      if (file) {
        saved = Boolean(await saveDropDraft(file, draftIdRef.current));
      }
      let projectSaved = false;
      if (sessionHasClips(session) && session) {
        projectSaved = await saveVoiceStudioProject(draftIdRef.current, session);
      }
      if (projectSaved || (saved && !sessionHasClips(session))) {
        ensureVoiceStudioDraftCard(draftIdRef.current);
        rememberActiveVoiceStudioDraft(draftIdRef.current);
        lastSavedVoiceSignatureRef.current = voiceStudioEditSignature(session);
        setVoiceAutoSaveAt(Date.now());
      }
      setVoiceAutoSaving(false);
      if (auto) {
        if (!quiet && (projectSaved || (saved && !sessionHasClips(session)))) {
          flashSaveNote("Auto-saved to Drafts");
        } else if (!quiet && sessionHasClips(session) && !projectSaved) {
          flashSaveNote("Couldn't auto-save this song");
        }
        return projectSaved || saved;
      }
      flashSaveNote(
        projectSaved || saved
          ? "Saved to Drafts 🗂"
          : sessionHasClips(session)
            ? "Couldn't auto-save this song"
            : "Too large to save to Drafts"
      );
      return projectSaved || saved;
    },
    [flashSaveNote]
  );

  persistVoiceProjectRef.current = () => {
    if (!sessionHasClips(audioSessionRef.current)) return;
    void saveToDrafts(true, true);
  };

  useEffect(() => {
    if (!open) return;
    const persistVoiceProject = () => {
      if (!sessionHasClips(audioSessionRef.current)) return;
      void saveToDrafts(true, true);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") persistVoiceProject();
    };
    window.addEventListener("pagehide", persistVoiceProject);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", persistVoiceProject);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [open, saveToDrafts]);

  const voiceProjectSignature = voiceStudioEditSignature(audioSession);
  const voiceHasClips = sessionHasClips(audioSession);

  useEffect(() => {
    if (!open || !voiceStudioOpen || !voiceHasClips) return;
    if (voiceProjectSignature === lastSavedVoiceSignatureRef.current) return;
    const timer = window.setTimeout(() => {
      void saveToDrafts(true, true);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [open, voiceStudioOpen, voiceHasClips, voiceProjectSignature, saveToDrafts]);

  useEffect(() => {
    if (voiceStudioOpen) {
      wasVoiceStudioOpenRef.current = true;
      return;
    }
    if (wasVoiceStudioOpenRef.current) persistVoiceProjectRef.current();
    wasVoiceStudioOpenRef.current = false;
  }, [voiceStudioOpen]);

  const syncMediaPreview = useCallback(() => {
    previewErrorRetriesRef.current = 0;
    setMediaUrl("");
    urlRef.current = "";
    setMediaFileTick((tick) => tick + 1);
  }, []);

  const handleMediaPreviewError = useCallback(() => {
    if (previewErrorRetriesRef.current >= 2) return;
    previewErrorRetriesRef.current += 1;
    setMediaFileTick((tick) => tick + 1);
  }, []);

  const stopCamera = useCallback(() => {
    studioCountInTimerRef.current.forEach((id) => window.clearTimeout(id));
    studioCountInTimerRef.current = [];
    setStudioCountIn(null);
    studioEngineRef.current?.stop();
    setStudioPlaying(false);
    setStudioLaneAnalysers({});
    setStudioMicStream(null);
    studioTakeRef.current?.dispose();
    studioTakeRef.current = null;
    if (recorderRef.current?.state === "recording") {
      try {
        recorderRef.current.stop();
      } catch {
        // already stopped
      }
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setRecording(false);
  }, []);

  useEffect(() => {
    return () => {
      studioTakeRef.current?.dispose();
      studioTakeRef.current = null;
      adlibTakeRef.current?.dispose();
      adlibTakeRef.current = null;
      studioEngineRef.current?.dispose();
      studioEngineRef.current = null;
    };
  }, []);

  // Reopen a saved draft straight into the editor.
  const openDraft = useCallback(
    (draft: DropDraft) => {
      const file = draftToFile(draft);
      if (!file) return;
      fileRef.current = file;
      setMediaKind(draft.kind);
      setSource("upload");
      draftIdRef.current = draft.id; // re-saving updates this same draft
      stopCamera();
      setPhase("edit");
      setDraftsOpen(false);
      syncMediaPreview();
      if (draft.kind === "audio") {
        void (async () => {
          const project = await loadVoiceStudioProject(draft.id);
          if (project) {
            setAudioSession(project);
            setSessionHistory(createSessionHistory());
            setVoiceStudioOpen(true);
            const vocal = project.tracks.find((track) => track.kind === "vocal");
            const preset = vocal?.mix.preset;
            if (preset && preset !== "none") setVoicePreset(preset);
            flashSaveNote("Voice Studio project restored");
            rememberActiveVoiceStudioDraft(draft.id);
            lastSavedVoiceSignatureRef.current = voiceStudioEditSignature(project);
            setVoiceAutoSaveAt(Date.now());
            return;
          }
          setAudioSession(
            upsertLaneFromFile(createAudioSession(), "vocal", file, {
              mix: { preset: voicePreset },
            })
          );
        })();
      }
    },
    [flashSaveNote, stopCamera, syncMediaPreview, voicePreset]
  );

  const startCamera = useCallback(
    async (nextFacing: FacingMode) => {
      stopCamera();
      setError("");
      if (mode === "audio" || mode === "art" || mode === "descript") return;
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Camera unavailable here — upload a Vision instead.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: mode === "video",
          video: {
            facingMode: { ideal: nextFacing },
            width: { ideal: 1080 },
            height: { ideal: 1350 },
            aspectRatio: { ideal: 4 / 5 },
          },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        setError("Camera blocked. Allow access, or upload a Vision instead.");
      }
    },
    [mode, stopCamera]
  );

  // Stable primitive key so the lifecycle effect below doesn't re-run (and reset
  // the phase back to Capture) every time the parent re-renders with a fresh
  // `allowedModes` array literal — e.g. while editing stickers/text.
  const allowedModesKey = allowedModes.join("|");

  // Open/close lifecycle: lock scroll, choose starting phase.
  // Dropbook state resets only on a fresh open — not when the parent re-renders
  // while a Dropbook build session is already in progress.
  useEffect(() => {
    if (!open) {
      wasStudioOpenRef.current = false;
      stopCamera();
      document.body.style.overflow = "";
      return;
    }

    const freshOpen = !wasStudioOpenRef.current;
    wasStudioOpenRef.current = true;
    document.body.style.overflow = "hidden";

    if (!freshOpen) return;

    const initialStudio = compactDropCustomizations(value) ?? {};
    setStudioValue(initialStudio);
    writeStudioDraft(initialStudio);
    setDrawOpen(false);
    setVoicePreset("clean");
    setProcessingVocal(false);
    setVoiceStudioOpen(false);
    setAudioSession(null);
    setStudioHeadphonesOk(false);
    setStudioPlaying(false);
    setStudioCountIn(null);
    studioEngineRef.current?.dispose();
    studioEngineRef.current = null;
    setIsDropbookMode(false);
    setDropbookCreating(false);
    setDropbookIntroPhase(null);
    setDropbookEditingCover(false);
    setDropbookCoverMode("choose");
    setFinishingDropbook(false);
    dropbookPageSeqRef.current = 0;
    dropbookPageFilesRef.current.clear();
    dropbookPageDocsRef.current.clear();
    editingDropbookPageIdRef.current = null;
    setDropbookEditingDescriptDoc(null);
    setDropbookCover((prev) => {
      if (prev?.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    setDropbookPages((prev) => {
      prev.forEach((chip) => {
        if (chip.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(chip.previewUrl);
      });
      return [];
    });
    const safeMode =
      initialMode === "descript" || allowedModes.includes(initialMode)
        ? initialMode
        : allowedModes[0] ?? "photo";
    setMode(safeMode);
    if (initialFile) {
      fileRef.current = initialFile;
      setMediaKind(
        initialFile.type.startsWith("audio/")
          ? "audio"
          : initialFile.type.startsWith("video/")
            ? "video"
            : "image"
      );
      setSource("upload");
      setPhase("edit");
      syncMediaPreview();
    } else {
      fileRef.current = null;
      setPhase("choose");
    }
    return () => {
      document.body.style.overflow = "";
    };
    // allowedModes is intentionally tracked via the stable allowedModesKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFile, stopCamera, allowedModesKey, initialMode, syncMediaPreview]);

  // Run the live camera only while in capture phase for camera modes.
  useEffect(() => {
    if (
      !open ||
      phase !== "capture" ||
      mode === "audio" ||
      mode === "art" ||
      mode === "descript"
    )
      return;
    void startCamera(facing);
    return stopCamera;
  }, [open, phase, facing, mode, startCamera, stopCamera]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (recording || adlibRecording || processingVocal || voiceStudioOpen || audioSession) {
        e.preventDefault();
        e.stopPropagation();
        if (recording || adlibRecording || processingVocal) {
          flashSaveNote("Finish this take first.");
        }
        return;
      }
      handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    open,
    handleClose,
    recording,
    adlibRecording,
    processingVocal,
    voiceStudioOpen,
    audioSession,
    flashSaveNote,
  ]);

  const selectDropbookChip = useCallback(
    (chipId: string) => {
      const chip = dropbookPages.find((page) => page.id === chipId);
      if (!chip) {
        flashSaveNote("Couldn't open this drop page");
        return;
      }

      if (chip.linkKind && chip.linkUrl) {
        flashSaveNote(
          chip.linkKind === "youtube"
            ? "YouTube page locked in this Dropbook"
            : chip.linkKind === "music"
              ? "Music page locked in this Dropbook"
              : "Link page locked in this Dropbook"
        );
        return;
      }

      if (chip.mode === "descript") {
        const doc = dropbookPageDocsRef.current.get(chipId);
        if (!doc) {
          flashSaveNote("Couldn't open this Descript page");
          return;
        }
        editingDropbookPageIdRef.current = chipId;
        setDropbookEditingDescriptDoc(doc);
        setMode("descript");
        setDropbookEditingCover(false);
        setDropbookCoverMode("choose");
        setDropbookCreating(true);
        return;
      }

      const file = dropbookPageFilesRef.current.get(chipId);
      if (!file) {
        flashSaveNote("Couldn't open this drop page");
        return;
      }
      setDropbookEditingDescriptDoc(null);
      fileRef.current = file;
      setMediaKind(
        file.type.startsWith("audio")
          ? "audio"
          : file.type.startsWith("video")
            ? "video"
            : "image"
      );
      setSource("capture");
      setDrawOpen(false);
      setAudioPlaying(false);
      stopCamera();
      setPhase("edit");
      syncMediaPreview();
      if (chip.mode && allowedModes.includes(chip.mode)) setMode(chip.mode);
      editingDropbookPageIdRef.current = chipId;
      setDropbookEditingCover(false);
      setDropbookCoverMode("choose");
      setDropbookCreating(true);
    },
    [dropbookPages, allowedModes, stopCamera, flashSaveNote, syncMediaPreview]
  );

  const resetCreationSurface = useCallback(() => {
    fileRef.current = null;
    urlRef.current = "";
    setMediaUrl("");
    setDrawOpen(false);
    setAudioPlaying(false);
    setPhase("choose");
    setVoiceStudioOpen(false);
    stopCamera();
    draftIdRef.current = "";
    syncMediaPreview();
  }, [stopCamera, syncMediaPreview]);

  const pickBookColor = useCallback((color: string) => {
    setDropbookCoverBlankColor(color);
    setDropbookCover((prev) => (prev ? { ...prev, bookColor: color, bookColorSet: true } : prev));
  }, []);

  const clearDropbookCoverPhoto = useCallback(() => {
    setDropbookCoverPhotoUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const onDropbookCoverPhoto = useCallback((file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) {
      flashSaveNote("Choose an image for the cover.");
      return;
    }
    setDropbookCoverPhotoUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    flashSaveNote("Picture embedded on cover");
  }, [flashSaveNote]);

  useEffect(() => {
    let alive = true;
    void composeCoverBackground(dropbookCoverBlankColor, dropbookCoverPhotoUrl).then((url) => {
      if (alive) setCoverBlankBackgroundUrl(url);
    });
    return () => {
      alive = false;
    };
  }, [dropbookCoverBlankColor, dropbookCoverPhotoUrl]);

  const appendDropbookPage = useCallback(
    (
      chip: Omit<DropbookChip, "id"> & { id?: string },
      file?: File | null,
      doc?: DescriptDoc | null
    ) => {
      setDropbookPages((prev) => {
        if (prev.length >= DROPBOOK_MAX_PAGES) return prev;
        const nextSeq = dropbookPageSeqRef.current + 1;
        dropbookPageSeqRef.current = nextSeq;
        const id = chip.id ?? `dropbook-page-${nextSeq}`;
        if (file) dropbookPageFilesRef.current.set(id, file);
        else dropbookPageFilesRef.current.delete(id);
        if (doc) dropbookPageDocsRef.current.set(id, doc);
        else dropbookPageDocsRef.current.delete(id);
        return [
          ...prev,
          {
            id,
            dropId: chip.dropId,
            mode: chip.mode,
            previewUrl: chip.previewUrl,
            label: chip.label,
            descriptDocId: chip.descriptDocId,
            descriptTitle: chip.descriptTitle,
            descriptPreview: chip.descriptPreview,
            linkKind: chip.linkKind,
            linkUrl: chip.linkUrl,
            linkEmbedUrl: chip.linkEmbedUrl,
            linkProvider: chip.linkProvider,
            linkDescription: chip.linkDescription,
          },
        ];
      });
    },
    []
  );

  const updateDropbookPage = useCallback(
    (
      chipId: string,
      chip: Pick<
        DropbookChip,
        | "mode"
        | "previewUrl"
        | "label"
        | "descriptDocId"
        | "descriptTitle"
        | "descriptPreview"
      >,
      file?: File | null,
      doc?: DescriptDoc | null
    ) => {
      setDropbookPages((prev) =>
        prev.map((page) => {
          if (page.id !== chipId) return page;
          if (page.previewUrl?.startsWith("blob:") && page.previewUrl !== chip.previewUrl) {
            URL.revokeObjectURL(page.previewUrl);
          }
          return {
            ...page,
            ...chip,
            previewUrl: chip.previewUrl,
            descriptDocId: chip.descriptDocId,
            descriptTitle: chip.descriptTitle,
            descriptPreview: chip.descriptPreview,
          };
        })
      );
      if (file) dropbookPageFilesRef.current.set(chipId, file);
      else dropbookPageFilesRef.current.delete(chipId);
      if (doc) dropbookPageDocsRef.current.set(chipId, doc);
      else dropbookPageDocsRef.current.delete(chipId);
    },
    []
  );

  const applyPageToCover = useCallback(
    (chipId: string) => {
      const chip = dropbookPages.find((page) => page.id === chipId);
      if (!chip || !dropbookCover) return;
      setDropbookCover((prev) => {
        if (!prev) return prev;
        if (prev.previewUrl?.startsWith("blob:") && prev.previewUrl !== chip.previewUrl) {
          URL.revokeObjectURL(prev.previewUrl);
        }
        return {
          ...prev,
          previewUrl: chip.previewUrl,
          complete: true,
          coverSource: "drop",
          sourceChipId: chip.id,
          mode: chip.mode,
        };
      });
      setDropbookEditingCover(false);
      setDropbookCoverMode("choose");
      flashSaveNote("Drop set as Dropbook cover ✦");
    },
    [dropbookCover, dropbookPages, flashSaveNote]
  );

  const commitCoverBlank = useCallback(
    (file: File) => {
      const previewUrl = URL.createObjectURL(file);
      setDropbookCover((prev) => {
        if (!prev) return prev;
        if (prev.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(prev.previewUrl);
        return {
          ...prev,
          previewUrl,
          complete: true,
          coverSource: "blank",
          bookColor: dropbookCoverBlankColor,
          bookColorSet: true,
        };
      });
      setDropbookCreating(false);
      setDropbookEditingCover(false);
      setDropbookCoverMode("choose");
      resetCreationSurface();
      flashSaveNote("Dropbook cover saved ✦");
    },
    [dropbookCoverBlankColor, flashSaveNote, resetCreationSurface]
  );

  const finishCoverFromField = useCallback(async () => {
    try {
      const background = await composeCoverBackground(
        dropbookCoverBlankColor,
        dropbookCoverPhotoUrl
      );
      if (!background) throw new Error("Cover background unavailable");
      commitCoverBlank(await coverDataUrlToFile(background));
    } catch {
      flashSaveNote("Couldn't finish this book cover. Try again.");
    }
  }, [
    commitCoverBlank,
    dropbookCoverBlankColor,
    dropbookCoverPhotoUrl,
    flashSaveNote,
  ]);

  const dropbookShelfSlots = useMemo((): DropbookShelfSlot[] => {
    if (!dropbookCover) return [];
    const coverSlot: DropbookShelfSlot = {
      id: dropbookCover.id,
      kind: "cover",
      empty: !dropbookCover.complete,
      label: "Cover",
      previewUrl: dropbookCover.previewUrl,
      bookColor: dropbookCover.bookColor,
      complete: dropbookCover.complete,
    };
    const pageSlots: DropbookShelfSlot[] = dropbookPages.map((chip) => ({
      id: chip.id,
      kind: "page" as const,
      empty: false as const,
      label: chip.label,
      previewUrl: chip.previewUrl,
      mode: chip.mode,
      descriptTitle: chip.descriptTitle,
      descriptPreview: chip.descriptPreview,
      linkKind: chip.linkKind,
    }));
    const shelfFull = dropbookPages.length >= DROPBOOK_MAX_PAGES;
    const placeholder: DropbookShelfSlot[] = shelfFull
      ? []
      : [{ id: "dropbook-empty-next", kind: "placeholder" as const, empty: true }];
    return [coverSlot, ...pageSlots, ...placeholder];
  }, [dropbookCover, dropbookPages]);

  const dropbookShelfFull = dropbookPages.length >= DROPBOOK_MAX_PAGES;

  const renderBookColorField = (className = "") => {
    const isWheel = className.includes("Wheel");
    return (
      <div className={`dropbookCoverColorRow ${className}`.trim()}>
        <span className="dropbookCoverColorLabel">Book cover color</span>
        <label
          className="dropbookCoverColorField"
          style={isWheel ? ({ "--book-color": dropbookCoverBlankColor } as CSSProperties) : undefined}
        >
          <input
            type="color"
            className="dropbookCoverColorPicker"
            value={/^#[0-9a-fA-F]{6}$/.test(dropbookCoverBlankColor) ? dropbookCoverBlankColor : "#000000"}
            aria-label="Choose book cover color"
            onChange={(event) => pickBookColor(event.currentTarget.value)}
          />
          {isWheel ? null : (
            <>
              <span className="dropbookCoverColorValue">{dropbookCoverBlankColor.toUpperCase()}</span>
              <span className="dropbookCoverColorChange">Change color</span>
            </>
          )}
        </label>
        {isWheel ? (
          <span className="dropbookCoverColorValue">{dropbookCoverBlankColor.toUpperCase()}</span>
        ) : null}
      </div>
    );
  };

  const renderCoverPhotoControls = () => (
    <div className="dropbookCoverPhotoRow">
      <input
        ref={dropbookCoverPhotoInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          onDropbookCoverPhoto(event.currentTarget.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      <button
        type="button"
        className="studioGhost dropbookCoverPhotoBtn"
        onClick={() => dropbookCoverPhotoInputRef.current?.click()}
      >
        {dropbookCoverPhotoUrl ? "Change picture" : "Add picture"}
      </button>
      {dropbookCoverPhotoUrl ? (
        <button type="button" className="studioGhost dropbookCoverPhotoBtn" onClick={clearDropbookCoverPhoto}>
          Remove picture
        </button>
      ) : null}
      <span className="dropbookCoverPhotoHint">Picture sits in the cover matte</span>
    </div>
  );

  useEffect(() => {
    if (!isDropbookMode || dropbookIntroPhase !== "splash") return;
    const timer = window.setTimeout(() => {
      setDropbookIntroPhase("workspace");
      setDropbookEditingCover(true);
      setDropbookCoverMode("choose");
    }, DROPBOOK_INTRO_MS);
    return () => window.clearTimeout(timer);
  }, [isDropbookMode, dropbookIntroPhase]);

  const returnToDropbookShelf = useCallback(() => {
    editingDropbookPageIdRef.current = null;
    setDropbookEditingDescriptDoc(null);
    resetCreationSurface();
    setDropbookCreating(false);
  }, [resetCreationSurface]);

  const goDropbookHome = useCallback(() => {
    editingDropbookPageIdRef.current = null;
    setDropbookEditingDescriptDoc(null);
    resetCreationSurface();
    setDropbookCreating(false);
    setDropbookIntroPhase("workspace");
    setDropbookEditingCover(true);
    setDropbookCoverMode("choose");
    if (mode === "descript") {
      const fallback = allowedModes.includes("photo") ? "photo" : allowedModes[0] ?? "photo";
      setMode(fallback);
    }
  }, [resetCreationSurface, mode, allowedModes]);

  const commitDescriptToDropbook = useCallback(
    (doc: DescriptDoc) => {
      const previewText = doc.plainText?.trim() || descriptPlainText(doc.html);
      const chipFields = {
        mode: "descript" as const,
        label: doc.title?.trim() || "Descript",
        previewUrl: undefined,
        descriptDocId: doc.id,
        descriptTitle: doc.title?.trim() || "Untitled Descript",
        descriptPreview: previewText,
      };
      const editingPageId = editingDropbookPageIdRef.current;
      if (editingPageId) {
        updateDropbookPage(editingPageId, chipFields, null, doc);
        editingDropbookPageIdRef.current = null;
        setDropbookEditingDescriptDoc(null);
        returnToDropbookShelf();
        flashSaveNote("Drop page updated ✦");
        return;
      }
      if (dropbookShelfFull) {
        flashSaveNote("Dropbook holds up to 3 drops plus your cover");
        return;
      }
      appendDropbookPage(chipFields, null, doc);
      setDropbookEditingDescriptDoc(null);
      returnToDropbookShelf();
      flashSaveNote("Page added to Dropbook ✦");
    },
    [
      dropbookShelfFull,
      appendDropbookPage,
      updateDropbookPage,
      returnToDropbookShelf,
      flashSaveNote,
    ]
  );

  const completeDescript = useCallback(
    async (doc: DescriptDoc) => {
      if (!onDescriptComplete) return;
      try {
        await onDescriptComplete(doc);
        onClose();
      } catch (error) {
        console.error("[DropStudioStage] Descript completion failed", error);
        flashSaveNote("Couldn't save this Descript. Try again.");
      }
    },
    [flashSaveNote, onClose, onDescriptComplete]
  );

  const finishDropbook = useCallback(async () => {
    if (!dropbookCover?.complete) {
      flashSaveNote("Set your Dropbook cover first");
      return;
    }
    if (!dropbookPages.length) {
      flashSaveNote("Add at least one page before finishing");
      return;
    }
    if (finishingDropbook) return;

    setFinishingDropbook(true);
    flashSaveNote("Building Dropbook…");
    try {
      const slides: DropbookSlide[] = [];
      const coverSrc = dropbookCover.previewUrl
        ? await sourceToDataUrl(dropbookCover.previewUrl)
        : undefined;
      slides.push({
        id: dropbookCover.id,
        kind: "cover",
        title: "Cover",
        src: coverSrc,
      });

      for (const page of dropbookPages) {
        if (page.linkKind && page.linkUrl) {
          slides.push({
            id: page.id,
            kind: page.linkKind,
            title: page.label || page.linkProvider || "Link",
            src: page.previewUrl,
            text: page.linkDescription,
            url: page.linkUrl,
            embedUrl: page.linkEmbedUrl,
            provider: page.linkProvider,
          });
          continue;
        }

        if (page.mode === "descript") {
          const doc = dropbookPageDocsRef.current.get(page.id);
          slides.push({
            id: page.id,
            kind: "descript",
            title: page.descriptTitle || page.label || "Descript",
            text: doc?.plainText?.trim() || page.descriptPreview || "",
          });
          continue;
        }

        const file = dropbookPageFilesRef.current.get(page.id);
        if (!file) throw new Error(`Dropbook page ${page.label || page.id} is unavailable.`);
        const kind: DropbookSlide["kind"] = file.type.startsWith("video/")
          ? "video"
          : file.type.startsWith("audio/")
            ? "audio"
            : "image";
        slides.push({
          id: page.id,
          kind,
          title: page.label || modeLabel(page.mode ?? "photo"),
          src: await blobToDataUrl(file),
        });
      }

      const manifest: DropbookManifest = {
        format: "jab-dropbook",
        version: 1,
        createdAt: Date.now(),
        bookColor: dropbookCover.bookColor,
        slides,
      };
      const file = new File(
        [JSON.stringify(manifest)],
        `dropbook-${Date.now()}.dropbook.json`,
        { type: DROPBOOK_MIME }
      );
      await onComplete(file, "capture");
      onClose();
    } catch (error) {
      console.error("[DropStudioStage] Dropbook completion failed", error);
      flashSaveNote(error instanceof Error ? error.message : "Couldn't finish this Dropbook.");
    } finally {
      setFinishingDropbook(false);
    }
  }, [
    dropbookCover,
    dropbookPages,
    finishingDropbook,
    flashSaveNote,
    onComplete,
    onClose,
  ]);

  const startDropbookPageCapture = useCallback(() => {
    if (dropbookShelfFull) {
      flashSaveNote("Dropbook holds up to 3 drops plus your cover");
      return;
    }
    editingDropbookPageIdRef.current = null;
    setDropbookEditingDescriptDoc(null);
    resetCreationSurface();
    setDropbookEditingCover(false);
    setDropbookCoverMode("choose");
    setDropbookCreating(true);
  }, [dropbookShelfFull, resetCreationSurface, flashSaveNote]);

  const beginDropbookSession = useCallback(() => {
    setDropbookCreating(false);
    setDropbookCover(createEmptyDropbookCover());
    setDropbookPages([]);
    dropbookPageFilesRef.current.clear();
    dropbookPageDocsRef.current.clear();
    editingDropbookPageIdRef.current = null;
    setDropbookEditingDescriptDoc(null);
    dropbookPageSeqRef.current = 0;
    setDropbookIntroPhase("splash");
    setDropbookEditingCover(true);
    setDropbookCoverMode("choose");
    setDropbookCoverBlankColor("#000000");
    clearDropbookCoverPhoto();
    setDropbookLinkBusy(false);
    setIsDropbookMode(true);
  }, [clearDropbookCoverPhoto]);

  const addDropbookLinkPage = useCallback(async () => {
    if (isDropbookMode && dropbookShelfFull) {
      flashSaveNote("Dropbook holds up to 3 drops plus your cover");
      return;
    }
    const draft = dropbookLinkDraft.trim();
    if (!draft) {
      flashSaveNote("Paste a YouTube, music, or web link");
      return;
    }

    setDropbookLinkBusy(true);
    try {
      const resolved = await resolveDropbookLink(draft);
      if (!resolved) {
        flashSaveNote("That doesn't look like a usable link");
        return;
      }
      if (!isDropbookMode) {
        if (!onLinkComplete) {
          flashSaveNote("Couldn't post that link from here.");
          return;
        }
        try {
          await onLinkComplete(resolved);
        } catch {
          flashSaveNote("Couldn't post that link. Try again.");
          return;
        }
        setDropbookLinkDraft("");
        flashSaveNote(
          resolved.kind === "youtube"
            ? "YouTube Drop posted ✦"
            : resolved.kind === "music"
              ? "Music Drop posted ✦"
              : "Link Drop posted ✦"
        );
        onClose();
        return;
      }
      appendDropbookPage({
        label: resolved.chipLabel,
        previewUrl: resolved.image,
        linkKind: resolved.kind,
        linkUrl: resolved.url,
        linkEmbedUrl: resolved.embedUrl,
        linkProvider: resolved.provider,
        linkDescription: resolved.description,
      });
      setDropbookLinkDraft("");
      flashSaveNote(
        resolved.kind === "youtube"
          ? "YouTube page added to Dropbook ✦"
          : resolved.kind === "music"
            ? "Music page added to Dropbook ✦"
            : "Link page added to Dropbook ✦"
      );
    } catch {
      flashSaveNote("Couldn't read that link. Try again.");
    } finally {
      setDropbookLinkBusy(false);
    }
  }, [
    appendDropbookPage,
    dropbookLinkDraft,
    dropbookShelfFull,
    flashSaveNote,
    isDropbookMode,
    onClose,
    onLinkComplete,
  ]);

  // Single source of truth for the editor preview URL — recreated whenever the file changes.
  useEffect(() => {
    if (!open || phase !== "edit" || !fileRef.current) {
      return;
    }

    const file = fileRef.current;
    const url = URL.createObjectURL(file);
    urlRef.current = url;
    setMediaUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [open, phase, mediaFileTick]);

  function commitBlob(blob: Blob, kind: "image" | "video" | "audio", src: "capture" | "upload") {
    const type =
      blob.type ||
      (kind === "image" ? "image/jpeg" : kind === "audio" ? "audio/webm" : "video/webm");
    const ext = kind === "image" ? "jpg" : kind === "audio" ? audioExtForMime(type) : extForMime(type);
    const base = kind === "audio" ? "board-vocal" : "board-vision";
    fileRef.current = new File([blob], `${base}-${Date.now()}.${ext}`, { type });
    setMediaKind(kind);
    setSource(src);
    stopCamera();
    setPhase("edit");
    draftIdRef.current = "";
    syncMediaPreview();
    void saveToDrafts(true);
  }

  async function takePhoto() {
    const v = videoRef.current;
    if (!v || !v.videoWidth || !v.videoHeight) return;
    // Cover-crop the live frame to the standard Board Drop ratio so the saved
    // photo matches exactly what's framed in the viewport (WYSIWYG).
    const displayedRatio = v.clientWidth > 0 && v.clientHeight > 0
      ? v.clientWidth / v.clientHeight
      : 0;
    const ratio = Number.isFinite(displayedRatio) && displayedRatio > 0
      ? displayedRatio
      : dropFrameAspectRatio(captureMediaFrame);
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    let sw = vw;
    let sh = vw / ratio;
    if (sh > vh) {
      sh = vh;
      sw = vh * ratio;
    }
    const sx = (vw - sw) / 2;
    const sy = (vh - sh) / 2;
    const { width, height } = boardDropFramePixelSize(sw, sh);
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    // The front ("user") camera is previewed mirrored (see .capVideo.mirror), so
    // mirror the saved frame too — the photo then matches exactly what was framed
    // on screen instead of flipping after capture.
    if (facing === "user") {
      ctx.translate(c.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height);
    const blob = await canvasToJpegBlob(c);
    if (blob) commitBlob(blob, "image", "capture");
  }

  function startRecording() {
    if (!streamRef.current || typeof MediaRecorder === "undefined") {
      setError("Recording isn't supported in this browser.");
      return;
    }
    chunksRef.current = [];
    const mt = preferredVideoMime();
    const rec = mt ? new MediaRecorder(streamRef.current, { mimeType: mt }) : new MediaRecorder(streamRef.current);
    recorderRef.current = rec;
    rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
    rec.onstop = () => commitBlob(new Blob(chunksRef.current, { type: rec.mimeType || mt || "video/webm" }), "video", "capture");
    rec.start();
    setRecording(true);
  }

  async function startVocalRecording() {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Microphone recording is not supported in this browser.");
      return;
    }
    stopCamera();
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mt = preferredAudioMime();
      const rec = mt ? new MediaRecorder(stream, { mimeType: mt }) : new MediaRecorder(stream);
      recorderRef.current = rec;
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = () => commitBlob(new Blob(chunksRef.current, { type: rec.mimeType || mt || "audio/webm" }), "audio", "capture");
      rec.start();
      setRecording(true);
    } catch {
      setError("Microphone blocked. Allow access, or upload an audio thought instead.");
    }
  }
  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  async function onUpload(f: File | undefined) {
    if (!f) return;
    const file =
      f.type.startsWith("image/") && f.type !== "image/gif" && f.type !== "image/svg+xml"
        ? await ensureImageFileMinResolution(f)
        : f;
    fileRef.current = file;
    const kind = file.type.startsWith("audio/")
      ? "audio"
      : file.type.startsWith("video/")
        ? "video"
        : "image";
    setMediaKind(kind);
    setSource("upload");
    stopCamera();
    setPhase("edit");
    draftIdRef.current = "";
    syncMediaPreview();
    if (kind === "image" || kind === "video") {
      const detected = await detectFrameFromFile(file);
      setStudioValue((prev) => ({
        ...prev,
        effects: {
          ...(prev.effects ?? {}),
          frame: detected,
          rotation: null,
        },
      }));
    }
    void saveToDrafts(true);
  }

  function retake() {
    if (voiceSessionActive) {
      flashSaveNote("Finish this song in Voice Studio first.");
      return;
    }
    fileRef.current = null;
    urlRef.current = "";
    setDrawOpen(false);
    setAudioPlaying(false);
    setVoicePreset("clean");
    setProcessingVocal(false);
    setPhase("capture");
    syncMediaPreview();
  }

  async function done() {
    if (
      audioSession &&
      sessionHasLane(audioSession, "instrumental") &&
      !sessionHasLane(audioSession, "vocal")
    ) {
      flashSaveNote("Record a vocal before mixing.");
      return;
    }

    let completionValue = studioValue;

    if (
      fileRef.current?.type.startsWith("image/") &&
      fileRef.current.type !== "image/gif" &&
      fileRef.current.type !== "image/svg+xml"
    ) {
      fileRef.current = await ensureImageFileMinResolution(fileRef.current);
    }

    const rotation = normalizeDropMediaRotation(studioValue.effects?.rotation);
    if (
      rotation &&
      fileRef.current?.type.startsWith("image/") &&
      fileRef.current.type !== "image/gif" &&
      fileRef.current.type !== "image/svg+xml"
    ) {
      fileRef.current = await rotateImageFile(fileRef.current, rotation);
      completionValue = {
        ...completionValue,
        effects: {
          ...(completionValue.effects ?? {}),
          rotation: null,
        },
      };
      setStudioValue(completionValue);
    }

    let file = fileRef.current;
    if (!file) return;

    if (file.type.startsWith("image/") && completionValue.artOverlayUrl) {
      flashSaveNote("Rendering Art Palette drawing…");
      try {
        file = await flattenArtLayerIntoImage(file, completionValue.artOverlayUrl);
        fileRef.current = file;
        completionValue = { ...completionValue, artOverlayUrl: undefined };
        setStudioValue(completionValue);
      } catch (error) {
        console.error("[DropStudioStage] Art Palette rendering failed", error);
        flashSaveNote("Couldn't render this drawing. Try Apply Art again.");
        return;
      }
    }

    if (file.type.startsWith("audio/")) {
      const originalFile = file;
      setProcessingVocal(true);
      flashSaveNote(
        audioSession &&
          (sessionHasLane(audioSession, "instrumental") ||
            sessionHasLane(audioSession, "adlib") ||
            sessionHasLane(audioSession, "fx"))
          ? "Mixing Voice Studio session…"
          : "Applying vocal enhancement…"
      );
      await new Promise<void>((resolve) => {
        if (typeof window !== "undefined") window.requestAnimationFrame(() => resolve());
        else resolve();
      });
      try {
        if (
          audioSession &&
          (sessionHasLane(audioSession, "instrumental") ||
            sessionHasLane(audioSession, "adlib") ||
            sessionHasLane(audioSession, "fx"))
        ) {
          const mixed = await renderSessionFile({
            ...audioSession,
            tracks: audioSession.tracks.map((track) =>
              track.kind === "vocal" ? { ...track, latencyMs: studioLatencyMs } : track
            ),
          });
          file = mixed;
          fileRef.current = mixed;
          setMediaKind("audio");
          syncMediaPreview();
        } else {
          file = await renderVoicePresetFile(file, voicePreset);
          fileRef.current = file;
        }
      } catch (error) {
        console.error("[DropStudioStage] vocal enhancement failed", error);
        file = originalFile;
        fileRef.current = originalFile;
        flashSaveNote("Mix timed out — using the original voice.");
      } finally {
        setProcessingVocal(false);
      }
    }

    if (isDropbookMode) {
      const editingPageId = editingDropbookPageIdRef.current;
      if (!editingPageId && dropbookShelfFull) {
        flashSaveNote("Dropbook holds up to 3 drops plus your cover");
        return;
      }
      const previewUrl =
        mediaKind === "image" || mediaKind === "video"
          ? URL.createObjectURL(file)
          : undefined;
      if (editingPageId) {
        updateDropbookPage(
          editingPageId,
          {
            mode,
            previewUrl,
            label: modeLabel(mode),
            descriptDocId: undefined,
            descriptTitle: undefined,
            descriptPreview: undefined,
          },
          file,
          null
        );
        editingDropbookPageIdRef.current = null;
        returnToDropbookShelf();
        flashSaveNote("Drop page updated ✦");
        return;
      }
      // Keep the studio open — onComplete closes the launchpad in Drop Pad OS.
      appendDropbookPage(
        {
          mode,
          previewUrl,
          label: modeLabel(mode),
        },
        file,
        null
      );
      returnToDropbookShelf();
      flashSaveNote("Page added to Dropbook ✦");
      return;
    }

    const completedCustomizations = writeStudioDraft(completionValue);
    onChange(completedCustomizations);
    try {
      await onComplete(file, source);
      onClose();
    } catch (error) {
      console.error("[DropStudioStage] completion failed", error);
      flashSaveNote("Couldn't save this Drop. Try again.");
    }
  }

  if (!open || typeof document === "undefined") return null;

  const isDropbookHomeScreen =
    isDropbookMode &&
    dropbookIntroPhase === "workspace" &&
    !dropbookCreating &&
    dropbookEditingCover &&
    dropbookCoverMode === "choose";

  const renderCoverSlate = (
    variant: "stage" | "shelf",
    opts?: {
      key?: string;
      dragOver?: boolean;
      onClick?: () => void;
      onDragOver?: (e: DragEvent) => void;
      onDragLeave?: () => void;
      onDrop?: (e: DragEvent) => void;
      children?: ReactNode;
    }
  ) => {
    if (!dropbookCover) return null;
    const Tag = opts?.onClick ? "button" : "div";
    return (
      <Tag
        key={opts?.key}
        type={opts?.onClick ? "button" : undefined}
        className={`dropbookCoverSlate ${variant} ${
          dropbookCover.complete ? "filled" : "empty"
        } ${!dropbookCover.complete && !dropbookCover.bookColorSet ? "outline" : ""} ${
          !dropbookCover.complete && dropbookCover.bookColorSet ? "colorFilled" : ""
        } ${opts?.dragOver ? "dragOver" : ""}`}
        style={{ "--book-color": dropbookCover.bookColor } as CSSProperties}
        onClick={opts?.onClick}
        onDragOver={opts?.onDragOver}
        onDragLeave={opts?.onDragLeave}
        onDrop={opts?.onDrop}
        aria-label="Dropbook cover"
      >
        <div className="dropbookCoverSlateBody">
          {opts?.children ? (
            opts.children
          ) : coverBlankBackgroundUrl || dropbookCover.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="dropbookCoverSlatePreview"
              src={coverBlankBackgroundUrl || dropbookCover.previewUrl}
              alt=""
            />
          ) : (
            <span className="dropbookCoverSlatePlus" aria-hidden>
              +
            </span>
          )}
        </div>
        <span className="dropbookCoverSlateFoot">Cover</span>
      </Tag>
    );
  };

  const renderCoverShelfChip = (
    chipKey: string,
    opts?: {
      dragOver?: boolean;
      onClick?: () => void;
      onDragOver?: (e: DragEvent) => void;
      onDragLeave?: () => void;
      onDrop?: (e: DragEvent) => void;
    }
  ) => {
    if (!dropbookCover) return null;
    const filled = dropbookCover.complete;

    if (!filled) {
      return (
        <div
          key={chipKey}
          role="button"
          tabIndex={0}
          className={`${chipStyles.chip} ${chipStyles.empty} ${chipStyles.emptyInteractive}${
            opts?.dragOver ? ` ${chipStyles.dragOver}` : ""
          }`}
          aria-label="Dropbook cover"
          onClick={opts?.onClick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              opts?.onClick?.();
            }
          }}
          onDragOver={opts?.onDragOver}
          onDragLeave={opts?.onDragLeave}
          onDrop={opts?.onDrop}
        >
          <span className={chipStyles.plus} aria-hidden>
            +
          </span>
          <span className={chipStyles.footer}>Cover</span>
        </div>
      );
    }

    return (
      <button
        key={chipKey}
        type="button"
        className={`${chipStyles.chip} ${chipStyles.chipButton} ${chipStyles.filled}${
          opts?.dragOver ? ` ${chipStyles.dragOver}` : ""
        }`}
        aria-label="Dropbook cover"
        onClick={opts?.onClick}
        onDragOver={opts?.onDragOver}
        onDragLeave={opts?.onDragLeave}
        onDrop={opts?.onDrop}
      >
        {dropbookCover.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={chipStyles.preview} src={dropbookCover.previewUrl} alt="" />
        ) : (
          <span className={chipStyles.modeGlyph} aria-hidden>
            ✦
          </span>
        )}
        <span className={chipStyles.footer}>Cover</span>
      </button>
    );
  };

  const renderModeChooseMonitor = (
    prompt?: string,
    compact = false,
    opts?: { onActivate?: () => void; activateLabel?: string }
  ) => {
    const className = [
      chooseStyles.capChoose,
      compact ? chooseStyles.dropbookStageMonitor : "",
      opts?.onActivate ? chooseStyles.capChooseInteractive : "",
    ]
      .filter(Boolean)
      .join(" ");
    const inner = (
      <div className={chooseStyles.capChooseInner}>
        <div className={chooseStyles.capChooseGlyphBig} aria-hidden>
          {modeGlyph(mode)}
        </div>
        <div className={chooseStyles.capChooseTitle}>{modeLabel(mode)} Drop</div>
        <p className={chooseStyles.capChooseSub}>
          {prompt ??
            "Capture something live, or upload from your device — then make it yours in Drop Studio."}
        </p>
      </div>
    );

    if (opts?.onActivate) {
      return (
        <button
          type="button"
          className={className}
          onClick={opts.onActivate}
          aria-label={opts.activateLabel ?? `Start ${modeLabel(mode)} drop`}
        >
          {inner}
        </button>
      );
    }

    return <div className={className}>{inner}</div>;
  };

  return createPortal(
    <div
      className="studioStage"
      role="dialog"
      aria-modal="true"
      aria-label="Drop Studio"
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (voiceSessionActive) return;
        handleClose();
      }}
    >
      <div
        className={`studioSheet ${mode === "descript" ? "studioSheetDescript" : ""} ${
          voiceStudioOpen ? "studioSheetVoice" : ""
        }`}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="studioBar">
          <div className="studioBarLeft">
            <div className="studioBrand">
              <span className="studioDot" aria-hidden />
              DROP STUDIO
            </div>
            <span className="studioPill">
              {isDropbookMode
                ? "Dropbook Mode"
                : mode === "descript"
                  ? "Descript"
                  : phase === "edit"
                    ? `${modeLabel(mode)} Tools`
                    : phase === "capture"
                      ? "Capture Mode"
                      : "New Drop"}
            </span>
          </div>
          <div className="studioBarRight">
            {isDropbookMode && dropbookCreating && !dropbookEditingCover ? (
              <button
                type="button"
                className="dropbookCaptureExit"
                onClick={goDropbookHome}
                aria-label="Back to Dropbook cover setup"
                title="Back to Dropbook cover"
              >
                ✕
              </button>
            ) : null}
            <button
              type="button"
              className="studioGhost"
              onClick={() => setDraftsOpen(true)}
              aria-label="Open drafts"
            >
              🗂 Drafts
            </button>
            {phase === "edit" && mode !== "descript" && !voiceSessionActive ? (
              <button type="button" className="studioGhost" onClick={retake}>
                Retake
              </button>
            ) : null}
            <button
              type="button"
              className="studioGhost"
              onClick={() => {
                if (recording || adlibRecording || processingVocal) {
                  flashSaveNote("Finish this take first.");
                  return;
                }
                handleClose();
              }}
              aria-label="Close Drop Studio"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="studioBody">
          {/* One surface: the mode rail stays put while the center moves between
              live capture and editing, so editing feels continuous with shooting. */}
          <div className="capStage">
            <div className={`capTopBand ${isDropbookMode ? "dropbookModeActive" : ""}`}>
              <nav className="modeRail" aria-label="Drop Studio modes">
                {ALL_STUDIO_MODES.map((m) => {
                  const enabled = m === "descript" || allowedModes.includes(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      className={`modeRailBtn ${mode === m ? "on" : ""} ${enabled ? "" : "locked"} ${
                        isDropbookMode ? "dropbookOrbit" : ""
                      }`}
                      onClick={() => {
                        if (!enabled) return;
                        if (voiceSessionActive && m !== mode) {
                          flashSaveNote("Finish this song in Voice Studio first.");
                          return;
                        }
                        if (isDropbookMode) {
                          if (dropbookShelfFull) {
                            flashSaveNote("Dropbook holds up to 3 drops plus your cover");
                            return;
                          }
                          editingDropbookPageIdRef.current = null;
                          setDropbookEditingDescriptDoc(null);
                          setDropbookEditingCover(false);
                          setDropbookCoverMode("choose");
                          setDropbookCreating(true);
                        }
                        if (m === "descript") {
                          setMode("descript");
                          return;
                        }
                        // Switching mode mid-edit returns to live capture in that mode.
                        if (phase === "edit" && mode !== "descript") retake();
                        setMode(m);
                      }}
                      disabled={
                        recording ||
                        adlibRecording ||
                        processingVocal ||
                        !enabled ||
                        (voiceSessionActive && m !== mode)
                      }
                      title={
                        enabled
                          ? modeLabel(m)
                          : m === "audio"
                            ? "Voice is available on Thought Drops"
                            : `${modeLabel(m)} isn't available for this drop`
                      }
                    >
                      <span className="modeGlyph" aria-hidden>
                        {modeGlyph(m)}
                      </span>
                      <span className="modeName">{modeLabel(m)}</span>
                    </button>
                  );
                })}
              </nav>

              <form
                className="dropbookLinkEntry studioMethodLink"
                onSubmit={(event) => {
                  event.preventDefault();
                  void addDropbookLinkPage();
                }}
              >
                <label className="dropbookLinkField">
                  <span className="dropbookLinkIcon" aria-hidden>
                    🔗
                  </span>
                  <input
                    type="url"
                    inputMode="url"
                    autoComplete="url"
                    placeholder="Paste YouTube, music, or web link"
                    value={dropbookLinkDraft}
                    onChange={(event) => setDropbookLinkDraft(event.currentTarget.value)}
                    disabled={dropbookLinkBusy || (isDropbookMode && dropbookShelfFull)}
                    aria-label={
                      isDropbookMode
                        ? "Paste YouTube, music, or web link for Dropbook"
                        : "Paste YouTube, music, or web link to post a Link Drop"
                    }
                  />
                </label>
                <button
                  type="submit"
                  className="dropbookLinkAdd"
                  disabled={
                    dropbookLinkBusy ||
                    (isDropbookMode && dropbookShelfFull) ||
                    !dropbookLinkDraft.trim()
                  }
                >
                  {dropbookLinkBusy ? "…" : isDropbookMode ? "Add →" : "Post →"}
                </button>
              </form>

              <div className="dropbookEntryRow">
                <button
                  type="button"
                  className={`dropbookEntry ${isDropbookMode ? "dropbookEntryActive" : ""}`}
                  onClick={() => {
                    if (isDropbookMode) {
                      setIsDropbookMode(false);
                      setDropbookCreating(false);
                      setDropbookIntroPhase(null);
                      setDropbookEditingCover(false);
                      setDropbookCoverMode("choose");
                      setDropbookLinkDraft("");
                      setDropbookLinkBusy(false);
                      setDropbookPages([]);
                      setDropbookCover(null);
                      clearDropbookCoverPhoto();
                      setDropbookCoverBlankColor("#000000");
                      dropbookPageFilesRef.current.clear();
                      dropbookPageDocsRef.current.clear();
                      return;
                    }
                    beginDropbookSession();
                    setDropbookLinkDraft("");
                  }}
                  aria-pressed={isDropbookMode}
                >
                  <span className="dropbookEntryLabel">
                    {isDropbookMode ? "◉ Dropbook Active" : "Start a Dropbook"}
                  </span>
                </button>
                {isDropbookMode &&
                dropbookIntroPhase === "workspace" &&
                !isDropbookHomeScreen ? (
                  <button
                    type="button"
                    className="dropbookHomeBtn"
                    onClick={goDropbookHome}
                    aria-label="Dropbook home — cover editor and shelf"
                    title="Dropbook home"
                  >
                    <span className="dropbookHomeIcon" aria-hidden>
                      ⌂
                    </span>
                  </button>
                ) : null}
              </div>
            </div>

            <div
              className={`capMain ${mode === "descript" ? "capMainDescript" : ""} ${
                isDropbookMode ? "capMainDropbook" : ""
              } ${dropbookCreating ? "capMainCreating" : ""} ${
                dropbookIntroPhase === "splash" ? "capMainSplash" : ""
              } ${phase === "choose" || phase === "capture" ? "capMainMonitor" : ""}`}
            >
              {isDropbookMode && dropbookIntroPhase !== "splash" ? (
                <>
                <div className="dropbookShelfWrap">
                  <div
                    className={`dropbookShelfZone ${dropbookCreating ? "slidUp" : ""}`}
                    aria-label="Dropbook chip shelf"
                  >
                    <div className="dropbookShelfHead">
                      <span className="dropbookWordmark dropbookShelfLabel">Dropbook Shelf</span>
                      <span className="dropbookShelfHint">
                        {dropbookShelfFull
                          ? "Cover + 3 drops — your Dropbook is full"
                          : "Add drops or paste a link above — cover can wait"}
                      </span>
                      {dropbookPages.length > 0 ? (
                        <button
                          type="button"
                          className="dropbookFinishBtn"
                          onClick={() => void finishDropbook()}
                          disabled={finishingDropbook}
                        >
                          {finishingDropbook ? "Building Dropbook…" : "Finish Dropbook →"}
                        </button>
                      ) : null}
                    </div>
                    <div
                      className={`dropbookShelfScroll ${
                        dropbookCover?.bookColor ? "dropbookShelfTinted" : ""
                      }`}
                      style={
                        dropbookCover?.complete
                          ? ({ "--dropbook-book-color": dropbookCover.bookColor } as CSSProperties)
                          : undefined
                      }
                    >
                      {dropbookShelfSlots.map((slot, index) =>
                        slot.kind === "cover" ? (
                            renderCoverShelfChip(slot.id, {
                              dragOver: dropbookCoverDragOver,
                              onClick: () => {
                                setDropbookEditingCover(true);
                                setDropbookCoverMode("choose");
                                setDropbookCreating(false);
                              },
                              onDragOver: (e) => {
                                e.preventDefault();
                                setDropbookCoverDragOver(true);
                              },
                              onDragLeave: () => setDropbookCoverDragOver(false),
                              onDrop: (e) => {
                                e.preventDefault();
                                setDropbookCoverDragOver(false);
                                const chipId = e.dataTransfer.getData("application/x-dropbook-chip");
                                if (chipId) applyPageToCover(chipId);
                              },
                            })
                        ) : slot.kind === "placeholder" ? (
                          <button
                            key={slot.id}
                            type="button"
                            className={`${chipStyles.chip} ${chipStyles.empty} ${chipStyles.emptyInteractive}`}
                            onClick={startDropbookPageCapture}
                            aria-label={`Add ${modeLabel(mode)} drop to slot ${index}`}
                          >
                            <span className={chipStyles.index}>{index}</span>
                            <span className={chipStyles.plus} aria-hidden>
                              +
                            </span>
                          </button>
                        ) : (
                          <button
                            key={slot.id}
                            type="button"
                            className={`${chipStyles.chip} ${chipStyles.chipButton} ${chipStyles.filled}`}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData("application/x-dropbook-chip", slot.id);
                              e.dataTransfer.effectAllowed = "copy";
                            }}
                            onClick={() => selectDropbookChip(slot.id)}
                            aria-label={slot.label ?? `Dropbook page ${index}`}
                          >
                            {slot.mode === "descript" && slot.descriptPreview ? (
                              <div className={chipStyles.descriptPreview} aria-hidden>
                                {slot.descriptTitle ? (
                                  <div className={chipStyles.descriptTitle}>{slot.descriptTitle}</div>
                                ) : null}
                                <div className={chipStyles.descriptBody}>{slot.descriptPreview}</div>
                              </div>
                            ) : slot.previewUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img className={chipStyles.preview} src={slot.previewUrl} alt="" />
                            ) : (
                              <span className={chipStyles.modeGlyph} aria-hidden>
                                {slot.linkKind === "youtube"
                                  ? "▶"
                                  : slot.linkKind === "music"
                                    ? "♫"
                                    : slot.linkKind === "link"
                                      ? "🔗"
                                      : slot.mode
                                        ? modeGlyph(slot.mode)
                                        : "✦"}
                              </span>
                            )}
                            <span className={chipStyles.footer}>
                              {slot.label ??
                                (slot.linkKind === "youtube"
                                  ? "YouTube ▶"
                                  : slot.linkKind === "music"
                                    ? "Song ♫"
                                    : slot.linkKind === "link"
                                      ? "Link"
                                      : slot.mode
                                        ? modeLabel(slot.mode)
                                        : "Drop")}
                            </span>
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>
                </>
              ) : null}

              <div className="capMainBody">
              {isDropbookMode && dropbookIntroPhase === "splash" ? (
                <div className="dropbookIntroSplash" aria-label="Dropbook intro">
                  <h1 className="dropbookWordmark dropbookTitleHeroSplash">Dropbook</h1>
                </div>
              ) : isDropbookMode &&
                !dropbookCreating &&
                dropbookEditingCover &&
                dropbookCoverMode === "choose" ? (
                <div className="dropbookCoverWorkspace">
                  <div className="dropbookCoverChooseStack">
                    <div className="dropbookCoverChooseHead">
                      <div className="dropbookMonitorLabel">Dropbook Cover</div>
                    </div>
                    <div className="dropbookCoverStageRow">
                      {renderCoverSlate("stage")}
                      {renderBookColorField("dropbookCoverColorRowWheel")}
                    </div>
                    {renderCoverPhotoControls()}
                    <button
                      type="button"
                      className="dropbookCoverFinishBtn"
                      onClick={() => void finishCoverFromField()}
                    >
                      Finish Book Cover →
                    </button>
                  </div>
                </div>
              ) : isDropbookMode && !dropbookCreating && dropbookIntroPhase === "workspace" ? (
                <div className="dropbookMonitorHost" aria-label="Dropbook workspace">
                  {renderModeChooseMonitor(
                    dropbookShelfFull
                      ? "Your Dropbook shelf is full."
                      : "Tap here or a + slot to add a drop — cover can wait.",
                    true,
                    !dropbookShelfFull
                      ? {
                          onActivate: startDropbookPageCapture,
                          activateLabel: `Add ${modeLabel(mode)} drop page`,
                        }
                      : undefined
                  )}
                </div>
              ) : mode === "descript" ? (
                <DescriptStudio
                  key={
                    isDropbookMode
                      ? `dropbook-descript-${dropbookEditingDescriptDoc?.id ?? "new"}`
                      : `descript-${initialDescriptDoc?.id ?? "new"}`
                  }
                  initialDoc={isDropbookMode ? dropbookEditingDescriptDoc : initialDescriptDoc}
                  startInEditor={
                    isDropbookMode
                      ? dropbookEditingDescriptDoc !== null
                      : initialDescriptDoc !== null
                  }
                  returnOnBack={!isDropbookMode && descriptReturnOnBack}
                  onReturn={descriptOnReturn}
                  onClose={
                    isDropbookMode && dropbookCreating
                      ? () => {
                          setDropbookEditingDescriptDoc(null);
                          editingDropbookPageIdRef.current = null;
                          returnToDropbookShelf();
                        }
                      : handleClose
                  }
                  onShared={
                    isDropbookMode && dropbookCreating
                      ? commitDescriptToDropbook
                      : onDescriptComplete
                        ? (doc) => {
                            void completeDescript(doc);
                          }
                        : undefined
                  }
                  shareLabel={
                    isDropbookMode && dropbookCreating ? "Add to Dropbook →" : undefined
                  }
                  defaultDestination={descriptDestination}
                />
              ) : voiceStudioOpen && mode === "audio" && audioSession ? (
                <div className="capEdit">
                  <div className="capEditScroll">
                    <BoardClientErrorBoundary
                      name="voice-studio"
                      resetLabel="Try Voice Studio again"
                      fallback={
                        <div className="studioVoiceError">
                          Voice Studio hit a snag. Your song is still in this Drop Studio — try Play or Record again.
                        </div>
                      }
                    >
                    <VoiceStudioSession
                      session={audioSession}
                      autoSaveLabel={
                        recording || adlibRecording
                          ? ""
                          : voiceAutoSaving
                            ? "Saving…"
                            : voiceAutoSaveAt
                              ? `Auto-saved ${new Date(voiceAutoSaveAt).toLocaleTimeString(undefined, {
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}`
                              : "Auto-save on"
                      }
                      recording={recording}
                      playing={studioPlaying}
                      countIn={studioCountIn}
                      error={error}
                      headphonesOk={studioHeadphonesOk}
                      latencyMs={studioLatencyMs}
                      canCollapse={!sessionHasLane(audioSession, "instrumental")}
                      micStream={studioMicStream}
                      laneAnalysers={studioLaneAnalysers}
                      recordElapsedMs={studioRecordElapsedMs}
                      canUndo={sessionHistory.past.length > 0}
                      canRedo={sessionHistory.future.length > 0}
                      adlibRecording={adlibRecording}
                      presetPreviewing={presetPreviewing}
                      onHeadphonesOk={setStudioHeadphonesOk}
                      onLatencyMs={(value) => {
                        const next = writeStudioLatencyMs(value) ?? value;
                        setStudioLatencyMs(next);
                        setAudioSession((current) =>
                          current
                            ? {
                                ...current,
                                tracks: current.tracks.map((track) =>
                                  track.kind === "vocal" ? { ...track, latencyMs: next } : track
                                ),
                              }
                            : current
                        );
                      }}
                      onInstrumental={setStudioInstrumental}
                      onMute={(trackId) => {
                        setAudioSession((current) => {
                          if (!current) return current;
                          const track = current.tracks.find((item) => item.id === trackId);
                          if (!track) return current;
                          const muted = !track.mix.muted;
                          studioEngine().setTrackMix(trackId, {
                            muted,
                            volume: track.mix.volume,
                          });
                          return updateTrackMix(current, trackId, { muted });
                        });
                      }}
                      onSolo={(trackId) => {
                        pushSessionEdit((current) => {
                          const track = current.tracks.find((item) => item.id === trackId);
                          if (!track) return current;
                          return updateTrackMix(current, trackId, { solo: !track.mix.solo });
                        });
                      }}
                      onVolume={(trackId, volume) => {
                        setAudioSession((current) => {
                          if (!current) return current;
                          const track = current.tracks.find((item) => item.id === trackId);
                          if (track) {
                            studioEngine().setTrackMix(trackId, {
                              volume,
                              muted: track.mix.muted,
                            });
                          }
                          return updateTrackMix(current, trackId, { volume });
                        });
                      }}
                      onRemove={removeStudioLane}
                      onPlay={() => void playStudioSession()}
                      onStopPlay={() => {
                        haltStudioTransport();
                      }}
                      onRecord={() => void startStudioVocal()}
                      onStopRecord={() => {
                        const take = studioTakeRef.current;
                        const generation = studioRecordGenRef.current;
                        if (take?.isRecording()) {
                          const session = audioSession ?? createAudioSession();
                          const hasBeat = sessionHasLane(session, "instrumental");
                          commitStudioTake(take, session, hasBeat, generation);
                          return;
                        }
                        haltStudioTransport();
                        studioRecordGenRef.current += 1;
                        studioTakeRef.current?.dispose();
                        studioTakeRef.current = null;
                        setRecording(false);
                        streamRef.current?.getTracks().forEach((track) => track.stop());
                        streamRef.current = null;
                        setStudioMicStream(null);
                      }}
                      onCollapse={collapseVoiceStudio}
                      onNotice={flashSaveNote}
                      onAdlibUpload={(file) => {
                        const offsetMs = audioSession.playheadMs || 0;
                        pushSessionEdit((current) =>
                          upsertLaneFromFile(current, "adlib", file, {
                            offsetMs,
                            name: file.name.replace(/\.[^.]+$/, "") || "Ad-Lib",
                          })
                        );
                        flashSaveNote("Ad-lib uploaded");
                      }}
                      onAdlibRecord={() => void startAdlibRecord()}
                      onAdlibStopRecord={stopAdlibRecord}
                      onAdlibPreview={(trackId) => void previewAdlibTrack(trackId)}
                      onAdlibRename={(trackId, name) => {
                        pushSessionEdit((current) => renameTrack(current, trackId, name));
                      }}
                      onAdlibDuplicate={(trackId) => {
                        pushSessionEdit((current) => duplicateAdlibTrack(current, trackId));
                      }}
                      onAdlibDelete={(trackId) => {
                        haltStudioTransport();
                        pushSessionEdit((current) => removeTrackById(current, trackId));
                        flashSaveNote("Ad-lib removed");
                      }}
                      onAdlibMove={(trackId, direction) => {
                        pushSessionEdit((current) => moveAdlibTrack(current, trackId, direction));
                      }}
                      onAdlibFade={(trackId, fadeInMs, fadeOutMs) => {
                        pushSessionEdit((current) =>
                          updateTrackMix(current, trackId, { fadeInMs, fadeOutMs })
                        );
                      }}
                      onVocalPreset={(preset) => {
                        setVoicePreset(preset);
                        pushSessionEdit((current) => {
                          const vocal = current.tracks.find((track) => track.kind === "vocal");
                          if (!vocal) return current;
                          return updateTrackMix(current, vocal.id, {
                            preset,
                            alteration: defaultAlteration(preset),
                          });
                        });
                      }}
                      onVocalAlteration={(patch: Partial<AlterationParams>) => {
                        pushSessionEdit((current) => {
                          const vocal = current.tracks.find((track) => track.kind === "vocal");
                          if (!vocal) return current;
                          return updateTrackMix(current, vocal.id, {
                            alteration: { ...defaultAlteration(vocal.mix.preset), ...vocal.mix.alteration, ...patch },
                          });
                        });
                      }}
                      onPreviewPreset={() => void previewVocalPreset()}
                      onScrub={(ms) => {
                        haltStudioTransport();
                        setAudioSession((current) =>
                          current ? { ...current, playheadMs: Math.max(0, ms) } : current
                        );
                      }}
                      onMoveClip={(trackId, clipId, offsetMs) => {
                        pushSessionEdit((current) =>
                          updateClip(current, trackId, clipId, { offsetMs: Math.max(0, offsetMs) })
                        );
                      }}
                      onTrimClip={(trackId, clipId, trimInMs, trimOutMs) => {
                        pushSessionEdit((current) =>
                          updateClip(current, trackId, clipId, {
                            trimInMs: Math.max(0, trimInMs),
                            trimOutMs: Math.max(0, trimOutMs),
                          })
                        );
                      }}
                      onSplitSelected={(trackId, clipId) => {
                        pushSessionEdit((current) =>
                          splitClipAtPlayhead(current, trackId, clipId, current.playheadMs)
                        );
                      }}
                      onDeleteSelected={(trackId, clipId) => {
                        pushSessionEdit((current) => removeClip(current, trackId, clipId));
                      }}
                      onDuplicateSelected={(trackId, clipId) => {
                        pushSessionEdit((current) => duplicateClip(current, trackId, clipId));
                      }}
                      onRestoreSelected={(trackId, clipId) => {
                        pushSessionEdit((current) => restoreClipOriginal(current, trackId, clipId));
                      }}
                      onUndo={() => {
                        haltStudioTransport();
                        const current = audioSessionRef.current;
                        if (!current) return;
                        const result = undoHistory(sessionHistoryRef.current, current);
                        if (!result) return;
                        sessionHistoryRef.current = result.history;
                        setSessionHistory(result.history);
                        setAudioSession(result.session);
                      }}
                      onRedo={() => {
                        haltStudioTransport();
                        const current = audioSessionRef.current;
                        if (!current) return;
                        const result = redoHistory(sessionHistoryRef.current, current);
                        if (!result) return;
                        sessionHistoryRef.current = result.history;
                        setSessionHistory(result.history);
                        setAudioSession(result.session);
                      }}
                      onLoopChange={(loop) => {
                        setAudioSession((current) => {
                          if (!current) return current;
                          const duration = sessionDurationMs(current);
                          return {
                            ...current,
                            loop: loop ? { inMs: 0, outMs: Math.max(duration, 1000) } : undefined,
                          };
                        });
                      }}
                    />
                    </BoardClientErrorBoundary>
                  </div>
                  <div className="editActions">
                    {saveNote ? <span className="saveNote">{saveNote}</span> : null}
                    <button
                      type="button"
                      className="studioGhost"
                      onClick={() => void saveToDevice()}
                      disabled={processingVocal}
                    >
                      ⬇ Save
                    </button>
                    <button type="button" className="studioGhost" onClick={() => void saveToDrafts(false)}>
                      🗂 Drafts
                    </button>
                    <button
                      type="button"
                      className="studioDone"
                      onClick={done}
                      disabled={processingVocal}
                    >
                      {processingVocal
                        ? "Mixing…"
                        : isDropbookMode
                          ? "Add Vocal to Dropbook →"
                        : sessionHasLane(audioSession, "instrumental") ||
                            sessionHasLane(audioSession, "adlib") ||
                            sessionHasLane(audioSession, "fx")
                          ? "Mix to Drop →"
                          : "Use this Vocal →"}
                    </button>
                  </div>
                </div>
              ) : phase === "choose" ? (
                <div className="capMonitorHost">
                  <DropChipStage
                    mediaFrame={captureMediaFrame}
                    overlay={
                      <div className="capControlsOverlay">
                        <div className="capActionRow">
                          <label className="capUpload">
                            Upload
                            <input
                              type="file"
                              accept={
                                allowedModes.includes("audio") &&
                                allowedModes.includes("photo") &&
                                !allowedModes.includes("video")
                                  ? "image/*,audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac"
                                  : allowedModes.includes("audio")
                                    ? "image/*,video/*,audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac"
                                    : "image/*,video/*"
                              }
                              onChange={(e) => {
                                onUpload(e.currentTarget.files?.[0]);
                                e.currentTarget.value = "";
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            className={`capShutter ${mode === "audio" ? "vocal" : mode === "video" ? "video" : ""}`}
                            onClick={() => setPhase("capture")}
                            aria-label={
                              mode === "audio" ? "Start recording" : mode === "art" ? "Start drawing" : "Start capture"
                            }
                          />
                          <span className="capSpacer" />
                        </div>
                      </div>
                    }
                  >
                    {renderModeChooseMonitor()}
                  </DropChipStage>
                </div>
              ) : phase === "capture" ? (
                <div className="capMonitorHost">
                  {mode === "art" ? (
                    <BoardArtCanvas
                      operatingTable
                      onSave={(f) => commitBlob(f, "image", "capture")}
                    />
                  ) : (
                    <DropChipStage
                      mediaFrame={captureMediaFrame}
                      overlay={
                        <div className="capControlsOverlay">
                          <div className="capActionRow">
                            <label className="capUpload">
                              Upload
                              <input
                                type="file"
                                accept={
                                  allowedModes.includes("audio") &&
                                  allowedModes.includes("photo") &&
                                  !allowedModes.includes("video")
                                    ? "image/*,audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac"
                                    : allowedModes.includes("audio")
                                      ? "image/*,video/*,audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac"
                                      : "image/*,video/*"
                                }
                                onChange={(e) => {
                                  onUpload(e.currentTarget.files?.[0]);
                                  e.currentTarget.value = "";
                                }}
                              />
                            </label>

                            {mode === "audio" ? (
                              recording ? (
                                <button
                                  type="button"
                                  className="capShutter recording"
                                  onClick={stopRecording}
                                  aria-label="Stop vocal recording"
                                />
                              ) : (
                                <button
                                  type="button"
                                  className="capShutter vocal"
                                  onClick={startVocalRecording}
                                  aria-label="Start vocal recording"
                                />
                              )
                            ) : mode === "photo" ? (
                              <button
                                type="button"
                                className="capShutter"
                                onClick={takePhoto}
                                aria-label="Capture photo"
                              />
                            ) : recording ? (
                              <button
                                type="button"
                                className="capShutter recording"
                                onClick={stopRecording}
                                aria-label="Stop recording"
                              />
                            ) : (
                              <button
                                type="button"
                                className="capShutter video"
                                onClick={startRecording}
                                aria-label="Start recording"
                              />
                            )}

                            {mode === "audio" ? (
                              <>
                                <button
                                  type="button"
                                  className="capFlip"
                                  onClick={openVoiceStudio}
                                  disabled={recording}
                                >
                                  Studio
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="capFlip"
                                onClick={() =>
                                  setFacing((f) => (f === "environment" ? "user" : "environment"))
                                }
                                disabled={recording}
                              >
                                Flip
                              </button>
                            )}
                          </div>
                        </div>
                      }
                    >
                      {mode === "audio" ? (
                        <div className="vocalMonitor">
                          <div className="vocalMonitorLabel">{modeLabel(mode)} Mode</div>
                          <div className="vocalVizFill">
                            <VocalVisualizer
                              state={recording ? "recording" : "idle"}
                              stream={recording ? streamRef.current : null}
                            />
                          </div>
                        </div>
                      ) : (
                        <video
                          ref={videoRef}
                          className={`capVideo ${facing === "user" ? "mirror" : ""}`}
                          autoPlay
                          muted
                          playsInline
                        />
                      )}
                      {error ? <div className="capError">{error}</div> : null}
                    </DropChipStage>
                  )}
                </div>
              ) : (
                <div className="capEdit">
                  {mediaKind === "audio" ? (
                    <>
                      <div className="capEditScroll">
                        <div className="vocalReview">
                          <div className="studioBrand">
                            <span className="studioDot" aria-hidden />
                            VOCAL THOUGHT READY
                          </div>
                          <div className="reviewViz">
                            <VocalVisualizer state={audioPlaying ? "playback" : "saved"} />
                          </div>
                          <VoicePresets
                            src={mediaUrl}
                            onPlayingChange={setAudioPlaying}
                            onPresetChange={setVoicePreset}
                          />
                          <p>The selected vocal enhancement will be baked into your Voice Drop.</p>
                          <button type="button" className="studioGhost" onClick={openVoiceStudio}>
                            Studio — add an instrumental
                          </button>
                        </div>
                      </div>
                      <div className="editActions">
                        {saveNote ? <span className="saveNote">{saveNote}</span> : null}
                        <button
                          type="button"
                          className="studioGhost"
                          onClick={() => void saveToDevice()}
                          disabled={processingVocal}
                        >
                          ⬇ Save
                        </button>
                        <button type="button" className="studioGhost" onClick={() => void saveToDrafts(false)}>
                          🗂 Drafts
                        </button>
                        <button
                          type="button"
                          className="studioDone"
                          onClick={done}
                          disabled={processingVocal}
                        >
                          {processingVocal
                            ? "Enhancing Vocal…"
                            : isDropbookMode
                              ? "Add Vocal to Dropbook →"
                              : "Use this Vocal →"}
                        </button>
                      </div>
                    </>
                  ) : drawOpen ? (
                    <div className="capMonitorHost">
                      <BoardArtCanvas
                        operatingTable
                        backgroundImageUrl={
                          mediaKind === "image" && !editingFlattenedArtwork
                            ? mediaUrl
                            : undefined
                        }
                        backgroundVideoUrl={mediaKind === "video" ? mediaUrl : undefined}
                        initialOverlayUrl={
                          studioValue.artOverlayUrl ||
                          (editingFlattenedArtwork ? mediaUrl : undefined)
                        }
                        exportMode={
                          mediaKind === "video" ||
                          (mediaKind === "image" && !editingFlattenedArtwork)
                            ? "overlay"
                            : "composite"
                        }
                        saveLabel="Apply drawing →"
                        onSave={(f) => {
                          if (
                            mediaKind === "video" ||
                            (mediaKind === "image" && !editingFlattenedArtwork)
                          ) {
                            const reader = new FileReader();
                            reader.onload = () => {
                              const artOverlayUrl =
                                typeof reader.result === "string" ? reader.result : "";
                              if (artOverlayUrl) {
                                handleStudioChange({ ...studioValue, artOverlayUrl });
                                flashSaveNote("Art Palette layer applied");
                              }
                            };
                            reader.readAsDataURL(f);
                          } else {
                            commitBlob(f, "image", source);
                          }
                          setDrawOpen(false);
                        }}
                      />
                    </div>
                  ) : (
                    <div className="capStudioHost">
                      <DropStudio
                        mediaUrl={mediaUrl}
                        mediaKind={mediaKind === "video" ? "video" : "image"}
                        value={studioValue}
                        onChange={handleStudioChange}
                        hideHeader
                        operatingTable
                        onMediaError={handleMediaPreviewError}
                      />
                      {saveNote ? <span className="saveNote capStudioSaveNote">{saveNote}</span> : null}
                      <button
                        type="button"
                        className="studioDoneCheck"
                        onClick={done}
                        aria-label={
                          isDropbookMode
                            ? `Add ${mediaKind === "video" ? "Video" : "Vision"} to Dropbook`
                            : `Add ${mediaKind === "video" ? "Video" : "Vision"} to Drop`
                        }
                        title={
                          isDropbookMode
                            ? `Add ${mediaKind === "video" ? "Video" : "Vision"} to Dropbook`
                            : `Add ${mediaKind === "video" ? "Video" : "Vision"} to Drop`
                        }
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M5.2 12.4 9.4 16.8 18.8 6.8"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <DropDraftsDrawer
        open={draftsOpen}
        onClose={() => setDraftsOpen(false)}
        onOpenDraft={openDraft}
      />

    </div>,
    document.body
  );
}
