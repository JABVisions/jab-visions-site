"use client";

import { useRef, useState } from "react";
import VocalVisualizer from "./VocalVisualizer";

/**
 * Plays a recorded audio drop with a live vocal waveform above the controls.
 * While playing, the visualizer reads the actual audio signal so peaks move
 * with your voice — not a pre-baked animation.
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
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  return (
    <div className="adp">
      <div className="adpViz">
        <VocalVisualizer
          state={playing ? "playback" : "saved"}
          playbackAudioRef={audioRef}
        />
      </div>
      <audio
        ref={audioRef}
        className="adpAudio"
        src={src}
        controls
        preload="metadata"
        playsInline
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
