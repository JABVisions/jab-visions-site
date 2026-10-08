"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clipEndMs,
  createDropStudioV5History,
  createDropStudioV5Session,
  cropToClipPath,
  deleteClip,
  handoffPlayheadMs,
  importAudioClip,
  importVideoClip,
  insetV5Crop,
  loadDropStudioV5Project,
  mediaKeyFromFile,
  previewAudioAtPlayhead,
  previewVideoAtPlayhead,
  pushV5History,
  redoV5,
  reorderClip,
  resolveTrimOutMs,
  saveDropStudioV5Project,
  sessionDurationMs,
  setClipCrop,
  setClipFilter,
  setMediaDuration,
  setPlayhead,
  setSessionAspect,
  splitClipAtPlayhead,
  trimClip,
  undoV5,
  type DropStudioV5Aspect,
  type DropStudioV5History,
  type DropStudioV5MediaBag,
  type DropStudioV5Session,
} from "@/lib/board/dropStudioV5";
import {
  canPersistDropStudioV5Media,
  loadDropStudioV5Media,
  saveDropStudioV5Media,
} from "@/lib/board/dropStudioV5Media";
import { fetchDropStudioV5Cloud, queueDropStudioV5CloudSync } from "@/lib/board/dropStudioV5Cloud";

function readDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const node = file.type.startsWith("audio/")
      ? document.createElement("audio")
      : document.createElement("video");
    const finish = (ms: number) => {
      URL.revokeObjectURL(url);
      node.src = "";
      resolve(ms);
    };
    node.preload = "metadata";
    node.onloadedmetadata = () => {
      const seconds = Number(node.duration);
      finish(Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0);
    };
    node.onerror = () => finish(0);
    node.src = url;
  });
}

