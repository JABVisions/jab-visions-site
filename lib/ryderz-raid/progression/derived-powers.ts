import type { AbilitySpec, DerivedAbilityId, RyderId } from '../config';

/**
 * Tree-earned powers share six generic behaviours the engine knows how to
 * play. Each Ryder names and colours their own; the canonical 1 / 2 / 3 kit
 * is never replaced by these. One of every kind per Ryder, in the X-Men
 * Legends mould: a melee power, a projectile, a radial, a control power, a
 * boost and the Xtreme.
 *
 * - breaker (strike): a charged rising strike that launches everyone in front
 *   and drops a shockwave that knocks the rest of the crowd back.
 * - volley (projectile): a fan of aura bolts thrown down the look direction.
 * - nova (radial): a charge, then a detonation that hits the whole ring.
 * - snare (control): the crowd nearby is held in place and left exposed.
 * - surge (boost): a tempo buff. Faster strikes and heavier hits for a few seconds.
 * - blitz (xtreme): the ultimate. A chain of dashes through the crowd and a
 *   massive radial finisher.
 */
export type DerivedPowerKind = 'breaker' | 'volley' | 'nova' | 'snare' | 'surge' | 'blitz';

export const DERIVED_KINDS: DerivedPowerKind[] = ['breaker', 'volley', 'nova', 'snare', 'surge', 'blitz'];

export interface DerivedPowerSpec extends AbilitySpec {
  id: DerivedAbilityId;
  kind: DerivedPowerKind;
  owner: RyderId;
  /** Accent colour for the ring and particles. */
  color: number;
  /** Tuning knobs the generic behaviour reads, at rank 1. */
  radius: number;
  damageMul: number;
  /** Seconds a surge stays on or a snare holds. Unused by other kinds. */
  duration: number;
  /** Bolts a volley throws. Unused by other kinds. */
  count: number;
}

const COST: Record<DerivedPowerKind, number> = { breaker: 24, volley: 20, nova: 32, snare: 28, surge: 30, blitz: 55 };

const BASE: Record<DerivedPowerKind, Pick<DerivedPowerSpec, 'radius' | 'damageMul' | 'duration' | 'count'>> = {
  breaker: { radius: 4.6, damageMul: 1.6, duration: 0, count: 0 },
  volley: { radius: 0, damageMul: 0.9, duration: 0, count: 5 },
  nova: { radius: 6.2, damageMul: 1.4, duration: 0, count: 0 },
  snare: { radius: 5.6, damageMul: 0.35, duration: 2.6, count: 0 },
  surge: { radius: 0, damageMul: 1.3, duration: 7, count: 0 },
  blitz: { radius: 7.5, damageMul: 3.2, duration: 0, count: 0 },
};

function define(
  owner: RyderId,
  kind: DerivedPowerKind,
  id: DerivedAbilityId,
  name: string,
  description: string,
  color: number,
  tune: Partial<Pick<DerivedPowerSpec, 'radius' | 'damageMul' | 'duration' | 'count'>> = {},
): DerivedPowerSpec {
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
    ...BASE[kind],
    ...tune,
  };
}

