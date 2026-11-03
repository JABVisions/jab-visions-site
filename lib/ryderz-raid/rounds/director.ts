import type { EnemyKind } from '../config';

/**
 * Endless survival. Each round names a phase, a maximum tier, and a spawn
 * plan. Future enemy GLBs register an archetype here. The fight still uses
 * the existing host bodies and strikes.
 */
export type EnemyTier = 1 | 2 | 3 | 4 | 5 | 6;

export type RoundPhaseId = 'street' | 'resistance' | 'elite' | 'superhuman' | 'apocalypse';

export type EnemyStyle = 'strike' | 'dodge' | 'block' | 'grab' | 'throw' | 'weapon' | 'power' | 'boss';

export type RaidDifficultyName = 'easy' | 'normal' | 'hard' | 'nightmare';

export type WarzoneEventId = 'storm' | 'breach' | 'secrets' | 'boss';

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
  /** Hosts released together each time the spawn timer fires. */
  spawnBatch: number;
  /** Active AI budget: how many hostile bodies are alive and thinking at once. */
  cap: number;
  /** Total civilians assigned to this round: exactly eight per round. */
  population: number;
  /** How many hosts may be swinging at the squad at the same time. */
  attackSlots: number;
  tactics: RoundTactics;
}

/**
 * Hard ceilings for the crowd simulation. Rounds only ever raise their
 * active budget up to `maxAlive`; the rest of the wave waits in the queue.
 * Adaptive rendering lowers `maxAlive` on a slow device without touching the
 * total civilian count.
 */
export interface CrowdBudget {
  maxAlive: number;
  /** Metres from the nearest Ryder beyond which a host runs cheap chase logic. */
  thinkRadius: number;
  /** Metres beyond which a host's skeleton animates at half rate. */
  animRadius: number;
}

export const DEFAULT_CROWD_BUDGET: CrowdBudget = { maxAlive: 32, thinkRadius: 44, animRadius: 30 };

let crowdBudget: CrowdBudget = { ...DEFAULT_CROWD_BUDGET };

export function getCrowdBudget(): CrowdBudget {
  return crowdBudget;
}

/** Tune the live crowd. The total wave size never changes; only how many bodies are simulated at once. */
export function setCrowdBudget(patch: Partial<CrowdBudget>) {
  crowdBudget = {
    maxAlive: Math.max(8, Math.min(64, Math.round(patch.maxAlive ?? crowdBudget.maxAlive))),
    thinkRadius: Math.max(12, patch.thinkRadius ?? crowdBudget.thinkRadius),
    animRadius: Math.max(8, patch.animRadius ?? crowdBudget.animRadius),
  };
  return crowdBudget;
}

