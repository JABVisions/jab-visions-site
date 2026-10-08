import {
  DROP_STUDIO_V5_ASPECTS,
  clipEndMs,
  clipPlayableMs,
  resolveTrimOutMs,
  type DropStudioV5Aspect,
  type DropStudioV5Clip,
  type DropStudioV5Crop,
  type DropStudioV5MediaBag,
  type DropStudioV5Session,
} from "@/lib/board/dropStudioV5";

export type DropStudioV5ExportClip = {
  mediaKey: string;
  offsetMs: number;
  trimInMs: number;
  trimOutMs: number;
  playableMs: number;
  crop?: DropStudioV5Crop;
  filter?: string | null;
  volume: number;
  muted: boolean;
};

export type DropStudioV5ExportArt = {
  mediaKey: string;
  offsetMs: number;
  endMs: number;
  placement?: DropStudioV5Crop;
};

export type DropStudioV5ExportPlan = {
  aspect: DropStudioV5Aspect;
  width: number;
  height: number;
  durationMs: number;
  video: DropStudioV5ExportClip[];
  audio: DropStudioV5ExportClip[];
  art: DropStudioV5ExportArt[];
};

const FILTERS: Record<string, string> = {
  "signal-glow": "saturate(1.35) contrast(1.05) brightness(1.04)",
  "dream-fog": "saturate(0.85) contrast(0.92) brightness(1.08)",
  "bucket-vision": "saturate(1.2) hue-rotate(12deg) contrast(1.06)",
  pulse: "saturate(1.25) contrast(1.12)",
  "neon-signal": "saturate(1.5) hue-rotate(-8deg) contrast(1.08)",
  "night-glass": "saturate(0.8) brightness(0.92) contrast(1.05)",
  artifact: "saturate(0.7) contrast(1.15)",
  "clean-enhance": "contrast(1.06) saturate(1.08) brightness(1.03)",
};

export function canvasFilterFor(filter: string | null | undefined) {
  if (!filter) return "none";
  return FILTERS[filter] || "none";
}

export function exportPixelSize(aspect: DropStudioV5Aspect) {
  const spec = DROP_STUDIO_V5_ASPECTS[aspect] ?? DROP_STUDIO_V5_ASPECTS.portrait;
  const longEdge = 960;
  if (spec.w >= spec.h) {
    return { width: longEdge, height: Math.max(2, Math.round((longEdge * spec.h) / spec.w)) };
  }
  return { width: Math.max(2, Math.round((longEdge * spec.w) / spec.h)), height: longEdge };
}

function toExportClip(clip: DropStudioV5Clip, muted: boolean): DropStudioV5ExportClip | null {
  const playableMs = clipPlayableMs(clip);
  if (playableMs < 80) return null;
  return {
    mediaKey: clip.mediaKey,
    offsetMs: clip.offsetMs,
    trimInMs: clip.trimInMs,
    trimOutMs: resolveTrimOutMs(clip),
    playableMs,
    crop: clip.crop,
    filter: clip.filter,
    volume: clip.volume,
    muted: Boolean(muted || clip.muted),
  };
}

