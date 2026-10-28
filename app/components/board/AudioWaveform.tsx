"use client";

import { useEffect, useState } from "react";
import { loadVoiceStudioProject } from "@/lib/board/voiceStudioProject";

type AudioWaveformProps = {
  file?: Blob | null;
  src?: string | null;
  draftId?: string;
  className?: string;
  height?: number;
};

function waveformPath(peaks: number[]) {
  if (!peaks.length) return "";
  const width = 320;
  const height = 64;
  const mid = height / 2;
  const step = width / Math.max(1, peaks.length - 1);
  const upper = peaks.map((peak, index) => `L ${(index * step).toFixed(2)} ${(mid - peak * mid * 0.92).toFixed(2)}`).join(" ");
  const lower = [...peaks].reverse().map((peak, index) => {
    const x = width - index * step;
    return `L ${x.toFixed(2)} ${(mid + peak * mid * 0.92).toFixed(2)}`;
  }).join(" ");
  return `M 0 ${mid} ${upper} ${lower} Z`;
}

async function readAudioBytes(file: Blob | null | undefined, src: string | null | undefined, draftId?: string) {
  if (file) return file.arrayBuffer();
  if (src && !src.startsWith("data:audio/wav;base64,UklGRiQAAABXQVZFZm10")) {
    const response = await fetch(src, { cache: "force-cache" });
    if (!response.ok) throw new Error("Audio preview unavailable");
    return response.arrayBuffer();
  }
  if (draftId) {
    const session = await loadVoiceStudioProject(draftId);
    const clip = session?.tracks.flatMap((track) => track.clips).find((item) => item.file);
    if (clip?.file) return clip.file.arrayBuffer();
  }
  return null;
}

export default function AudioWaveform({
  file = null,
  src = null,
  draftId,
  className,
  height = 54,
}: AudioWaveformProps) {
  const [path, setPath] = useState("");

  useEffect(() => {
    let cancelled = false;
    let context: AudioContext | null = null;

    const build = async () => {
      setPath("");
      try {
        const bytes = await readAudioBytes(file, src, draftId);
        if (!bytes || cancelled) return;
        const AudioContextCtor = window.AudioContext;
        if (!AudioContextCtor) return;
        context = new AudioContextCtor();
        const decoded = await context.decodeAudioData(bytes.slice(0));
        const channel = decoded.getChannelData(0);
        const count = 160;
        const stride = Math.max(1, Math.floor(channel.length / count));
        const peaks = new Array<number>(count);
        let maximum = 0;
        for (let index = 0; index < count; index += 1) {
          const start = index * stride;
          const end = Math.min(channel.length, start + stride);
          let peak = 0;
          for (let sample = start; sample < end; sample += 1) {
            peak = Math.max(peak, Math.abs(channel[sample] || 0));
          }
          peaks[index] = peak;
          maximum = Math.max(maximum, peak);
        }
        const normalized = peaks.map((peak) => maximum > 0 ? Math.max(0.025, peak / maximum) : 0.025);
        if (!cancelled) setPath(waveformPath(normalized));
      } catch {
        // Keep the waveform area clean when this browser cannot decode a source.
      } finally {
        if (context && context.state !== "closed") void context.close().catch(() => {});
      }
    };

    void build();
    return () => {
      cancelled = true;
      if (context && context.state !== "closed") void context.close().catch(() => {});
    };
  }, [file, src, draftId]);

  return (
    <div className={className} style={{ width: "100%", height, minHeight: height }} aria-label="Audio waveform">
      <svg viewBox="0 0 320 64" width="100%" height="100%" preserveAspectRatio="none" role="img" aria-hidden="true">
        <defs>
          <linearGradient id="draft-audio-wave" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#62e6dc" />
            <stop offset="52%" stopColor="#a7f8ee" />
            <stop offset="100%" stopColor="#65d9f2" />
          </linearGradient>
        </defs>
        {path ? <path d={path} fill="url(#draft-audio-wave)" opacity=".9" /> : <path d="M0 32 H320" stroke="#62e6dc" strokeWidth="1.5" opacity=".55" />}
      </svg>
    </div>
  );
}
