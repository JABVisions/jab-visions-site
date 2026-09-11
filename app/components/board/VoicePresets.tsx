"use client";

import { useEffect, useRef, useState } from "react";
import {
  renderVoicePresetFile,
  VOICE_PRESETS,
  type VoicePresetKey,
} from "@/lib/board/voicePresetAudio";
import styles from "./voicePresets.module.css";

function extensionForMime(mime: string) {
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

/**
 * Renders each selected preset through the same offline processor used by the
 * final saved Voice Drop. This avoids mobile Web Audio routing differences and
 * makes the preview an exact representation of the exported effect.
 */
export default function VoicePresets({
  src,
  onPlayingChange,
  onPresetChange,
  layout = "horizontal",
  compactDeck = false,
}: {
  src: string;
  onPlayingChange?: (playing: boolean) => void;
  onPresetChange?: (preset: VoicePresetKey) => void;
  layout?: "horizontal" | "vertical";
  compactDeck?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sourceFilePromiseRef = useRef<Promise<File> | null>(null);
  const renderedUrlsRef = useRef<Map<VoicePresetKey, string>>(new Map());
  const renderRequestRef = useRef(0);
  const resumeAfterRenderRef = useRef(false);
  const [preset, setPreset] = useState<VoicePresetKey | null>(null);
  const [previewSrc, setPreviewSrc] = useState("");
  const [renderingPreset, setRenderingPreset] = useState<VoicePresetKey | null>(null);
  const [effectError, setEffectError] = useState("");

  useEffect(() => {
    sourceFilePromiseRef.current = null;
    renderRequestRef.current += 1;
    setPreviewSrc("");
    setPreset(null);
    setRenderingPreset(null);
    setEffectError("");

    const oldUrls = renderedUrlsRef.current;
    renderedUrlsRef.current = new Map();
    oldUrls.forEach((url) => URL.revokeObjectURL(url));

    return () => {
      renderedUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      renderedUrlsRef.current.clear();
    };
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.load();
    if (!resumeAfterRenderRef.current) return;
    resumeAfterRenderRef.current = false;
    void audio.play().catch(() => {
      // Mobile Safari can require another tap after async processing.
    });
  }, [previewSrc]);

  function getSourceFile() {
    if (!sourceFilePromiseRef.current) {
      sourceFilePromiseRef.current = (async () => {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 12_000);
        try {
          const response = await fetch(src, { signal: controller.signal });
          if (!response.ok) throw new Error(`Voice preview source returned ${response.status}`);
          const blob = await response.blob();
          return new File([blob], `voice-preview.${extensionForMime(blob.type)}`, {
            type: blob.type || "audio/webm",
          });
        } finally {
          window.clearTimeout(timeoutId);
        }
      })().catch((error) => {
        sourceFilePromiseRef.current = null;
        throw error;
      });
    }
    return sourceFilePromiseRef.current;
  }

  async function choosePreset(nextPreset: VoicePresetKey) {
    const audio = audioRef.current;
    resumeAfterRenderRef.current = Boolean(audio && !audio.paused);
    audio?.pause();
    setPreset(nextPreset);
    onPresetChange?.(nextPreset);
    setEffectError("");

    const cachedUrl = renderedUrlsRef.current.get(nextPreset);
    if (cachedUrl) {
      setPreviewSrc(cachedUrl);
      return;
    }

    const requestId = ++renderRequestRef.current;
    setPreviewSrc("");
    setRenderingPreset(nextPreset);
    try {
      const sourceFile = await getSourceFile();
      const renderedFile = await renderVoicePresetFile(sourceFile, nextPreset);
      if (renderedFile === sourceFile) {
        throw new Error("Offline audio rendering is unavailable in this browser");
      }
      if (requestId !== renderRequestRef.current) return;
      const renderedUrl = URL.createObjectURL(renderedFile);
      renderedUrlsRef.current.set(nextPreset, renderedUrl);
      setPreviewSrc(renderedUrl);
    } catch (error) {
      console.error("[VoicePresets] preset preview render failed", error);
      if (requestId === renderRequestRef.current) {
        setEffectError("That effect could not render. Playing the original recording instead.");
        setPreviewSrc(src);
      }
    } finally {
      if (requestId === renderRequestRef.current) setRenderingPreset(null);
    }
  }

  return (
    <div
      className={[
        styles.rack,
        layout === "vertical" ? styles.rackVertical : "",
        compactDeck ? styles.rackDeck : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {compactDeck ? (
        <div className={styles.deckHead}>Palette</div>
      ) : (
        <div className={styles.head}>
          <span className={styles.eyebrow}>Vocal Enhancement</span>
          <span className={styles.hint}>Tap a preset, let it render, then press play.</span>
        </div>
      )}
      <div className={styles.chips} role="tablist" aria-label="Voice presets">
        {VOICE_PRESETS.map((option) => {
          const rendering = renderingPreset === option.key;
          return (
            <button
              key={option.key}
              type="button"
              role="tab"
              aria-selected={preset === option.key}
              aria-label={`${option.label}: ${option.detail}`}
              title={option.detail}
              disabled={renderingPreset !== null}
              className={[styles.chip, preset === option.key ? styles.chipOn : ""]
                .filter(Boolean)
                .join(" ")}
              onClick={() => void choosePreset(option.key)}
            >
              <span>{rendering ? "Rendering…" : option.label}</span>
              <small>{option.detail}</small>
            </button>
          );
        })}
      </div>
      {renderingPreset ? (
        <div className={styles.effectStatus} role="status">
          Building the {VOICE_PRESETS.find((item) => item.key === renderingPreset)?.label} preview…
        </div>
      ) : !previewSrc ? (
        <div className={styles.effectStatus} role="status">
          Choose a preset to build an effected preview.
        </div>
      ) : null}
      {effectError ? <div className={styles.effectError}>{effectError}</div> : null}
      {previewSrc ? (
        <audio
          ref={audioRef}
          className={styles.audio}
          src={previewSrc}
          controls
          preload="metadata"
          onPlay={() => onPlayingChange?.(true)}
          onPause={() => onPlayingChange?.(false)}
          onEnded={() => onPlayingChange?.(false)}
        />
      ) : null}
    </div>
  );
}
