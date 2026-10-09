import type { GlbRepair } from './mesh-repair';
import type { BoneKey, MeleeStyle } from './skeletal';

export type RyderId = 'rubi' | 'leo' | 'aaron' | 'zoe' | 'keven' | 'lilly';

export type AbilityId =
  | 'bladeFan'
  | 'duplicate'
  | 'envyPulse'
  | 'shockwave'
  | 'overdrive'
  | 'prideDash'
  | 'cleave'
  | 'blink'
  | 'greedSiphon'
  | 'lift'
  | 'forcefield'
  | 'heartbreak'
  | 'decoy'
  | 'phase'
  | 'dartStorm'
  | 'soulDrain'
  | 'giantStep'
  | 'animalAllegiance';

export type MoveKey = 'Q' | 'E' | 'R';

export const MOVE_KEYS: MoveKey[] = ['Q', 'E', 'R'];

/** Keys (lower-case `KeyboardEvent.key`) that use the interactable the player is standing at. */
export const INTERACT_KEYS = ['enter', 'x'];
export const INTERACT_LABEL = 'Enter / X';

export interface AbilitySpec {
  id: AbilityId;
  name: string;
  key: MoveKey;
  description: string;
  /** Burst cost for instant moves. Sustained moves use 0 and drain instead. */
  auraCost: number;
  /** Aura burned per second while the move is on. 0 means instant. */
  drain: number;
}

/**
 * Everything the power VFX needs to dress a Ryder: aura and electricity colours
 * plus how bright the aura runs when powered versus burnt out. Read by
 * `RyderPowerVFX` from whichever Ryder is active, so switching just re-reads it.
 */
export interface RyderVisualProfile {
  primaryColor: number;
  auraColor: number;
  electricityColor: number;
  /** Aura glow multiplier when power is gone (0 switches the aura off). */
  depletedAuraIntensity: number;
  /** Aura glow multiplier at full power. */
  poweredAuraIntensity: number;
}

export interface RyderSpec {
  id: RyderId;
  name: string;
  title: string;
  flaw: string;
  role: string;
  color: number;
  colorHex: string;
  accent: number;
  visual: RyderVisualProfile;
  weapon: string;
  /** Cast headshot. */
  portrait: string;
  /** Transparent render of the in-game figure's head, used on roster and select cards. */
  icon: string;
  maxHp: number;
  speed: number;
  /** Aura shots per second while holding fire. */
  fireRate: number;
  damage: number;
  projectileSpeed: number;
  projectileCount: number;
  spread: number;
  /** Aura drained per shot. */
  shotCost: number;
  maxAura: number;
  /** Aura regenerated per second while powers are idle. */
  auraRegen: number;
  meleeDamage: number;
  meleeRate: number;
  moves: [AbilitySpec, AbilitySpec, AbilitySpec];
  /** Optional Tripo (or other) glTF binary used as the in-game figure. */
  glb?: string;
  /** Load-time geometry fixes for known defects in that export. */
  glbRepair?: GlbRepair;
  /** Melee animations cycled per swing when the figure is driven by the procedural skeleton. */
  strikes?: MeleeStyle[];
  /**
   * Procedural-skeleton bones left in the GLB's export pose. Use when a
   * bind-pose correction (hanging a raised arm, unfolding an elbow) would
   * corkscrew geodesic skinning. Animation still layers on top of the bind.
   */
  skelKeep?: BoneKey[];
}

export const ARENA_HALF = 30;
/** Asphalt past the building line. Matches the ground pad in the city block. */
export const GROUND_MARGIN = 18;
/** Edge-to-edge width of one city block. The live map tiles four of these. */
export const DISTRICT_SPAN = (ARENA_HALF + GROUND_MARGIN) * 2;
/** Centre of the southwest block, which keeps the original drop-in. */
export const HOME_DISTRICT = -DISTRICT_SPAN / 2;
export interface CarModel {
  url: string;
  /** Length in metres; the model is rescaled to this. */
  length: number;
  /** Resulting width in metres (for collision footprints before the model loads). */
  width: number;
}
/**
 * glTF binaries used for parked cars. Slots pick from this list; when it is
 * empty the arena falls back to procedural toon cars. Any scale/orientation is
 * accepted: models are normalised to `length` metres along +X (nose forward),
 * centred, wheels on the ground. The Tripo cars are stockier than real ones, so
 * lengths are chosen to land the width around 2.2 m (the parking lane is 2.4 m).
 */
