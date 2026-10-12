import type { EnemyKind } from '../config';

/**
 * Endless survival. Each round names a phase, a maximum tier, and a spawn
 * plan. Future enemy GLBs register an archetype here. The fight still uses
 * the existing host bodies and strikes.
 */
export type EnemyTier = 1 | 2 | 3 | 4 | 5 | 6;

export type RoundPhaseId = 'street' | 'resistance' | 'elite' | 'superhuman' | 'apocalypse';

export type EnemyStyle = 'strike' | 'dodge' | 'block' | 'grab' | 'throw' | 'weapon' | 'power' | 'boss';

export type RaidDifficultyName = 'easy' | 'normal' | 'hard';

export interface EnemyArchetype {
  id: string;
  /** Body the raid already knows how to spawn. A later GLB can replace it. */
  kind: EnemyKind;
  tier: EnemyTier;
  name: string;
  style: EnemyStyle[];
  /** Powers are limited to archetypes marked supernatural. */
  supernatural: boolean;
  minRound: number;
  boss?: boolean;
  /** Optional model path for a future GLB. Unused until that file is in the raid. */
  glb?: string;
  weaknesses?: string[];
  weight: Partial<Record<RoundPhaseId, number>>;
}

export interface RoundPhase {
  id: RoundPhaseId;
  name: string;
  from: number;
  to: number | null;
  maxTier: EnemyTier;
  blurb: string;
}

export interface RoundTactics {
  dodgePowers: boolean;
  flank: boolean;
  block: boolean;
  counter: boolean;
  surround: boolean;
  coordinate: boolean;
  interrupt: boolean;
  targetWeak: boolean;
  retreat: boolean;
  protectElite: boolean;
  powers: boolean;
  hazards: boolean;
  /** 0 is a brawl. 1 is a squad that waits, flanks, and punishes. */
  aggression: number;
}

export interface RoundScale {
  round: number;
  phase: RoundPhase;
  maxTier: EnemyTier;
  hp: number;
  damage: number;
  speed: number;
  spawnInterval: number;
  cap: number;
  tactics: RoundTactics;
}

export interface SpawnOrder {
  kind: EnemyKind;
  archetypeId: string;
}

export interface DirectorPlan {
  round: number;
  scale: RoundScale;
  opening: SpawnOrder[];
  reserve: SpawnOrder[];
  boss: boolean;
}

export const TIERS: Record<EnemyTier, { classification: string; intelligence: string }> = {
  1: { classification: 'Civilian / Grunt', intelligence: 'Basic strikes and throwable objects' },
  2: { classification: 'Street Fighter', intelligence: 'Combos, dodging, and blocking' },
  3: { classification: 'Enforcer', intelligence: 'Heavy attacks, grabs, and counters' },
  4: { classification: 'Elite', intelligence: 'Team tactics and special weapons' },
  5: { classification: 'Superhuman', intelligence: 'Powers, mobility, and advanced attacks' },
  6: { classification: 'Boss', intelligence: 'Unique mechanics, phases, and powerful abilities' },
};

export const PHASES: RoundPhase[] = [
  {
    id: 'street',
    name: 'Street Chaos',
    from: 1,
    to: 5,
    maxTier: 2,
    blurb: 'Civilians punch, kick, dodge, and throw whatever is on the street.',
  },
  {
    id: 'resistance',
    name: 'Organized Resistance',
    from: 6,
    to: 10,
    maxTier: 3,
    blurb: 'Fighters block, counter, and surround the squad.',
  },
  {
    id: 'elite',
    name: 'Elite Threats',
    from: 11,
    to: 20,
    maxTier: 4,
    blurb: 'Armored fighters and tactical groups. Powers stay with the supernatural.',
  },
  {
    id: 'superhuman',
    name: 'Superhuman Warfare',
    from: 21,
    to: 40,
    maxTier: 5,
    blurb: 'Supernatural enemies answer Ryder powers with powers of their own.',
  },
  {
    id: 'apocalypse',
    name: 'Apocalypse',
    from: 41,
    to: null,
    maxTier: 6,
    blurb: 'Bosses, hazards, and mixed groups. The climb does not end at round 50.',
  },
];

