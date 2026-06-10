// File: app/components/board/DropStudioStage.tsx
// Drop Studio — Board's creation sheet. A single full-screen liquid-glass
// surface that IS the camera and the editor: live capture (photo/video) or
// upload, then a TikTok-style editor (Text · Stickers · Effects) over the shot.
// No separate demo camera. Mounted as a fixed overlay, never inside a column.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import DropStudio from "./DropStudio";
import BoardArtCanvas from "./BoardArtCanvas";
import { BOARD_DROP_ASPECT_CSS, BOARD_DROP_ASPECT_RATIO } from "@/lib/board/mediaFormat";
import type { DropCustomization } from "@/lib/board/dropCustomizations";
import { saveDropDraft, draftToFile, type DropDraft } from "@/lib/board/dropDrafts";
import DropDraftsDrawer from "./DropDraftsDrawer";
import VocalVisualizer from "./VocalVisualizer";
import VoicePresets from "./VoicePresets";

type CaptureMode = "photo" | "video" | "audio" | "art";
type FacingMode = "user" | "environment";
type Phase = "choose" | "capture" | "edit";

const DEFAULT_CAPTURE_MODES: CaptureMode[] = ["photo", "video"];
// Every media mode shows in the rail; ones not allowed for this drop are locked.
const ALL_STUDIO_MODES: CaptureMode[] = ["photo", "video", "audio", "art"];

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
  return "Vision";
}

function modeGlyph(mode: CaptureMode) {
  if (mode === "audio") return "🎙️";
  if (mode === "video") return "🎬";
  if (mode === "art") return "🎨";
  return "👁️";
}