export function useDropStudioV5Runtime({
  enabled,
  mediaUrl,
  mediaKind,
  draftId,
  filter,
  overlay,
}: {
  enabled: boolean;
  mediaUrl: string;
  mediaKind: "image" | "video";
  draftId?: string;
  filter?: string | null;
  overlay?: string | null;
}) {
  const [session, setSession] = useState<DropStudioV5Session>(() => createDropStudioV5Session());
  const [history, setHistory] = useState<DropStudioV5History>(() => createDropStudioV5History());
  const [mediaBag, setMediaBag] = useState<DropStudioV5MediaBag>({});
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const objectUrlsRef = useRef<string[]>([]);
  const persistTimerRef = useRef<number | null>(null);
  const seededUrlRef = useRef("");

  const commit = useCallback((next: DropStudioV5Session, recordHistory = true) => {
    if (recordHistory) {
      setHistory((prev) => pushV5History(prev, session));
    }
    setSession(next);
  }, [session]);

  useEffect(() => {
    if (!enabled || mediaKind !== "video" || !mediaUrl) return;
    const seedKey = `${mediaUrl}::${draftId || ""}`;
    if (seededUrlRef.current === seedKey) return;
    seededUrlRef.current = seedKey;
    const restored = draftId ? loadDropStudioV5Project(draftId) : null;
    const localHit = Boolean(restored);
    const base = restored ?? createDropStudioV5Session(draftId);
    const hasPrimary = base.tracks.some((track) =>
      track.clips.some((clip) => clip.mediaKey === "primary")
    );
    const next = hasPrimary
      ? base
      : importVideoClip(base, {
          mediaKey: "primary",
          name: "Clip 1",
          kind: "video",
        });
    setSession(next);
    setHistory(createDropStudioV5History());
    setMediaBag((bag) => ({
      ...bag,
      primary: { url: mediaUrl, kind: "video" },
    }));
    setSelectedClipId(next.tracks[0]?.clips[0]?.id ?? null);
    if (!draftId) return;
    let cancelled = false;
    if (!localHit) {
      void fetchDropStudioV5Cloud(draftId).then((cloud) => {
        if (cancelled || !cloud) return;
        setSession((current) =>
          (current.tracks[0]?.clips.length ?? 0) > 1 ? current : cloud
        );
      });
    }
    void loadDropStudioV5Media(draftId).then((rows) => {
      if (cancelled || !rows.length) return;
      const urls: DropStudioV5MediaBag = {};
      for (const row of rows) {
        if (row.mediaKey === "primary") continue;
        const url = URL.createObjectURL(row.blob);
        objectUrlsRef.current.push(url);
        urls[row.mediaKey] = {
          url,
          kind: row.mimeType.startsWith("audio/")
            ? "audio"
            : row.mimeType.startsWith("image/")
              ? "image"
              : "video",
          objectUrl: true,
        };
      }
      if (Object.keys(urls).length) {
        setMediaBag((bag) => ({ ...bag, ...urls }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [draftId, enabled, mediaKind, mediaUrl]);

  useEffect(() => {
    return () => {
      for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
      objectUrlsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!enabled || !draftId) return;
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      saveDropStudioV5Project(draftId, session);
      queueDropStudioV5CloudSync(draftId, session);
    }, 700);
    return () => {
      if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    };
  }, [draftId, enabled, session]);

  useEffect(() => {
    if (!enabled || !draftId) return;
    const persist = () => {
      saveDropStudioV5Project(draftId, session);
      queueDropStudioV5CloudSync(draftId, session);
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") persist();
    };
    window.addEventListener("pagehide", persist);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", persist);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [draftId, enabled, session]);

  const preview = useMemo(() => previewVideoAtPlayhead(session), [session]);
  const audioPreview = useMemo(() => previewAudioAtPlayhead(session), [session]);
  const previewUrl = (preview && mediaBag[preview.clip.mediaKey]?.url) || mediaUrl;
  const previewClipPath = cropToClipPath(preview?.clip.crop);
  const extraClipCount = Math.max(0, (session.tracks[0]?.clips.length ?? 0) - 1);

  const importVideo = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("video/")) return;
      const key = mediaKeyFromFile(file);
      const url = URL.createObjectURL(file);
      objectUrlsRef.current.push(url);
      const duration = await readDuration(file);
      setMediaBag((bag) => ({ ...bag, [key]: { url, kind: "video", objectUrl: true } }));
      if (draftId && canPersistDropStudioV5Media(file.size)) {
        void saveDropStudioV5Media(draftId, key, file);
      }
      commit(
        importVideoClip(session, {
          mediaKey: key,
          name: file.name.replace(/\.[^.]+$/, "").slice(0, 24) || "Clip",
          kind: "video",
          sourceDurationMs: duration,
        })
      );
    },
    [commit, draftId, session]
  );

  const importAudio = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("audio/")) return;
      const key = mediaKeyFromFile(file);
      const url = URL.createObjectURL(file);
      objectUrlsRef.current.push(url);
      const duration = await readDuration(file);
      setMediaBag((bag) => ({ ...bag, [key]: { url, kind: "audio", objectUrl: true } }));
      if (draftId && canPersistDropStudioV5Media(file.size)) {
        void saveDropStudioV5Media(draftId, key, file);
      }
      commit(
        importAudioClip(session, {
          mediaKey: key,
          name: file.name.replace(/\.[^.]+$/, "").slice(0, 24) || "Audio",
          kind: "audio",
          sourceDurationMs: duration,
        })
      );
    },
    [commit, draftId, session]
  );

  const applyDuration = useCallback((seconds: number) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    setSession((current) => setMediaDuration(current, "primary", seconds * 1000));
  }, []);

  const scrub = useCallback(
    (ms: number) => {
      setScrubbing(true);
      setSession((current) => setPlayhead(current, ms));
      window.setTimeout(() => setScrubbing(false), 140);
    },
    []
  );

  const syncPlayheadFromVideo = useCallback((currentTimeSeconds: number) => {
    if (scrubbing) return;
    const clip = preview?.clip;
    if (!clip) return;
    const handoff = handoffPlayheadMs(clip, currentTimeSeconds * 1000);
    const next = handoff ?? clip.offsetMs + Math.max(0, currentTimeSeconds * 1000 - clip.trimInMs);
    setSession((current) => {
      if (Math.abs(current.playheadMs - next) < 80) return current;
      return setPlayhead(current, next);
    });
  }, [preview?.clip, scrubbing]);

  const selected = selectedClipId
    ? session.tracks.flatMap((track) => track.clips).find((clip) => clip.id === selectedClipId)
    : preview?.clip;

  return {
    session,
    selectedClipId: selected?.id ?? null,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    extraClipCount,
    previewUrl,
    previewMediaTimeSeconds: preview ? preview.mediaTimeMs / 1000 : 0,
    previewTrimOutSeconds: preview ? resolveTrimOutMs(preview.clip) / 1000 : 0,
    crossClipBoundary: () => {
      const clip = preview?.clip;
      if (!clip) return false;
      const nextMs = clipEndMs(clip);
      const duration = sessionDurationMs(session);
      setSession((current) => setPlayhead(current, nextMs));
      return nextMs < duration - 1;
    },
    previewClipPath,
    audioPreviewUrl: audioPreview ? mediaBag[audioPreview.clip.mediaKey]?.url : undefined,
    audioPreviewTimeSeconds: audioPreview ? audioPreview.mediaTimeMs / 1000 : 0,
    audioVolume: audioPreview ? audioPreview.clip.volume : 1,
    mediaBag,
    scrubbing,
    aspect: session.aspect,
    activeFilter: preview?.clip.filter ?? filter ?? null,
    activeOverlay: preview?.clip.overlay ?? overlay ?? null,
    setSelectedClipId,
    importVideo,
    importAudio,
    applyDuration,
    scrub,
    syncPlayheadFromVideo,
    split: () => commit(splitClipAtPlayhead(session, selected?.id)),
    reorder: (direction: -1 | 1) => {
      if (!selected) return;
      commit(reorderClip(session, selected.id, direction));
    },
    remove: () => {
      if (!selected || selected.mediaKey === "primary") return;
      commit(deleteClip(session, selected.id));
    },
    trim: (edge: "in" | "out", deltaMs: number) => {
      if (!selected) return;
      const nextIn = selected.trimInMs + (edge === "in" ? deltaMs : 0);
      const currentOut = selected.trimOutMs || selected.sourceDurationMs;
      const nextOut = currentOut + (edge === "out" ? deltaMs : 0);
      commit(trimClip(session, selected.id, nextIn, nextOut));
    },
    undo: () => {
      const next = undoV5(history, session);
      setHistory(next.history);
      setSession(next.session);
    },
    redo: () => {
      const next = redoV5(history, session);
      setHistory(next.history);
      setSession(next.session);
    },
    setAspect: (aspect: DropStudioV5Aspect) => commit(setSessionAspect(session, aspect)),
    cropFit: () => {
      if (!selected) return;
      commit(setClipCrop(session, selected.id, insetV5Crop(0.08)));
    },
    cropFill: () => {
      if (!selected) return;
      commit(setClipCrop(session, selected.id, null));
    },
    cropInset: () => {
      if (!selected) return;
      commit(setClipCrop(session, selected.id, insetV5Crop(0.16)));
    },
    applyFilterToClip: (nextFilter: string | null, nextOverlay?: string | null) => {
      if (!selected) return;
      commit(setClipFilter(session, selected.id, nextFilter, nextOverlay));
    },
  };
}
