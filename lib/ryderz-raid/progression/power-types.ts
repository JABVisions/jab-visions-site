import type { AbilityId } from '../config';
import { DERIVED_POWERS, type DerivedPowerKind } from './derived-powers';

/**
 * Every power has a type, the way X-Men Legends sorts a hero's powers:
 * melee strikes, projectiles, radials, control (debuffs and holds), boosts
 * (buffs, summons, heals) and the Xtreme. The Power Tree groups and colours
 * powers by type, and the Database prints it on the kit.
 */
export type PowerType = 'strike' | 'projectile' | 'radial' | 'control' | 'boost' | 'xtreme';

export const POWER_TYPES: PowerType[] = ['strike', 'projectile', 'radial', 'control', 'boost', 'xtreme'];

export const POWER_TYPE_LABEL: Record<PowerType, string> = {
  strike: 'Strike',
  projectile: 'Projectile',
  radial: 'Radial',
  control: 'Control',
  boost: 'Boost',
  xtreme: 'Xtreme',
};

export const POWER_TYPE_BLURB: Record<PowerType, string> = {
  strike: 'Close-range hits, launchers and lunges',
  projectile: 'Thrown and fired at whatever the crosshair is over',
  radial: 'Hits everything in a ring around the Ryder',
  control: 'Holds, slows, charms and pacifies the crowd',
  boost: 'Buffs, summons and heals for the Ryder or the squad',
  xtreme: 'The ultimate: expensive, devastating, on a long cooldown',
};

/** Hue the menus use for a type's badge, as a CSS colour. */
export const POWER_TYPE_COLOR: Record<PowerType, string> = {
  strike: '#ff7a5c',
  projectile: '#ffd23a',
  radial: '#7fe7ff',
  control: '#c48bff',
  boost: '#5bff8a',
  xtreme: '#ff4fd8',
};

const KIND_TYPE: Record<DerivedPowerKind, PowerType> = {
  breaker: 'strike',
  volley: 'projectile',
  nova: 'radial',
  snare: 'control',
  surge: 'boost',
  blitz: 'xtreme',
};

type CanonAbilityId = Exclude<AbilityId, keyof typeof DERIVED_POWERS>;

/** Canonical kits, typed by hand. Exhaustive: a new canonical power without a type fails to compile. */
const CANON_TYPE: Record<CanonAbilityId, PowerType> = {
  // Rubi
  bladeFan: 'strike',
  duplicate: 'boost',
  envyPulse: 'strike',
  // Leo
  shockwave: 'radial',
  overdrive: 'boost',
  prideDash: 'strike',
  // Aaron
  cleave: 'strike',
  blink: 'strike',
  greedSiphon: 'radial',
  // Zoe
  lift: 'control',
  forcefield: 'boost',
  heartbreak: 'radial',
  // Keven
  decoy: 'boost',
  phase: 'boost',
  dartStorm: 'projectile',
  // Lilly
  soulDrain: 'radial',
  giantStep: 'strike',
  animalAllegiance: 'boost',
  // Kid Paranormal
  phantomGrasp: 'control',
  paranormalProjection: 'boost',
  dimensionalCollapse: 'radial',
  // Agent Nyx
  temporalZap: 'control',
  rewindProtocol: 'boost',
  zeroHour: 'radial',
  // Marilyn Monroe
  showtime: 'boost',
  letsBeBad: 'control',
  abracadabra: 'projectile',
  // Martin Luther King Jr.
  dreamVision: 'control',
  proclaimPeace: 'radial',
  freeAtLast: 'boost',
  // Marywantis
  callMercy: 'boost',
  finKick: 'strike',
  wavePool: 'radial',
  // TJ
  deathStrike: 'projectile',
  mindControl: 'control',
  riot: 'radial',
};

export function powerTypeOf(id: AbilityId): PowerType {
  if (id in DERIVED_POWERS) return KIND_TYPE[DERIVED_POWERS[id as keyof typeof DERIVED_POWERS].kind];
  return CANON_TYPE[id as CanonAbilityId];
}

export function powerTypeOfKind(kind: DerivedPowerKind): PowerType {
  return KIND_TYPE[kind];
}