const DEFAULTS: EnemyArchetype[] = [
  {
    id: 'civilian',
    kind: 'walker',
    tier: 1,
    name: 'Civilian',
    style: ['strike', 'throw'],
    supernatural: false,
    minRound: 1,
    weaknesses: ['crowd control', 'grabs'],
    weight: { street: 8, resistance: 4, elite: 2, superhuman: 1, apocalypse: 1 },
  },
  {
    id: 'street-fighter',
    kind: 'sprinter',
    tier: 2,
    name: 'Street Fighter',
    style: ['strike', 'dodge', 'block'],
    supernatural: false,
    minRound: 2,
    weaknesses: ['throws', 'heavy hits'],
    weight: { street: 3, resistance: 4, elite: 3, superhuman: 2, apocalypse: 2 },
  },
  {
    id: 'hurler',
    kind: 'thrower',
    tier: 2,
    name: 'Hurler',
    style: ['throw', 'dodge'],
    supernatural: false,
    minRound: 3,
    weaknesses: ['closing the gap'],
    weight: { street: 2, resistance: 3, elite: 3, superhuman: 2, apocalypse: 2 },
  },
  {
    id: 'enforcer',
    kind: 'heavy',
    tier: 3,
    name: 'Enforcer',
    style: ['grab', 'block', 'strike'],
    supernatural: false,
    minRound: 6,
    weaknesses: ['kiting', 'powers'],
    weight: { resistance: 4, elite: 3, superhuman: 3, apocalypse: 2 },
  },
  {
    id: 'elite',
    kind: 'heavy',
    tier: 4,
    name: 'Elite',
    style: ['weapon', 'block', 'grab'],
    supernatural: false,
    minRound: 11,
    weaknesses: ['focus fire'],
    weight: { elite: 4, superhuman: 4, apocalypse: 4 },
  },
  {
    id: 'signal-adept',
    kind: 'adept',
    tier: 5,
    name: 'Signal Adept',
    style: ['power', 'dodge', 'strike'],
    supernatural: true,
    minRound: 21,
    weaknesses: ['silence', 'burst'],
    weight: { superhuman: 4, apocalypse: 5 },
  },
  {
    id: 'broadcaster',
    kind: 'broadcaster',
    tier: 6,
    name: 'The Broadcaster',
    style: ['boss', 'power'],
    supernatural: true,
    minRound: 10,
    boss: true,
    weaknesses: ['phase windows'],
    weight: {},
  },
];

let archetypes: EnemyArchetype[] = DEFAULTS.map((entry) => ({ ...entry, style: [...entry.style], weight: { ...entry.weight } }));

/** Plug a future GLB into a tier. Replaces an archetype with the same id. */
export function registerEnemyArchetype(entry: EnemyArchetype) {
  if (entry.style.includes('power') && !entry.supernatural) {
    throw new Error(`archetype ${entry.id} cannot use powers unless it is supernatural`);
  }
  archetypes = archetypes.filter((row) => row.id !== entry.id).concat({
    ...entry,
    style: [...entry.style],
    weight: { ...entry.weight },
    weaknesses: entry.weaknesses ? [...entry.weaknesses] : undefined,
  });
}

export function resetArchetypesForTests() {
  archetypes = DEFAULTS.map((entry) => ({ ...entry, style: [...entry.style], weight: { ...entry.weight } }));
}

export function listArchetypes(): EnemyArchetype[] {
  return archetypes.map((entry) => ({ ...entry, style: [...entry.style], weight: { ...entry.weight } }));
}

export function archetypeById(id: string): EnemyArchetype | undefined {
  return archetypes.find((entry) => entry.id === id);
}

export function phaseForRound(round: number): RoundPhase {
  const n = Math.max(1, Math.floor(round));
  return PHASES.find((phase) => n >= phase.from && (phase.to == null || n <= phase.to)) ?? PHASES[PHASES.length - 1];
}

export function bossRound(round: number) {
  const n = Math.max(1, Math.floor(round));
  return n >= 10 && n % 10 === 0;
}

