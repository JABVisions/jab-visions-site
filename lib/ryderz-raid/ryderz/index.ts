import type { RyderId } from '../config';
import { LeoKit } from './leo';
import { KevenKit } from './keven';
import type { RyderKit } from './kit';

export type { KitContext, KitFrame, KitTarget, MeleeStep, RyderKit } from './kit';

/**
 * Per-Ryder combat kits. A Ryder without a kit keeps the engine's generic
 * handling for her moves and melee; add an entry here when her overhaul lands.
 */
const KITS: Partial<Record<RyderId, () => RyderKit>> = {
  leo: () => new LeoKit(),
  keven: () => new KevenKit(),
};

export function createRyderKit(id: RyderId): RyderKit | null {
  return KITS[id]?.() ?? null;
}
