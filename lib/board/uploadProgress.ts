import { formatBytes } from "@/lib/board/uploadLimits";

export type BoardUploadProgress = {
  loaded: number;
  total: number;
  percent: number;
  bytesPerSecond: number;
  etaMs: number | null;
  label: string;
};

export type BoardUploadProgressHandler = (progress: BoardUploadProgress | null) => void;

export const UPLOAD_PROGRESS_THROTTLE_MS = 90;

export function formatUploadEta(etaMs: number | null, loaded = 0, total = 0): string {
  if (total > 0 && loaded >= total) return "Almost done";
  if (etaMs == null || !Number.isFinite(etaMs) || etaMs < 0) return "Calculating time left…";
  if (etaMs < 1500) return "Almost done";
  const seconds = Math.max(1, Math.round(etaMs / 1000));
  if (seconds < 60) return `About ${seconds}s left`;
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `About ${minutes} min left`;
}

export function formatUploadBytes(loaded: number, total: number): string {
  if (total > 0) return `${formatBytes(Math.max(0, loaded))} / ${formatBytes(total)}`;
  if (loaded > 0) return formatBytes(loaded);
  return "Waiting…";
}

export function makeUploadProgress(
  loaded: number,
  total: number,
  bytesPerSecond: number,
  label?: string
): BoardUploadProgress {
  const safeLoaded = Number.isFinite(loaded) ? Math.max(0, loaded) : 0;
  const safeTotal = Number.isFinite(total) ? Math.max(0, total) : 0;
  const percent = safeTotal > 0 ? Math.min(100, Math.round((safeLoaded / safeTotal) * 100)) : 0;
  const speed = Number.isFinite(bytesPerSecond) ? Math.max(0, bytesPerSecond) : 0;
  const etaMs =
    safeTotal > 0 && safeLoaded >= safeTotal
      ? 0
      : speed > 0 && safeTotal > safeLoaded
        ? Math.round(((safeTotal - safeLoaded) / speed) * 1000)
        : null;
  return {
    loaded: safeLoaded,
    total: safeTotal,
    percent,
    bytesPerSecond: speed,
    etaMs,
    label: label ?? (percent <= 0 && safeLoaded <= 0 ? "Preparing upload…" : formatUploadEta(etaMs, safeLoaded, safeTotal)),
  };
}

export function preparingUploadProgress(total = 0): BoardUploadProgress {
  return makeUploadProgress(0, total, 0, "Preparing upload…");
}

/** Video Tools must show a bar as soon as save starts, even at 0%. */
export function studioVisibleUploadProgress(opts: {
  processing: boolean;
  isVideo: boolean;
  progress: BoardUploadProgress | null | undefined;
  totalBytes?: number;
}): BoardUploadProgress | null {
  if (opts.progress) return opts.progress;
  if (opts.processing && opts.isVideo) {
    const total =
      typeof opts.totalBytes === "number" && Number.isFinite(opts.totalBytes) && opts.totalBytes > 0
        ? opts.totalBytes
        : 0;
    return preparingUploadProgress(total);
  }
  return null;
}

export function createUploadProgressReporter(
  onProgress?: BoardUploadProgressHandler,
  throttleMs = UPLOAD_PROGRESS_THROTTLE_MS
) {
  let lastEmitAt = 0;
  let startedAt = 0;
  let lastLoaded = 0;
  let lastTotal = 0;

  const emitNow = (loaded: number, total: number, label?: string) => {
    const now = Date.now();
    if (!startedAt && loaded > 0) startedAt = now;
    const elapsed = startedAt ? now - startedAt : 0;
    const bytesPerSecond = elapsed >= 250 && loaded > 0 ? (loaded / elapsed) * 1000 : 0;
    lastEmitAt = now;
    lastLoaded = loaded;
    lastTotal = total;
    onProgress?.(makeUploadProgress(loaded, total, bytesPerSecond, label));
  };

  return {
    preparing(total = 0) {
      startedAt = 0;
      lastLoaded = 0;
      lastTotal = total;
      emitNow(0, total, "Preparing upload…");
      lastEmitAt = 0;
    },
    emit(loaded: number, total: number, label?: string) {
      if (!onProgress) return;
      const now = Date.now();
      const done = total > 0 && loaded >= total;
      if (!done && lastLoaded > 0 && lastEmitAt && now - lastEmitAt < throttleMs) return;
      emitNow(loaded, total, label);
    },
    complete(total = Math.max(lastLoaded, lastTotal)) {
      const finalTotal = Math.max(total, lastLoaded, lastTotal);
      emitNow(finalTotal, finalTotal, "Almost done");
    },
  };
}

/** Known-total wrapper used by `uploadBoardMediaFile` across PUT / tus / signed attempts. */
export function createUploadProgressTracker(
  total: number,
  onProgress?: BoardUploadProgressHandler
) {
  const reporter = createUploadProgressReporter(onProgress);
  const knownTotal = Number.isFinite(total) && total > 0 ? total : 0;
  return {
    preparing() {
      reporter.preparing(knownTotal);
    },
    reset() {
      reporter.preparing(knownTotal);
    },
    bytes(loaded: number, incomingTotal = knownTotal) {
      reporter.emit(loaded, incomingTotal > 0 ? incomingTotal : knownTotal);
    },
    finishing() {
      reporter.complete(knownTotal);
    },
  };
}
