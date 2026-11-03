import type { AbilitySpec, DerivedAbilityId, RyderId } from '../config';

/**
 * Tree-earned powers share three generic behaviours the engine knows how to
 * play. Each Ryder names and colours their own; the canonical Q / E / R kit
 * is never replaced by these.
 *
 * - breaker: a charged rising strike that launches everyone in front and
 *   drops a shockwave that knocks the rest of the crowd back.
 * - surge: a tempo buff. Faster strikes and heavier hits for a few seconds.
 * - blitz: the ultimate. A chain of dashes through the crowd and a massive
 *   radial finisher.
 */
export type DerivedPowerKind = 'breaker' | 'surge' | 'blitz';

export interface DerivedPowerSpec extends AbilitySpec {
  id: DerivedAbilityId;
  kind: DerivedPowerKind;
  owner: RyderId;
  /** Accent colour for the ring and particles. */
  color: number;
  /** Tuning knobs the generic behaviour reads. */
  radius: number;
  damageMul: number;
  /** Seconds a surge stays on. Unused by other kinds. */
  duration: number;
}

const COST: Record<DerivedPowerKind, number> = { breaker: 24, surge: 30, blitz: 55 };

function define(
  owner: RyderId,
  kind: DerivedPowerKind,
  id: DerivedAbilityId,
  name: string,
  description: string,
  color: number,
  tune: Partial<Pick<DerivedPowerSpec, 'radius' | 'damageMul' | 'duration'>> = {},
): DerivedPowerSpec {
  const base = kind === 'breaker' ? { radius: 4.6, damageMul: 1.6, duration: 0 } : kind === 'surge' ? { radius: 0, damageMul: 1.3, duration: 7 } : { radius: 7.5, damageMul: 3.2, duration: 0 };
  return {
    id,
    name,
    key: '4',
    description,
    auraCost: COST[kind],
    drain: 0,
    kind,
    owner,
    color,
    ...base,
    ...tune,
  };
}

