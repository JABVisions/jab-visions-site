"use client";

import { useEffect, useMemo, useState } from "react";
import { getDropSignedUrl } from "@/lib/board/boardDropEditStore";
import { readBestLocalDropItems, type DropItem } from "@/lib/board/dropItem";
import { checkUploadSize } from "@/lib/board/uploadLimits";
import { adoptAudioFile } from "@/lib/board/audioSession";
import styles from "./voiceStudioSession.module.css";

export default function VoiceStudioAddDrawer({
  onFile,
  onNotice,
  open: openProp,
  onOpenChange,
  hideTrigger = false,
}: {
  onFile: (file: File) => void;
  onNotice: (message: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** When true, only the picker panel is shown (lane + opens it). */
  hideTrigger?: boolean;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    onOpenChange?.(next);
    if (openProp === undefined) setUncontrolledOpen(next);
  };
  const [tab, setTab] = useState<"upload" | "board" | "samples">("upload");
  const boardAudio = useMemo(
    () =>
      readBestLocalDropItems().filter(
        (drop) =>
          drop.mediaKind === "audio" ||
          drop.type === "Music" ||
          drop.thoughtFormat === "voice"
      ),
    [open]
  );

  useEffect(() => {
    if (!open) return;
    setTab("upload");
  }, [open]);

  async function takeBoardDrop(drop: DropItem) {
    try {
      const href =
        drop.bucket && drop.storagePath
          ? await getDropSignedUrl(drop.bucket, drop.storagePath)
          : drop.url;
      if (!href) {
        onNotice("That Board Audio isn't available yet.");
        return;
      }
      const response = await fetch(href);
      if (!response.ok) throw new Error("download failed");
      const blob = await response.blob();
      const type = drop.mime || blob.type || "audio/mpeg";
      onFile(new File([blob], drop.fileName || `${drop.title || "board-audio"}.audio`, { type }));
      setOpen(false);
    } catch {
      onNotice("Couldn't load that Board Audio.");
    }
  }

  return (
    <div className={styles.drawer}>
      {!hideTrigger ? (
        <button type="button" className={styles.addBtn} onClick={() => setOpen(!open)}>
          {open ? "Close + Audio" : "+ Audio"}
        </button>
      ) : null}
      {open ? (
        <>
          <div className={styles.drawerRow}>
            <button type="button" aria-pressed={tab === "upload"} onClick={() => setTab("upload")}>
              Upload File
            </button>
            <button type="button" aria-pressed={tab === "board"} onClick={() => setTab("board")}>
              Board Audio
            </button>
            <button type="button" aria-pressed={tab === "samples"} onClick={() => setTab("samples")}>
              Samples
            </button>
            {hideTrigger ? (
              <button type="button" className={styles.drawerClose} onClick={() => setOpen(false)}>
                Close
              </button>
            ) : null}
          </div>
          {tab === "upload" ? (
            <label className={styles.addBtn}>
              Choose audio
              <input
                type="file"
                accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac"
                hidden
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  const input = event.currentTarget;
                  if (!file) {
                    input.value = "";
                    return;
                  }
                  const tooLarge = checkUploadSize(file);
                  if (tooLarge) {
                    onNotice(tooLarge);
                    input.value = "";
                    return;
                  }
                  void (async () => {
                    try {
                      onFile(await adoptAudioFile(file));
                      setOpen(false);
                    } catch {
                      onFile(file);
                      setOpen(false);
                    } finally {
                      input.value = "";
                    }
                  })();
                }}
              />
            </label>
          ) : null}
          {tab === "board" ? (
            <div className={styles.boardList}>
              {boardAudio.length ? (
                boardAudio.slice(0, 12).map((drop) => (
                  <button key={drop.id} type="button" onClick={() => void takeBoardDrop(drop)}>
                    {drop.title || "Untitled audio"}
                  </button>
                ))
              ) : (
                <p className={styles.hint}>No Board Audio on this device yet.</p>
              )}
            </div>
          ) : null}
          {tab === "samples" ? (
            <p className={styles.hint}>Sample packs are coming to Drop Studio.</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
