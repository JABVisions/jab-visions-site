const DEFAULT_BOARD_ORIGIN = "https://www.jabvisions.com";

/**
 * Use the public Board origin for auth emails. A reset requested from a local
 * dev server must never send a real user to localhost, which only works on the
 * developer's machine.
 */
export function boardPublicOrigin(requestOrigin: string) {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configuredOrigin) {
    try {
      const parsed = new URL(configuredOrigin);
      if (parsed.protocol === "https:" || parsed.hostname === "localhost") {
        return parsed.origin;
      }
    } catch {
      // Fall back to the request's known origin below.
    }
  }

  try {
    const requestUrl = new URL(requestOrigin);
    if (["localhost", "127.0.0.1", "::1"].includes(requestUrl.hostname)) {
      return DEFAULT_BOARD_ORIGIN;
    }
    return requestUrl.origin;
  } catch {
    return DEFAULT_BOARD_ORIGIN;
  }
}
