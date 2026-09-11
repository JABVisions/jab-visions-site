"use client";

import { useEffect, useRef, useState } from "react";
import VocalVisualizer from "./VocalVisualizer";

export default function VoiceDropSoundboard({
  src,
  title = "Voice Drop",
  label = "AUDIO DROP",
  compact = false,
  onReload,
}: {
  src: string;
  title?: string;
  label?: string;
  compact?: boolean;
  /** Re-mint the media URL (e.g. an expired Supabase signed URL) and retry. */
  onReload?: () => void | Promise<void>;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [disableVisualizerTap, setDisableVisualizerTap] = useState(true);

  useEffect(() => {
    setPlaying(false);
    setPlaybackError(false);

    try {
      const audioUrl = new URL(src, window.location.href);
      setDisableVisualizerTap(
        (audioUrl.protocol === "http:" || audioUrl.protocol === "https:") &&
          audioUrl.origin !== window.location.origin
      );
    } catch {
      setDisableVisualizerTap(true);
    }
  }, [src]);

  async function reloadAudio() {
    if (reloading) return;
    setReloading(true);
    try {
      // Ask the host for a fresh URL first — a stale signed URL can't be fixed
      // by reloading the same address.
      await onReload?.();
      setPlaybackError(false);
      audioRef.current?.load();
    } finally {
      setReloading(false);
    }
  }

  return (
    <section
      className={`voiceSoundboard ${compact ? "compact" : ""}`}
      aria-label={`${title} audio soundboard`}
    >
      <div className="soundboardTop">
        <span className={`signal ${playing ? "live" : ""}`} aria-hidden />
        <span className="soundboardLabel">{label}</span>
        {playbackError ? (
          <button
            type="button"
            className="soundboardState error retryBtn"
            onClick={() => void reloadAudio()}
            disabled={reloading}
          >
            {reloading ? "RELOADING…" : "RELOAD AUDIO"}
          </button>
        ) : (
          <span className="soundboardState">{playing ? "PLAYING" : "READY"}</span>
        )}
      </div>

      <div className="waveDisplay">
        <div className="waveGrid" aria-hidden />
        <VocalVisualizer
          state={playing ? "playback" : "saved"}
          playbackAudioRef={audioRef}
          disableTap={disableVisualizerTap}
        />
      </div>

      <div className="soundboardTitle">{title}</div>
      <audio
        ref={audioRef}
        className="soundboardAudio"
        src={src}
        controls
        playsInline
        preload="metadata"
        onCanPlay={() => setPlaybackError(false)}
        onPlay={() => {
          setPlaybackError(false);
          setPlaying(true);
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => {
          setPlaying(false);
          setPlaybackError(true);
        }}
      />
      {playbackError ? (
        <div className="soundboardError" role="alert">
          This audio could not load. The media link may have expired — reload to get a
          fresh one.
          <span className="soundboardErrorActions">
            <button type="button" onClick={() => void reloadAudio()} disabled={reloading}>
              {reloading ? "Reloading…" : "Reload"}
            </button>
            <a href={src} target="_blank" rel="noreferrer">
              Open audio
            </a>
          </span>
        </div>
      ) : null}

      <style jsx>{`
        .voiceSoundboard {
          position: relative;
          display: grid;
          gap: 10px;
          width: 100%;
          box-sizing: border-box;
          overflow: hidden;
          border: 1px solid rgba(113, 244, 232, 0.34);
          border-radius: 20px;
          padding: 12px;
          color: #eafffb;
          background:
            radial-gradient(circle at 18% 0%, rgba(76, 237, 219, 0.17), transparent 43%),
            linear-gradient(155deg, rgba(7, 29, 37, 0.98), rgba(5, 8, 20, 0.98));
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 14px 34px rgba(0, 0, 0, 0.28);
        }
        .soundboardTop {
          display: flex;
          align-items: center;
          gap: 7px;
          min-width: 0;
        }
        .signal {
          width: 7px;
          height: 7px;
          flex: 0 0 auto;
          border-radius: 50%;
          background: #5cebd9;
          box-shadow: 0 0 10px rgba(92, 235, 217, 0.7);
        }
        .signal.live {
          background: #ff63d2;
          box-shadow: 0 0 13px rgba(255, 74, 202, 0.9);
          animation: voicePulse 900ms ease-in-out infinite alternate;
        }
        .soundboardLabel,
        .soundboardState {
          font-size: 9px;
          font-weight: 950;
          letter-spacing: 0.18em;
        }
        .soundboardLabel { color: #8effed; }
        .soundboardState { margin-left: auto; color: rgba(224, 255, 250, 0.48); }
        .soundboardState.error { color: #ff9fdc; }
        .retryBtn {
          border: 0;
          padding: 0;
          background: none;
          font: inherit;
          letter-spacing: inherit;
          cursor: pointer;
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .retryBtn:disabled { cursor: progress; opacity: 0.7; }
        .waveDisplay {
          position: relative;
          height: 118px;
          overflow: hidden;
          border: 1px solid rgba(130, 248, 235, 0.2);
          border-radius: 14px;
          background: rgba(2, 11, 21, 0.82);
        }
        .waveGrid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(102, 240, 224, 0.055) 1px, transparent 1px),
            linear-gradient(90deg, rgba(102, 240, 224, 0.055) 1px, transparent 1px);
          background-size: 18px 18px;
          pointer-events: none;
        }
        .soundboardTitle {
          overflow: hidden;
          font-size: 12px;
          font-weight: 850;
          letter-spacing: 0.02em;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .soundboardAudio { width: 100%; height: 36px; }
        .soundboardError {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          border: 1px solid rgba(255, 99, 210, 0.28);
          border-radius: 12px;
          padding: 9px 10px;
          color: rgba(234, 255, 251, 0.76);
          background: rgba(255, 99, 210, 0.08);
          font-size: 11px;
          line-height: 1.4;
        }
        .soundboardErrorActions {
          display: inline-flex;
          align-items: center;
          gap: 12px;
        }
        .soundboardError a,
        .soundboardError button {
          border: 0;
          padding: 0;
          background: none;
          color: #8effed;
          font-family: inherit;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.06em;
          text-decoration: none;
          text-transform: uppercase;
          cursor: pointer;
        }
        .soundboardError button:disabled { cursor: progress; opacity: 0.7; }
        .voiceSoundboard.compact { gap: 8px; padding: 10px; border-radius: 16px; }
        .voiceSoundboard.compact .waveDisplay { height: 88px; }
        @keyframes voicePulse { from { transform: scale(0.82); } to { transform: scale(1.18); } }
      `}</style>
    </section>
  );
}
