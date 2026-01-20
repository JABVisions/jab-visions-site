/* lib/board/pins.ts */

export type BoardPin = {
  id: string;
  type: "post" | "thread" | "board" | "custom";
  title?: string;
  url?: string;
  createdAt: number;
};

const PINS_KEY = "jab_board_pins_v1";

/* ----------------------------------------
   Internal helpers
---------------------------------------- */

function readPins(): BoardPin[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PINS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePins(pins: BoardPin[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PINS_KEY, JSON.stringify(pins));
  } catch {
    // ignore storage errors
  }
}

/* ----------------------------------------
   Public API
---------------------------------------- */

export function getPins(): BoardPin[] {
  return readPins();
}

export function isPinned(id: string): boolean {
  return readPins().some((p) => p.id === id);
}

export function addPin(pin: BoardPin): BoardPin[] {
  const pins = readPins();

  // prevent duplicates
  if (pins.some((p) => p.id === pin.id)) {
    return pins;
  }

  const next = [pin, ...pins];
  writePins(next);
  return next;
}

export function removePin(id: string): BoardPin[] {
  const pins = readPins();
  const next = pins.filter((p) => p.id !== id);
  writePins(next);
  return next;
}

export function clearPins() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PINS_KEY);
}
