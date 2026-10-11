import { GameMode } from '../game-mode';
import { characterRegistry, type RaidCharacter } from './characterRegistry';

/**
 * Premiere select groups the live registry. New fighters show up when they
 * are added to the roster; the screen does not keep its own name list.
 */
export const PREMIERE_CATEGORIES = ['ryderz', 'boomerz', 'jab-visions'] as const;
export type PremiereCategory = (typeof PREMIERE_CATEGORIES)[number];

export const PREMIERE_CATEGORY_LABEL: Record<PremiereCategory, string> = {
  ryderz: 'Ryderz',
  boomerz: 'Those Boomerz',
  'jab-visions': 'JAB Visions Universe',
};

export interface LineupSlot {
  index: number;
  x: number;
  z: number;
  row: number;
}

export interface LineupFrame {
  x: number;
  y: number;
  z: number;
  lookX: number;
  lookY: number;
  lookZ: number;
}

export function premiereCategory(character: RaidCharacter): PremiereCategory {
  if (character.category === 'boomer') return 'boomerz';
  if (character.category === 'jab-visions') return 'jab-visions';
  return 'ryderz';
}

export function premiereRoster(): RaidCharacter[] {
  return characterRegistry();
}

export function charactersInCategory(characters: RaidCharacter[], category: PremiereCategory): RaidCharacter[] {
  return characters.filter((character) => premiereCategory(character) === category);
}

/** A tile can enter the mode only when the registry already marks it playable there. */
export function canConfirmFighter(character: RaidCharacter, mode: GameMode): boolean {
  if (!character.playable || !character.unlocked || !character.ryderId) return false;
  if (mode === GameMode.SOLO) return character.availableInSolo;
  if (mode === GameMode.PVP) return character.availableInPvp;
  return character.availableInRaid;
}

/** Wider figures need more room. Spacing stays uniform so proportions are not squashed. */
export function lineupGap(widths: number[], min = 0.95): number {
  const widest = widths.reduce((max, width) => Math.max(max, width), 0.6);
  return Math.max(min, widest + 0.32);
}

/**
 * Side-by-side slots on a shared floor. More than six fighters split into two
 * rows, with the front row shifted so bodies do not stack.
 */
export function lineupFormation(count: number, gap = 1.2): LineupSlot[] {
  if (count <= 0) return [];
  const row = (n: number, z: number, shift: number, rowIndex: number, startIndex: number): LineupSlot[] => {
    const origin = -((n - 1) * gap) / 2 + shift;
    return Array.from({ length: n }, (_, i) => ({
      index: startIndex + i,
      x: origin + i * gap,
      z,
      row: rowIndex,
    }));
  };
  if (count <= 6) return row(count, 0, 0, 0, 0);
  const backCount = Math.ceil(count / 2);
  const frontCount = count - backCount;
  const shift = frontCount === backCount ? gap / 2 : 0;
  return [...row(backCount, -0.9, 0, 0, 0), ...row(frontCount, 0.55, shift, 1, backCount)];
}

/** Place the camera on +Z so fighters facing raid-forward look into the lens, and fit every slot. */
export function lineupFrame(slots: LineupSlot[], aspect: number, selectedReach = 0.95): LineupFrame {
  const safeAspect = Math.max(aspect, 0.55);
  if (!slots.length) {
    return { x: 0, y: 1.65, z: 5.2, lookX: 0, lookY: 1.05, lookZ: 0 };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const slot of slots) {
    minX = Math.min(minX, slot.x - 0.5);
    maxX = Math.max(maxX, slot.x + 0.5);
    minZ = Math.min(minZ, slot.z - 0.45);
    maxZ = Math.max(maxZ, slot.z + selectedReach + 0.35);
  }
  const width = Math.max(1.6, maxX - minX);
  const depth = Math.max(1.2, maxZ - minZ);
  const midX = (minX + maxX) / 2;
  const midZ = (minZ + maxZ) / 2;
  const fov = (26 * Math.PI) / 180;
  const fit = Math.max(width / safeAspect, depth * 0.85, 2.4);
  const distance = fit / 2 / Math.tan(fov / 2) + depth * 0.28;
  return {
    x: midX,
    y: 1.28 + distance * 0.16,
    z: midZ + distance,
    lookX: midX,
    lookY: 1.02,
    lookZ: midZ,
  };
}
