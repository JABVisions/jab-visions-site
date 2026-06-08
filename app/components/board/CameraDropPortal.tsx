"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./CameraDropPortal.module.css";

type CaptureMode = "photo" | "video";
type FacingMode = "user" | "environment";

type CameraDropPortalProps = {
  open: boolean;
  initialMode: CaptureMode;
  onClose: () => void;
  onCapture: (file: File) => void | Promise<void>;
};

function preferredRecordingMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function extensionForMime(type: string) {
  if (type.includes("mp4")) return "mp4";
  if (type.includes("webm")) return "webm";
  return "mov";
}

const CAMERA_BLOCKED_MESSAGE =
  "Camera access is blocked. Enable camera permissions or upload media instead.";

export default function CameraDropPortal({
  open,
  initialMode,
  onClose,
  onCapture,
}: CameraDropPortalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<CaptureMode>(initialMode);
  const [facingMode, setFacingMode] = useState<FacingMode>("environment");
  const [permissionState, setPermissionState] = useState<"idle" | "requesting" | "ready" | "error">("idle");
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedUrl, setCapturedUrl] = useState("");

  const clearCapture = useCallback(() => {
    setCapturedBlob(null);
    setCapturedUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
  }, []);

  const stopCamera = useCallback(() => {
    recorderRef.current?.state === "recording" && recorderRef.current.stop();
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setRecording(false);
  }, []);

  const startCamera = useCallback(async (nextFacingMode: FacingMode) => {
    stopCamera();
    clearCapture();
    setPermissionState("requesting");
    setError("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setPermissionState("error");
      setError(CAMERA_BLOCKED_MESSAGE);
      return;
    }

    const videoConstraints = {
      facingMode: { ideal: nextFacingMode },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    };

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: mode === "video",
          video: videoConstraints,
        });
      } catch (firstReason) {
        const isPermissionError =
          firstReason instanceof DOMException &&
          (firstReason.name === "NotAllowedError" || firstReason.name === "SecurityError");
        if (mode !== "video" || isPermissionError) throw firstReason;

        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: videoConstraints,
        });
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setPermissionState("ready");
    } catch {
      setPermissionState("error");
      setError(CAMERA_BLOCKED_MESSAGE);
    }
  }, [clearCapture, mode, stopCamera]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) {
      stopCamera();
      clearCapture();
      return;
    }
    setMode(initialMode);
    setFacingMode("environment");
  }, [clearCapture, initialMode, open, stopCamera]);

  useEffect(() => {
    if (!open) return;
    void startCamera(facingMode);
    return stopCamera;
  }, [facingMode, mode, open, startCamera, stopCamera]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  function setCaptured(blob: Blob) {
    setCapturedBlob(blob);
    setCapturedUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(blob);
    });
  }

  function takePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (blob) setCaptured(blob);
    }, "image/jpeg", 0.94);
  }

  function startRecording() {
    if (!streamRef.current || typeof MediaRecorder === "undefined") {
      setError("Video recording is not supported in this browser.");
      return;
    }
    chunksRef.current = [];
    const mimeType = preferredRecordingMimeType();
    const recorder = mimeType
      ? new MediaRecorder(streamRef.current, { mimeType })
      : new MediaRecorder(streamRef.current);
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const type = recorder.mimeType || mimeType || "video/webm";
      setCaptured(new Blob(chunksRef.current, { type }));
      setRecording(false);
    };
    recorder.start();
    setRecording(true);
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  async function useCapture() {
    if (!capturedBlob) return;
    const type = capturedBlob.type || (mode === "photo" ? "image/jpeg" : "video/webm");
    const extension = mode === "photo" ? "jpg" : extensionForMime(type);
    const file = new File([capturedBlob], `board-camera-${Date.now()}.${extension}`, { type });
    await onCapture(file);
    onClose();
  }

  async function useUploadedFallback(file: File | undefined) {
    if (!file) return;
    await onCapture(file);
    onClose();
  }

  if (!mounted || !open) return null;

  return createPortal(
    <div className={styles.overlay} role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className={styles.portal} role="dialog" aria-modal="true" aria-label="Board camera media drop portal">
        <header className={styles.topbar}>
          <div>
            <div className={styles.eyebrow}>Board Camera Signal</div>
            <h2 className={styles.title}>Create a Media Drop</h2>
            <p className={styles.subtitle}>Frame the signal, capture it, then send it into Board.</p>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close camera portal">×</button>
        </header>

        <div className={styles.modeRow} aria-label="Camera capture mode">
          <button type="button" className={`${styles.button} ${mode === "photo" ? styles.active : ""}`} onClick={() => setMode("photo")}>
            Photo
          </button>
          <button type="button" className={`${styles.button} ${mode === "video" ? styles.active : ""}`} onClick={() => setMode("video")}>
            Video
          </button>
          <button
            type="button"
            className={styles.button}
            onClick={() => setFacingMode((current) => current === "environment" ? "user" : "environment")}
            disabled={permissionState === "requesting" || recording}
          >
            Switch to {facingMode === "environment" ? "Front" : "Back"}
          </button>
        </div>

        <article className={styles.dropTile}>
          <div className={styles.dropMeta}>
            <span className={styles.dropBadge}>Media Drop Demo</span>
            <span className={styles.cameraBadge}>{facingMode === "environment" ? "Back Camera" : "Front Camera"}</span>
          </div>
          <div className={styles.viewport}>
            {capturedUrl ? (
              mode === "photo" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className={styles.preview} src={capturedUrl} alt="Captured media preview" />
              ) : (
                <video className={styles.preview} src={capturedUrl} controls playsInline />
              )
            ) : (
              <video
                ref={videoRef}
                className={`${styles.video} ${facingMode === "user" ? styles.mirror : ""}`}
                autoPlay
                muted
                playsInline
              />
            )}
            {permissionState === "requesting" ? <div className={styles.loading}>Waiting for camera permission…</div> : null}
            {permissionState === "error" ? (
              <div className={styles.error}>
                <p>{error}</p>
                <label className={styles.errorUpload}>
                  Upload Media
                  <input
                    type="file"
                    accept="image/*,video/*"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      void useUploadedFallback(file);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>
            ) : null}
            {recording ? <div className={styles.recording}>Recording</div> : null}
          </div>
        </article>

        <footer className={styles.actions}>
          <div className={styles.actionGroup}>
            {capturedBlob ? (
              <button type="button" className={styles.button} onClick={clearCapture}>Retake</button>
            ) : mode === "photo" ? (
              <button type="button" className={styles.primary} onClick={takePhoto} disabled={permissionState !== "ready"}>Capture Photo</button>
            ) : recording ? (
              <button type="button" className={styles.danger} onClick={stopRecording}>Stop Recording</button>
            ) : (
              <button type="button" className={styles.primary} onClick={startRecording} disabled={permissionState !== "ready"}>Start Recording</button>
            )}
          </div>
          <div className={styles.actionGroup}>
            <button type="button" className={styles.button} onClick={onClose}>Cancel</button>
            <button type="button" className={styles.primary} onClick={useCapture} disabled={!capturedBlob}>Use in Drop</button>
          </div>
        </footer>
        <div className={styles.help}>
          Board asks the browser for camera and microphone permission only while this portal is open. Closing it stops the camera stream.
        </div>
      </section>
    </div>,
    document.body,
  );
}