export const CAR_MODELS: CarModel[] = [
  { url: '/assets/those-ryderz/models/car-hatch.glb', length: 3.9, width: 2.17 },
  { url: '/assets/those-ryderz/models/car-pickup.glb', length: 4.9, width: 2.19 },
];

export interface ArenaBuildingModel {
  url: string;
  /**
   * Unscaled size of the export. Width runs along local +X, depth along local +Z
   * (the street facade, stoop included), and the base sits on y = 0.
   */
  width: number;
  height: number;
  depth: number;
}

/**
 * Textured street buildings that ring the arena. Slots alternate between them.
 * The Tripo exports are about a metre tall; each slot scales one uniformly so
 * the facade fills that lot.
 */
/**
 * Courtyard building at the west end of the north block. The export is about
 * a metre wide; the arena scales it up past the copies that stood on the
 * sidewalk. Width is local +X, depth is local +Z (the entrance facade), and
 * the base sits on y = 0.
 */
export const ARENA_BLOCK: ArenaBuildingModel = {
  url: '/assets/those-ryderz/models/arena-block.glb',
  width: 1,
  height: 0.4830169379711151,
  depth: 0.76153564453125,
};

export const ARENA_BUILDINGS: ArenaBuildingModel[] = [
  {
    url: '/assets/those-ryderz/models/arena-storefront.glb',
    width: 0.6723438501358032,
    height: 0.9972038269042969,
    depth: 0.5424783825874329,
  },
  {
    url: '/assets/those-ryderz/models/arena-townhouse.glb',
    width: 0.5290689468383789,
    height: 1.0002299547195435,
    depth: 0.4037730395793915,
  },
];

/**
 * Street tree used wherever the arena used a green sphere for vegetation.
 * The Tripo export is about a metre tall and its base sits on y = 0.
 * `height` is the world height in metres at placement scale 1.
 */
export const ARENA_TREE = {
  url: '/assets/those-ryderz/models/arena-tree.glb',
  sourceHeight: 0.992584228515625,
  height: 5.2,
};

export const MAX_ALIVE_HOSTS = 26;
/**
 * Rigged glTF binaries for the host mob. Each spawn picks one at random; when
 * the list is empty (or nothing loads) hosts fall back to block figures.
 * Locomotion is procedural, fight clips in the file become melee strikes.
 */
export const HOST_MODELS: string[] = ['/assets/those-ryderz/models/host-male.glb'];
export const BURNOUT_RECOVERY = 0.35;
export const KILL_AURA_SIPHON = 7;
export const MELEE_RANGE = 2.55;
export const MELEE_ARC = 0.9;
export const INTERMISSION = 18;
export const PLAYER_RADIUS = 0.45;
/** Playable limit of the 2×2 city. The ground runs to ±DISTRICT_SPAN. */
export const BOUNDARY = DISTRICT_SPAN - 2;

