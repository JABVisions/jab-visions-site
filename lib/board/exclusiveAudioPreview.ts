export type PreviewTransport = {
  pause(): void;
  play(): Promise<void> | void;
  currentTime: number;
  src: string;
  onended: (() => void) | null;
};

export type ExclusiveAudioPreview = {
  getPlayingId: () => string | null;
  isPlaying: (id: string) => boolean;
  stop: () => void;
  play: (id: string, src: string, options?: { revokeOnStop?: boolean }) => Promise<void>;
};

type CreateExclusiveAudioPreviewOptions = {
  createTransport?: (src: string) => PreviewTransport;
  revokeObjectURL?: (url: string) => void;
};

function safePause(transport: PreviewTransport | null) {
  if (!transport) return;
  try {
    transport.pause();
  } catch {
    // Already stopped or not started.
  }
  try {
    transport.currentTime = 0;
  } catch {
    // Some mocks / detached nodes reject seeking.
  }
  transport.onended = null;
  try {
    transport.src = "";
  } catch {
    // Detached audio elements can throw when clearing src.
  }
}

/**
 * One preset (or clip) preview at a time. `play(id)` stops whatever is already
 * sounding — including in-flight play() calls — before starting `id`.
 */
export function createExclusiveAudioPreview(
  options: CreateExclusiveAudioPreviewOptions = {}
): ExclusiveAudioPreview {
  const createTransport =
    options.createTransport ??
    ((src: string) => {
      const AudioCtor =
        typeof Audio !== "undefined"
          ? Audio
          : (globalThis as typeof globalThis & { Audio?: typeof Audio }).Audio;
      if (!AudioCtor) {
        throw new Error("Audio playback is unavailable");
      }
      return new AudioCtor(src) as unknown as PreviewTransport;
    });
  const revokeObjectURL =
    options.revokeObjectURL ??
    ((url: string) => {
      if (typeof URL !== "undefined" && url.startsWith("blob:")) {
        URL.revokeObjectURL(url);
      }
    });

  let generation = 0;
  let playingId: string | null = null;
  let transport: PreviewTransport | null = null;
  let ownedUrl: string | null = null;

  const forgetOwnedUrl = () => {
    if (!ownedUrl) return;
    const url = ownedUrl;
    ownedUrl = null;
    try {
      revokeObjectURL(url);
    } catch {
      // Already revoked.
    }
  };

  const stop = () => {
    generation += 1;
    playingId = null;
    const current = transport;
    transport = null;
    safePause(current);
    forgetOwnedUrl();
  };

  const play = async (id: string, src: string, playOptions?: { revokeOnStop?: boolean }) => {
    stop();
    const token = generation;
    playingId = id;
    const next = createTransport(src);
    transport = next;
    ownedUrl = playOptions?.revokeOnStop ? src : null;
    next.onended = () => {
      if (token !== generation) return;
      if (playingId === id) playingId = null;
      if (transport === next) transport = null;
      safePause(next);
      forgetOwnedUrl();
    };
    try {
      await next.play();
    } catch {
      if (token === generation && playingId === id) playingId = null;
    }
    if (token !== generation) {
      safePause(next);
    }
  };

  return {
    getPlayingId: () => playingId,
    isPlaying: (id: string) => playingId === id,
    stop,
    play,
  };
}

const extraStoppers = new Set<() => void>();
const sharedPreview = createExclusiveAudioPreview();

/** Register another preview surface (e.g. the VoicePresets <audio>) so it silences with the booth. */
export function registerExclusivePreviewStopper(stop: () => void) {
  extraStoppers.add(stop);
  return () => {
    extraStoppers.delete(stop);
  };
}

export function stopAllExclusiveAudioPreviews() {
  sharedPreview.stop();
  for (const stop of extraStoppers) {
    try {
      stop();
    } catch {
      // One surface failing must not leave the others sounding.
    }
  }
}

export function playExclusiveAudioPreview(
  id: string,
  src: string,
  options?: { revokeOnStop?: boolean }
) {
  for (const stop of extraStoppers) {
    try {
      stop();
    } catch {
      // Ignore sibling surfaces that already tore down.
    }
  }
  return sharedPreview.play(id, src, options);
}

export function getExclusivePlayingId() {
  return sharedPreview.getPlayingId();
}
