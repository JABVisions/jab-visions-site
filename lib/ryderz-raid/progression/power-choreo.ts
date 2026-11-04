import type { RyderId } from '../config';
import type { AbilityPose, MeleeStyle } from '../skeletal';
import type { DerivedPowerKind } from './derived-powers';

/**
 * Animation for the tree-earned powers. Every kind has a choreography: a
 * timeline of body stances, weapon swings and game events (the hit, the
 * shock ring, the bolts leaving the hand). The engine plays the timeline
 * through the same pose pipeline the Ryder kits use, so a breaker crouches,
 * rises with the Ryder's own heavy swing and settles into a finish stance
 * while its damage lands on the swing, not on the key press.
 *
 * Stances and swings that read `weapon`, `heavy`, `cast` or `throw` resolve
 * per Ryder through `RYDER_STYLE`, which is how Rubi's breaker is a rising
 * slash while Aaron's is an axe smash and Lilly's a pitchfork slam.
 */

export interface RyderStyle {
  /** The Ryder's signature swing. */
  weapon: MeleeStyle;
  /** The committed, heavy swing a breaker and a nova land on. */
  heavy: MeleeStyle;
  /** How the Ryder casts a boost or a snare. */
  cast: AbilityPose;
  /** How the Ryder throws a volley. */
  throw: AbilityPose;
}

export const RYDER_STYLE: Record<RyderId, RyderStyle> = {
  rubi: { weapon: 'slash', heavy: 'slash', cast: 'cast', throw: 'throw' },
  leo: { weapon: 'punchR', heavy: 'kick', cast: 'cast', throw: 'throw' },
  aaron: { weapon: 'chop', heavy: 'smash', cast: 'summon', throw: 'heave' },
  zoe: { weapon: 'blast', heavy: 'blast', cast: 'cast', throw: 'cast' },
  keven: { weapon: 'spinKick', heavy: 'kick', cast: 'cast', throw: 'throw' },
  lilly: { weapon: 'forkThrust', heavy: 'forkSlam', cast: 'summon', throw: 'heave' },
  'kid-paranormal': { weapon: 'chop', heavy: 'smash', cast: 'channel', throw: 'throw' },
  'agent-nyx': { weapon: 'slap', heavy: 'punch', cast: 'cast', throw: 'throw' },
  'marilyn-monroe': { weapon: 'slap', heavy: 'spinKick', cast: 'cast', throw: 'throw' },
  'martin-luther-king': { weapon: 'punch', heavy: 'smash', cast: 'summon', throw: 'cast' },
  marywantis: { weapon: 'slap', heavy: 'spinKick', cast: 'cast', throw: 'heave' },
  tj: { weapon: 'punchR', heavy: 'smash', cast: 'cast', throw: 'cast' },
};

/**
 * Game events a beat fires. The engine resolves them against the power that
 * is playing: `hit` applies the kind's damage or hold, `shot` throws one bolt
 * of a volley, the rest are dressing.
 */
export type ChoreoEvent = 'hit' | 'shot' | 'ring' | 'cracks' | 'burst' | 'afterimage' | 'charge' | 'hitstop' | 'banner' | 'iframes';

export interface ChoreoBeat {
  /** Seconds after the power starts. */
  at: number;
  /** Stance held from this beat until the next beat that names one. `cast` / `throw` resolve per Ryder. */
  pose?: AbilityPose | 'cast' | 'throw';
  /** Blend weight of the stance against locomotion. Defaults to 1. */
  weight?: number;
  /** Extra chest yaw / roll, radians. */
  lean?: number;
  bank?: number;
  /** A swing to fire on this beat. `weapon` / `heavy` resolve per Ryder. */
  strike?: MeleeStyle | 'weapon' | 'heavy';
  events?: ChoreoEvent[];
  /** Camera kick and shake on the beat. */
  kick?: number;
  shake?: number;
  sound?: string;
}

export interface PowerChoreo {
  /** Seconds the sequence runs; the stance fades out at the end. */
  duration: number;
  /** Seconds the body is committed: no walking, swinging, dodging or jumping. */
  lock: number;
  beats: ChoreoBeat[];
}

/** Seconds between bolts of a volley. */
export const VOLLEY_SPACING = 0.07;
const VOLLEY_FIRST = 0.12;

