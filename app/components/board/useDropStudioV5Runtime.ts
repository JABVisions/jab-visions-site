"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addEffectClip,
  artClipsAtTime,
  bindArtOverlay,
  duplicateClip,
  effectsAtTime,
  fadeGainAt,
  setClipFade,
  setClipGrade,
  setClipSpeed,
  type DropStudioV5ArtAction,
  clipEndMs,
  createDropStudioV5History,
  createDropStudioV5Session,
  cropToClipPath,
  deleteClip,
  duplicateArtClip,
  handoffPlayheadMs,
  importAudioClip,
  importVideoClip,
  insetV5Crop,
  loadDropStudioV5Project,
  mediaKeyFromFile,
  nudgeArtPlacement,
  previewAudioAtPlayhead,
  previewVideoAtPlayhead,
  pushV5History,
  redoV5,
  reorderClip,
  resolveTrimOutMs,
  saveDropStudioV5Project,
  scaleArtPlacement,
  sessionDurationMs,
  setArtClipBounds,
  setClipCrop,
  setClipFilter,
  setClipHidden,
  setMediaDuration,
  setPlayhead,
  setSessionAspect,
  splitClipAtPlayhead,
  trimClip,
  undoV5,
  type DropStudioV5Aspect,
  type DropStudioV5Crop,
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
import { gradeToFilter, presetGrade, type DropStudioV5Grade, type DropStudioV5Motion } from "@/lib/board/dropStudioV5Grade";

