import { RYDERZ, type RyderId } from '../config';
import { coerceGameMode, GameMode } from '../game-mode';
import type { RyderManager, RyderManagerState } from '../ryder-manager';

export const SAVE_SLOT_COUNT = 3;
const STORAGE_KEY = 'ryderz-raid:saves:v1';

export interface SaveSnapshot {
  activeRyder: RyderId;
  loadouts: RyderManagerState['loadouts'];
  unlocked: RyderManagerState['unlocked'];
  gameMode: GameMode;
  arenaId: RyderManagerState['arenaId'];
}

export interface SaveSlot {
  id: string;
  slotIndex: number;
  empty: boolean;
  updatedAt: number;
  displayName: string;
  snapshot: SaveSnapshot | null;
}

interface SaveFile {
  activeSlot: number;
  slots: Array<SaveSlot | null>;
}

type Listener = () => void;

function emptySlot(index: number): SaveSlot {
  return {
    id: `save-${index + 1}`,
    slotIndex: index,
    empty: true,
    updatedAt: 0,
    displayName: `Save Slot ${index + 1}`,
    snapshot: null,
  };
}

function defaultFile(): SaveFile {
  return {
    activeSlot: 0,
    slots: Array.from({ length: SAVE_SLOT_COUNT }, (_, i) => emptySlot(i)),
  };
}

function hydrateSlot(raw: unknown, index: number): SaveSlot {
  const fallback = emptySlot(index);
  if (!raw || typeof raw !== 'object') return fallback;
  const data = raw as Partial<SaveSlot>;
  const snapshot = data.snapshot && typeof data.snapshot === 'object' ? data.snapshot : null;
  const ryder = snapshot && snapshot.activeRyder in RYDERZ ? snapshot.activeRyder : null;
  if (!snapshot || !ryder) return fallback;
  return {
    id: typeof data.id === 'string' ? data.id : fallback.id,
    slotIndex: index,
    empty: false,
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now(),
    displayName: typeof data.displayName === 'string' ? data.displayName : RYDERZ[ryder].name,
    snapshot: {
      ...snapshot,
      activeRyder: ryder,
      gameMode: coerceGameMode(snapshot.gameMode),
    },
  };
}

/**
 * Lightweight local save slots. Cloud / account saves stay out of this phase.
 * Live session state still lives on RyderManager; this copies it in and out.
 */
export class SaveManager {
  private file: SaveFile;
  private snapshot: { activeSlot: number; slots: SaveSlot[] };
  private listeners = new Set<Listener>();

  constructor() {
    this.file = this.load();
    this.snapshot = { activeSlot: this.file.activeSlot, slots: this.slots() };
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState() {
    return this.snapshot;
  }

  slots(): SaveSlot[] {
    return Array.from({ length: SAVE_SLOT_COUNT }, (_, i) => this.file.slots[i] ?? emptySlot(i));
  }

  active(): SaveSlot {
    return this.slots()[this.file.activeSlot] ?? emptySlot(this.file.activeSlot);
  }

  hasAnySave() {
    return this.slots().some((slot) => !slot.empty);
  }

  selectSlot(index: number) {
    if (index < 0 || index >= SAVE_SLOT_COUNT) return;
    this.file.activeSlot = index;
    this.persist();
  }

  createSave(index: number, manager: RyderManager, label?: string) {
    const snapshot = captureManager(manager);
    const spec = RYDERZ[snapshot.activeRyder];
    this.file.slots[index] = {
      id: `save-${index + 1}`,
      slotIndex: index,
      empty: false,
      updatedAt: Date.now(),
      displayName: label ?? spec.name,
      snapshot,
    };
    this.file.activeSlot = index;
    this.persist();
  }

  saveGame(manager: RyderManager) {
    const current = this.active();
    if (current.empty) this.createSave(this.file.activeSlot, manager);
    else this.createSave(current.slotIndex, manager, current.displayName);
  }

  loadGame(index: number, manager: RyderManager) {
    const slot = this.slots()[index];
    if (!slot || slot.empty || !slot.snapshot) return false;
    this.file.activeSlot = index;
    manager.applySnapshot(slot.snapshot);
    this.persist();
    return true;
  }

  deleteSave(index: number) {
    this.file.slots[index] = emptySlot(index);
    this.persist();
  }

  private persist() {
    this.save();
    this.snapshot = { activeSlot: this.file.activeSlot, slots: this.slots() };
    this.listeners.forEach((listener) => listener());
  }

  private load(): SaveFile {
    if (typeof window === 'undefined') return defaultFile();
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultFile();
      const parsed = JSON.parse(raw) as Partial<SaveFile>;
      const slots = Array.from({ length: SAVE_SLOT_COUNT }, (_, i) => hydrateSlot(parsed.slots?.[i], i));
      const activeSlot =
        typeof parsed.activeSlot === 'number' && parsed.activeSlot >= 0 && parsed.activeSlot < SAVE_SLOT_COUNT
          ? parsed.activeSlot
          : 0;
      return { activeSlot, slots };
    } catch {
      return defaultFile();
    }
  }

  private save() {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.file));
    } catch {
      // Session still works in memory if storage is blocked.
    }
  }
}

export function captureManager(manager: RyderManager): SaveSnapshot {
  const state = manager.getState();
  return {
    activeRyder: state.activeRyder,
    loadouts: state.loadouts,
    unlocked: state.unlocked,
    gameMode: coerceGameMode(state.gameMode),
    arenaId: state.arenaId,
  };
}
