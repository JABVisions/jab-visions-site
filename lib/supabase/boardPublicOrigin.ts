const DEFAULT_BOARD_ORIGIN = "https://www.jabvisions.com";

/**
 * Use the public Board origin for auth emails. A reset requested from a local
 * dev server must never send a real user to localhost, which only works on the
 * developer's machine.
 */
export function boardPublicOrigin(requestOrigin: string) {
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