export function tacticsForRound(round: number): RoundTactics {
  const n = Math.max(1, Math.floor(round));
  return {
    dodgePowers: n >= 6,
    flank: n >= 6,
    block: n >= 6,
    counter: n >= 8,
    surround: n >= 6,
    coordinate: n >= 11,
    interrupt: n >= 21,
    targetWeak: n >= 21,
    retreat: n >= 31,
    protectElite: n >= 41,
    powers: n >= 21,
    hazards: n >= 41,
    aggression: Math.min(1, 0.22 + (n - 1) * 0.016),
  };
}

const DIFFICULTY = {
  easy: { hp: 0.85, damage: 0.82, cap: -1 },
  normal: { hp: 1, damage: 1, cap: 0 },
  hard: { hp: 1.12, damage: 1.08, cap: 1 },
} as const;

/**
 * Normal solo round 15 is the balancing anchor: tier 4, 1.63× health,
 * 1.25× damage, 11 enemies alive. Extra squad members add a few bodies
 * and a small bump, not a second full raid.
 */
export function roundScale(round: number, squadSize = 1, difficulty: RaidDifficultyName = 'normal'): RoundScale {
  const n = Math.max(1, Math.floor(round));
  const phase = phaseForRound(n);
  const allies = Math.max(0, Math.floor(squadSize) - 1);
  const tune = DIFFICULTY[difficulty] ?? DIFFICULTY.normal;
  const hp = (1 + (n - 1) * 0.045) * (1 + allies * 0.06) * tune.hp;
  const damage = (1 + (n - 1) * (0.25 / 14)) * (1 + allies * 0.03) * tune.damage;
  const cap = Math.max(4, Math.min(16, 6 + Math.floor((n - 1) * (5 / 14)) + allies + tune.cap));
  return {
    round: n,
    phase,
    maxTier: phase.maxTier,
    hp,
    damage,
    speed: 1 + Math.min((n - 1) * 0.012, 0.3),
    spawnInterval: Math.max(0.34, 0.95 - (n - 1) * 0.012),
    cap,
    tactics: tacticsForRound(n),
  };
}

export function eligibleArchetypes(round: number): EnemyArchetype[] {
  const phase = phaseForRound(round);
  return archetypes.filter((entry) => !entry.boss && entry.tier <= phase.maxTier && entry.minRound <= round && (entry.weight[phase.id] ?? 0) > 0);
}

function pickArchetype(round: number, rng: () => number): EnemyArchetype {
  const phase = phaseForRound(round);
  const pool = eligibleArchetypes(round);
  const total = pool.reduce((sum, entry) => sum + (entry.weight[phase.id] ?? 0), 0) || 1;
  let cursor = rng() * total;
  for (const entry of pool) {
    cursor -= entry.weight[phase.id] ?? 0;
    if (cursor <= 0) return entry;
  }
  return pool[pool.length - 1];
}

/** The invisible director: who shows up, who waits in reserve, and how hard they think. */
export function directRound(round: number, squadSize = 1, rng: () => number = Math.random, difficulty: RaidDifficultyName = 'normal'): DirectorPlan {
  const scale = roundScale(round, squadSize, difficulty);
  const budget = Math.max(scale.cap, Math.round(scale.cap * (scale.round < 6 ? 1.15 : 1.4)));
  const opening: SpawnOrder[] = [];
  for (let i = 0; i < budget; i += 1) {
    const entry = pickArchetype(scale.round, rng);
    opening.push({ kind: entry.kind, archetypeId: entry.id });
  }
  let reserve: SpawnOrder[] = [];
  if (scale.round >= 6 && opening.length >= 4) {
    const hold = Math.max(1, Math.round(opening.length * 0.28));
    reserve = opening.splice(opening.length - hold, hold);
  }
  const boss = bossRound(scale.round);
  if (boss) opening.unshift({ kind: 'broadcaster', archetypeId: 'broadcaster' });
  return { round: scale.round, scale, opening, reserve, boss };
}

export function roundTitle(round: number) {
  const phase = phaseForRound(round);
  if (round === 1) return { title: 'ROUND 1', sub: 'THE SIGNAL TAKES THE BLOCK' };
  if (bossRound(round)) return { title: `ROUND ${round}`, sub: 'THE BROADCASTER IS HERE' };
  return { title: `ROUND ${round}`, sub: phase.name.toUpperCase() };
}
