// File: app/components/board/VoiceRecorder.tsx
// Vocal Mode — record a voice memo straight into a Thought Drop. Captures audio
// with MediaRecorder and hands back a File that flows through the existing
// Thought upload → audio pipeline (rendered as an in-drop voice player).

"use client";

import { useEffect, useRef, useState } from "react";

function pickAudioMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export default function VoiceRecorder({
  onRecorded,
  disabled = false,
}: {
  onRecorded: (file: File) => void;
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);

  function cleanup() {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }

  useEffect(() => cleanup, []);

  async function start() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Recording isn't supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickAudioMime();
      const rec = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];

      rec.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      rec.onstop = () => {
        const type = rec.mimeType || mimeType || "audio/webm";
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(chunksRef.current, { type });
        const file = new File([blob], `voice-memo-${Date.now()}.${ext}`, { type });
        if (file.size > 0) onRecorded(file);
        cleanup();
        setRecording(false);
      };

      recorderRef.current = rec;
      rec.start();
      setRecording(true);
      setElapsed(0);
      timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch {
      setError("Microphone blocked. Allow mic access to record.");
      cleanup();
    }
  }

  function stop() {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(
    elapsed % 60
  ).padStart(2, "0")}`;

  return (
    <div className="voice-recorder">
      <button
        type="button"
        className={`capture-action voice-rec-btn ${recording ? "recording" : ""}`}
        onClick={recording ? stop : start}
        disabled={disabled}
        aria-pressed={recording}
      >
        {recording ? (
          <>
            <span className="voice-rec-dot" aria-hidden /> Stop · {mmss}
          </>
        ) : (
          "Record voice"
        )}
      </button>
      {error ? <span className="voice-rec-error">{error}</span> : null}

      <style jsx>{`
        .voice-recorder {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .voice-rec-btn.recording {
          border-color: rgba(255, 45, 109, 0.55);
          color: #ff2d6d;
          box-shadow: 0 0 0 4px rgba(255, 45, 109, 0.1);
        }
        .voice-rec-dot {
          display: inline-block;
          width: 9px;
          height: 9px;
          border-radius: 999px;
          background: #ff2d6d;
          margin-right: 6px;
          box-shadow: 0 0 10px rgba(255, 45, 109, 0.8);
          animation: voiceRecPulse 1.1s ease-in-out infinite;
          vertical-align: middle;
        }
        .voice-rec-error {
          font-size: 11px;
          font-weight: 800;
          color: #ff2d6d;
        }
        @keyframes voiceRecPulse {
          0%,
          100% {
            opacity: 0.5;
            transform: scale(0.85);
          }
          50% {
            opacity: 1;
            transform: scale(1.1);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .voice-rec-dot {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
