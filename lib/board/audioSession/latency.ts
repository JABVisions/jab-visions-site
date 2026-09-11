export const STUDIO_LATENCY_STORAGE_KEY = "jab_studio_latency_ms";
export const STUDIO_LATENCY_MAX_MS = 400;

export function readStudioLatencyMs() {
  if (typeof window === "undefined") return 0;
  const raw = Number(window.localStorage.getItem(STUDIO_LATENCY_STORAGE_KEY));
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(STUDIO_LATENCY_MAX_MS, Math.round(raw)));
}

export function writeStudioLatencyMs(value: number) {
  if (typeof window === "undefined") return;
  const next = Math.max(0, Math.min(STUDIO_LATENCY_MAX_MS, Math.round(value)));
  window.localStorage.setItem(STUDIO_LATENCY_STORAGE_KEY, String(next));
  return next;
}