export const RYDERZ: Record<RyderId, RyderSpec> = {
  rubi: {
    id: 'rubi',
    name: 'Rubi Wong',
    title: 'The Red Ryder',
    flaw: 'Envy',
    role: 'Duelist',
    color: 0xff2e44,
    colorHex: '#ff5c66',
    accent: 0xffb3b8,
    visual: { primaryColor: 0xff2e44, auraColor: 0xff3d55, electricityColor: 0xff6a7a, depletedAuraIntensity: 0.18, poweredAuraIntensity: 1.8 },
    weapon: 'Red energy blade',
    portrait: '/assets/chaeyeon-kim-headshot.jpeg',
    icon: '/assets/those-ryderz/icons/rubi.webp?v=3',
    // Version query busts browser caches of the earlier (unrigged) export at this path.
    glb: '/assets/those-ryderz/models/rubi-wong.glb?v=3',
    strikes: ['slash', 'chop', 'slash', 'smash'],
    maxHp: 110,
    speed: 7.4,
    fireRate: 4.4,
    damage: 15,
    projectileSpeed: 34,
    projectileCount: 1,
    spread: 0,
    shotCost: 2.1,
    maxAura: 100,
    auraRegen: 6,
    meleeDamage: 26,
    meleeRate: 2.2,
    moves: [
      {
        id: 'bladeFan',
        name: 'Blade Storm',
        key: 'Q',
        description:
          'Close on a host and carve them with a rapid four-hit red-energy sword combo. The last cut knocks them back.',
        auraCost: 9,
        drain: 0,
      },
      {
        id: 'duplicate',
        name: 'Duplication',
        key: 'E',
        description:
          'Send echo-selves hunting on their own. They sprint, slash, and dissolve; waves keep coming while aura drains. Press again to dismiss them.',
        auraCost: 0,
        drain: 8,
      },
      {
        id: 'envyPulse',
        name: 'Double Trouble',
        key: 'R',
        description:
          'A clone appears behind the nearest host as you lunge from the front. Both blades cut at once.',
        auraCost: 14,
        drain: 0,
      },
    ],
  },
  leo: {
    id: 'leo',
    name: 'Leo Montana',
    title: 'The Yellow Ryder',
    flaw: 'Pride',
    role: 'Striker',
    color: 0xffd400,
    colorHex: '#ffe85c',
    accent: 0xfff7b0,
    visual: { primaryColor: 0xffd400, auraColor: 0xffc81e, electricityColor: 0xffe766, depletedAuraIntensity: 0.18, poweredAuraIntensity: 1.8 },
    weapon: 'Spiked knuckle bolts',
    portrait: '/assets/haylee-brown-headshot.jpeg',
    icon: '/assets/those-ryderz/icons/leo.webp',
    glb: '/assets/those-ryderz/models/leo-montana.glb',
    strikes: ['punch', 'punchR', 'spinKick', 'smash'],
    maxHp: 95,
    speed: 8.6,
    fireRate: 6.2,
    damage: 9,
    projectileSpeed: 40,
    projectileCount: 1,
    spread: 0.035,
    shotCost: 1.6,
    maxAura: 90,
    auraRegen: 6.5,
    meleeDamage: 32,
    meleeRate: 3,
    moves: [
      {
        id: 'shockwave',
        name: 'Kinetic Crack',
        key: 'Q',
        description:
          'Launch skyward, hang, then dive fist-first at the crosshair. The landing cracks the ground and launches everything nearby.',
        auraCost: 12,
        drain: 0,
      },
      {
        id: 'overdrive',
        name: 'Overdrive',
        key: 'E',
        description:
          'Become a yellow streak and zigzag through every host in reach, striking each one in passing. The marks detonate when she stops.',
        auraCost: 18,
        drain: 0,
      },
      {
        id: 'prideDash',
        name: 'Pride Rush',
        key: 'R',
        description:
          'Accelerate shoulder-first through the line, steering with the camera. Everything hit is thrown aside; the last one eats a spiked knuckle.',
        auraCost: 10,
        drain: 0,
      },
    ],
  },
  aaron: {
    id: 'aaron',
    name: 'Aaron Addams',
    title: 'The Black Ryder',
    flaw: 'Greed',
    role: 'Vanguard',
    color: 0x7b4dff,
    colorHex: '#c9b8ff',
    accent: 0xc9b8ff,
    visual: { primaryColor: 0x7b4dff, auraColor: 0x4a1aa8, electricityColor: 0x8a3dff, depletedAuraIntensity: 0.15, poweredAuraIntensity: 1.9 },
    weapon: 'Black aura axe',
    portrait: '/assets/hadi-taloustan-headshot.jpg',
    icon: '/assets/those-ryderz/icons/aaron.webp',
    // Version query busts browser caches of the earlier (unrigged) exports at this path.
    glb: '/assets/those-ryderz/models/aaron-addams.glb?v=4',
    strikes: ['chop', 'slash', 'smash'],
    maxHp: 125,
    speed: 6.9,
    fireRate: 2.2,
    damage: 34,
    projectileSpeed: 30,
    projectileCount: 1,
    spread: 0,
    shotCost: 3.2,
    maxAura: 100,
    auraRegen: 5.5,
    meleeDamage: 40,
    meleeRate: 1.8,
    moves: [
      {
        id: 'cleave',
        name: 'Boomerang Cleave',
        key: 'Q',
        description:
          'Charge the axe and hurl it. It spins out in a wide loop around the block, launching every host it crosses, and curves back to his hand.',
        auraCost: 14,
        drain: 0,
      },
      {
        id: 'blink',
        name: 'Shadow Strike',
        key: 'E',
        description:
          'Dissolve into shadow, reappear behind the nearest host and take its head with one flat cut. With nobody near, a short step through the dark toward your aim.',
        auraCost: 12,
        drain: 0,
      },
      {
        id: 'greedSiphon',
        name: 'Greed Swing',
        key: 'R',
        description:
          'Hold the axe out flat and spin while you steer. The spin builds speed, every host it meets is thrown, each hit feeds aura back. Press again to finish with one last cleave.',
        auraCost: 0,
        drain: 9,
      },
    ],
  },
  zoe: {
    id: 'zoe',
    name: 'Zoe Folie',
    title: 'The Blue Ryder',
    flaw: 'Lust',
    role: 'Strategist',
    color: 0x24b4ff,
    colorHex: '#66cfff',
    accent: 0xb8e8ff,
    visual: { primaryColor: 0x24b4ff, auraColor: 0x2aa9ff, electricityColor: 0x7ad6ff, depletedAuraIntensity: 0.18, poweredAuraIntensity: 1.8 },
    weapon: 'Blue energy projection',
    portrait: '/assets/aria-patterson-headshot.jpg',
    icon: '/assets/those-ryderz/icons/zoe.webp',
    glb: '/assets/those-ryderz/models/zoe-folie.glb?v=2',
    strikes: ['slap', 'kick', 'blast'],
    // Export bind is a pointing left fist and a hanging right arm. Unfolding
    // those joints ~114° around a rib-placed elbow corkscrews the gloves.
    skelKeep: ['shoulderL', 'shoulderR', 'upperArmL', 'upperArmR', 'lowerArmL', 'lowerArmR', 'handL', 'handR'],
    maxHp: 105,
    speed: 7.2,
    fireRate: 3.4,
    damage: 11,
    projectileSpeed: 32,
    projectileCount: 3,
    spread: 0.14,
    shotCost: 2.3,
    maxAura: 110,
    auraRegen: 6,
    meleeDamage: 22,
    meleeRate: 2.2,
    moves: [
      {
        id: 'lift',
        name: 'Levitate',
        key: 'Q',
        description:
          'Rise into a plasma force field and steer it through hosts. Contact burns and shoves them aside while aura drains.',
        auraCost: 0,
        drain: 7,
      },
      {
        id: 'forcefield',
        name: 'Force Field',
        key: 'E',
        description:
          'Thrust a concentrated plasma disc along the crosshair. It expands as it flies, damaging and knocking back everything it hits.',
        auraCost: 11,
        drain: 0,
      },
      {
        id: 'heartbreak',
        name: 'Heartbreak Blitz',
        key: 'R',
        description:
          'Launch into a force-field sphere, strafe over nearby hosts, and rain plasma bombs before a finishing burst.',
        auraCost: 16,
        drain: 0,
      },
    ],
  },
  keven: {
    id: 'keven',
    name: 'Keven Hart',
    title: 'The Pink Ryder',
    flaw: 'Sloth',
    role: 'Phantom',
    color: 0xff3fcf,
    colorHex: '#ff68d7',
    accent: 0xffc2ee,
    visual: { primaryColor: 0xff3fcf, auraColor: 0xff4ad2, electricityColor: 0xff8ae6, depletedAuraIntensity: 0.18, poweredAuraIntensity: 1.8 },
    weapon: 'Pink arrows',
    portrait: '/assets/john_andy_headshot.jpg',
    icon: '/assets/those-ryderz/icons/keven.webp?v=5',
    glb: '/assets/those-ryderz/models/keven-hart.glb?v=3',
    // The bind pose is already a stance. Leave it; the painted skin matches these joints.
    skelKeep: [
      'hips',
      'spine',
      'chest',
      'upperChest',
      'neck',
      'head',
      'shoulderL',
      'shoulderR',
      'upperArmL',
      'upperArmR',
      'lowerArmL',
      'lowerArmR',
      'handL',
      'handR',
      'upperLegL',
      'upperLegR',
      'lowerLegL',
      'lowerLegR',
      'footL',
      'footR',
    ],
    // Dart hand is the left: jab with it, kick, then a backhand with the free hand.
    strikes: ['punch', 'kick', 'slap'],
    maxHp: 100,
    speed: 7.6,
    fireRate: 5,
    damage: 10,
    projectileSpeed: 38,
    projectileCount: 2,
    spread: 0.07,
    shotCost: 1.8,
    maxAura: 95,
    auraRegen: 6,
    meleeDamage: 24,
    meleeRate: 2.6,
    moves: [
      {
        id: 'decoy',
        name: 'Afterimage',
        key: 'Q',
        description:
          'Phase into the floor, hunt the nearest host from below, erupt under its feet, drag it under and hurl it back out.',
        auraCost: 16,
        drain: 0,
      },
      {
        id: 'phase',
        name: 'Phantom Phase',
        key: 'E',
        description:
          'Go translucent and intangible while aura holds. Hosts lose you, and every host you walk through takes phase damage. Press again to solidify.',
        auraCost: 0,
        drain: 8,
      },
      {
        id: 'dartStorm',
        name: 'Dart Storm',
        key: 'R',
        description: 'Backflip and loose a barrage of homing pink darts from the top of the arc. Land clean.',
        auraCost: 14,
        drain: 0,
      },
    ],
  },
  lilly: {
    id: 'lilly',
    name: 'Lilly James',
    title: 'Famine',
    flaw: 'Famine',
    role: 'Controller',
    color: 0x1fbf5a,
    colorHex: '#3dff7a',
    accent: 0xb8ffc8,
    visual: { primaryColor: 0x1fbf5a, auraColor: 0x39f07a, electricityColor: 0x9dffc0, depletedAuraIntensity: 0.16, poweredAuraIntensity: 1.7 },
    weapon: 'Emerald plasma',
    portrait: '/assets/those-ryderz/icons/lilly.webp',
    icon: '/assets/those-ryderz/icons/lilly.webp',
    glb: '/assets/those-ryderz/models/lilly-james.glb?v=1',
    strikes: ['slap', 'kick', 'smash'],
    maxHp: 115,
    speed: 6.8,
    fireRate: 3.6,
    damage: 12,
    projectileSpeed: 28,
    projectileCount: 1,
    spread: 0.04,
    shotCost: 2.4,
    maxAura: 110,
    auraRegen: 5.5,
    meleeDamage: 22,
    meleeRate: 2,
    moves: [
      {
        id: 'soulDrain',
        name: 'Soul Drain',
        key: 'Q',
        description:
          'Raise both hands and boil an emerald puddle around you. Hosts inside take damage over time, and a share of that damage returns as health. Press again to close it.',
        auraCost: 0,
        drain: 8,
      },
      {
        id: 'giantStep',
        name: 'Giant Step',
        key: 'E',
        description:
          'Grow to four times your height. Heavy footsteps crush hosts under the foot and shock the ground around each stomp, then you shrink back.',
        auraCost: 22,
        drain: 0,
      },
      {
        id: 'animalAllegiance',
        name: 'Animal Allegiance',
        key: 'R',
        description:
          'Open a summoning circle. A registered animal answers and hunts your enemies. With none registered, the rite still completes.',
        auraCost: 16,
        drain: 0,
      },
    ],
  },
};

