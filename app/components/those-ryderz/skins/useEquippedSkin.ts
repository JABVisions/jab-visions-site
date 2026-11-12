'use client';

import { useSyncExternalStore } from 'react';
import type { RyderId } from '@/lib/ryderz-raid/config';
import { equippedSkinId, onSkinStatus } from '@/lib/ryderz-raid/skins/appearance';

/** The local player's equipped skin for a Ryder, re-rendering when it changes. */
export function useEquippedSkin(ryderId: RyderId | null | undefined): string | null {
  return useSyncExternalStore(
    onSkinStatus,
    () => (ryderId ? equippedSkinId(ryderId) : null),
    () => null,
  );
}
