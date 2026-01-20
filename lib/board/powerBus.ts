// lib/board/powerBus.ts
export const POWER_EVENT = "jab:droppad_power";
const POWER_KEY = "jab_droppad_power_v1";

export function readPower(defaultValue = false): boolean {
  if (typeof window === "undefined") return defaultValue;
  try {
    const raw = window.localStorage.getItem(POWER_KEY);
    if (raw === null) return defaultValue;
    return raw === "1";
  } catch {
    return defaultValue;
  }
}

export function writePower(on: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(POWER_KEY, on ? "1" : "0");
  } catch {}
}

export function emitPower(on: boolean, source: string = "unknown") {
  if (typeof window === "undefined") return;
  const ev = new CustomEvent(POWER_EVENT, { detail: { on, source, at: Date.now() } });
  window.dispatchEvent(ev);
}

export function setPower(on: boolean, source: string = "unknown") {
  writePower(on);
  emitPower(on, source);
}

export function togglePower(source: string = "unknown") {
  const next = !readPower(false);
  setPower(next, source);
  return next;
}

/** Convenience: subscribe to power changes */
export function onPowerChange(
  handler: (on: boolean, meta?: { source?: string; at?: number }) => void
) {
  if (typeof window === "undefined") return () => {};
  const fn = (e: Event) => {
    const ce = e as CustomEvent;
    const d = (ce?.detail || {}) as any;
    handler(!!d.on, { source: d.source, at: d.at });
  };
  window.addEventListener(POWER_EVENT, fn as EventListener);
  return () => window.removeEventListener(POWER_EVENT, fn as EventListener);
}
