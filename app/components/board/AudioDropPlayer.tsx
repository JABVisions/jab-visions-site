"use client";

import { useEffect, useRef, useState } from "react";
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
  // Start by loading with CORS so the visualizer can tap the signal. If that
  // load fails (a source that doesn't send CORS headers), fall back to a plain
  // load with the tap disabled — audio still plays, we just drop the live wave.
  const [corsBlocked, setCorsBlocked] = useState(false);

  // Reset the CORS attempt whenever the clip changes.
  useEffect(() => {
    setCorsBlocked(false);
  }, [src]);

  return (
    <div className="adp">
      <div className="adpViz">
        <VocalVisualizer
          state={playing ? "playback" : "saved"}
          playbackAudioRef={audioRef}
          disableTap={corsBlocked}
        />
      </div>
      <audio
        key={corsBlocked ? "nocors" : "cors"}
        ref={audioRef}
        className="adpAudio"
        src={src}
        // Load with CORS so the VocalVisualizer can tap the signal with
        // createMediaElementSource WITHOUT the browser muting cross-origin
        // (Supabase) audio as a security taint. Supabase storage serves
        // Access-Control-Allow-Origin, so this also lets the real waveform read.
        crossOrigin={corsBlocked ? undefined : "anonymous"}
        controls
        preload="metadata"
        playsInline
        autoPlay={autoPlay}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => {
          // First failure with CORS on: retry once without it (keeps audio
          // working for non-CORS hosts). Only bubble a real error after that.
          if (!corsBlocked) {
            setCorsBlocked(true);
            return;
          }
          onError?.();
        }}
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
