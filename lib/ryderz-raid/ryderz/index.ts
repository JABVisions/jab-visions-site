import type { RyderId } from '../config';
import { LeoKit } from './leo';
import { KevenKit } from './keven';
import { AaronKit } from './aaron';
import { ZoeKit } from './zoe';
import { RubiKit } from './rubi';
import { LillyKit } from './lilly';
import { KidParanormalKit } from './kid-paranormal';
import { NyxKit } from './nyx';
import { MarilynKit } from '../boomers/marilyn';
import { MartinKit } from '../boomers/martin';
import type { RyderKit } from './kit';

export type { CameraExtra, HazardZone, KitContext, KitFrame, KitTarget, MeleeStep, RyderKit } from './kit';

/**
 * Per-Ryder combat kits. A Ryder without a kit keeps the engine's generic
 * handling for her moves and melee; add an entry here when her overhaul lands.
 */
const KITS: Partial<Record<RyderId, () => RyderKit>> = {
  rubi: () => new RubiKit(),
  lilly: () => new LillyKit(),
  leo: () => new LeoKit(),
  aaron: () => new AaronKit(),
  keven: () => new KevenKit(),
  zoe: () => new ZoeKit(),
  'kid-paranormal': () => new KidParanormalKit(),
  'agent-nyx': () => new NyxKit(),
  'marilyn-monroe': () => new MarilynKit(),
  'martin-luther-king': () => new MartinKit(),
};

export function createRyderKit(id: RyderId): RyderKit | null {
  return KITS[id]?.() ?? null;
}
