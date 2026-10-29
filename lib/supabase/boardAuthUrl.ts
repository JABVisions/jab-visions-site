const BOARD_CANONICAL_ORIGIN = "https://www.jabvisions.com";

function configuredBoardOrigin() {
  const configured = process.env.BOARD_PUBLIC_URL?.trim();
  if (!configured) return BOARD_CANONICAL_ORIGIN;

  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" || /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url.host)) {
      return BOARD_CANONICAL_ORIGIN;
    }
    return url.origin;
  } catch {
    return BOARD_CANONICAL_ORIGIN;
  }
}

export function boardAuthUrl(path: string) {
  return new URL(path, configuredBoardOrigin());
}
