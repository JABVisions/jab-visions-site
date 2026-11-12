'use client';

import { useSyncExternalStore } from 'react';
import { RYDERZ, type RyderId } from '@/lib/ryderz-raid/config';
import { skinById } from '@/lib/ryderz-raid/skins/catalog';
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

/** The HUD headshot for a Ryder in the local player's equipped skin. */
export function useRyderIcon(ryderId: RyderId): string {
  const skin = skinById(useEquippedSkin(ryderId));
  return skin?.ryderId === ryderId ? skin.icon : RYDERZ[ryderId].icon;
}