export const RYDER_ORDER: RyderId[] = ['rubi', 'leo', 'aaron', 'zoe', 'keven', 'lilly'];

export type EnemyKind = 'walker' | 'sprinter' | 'heavy' | 'thrower' | 'broadcaster';

export interface EnemySpec {
  kind: EnemyKind;
  name: string;
  hp: number;
  speed: number;
  damage: number;
  radius: number;
  points: number;
  scale: number;
  mass: number;
  preferredRange: number;
}

export const ENEMIES: Record<EnemyKind, EnemySpec> = {
  walker: {
    kind: 'walker',
    name: 'Signal-bound civilian',
    hp: 36,
    speed: 3.6,
    damage: 10,
    radius: 0.55,
    points: 100,
    scale: 1,
    mass: 1,
    preferredRange: 0,
  },
  sprinter: {
    kind: 'sprinter',
    name: 'Signal-bound sprinter',
    hp: 26,
    speed: 6.6,
    damage: 8,
    radius: 0.5,
    points: 140,
    scale: 0.92,
    mass: 0.7,
    preferredRange: 0,
  },
  heavy: {
    kind: 'heavy',
    name: 'Signal-bound enforcer',
    hp: 150,
    speed: 2.6,
    damage: 24,
    radius: 0.9,
    points: 320,
    scale: 1.45,
    mass: 3,
    preferredRange: 0,
  },
  thrower: {
    kind: 'thrower',
    name: 'Signal-bound thrower',
    hp: 44,
    speed: 3.4,
    damage: 12,
    radius: 0.55,
    points: 220,
    scale: 1,
    mass: 1,
    preferredRange: 11,
  },
  broadcaster: {
    kind: 'broadcaster',
    name: 'The Broadcaster',
    hp: 1100,
    speed: 3,
    damage: 32,
    radius: 1.35,
    points: 3000,
    scale: 2.1,
    mass: 8,
    preferredRange: 0,
  },
};