export const DERIVED_POWERS: Record<DerivedAbilityId, DerivedPowerSpec> = {
  // Leo — gold, speed, pride
  rushBreaker: define('leo', 'breaker', 'rushBreaker', 'Rush Breaker', 'Charged uppercut that launches the front line behind a yellow shockwave.', 0xffd23a),
  prideBolts: define('leo', 'volley', 'prideBolts', 'Pride Bolts', 'A fan of golden kinetic bolts thrown at full sprint.', 0xffd23a),
  sonicBoom: define('leo', 'nova', 'sonicBoom', 'Sonic Boom', 'Stamp the ground and let a golden shock ring out.', 0xffe066),
  lockstep: define('leo', 'snare', 'lockstep', 'Lockstep', 'A pulse of pride that stops the crowd mid-step.', 0xffd23a),
  velocitySurge: define('leo', 'surge', 'velocitySurge', 'Velocity Surge', 'Pride at full speed: faster strikes and heavier hits for a few seconds.', 0xffd23a, { duration: 8 }),
  goldenFury: define('leo', 'blitz', 'goldenFury', 'Golden Fury', 'Speed blitz through the crowd ending in a massive golden finisher.', 0xffe066),
  // Rubi — crimson, blades, envy
  bladeBreaker: define('rubi', 'breaker', 'bladeBreaker', 'Blade Breaker', 'A rising crimson cut that lifts the crowd and sends a shock ring outward.', 0xff3b5c),
  bladeVolley: define('rubi', 'volley', 'bladeVolley', 'Blade Volley', 'A spread of red-energy blades thrown from the hip.', 0xff3b5c),
  crimsonBurst: define('rubi', 'nova', 'crimsonBurst', 'Crimson Burst', 'Every blade at once, in every direction.', 0xff6b86),
  envySnare: define('rubi', 'snare', 'envySnare', 'Envy Snare', 'Red threads bind everyone nearby where they stand.', 0xff3b5c),
  stormTempo: define('rubi', 'surge', 'stormTempo', 'Storm Tempo', 'Blades move to a faster beat: quicker chains, deeper cuts.', 0xff3b5c),
  crimsonTempest: define('rubi', 'blitz', 'crimsonTempest', 'Crimson Tempest', 'A whirlwind of blades through the street and a final cyclone slash.', 0xff6b86),
  // Aaron — violet, axe, shadow, greed
  shadowBreaker: define('aaron', 'breaker', 'shadowBreaker', 'Shadow Breaker', 'The axe comes up through the floor and shadow spills out around it.', 0x7a4dff),
  shadowShards: define('aaron', 'volley', 'shadowShards', 'Shadow Shards', 'Shards of living shadow flung off the axe head.', 0x7a4dff),
  umbralPulse: define('aaron', 'nova', 'umbralPulse', 'Umbral Pulse', 'Shadow floods out from the axe and knocks the ring flat.', 0x9b7bff),
  covetousGrip: define('aaron', 'snare', 'covetousGrip', 'Covetous Grip', 'Hands of shadow seize everyone nearby and will not let go.', 0x7a4dff),
  greedSurge: define('aaron', 'surge', 'greedSurge', 'Greed Surge', 'Every hit wants more. Strikes speed up and bite harder.', 0x7a4dff),
  umbralOnslaught: define('aaron', 'blitz', 'umbralOnslaught', 'Umbral Onslaught', 'Blink-strikes through the crowd, then a shadow detonation.', 0x9b7bff),
  // Zoe — cyan, plasma, heartbreak
  plasmaBreaker: define('zoe', 'breaker', 'plasmaBreaker', 'Plasma Breaker', 'A plasma-wrapped uppercut and a ring of charged air.', 0x39d2ff),
  plasmaSalvo: define('zoe', 'volley', 'plasmaSalvo', 'Plasma Salvo', 'A rapid salvo of plasma bolts from both hands.', 0x39d2ff, { count: 7, damageMul: 0.8 }),
  ionNova: define('zoe', 'nova', 'ionNova', 'Ion Nova', 'A charged field builds, then detonates outward.', 0x7fe7ff),
  staticCage: define('zoe', 'snare', 'staticCage', 'Static Cage', 'Plasma rings lock the crowd in place.', 0x39d2ff),
  overcharge: define('zoe', 'surge', 'overcharge', 'Overcharge', 'Plasma overcharged: faster hands, heavier impacts.', 0x39d2ff),
  singularity: define('zoe', 'blitz', 'singularity', 'Singularity', 'Collapse the fight into one point and let it go.', 0x7fe7ff),
  // Keven — green, darts, acrobatics
  dartBreaker: define('keven', 'breaker', 'dartBreaker', 'Dart Breaker', 'Flip-kick launcher with a spray of darts into the ring.', 0x5bff8a),
  dartFan: define('keven', 'volley', 'dartFan', 'Dart Fan', 'A spread of darts from both hands.', 0x5bff8a, { count: 6 }),
  needleBurst: define('keven', 'nova', 'needleBurst', 'Needle Burst', 'Darts fly out in every direction at once.', 0x9cffb7),
  snareTrap: define('keven', 'snare', 'snareTrap', 'Snare Trap', 'Darts pin ankles to the pavement. Nobody moves.', 0x5bff8a),
  acrobatFlow: define('keven', 'surge', 'acrobatFlow', 'Acrobat Flow', 'Momentum carries every strike: faster, sharper, lighter on the feet.', 0x5bff8a),
  thousandNeedles: define('keven', 'blitz', 'thousandNeedles', 'Thousand Needles', 'Dash through the crowd leaving darts in everyone, then detonate them.', 0x9cffb7),
  // Lilly — lime, pitchfork, famine
  famineBreaker: define('lilly', 'breaker', 'famineBreaker', 'Famine Breaker', 'The fork comes up and the ground goes hungry around it.', 0xb8ff52),
  famineSpines: define('lilly', 'volley', 'famineSpines', 'Famine Spines', 'Spines of hunger fly off the fork tines.', 0xb8ff52),
  hungerWave: define('lilly', 'nova', 'hungerWave', 'Hunger Wave', 'A wave of famine withers everything in the ring.', 0xd4ff8a),
  starvingRoots: define('lilly', 'snare', 'starvingRoots', 'Starving Roots', 'Gaunt roots burst from the ground and hold the crowd fast.', 0xb8ff52),
  hungerSurge: define('lilly', 'surge', 'hungerSurge', 'Hunger Surge', 'Famine quickens: faster strikes, deeper wounds.', 0xb8ff52),
  harvestOfRuin: define('lilly', 'blitz', 'harvestOfRuin', 'Harvest of Ruin', 'Reap through the crowd and end with a ruinous harvest.', 0xd4ff8a),
  // Kid Paranormal — mint, ectoplasm, the beyond
  phantomBreaker: define('kid-paranormal', 'breaker', 'phantomBreaker', 'Phantom Breaker', 'A spectral uppercut with an ectoplasm shock ring.', 0x8affef),
  ectoBolts: define('kid-paranormal', 'volley', 'ectoBolts', 'Ecto Bolts', 'Bolts of ectoplasm thrown from the other side.', 0x8affef),
  spectralPulse: define('kid-paranormal', 'nova', 'spectralPulse', 'Spectral Pulse', 'A spectral shock rings out of the baton.', 0xc0fff7),
  poltergeistHold: define('kid-paranormal', 'snare', 'poltergeistHold', 'Poltergeist Hold', 'Unseen hands pin the crowd where it stands.', 0x8affef),
  ectoSurge: define('kid-paranormal', 'surge', 'ectoSurge', 'Ecto Surge', 'Half out of this dimension: faster hands and heavier blows.', 0x8affef),
  dimensionalRift: define('kid-paranormal', 'blitz', 'dimensionalRift', 'Dimensional Rift', 'Phase through the mob and tear a rift under them.', 0xc0fff7),
  // Agent Nyx — violet, clockwork, time
  temporalBreaker: define('agent-nyx', 'breaker', 'temporalBreaker', 'Temporal Breaker', 'An uppercut from a second ago, and a ring of stopped time.', 0xd98bff),
  chronoDarts: define('agent-nyx', 'volley', 'chronoDarts', 'Chrono Darts', 'Slivers of time thrown ahead of the moment.', 0xd98bff),
  timeBurst: define('agent-nyx', 'nova', 'timeBurst', 'Time Burst', 'A burst of stopped seconds knocks the ring back.', 0xf0c8ff),
  stasisField: define('agent-nyx', 'snare', 'stasisField', 'Stasis Field', 'Time stops for everyone near Nyx but Nyx.', 0xd98bff, { duration: 3 }),
  timeDilation: define('agent-nyx', 'surge', 'timeDilation', 'Time Dilation', 'The block slows around Nyx: her strikes land first and hardest.', 0xd98bff),
  zeroPoint: define('agent-nyx', 'blitz', 'zeroPoint', 'Zero Point', 'Flicker through the crowd and collapse the timeline on the street.', 0xf0c8ff),
  // Marilyn Monroe — pink, stage light, stardom
  spotlightBreaker: define('marilyn-monroe', 'breaker', 'spotlightBreaker', 'Spotlight Breaker', 'A show-stopping uppercut under a burst of stage light.', 0xffb3d9),
  starShower: define('marilyn-monroe', 'volley', 'starShower', 'Star Shower', 'A shower of stage stars thrown to the back row.', 0xffb3d9),
  flashbulb: define('marilyn-monroe', 'nova', 'flashbulb', 'Flashbulb', 'A blinding burst of camera light staggers the whole ring.', 0xffd6ea),
  spellbound: define('marilyn-monroe', 'snare', 'spellbound', 'Spellbound', 'The crowd cannot look away, or move.', 0xffb3d9),
  encore: define('marilyn-monroe', 'surge', 'encore', 'Encore', 'The crowd wants more. Every hit comes faster and lands harder.', 0xffb3d9),
  finalCurtain: define('marilyn-monroe', 'blitz', 'finalCurtain', 'Final Curtain', 'Sweep the stage and bring the curtain down on everyone.', 0xffd6ea),
  // Martin Luther King Jr. — gold, cadence, resolve
  cadenceBreaker: define('martin-luther-king', 'breaker', 'cadenceBreaker', 'Cadence Breaker', 'A rising strike on the downbeat and a ring that carries.', 0xffc857),
  clarionCall: define('martin-luther-king', 'volley', 'clarionCall', 'Clarion Call', 'Words that carry across the street and land like thrown stones.', 0xffc857),
  rallyCry: define('martin-luther-king', 'nova', 'rallyCry', 'Rally Cry', 'A wave of resolve pushes the crowd back.', 0xffe3a3),
  heldGround: define('martin-luther-king', 'snare', 'heldGround', 'Held Ground', 'Nobody near him moves until he says so.', 0xffc857),
  resolve: define('martin-luther-king', 'surge', 'resolve', 'Resolve', 'Unshaken: faster strikes and heavier impact.', 0xffc857),
  mountaintop: define('martin-luther-king', 'blitz', 'mountaintop', 'The Mountaintop', 'March through the crowd and bring the summit down.', 0xffe3a3),
  // Marywantis — aqua, tide, mercy
  tideBreaker: define('marywantis', 'breaker', 'tideBreaker', 'Tide Breaker', 'A rising wave under the fist and a ring of surf.', 0x4fd8ff),
  tideSpray: define('marywantis', 'volley', 'tideSpray', 'Tide Spray', 'A spray of pressurised seawater.', 0x4fd8ff, { count: 6 }),
  tidalBurst: define('marywantis', 'nova', 'tidalBurst', 'Tidal Burst', 'A wave breaks outward from her feet.', 0x9ae9ff),
  riptideHold: define('marywantis', 'snare', 'riptideHold', 'Riptide Hold', 'Currents drag the crowd to a standstill.', 0x4fd8ff),
  riptideFlow: define('marywantis', 'surge', 'riptideFlow', 'Riptide Flow', 'The tide moves with her: faster, stronger strikes.', 0x4fd8ff),
  maelstrom: define('marywantis', 'blitz', 'maelstrom', 'Maelstrom', 'Tear through the crowd and pull the street into a whirlpool.', 0x9ae9ff),
  // TJ — orange, gunmetal, riot
  riotBreaker: define('tj', 'breaker', 'riotBreaker', 'Riot Breaker', 'A pistol-whip uppercut and a concussive ring.', 0xff8a3a),
  sprayAndPray: define('tj', 'volley', 'sprayAndPray', 'Spray and Pray', 'Empty the clip into the crowd.', 0xff8a3a, { count: 8, damageMul: 0.7 }),
  flashbang: define('tj', 'nova', 'flashbang', 'Flashbang', 'A concussive burst knocks everyone back.', 0xffb27a),
  lockdown: define('tj', 'snare', 'lockdown', 'Lockdown', 'Everyone freezes under the gun.', 0xff8a3a),
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

// ---------------------------------------------------------------------------
// Ranks
// ---------------------------------------------------------------------------

/** Every power ranks 1 → MAX_RANK, X-Men Legends style. */
export const MAX_RANK = 5;

/**
 * How a power grows with rank. Multipliers at rank 1 are exactly 1, so a
 * freshly unlocked power plays as written; each rank adds the step.
 */
export interface RankScaling {
  /** Damage multiplier. */
  damage: number;
  /** Aura cost multiplier (falls with rank). */
  cost: number;
  /** Radius multiplier for radial / breaker / snare powers. */
  radius: number;
  /** Duration multiplier for surges and snares. */
  duration: number;
  /** Extra bolts a volley throws. */
  count: number;
}

export function rankScaling(rank: number): RankScaling {
  const r = Math.max(1, Math.min(MAX_RANK, Math.floor(rank))) - 1;
  return {
    damage: 1 + r * 0.18,
    cost: 1 - r * 0.06,
    radius: 1 + r * 0.08,
    duration: 1 + r * 0.15,
    count: Math.floor(r / 2),
  };
}

/** A derived power's tuning at a rank: what the engine plays and the menu prints. */
export function derivedAtRank(spec: DerivedPowerSpec, rank: number) {
  const s = rankScaling(rank);
  return {
    auraCost: Math.round(spec.auraCost * s.cost),
    damageMul: spec.damageMul * s.damage,
    radius: spec.radius * s.radius,
    duration: spec.duration * s.duration,
    count: spec.count + (spec.count > 0 ? s.count : 0),
  };
}
