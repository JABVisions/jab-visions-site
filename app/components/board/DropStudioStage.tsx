// File: app/components/board/DropStudioStage.tsx
// Drop Studio — Board's creation sheet. A single full-screen liquid-glass
// surface that IS the camera and the editor: live capture (photo/video) or
// upload, then a TikTok-style editor (Text · Stickers · Effects) over the shot.
// No separate demo camera. Mounted as a fixed overlay, never inside a column.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DropStudio from "./DropStudio";
import type { DropCustomization } from "@/lib/board/dropCustomizations";

type CaptureMode = "photo" | "video";
type FacingMode = "user" | "environment";
type Phase = "capture" | "edit";

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

export default function DropStudioStage({
  open,
  initialFile,
  value,
  onChange,
  onComplete,
  onClose,
}: {
  open: boolean;
  initialFile: File | null;
  value: DropCustomization;
  onChange: (next: DropCustomization) => void;
  onComplete: (file: File, source: "capture" | "upload") => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileRef = useRef<File | null>(null);
  const urlRef = useRef<string>("");

  const [phase, setPhase] = useState<Phase>("capture");
  const [mode, setMode] = useState<CaptureMode>("photo");
  const [facing, setFacing] = useState<FacingMode>("environment");
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaKind, setMediaKind] = useState<"image" | "video">("image");
  const [source, setSource] = useState<"capture" | "upload">("capture");

  const setMedia = useCallback((url: string, kind: "image" | "video") => {
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

  const startCamera = useCallback(
    async (nextFacing: FacingMode) => {
      stopCamera();
      setError("");
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

  // Open/close lifecycle: lock scroll, choose starting phase.
  useEffect(() => {
    if (!open) {
      stopCamera();
      return;
    }
    document.body.style.overflow = "hidden";
    if (initialFile) {
      fileRef.current = initialFile;
      setMedia(URL.createObjectURL(initialFile), initialFile.type.startsWith("video/") ? "video" : "image");
      setSource("upload");
      setPhase("edit");
    } else {
      fileRef.current = null;
      setPhase("capture");
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open, initialFile, setMedia, stopCamera]);

  // Run the live camera only while in capture phase.
  useEffect(() => {
    if (!open || phase !== "capture") return;
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

  function commitBlob(blob: Blob, kind: "image" | "video", src: "capture" | "upload") {
    const type = blob.type || (kind === "image" ? "image/jpeg" : "video/webm");
    const ext = kind === "image" ? "jpg" : extForMime(type);
    fileRef.current = new File([blob], `board-vision-${Date.now()}.${ext}`, { type });
    setMedia(URL.createObjectURL(blob), kind);
    setSource(src);
    stopCamera();
    setPhase("edit");
  }

  function takePhoto() {
    const v = videoRef.current;
    if (!v || !v.videoWidth || !v.videoHeight) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, c.width, c.height);
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
  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  function onUpload(f: File | undefined) {
    if (!f) return;
    fileRef.current = f;
    setMedia(URL.createObjectURL(f), f.type.startsWith("video/") ? "video" : "image");
    setSource("upload");
    stopCamera();
    setPhase("edit");
  }

  function retake() {
    fileRef.current = null;
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = "";
    }
    setMediaUrl("");
    setPhase("capture");
  }

  function done() {
    if (fileRef.current) onComplete(fileRef.current, source);
    onClose();
  }

  if (!open) return null;

  return (
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
          <div className="studioBrand">
            <span className="studioDot" aria-hidden />
            DROP STUDIO
          </div>
          <div className="studioBarRight">
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
          {phase === "capture" ? (
            <div className="capStage">
              <div className="capViewport">
                <video
                  ref={videoRef}
                  className={`capVideo ${facing === "user" ? "mirror" : ""}`}
                  autoPlay
                  muted
                  playsInline
                />
                {error ? <div className="capError">{error}</div> : null}
              </div>

              <div className="capControls">
                <div className="capModes">
                  <button
                    type="button"
                    className={`capChip ${mode === "photo" ? "on" : ""}`}
                    onClick={() => setMode("photo")}
                    disabled={recording}
                  >
                    Photo
                  </button>
                  <button
                    type="button"
                    className={`capChip ${mode === "video" ? "on" : ""}`}
                    onClick={() => setMode("video")}
                    disabled={recording}
                  >
                    Video
                  </button>
                  <button
                    type="button"
                    className="capChip"
                    onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
                    disabled={recording}
                  >
                    Flip
                  </button>
                </div>

                <div className="capActionRow">
                  <label className="capUpload">
                    Upload
                    <input
                      type="file"
                      accept="image/*,video/*"
                      onChange={(e) => {
                        onUpload(e.currentTarget.files?.[0]);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>

                  {mode === "photo" ? (
                    <button type="button" className="capShutter" onClick={takePhoto} aria-label="Capture photo" />
                  ) : recording ? (
                    <button type="button" className="capShutter recording" onClick={stopRecording} aria-label="Stop recording" />
                  ) : (
                    <button type="button" className="capShutter video" onClick={startRecording} aria-label="Start recording" />
                  )}

                  <span className="capSpacer" />
                </div>
              </div>
            </div>
          ) : (
            <div className="editStage">
              <DropStudio mediaUrl={mediaUrl} mediaKind={mediaKind} value={value} onChange={onChange} />
              <button type="button" className="studioDone" onClick={done}>
                Use this Vision →
              </button>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .studioStage {
          position: fixed;
          inset: 0;
          z-index: 95;
          display: grid;
          place-items: center;
          padding: 14px;
          background:
            radial-gradient(circle at 22% 14%, rgba(126, 226, 255, 0.16), transparent 34%),
            radial-gradient(circle at 80% 16%, rgba(255, 0, 190, 0.14), transparent 32%),
            rgba(6, 10, 16, 0.72);
          backdrop-filter: blur(12px);
        }
        .studioSheet {
          width: min(560px, calc(100vw - 20px));
          height: min(900px, calc(100vh - 20px));
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
        .studioBrand {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 0.22em;
          color: rgba(255, 255, 255, 0.92);
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
          grid-template-rows: 1fr auto;
          min-height: 0;
        }
        .capViewport {
          position: relative;
          min-height: 0;
          background: #000;
          display: grid;
          place-items: center;
          overflow: hidden;
        }
        .capVideo {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .capVideo.mirror {
          transform: scaleX(-1);
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
        .editStage {
          min-height: 0;
          overflow: auto;
          padding: 16px;
          display: grid;
          gap: 14px;
          align-content: start;
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
    </div>
  );
}