export function resetCrowdBudgetForTests() {
  crowdBudget = { ...DEFAULT_CROWD_BUDGET };
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
  event: WarzoneEventId | null;
  /** Civilians in this plan (boss excluded). Always `round * 8`. */
  civilians: number;
  /** Every body the round will spawn, boss included. */
  total: number;
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

export function tacticsForRound(round: number, difficulty: RaidDifficultyName = 'normal'): RoundTactics {
  const n = Math.max(1, Math.floor(round));
  const tune = DIFFICULTY[difficulty] ?? DIFFICULTY.normal;
  return {
    dodgePowers: n >= 6,
    flank: n >= 6,
    block: n >= 6,
    counter: n >= 8,
    surround: n >= 6,
    coordinate: n >= 11,
    interrupt: n >= 16,
    targetWeak: n >= 21,
    retreat: n >= 31,
    protectElite: n >= 41,
    powers: n >= 21,
    hazards: n >= 16,
    aggression: Math.min(1, Math.max(0, 0.22 + (n - 1) * 0.016 + tune.aggression)),
  };
}

/**
 * Difficulty never changes how many civilians a round holds. It changes how
 * tough they are, how many think at once, how many swing at once, and how
 * eager they are.
 */
export interface DifficultyProfile {
  hp: number;
  damage: number;
  /** Added to the active AI budget. */
  cap: number;
  /** Added to the simultaneous attacker count. */
  slots: number;
  /** Added to the tactics aggression (0–1 scale). */
  aggression: number;
  /** Multiplier on the spawn interval. Below 1 is faster. */
  pace: number;
}

export const DIFFICULTY: Record<RaidDifficultyName, DifficultyProfile> = {
  easy: { hp: 0.85, damage: 0.8, cap: -2, slots: -1, aggression: -0.08, pace: 1.15 },
  normal: { hp: 1, damage: 1, cap: 0, slots: 0, aggression: 0, pace: 1 },
  hard: { hp: 1.14, damage: 1.1, cap: 2, slots: 1, aggression: 0.08, pace: 0.9 },
  nightmare: { hp: 1.32, damage: 1.25, cap: 4, slots: 2, aggression: 0.16, pace: 0.8 },
};

/** The survival rule: every round adds exactly this many mind-controlled civilians. */
export const CIVILIANS_PER_ROUND = 8;

/** Total civilians assigned to a round. Round 1 is 8, round 10 is 80, round 50 is 400. */
export function civilianCountForRound(round: number) {
  const n = Math.max(1, Math.floor(round));
  return n * CIVILIANS_PER_ROUND;
}

/** Kept for callers that read the old name. Same rule. */
export function populationForRound(round: number) {
  return civilianCountForRound(round);
}

/**
 * How many hostiles are alive and thinking at once. Starts at six, climbs
 * roughly one body every two rounds, and is clamped by the crowd budget.
 */
export function activeBudgetForRound(round: number, squadSize = 1, difficulty: RaidDifficultyName = 'normal') {
  const n = Math.max(1, Math.floor(round));
  const allies = Math.max(0, Math.floor(squadSize) - 1);
  const tune = DIFFICULTY[difficulty] ?? DIFFICULTY.normal;
  const raw = 6 + Math.floor((n - 1) * 0.55) + allies * 2 + tune.cap;
  return Math.max(4, Math.min(crowdBudget.maxAlive, raw));
}

/**
 * Simultaneous attackers. Round 1 lets two hosts swing at once; by round 20
 * five press, by round 40 seven. Each squadmate opens one more slot so a
 * raid team is actually attacked.
 */
export function attackSlotsForRound(round: number, squadSize = 1, difficulty: RaidDifficultyName = 'normal') {
  const n = Math.max(1, Math.floor(round));
  const allies = Math.max(0, Math.floor(squadSize) - 1);
  const tune = DIFFICULTY[difficulty] ?? DIFFICULTY.normal;
  return Math.max(1, Math.min(10, 2 + Math.floor((n - 1) / 6) + allies + tune.slots));
}

/**
 * Every fifth round the arena changes. Tens are bosses. The other fives cycle
 * storm, secret doors, storm, then a breach.
 */
export function warzoneEvent(round: number): WarzoneEventId | null {
  const n = Math.max(1, Math.floor(round));
  if (n < 5 || n % 5 !== 0) return null;
  if (n % 10 === 0) return 'boss';
  const index = Math.floor((n / 5 - 1) / 2) % 4;
  if (index === 1) return 'secrets';
  if (index === 3) return 'breach';
  return 'storm';
}

export function warzoneLabel(event: WarzoneEventId | null) {
  if (event === 'storm') return 'SUPERNATURAL STORM';
  if (event === 'breach') return 'REINFORCEMENTS BREACH';
  if (event === 'secrets') return 'SECRET DOORS UNLOCK';
  if (event === 'boss') return 'A BOSS EMERGES';
  return null;
}

/**
 * Normal solo round 15 is the balancing anchor: tier 4, 1.63× health,
 * 1.25× damage, 120 civilians with 13 alive at once. Extra squad members
 * raise the active budget and toughness a little, never the civilian count.
 */
export function roundScale(round: number, squadSize = 1, difficulty: RaidDifficultyName = 'normal'): RoundScale {
  const n = Math.max(1, Math.floor(round));
  const phase = phaseForRound(n);
  const allies = Math.max(0, Math.floor(squadSize) - 1);
  const tune = DIFFICULTY[difficulty] ?? DIFFICULTY.normal;
  const hp = (1 + (n - 1) * 0.045) * (1 + allies * 0.06) * tune.hp;
  const damage = (1 + (n - 1) * (0.25 / 14)) * (1 + allies * 0.03) * tune.damage;
  const cap = activeBudgetForRound(n, squadSize, difficulty);
  const population = civilianCountForRound(n);
  return {
    round: n,
    phase,
    maxTier: phase.maxTier,
    hp,
    damage,
    speed: 1 + Math.min((n - 1) * 0.012, 0.3),
    spawnInterval: Math.max(0.16, (0.9 - (n - 1) * 0.018) * tune.pace),
    spawnBatch: 1 + Math.floor(n / 10),
    cap,
    population,
    attackSlots: attackSlotsForRound(n, squadSize, difficulty),
    tactics: tacticsForRound(n, difficulty),
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
  const opening: SpawnOrder[] = [];
  for (let i = 0; i < scale.population; i += 1) {
    const entry = pickArchetype(scale.round, rng);
    opening.push({ kind: entry.kind, archetypeId: entry.id });
  }
  const civilians = opening.length;
  let reserve: SpawnOrder[] = [];
  if (scale.round >= 6 && opening.length >= 4) {
    const hold = Math.max(1, Math.round(opening.length * 0.28));
    reserve = opening.splice(opening.length - hold, hold);
  }
  const boss = bossRound(scale.round);
  if (boss) opening.unshift({ kind: 'broadcaster', archetypeId: 'broadcaster' });
  return {
    round: scale.round,
    scale,
    opening,
    reserve,
    boss,
    event: warzoneEvent(scale.round),
    civilians,
    total: opening.length + reserve.length,
  };
}

/** The round table the design doc shows: round, civilians, and a pressure word. */
export function roundPressure(round: number): 'Light' | 'Moderate' | 'Heavy' | 'Overwhelming' | 'Catastrophic' {
  const n = Math.max(1, Math.floor(round));
  if (n < 5) return 'Light';
  if (n < 15) return 'Moderate';
  if (n < 25) return 'Heavy';
  if (n < 40) return 'Overwhelming';
  return 'Catastrophic';
}

export function roundTitle(round: number) {
  const phase = phaseForRound(round);
  const event = warzoneEvent(round);
  const eventLine = event && event !== 'boss' ? warzoneLabel(event) : null;
  if (round === 1) return { title: 'ROUND 1', sub: 'THE SIGNAL TAKES THE BLOCK' };
  if (bossRound(round)) return { title: `ROUND ${round}`, sub: 'THE BROADCASTER IS HERE' };
  if (eventLine) return { title: `ROUND ${round}`, sub: eventLine };
  return { title: `ROUND ${round}`, sub: phase.name.toUpperCase() };
}
