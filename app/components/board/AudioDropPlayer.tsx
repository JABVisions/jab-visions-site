"use client";

import { useState } from "react";
import VocalVisualizer from "./VocalVisualizer";

/**
 * Plays a recorded audio drop with the thin, pointy vocal waveform shown above
 * the controls — so voice/audio drops feel alive in the feed and anywhere on
 * Board. The waveform animates a "playing" wave while the clip plays and rests
 * to its quiet "saved" identity when paused.
 */
export default function AudioDropPlayer({
  src,
  autoPlay = false,
  onError,
}: {
  src: string;
  autoPlay?: boolean;
  onError?: () => void;
}) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="adp">
      <div className="adpViz">
        <VocalVisualizer state={playing ? "playback" : "saved"} />
      </div>
      <audio
        className="adpAudio"
        src={src}
        controls
        preload="metadata"
        autoPlay={autoPlay}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={onError}
      />

      <style jsx>{`
        .adp {
          display: grid;
          gap: 8px;
          width: 100%;
        }
        .adpViz {
          width: 100%;
          height: 86px;
          border-radius: 14px;
          overflow: hidden;
          background:
            radial-gradient(ellipse 70% 60% at 50% 50%, rgba(126, 226, 255, 0.08), transparent 72%),
            rgba(4, 10, 16, 0.5);
          border: 1px solid rgba(132, 244, 231, 0.18);
        }
        .adpAudio {
          width: 100%;
        }
      `}</style>
    </div>
  );
}
