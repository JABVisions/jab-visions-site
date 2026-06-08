export const BACKSTAGE_THUMBNAIL = "/assets/backstage-thumbnail.png";

export function isBackstageUrl(rawUrl?: string | null) {
  if (!rawUrl) return false;
  try {
    const host = new URL(rawUrl).hostname.replace(/^www\./, "").toLowerCase();
    return host === "backstage.com" || host.endsWith(".backstage.com");
  } catch {
    return /(^|\.)backstage\.com\//i.test(rawUrl);
  }
}

export function shouldReplaceBackstagePreview(rawUrl?: string | null, imageUrl?: string | null) {
  if (!isBackstageUrl(rawUrl)) return false;
  if (!imageUrl) return true;

  try {
    const host = new URL(imageUrl).hostname.toLowerCase();
    return host.includes("thum.io") || host.includes("screenshot");
  } catch {
    return /thum\.io|screenshot|not-authorized|unauthorized/i.test(imageUrl);
  }
}

export function resolveLinkPreviewImage(rawUrl?: string | null, imageUrl?: string | null) {
  if (shouldReplaceBackstagePreview(rawUrl, imageUrl)) return BACKSTAGE_THUMBNAIL;
  return imageUrl || null;
}