/** A volley's timeline grows with the number of bolts it throws, so it is built per cast. */
function volley(count: number): PowerChoreo {
  const shots: ChoreoBeat[] = [];
  for (let i = 0; i < count; i += 1) {
    shots.push({ at: VOLLEY_FIRST + i * VOLLEY_SPACING, events: ['shot'], kick: 0.06, lean: (i % 2 === 0 ? 1 : -1) * 0.12 });
  }
  const last = VOLLEY_FIRST + Math.max(0, count - 1) * VOLLEY_SPACING;
  return {
    duration: last + 0.42,
    lock: Math.min(last + 0.1, 0.5),
    beats: [{ at: 0, pose: 'throw', weight: 1, kick: 0.1, events: ['charge'] }, ...shots, { at: last + 0.12, pose: 'finish', weight: 0.7 }],
  };
}

const BREAKER: PowerChoreo = {
  duration: 0.95,
  lock: 0.62,
  beats: [
    { at: 0, pose: 'crouch', weight: 1, kick: 0.15, events: ['charge', 'afterimage'] },
    { at: 0.18, pose: 'launch', strike: 'heavy', events: ['hit', 'ring', 'cracks', 'burst', 'hitstop'], shake: 0.26, kick: 0.4, sound: 'fight.kick.impact' },
    { at: 0.55, pose: 'finish', weight: 0.85 },
  ],
};

const NOVA: PowerChoreo = {
  duration: 1.15,
  lock: 0.85,
  beats: [
    { at: 0, pose: 'channel', weight: 1, kick: 0.1, events: ['charge', 'iframes'] },
    { at: 0.22, pose: 'channel', events: ['charge'] },
    { at: 0.46, pose: 'slam', strike: 'heavy', events: ['hit', 'ring', 'cracks', 'burst', 'hitstop'], shake: 0.42, kick: 0.45, sound: 'fight.kick.impact' },
    { at: 0.82, pose: 'finish', weight: 0.8 },
  ],
};

const SNARE: PowerChoreo = {
  duration: 1.0,
  lock: 0.58,
  beats: [
    { at: 0, pose: 'summon', weight: 1, kick: 0.12, events: ['charge', 'ring'] },
    { at: 0.28, pose: 'cast', events: ['hit', 'burst', 'cracks'], shake: 0.12, sound: 'fight.punch.impact' },
    { at: 0.64, pose: 'finish', weight: 0.55 },
  ],
};

const SURGE: PowerChoreo = {
  duration: 0.62,
  lock: 0.3,
  beats: [
    { at: 0, pose: 'cast', weight: 1, kick: 0.2, events: ['hit', 'burst', 'ring', 'banner'] },
    { at: 0.34, pose: 'finish', weight: 0.5 },
  ],
};

/** The blitz dashes are driven by the crowd; this is the finisher once the chain is done. */
export const BLITZ_FINISH: PowerChoreo = {
  duration: 0.95,
  lock: 0.7,
  beats: [
    { at: 0, pose: 'slam', weight: 1, strike: 'heavy', events: ['hit', 'ring', 'cracks', 'burst', 'hitstop'], shake: 0.5, kick: 0.5, sound: 'fight.kick.impact' },
    { at: 0.42, pose: 'finish', weight: 0.9 },
  ],
};

/** Stance held between blitz dashes. */
export const BLITZ_DASH_POSE: AbilityPose = 'streak';

/** The breaker's opening timeline is also what a blitz plays on its first dash. */
export function choreoFor(kind: DerivedPowerKind, count = 0): PowerChoreo {
  switch (kind) {
    case 'breaker':
      return BREAKER;
    case 'volley':
      return volley(Math.max(1, count));
    case 'nova':
      return NOVA;
    case 'snare':
      return SNARE;
    case 'surge':
      return SURGE;
    case 'blitz':
      return BLITZ_FINISH;
  }
}

export function resolvePose(pose: ChoreoBeat['pose'], style: RyderStyle): AbilityPose | undefined {
  if (pose === 'cast') return style.cast;
  if (pose === 'throw') return style.throw;
  return pose;
}

export function resolveStrike(strike: ChoreoBeat['strike'], style: RyderStyle): MeleeStyle | undefined {
  if (strike === 'weapon') return style.weapon;
  if (strike === 'heavy') return style.heavy;
  return strike;
}

/** Structural checks for the check script: beats ordered, within the duration, every kind covered. */
export function validateChoreo(choreo: PowerChoreo): string[] {
  const problems: string[] = [];
  let last = -1;
  for (const beat of choreo.beats) {
    if (beat.at < last) problems.push(`beat at ${beat.at} is out of order`);
    if (beat.at > choreo.duration) problems.push(`beat at ${beat.at} is after the end (${choreo.duration})`);
    last = beat.at;
  }
  if (choreo.lock > choreo.duration) problems.push(`lock ${choreo.lock} outlasts the sequence ${choreo.duration}`);
  if (!choreo.beats.some((beat) => beat.pose)) problems.push('no stance in the sequence');
  return problems;
}
