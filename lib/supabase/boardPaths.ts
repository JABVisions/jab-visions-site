const AUTH_ROUTE_PREFIXES = [
  "/board/login",
  "/board/signup",
  "/board/forgot-password",
  "/board/reset-password",
];

export function isBoardAuthRoute(pathname: string) {
  return AUTH_ROUTE_PREFIXES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

export function safeBoardNext(
  raw: string | null | undefined,
  fallback = "/board/feed"
) {
  if (!raw) return fallback;

  let value = raw.trim();
  try {
    if (value.includes("%")) value = decodeURIComponent(value);
  } catch {
    return fallback;
  }

  if (!value.startsWith("/board")) return fallback;
  if (value.startsWith("//") || value.includes("://")) return fallback;
  if (value.includes("\\")) return fallback;

  const pathOnly = value.split("?")[0] || "";
  if (pathOnly === "/board" || isBoardAuthRoute(pathOnly)) return fallback;

  return value;
}
