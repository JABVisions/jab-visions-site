// Filmed video keeps its own aspect. Feed cards must not stretch a portrait
// take into a landscape box, and a recording must match the viewfinder crop.

export type CoverCrop = {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
};

/** Center crop of a source so it fills `frameRatio` (width / height) without stretching. */
export function coverCropRect(
  sourceWidth: number,
  sourceHeight: number,
  frameRatio: number
): CoverCrop {
  const sw0 = Math.max(1, sourceWidth);
  const sh0 = Math.max(1, sourceHeight);
  const ratio = frameRatio > 0 && Number.isFinite(frameRatio) ? frameRatio : sw0 / sh0;
  const sourceRatio = sw0 / sh0;
  let sw = sw0;
  let sh = sh0;
  if (sourceRatio > ratio) sw = sh0 * ratio;
  else sh = sw0 / ratio;
  return {
    sx: (sw0 - sw) / 2,
    sy: (sh0 - sh) / 2,
    sw,
    sh,
  };
}

/** Cover-crop a normalized sub-rectangle into a destination frame. */
export function coverCropWithin(
  sourceWidth: number,
  sourceHeight: number,
  crop: { x: number; y: number; w: number; h: number } | null | undefined,
  destWidth: number,
  destHeight: number
): CoverCrop {
  const frame = crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const baseX = frame.x * sourceWidth;
  const baseY = frame.y * sourceHeight;
  const baseW = Math.max(1, frame.w * sourceWidth);
  const baseH = Math.max(1, frame.h * sourceHeight);
  const destRatio = destHeight > 0 ? destWidth / destHeight : baseW / baseH;
  const inner = coverCropRect(baseW, baseH, destRatio);
  return {
    sx: baseX + inner.sx,
    sy: baseY + inner.sy,
    sw: inner.sw,
    sh: inner.sh,
  };
}

/** Even pixel size (encoders reject odd dimensions) for a width/height ratio. */
export function evenFrameSize(frameRatio: number, longEdge = 1080) {
  const ratio = frameRatio > 0 && Number.isFinite(frameRatio) ? frameRatio : 4 / 5;
  const edge = Math.max(2, Math.round(longEdge));
  const portrait = ratio < 1;
  let width = portrait ? Math.round(edge * ratio) : edge;
  let height = portrait ? edge : Math.round(edge / ratio);
  width = Math.max(2, width - (width % 2));
  height = Math.max(2, height - (height % 2));
  return { width, height };
}

/**
 * Camera request that prefers a 4:5 crop. `resizeMode` is ideal so a browser
 * that does not know it still opens the camera, and so the track is cropped
 * to the viewfinder instead of scaled into a different shape.
 */
export type FilmedCameraConstraints = MediaTrackConstraints & {
  resizeMode?: { ideal?: string };
};

export function filmedCameraConstraints(facing: "user" | "environment"): FilmedCameraConstraints {
  return {
    facingMode: { ideal: facing },
    width: { ideal: 1080 },
    height: { ideal: 1350 },
    aspectRatio: { ideal: 4 / 5 },
    resizeMode: { ideal: "crop-and-scale" },
  };
}

export type ViewfinderRecording = {
  stop: () => void;
  done: Promise<Blob>;
};

/**
 * Record the live viewfinder. The saved pixels are the cover crop on screen,
 * including the front-camera mirror, not the raw sensor buffer.
 * Returns null when this browser cannot record a canvas, so the caller can
 * fall back to the camera stream.
 */
export function startViewfinderRecording(opts: {
  video: HTMLVideoElement;
  stream: MediaStream;
  frameRatio: number;
  mirror?: boolean;
  mimeType?: string;
}): ViewfinderRecording | null {
  if (typeof document === "undefined" || typeof MediaRecorder === "undefined") return null;
  const { width, height } = evenFrameSize(opts.frameRatio, 1080);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx || typeof canvas.captureStream !== "function") return null;

  canvas.style.position = "fixed";
  canvas.style.left = "-9999px";
  canvas.style.top = "0";
  canvas.style.width = "2px";
  canvas.style.height = "2px";
  canvas.style.pointerEvents = "none";
  document.body.appendChild(canvas);

  const paint = () => {
    const vw = opts.video.videoWidth;
    const vh = opts.video.videoHeight;
    if (!vw || !vh) return;
    const crop = coverCropRect(vw, vh, width / height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (opts.mirror) {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(opts.video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);
  };

  let canvasStream: MediaStream;
  try {
    paint();
    canvasStream = canvas.captureStream(30);
  } catch {
    canvas.remove();
    return null;
  }
  if (!canvasStream.getVideoTracks().length) {
    canvas.remove();
    return null;
  }

  const mixed = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...opts.stream.getAudioTracks(),
  ]);
  let recorder: MediaRecorder;
  try {
    recorder = opts.mimeType
      ? new MediaRecorder(mixed, { mimeType: opts.mimeType })
      : new MediaRecorder(mixed);
  } catch {
    canvasStream.getTracks().forEach((track) => track.stop());
    canvas.remove();
    return null;
  }

  const chunks: Blob[] = [];
  let raf = 0;
  let stopped = false;
  const draw = () => {
    paint();
    raf = requestAnimationFrame(draw);
  };

  const done = new Promise<Blob>((resolve) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      cancelAnimationFrame(raf);
      canvasStream.getTracks().forEach((track) => track.stop());
      canvas.remove();
      const type = recorder.mimeType || opts.mimeType || "video/webm";
      resolve(new Blob(chunks, { type }));
    };
  });

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (recorder.state === "recording") {
      try {
        recorder.requestData();
      } catch {
        // Safari may not implement requestData.
      }
      try {
        recorder.stop();
      } catch {
        cancelAnimationFrame(raf);
        canvasStream.getTracks().forEach((track) => track.stop());
        canvas.remove();
      }
      return;
    }
    cancelAnimationFrame(raf);
    canvasStream.getTracks().forEach((track) => track.stop());
    canvas.remove();
  };

  try {
    recorder.start(250);
  } catch {
    stop();
    return null;
  }
  draw();
  return { stop, done };
}

/** Portrait Vision drops use the 4:5 Board frame. Landscape files keep their own ratio. */
export const VISION_PORTRAIT_ASPECT = "4 / 5";

export function visionFrameIsLandscape(width: number, height: number) {
  return Boolean(width && height && width / height > 1.05);
}

export function visionFrameAspect(width: number, height: number) {
  if (!visionFrameIsLandscape(width, height)) return VISION_PORTRAIT_ASPECT;
  return `${Math.round(width)} / ${Math.round(height)}`;
}

/** Size the feed frame: 4:5 for portrait, the file's own ratio when it is landscape. */
export function lockFilmedVideoAspect(el: HTMLVideoElement) {
  const w = el.videoWidth;
  const h = el.videoHeight;
  if (!w || !h) return;
  const landscape = visionFrameIsLandscape(w, h);
  el.style.width = "100%";
  el.style.height = "100%";
  el.style.objectFit = "cover";
  el.style.aspectRatio = "";
  const host = el.closest(".mediaFrame");
  if (host instanceof HTMLElement) {
    host.classList.toggle("is-wide", landscape);
    host.classList.add("has-frame");
    host.style.aspectRatio = visionFrameAspect(w, h);
    host.style.height = "auto";
  }
}