export const DERIVED_POWERS: Record<DerivedAbilityId, DerivedPowerSpec> = {
  rushBreaker: define('leo', 'breaker', 'rushBreaker', 'Rush Breaker', 'Charged uppercut that launches the front line behind a yellow shockwave.', 0xffd23a),
  velocitySurge: define('leo', 'surge', 'velocitySurge', 'Velocity Surge', 'Pride at full speed: faster strikes and heavier hits for a few seconds.', 0xffd23a, { duration: 8 }),
  goldenFury: define('leo', 'blitz', 'goldenFury', 'Golden Fury', 'Speed blitz through the crowd ending in a massive golden finisher.', 0xffe066),
  bladeBreaker: define('rubi', 'breaker', 'bladeBreaker', 'Blade Breaker', 'A rising crimson cut that lifts the crowd and sends a shock ring outward.', 0xff3b5c),
  stormTempo: define('rubi', 'surge', 'stormTempo', 'Storm Tempo', 'Blades move to a faster beat: quicker chains, deeper cuts.', 0xff3b5c),
  crimsonTempest: define('rubi', 'blitz', 'crimsonTempest', 'Crimson Tempest', 'A whirlwind of blades through the street and a final cyclone slash.', 0xff6b86),
  shadowBreaker: define('aaron', 'breaker', 'shadowBreaker', 'Shadow Breaker', 'The axe comes up through the floor and shadow spills out around it.', 0x7a4dff),
  greedSurge: define('aaron', 'surge', 'greedSurge', 'Greed Surge', 'Every hit wants more. Strikes speed up and bite harder.', 0x7a4dff),
  umbralOnslaught: define('aaron', 'blitz', 'umbralOnslaught', 'Umbral Onslaught', 'Blink-strikes through the crowd, then a shadow detonation.', 0x9b7bff),
  plasmaBreaker: define('zoe', 'breaker', 'plasmaBreaker', 'Plasma Breaker', 'A plasma-wrapped uppercut and a ring of charged air.', 0x39d2ff),
  overcharge: define('zoe', 'surge', 'overcharge', 'Overcharge', 'Plasma overcharged: faster hands, heavier impacts.', 0x39d2ff),
  singularity: define('zoe', 'blitz', 'singularity', 'Singularity', 'Collapse the fight into one point and let it go.', 0x7fe7ff),
  dartBreaker: define('keven', 'breaker', 'dartBreaker', 'Dart Breaker', 'Flip-kick launcher with a spray of darts into the ring.', 0x5bff8a),
  acrobatFlow: define('keven', 'surge', 'acrobatFlow', 'Acrobat Flow', 'Momentum carries every strike: faster, sharper, lighter on the feet.', 0x5bff8a),
  thousandNeedles: define('keven', 'blitz', 'thousandNeedles', 'Thousand Needles', 'Dash through the crowd leaving darts in everyone, then detonate them.', 0x9cffb7),
  famineBreaker: define('lilly', 'breaker', 'famineBreaker', 'Famine Breaker', 'The fork comes up and the ground goes hungry around it.', 0xb8ff52),
  hungerSurge: define('lilly', 'surge', 'hungerSurge', 'Hunger Surge', 'Famine quickens: faster strikes, deeper wounds.', 0xb8ff52),
  harvestOfRuin: define('lilly', 'blitz', 'harvestOfRuin', 'Harvest of Ruin', 'Reap through the crowd and end with a ruinous harvest.', 0xd4ff8a),
  phantomBreaker: define('kid-paranormal', 'breaker', 'phantomBreaker', 'Phantom Breaker', 'A spectral uppercut with an ectoplasm shock ring.', 0x8affef),
  ectoSurge: define('kid-paranormal', 'surge', 'ectoSurge', 'Ecto Surge', 'Half out of this dimension: faster hands and heavier blows.', 0x8affef),
  dimensionalRift: define('kid-paranormal', 'blitz', 'dimensionalRift', 'Dimensional Rift', 'Phase through the mob and tear a rift under them.', 0xc0fff7),
  temporalBreaker: define('agent-nyx', 'breaker', 'temporalBreaker', 'Temporal Breaker', 'An uppercut from a second ago, and a ring of stopped time.', 0xd98bff),
  timeDilation: define('agent-nyx', 'surge', 'timeDilation', 'Time Dilation', 'The block slows around Nyx: her strikes land first and hardest.', 0xd98bff),
  zeroPoint: define('agent-nyx', 'blitz', 'zeroPoint', 'Zero Point', 'Flicker through the crowd and collapse the timeline on the street.', 0xf0c8ff),
  spotlightBreaker: define('marilyn-monroe', 'breaker', 'spotlightBreaker', 'Spotlight Breaker', 'A show-stopping uppercut under a burst of stage light.', 0xffb3d9),
  encore: define('marilyn-monroe', 'surge', 'encore', 'Encore', 'The crowd wants more. Every hit comes faster and lands harder.', 0xffb3d9),
  finalCurtain: define('marilyn-monroe', 'blitz', 'finalCurtain', 'Final Curtain', 'Sweep the stage and bring the curtain down on everyone.', 0xffd6ea),
  cadenceBreaker: define('martin-luther-king', 'breaker', 'cadenceBreaker', 'Cadence Breaker', 'A rising strike on the downbeat and a ring that carries.', 0xffc857),
  resolve: define('martin-luther-king', 'surge', 'resolve', 'Resolve', 'Unshaken: faster strikes and heavier impact.', 0xffc857),
  mountaintop: define('martin-luther-king', 'blitz', 'mountaintop', 'The Mountaintop', 'March through the crowd and bring the summit down.', 0xffe3a3),
  tideBreaker: define('marywantis', 'breaker', 'tideBreaker', 'Tide Breaker', 'A rising wave under the fist and a ring of surf.', 0x4fd8ff),
  riptideFlow: define('marywantis', 'surge', 'riptideFlow', 'Riptide Flow', 'The tide moves with her: faster, stronger strikes.', 0x4fd8ff),
  maelstrom: define('marywantis', 'blitz', 'maelstrom', 'Maelstrom', 'Tear through the crowd and pull the street into a whirlpool.', 0x9ae9ff),
  riotBreaker: define('tj', 'breaker', 'riotBreaker', 'Riot Breaker', 'A pistol-whip uppercut and a concussive ring.', 0xff8a3a),
  adrenaline: define('tj', 'surge', 'adrenaline', 'Adrenaline', 'Blood up: faster swings and harder hits.', 0xff8a3a),
  lastRound: define('tj', 'blitz', 'lastRound', 'Last Round', 'Cut through the mob and empty everything into the finisher.', 0xffb27a),
};

export const DERIVED_POWER_IDS = Object.keys(DERIVED_POWERS) as DerivedAbilityId[];

export function isDerivedAbility(id: string): id is DerivedAbilityId {
  return id in DERIVED_POWERS;
}

export function derivedPowersFor(owner: RyderId): DerivedPowerSpec[] {
  return DERIVED_POWER_IDS.map((id) => DERIVED_POWERS[id]).filter((spec) => spec.owner === owner);
}

export function derivedPowerOfKind(owner: RyderId, kind: DerivedPowerKind): DerivedPowerSpec | undefined {
  return derivedPowersFor(owner).find((spec) => spec.kind === kind);
}
