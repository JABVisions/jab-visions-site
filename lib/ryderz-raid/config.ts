export type RyderId = 'rubi' | 'leo' | 'aaron' | 'zoe' | 'keven';

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
  | 'dartStorm';

export type MoveKey = 'Q' | 'E' | 'R';

export const MOVE_KEYS: MoveKey[] = ['Q', 'E', 'R'];

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

export interface RyderSpec {
  id: RyderId;
  name: string;
  title: string;
  flaw: string;
  role: string;
  color: number;
  colorHex: string;
  accent: number;
  weapon: string;
  portrait: string;
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
}

export const ARENA_HALF = 30;
export const MAX_ALIVE_HOSTS = 26;
export const BURNOUT_RECOVERY = 0.35;
export const KILL_AURA_SIPHON = 7;
export const MELEE_RANGE = 2.55;
export const MELEE_ARC = 0.9;
export const INTERMISSION = 18;
export const PLAYER_RADIUS = 0.45;
export const BOUNDARY = ARENA_HALF + 3.2;

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
    weapon: 'Red light blades',
    portrait: '/assets/chaeyeon-kim-headshot.jpeg',
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
        name: 'Light Blades',
        key: 'Q',
        description: 'Fan red light blades into a cone. Use it as long as aura remains.',
        auraCost: 8,
        drain: 0,
      },
      {
        id: 'duplicate',
        name: 'Duplication',
        key: 'E',
        description:
          'Keep two echo-selves fighting beside you. Aura drains while they are out. Press again to drop them.',
        auraCost: 0,
        drain: 8,
      },
      {
        id: 'envyPulse',
        name: 'Envy Pulse',
        key: 'R',
        description: 'An empathic burst that wounds nearby hosts and yanks them toward you.',
        auraCost: 11,
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
    weapon: 'Spiked knuckle bolts',
    portrait: '/assets/haylee-brown-headshot.jpeg',
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
        description: 'Stomp a shockwave that knocks hosts off their feet.',
        auraCost: 8,
        drain: 0,
      },
      {
        id: 'overdrive',
        name: 'Overdrive',
        key: 'E',
        description:
          'Hold the kinetic burst. Speed and fire rate stay high while aura drains. Press again to cut it.',
        auraCost: 0,
        drain: 10,
      },
      {
        id: 'prideDash',
        name: 'Pride Rush',
        key: 'R',
        description: 'Dash through the line. Anything in the path eats a spiked knuckle.',
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
    weapon: 'Black aura axe',
    portrait: '/assets/hadi-taloustan-headshot.jpg',
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
        name: 'Axe Cleave',
        key: 'Q',
        description: 'A wide black-aura sweep. Hits everything in front of you.',
        auraCost: 7,
        drain: 0,
      },
      {
        id: 'blink',
        name: 'Shadow Step',
        key: 'E',
        description:
          'Teleport toward your aim as long as aura remains. The shadow you leave detonates on arrival.',
        auraCost: 9,
        drain: 0,
      },
      {
        id: 'greedSiphon',
        name: 'Greed Vault',
        key: 'R',
        description: 'Rip aura out of nearby hosts. They bleed. You refill.',
        auraCost: 8,
        drain: 0,
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
    weapon: 'Blue energy projection',
    portrait: '/assets/aria-patterson-headshot.jpg',
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
        description: 'Hold nearby hosts in the air while aura drains. Press again to drop them.',
        auraCost: 0,
        drain: 7,
      },
      {
        id: 'forcefield',
        name: 'Force Field',
        key: 'E',
        description:
          'Keep the blue field up while aura lasts. It blocks hits, burns throws, and shoves hosts off you.',
        auraCost: 0,
        drain: 9,
      },
      {
        id: 'heartbreak',
        name: 'Heartbreak',
        key: 'R',
        description: 'A wide blue detonation. Desire as a weapon.',
        auraCost: 13,
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
    weapon: 'Pink energy darts',
    portrait: '/assets/john_andy_headshot.jpg',
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
        description: 'Keep a pink phantom fighting beside you while aura drains. Press again to fade it.',
        auraCost: 0,
        drain: 7,
      },
      {
        id: 'phase',
        name: 'Phantom Phase',
        key: 'E',
        description:
          'Stay vanished while aura holds. Hosts lose you, you slip through them, and your darts hit harder.',
        auraCost: 0,
        drain: 8,
      },
      {
        id: 'dartStorm',
        name: 'Dart Storm',
        key: 'R',
        description: 'A lazy rain of pink darts. Patience, then a lot of holes.',
        auraCost: 11,
        drain: 0,
      },
    ],
  },
};

export const RYDER_ORDER: RyderId[] = ['rubi', 'leo', 'aaron', 'zoe', 'keven'];

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
