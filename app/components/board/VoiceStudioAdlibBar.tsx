"use client";

import { useRef, useState } from "react";
import type { SessionTrack } from "@/lib/board/audioSession";
import { adoptAudioFile } from "@/lib/board/audioSession";
import styles from "./voiceStudioSession.module.css";

const STARTER_PADS = [
  { id: "yeah", label: "Yeah" },
  { id: "uh", label: "Uh" },
  { id: "breath", label: "Breath" },
  { id: "clap", label: "Clap" },
] as const;

export default function VoiceStudioAdlibBar({
  open,
  tracks,
  recordingSlot,
  onToggle,
  onRecordSlot,
  onStopRecord,
  onUpload,
  onPreview,
  onRename,
  onDuplicate,
  onMute,
  onSolo,
  onVolume,
  onFade,
  onDelete,
  onMoveEarlier,
  onMoveLater,
}: {
  open: boolean;
  tracks: SessionTrack[];
  recordingSlot: boolean;
  onToggle: () => void;
  onRecordSlot: () => void;
  onStopRecord: () => void;
  onUpload: (file: File) => void;
  onPreview: (trackId: string) => void;
  onRename: (trackId: string, name: string) => void;
  onDuplicate: (trackId: string) => void;
  onMute: (trackId: string) => void;
  onSolo: (trackId: string) => void;
  onVolume: (trackId: string, volume: number) => void;
  onFade: (trackId: string, fadeInMs: number, fadeOutMs: number) => void;
  onDelete: (trackId: string) => void;
  onMoveEarlier: (trackId: string) => void;
  onMoveLater: (trackId: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);

  return (
    <section className={styles.adlibShell}>
      <button type="button" className={styles.adlibToggle} onClick={onToggle} aria-expanded={open}>
        <span>Ad-Libs</span>
        <span>{open ? "▾" : "▸"} {tracks.length}</span>
      </button>

      {open ? (
        <div className={styles.adlibTray}>
          <div className={styles.adlibActions}>
            <button type="button" onClick={recordingSlot ? onStopRecord : onRecordSlot}>
              {recordingSlot ? "Stop slot" : "Record slot"}
            </button>
            <button type="button" onClick={() => fileRef.current?.click()}>
              Upload
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*"
              hidden
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                const input = event.currentTarget;
                if (!file) {
                  input.value = "";
                  return;
                }
                void (async () => {
                  try {
                    onUpload(await adoptAudioFile(file));
                  } catch {
                    onUpload(file);
                  } finally {
                    input.value = "";
                  }
                })();
              }}
            />
          </div>

          <div className={styles.starterPads} aria-label="Starter soundboard">
            {STARTER_PADS.map((pad) => (
              <button
                key={pad.id}
                type="button"
                className={styles.starterPad}
                title="Starter pad — record or upload your own ad-libs for the project"
                onClick={onRecordSlot}
              >
                {pad.label}
              </button>
            ))}
          </div>

          <div className={styles.adlibList}>
            {tracks.length === 0 ? (
              <p className={styles.drawerNote}>
                Record or upload ad-libs here. They land on separate lanes so they never overwrite your vocal.
              </p>
            ) : (
              tracks.map((track) => {
                const clip = track.clips[0];
                const name = track.label || clip?.name || "Ad-Lib";
                return (
                  <article key={track.id} className={styles.adlibCard}>
                    {renameId === track.id ? (
                      <input
                        className={styles.renameInput}
                        defaultValue={name}
                        autoFocus
                        onBlur={(event) => {
                          onRename(track.id, event.currentTarget.value.trim() || name);
                          setRenameId(null);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            onRename(track.id, event.currentTarget.value.trim() || name);
                            setRenameId(null);
                          }
                        }}
                      />
                    ) : (
                      <button type="button" className={styles.adlibName} onClick={() => setRenameId(track.id)}>
                        {name}
                      </button>
                    )}
                    <div className={styles.adlibTools}>
                      <button type="button" onClick={() => onPreview(track.id)}>
                        Preview
                      </button>
                      <button type="button" aria-pressed={track.mix.muted} onClick={() => onMute(track.id)}>
                        {track.mix.muted ? "Unmute" : "Mute"}
                      </button>
                      <button type="button" aria-pressed={track.mix.solo} onClick={() => onSolo(track.id)}>
                        Solo
                      </button>
                      <button type="button" onClick={() => onDuplicate(track.id)}>
                        Dup
                      </button>
                      <button type="button" onClick={() => onMoveEarlier(track.id)}>
                        ←
                      </button>
                      <button type="button" onClick={() => onMoveLater(track.id)}>
                        →
                      </button>
                      <button type="button" onClick={() => onDelete(track.id)}>
                        Del
                      </button>
                    </div>
                    <label className={styles.controlRow}>
                      <span>Vol</span>
                      <input
                        type="range"
                        min={0}
                        max={1.5}
                        step={0.02}
                        value={track.mix.volume}
                        onChange={(event) => onVolume(track.id, Number(event.currentTarget.value))}
                      />
                    </label>
                    <label className={styles.controlRow}>
                      <span>Fade</span>
                      <input
                        type="range"
                        min={0}
                        max={1200}
                        step={20}
                        value={Math.max(track.mix.fadeInMs, track.mix.fadeOutMs)}
                        onChange={(event) => {
                          const ms = Number(event.currentTarget.value);
                          onFade(track.id, ms, ms);
                        }}
                      />
                    </label>
                  </article>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
