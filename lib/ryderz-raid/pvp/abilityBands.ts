import type { AbilityId } from '../config';

/** How an ability wants to be used. The CPU reads this; the kits do not. */
export type AbilityBand = 'close' | 'mid' | 'long' | 'movement' | 'defensive';

export const ABILITY_BANDS: Record<AbilityId, AbilityBand> = {
  bladeFan: 'close',
  duplicate: 'mid',
  envyPulse: 'close',
  shockwave: 'mid',
  overdrive: 'movement',
  prideDash: 'close',
  cleave: 'close',
  blink: 'movement',
  greedSiphon: 'close',
  lift: 'defensive',
  forcefield: 'defensive',
  heartbreak: 'long',
  decoy: 'movement',
  phase: 'defensive',
  dartStorm: 'mid',
  soulDrain: 'close',
  giantStep: 'close',
  animalAllegiance: 'mid',
  phantomGrasp: 'mid',
  paranormalProjection: 'mid',
  dimensionalCollapse: 'mid',
  temporalZap: 'long',
  rewindProtocol: 'defensive',
  zeroHour: 'close',
  showtime: 'mid',
  letsBeBad: 'close',
  abracadabra: 'mid',
  dreamVision: 'mid',
  proclaimPeace: 'long',
  freeAtLast: 'movement',
};

/** 0–1. A close cutter scores almost nothing from across the block. */
export function bandFit(band: AbilityBand, dist: number): number {
  switch (band) {
    case 'close':
      if (dist < 4.4) return 1;
      if (dist < 7) return 0.28;
      return 0.04;
    case 'mid':
      if (dist < 2.4) return 0.45;
      if (dist < 12) return 1;
      return 0.3;
    case 'long':
      if (dist < 3.5) return 0.22;
      if (dist < 16) return 1;
      return 0.4;
    case 'movement':
      if (dist > 5) return 1;
      if (dist > 2.6) return 0.55;
      return 0.32;
    case 'defensive':
      return 0.62;
    default:
      return 0.4;
  }
}