export function composeRound(round: number): EnemyKind[] {
  const list: EnemyKind[] = [];
  const push = (kind: EnemyKind, count: number) => {
    for (let i = 0; i < count; i += 1) list.push(kind);
  };

  const base = Math.min(6 + round * 3, 42);
  push('walker', Math.max(4, Math.round(base * (round < 3 ? 0.9 : 0.52))));
  if (round >= 2) push('sprinter', Math.round(base * 0.26));
  if (round >= 3) push('thrower', Math.round(base * 0.14));
  if (round >= 4) push('heavy', Math.max(1, Math.round(base * 0.1)));

  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }

  if (round % 5 === 0) push('broadcaster', Math.max(1, Math.floor(round / 10) + 1));
  return list;
}

export function roundScaling(round: number) {
  return {
    hp: 1 + (round - 1) * 0.14,
    speed: 1 + Math.min((round - 1) * 0.025, 0.4),
    damage: 1 + (round - 1) * 0.06,
    spawnInterval: Math.max(0.28, 0.9 - round * 0.045),
  };
}

export function roundBanner(round: number) {
  if (round % 5 === 0) return { title: `ROUND ${round}`, sub: 'THE BROADCASTER IS HERE' };
  if (round === 1) return { title: 'ROUND 1', sub: 'THE SIGNAL TAKES THE BLOCK' };
  return { title: `ROUND ${round}`, sub: 'MORE HOSTS ARE TUNING IN' };
}

