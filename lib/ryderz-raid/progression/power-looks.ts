import type { RyderId } from '../config';
import type { AuraStyle, BindStyle, PillarStyle, ShotShape, WaveStyle } from '../power-fx';

/**
 * What each Ryder's tree powers look like in the street. The six behaviours
 * are shared (`derived-powers.ts`); this is how Keven's volley is a fan of
 * real darts, Rubi's a spread of spinning blades and TJ's a clip of tracers,
 * and how a snare reads as darts pinning ankles, red threads or shadow hands.
 */
export interface PowerLook {
  /** Projectile every volley, spray and radial burst of this Ryder throws. */
  shot: ShotShape;
  breaker: { pillar?: PillarStyle; spray?: number; wave?: WaveStyle; flash?: boolean };
  nova: { radial?: number; wave?: WaveStyle; flash?: boolean; implode?: boolean };
  snare: BindStyle;
  surge: AuraStyle;
  blitz: {
    /** Each dash leaves a shot in its target; the finisher sets them all off. */
    stick?: boolean;
    /** The crowd is dragged into the Ryder before the finisher lands. */
    vortex?: boolean;
    radial?: number;
    wave?: WaveStyle;
    flash?: boolean;
    pillar?: PillarStyle;
  };
}

export const POWER_LOOKS: Record<RyderId, PowerLook> = {
  leo: {
    shot: 'bolt',
    breaker: { wave: 'shock', flash: true },
    nova: { wave: 'shock', radial: 10 },
    snare: 'cage',
    surge: 'spark',
    blitz: { wave: 'shock', flash: true, radial: 12 },
  },
  rubi: {
    shot: 'blade',
    breaker: { pillar: 'slash', wave: 'shock' },
    nova: { radial: 12, wave: 'shock' },
    snare: 'threads',
    surge: 'spark',
    blitz: { radial: 14, wave: 'shock', pillar: 'slash' },
  },
  aaron: {
    shot: 'shard',
    breaker: { pillar: 'column', wave: 'shadow' },
    nova: { wave: 'shadow', radial: 8 },
    snare: 'hands',
    surge: 'smoke',
    blitz: { wave: 'shadow', pillar: 'column', flash: true },
  },
  zoe: {
    shot: 'orb',
    breaker: { flash: true, wave: 'shock' },
    nova: { implode: true, flash: true, wave: 'shock' },
    snare: 'cage',
    surge: 'spark',
    blitz: { vortex: true, flash: true, wave: 'shock' },
  },
  keven: {
    shot: 'dart',
    breaker: { spray: 9, wave: 'shock' },
    nova: { radial: 16 },
    snare: 'pins',
    surge: 'spark',
    blitz: { stick: true, wave: 'shock' },
  },
  lilly: {
    shot: 'spine',
    breaker: { pillar: 'spikes', wave: 'blight' },
    nova: { wave: 'blight', radial: 10 },
    snare: 'roots',
    surge: 'flame',
    blitz: { pillar: 'spikes', wave: 'blight' },
  },
  'kid-paranormal': {
    shot: 'orb',
    breaker: { flash: true, wave: 'shock' },
    nova: { wave: 'shock', flash: true },
    snare: 'hands',
    surge: 'smoke',
    blitz: { vortex: true, wave: 'shadow', flash: true },
  },
  'agent-nyx': {
    shot: 'sliver',
    breaker: { wave: 'shock', flash: true },
    nova: { wave: 'shock', radial: 12, implode: true },
    snare: 'clock',
    surge: 'tick',
    blitz: { vortex: true, radial: 12, wave: 'shock' },
  },
  'marilyn-monroe': {
    shot: 'star',
    breaker: { pillar: 'spotlight', flash: true },
    nova: { flash: true, radial: 10 },
    snare: 'spotlight',
    surge: 'star',
    blitz: { pillar: 'spotlight', flash: true, radial: 14 },
  },
  'martin-luther-king': {
    shot: 'stone',
    breaker: { wave: 'shock', pillar: 'column' },
    nova: { wave: 'shock' },
    snare: 'ward',
    surge: 'spark',
    blitz: { pillar: 'column', wave: 'shock', flash: true },
  },
  marywantis: {
    shot: 'droplet',
    breaker: { pillar: 'geyser', wave: 'water' },
    nova: { wave: 'water' },
    snare: 'current',
    surge: 'bubble',
    blitz: { vortex: true, wave: 'water', pillar: 'geyser' },
  },
  tj: {
    shot: 'bullet',
    breaker: { flash: true, wave: 'shock' },
    nova: { flash: true, wave: 'shock' },
    snare: 'cuffs',
    surge: 'flame',
    blitz: { radial: 16, flash: true, wave: 'shock' },
  },
};

export function powerLook(id: RyderId): PowerLook {
  return POWER_LOOKS[id] ?? POWER_LOOKS.leo;
}

/** Particles a surge throws off the body each frame. */
export const AURA_PARTICLES: Record<AuraStyle, { rate: number; speed: number; size: number; life: number; up: number; white?: boolean }> = {
  flame: { rate: 40, speed: 1.6, size: 0.3, life: 0.45, up: 2.6 },
  spark: { rate: 36, speed: 5, size: 0.13, life: 0.22, up: 0.6 },
  bubble: { rate: 18, speed: 0.8, size: 0.22, life: 0.9, up: 1.4, white: true },
  smoke: { rate: 22, speed: 1.2, size: 0.42, life: 0.8, up: 1.1 },
  star: { rate: 20, speed: 2.4, size: 0.2, life: 0.5, up: 0.9, white: true },
  tick: { rate: 16, speed: 0.6, size: 0.16, life: 0.6, up: 0.3 },
};
