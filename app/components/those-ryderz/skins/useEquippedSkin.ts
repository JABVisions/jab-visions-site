'use client';

import { useSyncExternalStore } from 'react';
import type { RyderId } from '@/lib/ryderz-raid/config';
import { equippedSkinId, equippedSkins, onSkinStatus } from '@/lib/ryderz-raid/skins/appearance';

const NONE: Readonly<Partial<Record<RyderId, string>>> = {};

/** The local player's equipped skin for a Ryder, re-rendering when it changes. */
export function useEquippedSkin(ryderId: RyderId | null | undefined): string | null {
  return useSyncExternalStore(
    onSkinStatus,
    () => (ryderId ? equippedSkinId(ryderId) : null),
    () => null,
  );
}

/** Every equipped skin, re-rendering when any of them changes. */
export function useEquippedSkins(): Readonly<Partial<Record<RyderId, string>>> {
  return useSyncExternalStore(onSkinStatus, equippedSkins, () => NONE);
}
