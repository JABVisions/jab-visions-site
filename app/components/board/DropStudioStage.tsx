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
import { saveDropDraft, draftToFile, type DropDraft } from "@/lib/board/dropDrafts";
import DropDraftsDrawer from "./DropDraftsDrawer";
import VocalVisualizer from "./VocalVisualizer";
import VoicePresets from "./VoicePresets";

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
const DROPBOOK_BOOK_COLORS = [
  "#2563EB",
  "#DC2626",
  "#171717",
  "#FFD12D",
  "#EC4899",
  "#7EE2FF",
  "#7A44FF",
  "#B7FF2D",
];

function createEmptyDropbookCover(): DropbookCover {
  return {
    id: `dropbook-cover-${Date.now()}`,
    bookColor: "#000000",
    bookColorSet: false,
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
  onClose,
  studioDraftRef,
  allowedModes = DEFAULT_CAPTURE_MODES,
  initialMode = "photo",
  descriptDestination = "doc",
}: {
  open: boolean;
  initialFile: File | null;
  value: DropCustomization;
  onChange: (next: DropCustomization) => void;
  onComplete: (file: File, source: "capture" | "upload") => void;
  onClose: () => void;
  /** Live studio customizations (frame/rotation/etc.) without parent re-renders. */
  studioDraftRef?: React.MutableRefObject<DropCustomization | undefined>;
  allowedModes?: CaptureMode[];
  initialMode?: CaptureMode;
  /** Drop type already chosen in Drop Console — Descript shares back into it. */
  descriptDestination?: DescriptDestination;
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
  const [dropbookCoverDragOver, setDropbookCoverDragOver] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [studioValue, setStudioValue] = useState<DropCustomization>(value);

  const studioFrame = studioValue.effects?.frame;
  const captureMediaFrame = useMemo(
    () => resolveDropMediaFrame(studioValue),
    [studioFrame]
  );

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

  const handleClose = useCallback(() => {
    flushStudioValue();
    onClose();
  }, [flushStudioValue, onClose]);

  const flashSaveNote = useCallback((message: string) => {
    setSaveNote(message);
    if (saveNoteTimerRef.current) window.clearTimeout(saveNoteTimerRef.current);
    saveNoteTimerRef.current = window.setTimeout(() => setSaveNote(""), 2600);
  }, []);

  const saveToDevice = useCallback(() => {
    const file = fileRef.current;
    if (!file) return;
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name || "drop-studio-media";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    flashSaveNote("Saved to your device ⬇");
  }, [flashSaveNote]);

  const saveToDrafts = useCallback(
    async (auto = false) => {
      const file = fileRef.current;
      if (!file) return;
      if (!draftIdRef.current) {
        draftIdRef.current = `draft_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
      }
      const saved = await saveDropDraft(file, draftIdRef.current);
      if (auto) {
        if (saved) flashSaveNote("Auto-saved to Drafts");
        return;
      }
      flashSaveNote(saved ? "Saved to Drafts 🗂" : "Too large to save to Drafts");
    },
    [flashSaveNote]
  );

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
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setRecording(false);
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
    },
    [stopCamera, syncMediaPreview]
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
          video: { facingMode: { ideal: nextFacing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
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
    setIsDropbookMode(false);
    setDropbookCreating(false);
    setDropbookIntroPhase(null);
    setDropbookEditingCover(false);
    setDropbookCoverMode("choose");
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
      handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleClose]);

  const selectDropbookChip = useCallback(
    (chipId: string) => {
      const chip = dropbookPages.find((page) => page.id === chipId);
      if (!chip) {
        flashSaveNote("Couldn't open this drop page");
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
    stopCamera();
    draftIdRef.current = "";
    syncMediaPreview();
  }, [stopCamera, syncMediaPreview]);

  const pickBookColor = useCallback((color: string) => {
    setDropbookCoverBlankColor(color);
    setDropbookCover((prev) => (prev ? { ...prev, bookColor: color, bookColorSet: true } : prev));
  }, []);

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
    }));
    const shelfFull = dropbookPages.length >= DROPBOOK_MAX_PAGES;
    const placeholder: DropbookShelfSlot[] = shelfFull
      ? []
      : [{ id: "dropbook-empty-next", kind: "placeholder" as const, empty: true }];
    return [coverSlot, ...pageSlots, ...placeholder];
  }, [dropbookCover, dropbookPages]);

  const dropbookShelfFull = dropbookPages.length >= DROPBOOK_MAX_PAGES;

  const coverBlankBackgroundUrl = useMemo(
    () => solidColorBackgroundUrl(dropbookCoverBlankColor),
    [dropbookCoverBlankColor]
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
      if (!dropbookCover?.complete) {
        flashSaveNote("Set your Dropbook cover first");
        return;
      }
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
      dropbookCover,
      dropbookShelfFull,
      appendDropbookPage,
      updateDropbookPage,
      returnToDropbookShelf,
      flashSaveNote,
    ]
  );

  const startDropbookPageCapture = useCallback(() => {
    if (!dropbookCover?.complete) {
      flashSaveNote("Set your Dropbook cover first");
      return;
    }
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
  }, [dropbookCover, dropbookShelfFull, resetCreationSurface, flashSaveNote]);

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
    const ratio = dropFrameAspectRatio(captureMediaFrame);
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
    fileRef.current = null;
    urlRef.current = "";
    setDrawOpen(false);
    setAudioPlaying(false);
    setPhase("capture");
    syncMediaPreview();
  }

  async function done() {
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
      setStudioValue((prev) => ({
        ...prev,
        effects: {
          ...(prev.effects ?? {}),
          rotation: null,
        },
      }));
    }

    const file = fileRef.current;
    if (!file) return;

    if (isDropbookMode) {
      if (!dropbookCover?.complete) {
        flashSaveNote("Set your Dropbook cover first");
        return;
      }
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

    flushStudioValue();
    onComplete(file, source);
    onClose();
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
          ) : dropbookCover.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="dropbookCoverSlatePreview" src={dropbookCover.previewUrl} alt="" />
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
          <span className={chipStyles.index}>Cover</span>
          <span className={chipStyles.plus} aria-hidden>
            +
          </span>
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
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className={`studioSheet ${mode === "descript" ? "studioSheetDescript" : ""}`}>
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
            {phase === "edit" && mode !== "descript" ? (
              <button type="button" className="studioGhost" onClick={retake}>
                Retake
              </button>
            ) : null}
            <button type="button" className="studioGhost" onClick={handleClose} aria-label="Close Drop Studio">
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
                      disabled={recording || !enabled}
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

              <div className="dropbookEntryRow">
                <button
                  type="button"
                  className={`dropbookEntry ${isDropbookMode ? "dropbookEntryActive" : ""}`}
                  onClick={() => {
                    setIsDropbookMode((active) => {
                      const next = !active;
                      if (next) {
                        setDropbookCreating(false);
                        resetCreationSurface();
                        setDropbookCover(createEmptyDropbookCover());
                        setDropbookPages([]);
                        dropbookPageFilesRef.current.clear();
                        dropbookPageDocsRef.current.clear();
                        editingDropbookPageIdRef.current = null;
                        setDropbookEditingDescriptDoc(null);
                        dropbookPageSeqRef.current = 0;
                        setDropbookIntroPhase("splash");
                        setDropbookEditingCover(false);
                        setDropbookCoverMode("choose");
                        setDropbookCoverBlankColor("#000000");
                      } else {
                        setDropbookCreating(false);
                        setDropbookIntroPhase(null);
                        setDropbookEditingCover(false);
                        setDropbookCoverMode("choose");
                      }
                      return next;
                    });
                  }}
                  aria-pressed={isDropbookMode}
                >
                  <span className="dropbookEntryLabel">
                    {isDropbookMode ? "Dropbook Mode" : "Start a Dropbook"}
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
                          : dropbookCover?.complete
                            ? "Create drops to build your Dropbook"
                            : "Start with your Dropbook cover"}
                      </span>
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
                                {slot.mode ? modeGlyph(slot.mode) : "✦"}
                              </span>
                            )}
                            <span className={chipStyles.footer}>
                              {slot.label ?? (slot.mode ? modeLabel(slot.mode) : "Drop")}
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
                dropbookCreating &&
                dropbookCoverMode === "blank" &&
                dropbookEditingCover ? (
                <div className="dropbookCoverEditor">
                  <div className="dropbookCoverEditorHead">
                    <button
                      type="button"
                      className="studioGhost dropbookCoverBack"
                      onClick={() => {
                        setDropbookCreating(false);
                        setDropbookCoverMode("choose");
                      }}
                    >
                      ← Cover options
                    </button>
                    <span className="dropbookCoverEditorTitle">Blank Cover</span>
                  </div>
                  <div className="dropbookCoverColorRow">
                    <span className="dropbookCoverColorLabel">Book color</span>
                    <div className="dropbookCoverColorSwatches">
                      {DROPBOOK_BOOK_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={`dropbookColorSwatch ${dropbookCoverBlankColor === color ? "on" : ""}`}
                          style={{ background: color }}
                          aria-label={`Book color ${color}`}
                          onClick={() => pickBookColor(color)}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="dropbookCoverStage capMonitorHost">
                    <BoardArtCanvas
                      operatingTable
                      backgroundImageUrl={coverBlankBackgroundUrl}
                      saveLabel="Save cover →"
                      onSave={commitCoverBlank}
                    />
                  </div>
                </div>
              ) : isDropbookMode &&
                !dropbookCreating &&
                dropbookEditingCover &&
                dropbookCoverMode === "choose" ? (
                <div className="dropbookCoverWorkspace">
                  {renderModeChooseMonitor("Create the identity of your Dropbook.", true)}
                  <div className="dropbookCoverChooseStack">
                    <div className="dropbookCoverChooseHead">
                      <div className="dropbookMonitorLabel">Dropbook Cover</div>
                    </div>
                    <div className="dropbookCoverColorRow dropbookCoverColorRowChoose">
                      <span className="dropbookCoverColorLabel">Book color</span>
                      <div className="dropbookCoverColorSwatches">
                        {DROPBOOK_BOOK_COLORS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            className={`dropbookColorSwatch ${
                              dropbookCover?.bookColorSet && dropbookCover.bookColor === color
                                ? "on"
                                : ""
                            }`}
                            style={{ background: color }}
                            aria-label={`Book color ${color}`}
                            onClick={() => pickBookColor(color)}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="dropbookCoverChooseBtns">
                      <button
                        type="button"
                        className="dropbookCoverChooseBtn"
                        onClick={() => {
                          setDropbookCoverMode("blank");
                          setDropbookCreating(true);
                        }}
                      >
                        <span className="dropbookCoverChooseGlyph" aria-hidden>
                          🎨
                        </span>
                        <span className="dropbookCoverChooseTitle">Blank Cover</span>
                        <span className="dropbookCoverChooseHint">
                          Solid color · draw · paint
                        </span>
                      </button>
                      <button
                        type="button"
                        className="dropbookCoverChooseBtn"
                        onClick={() =>
                          flashSaveNote("Drag any shelf drop onto the Cover slate")
                        }
                      >
                        <span className="dropbookCoverChooseGlyph" aria-hidden>
                          📎
                        </span>
                        <span className="dropbookCoverChooseTitle">Use Existing Drop</span>
                        <span className="dropbookCoverChooseHint">
                          Drag a drop onto Cover
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : isDropbookMode && !dropbookCreating && dropbookIntroPhase === "workspace" ? (
                <div className="dropbookMonitorHost" aria-label="Dropbook workspace">
                  {renderModeChooseMonitor(
                    dropbookCover?.complete
                      ? "Tap here or a + slot to add your next drop."
                      : "Set your cover to begin building your Dropbook.",
                    true,
                    dropbookCover?.complete && !dropbookShelfFull
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
                      : "descript"
                  }
                  initialDoc={isDropbookMode ? dropbookEditingDescriptDoc : null}
                  startInEditor={isDropbookMode && dropbookEditingDescriptDoc !== null}
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
                    isDropbookMode && dropbookCreating ? commitDescriptToDropbook : undefined
                  }
                  shareLabel={
                    isDropbookMode && dropbookCreating ? "Add to Dropbook →" : undefined
                  }
                  defaultDestination={descriptDestination}
                />
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
                              <span className="capSpacer" />
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
                          <VoicePresets src={mediaUrl} onPlayingChange={setAudioPlaying} />
                          <p>Use this voice memo as the audio layer for your Thought Drop.</p>
                        </div>
                      </div>
                      <div className="editActions">
                        {saveNote ? <span className="saveNote">{saveNote}</span> : null}
                        <button type="button" className="studioGhost" onClick={saveToDevice}>
                          ⬇ Save
                        </button>
                        <button type="button" className="studioGhost" onClick={() => void saveToDrafts(false)}>
                          🗂 Drafts
                        </button>
                        <button type="button" className="studioDone" onClick={done}>
                          Use this Vocal →
                        </button>
                      </div>
                    </>
                  ) : drawOpen ? (
                    <div className="capMonitorHost">
                      <BoardArtCanvas
                        operatingTable
                        backgroundImageUrl={mediaUrl}
                        saveLabel="Apply drawing →"
                        onSave={(f) => {
                          commitBlob(f, "image", source);
                          setDrawOpen(false);
                        }}
                      />
                    </div>
                  ) : (
                    <>
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
                      </div>
                      <div className="editActions">
                        {saveNote ? <span className="saveNote">{saveNote}</span> : null}
                        {mediaKind === "image" ? (
                          <button type="button" className="studioGhost" onClick={() => setDrawOpen(true)}>
                            🎨 Draw on photo
                          </button>
                        ) : null}
                        <button type="button" className="studioGhost" onClick={saveToDevice}>
                          ⬇ Save
                        </button>
                        <button type="button" className="studioGhost" onClick={() => void saveToDrafts(false)}>
                          🗂 Drafts
                        </button>
                        <button type="button" className="studioDone" onClick={done}>
                          Use this {mediaKind === "video" ? "Video" : "Vision"} →
                        </button>
                      </div>
                    </>
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