export type UpgradeId = 'capacity' | 'signal' | 'fists' | 'vitality' | 'siphon';

export interface UpgradeSpec {
  id: UpgradeId;
  name: string;
  description: string;
  baseCost: number;
  maxLevel: number;
}

export const UPGRADES: Record<UpgradeId, UpgradeSpec> = {
  capacity: {
    id: 'capacity',
    name: 'Aura Capacity',
    description: '+20 max aura and faster recovery per level.',
    baseCost: 1500,
    maxLevel: 5,
  },
  signal: {
    id: 'signal',
    name: 'Signal Strength',
    description: '+15% aura-shot damage per level.',
    baseCost: 2000,
    maxLevel: 5,
  },
  fists: {
    id: 'fists',
    name: 'Iron Fists',
    description: '+25% melee damage per level. Fists stay dangerous during burnout at level 3.',
    baseCost: 1200,
    maxLevel: 4,
  },
  vitality: {
    id: 'vitality',
    name: 'Vitality',
    description: '+25 max health per level and a full heal.',
    baseCost: 1800,
    maxLevel: 4,
  },
  siphon: {
    id: 'siphon',
    name: 'Signal Siphon',
    description: 'Each break restores +4 more aura per level.',
    baseCost: 1600,
    maxLevel: 3,
  },
};

export const UPGRADE_ORDER: UpgradeId[] = ['capacity', 'signal', 'fists', 'vitality', 'siphon'];

export function upgradeCost(id: UpgradeId, level: number) {
  return Math.round(UPGRADES[id].baseCost * (1 + level * 0.65));
}