export default function DropStudioStage({
  open,
  initialFile,
  value,
  onChange,
  onComplete,
  onClose,
  allowedModes = DEFAULT_CAPTURE_MODES,
  initialMode = "photo",
}: {
  open: boolean;
  initialFile: File | null;
  value: DropCustomization;
  onChange: (next: DropCustomization) => void;
  onComplete: (file: File, source: "capture" | "upload") => void;
  onClose: () => void;
  allowedModes?: CaptureMode[];
  initialMode?: CaptureMode;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileRef = useRef<File | null>(null);
  const urlRef = useRef<string>("");

  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<Phase>("choose");
  const [mode, setMode] = useState<CaptureMode>(initialMode);
  const [facing, setFacing] = useState<FacingMode>("environment");
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaKind, setMediaKind] = useState<"image" | "video" | "audio">("image");
  const [source, setSource] = useState<"capture" | "upload">("capture");
  // Draw-on-photo: reuse the Art canvas seeded with the current image.
  const [drawOpen, setDrawOpen] = useState(false);
  // Save feature: device download, Drafts, and auto-save on capture.
  const draftIdRef = useRef<string>("");
  const [saveNote, setSaveNote] = useState("");
  const saveNoteTimerRef = useRef<number | null>(null);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);

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

  const setMedia = useCallback((url: string, kind: "image" | "video" | "audio") => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = url;
    setMediaUrl(url);
    setMediaKind(kind);
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
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(file);
      urlRef.current = url;
      setMediaUrl(url);
      setMediaKind(draft.kind);
      setSource("upload");
      draftIdRef.current = draft.id; // re-saving updates this same draft
      stopCamera();
      setPhase("edit");
      setDraftsOpen(false);
    },
    [stopCamera]
  );

  const startCamera = useCallback(
    async (nextFacing: FacingMode) => {
      stopCamera();
      setError("");
      if (mode === "audio" || mode === "art") return;
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
  useEffect(() => {
    if (!open) {
      stopCamera();
      return;
    }
    document.body.style.overflow = "hidden";
    setDrawOpen(false);
    const safeMode = allowedModes.includes(initialMode) ? initialMode : allowedModes[0] ?? "photo";
    setMode(safeMode);
    if (initialFile) {
      fileRef.current = initialFile;
      setMedia(
        URL.createObjectURL(initialFile),
        initialFile.type.startsWith("audio/")
          ? "audio"
          : initialFile.type.startsWith("video/")
            ? "video"
            : "image"
      );
      setSource("upload");
      setPhase("edit");
    } else {
      fileRef.current = null;
      setPhase("choose");
    }
    return () => {
      document.body.style.overflow = "";
    };
    // allowedModes is intentionally tracked via the stable allowedModesKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFile, setMedia, stopCamera, allowedModesKey, initialMode]);

  // Run the live camera only while in capture phase for camera modes.
  useEffect(() => {
    if (!open || phase !== "capture" || mode === "audio" || mode === "art") return;
    void startCamera(facing);
    return stopCamera;
  }, [open, phase, facing, mode, startCamera, stopCamera]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Cleanup the object URL on unmount.
  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  // Portal to <body> so the studio escapes the profile board's transformed
  // stacking context and floats above the navbar/dock (was being clipped).
  useEffect(() => setMounted(true), []);

  function commitBlob(blob: Blob, kind: "image" | "video" | "audio", src: "capture" | "upload") {
    const type =
      blob.type ||
      (kind === "image" ? "image/jpeg" : kind === "audio" ? "audio/webm" : "video/webm");
    const ext = kind === "image" ? "jpg" : kind === "audio" ? audioExtForMime(type) : extForMime(type);
    const base = kind === "audio" ? "board-vocal" : "board-vision";
    fileRef.current = new File([blob], `${base}-${Date.now()}.${ext}`, { type });
    setMedia(URL.createObjectURL(blob), kind);
    setSource(src);
    stopCamera();
    setPhase("edit");
    draftIdRef.current = "";
    void saveToDrafts(true);
  }

  function takePhoto() {
    const v = videoRef.current;
    if (!v || !v.videoWidth || !v.videoHeight) return;
    // Cover-crop the live frame to the standard Board Drop ratio so the saved
    // photo matches exactly what's framed in the viewport (WYSIWYG).
    const ratio = BOARD_DROP_ASPECT_RATIO; // width / height
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
    const c = document.createElement("canvas");
    c.width = Math.round(sw);
    c.height = Math.round(sh);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    // The front ("user") camera is previewed mirrored (see .capVideo.mirror), so
    // mirror the saved frame too — the photo then matches exactly what was framed
    // on screen instead of flipping after capture.
    if (facing === "user") {
      ctx.translate(c.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height);
    c.toBlob((b) => b && commitBlob(b, "image", "capture"), "image/jpeg", 0.94);
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

  function onUpload(f: File | undefined) {
    if (!f) return;
    fileRef.current = f;
    setMedia(
      URL.createObjectURL(f),
      f.type.startsWith("audio/")
        ? "audio"
        : f.type.startsWith("video/")
          ? "video"
          : "image"
    );
    setSource("upload");
    stopCamera();
    setPhase("edit");
    draftIdRef.current = "";
    void saveToDrafts(true);
  }

  function retake() {
    fileRef.current = null;
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = "";
    }
    setMediaUrl("");
    setDrawOpen(false);
    setAudioPlaying(false);
    setPhase("capture");
  }

  function done() {
    if (fileRef.current) onComplete(fileRef.current, source);
    onClose();
  }

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="studioStage"
      role="dialog"
      aria-modal="true"
      aria-label="Drop Studio"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="studioSheet">
        <div className="studioBar">
          <div className="studioBarLeft">
            <div className="studioBrand">
              <span className="studioDot" aria-hidden />
              DROP STUDIO
            </div>
            <span className="studioPill">
              {phase === "edit"
                ? `${modeLabel(mode)} Tools`
                : phase === "capture"
                  ? "Capture Mode"
                  : "New Drop"}
            </span>
          </div>
          <div className="studioBarRight">
            <button
              type="button"
              className="studioGhost"
              onClick={() => setDraftsOpen(true)}
              aria-label="Open drafts"
            >
              🗂 Drafts
            </button>
            {phase === "edit" ? (
              <button type="button" className="studioGhost" onClick={retake}>
                Retake
              </button>
            ) : null}
            <button type="button" className="studioGhost" onClick={onClose} aria-label="Close Drop Studio">
              ✕
            </button>
          </div>
        </div>

        <div className="studioBody">
          {/* One surface: the mode rail stays put while the center moves between
              live capture and editing, so editing feels continuous with shooting. */}
          <div className="capStage">
            <nav className="modeRail" aria-label="Drop Studio modes">
              {ALL_STUDIO_MODES.map((m) => {
                const enabled = allowedModes.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    className={`modeRailBtn ${mode === m ? "on" : ""} ${enabled ? "" : "locked"}`}
                    onClick={() => {
                      if (!enabled) return;
                      // Switching mode mid-edit returns to live capture in that mode.
                      if (phase === "edit") retake();
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

            <div className="capMain">
              {phase === "choose" ? (
                <div className="capChoose">
                  <div className="capChooseInner">
                    <div className="capChooseGlyphBig" aria-hidden>
                      {modeGlyph(mode)}
                    </div>
                    <div className="capChooseTitle">{modeLabel(mode)} Drop</div>
                    <p className="capChooseSub">
                      Capture something live, or upload from your device — then make it yours in
                      Drop Studio.
                    </p>
                    <div className="capChooseBtns">
                      <label className="capChooseBtn upload">
                        <span className="capChooseGlyph" aria-hidden>
                          📤
                        </span>
                        <span>Upload</span>
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
                        className="capChooseBtn capture"
                        onClick={() => setPhase("capture")}
                      >
                        <span className="capChooseGlyph" aria-hidden>
                          {mode === "audio" ? "🎙️" : mode === "art" ? "🎨" : "📸"}
                        </span>
                        <span>{mode === "audio" ? "Record" : mode === "art" ? "Draw" : "Capture"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : phase === "capture" ? (
                <>
                  <div className={`capViewport ${mode === "photo" || mode === "video" ? "framed" : ""}`}>
                    {mode === "art" ? (
                      <BoardArtCanvas onSave={(f) => commitBlob(f, "image", "capture")} />
                    ) : mode === "audio" ? (
                      <div className="vocalStage">
                        <div className="vocalViz">
                          <VocalVisualizer
                            state={recording ? "recording" : "idle"}
                            stream={recording ? streamRef.current : null}
                          />
                        </div>
                        <div className="vocalCopyBlock">
                          <div className="vocalTitle">Voice Mode</div>
                          <p className="vocalCopy">
                            Record a voice memo thought. Board attaches it as audio when you use this drop.
                          </p>
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
                  </div>

                  {mode === "art" ? null : (
                    <div className="capControls">
                      <div className="capActionRow">
                        <label className="capUpload">
                          Upload
                          <input
                            type="file"
                            accept={
                              allowedModes.includes("audio") && allowedModes.includes("photo") && !allowedModes.includes("video")
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
                            <button type="button" className="capShutter recording" onClick={stopRecording} aria-label="Stop vocal recording" />
                          ) : (
                            <button type="button" className="capShutter vocal" onClick={startVocalRecording} aria-label="Start vocal recording" />
                          )
                        ) : mode === "photo" ? (
                          <button type="button" className="capShutter" onClick={takePhoto} aria-label="Capture photo" />
                        ) : recording ? (
                          <button type="button" className="capShutter recording" onClick={stopRecording} aria-label="Stop recording" />
                        ) : (
                          <button type="button" className="capShutter video" onClick={startRecording} aria-label="Start recording" />
                        )}

                        {mode === "audio" ? (
                          <span className="capSpacer" />
                        ) : (
                          <button
                            type="button"
                            className="capFlip"
                            onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
                            disabled={recording}
                          >
                            Flip
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </>
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
                    // Draw on the photo with the exact Art Mode tools, then bake it in.
                    <div className="capEditCanvas">
                      <BoardArtCanvas
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
                        <DropStudio mediaUrl={mediaUrl} mediaKind={mediaKind} value={value} onChange={onChange} hideHeader sheet />
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

      <DropDraftsDrawer
        open={draftsOpen}
        onClose={() => setDraftsOpen(false)}
        onOpenDraft={openDraft}
      />

      <style jsx>{`
        .studioStage {
          position: fixed;
          inset: 0;
          /* Above the board navbar/dock and other floating board UI so the
             studio is never clipped by them, especially on mobile. */
          z-index: 100050;
          display: grid;
          place-items: center;
          /* Respect notches and the home-indicator / browser chrome so the sheet
             (and its top bar + bottom "Use" button) stay fully on-screen. */
          padding: max(10px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right))
            max(10px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
          background:
            radial-gradient(circle at 22% 14%, rgba(126, 226, 255, 0.16), transparent 34%),
            radial-gradient(circle at 80% 16%, rgba(255, 0, 190, 0.14), transparent 32%),
            rgba(6, 10, 16, 0.72);
          backdrop-filter: blur(12px);
        }
        .studioSheet {
          width: min(560px, calc(100vw - 20px));
          /* Size against the dynamic viewport minus the safe-area padding the
             stage already applies, so the sheet never extends under the dock,
             navbar, notch, or home indicator on mobile. Taller cap + slimmer
             margins give the monitor and the attachment drawer more room. */
          height: min(
            880px,
            calc(100dvh - 20px - env(safe-area-inset-top) - env(safe-area-inset-bottom))
          );
          max-height: calc(100dvh - 20px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
          display: grid;
          grid-template-rows: auto 1fr;
          border-radius: 28px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background:
            linear-gradient(150deg, rgba(255, 255, 255, 0.1), rgba(0, 0, 0, 0.32)),
            rgba(9, 13, 19, 0.86);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.22),
            0 0 50px rgba(126, 226, 255, 0.18),
            0 30px 90px rgba(0, 0, 0, 0.55);
        }
        .studioBar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.05);
        }
        .studioBarLeft {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }
        .studioBrand {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 0.22em;
          color: rgba(255, 255, 255, 0.92);
        }
        .studioPill {
          font-size: 9px;
          font-weight: 950;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          padding: 5px 9px;
          border-radius: 999px;
          color: #06121a;
          background: radial-gradient(circle at 30% 20%, #fff, #7ee2ff);
          border: 1px solid rgba(255, 255, 255, 0.5);
          box-shadow: 0 0 12px rgba(126, 226, 255, 0.4);
          white-space: nowrap;
        }
        .studioDot {
          width: 9px;
          height: 9px;
          border-radius: 999px;
          background: radial-gradient(circle at 35% 30%, #fff, #7ee2ff);
          box-shadow: 0 0 12px rgba(126, 226, 255, 0.8);
        }
        .studioBarRight {
          display: inline-flex;
          gap: 8px;
        }
        .studioGhost {
          border-radius: 999px;
          padding: 7px 13px;
          font-size: 12px;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.86);
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          cursor: pointer;
        }
        .studioBody {
          min-height: 0;
          display: grid;
        }

        /* ---- capture phase ---- */
        .capStage {
          display: grid;
          grid-template-columns: 92px 1fr;
          min-height: 0;
        }
        .modeRail {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 12px 8px;
          background: rgba(255, 255, 255, 0.04);
          border-right: 1px solid rgba(255, 255, 255, 0.1);
          overflow: auto;
        }
        .modeRailBtn {
          display: grid;
          justify-items: center;
          gap: 4px;
          padding: 10px 4px;
          border-radius: 16px;
          border: 1px solid transparent;
          background: rgba(255, 255, 255, 0.05);
          color: rgba(255, 255, 255, 0.7);
          cursor: pointer;
        }
        .modeRailBtn.on {
          color: #06121a;
          background: radial-gradient(circle at 30% 20%, #fff, #7ee2ff);
          border-color: rgba(255, 255, 255, 0.5);
          box-shadow: 0 0 16px rgba(126, 226, 255, 0.4);
        }
        .modeRailBtn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .modeGlyph {
          font-size: 18px;
          line-height: 1;
        }
        .modeName {
          font-size: 9px;
          font-weight: 950;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .capMain {
          display: grid;
          grid-template-rows: 1fr auto;
          min-height: 0;
        }
        .capFlip {
          justify-self: end;
          border-radius: 999px;
          padding: 9px 14px;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.82);
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          cursor: pointer;
        }
        @media (max-width: 560px) {
          .capStage {
            grid-template-columns: 1fr;
            grid-template-rows: auto 1fr;
          }
          .modeRail {
            flex-direction: row;
            border-right: 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            overflow-x: auto;
          }
          .modeRailBtn {
            flex: 1 0 auto;
          }
        }
        .capViewport {
          position: relative;
          min-height: 0;
          width: 100%;
          height: 100%;
          background: #000;
          display: grid;
          place-items: center;
          overflow: hidden;
          border-radius: 14px;
        }
        /* Camera modes lock to the standard Board Drop frame. Height-driven so
           the frame always fits and the controls below stay reachable. */
        .capViewport.framed {
          aspect-ratio: ${BOARD_DROP_ASPECT_CSS};
          height: 100%;
          width: auto;
          max-width: 100%;
          margin: 0 auto;
        }
        .capVideo {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .capVideo.mirror {
          transform: scaleX(-1);
        }
        .vocalStage {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 10px 12px 16px;
          align-items: center;
          justify-content: center;
          text-align: center;
          color: rgba(236, 255, 251, 0.94);
        }
        .vocalViz {
          flex: 1 1 auto;
          min-height: 120px;
          width: 100%;
        }
        .vocalCopyBlock {
          flex: 0 0 auto;
        }
        .reviewViz {
          width: 100%;
          height: clamp(150px, 30vh, 260px);
        }
        .vocalOrb {
          width: 146px;
          height: 146px;
          display: grid;
          place-items: center;
          border-radius: 999px;
          border: 1px solid rgba(126, 226, 255, 0.38);
          background:
            radial-gradient(circle at 34% 26%, rgba(255, 255, 255, 0.38), transparent 16%),
            radial-gradient(circle, rgba(126, 226, 255, 0.26), rgba(255, 0, 190, 0.08) 54%, rgba(0, 0, 0, 0.32));
          box-shadow:
            0 0 44px rgba(126, 226, 255, 0.22),
            inset 0 0 32px rgba(255, 255, 255, 0.08);
        }
        .vocalOrb span {
          width: 54px;
          height: 54px;
          border-radius: 999px;
          background: radial-gradient(circle at 35% 30%, #fff, #7ee2ff);
          box-shadow: 0 0 26px rgba(126, 226, 255, 0.65);
        }
        .vocalOrb.recording {
          border-color: rgba(255, 45, 109, 0.64);
          box-shadow:
            0 0 0 14px rgba(255, 45, 109, 0.07),
            0 0 44px rgba(255, 45, 109, 0.24),
            inset 0 0 32px rgba(255, 255, 255, 0.08);
          animation: shutterPulse 1.1s ease-in-out infinite;
        }
        .vocalTitle {
          font-size: 1.45rem;
          font-weight: 950;
          letter-spacing: 0;
        }
        .vocalCopy {
          margin: 8px 0 0;
          color: rgba(236, 255, 251, 0.66);
          font-size: 0.9rem;
          line-height: 1.55;
        }
        .capError {
          position: absolute;
          inset: auto 16px 16px;
          padding: 10px 12px;
          border-radius: 14px;
          background: rgba(255, 45, 109, 0.16);
          border: 1px solid rgba(255, 45, 109, 0.4);
          color: #ffd7e3;
          font-size: 12px;
          font-weight: 800;
          text-align: center;
        }
        /* ---- choose phase (Upload / Capture before capture mode) ---- */
        .capChoose {
          display: grid;
          place-items: center;
          height: 100%;
          padding: 22px;
        }
        .capChooseInner {
          display: grid;
          justify-items: center;
          gap: 10px;
          text-align: center;
          max-width: 360px;
        }
        .capChooseGlyphBig {
          font-size: 46px;
          line-height: 1;
          filter: drop-shadow(0 0 22px rgba(126, 226, 255, 0.4));
        }
        .capChooseTitle {
          font-size: 1.3rem;
          font-weight: 950;
          color: rgba(255, 255, 255, 0.95);
        }
        .capChooseSub {
          margin: 0;
          font-size: 13px;
          line-height: 1.5;
          color: rgba(236, 255, 251, 0.6);
        }
        .capChooseBtns {
          margin-top: 10px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          width: 100%;
        }
        .capChooseBtn {
          display: grid;
          justify-items: center;
          gap: 8px;
          padding: 20px 12px;
          border-radius: 22px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background:
            radial-gradient(circle at 30% 18%, rgba(255, 255, 255, 0.12), transparent 55%),
            rgba(255, 255, 255, 0.06);
          color: rgba(245, 252, 255, 0.94);
          font-size: 13px;
          font-weight: 950;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          cursor: pointer;
          transition: transform 150ms ease, box-shadow 150ms ease, background 150ms ease;
        }
        .capChooseBtn:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
          background:
            radial-gradient(circle at 30% 18%, rgba(255, 255, 255, 0.18), transparent 55%),
            rgba(89, 240, 216, 0.14);
        }
        .capChooseBtn.capture {
          border-color: rgba(126, 226, 255, 0.5);
          box-shadow: 0 0 22px rgba(126, 226, 255, 0.2);
        }
        .capChooseBtn input {
          display: none;
        }
        .capChooseGlyph {
          font-size: 28px;
          line-height: 1;
        }

        .capControls {
          display: grid;
          gap: 12px;
          padding: 14px 16px 18px;
          background: rgba(0, 0, 0, 0.3);
        }
        .capModes {
          display: inline-flex;
          gap: 8px;
          justify-content: center;
        }
        .capChip {
          border-radius: 999px;
          padding: 7px 14px;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.78);
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.18);
          cursor: pointer;
        }
        .capChip.on {
          color: #06121a;
          background: radial-gradient(circle at 30% 20%, #fff, #7ee2ff);
          border-color: rgba(255, 255, 255, 0.55);
        }
        .capActionRow {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
        }
        .capUpload {
          justify-self: start;
          border-radius: 999px;
          padding: 9px 14px;
          font-size: 12px;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.86);
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          cursor: pointer;
        }
        .capUpload input {
          display: none;
        }
        .capSpacer {
          display: block;
        }
        .capShutter {
          justify-self: center;
          width: 70px;
          height: 70px;
          border-radius: 999px;
          border: 4px solid rgba(255, 255, 255, 0.92);
          background: radial-gradient(circle at 35% 30%, #fff, #cfeeff);
          box-shadow: 0 0 24px rgba(126, 226, 255, 0.5);
          cursor: pointer;
        }
        .capShutter.video {
          background: radial-gradient(circle at 35% 30%, #fff, #ff9ad1);
          box-shadow: 0 0 24px rgba(255, 45, 109, 0.45);
        }
        .capShutter.vocal {
          background: radial-gradient(circle at 35% 30%, #fff, #7ee2ff 54%, #ff9ad1);
          box-shadow:
            0 0 24px rgba(126, 226, 255, 0.46),
            0 0 34px rgba(255, 45, 190, 0.18);
        }
        .capShutter.recording {
          background: #ff2d6d;
          border-color: #ff2d6d;
          animation: shutterPulse 1.1s ease-in-out infinite;
        }
        @keyframes shutterPulse {
          0%,
          100% {
            box-shadow: 0 0 0 0 rgba(255, 45, 109, 0.5);
          }
          50% {
            box-shadow: 0 0 0 12px rgba(255, 45, 109, 0);
          }
        }

        /* ---- edit phase ---- */
        .editStage,
        .capEdit {
          min-height: 0;
          overflow: hidden;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        /* The monitor + tools + attachment panel scroll together as one surface,
           so the whole panel (stickers, effects, etc.) is always reachable. */
        .capEditScroll {
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
          display: grid;
          gap: 14px;
          align-content: start;
          padding-right: 2px;
          /* Clearance so the last items in the attachment panel (layer list,
             enhance copy, etc.) fully scroll into view above the pinned actions. */
          padding-bottom: 14px;
        }
        /* The action buttons stay pinned below the scroll area so "Use this …"
           is always visible no matter how far you scroll the panel. */
        .capEditCanvas {
          flex: 1 1 auto;
          min-height: 0;
          display: flex;
        }
        /* Full-height host for the editor when it runs the draggable attachment
           bottom-sheet — the sheet anchors to the bottom of this area. */
        .capStudioHost {
          flex: 1 1 auto;
          min-height: 0;
          display: flex;
          flex-direction: column;
        }
        .vocalReview {
          display: grid;
          gap: 16px;
          border-radius: 24px;
          border: 1px solid rgba(126, 226, 255, 0.28);
          padding: 20px;
          background:
            radial-gradient(circle at 20% 0%, rgba(126, 226, 255, 0.16), transparent 34%),
            rgba(255, 255, 255, 0.07);
          box-shadow:
            0 0 30px rgba(126, 226, 255, 0.16),
            inset 0 0 24px rgba(255, 255, 255, 0.04);
        }
        .vocalReview audio {
          width: 100%;
        }
        .vocalReview p {
          margin: 0;
          color: rgba(236, 255, 251, 0.68);
          font-size: 0.86rem;
          line-height: 1.5;
        }
        .editActions {
          flex: 0 0 auto;
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
        }
        .saveNote {
          width: 100%;
          text-align: center;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          color: rgba(150, 255, 240, 0.92);
          text-shadow: 0 0 12px rgba(120, 255, 234, 0.4);
        }
        .studioDone {
          justify-self: center;
          border-radius: 999px;
          padding: 12px 26px;
          font-size: 13px;
          font-weight: 950;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #06121a;
          background: radial-gradient(circle at 30% 20%, #fff, #7ee2ff);
          border: 1px solid rgba(255, 255, 255, 0.5);
          box-shadow: 0 0 22px rgba(126, 226, 255, 0.45);
          cursor: pointer;
        }
        @media (prefers-reduced-motion: reduce) {
          .capShutter.recording {
            animation: none;
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