export function buildExportPlan(session: DropStudioV5Session): DropStudioV5ExportPlan {
  const size = exportPixelSize(session.aspect);
  const videoTrack = session.tracks.find((track) => track.kind === "video");
  const audioTrack = session.tracks.find((track) => track.kind === "audio");
  const video = (videoTrack?.clips ?? [])
    .map((clip) => toExportClip(clip, Boolean(videoTrack?.muted)))
    .filter((clip): clip is DropStudioV5ExportClip => Boolean(clip));
  const audio = (audioTrack?.clips ?? [])
    .map((clip) => toExportClip(clip, Boolean(audioTrack?.muted)))
    .filter((clip): clip is DropStudioV5ExportClip => Boolean(clip));
  const artTrack = session.tracks.find((track) => track.kind === "art");
  const art: DropStudioV5ExportArt[] = artTrack?.muted
    ? []
    : (artTrack?.clips ?? [])
        .filter((clip) => !clip.hidden && clip.mediaKey && clipEndMs(clip) - clip.offsetMs >= 80)
        .map((clip) => ({
          mediaKey: clip.mediaKey,
          offsetMs: clip.offsetMs,
          endMs: clipEndMs(clip),
          ...(clip.placement ? { placement: clip.placement } : {}),
        }));
  const durationMs = Math.max(
    video.reduce((end, clip) => Math.max(end, clip.offsetMs + clip.playableMs), 0),
    audio.reduce((end, clip) => Math.max(end, clip.offsetMs + clip.playableMs), 0),
    art.reduce((end, clip) => Math.max(end, clip.endMs), 0)
  );
  return { aspect: session.aspect, ...size, durationMs, video, audio, art };
}

/** True when Done must render a new file. An untouched primary tape stays on the V4 path. */
export function exportNeedsFlatten(session: DropStudioV5Session): boolean {
  const plan = buildExportPlan(session);
  if (!plan.video.length) return false;
  if (plan.video.length > 1 || plan.audio.length > 0 || plan.art.length > 0) return true;
  if (session.aspect === "square" || session.aspect === "story") return true;
  const clip = plan.video[0];
  if (clip.trimInMs > 0) return true;
  if (clip.crop && (clip.crop.x || clip.crop.y || clip.crop.w < 1 || clip.crop.h < 1)) return true;
  return false;
}

function recorderMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const types = ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function waitFor(target: HTMLMediaElement, event: string, ms = 12000) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${event}`));
    }, ms);
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error(`Media ${event} failed`));
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      target.removeEventListener(event, onOk);
      target.removeEventListener("error", onErr);
    };
    target.addEventListener(event, onOk, { once: true });
    target.addEventListener("error", onErr, { once: true });
  });
}

function drawCoverCrop(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  crop: DropStudioV5Crop | undefined,
  width: number,
  height: number
) {
  const frame = crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const sx = frame.x * sourceWidth;
  const sy = frame.y * sourceHeight;
  const sw = Math.max(1, frame.w * sourceWidth);
  const sh = Math.max(1, frame.h * sourceHeight);
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, width, height);
}

/**
 * Render the timeline with one video element. Throws if the edit cannot be
 * flattened; callers must keep the draft and must not publish the unedited tape.
 */
export async function exportDropStudioV5(
  session: DropStudioV5Session,
  mediaBag: DropStudioV5MediaBag,
  options?: { artOverlayUrl?: string }
): Promise<File> {
  const plan = buildExportPlan(session);
  if (!plan.video.length) throw new Error("Timeline has no video clips");
  for (const clip of [...plan.video, ...plan.audio, ...plan.art]) {
    if (!mediaBag[clip.mediaKey]?.url) throw new Error("A timeline clip is missing its media");
  }
  const mime = recorderMime();
  if (!mime || plan.durationMs < 80) throw new Error("This browser cannot record the timeline");

  const canvas = document.createElement("canvas");
  canvas.width = plan.width;
  canvas.height = plan.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");

  const video = document.createElement("video");
  video.playsInline = true;
  video.muted = false;
  video.volume = 1;
  video.preload = "auto";
  const audioCtx = new AudioContext();
  const mixDest = audioCtx.createMediaStreamDestination();
  const videoMix = audioCtx.createMediaElementSource(video);
  videoMix.connect(mixDest);
  const audioSources: AudioBufferSourceNode[] = [];
  const audioStarts: DropStudioV5ExportClip[] = [];
  for (const clip of plan.audio) {
    if (clip.muted) continue;
    const response = await fetch(mediaBag[clip.mediaKey].url);
    if (!response.ok) throw new Error("Couldn't read an audio clip");
    const decoded = await audioCtx.decodeAudioData(await response.arrayBuffer());
    const source = audioCtx.createBufferSource();
    source.buffer = decoded;
    const gain = audioCtx.createGain();
    gain.gain.value = clip.volume;
    source.connect(gain);
    gain.connect(mixDest);
    audioSources.push(source);
    audioStarts.push(clip);
  }

  const artImages = new Map<string, HTMLImageElement>();
  let overlay: HTMLImageElement | null = null;
  if (!plan.art.length && options?.artOverlayUrl) {
    overlay = await new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = options.artOverlayUrl || "";
    });
  }
  for (const clip of plan.art) {
    const url = mediaBag[clip.mediaKey]?.url;
    if (!url || artImages.has(clip.mediaKey)) continue;
    const image = await new Promise<HTMLImageElement | null>((resolve) => {
      const node = new Image();
      node.onload = () => resolve(node);
      node.onerror = () => resolve(null);
      node.src = url;
    });
    if (!image) throw new Error("An art overlay could not be read");
    artImages.set(clip.mediaKey, image);
  }

  const canvasStream = canvas.captureStream(30);
  const stream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...mixDest.stream.getAudioTracks(),
  ]);
  const recorder = new MediaRecorder(stream, { mimeType: mime });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  const release = () => {
    video.pause();
    video.src = "";
    for (const source of audioSources) {
      try {
        source.stop();
      } catch {
        // Already finished.
      }
    }
    stream.getTracks().forEach((track) => track.stop());
    void audioCtx.close().catch(() => {});
  };

  try {
    recorder.start(250);
    let audioArmed = false;
    for (const clip of plan.video) {
      video.src = mediaBag[clip.mediaKey].url;
      await waitFor(video, "loadeddata");
      video.currentTime = clip.trimInMs / 1000;
      await waitFor(video, "seeked");
      video.volume = clip.muted ? 0 : clip.volume;
      if (!audioArmed) {
        audioArmed = true;
        const startedAt = audioCtx.currentTime;
        audioSources.forEach((source, index) => {
          const bed = audioStarts[index];
          source.start(startedAt + bed.offsetMs / 1000, bed.trimInMs / 1000, bed.playableMs / 1000);
        });
      }
      await video.play();
      const end = clip.trimOutMs / 1000;
      await new Promise<void>((resolve) => {
        const draw = () => {
          if (video.currentTime >= end - 0.03 || video.ended) {
            resolve();
            return;
          }
          ctx.filter = canvasFilterFor(clip.filter);
          drawCoverCrop(ctx, video, video.videoWidth || plan.width, video.videoHeight || plan.height, clip.crop, plan.width, plan.height);
          ctx.filter = "none";
          const timelineMs = clip.offsetMs + Math.max(0, video.currentTime * 1000 - clip.trimInMs);
          for (const art of plan.art) {
            if (timelineMs < art.offsetMs || timelineMs >= art.endMs) continue;
            const image = artImages.get(art.mediaKey);
            if (!image) continue;
            const place = art.placement ?? { x: 0, y: 0, w: 1, h: 1 };
            ctx.drawImage(
              image,
              place.x * plan.width,
              place.y * plan.height,
              Math.max(1, place.w * plan.width),
              Math.max(1, place.h * plan.height)
            );
          }
          if (overlay) ctx.drawImage(overlay, 0, 0, plan.width, plan.height);
          requestAnimationFrame(draw);
        };
        draw();
      });
      video.pause();
    }

    if (typeof recorder.requestData === "function") recorder.requestData();
    recorder.stop();
    await stopped;
  } finally {
    release();
  }

  const blob = new Blob(chunks, { type: mime.split(";")[0] || "video/webm" });
  if (!blob.size) throw new Error("Timeline render was empty");
  const ext = blob.type.includes("mp4") ? "mp4" : "webm";
  return new File([blob], `board-timeline-${Date.now()}.${ext}`, { type: blob.type || "video/webm" });
}
