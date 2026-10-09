import type { RyderId } from '@/lib/ryderz-raid/config';

/** Signature colours that tint the HUD and menus for each Ryder. */
export const RYDER_THEME: Record<RyderId, { label: string; aura: string; soft: string }> = {
  rubi: { label: 'Red', aura: '#ff5c66', soft: 'rgba(255, 48, 64, 0.32)' },
  leo: { label: 'Yellow', aura: '#ffe85c', soft: 'rgba(255, 230, 0, 0.3)' },
  aaron: { label: 'Black', aura: '#c9b8ff', soft: 'rgba(123, 77, 255, 0.35)' },
  zoe: { label: 'Blue', aura: '#66cfff', soft: 'rgba(40, 180, 255, 0.32)' },
  keven: { label: 'Pink', aura: '#ff68d7', soft: 'rgba(255, 85, 204, 0.32)' },
  lilly: { label: 'Green', aura: '#3dff7a', soft: 'rgba(57, 240, 122, 0.32)' },
};

export const NEUTRAL_THEME = { label: 'Signal', aura: '#31ff96', soft: 'rgba(49,255,150,0.3)' };
