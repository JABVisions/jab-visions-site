/** Helpers for Board Music Drops — uploaded files play in full on-platform. */

const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|flac|weba)(\?|#|$)/i;

export function isAudioFileUrl(url: string): boolean {
  if (!url) return false;
  const clean = url.split("?")[0].split("#")[0];
  return AUDIO_EXT.test(clean);
}

export function isStreamingMusicUrl(url: string): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host.includes("spotify.com") ||
      host.includes("soundcloud.com") ||
      host.includes("music.apple.com") ||
      host.includes("youtube.com") ||
      host.includes("youtu.be")
    );
  } catch {
    return false;
  }
}

export function isMusicDropType(dropType: string): boolean {
  const dt = dropType.toLowerCase();
  return dt === "music" || dt.includes("music");
}

/**
 * Pick the best on-platform audio source for a Music Drop (uploaded file).
 * Ignores streaming links and link-preview artwork.
 */
export function resolveStoredAudioSrc(opts: {
  mediaKind?: string | null;
  dropType?: string | null;
  signedUrl?: string | null;
  mediaUrl?: string | null;
  href?: string | null;
  hasStoragePath?: boolean;
}): string {
  const isMusic = isMusicDropType(String(opts.dropType ?? ""));
  const treatsAsAudio =
    opts.mediaKind === "audio" || (isMusic && !!opts.hasStoragePath);

  if (!treatsAsAudio) return "";

  const candidates = [opts.signedUrl, opts.mediaUrl, opts.href].filter(
    (v): v is string => typeof v === "string" && !!v.trim()
  );

  for (const url of candidates) {
    if (isAudioFileUrl(url)) return url;
    if (isStreamingMusicUrl(url)) continue;
  }

  // Signed storage URLs may omit a clean extension — trust audio kind + storage.
  if (opts.hasStoragePath && opts.signedUrl) return opts.signedUrl;

  return "";
}