function persistArtOverlay(draftId: string, mediaKey: string, dataUrl: string) {
  void fetch(dataUrl)
    .then((response) => response.blob())
    .then((blob) => {
      if (!canPersistDropStudioV5Media(blob.size)) return;
      return saveDropStudioV5Media(draftId, mediaKey, blob);
    })
    .catch(() => {
      // The in-memory overlay still previews. Reload needs the IndexedDB copy.
    });
}

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
  const [editingArtId, setEditingArtId] = useState<string | null>(null);
  const [artRestoreNonce, setArtRestoreNonce] = useState(0);
  const [clearArtToken, setClearArtToken] = useState(0);
  const [voiceState, setVoiceState] = useState<"idle" | "recording" | "denied">("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const persistTimerRef = useRef<number | null>(null);
  const seededUrlRef = useRef("");
  const sessionRef = useRef(session);
  const artTargetRef = useRef<string | null>(null);
  const forceNewArtRef = useRef(false);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

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
    const speed = clip.speed && clip.speed > 0 ? clip.speed : 1;
    const next = handoff ?? clip.offsetMs + Math.max(0, currentTimeSeconds * 1000 - clip.trimInMs) / speed;
    setSession((current) => {
      if (Math.abs(current.playheadMs - next) < 80) return current;
      return setPlayhead(current, next);
    });
  }, [preview?.clip, scrubbing]);

  const rememberArt = useCallback(
    (dataUrl: string) => {
      if (!dataUrl) return;
      const freshKey = `art-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`;
      const current = sessionRef.current;
      const bound = bindArtOverlay(
        current,
        freshKey,
        artTargetRef.current,
        forceNewArtRef.current
      );
      forceNewArtRef.current = false;
      if (!bound.clipId) return;
      artTargetRef.current = bound.clipId;
      sessionRef.current = bound.session;
      if (bound.created) setHistory((prev) => pushV5History(prev, current));
      setSession(bound.session);
      setEditingArtId(bound.clipId);
      setSelectedClipId(bound.clipId);
      setMediaBag((bag) => ({
        ...bag,
        [bound.mediaKey]: { url: dataUrl, kind: "image" },
      }));
      if (draftId) persistArtOverlay(draftId, bound.mediaKey, dataUrl);
    },
    [draftId]
  );

  const selectClip = useCallback((clipId: string) => {
    setSelectedClipId(clipId);
    const clip = sessionRef.current.tracks
      .find((track) => track.kind === "art")
      ?.clips.find((item) => item.id === clipId);
    if (!clip) return;
    artTargetRef.current = clipId;
    forceNewArtRef.current = false;
    setEditingArtId(clipId);
    setArtRestoreNonce((nonce) => nonce + 1);
  }, []);

  const applyArtEdit = useCallback((next: DropStudioV5Session) => {
    const previous = sessionRef.current;
    if (next === previous) return;
    sessionRef.current = next;
    setHistory((prev) => pushV5History(prev, previous));
    setSession(next);
  }, []);

  const artAction = useCallback(
    (action: DropStudioV5ArtAction) => {
      if (action === "new") {
        forceNewArtRef.current = true;
        artTargetRef.current = null;
        setEditingArtId(null);
        setSelectedClipId(null);
        setClearArtToken((token) => token + 1);
        return;
      }
      const clipId = artTargetRef.current;
      const current = sessionRef.current;
      const clip = clipId
        ? current.tracks.find((track) => track.kind === "art")?.clips.find((item) => item.id === clipId)
        : undefined;
      if (!clip) return;
      const end = clipEndMs(clip);
      if (action === "hide") {
        applyArtEdit(setClipHidden(current, clip.id, !clip.hidden));
        return;
      }
      if (action === "duplicate") {
        const next = duplicateArtClip(current, clip.id);
        const previousIds = new Set(
          current.tracks.find((track) => track.kind === "art")?.clips.map((item) => item.id)
        );
        const created = next.tracks
          .find((track) => track.kind === "art")
          ?.clips.find((item) => !previousIds.has(item.id));
        applyArtEdit(next);
        if (created) {
          artTargetRef.current = created.id;
          setEditingArtId(created.id);
          setSelectedClipId(created.id);
          setArtRestoreNonce((nonce) => nonce + 1);
        }
        return;
      }
      if (action === "start-earlier") applyArtEdit(setArtClipBounds(current, clip.id, clip.offsetMs - 200, end));
      else if (action === "start-later") applyArtEdit(setArtClipBounds(current, clip.id, clip.offsetMs + 200, end));
      else if (action === "end-earlier") applyArtEdit(setArtClipBounds(current, clip.id, clip.offsetMs, end - 200));
      else if (action === "end-later") applyArtEdit(setArtClipBounds(current, clip.id, clip.offsetMs, end + 200));
      else if (action === "earlier") applyArtEdit(setArtClipBounds(current, clip.id, clip.offsetMs - 200, end - 200));
      else if (action === "later") applyArtEdit(setArtClipBounds(current, clip.id, clip.offsetMs + 200, end + 200));
      else if (action === "smaller") applyArtEdit(scaleArtPlacement(current, clip.id, 0.85));
      else if (action === "larger") applyArtEdit(scaleArtPlacement(current, clip.id, 1 / 0.85));
      else if (action === "nudge-left") applyArtEdit(nudgeArtPlacement(current, clip.id, -0.04, 0));
      else if (action === "nudge-right") applyArtEdit(nudgeArtPlacement(current, clip.id, 0.04, 0));
      else if (action === "nudge-up") applyArtEdit(nudgeArtPlacement(current, clip.id, 0, -0.04));
      else if (action === "nudge-down") applyArtEdit(nudgeArtPlacement(current, clip.id, 0, 0.04));
    },
    [applyArtEdit]
  );

  const selectedClip = () =>
    sessionRef.current.tracks.flatMap((track) => track.clips).find((clip) => clip.id === selectedClipId) ??
    null;

  const editSelected = useCallback(
    (next: (current: DropStudioV5Session, clipId: string) => DropStudioV5Session) => {
      const clip = selectedClip();
      if (!clip) return;
      applyArtEdit(next(sessionRef.current, clip.id));
    },
    [applyArtEdit, selectedClipId]
  );

  const recordVoice = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return "unavailable" as const;
    const existing = recorderRef.current;
    if (existing && existing.state === "recording") {
      existing.stop();
      return "stopped" as const;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      const offset = sessionRef.current.playheadMs;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
        setVoiceState("idle");
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (!blob.size) return;
        const file = new File([blob], `voiceover-${Date.now()}.webm`, { type: blob.type || "audio/webm" });
        void importAudio(file).then(() => {
          const audio = sessionRef.current.tracks.find((track) => track.kind === "audio");
          const clip = audio?.clips[audio.clips.length - 1];
          if (!clip) return;
          applyArtEdit({
            ...sessionRef.current,
            tracks: sessionRef.current.tracks.map((track) =>
              track.kind === "audio"
                ? {
                    ...track,
                    clips: track.clips.map((item) =>
                      item.id === clip.id ? { ...item, offsetMs: offset, name: item.name || "Voiceover" } : item
                    ),
                  }
                : track
            ),
          });
        });
      };
      recorderRef.current = recorder;
      setVoiceState("recording");
      recorder.start();
      return "recording" as const;
    } catch {
      setVoiceState("denied");
      return "denied" as const;
    }
  }, [applyArtEdit, importAudio]);

  const artFrames = artClipsAtTime(session, session.playheadMs)
    .map((clip) => ({
      id: clip.id,
      url: mediaBag[clip.mediaKey]?.url || "",
      placement: clip.placement,
    }))
    .filter((frame) => frame.url);
  const editingClip = editingArtId
    ? session.tracks.find((track) => track.kind === "art")?.clips.find((clip) => clip.id === editingArtId)
    : undefined;
  const editingArtLive =
    !editingClip ||
    (session.playheadMs >= editingClip.offsetMs && session.playheadMs < clipEndMs(editingClip));
  const editingArtUrl = editingClip ? mediaBag[editingClip.mediaKey]?.url : undefined;
  const editingArtPlacement: DropStudioV5Crop | undefined = editingClip?.placement;

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
    audioVolume: audioPreview ? fadeGainAt(audioPreview.clip, session.playheadMs) : 1,
    previewSpeed: preview ? (preview.clip.speed && preview.clip.speed > 0 ? preview.clip.speed : 1) : 1,
    audioSpeed: audioPreview ? (audioPreview.clip.speed && audioPreview.clip.speed > 0 ? audioPreview.clip.speed : 1) : 1,
    gradeFilter: gradeToFilter(preview?.clip.grade),
    vignette: preview?.clip.grade?.vignette ?? 0,
    activeMotions: effectsAtTime(session, session.playheadMs)
      .map((clip) => clip.mediaKey.slice(3))
      .filter(Boolean),
    voiceState,
    mediaBag,
    scrubbing,
    aspect: session.aspect,
    activeFilter: preview?.clip.filter ?? filter ?? null,
    activeOverlay: preview?.clip.overlay ?? overlay ?? null,
    setSelectedClipId,
    rememberArt,
    artFrames,
    editingArtId,
    editingArtUrl,
    editingArtPlacement,
    editingArtLive,
    artRestoreNonce,
    clearArtToken,
    selectClip,
    artAction,
    setSpeed: (speed: number) => editSelected((current, clipId) => setClipSpeed(current, clipId, speed)),
    duplicateSelected: () => editSelected((current, clipId) => duplicateClip(current, clipId)),
    setFade: (fadeInMs: number, fadeOutMs: number) =>
      editSelected((current, clipId) => setClipFade(current, clipId, fadeInMs, fadeOutMs)),
    setGrade: (grade: DropStudioV5Grade | null) =>
      editSelected((current, clipId) => setClipGrade(current, clipId, grade)),
    applyPreset: (name: string, intensity: number) =>
      editSelected((current, clipId) => setClipGrade(current, clipId, presetGrade(name, intensity) ?? null)),
    addEffect: (motion: DropStudioV5Motion) =>
      applyArtEdit(addEffectClip(sessionRef.current, motion, sessionRef.current.playheadMs, 2000)),
    setVolume: (volume: number) => {
      const clip = selectedClip();
      if (!clip) return;
      applyArtEdit({
        ...sessionRef.current,
        tracks: sessionRef.current.tracks.map((track) => ({
          ...track,
          clips: track.clips.map((item) => (item.id === clip.id ? { ...item, volume } : item)),
        })),
      });
    },
    recordVoice,
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
