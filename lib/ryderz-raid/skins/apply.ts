import type { RyderSpec } from '../config';
import type { SkinDef } from './catalog';

/**
 * The Ryder's spec drawn in a skin. Only figure fields change. Melee styles
 * stay with the Ryder so strike timing is the same in every skin.
 */
export function skinnedSpec(base: RyderSpec, skin: SkinDef | null | undefined): RyderSpec {
  if (!skin || skin.ryderId !== base.id || !skin.model) return base;
  const model = skin.model;
  return {
    ...base,
    glb: model.glb,
    glbRepair: model.glbRepair,
    modelYaw: model.modelYaw,
    armHang: model.armHang,
    shoulderDrop: model.shoulderDrop,
    sashay: model.sashay,
    skelKeep: model.skelKeep,
  };
}

/** Cosmetic fields a skin may change. Anything else must match the base spec. */
export const SKIN_FIELDS = ['glb', 'glbRepair', 'modelYaw', 'armHang', 'shoulderDrop', 'sashay', 'skelKeep'] as const;
