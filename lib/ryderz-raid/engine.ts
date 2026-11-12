import * as THREE from 'three';
import {
  BOUNDARY,
  BURNOUT_RECOVERY,
  DISTRICT_SPAN,
  ENEMIES,
  HOME_DISTRICT,
  INTERACT_KEYS,
  INTERMISSION,
  KILL_AURA_SIPHON,
  MAX_ALIVE_HOSTS,
  MAX_POWER_SLOTS,
  MELEE_ARC,
  MELEE_RANGE,
  MOVE_KEYS,
  PLAYER_RADIUS,
  RYDERZ,
  roundBanner,
  upgradeCost,
  UPGRADES,
  type AbilityId,
  type AbilitySpec,
  type EnemyKind,
  type RyderId,
  type RyderSpec,
  type UpgradeId,
} from './config';
import { GameMode } from './game-mode';
import { PowerOutage, abilityLockout, type PowerClock } from './power-outage';
import { DEFAULT_ARENA, arenaSpec, type ArenaDefinition, type ArenaId } from './arenas';
import { RyderBeacon, type BeaconHudState } from './beacon';
import { RyderPowerVFX, type PowerState } from './power-vfx';
import {
  CrackDecalPool,
  HitScheduler,
  ShockRingPool,
  applyReaction,
  juggleBody,
  resistReaction,
  stepReaction,
  targetsInArc,
  type HitReaction,
} from './combat';
import { SignalBank, availableSignal, levelProgress, type SignalEvent, type SignalLedger } from './progression/signal-points';
import { emptyModifiers, type PowerModifiers } from './progression/power-tree';
import { DERIVED_POWERS, derivedAtRank, isDerivedAbility, rankScaling, type DerivedPowerSpec } from './progression/derived-powers';
import {
  BLITZ_DASH_POSE,
  BLITZ_FINISH,
  RYDER_STYLE,
  choreoFor,
  resolvePose,
  resolveStrike,
  type ChoreoBeat,
  type PowerChoreo,
} from './progression/power-choreo';
import { EngagementDirector, type EngagementCandidate } from './civilians/engagement';
import { CrowdGrid } from './crowd/grid';
import { AfterimagePool } from './speed-vfx';
import { PowerFx, type ShotInstance, type ShotShape } from './power-fx';
import { ORB_MAGNET_RADIUS, SignalOrbs, type OrbCollector, type OrbPickup } from './signal-orbs';
import { AURA_PARTICLES, powerLook } from './progression/power-looks';
import { createRyderKit, type KitContext, type KitTarget, type MeleeStep, type RyderKit } from './ryderz';
import type { MeleeStyle, PoseOverride } from './skeletal';
import {
  CAMERA_MODE_LABEL,
  CAMERA_MODE_ORDER,
  ThirdPersonCamera,
  cameraRelativeVelocity,
  dampAngle,
  keyboardPitchDelta,
  keyboardYawDelta,
  stepYaw,
  type CameraConfig,
  type CameraMode,
  type CameraSnapshot,
  type CameraState,
} from './camera';
import { AUTO_LOCK, pickAutoTarget, steerAutoLock } from './auto-lock';
import {
  animateGltfFighter,
  BOLT_GEOMETRY,
  buildHost,
  buildRyder,
  preloadCivilianModels,
  preloadHostGltf,
  type Fighter,
} from './characters';
import { resolveAppearance } from './skins/appearance';
import { ParticleSystem } from './particles';
import {
  animateHumanoid,
  disposeObject,
  flashEmissive,
  glow,
  poseAim,
  poseMelee,
  toon,
  setHumanoidOpacity,
} from './toon';
import { ledgeDrop, resolveFooting, slopeBlocks, STEP_HEIGHT } from './footing';
import { allyFocusIndex, commitSteer, formUp, freshNav, pressTarget, type NavHint, type TrackPoint } from './nav';
import { buildWorld, nearDistrictHub, pointBlocked, resolveCircle, type World } from './world';
import { chartBlocks, type MapBlock } from './map-chart';
import { buildPadWorld } from './world-pad';
import { buildIslandWorld } from './world-island';
import { buildRiverdaleWorld } from './world-riverdale';
import { untrackInstances } from './render/instancing';
import { emptySwim, shallowDirection, stepSwim, type SwimState, type WaterColumn } from './island/swim';
import { calculatePvPDamage, pvpHealth, PvpCpu, type PvpDamageKind } from './pvp';
import type { PvpDifficulty } from './pvp/aiProfile';
import { arenaChangeRestarts, canAssumeAlly, carriedVitals } from './raid/control';
import { RAID_REWARDS, killReward } from './raid/rewards';
import { fieldStations, nearestStation, type FieldStation } from './raid/stations';
import { type RaidLaunch } from './raid/squad';
import {
  archetypeById,
  directRound,
  getCrowdBudget,
  setCrowdBudget,
  warzoneLabel,
  type CrowdBudget,
  type DirectorPlan,
  type RoundTactics,
  type SpawnOrder,
} from './rounds/director';
import {
  ABILITY_KEYS,
  CombatMemory,
  FighterStriker,
  abilitySlotOf,
  combatProfileFor,
  commandForKey,
  isFinisherEffect,
  isKnockedDown,
  isMapKey,
  meleeWantsGrab,
  reactionForEffect,
  recipesFor,
  resolvePowerLink,
  risingPadCommands,
  withSprintModifier,
  type CombatCommand,
  type ComboRecipe,
  type PhysicalHit,
  type StrikeInput,
  type StrikeKind,
  type StrikerHit,
} from './fighter';
import { CIVILIAN_PROFILES, civilianOrder, profileForKind, type CivilianProfileId } from './civilians/profiles';
import {
  boostNearbyRiot,
  influenceRank,
  isProvoked,
  pickRival,
  provoke,
  swayOf,
} from './ryderz/tj-influence';
import { DOWN_SECONDS, REVIVE_RANGE, downOpacity, reviveVitals, squadStillStanding } from './raid/downed';
import {
  MVP_HOLD,
  REPORT_HOLD,
  emptyStat,
  mvpRound,
  type SquadStatLine,
} from './raid/statboard';
import { CIVILIAN_REGISTRY, clipHintFor, definitionForProfile, type CivilianDefinition } from './civilians/registry';
import { ThrowableField, type ThrowBody } from './throwables';
import { RenderPipeline } from './render/pipeline';

export interface HudState {
  hp: number;
  maxHp: number;
  aura: number;
  maxAura: number;
  burnout: boolean;
  moves: Array<{
    id: AbilityId;
    key: string;
    name: string;
    ready: boolean;
    cooldown: number;
    duration: number;
  }>;
  /** Power slots the current Ryder has opened on the tree. 1 / 2 / 3 are always open. */
  openSlots: number;
  /** Signal Points: the persistent progression wallet. `earned` is lifetime, `round` is this round so far. */
  signal: { available: number; earned: number; round: number; level: number; progress: number };
  /** Signal Orb payouts since the last HUD frame, placed over the Ryder in screen percent. */
  signalPops: { amount: number; x: number; y: number }[];
  /** Local player is holding guard. */
  guarding: boolean;
  round: number;
  remaining: number;
  points: number;
  phase: 'playing' | 'intermission' | 'dead' | 'victory' | 'report';
  /** Set during a versus match. Null in Solo and Raid. */
  opponent: {
    ryderId: RyderId;
    name: string;
    hp: number;
    maxHp: number;
    aura: number;
    maxAura: number;
    cpu: boolean;
  } | null;
  intermissionLeft: number;
  nearShop: boolean;
  banner: { title: string; sub: string } | null;
  upgrades: Record<UpgradeId, number>;
  pointerLocked: boolean;
  paused: boolean;
  /** Full-arena chart. Tab toggles it. M toggles it unless that key is player 2's jump. */
  mapOpen: boolean;
  ryderId: RyderId;
  ryderName: string;
  meleeOnly: boolean;
  /** Marywantis's tide cut out, or the shared blackout is running. Powers are dead until it comes back. */
  tideOut: boolean;
  /** Seconds left on the power clock. Live time while powers are up, dry time while they are out. */
  powerLeft: number;
  /** The shared power blackout is running. */
  powerDown: boolean;
  /** A duel does not run the power clock. Usage stays unlimited. */
  powerUnlimited: boolean;
  cameraState: CameraState;
  cameraMode: CameraMode;
  lockOn: boolean;
  difficulty: string;
  heldWeapon: string;
  warzone: string;
  /** HIGH / LOW / DEPLETED, as the electricity system reads it. */
  powerState: PowerState;
  /** The arena's Ryder Beacon, relative to the player. */
  beacon: BeaconHudState | null;
  /** True for the moment the Beacon is pouring energy back into the Ryder. */
  recovering: boolean;
  /** Unipolar Resonance, 0–100. Other Ryderz stay at 0. */
  resonance: number;
  combo: {
    count: number;
    label: string;
    tier: string;
    color: string;
    revision: number;
    power: boolean;
    powerLabel: string;
    powerLeft: number;
  };
  /** Player, living hostiles, and squadmates, in world metres. */
  radar: {
    x: number;
    z: number;
    yaw: number;
    /** Half-width of this arena in metres. The opened map draws the whole span. */
    span: number;
    terrain: 'island' | 'city';
    color: string;
    blocks: MapBlock[];
    /** Cells the squad has walked, row-major over the island span. Absent off the island. */
    explored?: Uint8Array;
    exploreN?: number;
    enemies: { x: number; z: number }[];
    allies: { x: number; z: number; name: string; color: string; down: boolean }[];
  };
  raid: {
    wave: number;
    waves: number;
    defeated: number;
    dealt: number;
    taken: number;
    allies: number;
    contributions: { name: string; dealt: number; signal?: number }[];
  } | null;
  /** Endless survival card. Null in a versus match. */
  survival: {
    round: number;
    phase: string;
    maxTier: number;
    hp: number;
    damage: number;
    cap: number;
    boss: boolean;
    /** Civilians this round in total (round × 8), how many are still to be spawned or beaten, how many stand now. */
    population: number;
    remaining: number;
    alive: number;
    /** Hosts holding an attack token right now. */
    attackers: number;
  } | null;
  /** Live squad bars. Null outside a raid. */
  party: Array<{
    index: number;
    hp: number;
    maxHp: number;
    aura: number;
    maxAura: number;
    alive: boolean;
    /** 1 while up. While down, the fraction of the pickup window still left. */
    bleed: number;
    /** This bar is the fighter the local player is driving. */
    yours: boolean;
    /** A CPU teammate who can be taken over by tapping the bar. */
    playable: boolean;
  }> | null;
  /** A downed teammate inside pickup range. */
  revive: { name: string; left: number } | null;
  /** Local raider is on the ground. */
  down: { left: number; faded: boolean } | null;
  /** Post-round combat report. Null while a round is still being fought. */
  statBoard: {
    round: number;
    nextRound: number;
    raid: boolean;
    mvp: boolean;
    left: number;
    lines: SquadStatLine[];
    pointsEarned: number;
    upgradesBought: number;
  } | null;
  /** Null on arenas with no ocean. Present on dry sand too, so the HUD can tell land from water. */
  water: { mode: SwimState['mode']; oxygen: number; submerged: boolean } | null;
  /** How loud the arena's party is where the player stands, 0 to 1. Null where there is none. */
  partyLevel: number | null;
}

interface Host {
  kind: EnemyKind;
  tier?: number;
  archetypeId?: string;
  supernatural?: boolean;
  fighter: Fighter;
  hp: number;
  maxHp: number;
  pos: THREE.Vector3;
  radius: number;
  speed: number;
  damage: number;
  mass: number;
  preferredRange: number;
  cooldown: number;
  /** Last combat decision, for the island warzone readout. */
  aiState?: string;
  aiDist?: number;
  aiAttack?: string | null;
  aiWhy?: string;
  anim: number;
  hit: number;
  knock: THREE.Vector3;
  points: number;
  summon: number;
  stun: number;
  /** Set when the host lands a melee; consumed by the next animation tick. */
  swing: boolean;
  /** Hit-reaction state (see `combat.ts`): stagger window, airborne arc, visual lean / tumble. */
  stagger: number;
  airY: number;
  airVel: number;
  lean: number;
  spin: number;
  tumble: number;
  /** Grab state (see `combat.ts`): seconds held by the Ryder, metres pulled under the floor. */
  held: number;
  sink: number;
  /** Fraction of attack animation rate while a local suppression field covers this host. */
  attackScale?: number;
  /** How far into a punch-kick chain this host is. Resets after a pause. */
  chain: number;
  /** Physical fighter for civilians. Duelists use PvpCpu instead. */
  striker?: FighterStriker;
  profileId?: CivilianProfileId;
  animMap?: CivilianDefinition['animationMap'];
  heldItem?: ThrowBody | null;
  /** A prop this host could not reach; it ignores it until `passPropT` runs out. */
  passProp?: ThrowBody | null;
  passPropT?: number;
  /** Seconds spent in the current flight from the Ryder. */
  fleeT?: number;
  /** Seconds left before this host may flee again. */
  braveT?: number;
  /** Seconds left in a raise-then-throw. 0 means not winding up. */
  throwWind: number;
  /** Dream Vision. The host stands and does not attack. Not a lift. */
  pacified?: number;
  /** Proclaim Peace. Released as soon as the timer expires. */
  immobile?: number;
  /** A snare left this host open: seconds it takes extra damage. */
  exposed?: number;
  winding: boolean;
  /** Next physical strike after this one, for a short jab chain. */
  follow: StrikeKind | null;
  /** Seconds a raised guard still eats part of an incoming hit. */
  guard?: number;
  /** Seconds until a supernatural pulse can fire again. */
  powerCd?: number;
  /** Last shove, kept so props can read it later. */
  lastImpact?: { x: number; z: number; speed: number; kind: string };
  /** Colour of the current hit flash; hits reset it to white, kits can tint it. */
  hitColor: number;
  /** Versus opponent wearing a Ryder model. Not a mind-controlled host. */
  duelist?: boolean;
  /** Squad teammate. Friendly fire from the player does not land. */
  ally?: boolean;
  cpu?: PvpCpu;
  dealt?: number;
  playerId?: string | null;
  remoteHuman?: boolean;
  /** Local player 2, rather than CPU. */
  controlled?: boolean;
  ryderId?: RyderId;
  /** The Ryder's spec in the skin this body was built with. */
  look?: RyderSpec;
  aura?: number;
  maxAura?: number;
  /** Party strip slot for a raid teammate. */
  seat?: number;
  /** Seconds left to be picked up. 0 means this fighter is not down. */
  down?: number;
  /** This fighter can path through deep water and plays the swim stance there. */
  swims?: boolean;
  /** Wall-slide memory so a blocked step does not grind in place. */
  nav?: NavHint;
  /** Net-progress watch: a host that has not got anywhere for a while walks out to open ground. */
  stall?: {
    x: number;
    z: number;
    t: number;
    out: number;
    ox: number;
    oz: number;
    /** Back-to-back stalls; the second one jumps the host to its target. */
    strikes: number;
    /** Distance-to-target window: a host that is not closing in at all gets the same jump. */
    closeT: number;
    closeD: number;
    closePx: number;
    closePz: number;
  };
  /** This raid teammate is already committed to a host and may chase a little farther. */
  pressing?: boolean;
  /** Frames skipped while this host is far enough to simulate cheaply. */
  lodTick?: number;
  /** Crowd-control resistance (see `combat.ts`): elites shrug off repeated launches. */
  ccResist?: number;
  ccResistAt?: number;
  /** Sim seconds since this host last swung at the player. The engagement director reads it. */
  sinceAttack: number;
  /** This host currently holds an attack token from the engagement director. */
  token: boolean;
  /** Sim seconds since the host last saw its target in detect range. */
  sinceSeen: number;
  /** Set while the player's strike is in startup near this host, so it can dodge. */
  canDodge: boolean;
  /** The local player put this host into the air; a teammate's hit while it is up is a team combo. */
  launchedBy?: number;
  launchedAt?: number;
  /** Last time this host fed a kill, so the same body never pays twice. */
  paid?: boolean;
  /** GLB the body was built from, so the pool can shelve it under the right key. */
  modelPath?: string | null;
  /** Animation LOD: skip this frame's pose. */
  animSkip?: boolean;
}

/** A derived power's numbers at the rank it was cast. */
type DerivedTune = ReturnType<typeof derivedAtRank>;

/** A tree-earned power mid-animation: which beats have fired, which stance is held. */
interface ActiveChoreo {
  spec: DerivedPowerSpec;
  tune: DerivedTune;
  choreo: PowerChoreo;
  /** Sim time the sequence started. */
  started: number;
  /** Index of the next beat to fire. */
  next: number;
  /** Stance currently held and the beat it started on. */
  pose: { kind: PoseOverride['kind']; weight: number; lean: number; bank: number; since: number; until: number } | null;
  /** Bolts thrown so far (volleys). */
  shots: number;
  /** Set when the sequence is the blitz finisher: the hit is the finisher, not a breaker. */
  finisher: boolean;
}

/** A defeated host still flying from the blow that killed it. */
interface Fallen {
  fighter: Fighter;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  airY: number;
  airVel: number;
  spin: number;
  tumble: number;
  life: number;
}

interface Bolt {
  active: boolean;
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  pos: THREE.Vector3;
  damage: number;
  fromPlayer: boolean;
  life: number;
  radius: number;
  /** A shaped projectile (dart, blade, bullet...) flown in place of the plain bolt mesh. */
  shot?: ShotInstance;
}

interface Clone {
  fighter: Fighter;
  fireCd: number;
  side: number;
}

/** Shaped bolts are drawn by `PowerFx`; they never show this. */
const BOLT_PLACEHOLDER = new THREE.Mesh();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _look = new THREE.Vector3();
const _tmp = new THREE.Vector3();
/** Top of a standing body above its feet at scale 1. */
const BODY_CROWN = 1.9;
const _tmp2 = new THREE.Vector3();
const _aimPoint = new THREE.Vector3();
const _ray = new THREE.Raycaster();
const _aimRay = new THREE.Ray();
const _camLead = new THREE.Vector3();

const SPRINT_MULTIPLIER = 1.28;
/** Short hop. v² / (2g) with g = 22 lands near 1.15 m. */
const JUMP_SPEED = 7.1;
const STICK_YAW_RATE = 2.6;
const STICK_PITCH_RATE = 1.85;
const COMBAT_LINGER = 2.6;
const COMBAT_PROXIMITY = 9;
const ABILITY_LINGER = 0.45;
/** Seconds the Ryder stands in the Beacon's recovery state while the bars refill. */
const RECOVERY_DURATION = 1.15;

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

/** Distance along `ray` to the first intersection with a sphere, or -1. */
function raySphere(ray: THREE.Ray, center: THREE.Vector3, radius: number) {
  const ox = ray.origin.x - center.x;
  const oy = ray.origin.y - center.y;
  const oz = ray.origin.z - center.z;
  const d = ray.direction;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : -1;
}

function emptyUpgrades(): Record<UpgradeId, number> {
  return { capacity: 0, signal: 0, fists: 0, vitality: 0, siphon: 0 };
}

export class RaidEngine {
  private canvas: HTMLCanvasElement;
  private onHud: (hud: HudState) => void;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private fill: THREE.DirectionalLight;
  private pipeline: RenderPipeline;
  private camera: THREE.PerspectiveCamera;
  private rig: ThirdPersonCamera;
  private world: World;
  private worlds = new Map<'block' | 'pad' | 'island' | 'riverdale', World>();
  private particles: ParticleSystem;
  private clock = new THREE.Clock();
  private raf = 0;
  private disposed = false;
  private paused = true;
  private mapOpen = false;
  private keys = new Set<string>();
  private moveAxis = { x: 0, z: 0 };
  private lookAcc = { x: 0, y: 0 };
  private padMove = false;
  private recenter = false;
  private lastCam = new THREE.Vector3();
  private camReady = false;
  private facilityAgents: { x: number; z: number }[] = [];
  private labFog = new THREE.Color();
  private aboveFog = new THREE.Color(0x141226);
  private aboveDensity = 0.0034;
  private waterTint = new THREE.Color();
  private swim: SwimState = emptySwim();
  private swimRise = 0;
  private fireHeld = false;
  private meleeQueued = false;
  private punchQueued = false;
  private kickQueued = false;
  private dodgeQueued = false;
  private jumpQueued = false;
  /** Sim time of the last grounded hop, so a second press can mount. */
  private jumpAt = -10;
  private jumping = false;
  private heavyQueued = false;
  private launcherQueued = false;
  /** Hold Z (or LB) with no direction to guard. Blocks eat most of a hit's damage and all of its stun. */
  private guarding = false;
  private guardT = 0;
  private guardPad = false;
  private guardTouch = false;
  /** The hit being resolved came from a finisher, so the kill pays finisher SP. */
  private pendingFinisher = false;
  private queuedMoves = [false, false, false, false, false, false];
  /** True once the ability key has come up, so a held key cannot switch a power off. */
  private releaseArmed = [true, true, true, true, true, true];
  /** Power Tree output for the current Ryder. Reset to neutral on every switch until the manager pushes again. */
  private modifiers: PowerModifiers = emptyModifiers();
  private treeRecipes: ComboRecipe[] = [];
  private openSlots = 3;
  private signalLedger: SignalLedger = { earned: 0, spent: 0 };
  private readonly signalBank = new SignalBank();
  private signalHooks = new Set<(event: SignalEvent) => void>();
  /** Surge buff seconds left and its damage multiplier. */
  private surgeT = 0;
  private surgeMul = 1;
  /** Blitz dash chain: hits left, seconds to the next dash. */
  private blitz: { left: number; next: number; spec: DerivedPowerSpec; tune: DerivedTune; pull: number; pulled: boolean } | null = null;
  private surgeColor = 0xffffff;
  /** The tree-earned power whose choreography the body is playing. */
  private choreo: ActiveChoreo | null = null;
  /** Power ranks from the tree (1 when unranked). */
  private powerRanks: Partial<Record<AbilityId, number>> = {};
  /** Damage multiplier the rank of the last power cast puts on kit and generic power damage. */
  private castScale = 1;
  /** Second Wind (tree passive) fired this life. */
  private secondWindUsed = false;
  private readonly engagement = new EngagementDirector();
  private readonly grid = new CrowdGrid<Host>();
  private attackersNow = 0;
  private frameTick = 0;
  private readonly tokenScratch: EngagementCandidate[] = [];
  private readonly nearScratch: Host[] = [];
  /** Retired host bodies kept for reuse so a 400-civilian round does not rebuild meshes. */
  private hostPool = new Map<string, Fighter[]>();
  private spawnedThisRound = 0;
  private readonly striker = new FighterStriker();
  private readonly playerBody = {};
  private throwables: ThrowableField | null = null;
  private heldThrow: ThrowBody | null = null;
  private fireEdge = false;
  private suppressFire = false;
  private locomote = 0;
  private combatDebug = false;
  private debugGroup: THREE.Group | null = null;
  private debugMarks: THREE.Mesh[] = [];
  private readonly p2Striker = new FighterStriker();
  private readonly combatMemory = new CombatMemory();
  private hitStun = 0;
  /** Seconds Nyx's zap holds the local player. Counts down on its own. */
  private stasis = 0;
  /** Speed fraction from an enemy suppression field. 1 is normal, and it expires if nobody refreshes it. */
  private suppress = 1;
  private suppressUntil = 0;
  private casedCpu = false;
  private hitKnock = new THREE.Vector3();
  private airY = 0;
  private airVel = 0;
  private takenChain = 0;
  private takenGap = 0;
  private dodgeT = 0;
  private dodgeCd = 0;
  private dodgeX = 0;
  private dodgeZ = 1;
  private retreatNote = 0;
  private padPrev: boolean[] = [];
  private pointerLocked = false;

  private spec: RyderSpec = RYDERZ.rubi;
  /** Powers bound to the number row. Defaults to the Ryder's signature moves; the Power Tree can rebind them. */
  private moves: AbilitySpec[] = RYDERZ.rubi.moves;
  private gameMode: GameMode = GameMode.SOLO;
  private pvpSetup: { opponentId: RyderId; localTwoPlayer: boolean } | null = null;
  private pvpLocalTwo = false;
  private p2MeleeQueued = false;
  private p2PunchQueued = false;
  private p2KickQueued = false;
  private p2DodgeQueued = false;
  private p2JumpQueued = false;
  private p2Jumping = false;
  private p2DodgeT = 0;
  /** CPU duelist. Null in Solo, Raid, and local 2-player. */
  pvpCpu: PvpCpu | null = null;
  private raidPlan: RaidLaunch | null = null;
  private raidWave = 0;
  private raidEnemiesDown = 0;
  private raidDealt = 0;
  private raidTaken = 0;
  private raidDown = false;
  private downLeft = 0;
  /** Party seat the local input is driving. Seat 0 until a bar hands over a CPU ally. */
  private controlledSeat = 0;
  /** The Ryder a fresh start of this match puts back in the player's hands. */
  private homeId: RyderId | null = null;
  private homeMoves: AbilitySpec[] | null = null;
  private startToken = 0;
  /** Seats whose body has already faded, so the bar stays up and untappable. */
  private closedSeats = new Set<number>();
  private allowAllyDamage = false;
  /** A swayed civilian is hitting another civilian. That punch is not TJ's gun. */
  private infighting = false;
  /** Seat credited for the enemy hit currently being resolved. -1 is nobody. */
  private creditSeat = -1;
  private statLines = new Map<number, SquadStatLine>();
  private reportRound = 0;
  private reportLeft = 0;
  private allyInputs = new Map<string, { x: number; z: number; at: number }>();
  private playerVel = new THREE.Vector3();
  private pvpHitKind: PvpDamageKind = 'basic';
  private pvpHitKindT = 0;
  private foeHud: HudState['opponent'] = null;
  private switchToken = 0;
  private player: Fighter | null = null;
  private shield: THREE.Mesh | null = null;
  private pos = new THREE.Vector3(9 + HOME_DISTRICT, 0, 11 + HOME_DISTRICT);
  private yaw = Math.PI * 0.2;
  /** Body heading. Movement turns this; the mouse turns `yaw` and the camera follows. */
  private facing = Math.PI * 0.2;
  private pitch = 0.12;
  private combatT = 0;
  private abilityT = 0;
  private sprinting = false;
  private meleeStarted = false;
  private tuneMode = false;
  private hp = 100;
  private maxHp = 100;
  private aura = 100;
  private maxAura = 100;
  private burnout = false;
  /** Random stretch where Q, E, and R stop and the aura goes dark. */
  private powerOut = new PowerOutage(false);
  private fireCd = 0;
  private meleeCd = 0;
  private meleeT = 0;
  private moveCd = [0, 0, 0, 0, 0, 0];
  private moveT = [0, 0, 0, 0, 0, 0];
  private iframes = 0;
  private anim = 0;
  private points = 0;
  private pointsEarnedRound = 0;
  private upgradesBought = 0;
  private cameraMode: CameraMode = 'standard';
  private lockTarget: Host | null = null;
  private autoTarget: Host | null = null;
  /** Seconds since the player last turned the camera. Auto lock waits on it. */
  private lookIdle: number = AUTO_LOCK.resume;
  private stormT = 0;
  private sandT = 0;
  private stations: FieldStation[] = [];
  private stationRoot: THREE.Group | null = null;
  private stationViews: THREE.Object3D[] = [];
  private chart: MapBlock[] = [];
  private chartSig = 0;
  private chartWorld: World | null = null;
  private readonly exploreN = 48;
  private explored = new Uint8Array(48 * 48);
  /** Hidden caches already opened this match. */
  private foundCaches = new Set<string>();
  private round = 0;
  private phase: HudState['phase'] = 'playing';
  private intermissionLeft = 0;
  private queue: SpawnOrder[] = [];
  private reserve: SpawnOrder[] = [];
  private tactics: RoundTactics = directRound(1, 1, () => 0).scale.tactics;
  private survivalPlan: DirectorPlan = directRound(1, 1, () => 0);
  private signalHazard: { x: number; z: number; fuse: number } | null = null;
  private hazardWait = 14;
  private spawnTimer = 0;
  private banner: HudState['banner'] = null;
  private bannerT = 0;
  private upgrades = emptyUpgrades();
  private hosts: Host[] = [];
  private clones: Clone[] = [];
  private bolts: Bolt[] = [];
  private boltPool: Bolt[] = [];
  private powerVfx: RyderPowerVFX;
  private arena: ArenaDefinition;
  private beacon: RyderBeacon | null = null;
  private interactQueued = false;
  private recoveryT = 0;
  private recoveryFrom = { hp: 0, aura: 0 };
  /** Per-Ryder combat kit (null for Ryderz still on the generic moves). */
  private kit: RyderKit | null = null;
  private kitContext: KitContext | null = null;
  private clipTokenSeen = -1;
  /** Ability ids the current kit has claimed via `tryAbility`. */
  private kitClaimed = new Set<AbilityId>();
  private scheduler = new HitScheduler();
  private rings = new ShockRingPool(10);
  private cracks = new CrackDecalPool(4);
  private afterimages = new AfterimagePool(5);
  private powerFx!: PowerFx;
  private signalOrbs!: SignalOrbs;
  private readonly orbCollectors: OrbCollector[] = [];
  /** Floating +SP labels waiting for the next HUD frame, in screen percent. */
  private signalPops: { amount: number; x: number; y: number }[] = [];
  private fallen: Fallen[] = [];
  private hitStopT = 0;
  /** Gameplay seconds actually simulated (sum of clamped dt); hit windows and combos run on this, not wall time. */
  private simTime = 0;
  private lastPos = new THREE.Vector3();
  private playerSpeed = 0;
  private playerGlow = 0;
  private cameraPivot = new THREE.Vector3();
  private strikeOverride: MeleeStyle | null = null;
  private onSound: ((id: string) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, onHud: (hud: HudState) => void) {
    this.canvas = canvas;
    this.onHud = onHud;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      // The composer resolves its own MSAA target; the canvas only receives the final full-screen pass.
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    // Bloom and soft shadows run at this ratio; above it the cost outweighs the sharpness.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x141226, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x141226, 0.0034);

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.08, 1100);
    this.hemi = new THREE.HemisphereLight(0x4a4f86, 0x4a2c1e, 1.45);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xc4d2ff, 1.35);
    this.sun.position.set(-26, 48, 18);
    this.scene.add(this.sun);
    this.fill = new THREE.DirectionalLight(0xff5f9e, 0.45);
    this.fill.position.set(30, 12, -24);
    this.scene.add(this.fill);
    this.pipeline = new RenderPipeline(this.renderer, this.scene, this.camera, {
      sun: this.sun,
      hemi: this.hemi,
      fill: this.fill,
    });

    this.world = buildWorld();
    this.worlds.set('block', this.world);
    this.scene.add(this.world.group);
    this.scene.updateMatrixWorld(true);
    this.pipeline.useLights(this.world.group);
    this.rig = new ThirdPersonCamera(this.camera, this.world.occluders);

    this.particles = new ParticleSystem();
    this.scene.add(this.particles.points);
    this.powerVfx = new RyderPowerVFX(this.scene, this.particles);
    this.scene.add(this.rings.group, this.cracks.group, this.afterimages.group);
    this.powerFx = new PowerFx(this.particles, (x, z) => this.world.heightAt(x, z));
    this.scene.add(this.powerFx.group);
    this.signalOrbs = new SignalOrbs({
      floor: (x, z) => {
        const ground = this.world.heightAt(x, z);
        const water = this.world.water;
        return water && water.depthAt(x, z) > 0.2 ? Math.max(ground, water.surfaceAt(x, z)) : ground;
      },
      blocked: (x, z, radius) => this.npcBlocked(x, z, radius),
      spark: (pos, color) => this.particles.emit(pos, color, 1, { speed: 0.4, size: 0.12, life: 0.28, up: 0.2 }),
    });
    this.scene.add(this.signalOrbs.group);

    this.arena = arenaSpec(DEFAULT_ARENA)!;
    this.loadArena(this.arena.id);
    this.signalBank.subscribe((event) => this.onSignal(event));
    // Dev-only handle for headless combat checks; stripped from production builds.
    if (process.env.NODE_ENV !== 'production') {
      (window as unknown as { __raidDebug?: RaidEngine }).__raidDebug = this;
    }

    this.resize();
    this.bind();
    this.clock.start();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  async start(id: RyderId, moves?: AbilitySpec[]) {
    const token = ++this.startToken;
    this.clearCombat();
    this.spec = RYDERZ[id];
    this.moves = moves && moves.length >= 3 ? moves.slice(0, MAX_POWER_SLOTS) : this.spec.moves;
    this.homeId = id;
    this.homeMoves = this.moves;
    this.controlledSeat = 0;
    this.closedSeats.clear();
    this.upgrades = emptyUpgrades();
    this.maxHp = this.gameMode === GameMode.PVP ? pvpHealth(this.spec.maxHp) : this.spec.maxHp;
    this.hp = this.maxHp;
    this.maxAura = this.spec.maxAura;
    this.aura = this.maxAura;
    this.burnout = false;
    this.powerOut = new PowerOutage(this.gameMode === GameMode.PVP);
    this.points = 0;
    this.round = 0;
    this.fireCd = 0;
    this.meleeCd = 0;
    this.meleeT = 0;
    this.striker.reset();
    this.striker.setRyder(id);
    this.p2Striker.reset();
    this.combatMemory.reset();
    this.hitStun = 0;
    this.hitKnock.set(0, 0, 0);
    this.airY = 0;
    this.airVel = 0;
    this.swim = emptySwim(this.world.heightAt(this.arena.spawnPoint.x, this.arena.spawnPoint.z));
    this.swimRise = 0;
    this.takenChain = 0;
    this.takenGap = 0;
    this.dodgeT = 0;
    this.dodgeCd = 0;
    this.punchQueued = false;
    this.kickQueued = false;
    this.dodgeQueued = false;
    this.jumpQueued = false;
    this.jumping = false;
    this.p2JumpQueued = false;
    this.p2Jumping = false;
    this.moveCd = [0, 0, 0, 0, 0, 0];
    this.moveT = [0, 0, 0, 0, 0, 0];
    this.queuedMoves = [false, false, false, false, false, false];
    this.releaseArmed = [true, true, true, true, true, true];
    this.heavyQueued = false;
    this.launcherQueued = false;
    this.guarding = false;
    this.guardT = 0;
    this.surgeT = 0;
    this.surgeMul = 1;
    this.blitz = null;
    this.choreo = null;
    this.powerFx.clear();
    this.castScale = 1;
    this.secondWindUsed = false;
    this.flushSignalOrbs(false);
    this.signalBank.reset();
    this.engagement.reset();
    this.attackersNow = 0;
    this.spawnedThisRound = 0;
    this.iframes = 0;
    this.recoveryT = 0;
    this.interactQueued = false;
    this.raidWave = 0;
    this.raidEnemiesDown = 0;
    this.raidDealt = 0;
    this.raidTaken = 0;
    this.raidDown = false;
    this.downLeft = 0;
    this.creditSeat = -1;
    this.statLines.clear();
    this.reportRound = 0;
    this.reportLeft = 0;
    this.ensureStatLine(0, this.spec.id, 'human');
    this.pos.set(this.arena.spawnPoint.x, 0, this.arena.spawnPoint.z);
    this.yaw = Math.PI * 0.85;
    this.facing = this.yaw;
    this.pitch = 0.2;
    this.combatT = 0;
    this.abilityT = 0;
    this.sprinting = false;
    this.paused = false;
    this.mapOpen = false;
    this.phase = 'playing';
    this.rig.snap(this.pos, this.yaw, this.pitch);
    this.camReady = false;

    const [look] = await Promise.all([resolveAppearance(id), preloadHostGltf()]);
    await preloadCivilianModels(CIVILIAN_REGISTRY.map((entry) => entry.modelPath));
    if (this.disposed || token !== this.startToken) return;

    this.spec = look.spec;
    this.player = buildRyder(this.spec);
    this.scene.add(this.player.humanoid.group);
    this.powerVfx.attach(this.player, this.spec.visual);
    this.lastPos.copy(this.pos);
    this.bindKit();
    this.beacon?.reset();

    const shieldMat = new THREE.MeshBasicMaterial({
      color: 0x66e7ff,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(1.85, 20, 14), shieldMat);
    this.shield.visible = false;
    this.scene.add(this.shield);

    if (this.gameMode === GameMode.PVP && this.pvpSetup) {
      this.pvpLocalTwo = this.pvpSetup.localTwoPlayer;
      await this.spawnDuelist(this.pvpSetup.opponentId, this.pvpSetup.localTwoPlayer);
      if (this.disposed || token !== this.startToken) return;
      this.round = 0;
      this.queue = [];
      this.phase = 'playing';
      this.banner = {
        title: 'VERSUS',
        sub: this.pvpLocalTwo ? 'P2 · IJKL MOVE · U PUNCH' : 'CPU STEPS IN AND STRIKES',
      };
      this.bannerT = 2.6;
    } else if (this.gameMode === GameMode.RAID && this.raidPlan) {
      this.pvpLocalTwo = false;
      await this.spawnRaidAllies();
      if (this.disposed || token !== this.startToken) return;
      this.beginRaid();
    } else {
      this.pvpLocalTwo = false;
      this.raidPlan = null;
      this.beginRound(1);
    }
    this.foundCaches.clear();
    this.world.resetCaches?.();
    this.spawnThrowables();
    if (this.gameMode !== GameMode.PVP) {
      this.spawnStations();
      this.restockStations();
    }
  }

  /** Cooperative squad. Cleared by Solo and PvP starts. */
  setRaidPlan(plan: RaidLaunch | null) {
    this.raidPlan = plan;
  }

  /** Movement from a remote human who owns an ally slot. */
  setAllyInput(playerId: string, x: number, z: number) {
    this.allyInputs.set(playerId, { x, z, at: Date.now() });
  }

  /** Live squad bars, used by the party strip and headless checks. */
  squadProbe() {
    return {
      party: this.gameMode === GameMode.RAID && this.raidPlan ? this.partyRows() : [],
      down: this.raidDown ? { left: this.downLeft, faded: this.downLeft <= 0 } : null,
      revive: this.revivePrompt(),
      allies: this.hosts
        .filter((host) => host.ally)
        .map((host) => ({
          seat: host.seat ?? -1,
          ryderId: host.ryderId ?? null,
          hp: host.hp,
          maxHp: host.maxHp,
          aura: host.aura ?? 0,
          maxAura: host.maxAura ?? 0,
          down: host.down ?? 0,
        })),
    };
  }

  /** Land a hit on the local raider. Down rules match a civilian strike. */
  strikeSelf(amount: number) {
    this.hurtPlayer(amount, _tmp.set(0, 0, 1));
  }

  /** Read the rig after a scripted key hold. Movement must not drag the yaw. */
  debugControlProbe() {
    const look = new THREE.Vector3();
    this.camera.getWorldDirection(look);
    return {
      yaw: this.yaw,
      facing: this.facing,
      pitch: this.pitch,
      x: this.pos.x,
      z: this.pos.z,
      mode: this.cameraMode,
      lock: Boolean(this.lockTarget),
      autoLock: Boolean(this.autoTarget),
      camX: this.camera.position.x,
      camZ: this.camera.position.z,
      lookX: look.x,
      lookZ: look.z,
      weapon: this.heldThrow?.stats.kind ?? '',
      points: this.points,
      round: this.round,
      stations: this.stations.length,
      blocks: this.mapChart().length,
      paused: this.paused,
      chest: this.stations.find((station) => station.kind === 'chest') ?? null,
    };
  }

  /** Living hosts and why their last swing did or did not start. */
  debugFoes() {
    return this.hosts
      .filter((host) => host.hp > 0 && !host.ally)
      .slice(0, 8)
      .map((host) => ({
        state: host.aiState ?? '',
        dist: host.aiDist ?? 0,
        attack: host.aiAttack ?? null,
        why: host.aiWhy ?? '',
        cooldown: host.cooldown,
      }));
  }

  /** Run the sim with one key held. Headless checks use this instead of the render loop. */
  debugNudge(key: string, seconds: number) {
    const lower = key.toLowerCase();
    this.onKeyDown(new KeyboardEvent('keydown', { key: lower }));
    this.keys.add(lower);
    const dt = 1 / 60;
    const steps = Math.max(1, Math.round(Math.max(0, seconds) / dt));
    for (let i = 0; i < steps; i += 1) this.update(dt, this.simTime);
    this.keys.delete(lower);
    return this.debugControlProbe();
  }

  /** Snap the local raider onto a point. Headless water checks use this. */
  debugPlace(x: number, z: number, yaw?: number, pitch?: number) {
    const floor = this.world.heightAt(x, z);
    if (yaw !== undefined) {
      this.yaw = yaw;
      this.facing = yaw;
    }
    if (pitch !== undefined) this.pitch = pitch;
    this.pos.set(x, 0, z);
    this.airY = 0;
    this.airVel = 0;
    this.jumping = false;
    this.swim = emptySwim(floor);
    this.swimRise = 0;
    if (this.player) {
      this.player.humanoid.group.position.set(x, floor + (this.kit?.airY ?? 0), z);
    }
    this.rig.snap(this.pos, this.yaw, this.pitch);
  }

  debugWaterProbe() {
    const water = this.world.water;
    return {
      arena: this.arena.id,
      mode: this.swim.mode,
      oxygen: this.swim.oxygen,
      feet: this.player?.humanoid.group.position.y ?? this.swim.feetY,
      floor: this.world.heightAt(this.pos.x, this.pos.z),
      depth: water ? water.depthAt(this.pos.x, this.pos.z) : 0,
      surface: water ? water.surfaceAt(this.pos.x, this.pos.z) : 0,
      bounds: this.limit(),
      cameraFar: this.camera.far,
      sky: this.scene.background ? 1 : 0,
    };
  }

  /** Park a teammate on the wave so a headless check can read their feet. */
  debugPlaceAlly(x: number, z: number) {
    const ally = this.hosts.find((item) => item.ally && item.hp > 0);
    if (!ally) return null;
    ally.pos.set(x, 0, z);
    const y = this.bodyHeight(x, z, true);
    ally.fighter.humanoid.group.position.set(x, y, z);
    return { y, depth: this.waterDepth(x, z), swims: Boolean(ally.swims) };
  }

  /** Drop a terrestrial host in the water and let one step steer them. */
  debugDropCivilian(x: number, z: number) {
    const host = this.hosts.find((item) => item.hp > 0 && !item.ally && !item.duelist && !item.swims);
    if (!host || !this.world.water) return null;
    host.pos.set(x, 0, z);
    const before = this.waterDepth(x, z);
    this.driveCivilian(host, 0.35, this.simTime, false, false);
    return {
      before,
      after: this.waterDepth(host.pos.x, host.pos.z),
      y: host.fighter.humanoid.group.position.y,
      x: host.pos.x,
      z: host.pos.z,
    };
  }

  /** Step the swim controller without waiting on the render loop. */
  debugSimulateWater(seconds: number, input: { rise?: boolean; dive?: boolean; pitch?: number; moving?: boolean } = {}) {
    const steps = Math.max(1, Math.round(seconds / 0.05));
    for (let i = 0; i < steps; i += 1) {
      const column = this.waterColumn(this.pos.x, this.pos.z);
      const step = stepSwim(this.swim, column, {
        dt: 0.05,
        rise: Boolean(input.rise),
        dive: Boolean(input.dive),
        pitch: input.pitch ?? this.pitch,
        moving: Boolean(input.moving),
        aheadFloor: column?.floor ?? this.world.heightAt(this.pos.x, this.pos.z),
        aheadDepth: column?.depth ?? 0,
      });
      this.swim = step.state;
      if (this.player && (step.state.mode === 'surface' || step.state.mode === 'under')) {
        this.player.humanoid.group.position.y = step.state.feetY;
      }
    }
    return this.debugWaterProbe();
  }

  /** Damage the nearest enemy through the local raider's credit. */
  debugStrikeEnemy(amount: number) {
    const host = this.nearestHost(this.pos);
    if (!host) return false;
    this.hurtHost(host, amount, _tmp.set(0, 0, 1));
    return host.hp <= 0;
  }

  /** Damage the nearest enemy and credit that squadmate's seat. */
  debugAllyStrike(seat: number, amount: number) {
    const ally = this.hosts.find((host) => host.ally && host.seat === seat);
    if (!ally) return false;
    const foe = this.nearestHost(ally.pos);
    if (!foe) return false;
    this.creditAlly(ally, () => this.hurtHost(foe, amount, _tmp.set(0, 0, 1)));
    return foe.hp <= 0;
  }

  /** Live power-blackout clock, for headless checks. */
  powerProbe() {
    return {
      down: this.powerOut.down,
      live: this.powerOut.live,
      dry: this.powerOut.dry,
      stashed: this.powerOut.stashed,
      aura: this.aura,
      moveCd: [...this.moveCd] as [number, number, number],
      inWorld: Boolean(this.player),
    };
  }

  /** Force the random stop so a check can see the aura go dark. */
  debugCutPowers(seconds = 4) {
    this.powerOut.cutNow(seconds, this.aura);
    this.aura = 0;
    this.endAllMoves();
    this.kit?.interrupt();
  }

  /**
   * Cast Q/E/R through the real gate. Clears only the tap debounce first, so a
   * multi-second lockout still shows up as `locked`.
   */
  debugCast(slot: number) {
    if (this.moveCd[slot] !== undefined) this.moveCd[slot] = 0;
    const before = this.aura;
    this.tryMove(slot);
    const moveCd = this.moveCd[slot] ?? 0;
    return { spent: before - this.aura, aura: this.aura, moveCd, locked: moveCd > 0.45, down: this.powerOut.down };
  }

  /** Clear the wave without awarding the removed enemies as kills. */
  debugFinishRound() {
    this.queue = [];
    this.reserve = [];
    const leaving = this.hosts.filter((host) => !host.ally);
    for (const host of leaving) {
      this.scene.remove(host.fighter.humanoid.group);
      disposeObject(host.fighter.humanoid.group);
    }
    this.hosts = this.hosts.filter((host) => host.ally);
  }

  /** Point the live round number at `n` so the next clear can open that report. */
  debugSetRound(n: number) {
    if (this.gameMode === GameMode.RAID && this.raidPlan) this.raidWave = n;
    else this.round = n;
  }

  /** Skip the report hold. Safe while a round is still being fought. */
  continueReport() {
    this.closeStatBoard();
  }

  /** Copies of the squad lines, for headless checks. */
  statProbe() {
    return {
      phase: this.phase,
      round: this.reportRound,
      left: this.reportLeft,
      wave: this.gameMode === GameMode.RAID && this.raidPlan ? this.raidWave : this.round,
      enemies: this.livingEnemies(),
      lines: [...this.statLines.values()].map((line) => ({
        seat: line.seat,
        ryderId: line.ryderId,
        name: line.name,
        control: line.control,
        round: { ...line.round },
        raid: { ...line.raid },
      })),
    };
  }

  /** Land a hit on a squadmate through the same damage path enemies use. */
  strikeSquadmate(seat: number, amount: number) {
    const host = this.hosts.find((candidate) => candidate.ally && candidate.seat === seat);
    if (!host) return false;
    this.allowAllyDamage = true;
    this.hurtHost(host, amount, _tmp.set(0, 0, 1));
    this.allowAllyDamage = false;
    return true;
  }

  /** Spend a squadmate's aura so the party strip can show it leaving. */
  drainSquadmate(seat: number, amount: number) {
    const host = this.hosts.find((candidate) => candidate.ally && candidate.seat === seat);
    if (!host) return false;
    host.aura = Math.max(0, (host.aura ?? 0) - amount);
    if (host.cpu) host.cpu.aura = host.aura ?? 0;
    return true;
  }

  /** Stand inside pickup range of a downed squadmate. */
  standOnSquadmate(seat: number) {
    const host = this.hosts.find((candidate) => candidate.ally && candidate.seat === seat);
    if (!host) return false;
    this.pos.set(host.pos.x + 1.1, 0, host.pos.z);
    if (this.player) {
      this.player.humanoid.group.position.copy(this.pos);
      this.player.humanoid.group.position.y = this.world.heightAt(this.pos.x, this.pos.z);
    }
    return true;
  }

  /** Authoritative raid picture for the room server. Clients do not invent this. */
  raidReport() {
    const contributions = [{ name: this.spec?.name ?? 'You', dealt: Math.round(this.raidDealt), signal: this.signalBank.bySeat.get(this.controlledSeat) ?? 0 }];
    for (const host of this.hosts) {
      if (!host.ally || !host.ryderId) continue;
      contributions.push({ name: RYDERZ[host.ryderId].name, dealt: Math.round(host.dealt ?? 0), signal: this.signalBank.bySeat.get(host.seat ?? -1) ?? 0 });
    }
    return {
      phase: this.phase === 'victory' ? 'victory' : this.phase === 'dead' ? 'dead' : 'playing',
      wave: this.raidWave,
      waves: 0,
      enemiesLeft: this.livingEnemies() + this.queue.length + this.reserve.length,
      defeated: this.raidEnemiesDown,
      dealt: Math.round(this.raidDealt + this.hosts.reduce((sum, host) => sum + (host.ally ? host.dealt ?? 0 : 0), 0)),
      taken: Math.round(this.raidTaken),
      at: Date.now(),
      contributions,
      fighters: [
        {
          id: 'local',
          ryderId: this.spec?.id ?? null,
          name: this.spec?.name ?? 'You',
          hp: this.hp,
          maxHp: this.maxHp,
          x: this.pos.x,
          z: this.pos.z,
          ally: true,
          human: true,
        },
        ...this.hosts.map((host, index) => ({
          id: host.ally ? `ally-${host.ryderId ?? index}` : `enemy-${index}`,
          ryderId: host.ryderId ?? null,
          name: host.ryderId ? RYDERZ[host.ryderId].name : host.kind,
          hp: Math.max(0, host.hp),
          maxHp: host.maxHp,
          x: host.pos.x,
          z: host.pos.z,
          ally: Boolean(host.ally),
          human: Boolean(host.ally && host.remoteHuman),
        })),
      ],
    } as const;
  }

  /** Versus lineup. Cleared by Solo and Raid starts. */
  setPvpSetup(setup: { opponentId: RyderId; localTwoPlayer: boolean } | null) {
    this.pvpSetup = setup;
    if (!setup) this.pvpLocalTwo = false;
  }

  setPaused(value: boolean) {
    this.paused = value;
    if (value) this.mapOpen = false;
    if (value && document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
  }

  /** Open or close the full-arena map. The corner radar stays up either way. */
  toggleMap() {
    if (this.phase === 'report' || this.phase === 'dead' || this.phase === 'victory') return;
    this.mapOpen = !this.mapOpen;
    if (this.mapOpen && document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  /** Rebind the deck (slots 1 / 2 / 3 plus any open extra slots). Sustained powers that leave the deck are switched off first. */
  setLoadout(moves: AbilitySpec[]) {
    if (moves.length < 3 || moves.length > MAX_POWER_SLOTS) return;
    for (let i = 0; i < MAX_POWER_SLOTS; i += 1) {
      if (this.moveT[i] > 0 && this.moves[i]?.id !== moves[i]?.id) this.endMove(i);
    }
    this.moves = moves;
    this.moveCd = [0, 0, 0, 0, 0, 0];
    this.queuedMoves = [false, false, false, false, false, false];
    this.releaseArmed = [true, true, true, true, true, true];
  }

  /**
   * Power Tree output for the Ryder in play. The manager pushes this on attach,
   * after every unlock, and after every switch. Nothing here is persisted by
   * the engine; the manager owns the save.
   */
  setProgression(progression: {
    modifiers: PowerModifiers;
    recipes: ComboRecipe[];
    signal: SignalLedger;
    slots?: number;
    /** Rank of each power this Ryder owns; unlisted powers play at rank 1. */
    ranks?: Partial<Record<AbilityId, number>>;
  }) {
    const wasMaxHp = this.modifiers.maxHp;
    const wasMaxAura = this.modifiers.maxAura;
    this.modifiers = progression.modifiers;
    this.treeRecipes = progression.recipes;
    this.signalLedger = progression.signal;
    this.powerRanks = progression.ranks ?? {};
    this.openSlots = clamp(progression.slots ?? 3, 3, MAX_POWER_SLOTS);
    this.striker.setExtraRecipes(this.treeRecipes);
    this.striker.combo.setWindowScale(1 + this.modifiers.comboWindow);
    // Grow the bars in place so a fresh unlock is felt immediately, never a heal.
    const hpDelta = this.modifiers.maxHp - wasMaxHp;
    if (hpDelta !== 0) {
      this.maxHp = Math.max(1, this.maxHp + hpDelta);
      this.hp = clamp(this.hp + Math.max(0, hpDelta), 1, this.maxHp);
    }
    const auraDelta = this.modifiers.maxAura - wasMaxAura;
    if (auraDelta !== 0) {
      this.maxAura = Math.max(1, this.maxAura + auraDelta);
      this.aura = clamp(this.aura, 0, this.maxAura);
    }
  }

  /** Subscribe to Signal Point events. Returns the unsubscribe function. */
  setSignalHook(hook: (event: SignalEvent) => void): () => void {
    this.signalHooks.add(hook);
    return () => {
      this.signalHooks.delete(hook);
    };
  }

  /**
   * Every SP event the bank pays. The local seat's events go to the manager
   * (which persists them); every seat's events land on the Stat Board lines.
   */
  private onSignal(event: SignalEvent) {
    const line = this.statLines.get(event.seat);
    if (line) {
      line.round.signal = (line.round.signal ?? 0) + event.amount;
      line.raid.signal = (line.raid.signal ?? 0) + event.amount;
    }
    if (event.seat !== this.controlledSeat) return;
    // Mirror the manager's ledger locally so the HUD reads right before the next push.
    this.signalLedger = { ...this.signalLedger, earned: this.signalLedger.earned + event.amount };
    for (const hook of this.signalHooks) hook(event);
  }

  /** Signal Points earned since this round began, for tests and the stat board. */
  signalThisRound() {
    return this.signalBank.earnedRound;
  }

  /** Live crowd budget. Tests lower the cap; a settings panel could too. */
  crowdBudget(): CrowdBudget {
    return getCrowdBudget();
  }

  setCrowdBudget(budget: Partial<CrowdBudget>) {
    setCrowdBudget(budget);
  }

  /** Population census for the current round: planned total, spawned so far, standing now. */
  census() {
    return {
      round: this.round,
      planned: this.survivalPlan.civilians,
      total: this.survivalPlan.total,
      spawned: this.spawnedThisRound,
      queued: this.queue.length + this.reserve.length,
      alive: this.livingEnemies(),
      attackers: this.attackersNow,
    };
  }

  getLoadout(): AbilitySpec[] {
    return [...this.moves];
  }

  setGameMode(mode: GameMode) {
    // Solo and Raid keep the host waves. PvP skips them and spawns one duelist.
    this.gameMode = mode;
  }

  getGameMode() {
    return this.gameMode;
  }

  /**
   * Swap the playable Ryder mid-raid. Round, Signal and upgrades carry over;
   * Vital and aura keep their fractions so switching is never a free heal.
   */
  async switchRyder(id: RyderId, moves?: AbilitySpec[]) {
    if (this.spec.id === id && !moves) return;
    const token = ++this.switchToken;
    const { spec } = await resolveAppearance(id);
    if (this.disposed || token !== this.switchToken) return;

    this.endAllMoves();
    this.unbindKit();
    const hpFrac = this.maxHp > 0 ? this.hp / this.maxHp : 1;
    const carriedAura = this.powerOut.down ? this.powerOut.stashed : this.aura;
    const auraFrac = this.maxAura > 0 ? carriedAura / this.maxAura : 1;
    this.spec = spec;
    this.moves = moves && moves.length >= 3 ? moves.slice(0, MAX_POWER_SLOTS) : spec.moves;
    this.maxHp = spec.maxHp + this.upgrades.vitality * 25;
    this.hp = Math.max(1, this.maxHp * hpFrac);
    this.maxAura = spec.maxAura + this.upgrades.capacity * 20;
    this.aura = this.maxAura * auraFrac;
    this.powerOut = new PowerOutage(this.gameMode === GameMode.PVP);
    this.moveCd = [0, 0, 0, 0, 0, 0];
    this.moveT = [0, 0, 0, 0, 0, 0];
    this.queuedMoves = [false, false, false, false, false, false];
    this.releaseArmed = [true, true, true, true, true, true];
    this.surgeT = 0;
    this.surgeMul = 1;
    this.blitz = null;
    this.choreo = null;
    this.powerFx.clear();
    this.castScale = 1;
    this.meleeT = 0;
    this.meleeCd = 0;

    if (this.player) {
      this.scene.remove(this.player.humanoid.group);
      disposeObject(this.player.humanoid.group);
    }
    this.player = buildRyder(spec);
    this.player.humanoid.group.position.copy(this.pos);
    this.player.humanoid.group.position.y = this.world.heightAt(this.pos.x, this.pos.z);
    this.facing = this.yaw;
    this.player.humanoid.group.rotation.y = this.facing;
    this.scene.add(this.player.humanoid.group);
    this.powerVfx.attach(this.player, spec.visual);
    this.bindKit();
    if (this.controlledSeat === 0) {
      this.homeId = spec.id;
      this.homeMoves = this.moves;
    }
    this.particles.emit(this.playerAt(1.1), spec.color, 30, {
      speed: 7,
      size: 0.32,
      life: 0.6,
      up: 1.2,
    });
  }

  /** True once a fighter is in the world, so a floor change knows a match is underway. */
  matchLive() {
    return Boolean(this.player) && !this.disposed;
  }

  /**
   * Redraw the local fighter after its equipped skin changed. Only the model
   * is swapped: position, facing, vitals, cooldowns and the deck carry on.
   */
  async refreshAppearance(ids: RyderId[]) {
    if (!this.player || !ids.includes(this.spec.id)) return;
    const id = this.spec.id;
    const token = ++this.switchToken;
    const look = await resolveAppearance(id);
    if (this.disposed || token !== this.switchToken || !this.player || this.spec.id !== id) return;
    if (look.spec.glb === this.spec.glb) return;
    const previous = this.player;
    this.endAllMoves();
    this.unbindKit();
    const next = buildRyder(look.spec);
    next.humanoid.group.position.copy(previous.humanoid.group.position);
    next.humanoid.group.rotation.copy(previous.humanoid.group.rotation);
    this.scene.remove(previous.humanoid.group);
    disposeObject(previous.humanoid.group);
    this.spec = look.spec;
    this.player = next;
    this.scene.add(next.humanoid.group);
    this.powerVfx.attach(next, look.spec.visual);
    this.bindKit();
  }

  /**
   * Take over a CPU teammate. Their body, vital fraction, and seat become the
   * local fighter. The body you leave is handed to the CPU at your old seat.
   * Another human's bar is not a switch.
   */
  assumeAlly(seat: number, moves?: AbilitySpec[]) {
    const host = this.hosts.find((entry) => entry.ally && entry.seat === seat);
    if (
      !host?.ryderId ||
      !this.player ||
      !canAssumeAlly({
        raid: this.gameMode === GameMode.RAID && Boolean(this.raidPlan),
        phase: this.phase,
        seat,
        controlledSeat: this.controlledSeat,
        remoteHuman: Boolean(host?.remoteHuman),
        hp: host?.hp ?? 0,
        down: host?.down ?? 0,
      })
    ) {
      return false;
    }
    this.switchToken += 1;
    const spec = host.look ?? RYDERZ[host.ryderId];
    const leavingId = this.spec.id;
    const leavingLook = this.spec;
    const leavingSeat = this.controlledSeat;
    const leavingFighter = this.player;
    const leaving = {
      x: this.pos.x,
      z: this.pos.z,
      yaw: this.facing,
      airY: this.airY,
      airVel: this.airVel,
      hp: this.hp,
      maxHp: this.maxHp,
      aura: this.aura,
      maxAura: this.maxAura,
      down: this.raidDown ? this.downLeft : 0,
    };
    const incomingClock = host.cpu?.powerClock() ?? null;
    const leavingClock = this.powerOut.snapshot();
    const incomingDown = host.down ?? 0;
    const incoming = carriedVitals(
      { hp: host.hp, maxHp: host.maxHp, aura: host.aura ?? 0, maxAura: host.maxAura ?? spec.maxAura },
      spec.maxHp + this.upgrades.vitality * 25,
      spec.maxAura + this.upgrades.capacity * 20,
      incomingDown,
    );
    const arrived = { x: host.pos.x, z: host.pos.z, yaw: host.fighter.humanoid.group.rotation.y, airY: host.airY, airVel: host.airVel };
    const incomingFighter = host.fighter;

    this.endAllMoves();
    this.unbindKit();
    host.cpu?.dispose();
    host.cpu = undefined;
    this.hosts = this.hosts.filter((entry) => entry !== host);

    this.spec = spec;
    this.moves = moves && moves.length >= 3 ? moves.slice(0, MAX_POWER_SLOTS) : spec.moves;
    this.player = incomingFighter;
    this.controlledSeat = seat;
    this.closedSeats.delete(seat);
    this.maxHp = incoming.maxHp;
    this.hp = incoming.hp;
    this.maxAura = incoming.maxAura;
    this.aura = incoming.aura;
    if (incomingClock) this.powerOut.adopt(incomingClock);
    else this.powerOut = new PowerOutage(false);
    if (this.powerOut.down) this.aura = 0;
    this.raidDown = incomingDown > 0;
    this.downLeft = incomingDown;
    this.pos.set(arrived.x, 0, arrived.z);
    this.airY = arrived.airY;
    this.airVel = arrived.airVel;
    this.jumping = false;
    this.yaw = arrived.yaw;
    this.facing = arrived.yaw;
    this.moveCd = new Array(MAX_POWER_SLOTS).fill(0);
    this.moveT = new Array(MAX_POWER_SLOTS).fill(0);
    this.queuedMoves = new Array(MAX_POWER_SLOTS).fill(false);
    this.releaseArmed = new Array(MAX_POWER_SLOTS).fill(true);
    this.choreo = null;
    this.blitz = null;
    this.castScale = 1;
    this.meleeT = 0;
    this.meleeCd = 0;
    this.burnout = false;
    this.iframes = Math.max(this.iframes, 0.2);
    this.striker.reset();
    this.striker.setRyder(spec.id);
    const group = incomingFighter.humanoid.group;
    group.rotation.order = 'YXZ';
    group.rotation.x = 0;
    group.rotation.z = 0;
    group.rotation.y = arrived.yaw;
    group.position.set(arrived.x, this.bodyHeight(arrived.x, arrived.z, true) + (this.airY > 0 ? this.airY : 0), arrived.z);
    setHumanoidOpacity(incomingFighter.humanoid, 1);
    this.powerVfx.attach(incomingFighter, spec.visual);
    this.bindKit();
    this.rig.snap(this.pos, this.yaw, this.pitch);
    this.markSeatControl(seat, 'human');
    this.markSeatControl(leavingSeat, 'computer');

    const leftSpec = RYDERZ[leavingId];
    const leftVitals = carriedVitals(
      { hp: leaving.hp, maxHp: leaving.maxHp, aura: leaving.aura, maxAura: leaving.maxAura },
      leftSpec.maxHp,
      leftSpec.maxAura,
      leaving.down,
    );
    this.spawnAlly(leavingId, 0, null, false, leavingSeat, {
      fighter: leavingFighter,
      look: leavingLook,
      x: leaving.x,
      z: leaving.z,
      yaw: leaving.yaw,
      airY: leaving.airY,
      airVel: leaving.airVel,
      hp: leftVitals.hp,
      maxHp: leftVitals.maxHp,
      aura: leftVitals.aura,
      maxAura: leftVitals.maxAura,
      down: leaving.down,
      power: leavingClock,
    });
    this.banner = { title: spec.name.toUpperCase(), sub: 'YOU TAKE THE LEAD' };
    this.bannerT = 1.6;
    this.particles.emit(this.playerAt(1.1), spec.color, 22, { speed: 6, size: 0.28, life: 0.45, up: 1 });
    return true;
  }

  requestPointerLock() {
    if (this.mapOpen || this.paused) return;
    this.canvas.requestPointerLock();
  }

  /** Receive combat audio cues (`leo.crack.impact`, …). Nothing plays until a listener is set. */
  setSoundHook(hook: ((id: string) => void) | null) {
    this.onSound = hook;
  }

  /** Dev-only: while tuning, Escape releases the pointer without pausing the raid. */
  setTuneMode(value: boolean) {
    this.tuneMode = value;
    if (value) this.paused = false;
  }

  getCameraConfig(): CameraConfig {
    return { ...this.rig.config };
  }

  setCameraConfig(patch: Partial<CameraConfig>) {
    this.rig.setConfig(patch);
  }

  setCameraPreviewState(state: CameraState | null) {
    this.rig.forcedState = state;
  }

  getCameraSnapshot(): CameraSnapshot {
    return this.rig.snapshot();
  }

  setMoveAxis(x: number, z: number) {
    this.moveAxis.x = clamp(x, -1, 1);
    this.moveAxis.z = clamp(z, -1, 1);
  }

  setLookDelta(dx: number, dy: number) {
    this.lookAcc.x += dx;
    this.lookAcc.y += dy;
  }

  setFireHeld(value: boolean) {
    this.fireHeld = value;
  }

  queueMelee() {
    this.meleeQueued = true;
  }

  queuePunch() {
    this.punchQueued = true;
  }

  queueKick() {
    this.kickQueued = true;
  }

  queueDodge() {
    this.dodgeQueued = true;
  }

  queueJump() {
    this.jumpQueued = true;
  }

  queueAbility(slot = 1) {
    const i = Math.max(0, Math.min(MAX_POWER_SLOTS - 1, slot));
    if (i >= this.moves.length) return;
    this.queuedMoves[i] = true;
  }

  /** Sprint + punch. Touch and pad reach it directly. */
  queueHeavy() {
    this.heavyQueued = true;
  }

  /** Sprint + kick. Touch and pad reach it directly. */
  queueLauncher() {
    this.launcherQueued = true;
  }

  /** Hold to block. Touch buttons call this on press and release. */
  setGuard(on: boolean) {
    this.guardTouch = on;
  }

  buyUpgrade(id: UpgradeId) {
    const hub = this.phase === 'intermission' && this.pos.length() <= 6.2;
    const between = this.phase === 'report';
    const pausedBuy = this.paused && this.gameMode !== GameMode.PVP && this.phase !== 'dead' && this.phase !== 'victory';
    if (!hub && !between && !pausedBuy) return false;
    const level = this.upgrades[id];
    if (level >= UPGRADES[id].maxLevel) return false;
    const cost = upgradeCost(id, level);
    if (this.points < cost) return false;
    this.points -= cost;
    this.upgrades[id] += 1;
    this.upgradesBought += 1;
    this.banner = { title: UPGRADES[id].name.toUpperCase(), sub: 'RAID UPGRADE' };
    this.bannerT = 1.4;
    if (id === 'capacity') {
      this.maxAura = this.spec.maxAura + this.upgrades.capacity * 20;
      this.aura = Math.min(this.maxAura, this.aura + 28);
    }
    if (id === 'vitality') {
      this.maxHp = this.spec.maxHp + this.upgrades.vitality * 25;
      this.hp = this.maxHp;
    }
    return true;
  }

  resize() {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(w, h, false);
    this.pipeline.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.particles.setViewportHeight(h);
  }

  dispose() {
    this.flushSignalOrbs(false);
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.unbind();
    this.clearCombat();
    this.powerVfx.dispose();
    this.rings.dispose();
    this.cracks.dispose();
    this.afterimages.dispose();
    this.powerFx.dispose();
    this.signalOrbs.dispose();
    this.unloadBeacon();
    for (const world of this.worlds.values()) world.dispose();
    this.particles.dispose();
    this.pipeline.dispose();
    this.renderer.dispose();
    this.scene.clear();
  }

  private bind() {
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onPointerLock = this.onPointerLock.bind(this);
    this.onResize = this.onResize.bind(this);
    window.addEventListener('keydown', this.onKeyDown, { capture: true });
    window.addEventListener('keyup', this.onKeyUp, { capture: true });
    window.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('pointerlockchange', this.onPointerLock);
    window.addEventListener('resize', this.onResize);
    this.canvas.addEventListener('contextmenu', this.prevent);
  }

  private unbind() {
    window.removeEventListener('keydown', this.onKeyDown, { capture: true });
    window.removeEventListener('keyup', this.onKeyUp, { capture: true });
    window.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('pointerlockchange', this.onPointerLock);
    window.removeEventListener('resize', this.onResize);
    this.canvas.removeEventListener('contextmenu', this.prevent);
  }

  private prevent = (e: Event) => e.preventDefault();

  private onResize = () => this.resize();

  private onPointerLock = () => {
    this.pointerLocked = document.pointerLockElement === this.canvas;
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName;
    const inputType = (target as HTMLInputElement | null)?.type;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (tag === 'INPUT' && inputType !== 'range' && inputType !== 'checkbox') return;
    const code = e.code;
    if (
      code === 'ArrowUp' ||
      code === 'ArrowDown' ||
      code === 'ArrowLeft' ||
      code === 'ArrowRight' ||
      code === 'Space' ||
      code === 'PageUp' ||
      code === 'PageDown' ||
      code === 'Home' ||
      code === 'End'
    ) {
      e.preventDefault();
    }
    this.keys.add(e.key.toLowerCase());
    if (e.code === 'Backquote' && process.env.NODE_ENV !== 'production') {
      this.combatDebug = !this.combatDebug;
      this.ensureCombatDebug();
      if (this.debugGroup) this.debugGroup.visible = this.combatDebug;
    }
    // Menus own the keyboard while paused; only Escape reaches the raid.
    if (this.paused && e.key !== 'Escape') return;
    // The combat report owns Enter and X. Escape does not bury the board under pause.
    if (this.phase === 'report') {
      if (INTERACT_KEYS.includes(e.key.toLowerCase())) this.interactQueued = true;
      return;
    }
    const typing = (e.target as HTMLElement | null)?.tagName;
    if (typing !== 'INPUT' && typing !== 'TEXTAREA' && isMapKey(e.key, e.code, this.pvpLocalTwo)) {
      e.preventDefault();
      const live = this.phase === 'playing' || this.phase === 'intermission';
      if (this.mapOpen || live) this.toggleMap();
      return;
    }
    const lower = e.key.toLowerCase();
    if (lower === 'x') this.recenter = true;
    if (lower === 'b') this.swapShoulder();
    if (lower === 'k') this.cycleCameraMode();
    if (lower === 'g') this.toggleLock();
    if (lower === 'h') this.cycleLock();
    const rival = this.pvpLocalTwo ? commandForKey(e.key, e.code, 2) : null;
    const command = rival ?? commandForKey(e.key, e.code, 1);
    // Shift turns a light strike heavy: Shift+C is the heavy, Shift+V the launcher.
    if (command) this.queueCommand(rival ? command : withSprintModifier(command, e.shiftKey || this.keys.has('shift')), rival ? 2 : 1);
    if (INTERACT_KEYS.includes(e.key.toLowerCase())) this.interactQueued = true;
    if (e.key === 'Escape') {
      if (this.mapOpen) {
        this.mapOpen = false;
        return;
      }
      if (this.tuneMode) {
        if (document.pointerLockElement === this.canvas) document.exitPointerLock();
      } else {
        this.setPaused(true);
      }
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
    const command = commandForKey(e.key, e.code, 1);
    const slot = abilitySlotOf(command);
    if (slot >= 0) this.releaseArmed[slot] = true;
  };

  /** The slot's number key (1–6) is still down, so this press is the one that turned the power on. */
  private abilityHeld(slot: number) {
    const key = ABILITY_KEYS[slot];
    return key !== undefined && this.keys.has(key);
  }

  private onMouseMove = (e: MouseEvent) => {
    if (!this.pointerLocked) return;
    this.lookAcc.x += e.movementX;
    this.lookAcc.y += e.movementY;
  };

  private onMouseDown = (e: MouseEvent) => {
    if (this.paused || this.mapOpen) return;
    if (this.phase === 'playing' && document.pointerLockElement !== this.canvas) {
      const lock = this.canvas.requestPointerLock();
      if (lock && typeof (lock as Promise<void>).catch === 'function') void (lock as Promise<void>).catch(() => {});
    }
    if (e.button === 0) this.fireHeld = true;
    if (e.button === 1) {
      e.preventDefault();
      this.toggleLock();
    }
    if (e.button === 2) {
      e.preventDefault();
      this.meleeQueued = true;
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.fireHeld = false;
  };

  private loop() {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    let dt = Math.min(0.05, this.clock.getDelta());
    const time = this.clock.elapsedTime;
    // Hit-stop: the world crawls for a few frames so a heavy impact has weight.
    if (this.hitStopT > 0) {
      this.hitStopT = Math.max(0, this.hitStopT - dt);
      dt *= 0.06;
    }
    if (!this.paused && this.player && this.phase !== 'dead' && this.phase !== 'victory') this.update(dt, time);
    else if (this.player) this.updateCamera(dt);
    this.world.animate(time);
    this.particles.update(dt);
    this.pipeline.follow(this.player ? this.player.humanoid.group.position : this.pos);
    this.pipeline.render();
    this.emitHud();
  }

  private update(dt: number, time: number) {
    if (this.phase === 'report') {
      this.tickReport(dt);
      return;
    }
    const cam = this.rig.config;
    const sens = cam.lookSensitivity;
    const stickSens = cam.stickSensitivity;
    const invert = cam.lookInvertY >= 0.5 ? -1 : 1;
    const stick = this.readLookStick();
    const keyLeft = this.keys.has('a');
    const keyRight = this.keys.has('d');
    const keyUp = this.keys.has('w');
    const keyDown = this.keys.has('s');
    const manualLook =
      keyLeft ||
      keyRight ||
      keyUp ||
      keyDown ||
      Math.abs(this.lookAcc.x) + Math.abs(this.lookAcc.y) + Math.abs(stick.x) + Math.abs(stick.y) > 0.001;
    if (manualLook) {
      this.recenter = false;
      this.lockTarget = null;
      this.lookIdle = 0;
    } else {
      this.lookIdle += dt;
    }
    this.yaw -= this.lookAcc.x * 0.0031 * sens + stick.x * STICK_YAW_RATE * dt * stickSens;
    this.yaw += keyboardYawDelta(keyLeft, keyRight, dt);
    this.pitch = clamp(
      this.pitch -
        (this.lookAcc.y * 0.0024 * sens + stick.y * STICK_PITCH_RATE * dt * stickSens) * invert +
        keyboardPitchDelta(keyUp, keyDown, dt, invert),
      cam.pitchMin,
      cam.pitchMax,
    );
    this.lookAcc.x = 0;
    this.lookAcc.y = 0;
    this.stepLockOn(dt);
    this.stepAutoLock(dt);
    if (this.recenter) {
      const home = 0.2;
      this.pitch += (home - this.pitch) * (1 - Math.exp(-dt / 0.16));
      if (Math.abs(this.pitch - home) < 0.012) this.recenter = false;
    }
    if (this.stormT > 0) {
      this.stormT = Math.max(0, this.stormT - dt);
      if (this.stormT > 0 && Math.random() < dt * 3) this.rig.addShake(0.22);
    }
    this.combatT = Math.max(0, this.combatT - dt);
    this.abilityT = Math.max(0, this.abilityT - dt);
    this.pvpHitKindT = Math.max(0, this.pvpHitKindT - dt);

    this.fireCd = Math.max(0, this.fireCd - dt);
    this.meleeCd = Math.max(0, this.meleeCd - dt);
    this.iframes = Math.max(0, this.iframes - dt);
    if (!this.striker.busy && this.meleeT > 0) this.meleeT = Math.max(0, this.meleeT - dt * 3.4);
    for (let i = 0; i < MAX_POWER_SLOTS; i += 1) {
      this.moveCd[i] = Math.max(0, this.moveCd[i] - dt);
    }
    if (this.surgeT > 0) {
      this.surgeT = Math.max(0, this.surgeT - dt);
      if (this.surgeT <= 0) this.surgeMul = 1;
      else this.surgeParticles(dt);
    }
    this.stepChoreo();
    this.stepBlitz(dt);
    if (this.bannerT > 0) {
      this.bannerT = Math.max(0, this.bannerT - dt);
      if (this.bannerT <= 0) this.banner = null;
    }

    const footX = this.pos.x;
    const footZ = this.pos.z;
    const footFloor = this.world.heightAt(footX, footZ);
    this.updateRecovery(dt);
    this.updateAura(dt);
    this.simTime += dt;
    this.scheduler.update(this.simTime);
    if (this.kit) {
      const wish = this.readMoveAxes();
      const moving = wish.len > 0.05;
      this.kit.update({
        dt,
        time: this.simTime,
        speed: this.playerSpeed,
        sprinting: this.sprinting,
        moving,
        aura: this.aura,
        maxAura: this.maxAura,
        burnout: this.burnout,
        powersDown: this.powerOut.down,
        ascend: this.keys.has(' '),
        descend: this.keys.has('control'),
        boost: this.keys.has('shift'),
        stunned: this.hitStun > 0.12,
      });
      this.striker.setFork(this.kit.forkArmed ?? false);
    } else this.striker.setFork(false);
    this.updatePlayerMove(dt, time, footX, footZ, footFloor);
    this.world.stepTrail?.(this.pos.x, this.pos.z);
    this.markExplored(this.pos.x, this.pos.z);
    this.kickSand(dt, footFloor);
    const recovering = this.recoveryT > 0;
    const locked = recovering || this.bodyLocked();
    // Busy hands (weapon thrown, spinning): only the power that is on may be
    // pressed, to switch it off.
    const busy = this.kit?.busy ?? false;
    for (let i = 0; i < this.moves.length; i += 1) {
      if (this.queuedMoves[i]) {
        this.queuedMoves[i] = false;
        const release = this.moves[i]?.id === this.kit?.releaseId;
        if (!locked && (!busy || this.moveT[i] > 0 || release)) this.tryMove(i);
      }
    }
    this.pollPad();
    if (this.fireHeld && !this.fireEdge) {
      this.fireEdge = true;
      // Click near a crowd and the Ryder swings instead of shooting. The reach
      // matches the punch lunge so a crowd three metres out is still a fist fight.
      const near = this.nearestHost(this.pos);
      const close = near ? Math.hypot(near.pos.x - this.pos.x, near.pos.z - this.pos.z) < 3.4 : false;
      if (close) {
        if (this.sprinting) this.heavyQueued = true;
        else this.punchQueued = true;
        this.suppressFire = true;
      }
    } else if (!this.fireHeld) {
      this.fireEdge = false;
      this.suppressFire = false;
    }
    this.stepPhysical(dt, locked, busy);
    this.presentPlayer(dt, time);
    if (this.fireHeld && !this.suppressFire && !locked && !busy) this.tryFire();
    if (this.interactQueued) {
      this.interactQueued = false;
      this.tryInteract();
    }

    this.updateClones(dt);
    this.tickSquadDown(dt);
    this.updateHosts(dt, time);
    if (this.heldThrow && this.throwables) {
      const socket = this.player?.rig?.weaponSocket;
      if (socket) this.throwables.grip(this.heldThrow, socket, 0);
      else {
        this.throwables.holdPosition(
          this.heldThrow,
          this.pos.x + Math.sin(this.yaw) * 0.62,
          1.15 + this.airY,
          this.pos.z + Math.cos(this.yaw) * 0.62,
        );
      }
    }
    this.throwables?.update(
      dt,
      this.simTime,
      (x, z) => this.world.heightAt(x, z),
      (item, point) => this.resolveThrowImpact(item, point),
      (item, point) => this.shatterProp(item, point),
    );
    this.updateCombatDebug();
    this.updateFallen(dt);
    this.updateBolts(dt);
    this.updateRound(dt);
    this.updateCamera(dt);
    this.rings.update(dt);
    this.cracks.update(dt);
    this.afterimages.update(dt);
    this.powerFx.update(dt, this.camera);
    this.stepSignalOrbs(dt, time);
    this.beacon?.update(dt, time, this.pos, this.spec.visual.auraColor, this.camera);
    this.powerVfx.update(dt, time, this.aura, this.maxAura, !this.burnout && !this.powerOut.down, this.camera);
  }

  // ---------------------------------------------------------------------------
  // Arena + Ryder Beacon
  // ---------------------------------------------------------------------------

  /**
   * Point the raid at an arena. The city stays loaded. Training P.A.D. is
   * built the first time it is selected, then the two groups swap visibility.
   * The Beacon is rebuilt at that arena's fixed point.
   */
  loadArena(id: ArenaId, options?: { restart?: boolean }) {
    const def = arenaSpec(id) ?? arenaSpec(DEFAULT_ARENA)!;
    const restart = Boolean(options?.restart && this.player);
    this.arena = def;
    const key = def.worldKey ?? 'block';
    let next = this.worlds.get(key);
    if (!next && key === 'pad') {
      next = buildPadWorld();
      this.worlds.set('pad', next);
      this.scene.add(next.group);
    }
    if (!next && key === 'island') {
      next = buildIslandWorld();
      this.worlds.set('island', next);
      this.scene.add(next.group);
    }
    if (!next && key === 'riverdale') {
      next = buildRiverdaleWorld();
      this.worlds.set('riverdale', next);
      this.scene.add(next.group);
    }
    if (!next) next = this.worlds.get('block') ?? this.world;
    if (next !== this.world) {
      const previous = this.world;
      previous.group.visible = false;
      next.group.visible = true;
      this.world = next;
      this.explored.fill(0);
      this.scene.updateMatrixWorld(true);
      this.rig.setOccluders(this.world.occluders);
      this.pipeline.useLights(next.group);
      // The big outdoor arenas are rebuilt on demand rather than kept hidden.
      for (const heavy of ['island', 'riverdale'] as const) {
        const world = this.worlds.get(heavy);
        if (!world || previous !== world || next === world) continue;
        this.pipeline.forgetLights(world.group);
        untrackInstances(world.group);
        this.scene.remove(world.group);
        world.dispose();
        this.worlds.delete(heavy);
      }
      this.foundCaches.clear();
      this.world.resetCaches?.();
      this.spawnThrowables();
    }
    const atmosphere = this.pipeline.apply(key);
    this.aboveFog.setHex(atmosphere.fog.color);
    this.aboveDensity = atmosphere.fog.density;
    this.unloadBeacon();
    const point = def.ryderBeaconPoint;
    const position = new THREE.Vector3(point.x, this.world.heightAt(point.x, point.z), point.z);
    this.beacon = new RyderBeacon(position, this.particles, { cooldownDuration: def.beaconCooldown });
    this.scene.add(this.beacon.group);
    const floor = this.world.heightAt(def.spawnPoint.x, def.spawnPoint.z);
    this.swim = emptySwim(floor);
    this.swimRise = 0;
    if (restart) {
      void this.restartMatch();
      return;
    }
    if (this.player) {
      this.pos.set(def.spawnPoint.x, 0, def.spawnPoint.z);
      this.player.humanoid.group.position.copy(this.pos);
      this.player.humanoid.group.position.y = floor + (this.kit?.airY ?? 0);
      this.facing = this.yaw;
      this.rig.snap(this.pos, this.yaw, this.pitch);
      for (const host of this.hosts) {
        if (host.hp <= 0) continue;
        const alley = this.spawnAlley();
        host.swims = Boolean(host.ally || host.duelist || alley.aquatic);
        host.pos.copy(alley.position);
        host.fighter.humanoid.group.position.copy(host.pos);
        host.fighter.humanoid.group.position.y = this.bodyHeight(host.pos.x, host.pos.z, Boolean(host.swims));
        this.paintTraining(host, Boolean(this.world.training));
      }
      if (def.id === 'training-pad') {
        this.banner = { title: 'TRAINING P.A.D.', sub: 'JAB VISIONS · PARANORMAL ACTIVITY DIVISION' };
        this.bannerT = 3.2;
      } else if (def.id === 'island-paradise') {
        this.banner = { title: 'ISLAND PARADISE', sub: 'BEACHES · JUNGLE · OPEN WATER' };
        this.bannerT = 3.2;
      } else if (this.banner?.title === 'ISLAND PARADISE') {
        this.banner = null;
        this.bannerT = 0;
      }
    }
  }

  getArena(): ArenaDefinition {
    return this.arena;
  }

  /** Start the current mode over on the floor that is already loaded. */
  async restartMatch() {
    const id = this.homeId ?? this.spec?.id;
    if (!id || !this.player) return;
    this.paused = false;
    this.mapOpen = false;
    await this.start(id, this.homeMoves ?? undefined);
  }

  /** Read-only view of the Beacon for menus; null when the arena has none. */
  getBeaconState(): BeaconHudState | null {
    return this.beacon ? this.beacon.hudState(this.clock.elapsedTime, this.pos) : null;
  }

  /** Touch / menu entry point for the interact control. */
  queueInteract() {
    this.interactQueued = true;
  }

  private unloadBeacon() {
    if (!this.beacon) return;
    this.scene.remove(this.beacon.group);
    this.beacon.dispose();
    this.beacon = null;
  }

  private tryInteract() {
    if (!this.player || this.phase === 'dead' || this.raidDown) return;
    if (this.pickupNearestAlly()) return;
    if (this.recoveryT > 0 || this.bodyLocked()) return;
    const beacon = this.beacon;
    if (this.tryFieldStation()) return;
    if (!beacon || !beacon.isPlayerInRange(this.pos)) {
      if (this.trySimConsole()) return;
      this.tryPickup();
      return;
    }
    const time = this.clock.elapsedTime;
    const chest = this.player.rig?.skeleton?.bone('chest') ?? this.player.humanoid.torso;
    if (!beacon.activate(time, { object: chest, offset: new THREE.Vector3() }, this.spec.visual.auraColor)) return;

    // Recovery: the Ryder holds still while the Beacon pours energy back in.
    // Bars ramp over the sequence (so the HUD visibly fills) and land on max.
    this.recoveryT = RECOVERY_DURATION;
    this.recoveryFrom = { hp: this.hp, aura: this.powerOut.down ? this.powerOut.stashed : this.aura };
    this.powerOut.resume(this.gameMode === GameMode.PVP);
    this.kit?.interrupt();
    this.burnout = false;
    this.iframes = Math.max(this.iframes, RECOVERY_DURATION + 0.3);
    this.abilityT = Math.max(this.abilityT, RECOVERY_DURATION);
    this.fireHeld = false;
    this.rig.addKick(0.25);
  }

  private trySimConsole() {
    const pads = this.world.interactives;
    if (!pads?.length || !this.world.toggleBarriers) return false;
    for (const pad of pads) {
      const dx = pad.x - this.pos.x;
      const dz = pad.z - this.pos.z;
      if (dx * dx + dz * dz > 2.4 * 2.4) continue;
      const open = this.world.toggleBarriers();
      this.banner = {
        title: open ? 'BARRIERS DOWN' : 'SIMULATION LIVE',
        sub: 'P.A.D. TRAINING',
      };
      this.bannerT = 2.2;
      return true;
    }
    return false;
  }

  private updateRecovery(dt: number) {
    if (this.recoveryT <= 0) return;
    this.recoveryT = Math.max(0, this.recoveryT - dt);
    const p = 1 - this.recoveryT / RECOVERY_DURATION;
    const eased = p * p * (3 - 2 * p);
    this.hp = Math.max(this.hp, this.recoveryFrom.hp + (this.maxHp - this.recoveryFrom.hp) * eased);
    this.aura = Math.max(this.aura, this.recoveryFrom.aura + (this.maxAura - this.recoveryFrom.aura) * eased);
    this.burnout = false;
    if (this.recoveryT <= 0) {
      this.hp = this.maxHp;
      this.aura = this.maxAura;
      // Finish: a bright surge across the Ryder and a shock ring from the feet.
      this.powerVfx.surge(1.2);
      this.rig.addShake(0.16);
      this.particles.emit(this.playerAt(0.3), this.spec.visual.electricityColor, 26, {
        speed: 9,
        size: 0.3,
        life: 0.5,
        up: 0.25,
        gravity: 2,
      });
    }
  }

  private updateAura(dt: number) {
    if (this.raidDown) return;
    if (this.phase === 'playing' && this.recoveryT <= 0) {
      const shift = this.powerOut.step(dt, this.gameMode === GameMode.PVP, this.aura);
      if (shift.cut) {
        this.aura = 0;
        this.endAllMoves();
        this.kit?.interrupt();
        this.banner = { title: 'POWERS OUT', sub: 'Melee only · get clear of the hosts' };
        this.bannerT = 2.6;
        this.particles.emit(this.playerAt(1.1), 0x8899aa, 16, { speed: 3.2, size: 0.22, life: 0.4, up: 0.6 });
        return;
      }
      if (shift.back) {
        this.aura = Math.min(this.maxAura, shift.aura);
        this.burnout = this.aura <= 0.01;
        if (this.aura >= this.maxAura * BURNOUT_RECOVERY) this.burnout = false;
        this.banner = { title: 'POWERS BACK', sub: 'Aura is live' };
        this.bannerT = 1.6;
        this.powerVfx.surge(1);
      } else if (this.powerOut.down) {
        this.aura = 0;
        return;
      }
    }
    let drain = 0;
    for (let i = 0; i < this.moves.length; i += 1) {
      if (this.moveT[i] > 0) drain += this.moves[i].drain;
    }
    if (drain > 0) {
      this.spendAura(drain * dt);
      if (this.burnout || this.aura <= 0) this.endAllMoves();
    } else if (!this.kit?.flying) {
      const regen =
        this.spec.auraRegen * (1 + this.modifiers.auraRegen) +
        this.upgrades.capacity * 1.2 +
        (this.phase === 'intermission' ? 8 : 0);
      const using = this.fireHeld;
      const rate = this.burnout ? regen * 0.5 : using ? regen * 0.12 : regen;
      this.aura = Math.min(this.maxAura, this.aura + rate * dt);
      if (this.burnout && this.aura >= this.maxAura * BURNOUT_RECOVERY) {
        this.burnout = false;
      }
    }
    if (this.isActive('lift') && !this.kitClaimed.has('lift')) this.liftHosts(0.4);
  }

  private spendAura(amount: number) {
    if (this.powerOut.down) return;
    this.aura = Math.max(0, this.aura - amount);
    if (this.aura <= 0.01) {
      this.aura = 0;
      this.burnout = true;
      this.particles.emit(this.muzzle(), 0x8899aa, 18, { speed: 4, size: 0.28, life: 0.45, up: 0.4 });
    }
  }

  /**
   * Cliffs and hillsides stop the body. A walkable trail still climbs, and a
   * lip that is too steep to walk becomes a fall so the feet never teleport
   * through the ground.
   */
  private holdGround(fromX: number, fromZ: number, fromFloor: number) {
    if (this.kit?.flying || this.isPhased() || this.kit?.passthrough) return;
    if (this.swim.mode === 'surface' || this.swim.mode === 'under') return;
    const clearance = STEP_HEIGHT + Math.max(0, this.airY);
    const floor = resolveFooting((x, z) => this.world.heightAt(x, z), this.pos, fromX, fromZ, fromFloor, clearance);
    this.pos.x = clamp(this.pos.x, -this.limit(), this.limit());
    this.pos.z = clamp(this.pos.z, -this.limit(), this.limit());
    const run = Math.hypot(this.pos.x - fromX, this.pos.z - fromZ);
    const airborne = this.airY > 0.05 || this.airVel > 0.2 || this.jumping;
    const feet = fromFloor + Math.max(0, this.airY);
    if (!airborne && ledgeDrop(feet, floor, run)) {
      this.airY = feet - floor;
      this.airVel = Math.min(0, this.airVel);
      this.jumping = true;
    }
  }

  /** City keeps its old edge. Larger arenas publish their own. */
  private limit() {
    return this.world.bounds ?? BOUNDARY;
  }

  private waterDepth(x: number, z: number) {
    return this.world.water?.depthAt(x, z) ?? 0;
  }

  /** Feet on the floor, or just under the wave when the body is in deep water. */
  private bodyHeight(x: number, z: number, swims: boolean) {
    const floor = this.world.heightAt(x, z);
    const water = this.world.water;
    if (!water) return floor;
    const depth = water.depthAt(x, z);
    if (depth <= (swims ? 0.9 : 1.05)) return floor;
    return Math.max(floor + 0.05, water.surfaceAt(x, z) - 1.05);
  }

  private waterColumn(x: number, z: number): WaterColumn | null {
    const water = this.world.water;
    if (!water || this.kit?.flying) return null;
    const floor = this.world.heightAt(x, z);
    return { floor, surface: water.surfaceAt(x, z), depth: water.depthAt(x, z) };
  }

  private waterDrag() {
    if (this.swim.mode === 'wade') return 0.68;
    if (this.swim.mode === 'surface') return 0.62;
    if (this.swim.mode === 'under') return 0.74;
    return 1;
  }

  /** Buoyancy, dive, and the slow drown that starts only after the air is gone. */
  private settleSwim(dt: number, moving: boolean) {
    const column = this.waterColumn(this.pos.x, this.pos.z);
    const aheadX = this.pos.x + Math.sin(this.facing) * 1.6;
    const aheadZ = this.pos.z + Math.cos(this.facing) * 1.6;
    const rise = this.swimRise > 0 || this.keys.has(' ');
    if (this.swimRise > 0) this.swimRise = Math.max(0, this.swimRise - dt);
    const step = stepSwim(this.swim, column, {
      dt,
      rise,
      dive: this.keys.has('control'),
      pitch: this.pitch,
      moving,
      aheadFloor: this.world.heightAt(aheadX, aheadZ),
      aheadDepth: column ? this.waterDepth(aheadX, aheadZ) : 0,
    });
    this.swim = step.state;
    if (step.exited && step.state.feetY > this.world.heightAt(this.pos.x, this.pos.z) + 0.35) {
      this.pos.x = clamp(aheadX, -this.limit(), this.limit());
      this.pos.z = clamp(aheadZ, -this.limit(), this.limit());
      resolveCircle(this.pos, this.playerRadius(), this.world.obstacles);
    }
    if (step.entered && column) {
      this.airY = 0;
      this.airVel = 0;
      this.jumping = false;
      this.particles.emit(new THREE.Vector3(this.pos.x, column.surface, this.pos.z), 0xcfefff, 16, {
        speed: 3.4,
        size: 0.16,
        life: 0.45,
        up: 1.5,
      });
    }
    if (this.swim.mode === 'surface' || this.swim.mode === 'under') {
      this.airY = 0;
      this.airVel = 0;
      this.jumping = false;
    }
    if (step.submerged && moving) {
      this.particles.emit(new THREE.Vector3(this.pos.x, this.swim.feetY + 1.05, this.pos.z), 0xd7f6ff, 2, {
        speed: 1.1,
        size: 0.08,
        life: 0.55,
        up: 1.6,
      });
    } else if (this.swim.mode === 'surface' && moving && column) {
      this.particles.emit(new THREE.Vector3(this.pos.x, column.surface + 0.04, this.pos.z), 0xe7f7ff, 1, {
        speed: 0.35,
        size: 0.2,
        life: 0.32,
        up: 0.04,
      });
    }
    if (step.hurt > 0 && this.hp > 0 && this.phase !== 'dead' && !this.raidDown) {
      this.hp = Math.max(0, this.hp - step.hurt);
      if (this.hp <= 0) {
        this.hp = 1;
        this.iframes = 0;
        this.hurtPlayer(1, _tmp.set(0, 0, 0));
      }
    }
  }

  /** Mark a patch of the island chart as walked. The grid matches the full arena span. */
  private markExplored(x: number, z: number) {
    if (this.arena.worldKey !== 'island') return;
    const span = Math.max(8, this.limit());
    const cell = (span * 2) / this.exploreN;
    const ix = Math.floor((x + span) / cell);
    const iz = Math.floor((z + span) / cell);
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const cx = ix + dx;
        const cz = iz + dz;
        if (cx < 0 || cz < 0 || cx >= this.exploreN || cz >= this.exploreN) continue;
        this.explored[cz * this.exploreN + cx] = 1;
      }
    }
  }

  /** A short scuff on dry island sand while sprinting. Kept sparse so the beach does not fill with sprites. */
  private kickSand(dt: number, floor: number) {
    if (this.arena.worldKey !== 'island' || !this.sprinting || floor < 0.15 || floor > 1.8) return;
    if (this.waterDepth(this.pos.x, this.pos.z) > 0.08) return;
    this.sandT -= dt;
    if (this.sandT > 0) return;
    this.sandT = 0.16;
    this.particles.emit(this.pos.clone().setY(floor + 0.05), 0xd9c48a, 3, { speed: 1.3, size: 0.07, life: 0.26, up: 0.35 });
  }

  private updatePlayerMove(dt: number, time: number, footX: number, footZ: number, footFloor: number) {
    if (!this.player) return;
    if (this.raidDown) return;
    const phased = this.isPhased();
    const locked = this.bodyLocked();

    const wish = this.readMoveAxes();
    let x = wish.x;
    let z = wish.z;
    if (this.simTime > this.suppressUntil) this.suppress = 1;
    if (this.recoveryT > 0 || locked || this.pvpCpu?.grabsPlayer() || this.stasis > 0) {
      x = 0;
      z = 0;
    }
    const len = Math.hypot(x, z);
    const busy = this.kit?.busy ?? false;
    this.sprinting = this.keys.has('shift') && len > 0.1 && !this.fireHeld && this.meleeT <= 0 && !busy;
    let speed =
      this.spec.speed *
      (this.sprinting ? SPRINT_MULTIPLIER : 1) *
      (this.burnout ? 0.82 : 1) *
      (this.kit?.moveScale ?? 1) *
      this.suppress *
      this.waterDrag();
    if (this.hitStun > 0.05) speed *= 0.22;

    const move = cameraRelativeVelocity(this.yaw, x, -z);
    _tmp.set(move.x, 0, move.z);
    if (this.dodgeT > 0) {
      _tmp.set(this.dodgeX, 0, this.dodgeZ);
      speed = 15;
    } else if (_tmp.lengthSq() > 0) _tmp.normalize();
    this.pos.addScaledVector(_tmp, speed * dt);
    this.hitKnock.multiplyScalar(Math.max(0, 1 - dt * 5));
    this.pos.addScaledVector(this.hitKnock, dt);
    this.pos.x = clamp(this.pos.x, -this.limit(), this.limit());
    this.pos.z = clamp(this.pos.z, -this.limit(), this.limit());
    resolveCircle(this.pos, this.playerRadius(), this.world.obstacles);
    this.holdGround(footX, footZ, footFloor);

    // Hosts shoulder the Ryder aside, except while a kit sequence is carrying
    // her through them (dashes decide their own contact).
    if (!phased && !locked && !this.kit?.passthrough) {
      for (const host of this.hosts) {
        const dx = this.pos.x - host.pos.x;
        const dz = this.pos.z - host.pos.z;
        const min = this.playerRadius() + host.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) * (host.mass / (host.mass + 1));
        this.pos.x += (dx / d) * push * 0.35;
        this.pos.z += (dz / d) * push * 0.35;
      }
      resolveCircle(this.pos, this.playerRadius(), this.world.obstacles);
      this.holdGround(footX, footZ, footFloor);
    }

    // Horizontal speed for the kit's speed effects (measured, not commanded,
    // so dashes count too).
    this.playerSpeed = dt > 0 ? Math.hypot(this.pos.x - this.lastPos.x, this.pos.z - this.lastPos.z) / dt : 0;
    if (dt > 0) this.playerVel.set((this.pos.x - this.lastPos.x) / dt, 0, (this.pos.z - this.lastPos.z) / dt);
    else this.playerVel.set(0, 0, 0);
    const nearest = this.nearestHost(this.pos);
    if (nearest && this.playerSpeed > 3.2 && this.simTime > this.retreatNote) {
      const awayX = this.pos.x - nearest.pos.x;
      const awayZ = this.pos.z - nearest.pos.z;
      const away = Math.hypot(awayX, awayZ) || 1;
      const leaving = (this.playerVel.x * awayX + this.playerVel.z * awayZ) / away;
      if (leaving > 1.4) {
        this.combatMemory.note('retreat', this.simTime);
        this.retreatNote = this.simTime + 0.45;
      }
    }
    this.lastPos.copy(this.pos);
    this.locomote = Math.min(1, len);
    this.settleSwim(dt, len > 0.12);

    this.player.humanoid.group.position.copy(this.pos);
    const swimming = this.swim.mode === 'surface' || this.swim.mode === 'under';
    const bodyScale = this.roofScale(this.pos.x, this.pos.z, this.kit?.bodyScale ?? 1);
    this.player.humanoid.group.position.y = swimming ? this.swim.feetY : this.standY(bodyScale);
    this.player.humanoid.group.rotation.y = this.facing + (this.kit?.bodyYaw ?? 0);
    if (Math.abs(this.player.humanoid.group.scale.x - bodyScale) > 0.0001) {
      this.player.humanoid.group.scale.setScalar(bodyScale);
    }

    if (this.shield) {
      this.shield.visible = this.isActive('forcefield') && !this.kitClaimed.has('forcefield');
      this.shield.position.copy(this.pos).setY(this.feetY() + 1.1);
      this.shield.rotation.y = time * 1.4;
      const pulse = 1 + Math.sin(time * 8) * 0.04;
      this.shield.scale.setScalar(pulse);
    }

    const camFade = 0.12 + 0.88 * this.rig.getCharacterVisibility();
    // A kit owns its own translucency (and always restores 1 when it is done);
    // the generic phase fade only applies to a Ryder without one.
    const kitOpacity = this.kit?.opacity ?? 1;
    const genericFade = phased && !this.kit ? 0.28 : 1;
    setHumanoidOpacity(this.player.humanoid, Math.min(kitOpacity, genericFade, camFade));
    // Kit-driven body glow (phasing, charging). Written every frame while lit and
    // once more when it goes out so the materials never keep a stale tint.
    const kitGlow = this.powerOut.down ? 0 : (this.kit?.glow ?? 0);
    if (kitGlow > 0 || this.playerGlow > 0) {
      flashEmissive(this.player.humanoid, kitGlow > 0 ? this.spec.visual.auraColor : 0x000000, kitGlow * 0.9);
      this.playerGlow = kitGlow;
    }
    if (phased && !this.kit) {
      this.particles.emit(this.playerAt(1), this.spec.color, 1, {
        speed: 1.4,
        size: 0.18,
        life: 0.35,
        up: 0.8,
      });
    }
  }

  /**
   * Run direction turns the body, including a run back toward the camera.
   * Aiming, striking, and abilities square the body up to the view. The view
   * itself stays where the player left it.
   */
  private stepFacing(dt: number) {
    const committed =
      this.fireHeld ||
      this.meleeT > 0 ||
      this.dodgeT > 0 ||
      (this.kit?.busy ?? false) ||
      this.bodyLocked();
    let target = this.facing;
    if (this.dodgeT > 0) target = Math.atan2(this.dodgeX, this.dodgeZ);
    else if (committed) target = this.yaw;
    else if (this.locomote > 0.12) {
      const vx = this.playerVel.x;
      const vz = this.playerVel.z;
      if (vx * vx + vz * vz > 0.35) target = Math.atan2(vx, vz);
    }
    return stepYaw(this.facing, target, committed ? 16 : 11, dt);
  }

  /** Pose runs after the strike window so the fist and the hit share a frame. */
  private presentPlayer(dt: number, time: number) {
    if (!this.player) return;
    if (this.raidDown) {
      this.presentDownedFighter(this.player, this.downLeft, dt);
      return;
    }
    this.player.humanoid.group.rotation.x = 0;
    const moving = this.locomote;
    this.facing = this.stepFacing(dt);
    this.player.humanoid.group.rotation.y = this.facing + (this.kit?.bodyYaw ?? 0);
    this.anim += dt * (8 + moving * (this.sprinting ? 9 : 6));
    const swimPose: PoseOverride | null =
      this.swim.mode === 'surface' || this.swim.mode === 'under'
        ? { kind: 'swim', t: (time % 1.15) / 1.15, weight: 1 }
        : null;
    if (this.player.meshSource === 'gltf') {
      const token = this.kit?.clipToken ?? -1;
      const hinted = token !== this.clipTokenSeen && Boolean(this.kit?.clipHint);
      if (token !== this.clipTokenSeen) this.clipTokenSeen = token;
      animateGltfFighter(this.player, dt, this.anim, moving, this.sprinting, this.meleeT, this.meleeStarted || hinted, {
        pose: this.powerPose() ?? this.kit?.pose ?? swimPose ?? this.jumpPose(),
        style: this.strikeOverride ?? undefined,
        clipHint: hinted ? this.kit?.clipHint ?? undefined : undefined,
        clipSeconds: hinted ? this.kit?.clipSeconds : undefined,
        camera: this.camera,
      });
      this.meleeStarted = false;
      this.strikeOverride = null;
    } else {
      animateHumanoid(this.player.humanoid, this.anim, moving, time);
      if (swimPose) this.player.humanoid.group.rotation.x = this.swim.mode === 'under' ? 1.05 : 0.9;
      else if (this.meleeT > 0) poseMelee(this.player.humanoid, 1 - this.meleeT);
      else poseAim(this.player.humanoid, this.pitch);
      this.player.orbs?.update(dt, this.camera);
    }
  }

  private faceNearest(range: number) {
    const near = this.nearestHost(this.pos);
    if (!near) return;
    const dx = near.pos.x - this.pos.x;
    const dz = near.pos.z - this.pos.z;
    if (dx * dx + dz * dz > range * range) return;
    this.facing = Math.atan2(dx, dz);
  }

  private tryFire() {
    if (!this.player || this.burnout || this.powerOut.down || this.fireCd > 0) return;
    // Plasma balls belong to Zoe. Keven looses an arrow. The other Ryderz stay in melee.
    if (this.spec.id === 'keven') {
      const volleyCost = this.spec.shotCost;
      if (this.aura < volleyCost) {
        this.spendAura(this.aura);
        return;
      }
      if (!this.kit?.rangedShot?.(this.shotDamage())) return;
      this.fireCd = 1 / this.spec.fireRate;
      this.spendAura(volleyCost);
      this.combatT = COMBAT_LINGER;
      return;
    }
    if (this.spec.id !== 'zoe') return;
    const volleyCost = this.spec.shotCost;
    if (this.aura < volleyCost) {
      this.spendAura(this.aura);
      return;
    }
    this.fireCd = 1 / this.spec.fireRate;
    this.spendAura(volleyCost);
    this.combatT = COMBAT_LINGER;
    this.lookDir(_look);
    _right.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const origin = this.muzzle();
    const dmg = this.shotDamage();
    const count = this.spec.projectileCount;
    for (let i = 0; i < count; i += 1) {
      const dir = _tmp.copy(_look);
      if (count > 1 || this.spec.spread > 0) {
        const spread = this.spec.spread + (count > 1 ? ((i - (count - 1) / 2) * this.spec.spread) / Math.max(count - 1, 1) : 0);
        dir.addScaledVector(_right, spread * 3);
        dir.normalize();
      }
      this.spawnBolt(origin, dir, dmg, true, this.spec.color, this.spec.projectileSpeed);
    }
    this.particles.emit(origin, this.spec.color, 6, {
      speed: 8,
      size: 0.22,
      life: 0.25,
      direction: _look,
    });
  }

  private queueCommand(command: CombatCommand, player: 1 | 2) {
    if (player === 2) {
      if (command === 'punch') this.p2PunchQueued = true;
      if (command === 'kick') this.p2KickQueued = true;
      if (command === 'melee') this.p2MeleeQueued = true;
      if (command === 'dodge') this.p2DodgeQueued = true;
      if (command === 'jump') this.p2JumpQueued = true;
      return;
    }
    if (command === 'punch') this.punchQueued = true;
    if (command === 'kick') this.kickQueued = true;
    if (command === 'heavy') this.heavyQueued = true;
    if (command === 'launcher') this.launcherQueued = true;
    if (command === 'melee') this.meleeQueued = true;
    if (command === 'dodge') this.dodgeQueued = true;
    if (command === 'jump') this.jumpQueued = true;
    const slot = abilitySlotOf(command);
    if (slot >= 0 && slot < this.moves.length) this.queuedMoves[slot] = true;
  }

  private connectedPad() {
    const pads = typeof navigator === 'undefined' ? null : navigator.getGamepads?.();
    return pads ? Array.from(pads).find((item) => item && item.connected) ?? null : null;
  }

  private readLookStick() {
    const pad = this.connectedPad();
    if (!pad) return { x: 0, y: 0 };
    if (pad.buttons[11]?.pressed) this.recenter = true;
    const x = pad.axes[2] ?? 0;
    const y = pad.axes[3] ?? 0;
    if (Math.hypot(x, y) < 0.18) return { x: 0, y: 0 };
    return { x, y };
  }

  /** Stick and arrows move. WASD is the camera, so it never lands in this vector. Positive z is backward. */
  private readMoveAxes() {
    let x = this.moveAxis.x;
    let z = this.moveAxis.z;
    if (this.keys.has('arrowleft')) x -= 1;
    if (this.keys.has('arrowright')) x += 1;
    if (this.keys.has('arrowup')) z -= 1;
    if (this.keys.has('arrowdown')) z += 1;
    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    return { x, z, len: Math.min(1, len) };
  }

  private swapShoulder() {
    const cfg = this.rig.config;
    const magnitude = Math.abs(cfg.shoulderX) > 0.05 ? Math.abs(cfg.shoulderX) : 0.42;
    cfg.shoulderX = cfg.shoulderX >= 0 ? -magnitude : magnitude;
  }

  private pollPad() {
    const pad = this.connectedPad();
    if (!pad) return;
    const commands = risingPadCommands(
      pad.buttons.map((button) => button.pressed),
      this.padPrev,
    );
    // Left trigger / L2 held: light strikes come out heavy, as Shift does on the keyboard.
    const modifier = Boolean(pad.buttons[6]?.pressed) && !pad.buttons[6]?.touched;
    for (const command of commands) this.queueCommand(withSprintModifier(command, modifier || this.sprinting), 1);
    this.guardPad = Boolean(pad.buttons[4]?.pressed);
    const lx = pad.axes[0] ?? 0;
    const ly = pad.axes[1] ?? 0;
    const mag = Math.hypot(lx, ly);
    if (mag > 0.2) {
      this.padMove = true;
      const scale = Math.min(1, (mag - 0.2) / 0.75);
      this.setMoveAxis((lx / mag) * scale, (ly / mag) * scale);
    } else if (this.padMove) {
      this.padMove = false;
      this.setMoveAxis(0, 0);
    }
  }

  private tryDodge() {
    if (this.dodgeCd > 0 || this.hitStun > 0.18 || this.stasis > 0 || this.bodyLocked()) return;
    // A dodge cuts the tail of a landed strike, so punish windows belong to whiffs only.
    this.striker.cancel();
    const wish = this.readMoveAxes();
    const x = wish.x;
    const z = wish.z;
    const len = wish.len;
    const fwdX = Math.sin(this.yaw);
    const fwdZ = Math.cos(this.yaw);
    if (len < 0.2) {
      this.dodgeX = -fwdX;
      this.dodgeZ = -fwdZ;
    } else {
      this.dodgeX = ((-z / len) * fwdX + (x / len) * -fwdZ);
      this.dodgeZ = ((-z / len) * fwdZ + (x / len) * fwdX);
      const mag = Math.hypot(this.dodgeX, this.dodgeZ) || 1;
      this.dodgeX /= mag;
      this.dodgeZ /= mag;
    }
    this.dodgeT = 0.18;
    this.dodgeCd = 0.88 * Math.max(0.4, 1 + this.modifiers.dodgeCooldown);
    this.iframes = Math.max(this.iframes, 0.16);
    this.combatMemory.note('dodge', this.simTime);
    this.striker.interrupt();
    this.kit?.onDodge?.();
  }

  /**
   * Guard: the dodge key held after the dodge itself is spent, standing still.
   * Blocks eat most of a hit and all of its stun. Moving drops the guard, so a
   * blocking Ryder is a planted Ryder.
   */
  private stepGuard(dt: number, canAct: boolean) {
    const held = this.keys.has('z') || this.guardPad || this.guardTouch;
    const still = this.readMoveAxes().len < 0.2;
    const want = held && still && this.dodgeT <= 0 && !this.striker.busy && canAct && this.airY <= 0.02;
    if (want) {
      this.guardT += dt;
      // The first beat of a hold is the dodge's own window; the guard raises right after it.
      this.guarding = this.guardT >= 0.1;
    } else {
      this.guardT = 0;
      this.guarding = false;
    }
  }

  /** Grounded hop. A second press while that hop is still up can mount, for a kit that flies. */
  private tryJump() {
    if (this.swim.mode === 'surface' || this.swim.mode === 'under') {
      this.swimRise = 0.28;
      return;
    }
    const airborne = this.jumping || this.airY > 0.04 || this.airVel > 0.2 || (this.kit?.flying ?? false);
    if (airborne) {
      const since = this.simTime - this.jumpAt;
      if (this.kit?.tryAirJump?.(since, this.airY)) {
        this.airY = 0;
        this.airVel = 0;
        this.jumping = false;
      }
      return;
    }
    if (this.hitStun > 0.12 || this.dodgeT > 0 || this.bodyLocked()) return;
    if (this.pvpCpu?.grabsPlayer()) return;
    this.airVel = JUMP_SPEED;
    this.airY = 0.02;
    this.jumping = true;
    this.jumpAt = this.simTime;
    this.emitSound('move.jump.swing');
  }

  /** Launch while rising, tuck while falling. Kits that already own a pose win. */
  private jumpPose(airY = this.airY, airVel = this.airVel, active = this.jumping): PoseOverride | null {
    if (!active) return null;
    if (airVel > 0) return { kind: 'launch', t: Math.min(1, airY / 1.1), weight: 0.85 };
    return { kind: 'land', t: 0.4, weight: 0.85 };
  }

  /** Punch, kick, grab, and throw. Weapon melee still goes through the Ryder kit. */
  private stepPhysical(dt: number, locked: boolean, busy: boolean) {
    this.hitStun = Math.max(0, this.hitStun - dt);
    this.stasis = Math.max(0, this.stasis - dt);
    this.takenGap += dt;
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    if (this.dodgeT > 0) this.dodgeT = Math.max(0, this.dodgeT - dt);
    if (this.jumpQueued) {
      this.jumpQueued = false;
      if (!locked) this.tryJump();
    }
    if (this.kit?.flying) {
      this.airY = 0;
      this.airVel = 0;
      this.jumping = false;
    } else if (this.swim.mode === 'surface' || this.swim.mode === 'under') {
      this.airY = 0;
      this.airVel = 0;
      this.jumping = false;
    } else if (this.airY > 0 || this.airVel > 0) {
      this.airVel -= 22 * dt;
      this.airY += this.airVel * dt;
      if (this.airY <= 0) {
        this.airY = 0;
        this.airVel = 0;
        if (this.jumping) this.jumping = false;
        else this.hitStun = Math.max(this.hitStun, 0.18);
      }
      if (this.player) {
        this.player.humanoid.group.position.y = this.standY(this.player.humanoid.group.scale.x);
      }
    }
    const canAct = !locked && !busy && this.hitStun < 0.12 && this.dodgeT <= 0 && this.stasis <= 0;
    this.stepGuard(dt, canAct);
    const anyStrike = this.punchQueued || this.kickQueued || this.meleeQueued || this.heavyQueued || this.launcherQueued;
    // Targeting assist: a strike turns the body toward the closest body in a
    // generous cone, so a crowd fight never whiffs because of two degrees.
    if (anyStrike && canAct) this.faceNearest(3.8);
    if (this.heldThrow && (this.punchQueued || this.kickQueued || this.heavyQueued || this.launcherQueued)) {
      this.releaseHeldThrow();
      this.punchQueued = false;
      this.kickQueued = false;
      this.heavyQueued = false;
      this.launcherQueued = false;
    }
    if (this.kit?.flying) {
      if (this.punchQueued || this.heavyQueued) {
        this.punchQueued = false;
        this.heavyQueued = false;
        this.kit.airStrike?.('punch');
      }
      if (this.kickQueued || this.launcherQueued) {
        this.kickQueued = false;
        this.launcherQueued = false;
        this.kit.airStrike?.('kick');
      }
      if (this.meleeQueued) {
        this.meleeQueued = false;
        this.kit.airStrike?.('melee');
      }
    }
    const strikeInputs: Array<[boolean, StrikeInput]> = [
      [this.punchQueued, 'punch'],
      [this.kickQueued, 'kick'],
      [this.heavyQueued, 'heavy'],
      [this.launcherQueued, 'launcher'],
    ];
    this.punchQueued = false;
    this.kickQueued = false;
    this.heavyQueued = false;
    this.launcherQueued = false;
    for (const [queued, input] of strikeInputs) {
      if (!queued) continue;
      if (canAct || this.striker.busy) this.striker.queue(input);
      this.combatMemory.note(input === 'heavy' ? 'punch' : input === 'launcher' ? 'kick' : input, this.simTime);
    }
    if (this.meleeQueued) {
      this.meleeQueued = false;
      if (this.striker.busy) this.striker.queue('melee');
      else if (canAct && this.meleeCd <= 0) {
        const near = this.nearestHost(this.pos);
        const dist = near ? Math.hypot(near.pos.x - this.pos.x, near.pos.z - this.pos.z) : 99;
        const sequence = this.striker.combo.snapshot(this.simTime).sequence;
        const finisher = Boolean(near && isKnockedDown(near) && dist < 2.2);
        if (near && (finisher || meleeWantsGrab(sequence, dist, false, this.striker.combo.activeRecipes))) this.striker.queue('melee');
        else this.tryMelee();
        this.combatMemory.note('melee', this.simTime);
      }
    }
    if (this.dodgeQueued) {
      this.dodgeQueued = false;
      if (canAct) this.tryDodge();
    }
    const tempo = Math.min(1.35, Math.max(0.4, (this.kit?.haste ?? 1) * this.suppress * (this.surgeT > 0 ? 1.18 : 1)));
    const airborne = this.airY > 0.35 && !this.kit?.flying;
    const frame = this.striker.tick(dt * tempo, {
      time: this.simTime,
      stunned: this.hitStun > 0.12 || this.stasis > 0,
      locked: locked || busy || this.guarding,
      facing: this.yaw,
      x: this.pos.x,
      z: this.pos.z,
      meleeDamage: this.meleeDamage(),
      airborne,
      damageScale: this.strikeScale(),
      targets: this.hosts
        .filter((host) => host.hp > 0 && !host.ally)
        .map((host) => ({
          ref: host,
          x: host.pos.x,
          z: host.pos.z,
          radius: host.radius,
          airborne: host.airY > 0.3,
          downed: isKnockedDown(host),
        })),
    });
    if (frame.lunge) {
      _fwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      this.pos.addScaledVector(_fwd, frame.lunge);
      this.pos.x = clamp(this.pos.x, -this.limit(), this.limit());
      this.pos.z = clamp(this.pos.z, -this.limit(), this.limit());
      resolveCircle(this.pos, PLAYER_RADIUS, this.world.obstacles);
    }
    // An aerial strike drops the Ryder onto the target: the slam is the landing.
    if (frame.started && frame.kind === 'aerial' && this.airY > 0.3) {
      this.airVel = Math.min(this.airVel, -9);
    }
    // Launcher lifts the Ryder a touch too, so the follow-up punch reads as a jump.
    if (frame.started && frame.kind === 'launcher' && this.airY <= 0.02 && !this.kit?.flying) {
      this.airVel = 3.2;
      this.airY = 0.02;
      this.jumping = true;
      this.jumpAt = this.simTime;
    }
    // Hosts read a slow windup and may dodge. Flag the ones in front for this frame.
    const telegraph = this.striker.telegraphing;
    for (const host of this.hosts) {
      if (!telegraph || host.ally || host.hp <= 0) {
        host.canDodge = false;
        continue;
      }
      const dx = host.pos.x - this.pos.x;
      const dz = host.pos.z - this.pos.z;
      host.canDodge = dx * dx + dz * dz < 3.6 * 3.6;
    }
    const pose = this.striker.pose();
    if (pose) {
      this.meleeT = 1 - pose.p;
      this.strikeOverride = pose.style;
      if (frame.started) {
        this.meleeStarted = true;
        this.combatT = COMBAT_LINGER;
        this.kit?.onStrike?.(pose.style);
      }
    }
    if (frame.grab) {
      const host = frame.grab.ref as Host;
      if (this.hosts.includes(host)) {
        host.held = Math.max(host.held, 0.16);
        host.pos.x = this.pos.x + Math.sin(this.yaw) * 0.95;
        host.pos.z = this.pos.z + Math.cos(this.yaw) * 0.95;
      }
    }
    for (const hit of frame.hits) this.applyFighterHit(hit);
    if (frame.hits.length) {
      const kind = frame.hits[0].kind;
      if (kind === 'heavy' || kind === 'finisher' || kind === 'aerial') {
        this.hitStopT = Math.max(this.hitStopT, kind === 'finisher' ? 0.11 : 0.07);
        this.rig.addShake(kind === 'finisher' ? 0.3 : 0.18);
        if (kind !== 'heavy') {
          _tmp2.set(this.pos.x + Math.sin(this.yaw) * 1.2, this.world.heightAt(this.pos.x, this.pos.z) + 0.02, this.pos.z + Math.cos(this.yaw) * 1.2);
          this.cracks.spawn(_tmp2, 1.6, 2.2);
          this.rings.spawn(_tmp2, this.spec.color, { radius: kind === 'finisher' ? 2.6 : 1.9, duration: 0.35 });
        }
      }
    }
    const shock = frame.hits.find((hit) => hit.shockRange);
    if (shock?.shockRange) this.forkShock(shock.shockRange, frame.hits.map((hit) => hit.target.ref));
    this.cueStrike(frame);
  }

  /** Multiplier the tree and the surge put on every physical strike. */
  private strikeScale() {
    return (1 + this.modifiers.meleeDamage) * this.surgeMul;
  }

  private applyFighterHit(hit: StrikerHit) {
    const host = hit.target.ref as Host;
    if (!this.hosts.includes(host) || host.hp <= 0) return;
    _tmp.set(host.pos.x - this.pos.x, 0, host.pos.z - this.pos.z);
    if (_tmp.lengthSq() < 1e-4) _tmp.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    _tmp.normalize();
    host.lastImpact = { x: _tmp.x, z: _tmp.z, speed: hit.knockback, kind: hit.kind };
    if (hit.kind === 'throw') host.held = 0;
    let damage = hit.damage;
    let strength = hit.strength * (1 + this.modifiers.knockback);
    if (hit.kind === 'heavy') damage *= 1 + this.modifiers.heavyDamage;
    if (hit.kind === 'aerial') damage *= 1 + this.modifiers.aerialDamage;
    if (hit.kind === 'finisher') damage *= 1 + this.modifiers.finisherDamage;
    if (hit.kind === 'launcher' || hit.reaction === 'launch') strength *= 1 + this.modifiers.launchPower;
    // Bodies already in the air stay there a beat longer per hit, so a launch
    // becomes a juggle instead of a single bounce.
    if (hit.juggle > 0 && host.airY > 0.05) {
      juggleBody(host, hit.juggle * (1 + this.modifiers.launchPower));
      // A juggled body drifts toward the puncher so the next hit stays in range.
      host.pos.x -= _tmp.x * 0.12;
      host.pos.z -= _tmp.z * 0.12;
    }
    const wasGrounded = host.airY <= 0.05;
    const finisher = hit.kind === 'finisher' || isFinisherEffect(hit.combo.effect);
    this.pendingFinisher = finisher;
    this.hurtHost(host, damage, _tmp, hit.reaction, strength);
    this.pendingFinisher = false;
    if (wasGrounded && host.airY > 0.05 && host.hp > 0) {
      host.launchedBy = this.controlledSeat;
      host.launchedAt = this.simTime;
    }
    this.kit?.noteHit?.();
    if (hit.combo.recipeId) this.kit?.noteCombo?.(hit.combo);
    this.combatT = COMBAT_LINGER;
  }

  private releasePowerLink(abilityId: AbilityId) {
    if (!this.striker.combo.consumePower(this.simTime)) return;
    const link = resolvePowerLink(this.spec.id, abilityId);
    const host = this.nearestHost(this.pos);
    if (!host) return;
    const dx = host.pos.x - this.pos.x;
    const dz = host.pos.z - this.pos.z;
    if (dx * dx + dz * dz > 6.5 * 6.5) return;
    _tmp.set(dx, 0, dz);
    if (_tmp.lengthSq() < 1e-4) _tmp.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    _tmp.normalize();
    applyReaction(host, link.preReaction, _tmp, 1);
    if (link.trap > 0) host.held = Math.max(host.held, link.trap);
    host.lastImpact = { x: _tmp.x, z: _tmp.z, speed: 7, kind: 'ability' };
    const chip = this.meleeDamage() * 0.28;
    for (let i = 0; i < link.followUps; i += 1) {
      this.scheduler.schedule(this.simTime, 0.18 + i * 0.16, () => {
        if (!this.hosts.includes(host) || host.hp <= 0) return;
        const ox = host.pos.x - this.pos.x;
        const oz = host.pos.z - this.pos.z;
        if (ox * ox + oz * oz > 16) return;
        this.hurtHost(host, chip * (i === 0 ? 1 : 0.86), _tmp.set(ox, 0, oz).normalize(), 'stagger', 0.55);
      });
    }
    this.rig.addShake(0.16);
  }

  private tryMelee() {
    if (!this.player || this.meleeCd > 0) return;
    const step = this.kit?.melee(this.simTime) ?? null;
    if (step) {
      this.meleeStep(step);
      return;
    }
    const rate = this.spec.meleeRate * (this.burnout ? 0.75 : 1);
    this.meleeCd = 1 / rate;
    this.meleeT = 1;
    this.meleeStarted = true;
    this.combatT = COMBAT_LINGER;
    this.rig.addKick(-0.12);
    _fwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.particles.emit(this.muzzle(), this.burnout ? 0x8899aa : this.spec.color, 12, {
      speed: 7,
      size: 0.3,
      life: 0.28,
      direction: _fwd,
      up: 0.2,
    });
    const struck = this.hosts.filter((host) => {
      const dx = host.pos.x - this.pos.x;
      const dz = host.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > MELEE_RANGE + host.radius) return false;
      const ang = Math.atan2(dx, dz);
      let diff = ang - this.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      return Math.abs(diff) <= MELEE_ARC;
    });
    if (!struck.length) return;
    const snap = this.striker.combo.land('melee', this.simTime, struck[0]);
    const shaped = reactionForEffect(snap.effect, 'heavy', 1);
    const dmg = this.meleeDamage() * snap.scale;
    for (const host of struck) {
      _tmp.set(host.pos.x - this.pos.x, 0, host.pos.z - this.pos.z);
      if (_tmp.lengthSq() < 1e-4) _tmp.copy(_fwd);
      _tmp.normalize();
      host.lastImpact = { x: _tmp.x, z: _tmp.z, speed: 5, kind: 'melee' };
      this.hurtHost(host, dmg, _tmp, shaped.reaction, shaped.strength);
    }
  }

  /**
   * Kit-authored melee: the swing starts now, the damage lands when the fist
   * does. Damage, range, cone and reaction all come from the step.
   */
  private meleeStep(step: MeleeStep) {
    this.meleeCd = step.recovery * (this.burnout ? 1.3 : 1);
    this.meleeT = 1;
    this.meleeStarted = true;
    this.strikeOverride = step.style;
    this.combatT = COMBAT_LINGER;
    this.rig.addKick(-0.1);
    this.scheduler.schedule(this.simTime, step.hitDelay, () => {
      if (!this.player || this.phase === 'dead') return;
      _fwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      // Step into the hit.
      this.pos.addScaledVector(_fwd, step.lunge);
      this.pos.x = clamp(this.pos.x, -this.limit(), this.limit());
      this.pos.z = clamp(this.pos.z, -this.limit(), this.limit());
      resolveCircle(this.pos, PLAYER_RADIUS, this.world.obstacles);
      const color = this.burnout ? 0x8899aa : this.spec.visual.electricityColor;
      this.particles.emit(this.muzzle(), color, 10, { speed: 7, size: 0.26, life: 0.26, direction: _fwd, up: 0.2 });
      const hits = targetsInArc(this.hosts, this.pos, this.yaw, step.range, step.halfArc, [] as Host[]);
      if (!hits.length) {
        this.emitSound(`${step.sound}.whiff`);
        if (step.shockRange && step.shockRange > 0) this.forkShock(step.shockRange, hits, step.shockMul ?? 0.4);
        return;
      }
      const snap = this.striker.combo.land('melee', this.simTime, hits[0]);
      const shaped = reactionForEffect(snap.effect, step.reaction, step.strength);
      const dmg = this.meleeDamage() * step.damageMul * snap.scale;
      for (const host of hits) {
        _tmp.set(host.pos.x - this.pos.x, 0, host.pos.z - this.pos.z);
        if (_tmp.lengthSq() < 0.0001) _tmp.copy(_fwd);
        _tmp.normalize();
        host.lastImpact = { x: _tmp.x, z: _tmp.z, speed: 5, kind: 'melee' };
        this.hurtHost(host, dmg, _tmp, shaped.reaction, shaped.strength);
        this.kit?.noteHit?.();
        this.particles.emit(this.hostAt(host, 1.1), 0xffffff, 4, { speed: 3, size: 0.3, life: 0.16 });
      }
      this.emitSound(step.sound);
      if (snap.recipeId) this.kit?.noteCombo?.(snap);
      if (step.shockRange && step.shockRange > 0) {
        this.forkShock(
          step.shockRange,
          hits,
          step.shockMul ?? 0.4,
        );
      }
      if (step.shake > 0) this.rig.addShake(step.shake);
      if (step.hitStop > 0) this.hitStop(step.hitStop);
      this.powerVfx.boost(0.9 + step.damageMul * 0.6);
      this.emitSound(step.sound);
    });
  }

  /** Lighter hit on everyone near a pitchfork slam who was not already in the blade arc. */
  private forkShock(range: number, already: readonly object[], mul = 0.42) {
    const hits = targetsInArc(this.hosts, this.pos, this.yaw, range, Math.PI, [] as Host[]);
    let any = false;
    for (const host of hits) {
      if (already.includes(host) || host.hp <= 0) continue;
      any = true;
      _tmp.set(host.pos.x - this.pos.x, 0, host.pos.z - this.pos.z);
      if (_tmp.lengthSq() < 1e-4) _tmp.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      _tmp.normalize();
      host.lastImpact = { x: _tmp.x, z: _tmp.z, speed: 3.5, kind: 'melee' };
      this.hurtHost(host, this.meleeDamage() * mul, _tmp, 'knockback', 0.65);
    }
    if (any || already.length) {
      const y = this.world.heightAt(this.pos.x, this.pos.z);
      this.rings.spawn(new THREE.Vector3(this.pos.x, y + 0.05, this.pos.z), this.spec.visual.auraColor, {
        radius: range,
        duration: 0.35,
      });
    }
  }

  private setStasis(seconds: number) {
    const next = Math.max(0, seconds);
    if (this.stasis <= 0 && next > 0) {
      this.striker.interrupt();
      this.dodgeT = 0;
      this.punchQueued = false;
      this.kickQueued = false;
      this.meleeQueued = false;
    }
    this.stasis = next;
  }

  /** A suppression field slows the player until it stops refreshing. The floor keeps her able to move. */
  private setSuppress(factor: number) {
    const next = Math.min(1, Math.max(0.55, factor));
    if (this.simTime > this.suppressUntil) this.suppress = 1;
    this.suppress = Math.min(this.suppress, next);
    this.suppressUntil = this.simTime + 0.25;
  }

  private hitStop(seconds: number) {
    this.hitStopT = Math.max(this.hitStopT, seconds);
  }

  /** Pull orbs toward every Ryder in the fight and pay what reaches them. */
  private stepSignalOrbs(dt: number, time: number) {
    const collectors = this.orbCollectors;
    collectors.length = 0;
    if (this.hp > 0 && this.player) {
      collectors.push({
        seat: this.controlledSeat,
        x: this.pos.x,
        y: this.player.humanoid.group.position.y + 1,
        z: this.pos.z,
        radius: ORB_MAGNET_RADIUS + this.modifiers.pickupRadius,
      });
    }
    for (const host of this.hosts) {
      if (!host.ally || !host.cpu || host.hp <= 0 || (host.down ?? 0) > 0 || host.seat === undefined) continue;
      collectors.push({ seat: host.seat, x: host.pos.x, y: host.fighter.humanoid.group.position.y + 1, z: host.pos.z, radius: ORB_MAGNET_RADIUS });
    }
    if (!this.signalOrbs.count) return;
    this.paySignalOrbs(this.signalOrbs.update(dt, time, collectors, this.camera), true);
  }

  /** Round clear, a lost fight, a restart: whatever is still on the street pays its owner. */
  private flushSignalOrbs(show: boolean) {
    if (!this.signalOrbs?.count) return;
    this.paySignalOrbs(this.signalOrbs.flush(), show);
  }

  private paySignalOrbs(pickups: OrbPickup[], show: boolean) {
    const round = this.currentRound();
    for (const pickup of pickups) {
      const paid = this.signalBank.collect(pickup.ids, pickup.amount, round, pickup.seat);
      if (paid <= 0 || pickup.seat !== this.controlledSeat || !show) continue;
      this.emitSound(`signal.orb.${Math.min(9, pickup.orbs)}`);
      const at = _tmp.set(this.pos.x, (this.player?.humanoid.group.position.y ?? 0) + 2.1, this.pos.z).project(this.camera);
      if (at.z < 1 && this.signalPops.length < 12) {
        this.signalPops.push({ amount: paid, x: (at.x * 0.5 + 0.5) * 100, y: (0.5 - at.y * 0.5) * 100 });
      }
    }
  }

  private emitSound(id: string) {
    this.onSound?.(id);
  }

  /** Swing on the windup, impact when a fist or foot connects. */
  private cueStrike(frame: { started: boolean; swing: string | null; hits: Array<{ kind: string }> }) {
    const kick = frame.swing === 'kick' || frame.swing === 'spinKick' || frame.hits.some((hit) => hit.kind === 'kick');
    if (frame.started) this.emitSound(kick ? 'fight.kick.swing' : 'fight.punch.swing');
    if (frame.hits.length) this.emitSound(kick ? 'fight.kick.impact' : 'fight.punch.impact');
  }

  private bindKit() {
    this.unbindKit();
    const kit = createRyderKit(this.spec.id);
    if (!kit || !this.player) return;
    this.kit = kit;
    this.clipTokenSeen = -1;
    this.kitContext = this.makeKitContext();
    kit.attach(this.kitContext);
  }

  private unbindKit() {
    if (!this.kit) return;
    this.kit.detach();
    this.kit = null;
    this.kitContext = null;
    this.kitClaimed.clear();
    this.scheduler.clear();
    this.hitStopT = 0;
    if (this.player) {
      this.player.humanoid.group.scale.setScalar(1);
      setHumanoidOpacity(this.player.humanoid, 1);
      if (this.playerGlow > 0) flashEmissive(this.player.humanoid, 0x000000, 0);
    }
    this.rig.setFramingExtra(null);
    this.playerGlow = 0;
  }

  /** The engine surface a kit may touch; everything else stays private. */
  private makeKitContext(): KitContext {
    const engine = this;
    return {
      pos: this.pos,
      get spec() {
        return engine.spec;
      },
      particles: this.particles,
      camera: this.rig,
      cameraObject: this.camera,
      power: this.powerVfx,
      rings: this.rings,
      cracks: this.cracks,
      afterimages: this.afterimages,
      scene: this.scene,
      get radius() {
        return engine.playerRadius();
      },
      yaw: () => this.yaw,
      time: () => this.simTime,
      fighter: () => this.player,
      targets: () => this.hosts,
      hurt: (target, damage, dir, reaction, strength) => {
        const host = target as Host;
        const before = host.hp;
        // Kits deal power damage through here; the rank of the power last cast scales it.
        this.hurtHost(host, damage * this.castScale, dir, reaction, strength);
        return Math.max(0, before - Math.max(0, host.hp));
      },
      flash: (target, color, seconds) => {
        const host = target as Host;
        host.hit = Math.max(host.hit, seconds);
        host.hitColor = color;
      },
      meleeDamage: () => this.meleeDamage(),
      heightAt: (x, z) => this.world.heightAt(x, z),
      headroom: (x, z) => this.headroom(x, z),
      resolve: (pos) => {
        pos.x = clamp(pos.x, -this.limit(), this.limit());
        pos.z = clamp(pos.z, -this.limit(), this.limit());
        resolveCircle(pos, engine.playerRadius(), this.world.obstacles);
      },
      blocked: (x, z, radius) => Math.abs(x) > this.limit() || Math.abs(z) > this.limit() || pointBlocked(x, z, radius, this.world.obstacles),
      lookDir: (out) => this.lookDir(out),
      hitStop: (seconds) => this.hitStop(seconds),
      iframes: (seconds) => {
        this.iframes = Math.max(this.iframes, seconds);
      },
      strike: (style) => {
        this.meleeT = 1;
        this.meleeStarted = true;
        this.strikeOverride = style;
        this.combatT = COMBAT_LINGER;
      },
      schedule: (delay, fn) => this.scheduler.schedule(this.simTime, delay, fn),
      sound: (id) => this.emitSound(id),
      turn: (yaw, cut = false) => {
        this.yaw = yaw;
        if (cut) {
          this.facing = yaw;
          this.rig.snap(this.pos, this.yaw, this.pitch);
        }
      },
      gainAura: (amount) => {
        const gain = Math.max(0, amount);
        if (this.powerOut.down) {
          this.powerOut.stashed = Math.min(this.maxAura, this.powerOut.stashed + gain);
          return;
        }
        this.aura = Math.min(this.maxAura, this.aura + gain);
        if (this.burnout && this.aura >= this.maxAura * BURNOUT_RECOVERY) this.burnout = false;
      },
      spendAura: (amount) => {
        this.spendAura(amount);
        return this.aura;
      },
      heal: (amount) => {
        const before = this.hp;
        this.hp = Math.min(this.maxHp, this.hp + Math.max(0, amount));
        return this.hp - before;
      },
      cooldown: (id, seconds) => {
        const hold = abilityLockout(seconds);
        if (hold <= 0) return;
        const slot = this.moves.findIndex((move) => move.id === id);
        if (slot >= 0) this.moveCd[slot] = Math.max(this.moveCd[slot], hold);
      },
      vitals: () => ({ hp: this.hp, maxHp: this.maxHp }),
      hold: (target, seconds) => {
        const host = target as Host;
        host.held = Math.max(0, seconds);
        if (seconds > 0) {
          host.knock.set(0, 0, 0);
          host.airVel = 0;
          host.sink = 0;
        }
      },
      pvp: () => this.gameMode === GameMode.PVP,
      suppress: (factor) => this.setSuppress(factor),
      canHit: (target) => {
        const host = target as Host & { ally?: boolean };
        if (host.hp <= 0 || host.ally) return false;
        if (host.controlled && host.duelist && this.gameMode !== GameMode.PVP) return false;
        return true;
      },
      allies: () => this.hosts.filter((host) => host.ally && host.hp > 0),
      blessSquad: (fraction: number) => {
        if (fraction <= 0) return;
        if (this.hp > 0) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * fraction);
        for (const host of this.hosts) {
          if (!host.ally || host.hp <= 0) continue;
          host.hp = Math.min(host.maxHp, host.hp + host.maxHp * fraction);
        }
      },
    };
  }

  private playerRadius() {
    return PLAYER_RADIUS * (this.kit?.radiusScale ?? 1);
  }

  private isActive(id: AbilityId) {
    return this.moves.some((move, i) => move.id === id && this.moveT[i] > 0);
  }

  /** Hosts cannot touch, block or find the Ryder: the phase power, or a kit that has her intangible. */
  private isPhased() {
    return this.isActive('phase') || (this.kit?.intangible ?? false);
  }

  private tryMove(slot: number) {
    if (!this.player) return;
    const move = this.moves[slot];
    if (!move || this.moveCd[slot] > 0 || this.powerOut.down || this.kit?.powersDown) return;
    if (this.kit?.releaseId === move.id) {
      if (!this.releaseArmed[slot]) return;
      this.moveCd[slot] = 0.2;
      this.kit.endAbility?.(move.id);
      return;
    }
    if (this.burnout) return;
    // One choreographed power at a time; the blitz owns the body until its finisher lands.
    if (this.choreo || this.blitz) return;
    this.moveCd[slot] = 0.16;
    const rank = this.rankOf(move.id);
    const costScale = Math.max(0.4, 1 + this.modifiers.abilityCost) * rankScaling(rank).cost;

    // Tree-earned powers share six engine behaviours, each with its own
    // choreography. They never go through the kit, so a Ryder's canonical
    // 1 / 2 / 3 stays exactly as written.
    if (isDerivedAbility(move.id)) {
      const spec = DERIVED_POWERS[move.id];
      const tune = derivedAtRank(spec, rank);
      const cost = tune.auraCost * costScale;
      if (this.aura < cost) return;
      this.spendAura(cost);
      this.armPvpHit(slot);
      this.castScale = 1;
      this.abilityT = Math.max(ABILITY_LINGER, 0.7);
      this.combatT = COMBAT_LINGER;
      // A power cancels the tail of a landed strike: power transitions in a combo.
      this.striker.cancel();
      if (spec.kind === 'blitz') this.beginBlitz(spec, tune);
      else this.startChoreo(spec, tune, choreoFor(spec.kind, tune.count), false);
      this.moveCd[slot] = spec.kind === 'blitz' ? 2.4 : spec.kind === 'surge' ? 1.2 : spec.kind === 'snare' || spec.kind === 'nova' ? 0.9 : 0.5;
      this.combatMemory.note('ability', this.simTime);
      this.releasePowerLink(move.id);
      return;
    }

    // Canonical powers scale with rank through the cost above and the damage the kit deals.
    this.castScale = rankScaling(rank).damage;

    if (move.drain > 0) {
      if (this.moveT[slot] > 0) {
        this.endMove(slot);
        return;
      }
      if (this.aura < 2) return;
      this.armPvpHit(slot);
      this.moveT[slot] = 1;
      this.abilityT = ABILITY_LINGER;
      this.rig.addKick(0.3);
      // The toggle stays engine-owned (drain, HUD, switch-off); a kit that
      // claims the power dresses it and plays its effects while it is on.
      const kitOwned = this.kit?.tryAbility(move.id) ?? false;
      if (kitOwned) this.kitClaimed.add(move.id);
      if (!kitOwned && move.id === 'duplicate') this.spawnClones([-1, 1]);
      if (!kitOwned && move.id === 'decoy') this.spawnClones([0]);
      if (!kitOwned && move.id === 'lift') this.liftHosts(2.2);
      // Generic stand-in for a Ryder without Aaron's kit: one siphon on switch-on.
      if (!kitOwned && move.id === 'greedSiphon') this.greedSiphon();
      if (!kitOwned) {
        this.particles.emit(this.playerAt(1.1), this.spec.color, 22, {
          speed: 8,
          size: 0.3,
          life: 0.45,
          up: 1,
        });
      }
      this.combatMemory.note('ability', this.simTime);
      this.releasePowerLink(move.id);
      return;
    }

    if (this.aura < move.auraCost * costScale) return;
    this.armPvpHit(slot);
    this.spendAura(move.auraCost * costScale);
    this.abilityT = ABILITY_LINGER;
    this.combatT = COMBAT_LINGER;
    this.striker.cancel();
    const id = move.id;
    // A Ryder kit that owns this power plays it out itself.
    if (this.kit?.tryAbility(id)) {
      if (this.kit.releaseId === id && this.abilityHeld(slot)) this.releaseArmed[slot] = false;
      this.kitClaimed.add(id);
      this.abilityT = Math.max(this.abilityT, 0.9);
      this.combatMemory.note('ability', this.simTime);
      this.releasePowerLink(id);
      return;
    }
    this.rig.addKick(0.35);
    this.rig.addShake(0.18);
    if (id === 'bladeFan') this.fireSpread(5, 0.22, 1.2);
    if (id === 'envyPulse') this.pulse(6.6, 24, -8);
    if (id === 'shockwave') this.pulse(6.2, 20, 11);
    // Generic stand-in for Ryderz without a kit: a kinetic burst around her.
    if (id === 'overdrive') this.pulse(5, 16, 7);
    if (id === 'prideDash') this.prideDash();
    if (id === 'cleave') this.cleave();
    if (id === 'blink') this.blink();
    if (id === 'greedSiphon') this.greedSiphon();
    if (id === 'heartbreak') this.pulse(8.8, 38, 6);
    if (id === 'dartStorm') this.fireSpread(10, 0.32, 0.85);
    this.particles.emit(this.playerAt(1.1), this.spec.color, 18, {
      speed: 8,
      size: 0.28,
      life: 0.4,
      up: 0.8,
    });
    this.combatMemory.note('ability', this.simTime);
    this.releasePowerLink(id);
  }

  private endMove(slot: number) {
    const id = this.moves[slot]?.id;
    const wasOn = this.moveT[slot] > 0;
    this.moveT[slot] = 0;
    if (wasOn && id) this.kit?.endAbility?.(id);
    if (id === 'duplicate' || id === 'decoy') this.clearClones();
    if (id === 'phase' && this.player) setHumanoidOpacity(this.player.humanoid, 1);
  }

  private endAllMoves() {
    for (let i = 0; i < MAX_POWER_SLOTS; i += 1) this.endMove(i);
  }

  // ---------------------------------------------------------------------------
  // Tree-earned powers: breaker, volley, nova, snare, surge, blitz
  //
  // Each kind plays a choreography (`progression/power-choreo.ts`): a timeline
  // of stances, swings and events. The engine steps the timeline, holds the
  // stance through the pose pipeline, locks the body for the committed part,
  // and resolves the `hit` / `shot` events into the kind's damage. Numbers
  // come from the power's rank through `derivedAtRank`.
  // ---------------------------------------------------------------------------

  private rankOf(id: AbilityId) {
    return Math.max(1, this.powerRanks[id] ?? 1);
  }

  /** Walking, swinging, dodging and jumping are held while a kit sequence or a power choreography owns the body. */
  private bodyLocked() {
    if (this.kit?.locked) return true;
    const active = this.choreo;
    if (active && this.simTime - active.started < active.choreo.lock) return true;
    return this.blitz !== null;
  }

  private startChoreo(spec: DerivedPowerSpec, tune: DerivedTune, choreo: PowerChoreo, finisher: boolean) {
    this.choreo = { spec, tune, choreo, started: this.simTime, next: 0, pose: null, shots: 0, finisher };
    if (spec.kind === 'breaker' || spec.kind === 'nova' || spec.kind === 'snare') this.faceNearest(Math.max(tune.radius, 4));
    if (spec.kind === 'nova' && !finisher && powerLook(this.spec.id).nova.implode) {
      const charge = choreo.beats.find((beat) => beat.events?.includes('hit'))?.at ?? 0.4;
      this.powerFx.implode(this.pos, spec.color, tune.radius * 0.8, charge);
    }
    this.stepChoreo();
  }

  private stepChoreo() {
    const active = this.choreo;
    if (!active) return;
    const elapsed = this.simTime - active.started;
    const beats = active.choreo.beats;
    while (active.next < beats.length && beats[active.next].at <= elapsed + 1e-6) {
      this.fireBeat(active, beats[active.next]);
      active.next += 1;
    }
    if (elapsed >= active.choreo.duration) this.choreo = null;
  }

  private fireBeat(active: ActiveChoreo, beat: ChoreoBeat) {
    const style = RYDER_STYLE[this.spec.id];
    const spec = active.spec;
    const tune = active.tune;
    if (beat.pose) {
      const kind = resolvePose(beat.pose, style);
      if (kind) {
        // The stance runs until the next beat that names one, or the end.
        const rest = active.choreo.beats.slice(active.next + 1).find((b) => b.pose);
        active.pose = {
          kind,
          weight: beat.weight ?? 1,
          lean: beat.lean ?? 0,
          bank: beat.bank ?? 0,
          since: active.started + beat.at,
          until: active.started + (rest ? rest.at : active.choreo.duration),
        };
      }
    } else if (beat.lean != null && active.pose) {
      active.pose.lean = beat.lean;
    }
    const strike = resolveStrike(beat.strike, style);
    if (strike) {
      this.meleeT = 1;
      this.meleeStarted = true;
      this.strikeOverride = strike;
    }
    if (beat.kick) this.rig.addKick(beat.kick);
    if (beat.shake) this.rig.addShake(beat.shake);
    if (beat.sound) this.emitSound(beat.sound);
    for (const event of beat.events ?? []) {
      switch (event) {
        case 'hit':
          if (active.finisher) this.blitzFinisherHit(spec, tune);
          else if (spec.kind === 'breaker') {
            this.breakerHit(tune);
            this.breakerFx(spec, tune);
          } else if (spec.kind === 'nova') {
            this.novaHit(spec, tune);
            this.novaFx(spec, tune);
          }
          else if (spec.kind === 'snare') this.snareHit(spec, tune);
          else if (spec.kind === 'surge') this.surgeApply(spec, tune);
          break;
        case 'shot':
          this.volleyShot(spec, tune, active.shots);
          active.shots += 1;
          break;
        case 'ring':
          _tmp2.set(this.pos.x, this.world.heightAt(this.pos.x, this.pos.z) + 0.03, this.pos.z);
          this.rings.spawn(_tmp2, spec.color, { radius: Math.max(2.4, tune.radius || 3.2), duration: spec.kind === 'snare' ? 0.9 : 0.55 });
          break;
        case 'cracks':
          _tmp2.set(this.pos.x, this.world.heightAt(this.pos.x, this.pos.z) + 0.03, this.pos.z);
          this.cracks.spawn(_tmp2, Math.max(1.6, (tune.radius || 3) * 0.7), spec.kind === 'nova' ? 4 : 3);
          break;
        case 'burst':
          this.particles.emit(this.playerAt(1.0), spec.color, spec.kind === 'nova' ? 56 : 36, { speed: spec.kind === 'nova' ? 12 : 9, size: 0.32, life: 0.5, up: 1.4 });
          break;
        case 'charge':
          // Aura gathers on the Ryder before the release.
          this.particles.emit(this.playerAt(1.2), spec.color, 18, { speed: 3, size: 0.24, life: 0.3, up: 1.6 });
          this.powerVfx.surge(0.5);
          break;
        case 'afterimage':
          this.afterimages.spawn(0.35, 0.25, spec.color);
          break;
        case 'hitstop':
          this.hitStopT = Math.max(this.hitStopT, spec.kind === 'nova' || active.finisher ? 0.12 : 0.06);
          break;
        case 'iframes':
          this.iframes = Math.max(this.iframes, 0.5);
          break;
        case 'banner':
          this.banner = { title: spec.name.toUpperCase(), sub: spec.kind === 'surge' ? `${tune.duration.toFixed(0)}s TEMPO` : spec.name.toUpperCase() };
          this.bannerT = 1.2;
          break;
      }
    }
  }

  /** The stance the active choreography (or the blitz dash) holds this frame. */
  private powerPose(): PoseOverride | null {
    const active = this.choreo;
    if (active?.pose) {
      const p = active.pose;
      const span = Math.max(0.05, p.until - p.since);
      const t = clamp((this.simTime - p.since) / span, 0, 1);
      // Ease in over the first few frames, release over the last stretch of the sequence.
      const ramp = clamp((this.simTime - p.since) / 0.06, 0, 1);
      const left = active.started + active.choreo.duration - this.simTime;
      const release = clamp(left / 0.14, 0, 1);
      const weight = p.weight * Math.min(ramp, release);
      if (weight <= 0.01) return null;
      return { kind: p.kind, t, weight, lean: p.lean, bank: p.bank };
    }
    if (this.blitz) return { kind: BLITZ_DASH_POSE, t: (this.simTime * 3) % 1, weight: 1 };
    return null;
  }

  /** Breaker hit: the front line launches, the rest of the ring is knocked back. */
  private breakerHit(tune: DerivedTune) {
    const base = this.meleeDamage() * tune.damageMul * this.strikeScale();
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    for (const host of [...this.hosts]) {
      if (host.ally || host.hp <= 0) continue;
      const dx = host.pos.x - this.pos.x;
      const dz = host.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > tune.radius + host.radius) continue;
      _tmp.set(dx, 0, dz);
      if (_tmp.lengthSq() < 1e-4) _tmp.set(fx, 0, fz);
      _tmp.normalize();
      const ahead = (dx * fx + dz * fz) / Math.max(dist, 0.01);
      const front = ahead > 0.5 && dist < tune.radius * 0.6;
      host.lastImpact = { x: _tmp.x, z: _tmp.z, speed: front ? 6 : 9, kind: 'ability' };
      if (front) {
        const wasGrounded = host.airY <= 0.05;
        this.hurtHost(host, base, _tmp, 'launch', 1.35 * (1 + this.modifiers.launchPower));
        if (wasGrounded && host.hp > 0) {
          host.launchedBy = this.controlledSeat;
          host.launchedAt = this.simTime;
        }
      } else {
        this.hurtHost(host, base * 0.55, _tmp, 'knockback', 1.1);
      }
    }
  }

  /** One bolt of a volley, fanned around the look direction. */
  private volleyShot(spec: DerivedPowerSpec, tune: DerivedTune, index: number) {
    this.lookDir(_look);
    _look.y *= 0.4;
    if (_look.lengthSq() < 0.01) _look.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    _look.normalize();
    _right.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const count = Math.max(1, tune.count);
    // Alternate left and right of centre so the fan fills from the middle out.
    const order = index === 0 ? 0 : (index % 2 === 1 ? 1 : -1) * Math.ceil(index / 2);
    const spread = count > 1 ? order / Math.max(1, (count - 1) / 2) : 0;
    const dir = _tmp.copy(_look).addScaledVector(_right, spread * 0.6).normalize();
    const origin = this.muzzle();
    origin.y = this.feetY() + 1.3;
    const damage = this.shotDamage() * tune.damageMul * this.strikeScale();
    this.spawnBolt(origin, dir, damage, true, spec.color, 19, powerLook(this.spec.id).shot);
    this.particles.emit(origin, spec.color, 6, { speed: 5, size: 0.22, life: 0.25, direction: dir });
    this.emitSound('fight.punch.swing');
  }

  /** Nova hit: everything in the ring takes damage and flies outward, closer bodies harder. */
  private novaHit(spec: DerivedPowerSpec, tune: DerivedTune) {
    const base = this.meleeDamage() * tune.damageMul * this.strikeScale();
    for (const host of [...this.hosts]) {
      if (host.ally || host.hp <= 0) continue;
      const dx = host.pos.x - this.pos.x;
      const dz = host.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > tune.radius + host.radius) continue;
      _tmp.set(dx, 0, dz);
      if (_tmp.lengthSq() < 1e-4) _tmp.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      _tmp.normalize();
      const falloff = 1 - (dist / (tune.radius + 1)) * 0.45;
      host.lastImpact = { x: _tmp.x, z: _tmp.z, speed: 10, kind: 'ability' };
      this.hurtHost(host, base * falloff, _tmp, dist < tune.radius * 0.45 ? 'heavy' : 'knockback', 1.3);
      host.hitColor = spec.color;
    }
  }

  /** Snare hit: the ring is held in place and left exposed; a light sting marks the hold. */
  private snareHit(spec: DerivedPowerSpec, tune: DerivedTune) {
    const sting = this.meleeDamage() * tune.damageMul * this.strikeScale();
    const hold = this.pvpMode() ? tune.duration * 0.6 : tune.duration;
    for (const host of [...this.hosts]) {
      if (host.ally || host.hp <= 0) continue;
      const dx = host.pos.x - this.pos.x;
      const dz = host.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > tune.radius + host.radius) continue;
      _tmp.set(dx, 0, dz);
      if (_tmp.lengthSq() < 1e-4) _tmp.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      _tmp.normalize();
      this.hurtHost(host, sting, _tmp, 'stagger', 0.4);
      if (host.hp <= 0) continue;
      host.immobile = Math.max(host.immobile ?? 0, hold);
      host.exposed = Math.max(host.exposed ?? 0, hold + 1.2);
      host.knock.multiplyScalar(0.2);
      host.hit = Math.max(host.hit, hold);
      host.hitColor = spec.color;
      this.powerFx.bind(host, powerLook(this.spec.id).snare, spec.color, hold);
    }
  }

  private pvpMode() {
    return this.gameMode === GameMode.PVP;
  }

  /** Tempo buff: faster strikes and heavier hits until the timer runs out. */
  private surgeApply(spec: DerivedPowerSpec, tune: DerivedTune) {
    this.surgeT = tune.duration;
    this.surgeMul = tune.damageMul;
    this.surgeColor = spec.color;
    this.powerFx.aura(this.pos, spec.color, tune.duration);
    this.powerVfx.surge(1);
    this.particles.emit(this.playerAt(1.1), spec.color, 28, { speed: 6, size: 0.3, life: 0.6, up: 1.8 });
  }

  /** Chest height over the floor under the Ryder: where sprays and bursts leave from. */
  private chest(out: THREE.Vector3, lift = 1.1) {
    return out.set(this.pos.x, this.world.heightAt(this.pos.x, this.pos.z) + this.airY + lift, this.pos.z);
  }

  private breakerFx(spec: DerivedPowerSpec, tune: DerivedTune) {
    const look = powerLook(this.spec.id);
    const fx = look.breaker;
    const front = new THREE.Vector3(this.pos.x + Math.sin(this.yaw) * 1.3, 0, this.pos.z + Math.cos(this.yaw) * 1.3);
    if (fx.pillar) this.powerFx.pillar(fx.pillar === 'slash' ? this.pos : front, fx.pillar, spec.color, this.yaw, fx.pillar === 'spikes' ? tune.radius / 4.6 : 1);
    if (fx.spray) this.powerFx.spray(this.chest(new THREE.Vector3(), 1.3), this.yaw, 1.6, look.shot, spec.color, fx.spray, tune.radius, 26, true);
    if (fx.wave) this.powerFx.wave(this.pos, fx.wave, spec.color, tune.radius);
    if (fx.flash) this.powerFx.flash(front.setY(this.world.heightAt(front.x, front.z) + 1.2), spec.color, 1.8);
  }

  private novaFx(spec: DerivedPowerSpec, tune: DerivedTune) {
    const look = powerLook(this.spec.id);
    const fx = look.nova;
    const chest = this.chest(new THREE.Vector3(), 1.0);
    if (fx.radial) this.powerFx.radial(chest, look.shot, spec.color, fx.radial, tune.radius + 1.5);
    if (fx.wave) this.powerFx.wave(this.pos, fx.wave, spec.color, tune.radius);
    if (fx.flash) this.powerFx.flash(chest, spec.color, tune.radius * 0.7, 0.4);
  }

  private blitzFx(spec: DerivedPowerSpec, tune: DerivedTune) {
    const look = powerLook(this.spec.id);
    const fx = look.blitz;
    const chest = this.chest(new THREE.Vector3(), 1.0);
    if (fx.pillar) this.powerFx.pillar(this.pos, fx.pillar, spec.color, this.yaw, fx.pillar === 'spikes' ? tune.radius / 4.6 : 1.4);
    if (fx.radial) this.powerFx.radial(chest, look.shot, spec.color, fx.radial, tune.radius + 2);
    if (fx.wave) this.powerFx.wave(this.pos, fx.wave, spec.color, tune.radius);
    if (fx.flash) this.powerFx.flash(chest, spec.color, tune.radius * 0.6, 0.45);
  }

  /** A surge keeps throwing its element off the body for as long as it lasts. */
  private surgeParticles(dt: number) {
    const style = AURA_PARTICLES[powerLook(this.spec.id).surge];
    const count = Math.floor(style.rate * dt + Math.random());
    if (count <= 0) return;
    const at = this.chest(_tmp2, 0.2 + Math.random() * 1.5);
    this.particles.emit(at, style.white && Math.random() < 0.5 ? 0xffffff : this.surgeColor, count, {
      speed: style.speed,
      size: style.size,
      life: style.life,
      up: style.up,
      spread: 1.4,
    });
  }

  /** Drags living hosts toward the Ryder, stopping just short of her. */
  private pullCrowd(radius: number, dt: number) {
    for (const host of this.hosts) {
      if (host.ally || host.hp <= 0 || host.held > 0) continue;
      const dx = this.pos.x - host.pos.x;
      const dz = this.pos.z - host.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > radius || dist < 1.3) continue;
      const step = Math.min(dist - 1.3, (6 + dist * 2.2) * dt);
      host.pos.x += (dx / dist) * step;
      host.pos.z += (dz / dist) * step;
      resolveCircle(host.pos, host.radius, this.world.obstacles);
      host.knock.multiplyScalar(0.5);
      host.stagger = Math.max(host.stagger, 0.2);
    }
  }

  /** Ultimate: a chain of dashes through the crowd, then a radial finisher where the Ryder stops. */
  private beginBlitz(spec: DerivedPowerSpec, tune: DerivedTune) {
    this.blitz = { left: 5, next: 0, spec, tune, pull: 0, pulled: false };
    this.iframes = Math.max(this.iframes, 1.6);
    this.rig.addShake(0.2);
    this.banner = { title: spec.name.toUpperCase(), sub: 'ULTIMATE' };
    this.bannerT = 1.6;
  }

  private stepBlitz(dt: number) {
    const blitz = this.blitz;
    if (!blitz) return;
    if (blitz.pull > 0) {
      blitz.pull = Math.max(0, blitz.pull - dt);
      this.pullCrowd(blitz.tune.radius * 1.5, dt);
    }
    blitz.next -= dt;
    if (blitz.next > 0) return;
    const spec = blitz.spec;
    if (blitz.left <= 0 && !blitz.pulled && powerLook(this.spec.id).blitz.vortex) {
      // The street is dragged in on the Ryder before the finisher lets it go.
      blitz.pulled = true;
      blitz.pull = 0.5;
      blitz.next = 0.5;
      this.powerFx.vortex(this.pos, spec.color, blitz.tune.radius * 1.3, 0.55);
      this.powerFx.implode(this.pos, spec.color, blitz.tune.radius, 0.5);
      this.rig.addShake(0.2);
      return;
    }
    if (blitz.left <= 0) {
      // The chain is done: the finisher plays as its own choreography and lands on the slam.
      this.blitz = null;
      this.startChoreo(spec, blitz.tune, BLITZ_FINISH, true);
      return;
    }
    // Dash to the next body in the crowd and strike it on arrival.
    const target = this.pickBlitzTarget();
    if (target) {
      const dx = target.pos.x - this.pos.x;
      const dz = target.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz) || 0.01;
      this.afterimages.spawn(0.5, 0.3, spec.color);
      _tmp2.copy(this.pos).setY(this.world.heightAt(this.pos.x, this.pos.z));
      const stop = Math.max(0, dist - 1.1);
      this.pos.x += (dx / dist) * stop;
      this.pos.z += (dz / dist) * stop;
      this.pos.x = clamp(this.pos.x, -this.limit(), this.limit());
      this.pos.z = clamp(this.pos.z, -this.limit(), this.limit());
      resolveCircle(this.pos, PLAYER_RADIUS, this.world.obstacles);
      this.yaw = Math.atan2(dx, dz);
      this.facing = this.yaw;
      _tmp.set(dx, 0, dz).normalize();
      target.lastImpact = { x: _tmp.x, z: _tmp.z, speed: 7, kind: 'ability' };
      // Every dash lands the Ryder's own swing.
      this.meleeT = 1;
      this.meleeStarted = true;
      this.strikeOverride = RYDER_STYLE[this.spec.id].weapon;
      this.hurtHost(target, this.meleeDamage() * 1.3 * this.strikeScale() * (blitz.tune.damageMul / spec.damageMul), _tmp, 'stagger', 0.9);
      this.powerFx.streak(_tmp2, _look.copy(this.pos).setY(this.world.heightAt(this.pos.x, this.pos.z)), spec.color);
      if (powerLook(this.spec.id).blitz.stick && target.hp > 0) this.powerFx.stick(target, powerLook(this.spec.id).shot, spec.color, this.pos);
      this.particles.emit(this.playerAt(1.0), spec.color, 14, { speed: 7, size: 0.26, life: 0.3, up: 0.6 });
      this.emitSound('fight.punch.impact');
    }
    blitz.left -= 1;
    blitz.next = target ? 0.18 : 0.08;
    this.iframes = Math.max(this.iframes, 0.4);
  }

  /** Blitz finisher: everything near the Ryder goes down. */
  private blitzFinisherHit(spec: DerivedPowerSpec, tune: DerivedTune) {
    const base = this.meleeDamage() * tune.damageMul * this.strikeScale();
    this.blitzFx(spec, tune);
    // Darts left in bodies by the dashes go off wherever those bodies are now.
    for (const target of this.powerFx.detonateStuck()) {
      const host = this.hosts.find((h) => h === target);
      if (!host || host.hp <= 0) continue;
      if (Math.hypot(host.pos.x - this.pos.x, host.pos.z - this.pos.z) <= tune.radius + host.radius) continue;
      _tmp.set(host.pos.x - this.pos.x, 0, host.pos.z - this.pos.z).normalize();
      this.hurtHost(host, base * 0.5, _tmp, 'knockback', 1);
    }
    for (const host of [...this.hosts]) {
      if (host.ally || host.hp <= 0) continue;
      const dx = host.pos.x - this.pos.x;
      const dz = host.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > tune.radius + host.radius) continue;
      _tmp.set(dx, 0, dz);
      if (_tmp.lengthSq() < 1e-4) _tmp.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      _tmp.normalize();
      host.lastImpact = { x: _tmp.x, z: _tmp.z, speed: 11, kind: 'ability' };
      this.pendingFinisher = true;
      this.hurtHost(host, base * (1 - (dist / (tune.radius + 1)) * 0.4), _tmp, 'slam', 1.5);
      this.pendingFinisher = false;
    }
  }

  private pickBlitzTarget(): Host | null {
    let best: Host | null = null;
    let bestD = Infinity;
    for (const host of this.hosts) {
      if (host.ally || host.hp <= 0) continue;
      const d = host.pos.distanceToSquared(this.pos);
      // Prefer bodies not yet reeling so the chain spreads through the crowd.
      const score = d * (host.stagger > 0.2 ? 2.2 : 1);
      if (score < bestD && d < 14 * 14) {
        bestD = score;
        best = host;
      }
    }
    return best;
  }

  private fireSpread(count: number, spread: number, damageMul: number) {
    if (this.spec.id !== 'zoe') return;
    this.lookDir(_look);
    _right.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const origin = this.muzzle();
    const dmg = this.shotDamage() * damageMul * this.castScale;
    for (let i = 0; i < count; i += 1) {
      const t = count === 1 ? 0 : i / (count - 1) - 0.5;
      const dir = _tmp.copy(_look).addScaledVector(_right, t * spread * 6).normalize();
      this.spawnBolt(origin, dir, dmg, true, this.spec.color, this.spec.projectileSpeed);
    }
  }

  private pulse(radius: number, damage: number, knock: number) {
    for (const host of [...this.hosts]) {
      const dx = host.pos.x - this.pos.x;
      const dz = host.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > radius + host.radius) continue;
      _tmp.set(dx, 0, dz);
      if (_tmp.lengthSq() < 0.0001) _tmp.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      _tmp.normalize();
      this.hurtHost(host, damage * this.castScale, knock < 0 ? _tmp.multiplyScalar(-1) : _tmp);
      host.knock.multiplyScalar(Math.abs(knock) / 8);
    }
  }

  private prideDash() {
    this.lookDir(_look);
    _look.y = 0;
    if (_look.lengthSq() < 0.01) _look.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    _look.normalize();
    const hit = new Set<Host>();
    for (let s = 0; s < 9; s += 0.55) {
      this.pos.addScaledVector(_look, 0.55);
      this.pos.x = clamp(this.pos.x, -this.limit(), this.limit());
      this.pos.z = clamp(this.pos.z, -this.limit(), this.limit());
      resolveCircle(this.pos, PLAYER_RADIUS, this.world.obstacles);
      for (const host of this.hosts) {
        if (hit.has(host)) continue;
        const d = Math.hypot(host.pos.x - this.pos.x, host.pos.z - this.pos.z);
        if (d < host.radius + 1.35) {
          hit.add(host);
          this.hurtHost(host, 26 * this.castScale, _look);
        }
      }
    }
    this.iframes = Math.max(this.iframes, 0.28);
  }

  private cleave() {
    this.meleeT = 1;
    this.meleeStarted = true;
    _fwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const dmg = this.meleeDamage() * 1.45 * this.castScale;
    for (const host of this.hosts) {
      const dx = host.pos.x - this.pos.x;
      const dz = host.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 3.5 + host.radius) continue;
      const ang = Math.atan2(dx, dz);
      let diff = ang - this.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > 1.25) continue;
      this.hurtHost(host, dmg, _fwd);
    }
  }

  private greedSiphon() {
    let stolen = 0;
    for (const host of [...this.hosts]) {
      const dist = Math.hypot(host.pos.x - this.pos.x, host.pos.z - this.pos.z);
      if (dist > 5.4 + host.radius) continue;
      _tmp.set(host.pos.x - this.pos.x, 0, host.pos.z - this.pos.z).normalize();
      this.hurtHost(host, 18 * this.castScale, _tmp);
      stolen += 9;
    }
    this.aura = Math.min(this.maxAura, this.aura + stolen);
    if (stolen > 0 && this.burnout && this.aura >= this.maxAura * BURNOUT_RECOVERY) {
      this.burnout = false;
    }
  }

  private liftHosts(hold = 2.6) {
    for (const host of this.hosts) {
      const dist = Math.hypot(host.pos.x - this.pos.x, host.pos.z - this.pos.z);
      if (dist < 7.2 + host.radius) host.stun = Math.max(host.stun, hold);
    }
  }

  private blink() {
    const from = this.pos.clone();
    this.lookDir(_look);
    _look.y = 0;
    if (_look.lengthSq() < 0.01) _look.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    _look.normalize();
    let dist = 11;
    for (let s = dist; s > 1.2; s -= 0.5) {
      _tmp.copy(from).addScaledVector(_look, s);
      if (!pointBlocked(_tmp.x, _tmp.z, PLAYER_RADIUS + 0.15, this.world.obstacles) && Math.abs(_tmp.x) < this.limit() && Math.abs(_tmp.z) < this.limit()) {
        dist = s;
        break;
      }
      dist = 1.4;
    }
    this.pos.addScaledVector(_look, dist);
    resolveCircle(this.pos, PLAYER_RADIUS, this.world.obstacles);
    this.burst(from, this.spec.color, 22);
    this.burst(this.pos, this.spec.color, 18);
    for (const host of this.hosts) {
      const nearFrom = host.pos.distanceTo(from) < 4.2;
      const nearTo = host.pos.distanceTo(this.pos) < 4.2;
      if (nearFrom || nearTo) this.hurtHost(host, 28, _look);
    }
    this.iframes = Math.max(this.iframes, 0.25);
  }

  private spawnClones(sides: number[] = [-1, 1]) {
    this.clearClones();
    for (const side of sides) {
      const fighter = buildRyder(this.spec, { clone: true });
      this.scene.add(fighter.humanoid.group);
      this.clones.push({ fighter, fireCd: 0.15, side });
    }
  }

  private clearClones() {
    this.clones.forEach((c) => {
      this.scene.remove(c.fighter.humanoid.group);
      disposeObject(c.fighter.humanoid.group);
    });
    this.clones = [];
  }

  private updateClones(dt: number) {
    if (!this.player || this.clones.length === 0) return;
    _fwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    _right.set(-_fwd.z, 0, _fwd.x);
    for (const clone of this.clones) {
      _tmp.copy(this.pos).addScaledVector(_right, clone.side * 1.65).addScaledVector(_fwd, -0.4);
      const cp = clone.fighter.humanoid.group.position;
      cp.lerp(_tmp.setY(0), 0.25);
      cp.y = this.world.heightAt(cp.x, cp.z);
      const target = this.nearestHost(clone.fighter.humanoid.group.position);
      if (target) {
        const dx = target.pos.x - clone.fighter.humanoid.group.position.x;
        const dz = target.pos.z - clone.fighter.humanoid.group.position.z;
        clone.fighter.humanoid.group.rotation.y = Math.atan2(dx, dz);
      } else {
        clone.fighter.humanoid.group.rotation.y = this.yaw;
      }
      if (clone.fighter.meshSource === 'gltf') {
        animateGltfFighter(clone.fighter, dt, this.anim + clone.side, 0.6, false, 0, false);
      } else {
        animateHumanoid(clone.fighter.humanoid, this.anim + clone.side, 0.6, this.clock.elapsedTime);
        poseAim(clone.fighter.humanoid, 0.1);
      }
      clone.fireCd -= dt;
      if (this.spec.id === 'zoe' && clone.fireCd <= 0 && target && !this.burnout) {
        clone.fireCd = 1 / Math.max(2, this.spec.fireRate * 0.75);
        _tmp2
          .copy(target.pos)
          .setY(target.fighter.humanoid.group.position.y + 1.1)
          .sub(clone.fighter.humanoid.group.position.clone().setY(clone.fighter.humanoid.group.position.y + 1.1))
          .normalize();
        this.spawnBolt(
          clone.fighter.humanoid.group.position.clone().setY(clone.fighter.humanoid.group.position.y + 1.25),
          _tmp2,
          this.shotDamage() * 0.55,
          true,
          this.spec.color,
          this.spec.projectileSpeed,
        );
      }
    }
  }

  private livingEnemies() {
    return this.hosts.filter((host) => !host.ally && host.hp > 0).length;
  }

  private livingAllies() {
    return this.hosts.filter((host) => host.ally && host.hp > 0).length;
  }

  private squadSize() {
    return 1 + (this.raidPlan?.allies.length ?? 0);
  }

  private applyPlan(plan: DirectorPlan) {
    this.survivalPlan = plan;
    this.tactics = plan.scale.tactics;
    this.queue = plan.opening.slice();
    this.reserve = plan.reserve.slice();
    this.spawnedThisRound = 0;
    this.signalBank.beginRound();
    this.engagement.reset();
    this.secondWindUsed = false;
    this.signalHazard = null;
    this.hazardWait = 12;
    this.stormT = plan.event === 'storm' ? 16 : 0;
    if (plan.event === 'breach' && this.reserve.length) {
      const spill = Math.ceil(this.reserve.length / 2);
      this.queue.push(...this.reserve.splice(0, spill));
    }
    this.restockStations();
  }

  private beginRaid() {
    this.raidWave = 1;
    this.phase = 'playing';
    this.applyPlan(directRound(1, this.squadSize(), Math.random, this.raidPlan?.difficulty ?? 'normal'));
    this.spawnTimer = 0.6;
    const banner = roundBanner(1);
    const place = this.arena.id === 'island-paradise' ? 'THE SIGNAL REACHES THE ISLAND' : banner.sub;
    this.banner = { title: banner.title, sub: `RAID · ${place}` };
    this.bannerT = 2.4;
  }

  private updateRaid(dt: number) {
    if (this.phase !== 'playing') return;
    this.tickHazard(dt);
    this.spawnTimer -= dt;
    this.releaseReserve();
    this.stageSpawns();
    if (this.queue.length === 0 && this.reserve.length === 0 && this.livingEnemies() === 0 && this.raidWave > 0) {
      this.openStatBoard();
    }
  }

  /**
   * Staged spawning. The round's population is fixed (round × 8); this only
   * decides how many stand at once. Later rounds release small batches so the
   * street refills as fast as it empties without ever exceeding the crowd budget.
   */
  private stageSpawns() {
    const scale = this.survivalPlan.scale;
    const budget = getCrowdBudget();
    const cap = Math.min(scale.cap, budget.maxAlive, MAX_ALIVE_HOSTS);
    let batch = Math.max(1, scale.spawnBatch);
    while (this.spawnTimer <= 0 && this.queue.length && this.livingEnemies() < cap) {
      const order = this.queue.shift();
      if (order) this.spawnHost(order, scale);
      batch -= 1;
      if (batch <= 0) {
        this.spawnTimer += scale.spawnInterval;
        batch = Math.max(1, scale.spawnBatch);
      }
    }
    // The crowd is full: hold the timer so the next opening fires at once.
    if (this.spawnTimer < -scale.spawnInterval) this.spawnTimer = -scale.spawnInterval;
  }

  private failRaid() {
    this.flushSignalOrbs(false);
    this.phase = 'dead';
    this.banner = { title: 'RAID DEFEAT', sub: 'THE SQUAD IS DOWN' };
    this.bannerT = 30;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  private ensureStatLine(seat: number, ryderId: RyderId, control: SquadStatLine['control']) {
    if (this.statLines.has(seat)) return;
    const spec = RYDERZ[ryderId];
    this.statLines.set(seat, {
      seat,
      ryderId,
      name: spec.name,
      control,
      round: emptyStat(),
      raid: emptyStat(),
    });
  }

  /** Ally damage is resolved with that seat as the killer, then the flag is put back. */
  private creditAlly(host: Host, run: () => void) {
    const previous = this.creditSeat;
    this.creditSeat = host.seat ?? -1;
    this.allowAllyDamage = true;
    try {
      run();
    } finally {
      this.allowAllyDamage = false;
      this.creditSeat = previous;
    }
  }

  private noteDamage(seat: number, amount: number) {
    if (this.gameMode === GameMode.PVP || seat < 0 || amount <= 0) return;
    const line = this.statLines.get(seat);
    if (!line) return;
    line.round.damage += amount;
    line.raid.damage += amount;
  }

  private noteKill(seat: number) {
    if (this.gameMode === GameMode.PVP || seat < 0) return;
    const line = this.statLines.get(seat);
    if (!line) return;
    line.round.kills += 1;
    line.raid.kills += 1;
  }

  private noteDown(seat: number) {
    if (this.gameMode === GameMode.PVP || seat < 0) return;
    const line = this.statLines.get(seat);
    if (!line) return;
    line.round.downs += 1;
    line.raid.downs += 1;
  }

  private actingSeat() {
    return this.allowAllyDamage ? this.creditSeat : this.controlledSeat;
  }

  private markSeatControl(seat: number, control: SquadStatLine['control']) {
    const line = this.statLines.get(seat);
    if (line) line.control = control;
  }

  private openStatBoard() {
    if (this.gameMode === GameMode.PVP || this.phase === 'report') return;
    const round = this.gameMode === GameMode.RAID && this.raidPlan ? this.raidWave : this.round;
    if (round <= 0) return;
    this.reportRound = round;
    this.reportLeft = mvpRound(round) ? MVP_HOLD : REPORT_HOLD;
    if (this.gameMode === GameMode.RAID && this.raidPlan) this.awardPoints(RAID_REWARDS.round);
    else this.awardPoints(round * 250);
    // Round clear SP goes to every seat that is still in the fight. The bank
    // keeps the round keyed, so a reopened board cannot pay twice.
    const seats = this.gameMode === GameMode.RAID && this.raidPlan ? [...this.statLines.keys()] : [this.controlledSeat];
    this.flushSignalOrbs(true);
    for (const seat of seats) this.signalBank.roundClear(round, seat);
    this.phase = 'report';
    this.mapOpen = false;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  private tickReport(dt: number) {
    if (this.interactQueued) {
      this.interactQueued = false;
      this.closeStatBoard();
      return;
    }
    this.reportLeft = Math.max(0, this.reportLeft - dt);
    if (this.reportLeft <= 0) this.closeStatBoard();
  }

  private closeStatBoard() {
    if (this.phase !== 'report') return;
    for (const line of this.statLines.values()) line.round = emptyStat();
    const finished = this.reportRound;
    this.reportLeft = 0;
    this.keys.clear();
    this.interactQueued = false;
    if (this.gameMode === GameMode.RAID && this.raidPlan) {
      this.raidWave = finished + 1;
      this.pointsEarnedRound = 0;
      this.phase = 'playing';
      this.applyPlan(directRound(this.raidWave, this.squadSize(), Math.random, this.raidPlan.difficulty ?? 'normal'));
      this.spawnTimer = 1.1;
      this.banner = roundBanner(this.raidWave);
      this.bannerT = 2.4;
      return;
    }
    this.phase = 'intermission';
    this.intermissionLeft = INTERMISSION;
    this.pointsEarnedRound = 0;
    this.hp = Math.min(this.maxHp, this.hp + 16);
    this.banner = { title: 'ROUND CLEAR', sub: 'HOLD THE SPIRE · BUY STRENGTH' };
    this.bannerT = 3;
  }

  private publishStatBoard(): NonNullable<HudState['statBoard']> {
    const lines = [...this.statLines.values()]
      .sort((a, b) => a.seat - b.seat)
      .map((line) => ({
        ...line,
        round: { ...line.round },
        raid: { ...line.raid },
      }));
    return {
      round: this.reportRound,
      nextRound: this.reportRound + 1,
      raid: this.gameMode === GameMode.RAID && Boolean(this.raidPlan),
      mvp: mvpRound(this.reportRound),
      left: this.reportLeft,
      lines,
      pointsEarned: this.pointsEarnedRound,
      upgradesBought: this.upgradesBought,
    };
  }

  private async spawnRaidAllies() {
    const allies = this.raidPlan?.allies ?? [];
    let index = 0;
    for (const ally of allies) {
      if (this.disposed) return;
      await this.spawnAlly(ally.ryderId, index, ally.playerId, ally.human, ally.seat, undefined, ally.human ? ally.skinId ?? null : undefined);
      index += 1;
    }
  }

  private async spawnAlly(
    id: RyderId,
    index: number,
    playerId: string | null = null,
    remoteHuman = false,
    seat = index + 1,
    placed?: {
      fighter: Fighter;
      x: number;
      z: number;
      yaw: number;
      airY: number;
      airVel: number;
      hp: number;
      maxHp: number;
      aura: number;
      maxAura: number;
      down: number;
      power?: PowerClock;
      look?: RyderSpec;
    },
    /** A remote player's skin from the room. Undefined uses this player's own pick for that Ryder. */
    skinId?: string | null,
  ) {
    const spec = placed?.fighter ? placed.look ?? RYDERZ[id] : (await resolveAppearance(id, remoteHuman ? skinId ?? null : skinId)).spec;
    if (this.disposed) return;
    const fighter = placed?.fighter ?? buildRyder(spec, { clone: true });
    const offsets = [
      { x: 2.4, z: -1.6 },
      { x: -2.4, z: -1.6 },
      { x: 1.35, z: -3.6 },
      { x: -1.35, z: -3.6 },
    ];
    const offset = offsets[index] ?? { x: 1.6 * (index + 1), z: -2 };
    const pos = placed
      ? new THREE.Vector3(placed.x, 0, placed.z)
      : new THREE.Vector3(this.pos.x + offset.x, 0, this.pos.z + offset.z);
    fighter.humanoid.group.position.copy(pos);
    fighter.humanoid.group.position.y = this.bodyHeight(pos.x, pos.z, true);
    if (placed) {
      fighter.humanoid.group.rotation.order = 'YXZ';
      fighter.humanoid.group.rotation.x = 0;
      fighter.humanoid.group.rotation.z = 0;
      fighter.humanoid.group.rotation.y = placed.yaw;
      setHumanoidOpacity(fighter.humanoid, 1);
    }
    this.scene.add(fighter.humanoid.group);
    const focus = new THREE.Vector3(pos.x, 0, pos.z + 4);
    const vel = new THREE.Vector3();
    const host: Host = {
      kind: 'walker',
      fighter,
      hp: placed?.hp ?? spec.maxHp,
      maxHp: placed?.maxHp ?? spec.maxHp,
      pos,
      radius: PLAYER_RADIUS,
      speed: spec.speed * 0.92,
      damage: spec.meleeDamage,
      mass: 1,
      preferredRange: 0,
      cooldown: 0.4,
      anim: 0,
      hit: 0,
      knock: new THREE.Vector3(),
      points: 0,
      summon: 99,
      stun: 0,
      swing: false,
      stagger: 0,
      airY: placed?.airY ?? 0,
      airVel: placed?.airVel ?? 0,
      lean: 0,
      spin: 0,
      tumble: 0,
      held: 0,
      sink: 0,
      chain: 0,
      hitColor: 0xffffff,
      throwWind: 0,
      winding: false,
      follow: null,
      duelist: true,
      ally: true,
      playerId,
      remoteHuman,
      ryderId: id,
      look: spec,
      aura: placed?.aura ?? spec.maxAura,
      maxAura: placed?.maxAura ?? spec.maxAura,
      dealt: 0,
      seat,
      down: placed?.down ?? 0,
      swims: true,
      sinceAttack: 0,
      token: false,
      sinceSeen: 0,
      canDodge: false,
    };
    this.ensureStatLine(seat, id, remoteHuman ? 'human' : 'computer');
    let foe: Host | null = null;
    let regroup = true;
    const cpu = new PvpCpu(
      {
        scene: this.scene,
        particles: this.particles,
        rings: this.rings,
        cracks: this.cracks,
        afterimages: this.afterimages,
        camera: this.rig,
        cameraObject: this.camera,
        playerPos: focus,
        playerHp: () => foe?.hp ?? 0,
        playerMaxHp: () => foe?.maxHp ?? 1,
        setPlayerHp: (value) => {
          if (foe && foe.hp > 0) foe.hp = Math.max(0, value);
        },
        playerAttacking: () => Boolean(foe?.swing),
        playerVelocity: () => vel,
        playerIntangible: () => false,
        playerWhiff: () => false,
        playerStunned: () => (foe?.stagger ?? 0) > 0.08 || (foe?.stun ?? 0) > 0,
        playerMemory: () => ({ punch: 0, kick: 0, melee: 0, ability: 0, dodge: 0, retreat: 0 }),
        heightAt: (x, z) => this.bodyHeight(x, z, true),
        waterDepth: (x, z) => this.waterDepth(x, z),
        resolve: (body) => {
          body.x = clamp(body.x, -this.limit(), this.limit());
          body.z = clamp(body.z, -this.limit(), this.limit());
          resolveCircle(body, PLAYER_RADIUS, this.world.obstacles);
        },
        blocked: (x, z, radius) => this.npcBlocked(x, z, radius),
        routeTo: (fromX, fromZ, toX, toZ, radius) => this.world.routeTo?.(fromX, fromZ, toX, toZ, radius) ?? null,
        hurtPlayer: (amount, dir, _kind, physical) => {
          const target = foe;
          if (!target || target.hp <= 0 || target.ally) return;
          host.dealt = (host.dealt ?? 0) + amount;
          this.creditAlly(host, () => this.hurtHost(target, amount, dir, physical?.reaction, physical?.strength ?? 1));
        },
        stunPlayer: (seconds) => {
          if (foe) foe.stun = Math.max(foe.stun, seconds);
        },
        suppressPlayer: () => {},
        time: () => this.simTime,
        sound: (soundId) => this.emitSound(soundId),
        playerHazards: () => this.kit?.hazards?.() ?? [],
        healSquad: (fraction: number) => {
          if (fraction <= 0) return;
          if (this.hp > 0) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * fraction);
          for (const other of this.hosts) {
            if (!other.ally || other.hp <= 0) continue;
            other.hp = Math.min(other.maxHp, other.hp + other.maxHp * fraction);
          }
        },
        raidTargets: () => this.hosts.filter((other) => !other.ally && !other.duelist && other.hp > 0),
        holdRaidTarget: (target: KitTarget, seconds: number) => {
          const foeHost = target as Host;
          if (!this.hosts.includes(foeHost) || foeHost.ally || foeHost.hp <= 0) return;
          foeHost.held = Math.max(0, seconds);
          if (seconds > 0) {
            foeHost.knock.set(0, 0, 0);
            foeHost.airVel = 0;
          }
        },
        hurtRaidTarget: (target: KitTarget, amount: number, dir: THREE.Vector3, reaction?: HitReaction, strength = 1) => {
          const foeHost = target as Host;
          if (foeHost.ally || foeHost.hp <= 0) return 0;
          const before = foeHost.hp;
          host.dealt = (host.dealt ?? 0) + amount;
          this.creditAlly(host, () => this.hurtHost(foeHost, amount, dir, reaction, strength));
          return Math.max(0, before - Math.max(0, foeHost.hp));
        },
        flashRaidTarget: (target: KitTarget, color: number, seconds: number) => {
          const foeHost = target as Host;
          foeHost.hit = Math.max(foeHost.hit, seconds);
          foeHost.hitColor = color;
        },
        regrouping: () => regroup,
      },
      id,
      this.allyDifficulty(),
    );
    cpu.attach(host, spec);
    if (placed?.power) {
      cpu.takePower(placed.power);
      if (placed.power.dry > 0) host.aura = 0;
    }
    host.cpu = cpu;
    let trackedX = 0;
    let trackedZ = 0;
    const aim = (dt = 0.05) => {
      const foes = this.hosts.filter((other) => !other.ally && !other.duelist && other.hp > 0);
      const index = allyFocusIndex(
        host.pos,
        this.pos,
        foes.map((other) => ({ x: other.pos.x, z: other.pos.z, hp: other.hp })),
        Boolean(host.pressing),
      );
      const target = index >= 0 ? foes[index] : null;
      if (target) {
        if (foe !== target) vel.set(0, 0, 0);
        else {
          const step = Math.max(0.016, dt);
          vel.set((target.pos.x - trackedX) / step, 0, (target.pos.z - trackedZ) / step);
        }
        trackedX = target.pos.x;
        trackedZ = target.pos.z;
        host.pressing = true;
        regroup = false;
        foe = target;
        const leadX = Math.max(-2.2, Math.min(2.2, vel.x * 0.22));
        const leadZ = Math.max(-2.2, Math.min(2.2, vel.z * 0.22));
        focus.set(target.pos.x + leadX, 0, target.pos.z + leadZ);
        return;
      }
      host.pressing = false;
      regroup = true;
      foe = null;
      vel.set(0, 0, 0);
      const spot = formUp(this.pos.x, this.pos.z, host.seat ?? 1);
      focus.set(spot.x, 0, spot.z);
    };
    (host as Host & { aim?: (dt?: number) => void }).aim = aim;
    if ((host.down ?? 0) > 0) {
      host.hp = 0;
      host.cpu?.stun();
    }
    this.hosts.push(host);
  }

  private driveAlly(host: Host, dt: number) {
    const remote = host.playerId ? this.allyInputs.get(host.playerId) : null;
    if (host.remoteHuman && remote && Date.now() - remote.at < 700) {
      const mag = Math.hypot(remote.x, remote.z);
      if (mag > 0.08) {
        host.pos.x += (remote.x / mag) * host.speed * dt;
        host.pos.z += (remote.z / mag) * host.speed * dt;
        host.pos.x = clamp(host.pos.x, -this.limit(), this.limit());
        host.pos.z = clamp(host.pos.z, -this.limit(), this.limit());
        resolveCircle(host.pos, host.radius, this.world.obstacles);
        host.fighter.humanoid.group.rotation.y = Math.atan2(remote.x, remote.z);
      }
      host.fighter.humanoid.group.position.copy(host.pos);
      host.fighter.humanoid.group.position.y = this.bodyHeight(host.pos.x, host.pos.z, true);
      this.animateHost(host, dt, Math.min(1, mag), this.simTime);
      return;
    }
    const aim = (host as Host & { aim?: (dt?: number) => void }).aim;
    aim?.(dt);
    if (host.held > 0) {
      stepReaction(host, dt);
      host.cpu?.stun();
      return;
    }
    host.cpu?.update(dt, this.simTime);
    if (host.cpu) {
      host.aura = host.cpu.aura;
      host.maxAura = host.cpu.maxAura;
    }
  }

  /** True while the local raider or a living teammate is still fighting. */
  private squadUp(except?: Host) {
    const playerUp = this.hp > 0 && !this.raidDown;
    const allies = this.hosts.filter(
      (host) => host.ally && host !== except && host.hp > 0 && (host.down ?? 0) <= 0,
    ).length;
    return squadStillStanding(playerUp, allies);
  }

  private tickSquadDown(dt: number) {
    if (this.gameMode !== GameMode.RAID || !this.raidPlan || this.phase !== 'playing') return;
    if (this.raidDown && this.downLeft > 0) {
      this.downLeft = Math.max(0, this.downLeft - dt);
      if (this.downLeft <= 0 && !this.squadUp()) this.failRaid();
    }
    for (const host of [...this.hosts]) {
      if (!host.ally || (host.down ?? 0) <= 0) continue;
      host.down = Math.max(0, (host.down ?? 0) - dt);
      if ((host.down ?? 0) <= 0) {
        this.expireAlly(host);
        if (this.phase === 'playing' && !this.squadUp()) this.failRaid();
      }
    }
  }

  private downAlly(host: Host) {
    host.hp = 0;
    host.held = 0;
    host.cpu?.stun();
    const already = (host.down ?? 0) > 0;
    if (!already) this.noteDown(host.seat ?? -1);
    if (!this.squadUp(host)) {
      this.expireAlly(host);
      if (this.phase === 'playing') this.failRaid();
      return;
    }
    if (already) return;
    host.down = DOWN_SECONDS;
    const name = host.ryderId ? RYDERZ[host.ryderId].name : 'A TEAMMATE';
    this.banner = { title: 'SQUAD DOWN', sub: `${name.toUpperCase()} NEEDS A PICKUP` };
    this.bannerT = 2.2;
  }

  /** The pickup window ran out. The body has already faded, so it leaves the fight. */
  private expireAlly(host: Host) {
    host.hp = 0;
    host.down = 0;
    host.cpu?.dispose();
    host.cpu = undefined;
    if (host.seat != null) this.closedSeats.add(host.seat);
    this.hosts = this.hosts.filter((other) => other !== host);
    this.scene.remove(host.fighter.humanoid.group);
    disposeObject(host.fighter.humanoid.group);
  }

  private presentDownedFighter(fighter: Fighter, left: number, dt: number) {
    const group = fighter.humanoid.group;
    const yaw = group.rotation.y;
    if (fighter.meshSource === 'gltf') {
      animateGltfFighter(fighter, dt, 0, 0, false, 0, false);
    } else {
      animateHumanoid(fighter.humanoid, 0, 0, this.simTime);
    }
    group.rotation.order = 'YXZ';
    group.rotation.y = yaw;
    group.rotation.x = 1.2;
    const fade = downOpacity(left);
    setHumanoidOpacity(fighter.humanoid, fade);
    fighter.glitch?.setOpacity(fade);
  }

  private presentDownedHost(host: Host, dt: number) {
    const group = host.fighter.humanoid.group;
    group.position.copy(host.pos);
    group.position.y = this.bodyHeight(host.pos.x, host.pos.z, Boolean(host.swims));
    this.presentDownedFighter(host.fighter, host.down ?? 0, dt);
  }

  private downedPatients(): Array<{ kind: 'local' } | { kind: 'ally'; host: Host }> {
    const list: Array<{ kind: 'local' } | { kind: 'ally'; host: Host }> = [];
    if (this.raidDown && this.downLeft > 0) list.push({ kind: 'local' });
    for (const host of this.hosts) {
      if (host.ally && (host.down ?? 0) > 0) list.push({ kind: 'ally', host });
    }
    return list;
  }

  private patientPoint(patient: { kind: 'local' } | { kind: 'ally'; host: Host }) {
    return patient.kind === 'local' ? this.pos : patient.host.pos;
  }

  /** Closest living teammate peels off to the fighter who is closest to fading. */
  private reviveClaim(self: Host) {
    let best: { patient: { kind: 'local' } | { kind: 'ally'; host: Host }; left: number } | null = null;
    const playerCan = this.hp > 0 && !this.raidDown;
    for (const patient of this.downedPatients()) {
      const point = this.patientPoint(patient);
      const mine = Math.hypot(self.pos.x - point.x, self.pos.z - point.z);
      let closer = false;
      for (const other of this.hosts) {
        if (!other.ally || other === self || other.hp <= 0 || (other.down ?? 0) > 0) continue;
        if (Math.hypot(other.pos.x - point.x, other.pos.z - point.z) + 0.2 < mine) {
          closer = true;
          break;
        }
      }
      if (playerCan && Math.hypot(this.pos.x - point.x, this.pos.z - point.z) + 0.2 < mine) closer = true;
      if (closer) continue;
      const left = patient.kind === 'local' ? this.downLeft : (patient.host.down ?? 0);
      if (!best || left < best.left) best = { patient, left };
    }
    return best?.patient ?? null;
  }

  private stepRevive(host: Host, dt: number) {
    const patient = this.reviveClaim(host);
    if (!patient) return false;
    const point = this.patientPoint(patient);
    const dx = point.x - host.pos.x;
    const dz = point.z - host.pos.z;
    const dist = Math.hypot(dx, dz) || 0.0001;
    if (dist <= REVIVE_RANGE) {
      const by = host.ryderId ? RYDERZ[host.ryderId].name : 'A TEAMMATE';
      this.revivePatient(patient, by, host.seat ?? -1);
      return true;
    }
    const step = Math.min(Math.max(0, dist - REVIVE_RANGE * 0.7), host.speed * dt);
    if (step > 0) {
      host.pos.x += (dx / dist) * step;
      host.pos.z += (dz / dist) * step;
      host.pos.x = clamp(host.pos.x, -this.limit(), this.limit());
      host.pos.z = clamp(host.pos.z, -this.limit(), this.limit());
      resolveCircle(host.pos, host.radius, this.world.obstacles);
    }
    const group = host.fighter.humanoid.group;
    group.position.copy(host.pos);
    group.position.y = this.bodyHeight(host.pos.x, host.pos.z, true);
    group.rotation.order = 'YXZ';
    group.rotation.x = 0;
    group.rotation.y = Math.atan2(dx, dz);
    this.animateHost(host, dt, 1, this.simTime);
    return true;
  }

  private revivePatient(patient: { kind: 'local' } | { kind: 'ally'; host: Host }, by: string, bySeat: number) {
    if (patient.kind === 'local') this.reviveLocal(by);
    else this.reviveAlly(patient.host, by);
    // Revive SP goes to the rescuer, once per patient per round, so trading downs pays nothing extra.
    if (bySeat >= 0) {
      const key = patient.kind === 'local' ? `seat:${this.controlledSeat}` : `seat:${patient.host.seat ?? -1}`;
      this.signalBank.revive(key, this.currentRound(), bySeat);
    }
  }

  private reviveLocal(by: string) {
    const next = reviveVitals(this.maxHp, this.maxAura, this.aura);
    this.raidDown = false;
    this.downLeft = 0;
    this.hp = next.hp;
    this.aura = next.aura;
    this.burnout = false;
    this.iframes = 1.15;
    if (this.player) {
      this.player.humanoid.group.rotation.x = 0;
      setHumanoidOpacity(this.player.humanoid, 1);
    }
    this.banner = { title: 'BACK UP', sub: `${by.toUpperCase()} PICKED YOU UP` };
    this.bannerT = 2;
    this.particles.emit(this.playerAt(0.8), this.spec.color, 18, { speed: 5, size: 0.28, life: 0.45, up: 1.2 });
  }

  private reviveAlly(host: Host, by: string) {
    const next = reviveVitals(host.maxHp, host.maxAura ?? 0, host.aura ?? 0);
    host.down = 0;
    host.hp = next.hp;
    host.aura = next.aura;
    host.stagger = 0;
    host.airY = 0;
    host.lean = 0;
    if (host.cpu) {
      host.cpu.aura = next.aura;
      host.cpu.maxAura = host.maxAura ?? host.cpu.maxAura;
      host.cpu.burnout = false;
      host.cpu.iframes = 1.15;
      host.cpu.stun();
    }
    host.fighter.humanoid.group.rotation.x = 0;
    setHumanoidOpacity(host.fighter.humanoid, 1);
    host.fighter.glitch?.setOpacity(1);
    const name = host.ryderId ? RYDERZ[host.ryderId].name : 'Teammate';
    this.banner = { title: 'PICKED UP', sub: `${by.toUpperCase()} GOT ${name.toUpperCase()} UP` };
    this.bannerT = 1.8;
    this.particles.emit(this.hostAt(host, 0.8), host.ryderId ? RYDERZ[host.ryderId].color : 0x39ff88, 16, {
      speed: 5,
      size: 0.26,
      life: 0.4,
      up: 1.1,
    });
  }

  private pickupNearestAlly() {
    const host = this.nearestDownedAlly();
    if (!host) return false;
    this.revivePatient({ kind: 'ally', host }, 'You', this.controlledSeat);
    return true;
  }

  private nearestDownedAlly() {
    let best: Host | null = null;
    let bestD = REVIVE_RANGE * REVIVE_RANGE;
    for (const host of this.hosts) {
      if (!host.ally || (host.down ?? 0) <= 0) continue;
      const d = (host.pos.x - this.pos.x) ** 2 + (host.pos.z - this.pos.z) ** 2;
      if (d <= bestD) {
        bestD = d;
        best = host;
      }
    }
    return best;
  }

  private revivePrompt(): HudState['revive'] {
    if (this.raidDown || this.hp <= 0 || this.phase !== 'playing') return null;
    const host = this.nearestDownedAlly();
    if (!host?.ryderId) return null;
    return { name: RYDERZ[host.ryderId].name, left: host.down ?? 0 };
  }

  private partyRows(): NonNullable<HudState['party']> {
    const rows: NonNullable<HudState['party']> = [
      {
        index: this.controlledSeat,
        hp: this.raidDown ? 0 : this.hp,
        maxHp: this.maxHp,
        aura: this.aura,
        maxAura: this.maxAura,
        alive: this.hp > 0 && !this.raidDown,
        bleed: this.raidDown ? this.downLeft / DOWN_SECONDS : 1,
        yours: true,
        playable: false,
      },
    ];
    for (const host of this.hosts) {
      if (!host.ally || host.seat == null || host.seat === this.controlledSeat) continue;
      const down = (host.down ?? 0) > 0;
      rows.push({
        index: host.seat,
        hp: down ? 0 : Math.max(0, host.hp),
        maxHp: host.maxHp,
        aura: host.aura ?? 0,
        maxAura: host.maxAura ?? 1,
        alive: host.hp > 0 && !down,
        bleed: down ? (host.down ?? 0) / DOWN_SECONDS : host.hp > 0 ? 1 : 0,
        yours: false,
        playable: canAssumeAlly({
          raid: true,
          phase: this.phase,
          seat: host.seat,
          controlledSeat: this.controlledSeat,
          remoteHuman: Boolean(host.remoteHuman),
          hp: host.hp,
          down: host.down ?? 0,
        }),
      });
    }
    for (const seat of this.closedSeats) {
      if (seat === this.controlledSeat || rows.some((row) => row.index === seat)) continue;
      rows.push({
        index: seat,
        hp: 0,
        maxHp: 1,
        aura: 0,
        maxAura: 1,
        alive: false,
        bleed: 0,
        yours: false,
        playable: false,
      });
    }
    return rows;
  }

  private beginRound(n: number) {
    this.round = n;
    this.phase = 'playing';
    this.applyPlan(directRound(n, 1));
    this.spawnTimer = 0.4;
    const banner = roundBanner(n);
    if (this.arena.id === 'training-pad' && n === 1) banner.sub = 'P.A.D. · TRAINING FACILITY';
    if (this.arena.id === 'island-paradise' && n === 1) banner.sub = 'THE SIGNAL REACHES THE ISLAND';
    this.banner = banner;
    this.bannerT = 3.2;
    this.kit?.onRound?.();
  }

  private releaseReserve() {
    const slack = Math.max(2, Math.floor(this.survivalPlan.scale.cap * 0.25));
    if (this.queue.length > 0 || this.reserve.length === 0 || this.livingEnemies() > slack) return;
    this.queue = this.reserve;
    this.reserve = [];
    this.spawnTimer = 0.35;
    this.banner = { title: 'REINFORCEMENTS', sub: 'ANOTHER GROUP IS MOVING IN' };
    this.bannerT = 2.2;
  }

  /** A marked patch of street. Apocalypse rounds telegraph it, then it bursts once. */
  private tickHazard(dt: number) {
    if (!this.tactics.hazards || this.phase !== 'playing') return;
    if (!this.signalHazard) {
      this.hazardWait -= dt;
      if (this.hazardWait > 0) return;
      const ang = Math.random() * Math.PI * 2;
      const dist = 2.2 + Math.random() * 3.4;
      this.signalHazard = {
        x: clamp(this.pos.x + Math.sin(ang) * dist, -this.limit(), this.limit()),
        z: clamp(this.pos.z + Math.cos(ang) * dist, -this.limit(), this.limit()),
        fuse: 1.45,
      };
      this.hazardWait = 15;
    }
    const hazard = this.signalHazard;
    this.particles.emit(new THREE.Vector3(hazard.x, this.world.heightAt(hazard.x, hazard.z) + 0.15, hazard.z), 0xff4d6a, 3, { speed: 1.4, size: 0.28, life: 0.28, up: 0.5 });
    hazard.fuse -= dt;
    if (hazard.fuse > 0) return;
    const dx = this.pos.x - hazard.x;
    const dz = this.pos.z - hazard.z;
    if (this.hp > 0 && dx * dx + dz * dz < 3.1 * 3.1) {
      this.hurtPlayer(12 * this.survivalPlan.scale.damage, new THREE.Vector3(dx, 0, dz).normalize());
    }
    this.particles.emit(new THREE.Vector3(hazard.x, this.world.heightAt(hazard.x, hazard.z) + 0.4, hazard.z), 0xff4d6a, 18, { speed: 6, size: 0.36, life: 0.45, up: 1.2 });
    this.signalHazard = null;
  }

  private updateRound(dt: number) {
    if (this.gameMode === GameMode.PVP) return;
    if (this.gameMode === GameMode.RAID && this.raidPlan) {
      this.updateRaid(dt);
      return;
    }
    if (this.phase === 'intermission') {
      this.intermissionLeft = Math.max(0, this.intermissionLeft - dt);
      if (this.intermissionLeft <= 0) this.beginRound(this.round + 1);
      return;
    }
    this.tickHazard(dt);
    this.spawnTimer -= dt;
    this.releaseReserve();
    this.stageSpawns();
    // A swayed or mind-controlled host is on our side; it must not hold the round open.
    if (this.queue.length === 0 && this.reserve.length === 0 && this.livingEnemies() === 0 && this.round > 0) {
      this.openStatBoard();
    }
  }

  /** Prefer alleys in the block the Ryder is standing in, so a wave still arrives on a four-block map. */
  private spawnAlley() {
    const clear = this.world.alleys.filter((alley) => this.spawnAllowed(alley.position));
    const alleys = clear.length ? clear : this.world.alleys;
    const reach = this.world.spawnReach ?? DISTRICT_SPAN * 0.65;
    if (Math.random() < 0.65) {
      const here = alleys.filter((alley) => {
        const dx = alley.position.x - this.pos.x;
        const dz = alley.position.z - this.pos.z;
        return dx * dx + dz * dz < reach * reach;
      });
      if (here.length) return here[Math.floor(Math.random() * here.length)];
    }
    return alleys[Math.floor(Math.random() * alleys.length)];
  }

  private spawnHost(order: SpawnOrder, scale: { hp: number; speed: number; damage: number }) {
    const kind = order.kind;
    const spec = ENEMIES[kind];
    const archetype = archetypeById(order.archetypeId);
    const alley = this.spawnAlley();
    const lateral = (Math.random() - 0.5) * 2.4;
    const pos = alley.position.clone();
    pos.x += alley.inward.z * lateral;
    pos.z += -alley.inward.x * lateral;
    const profileId = profileForKind(kind, Math.random());
    const civilian = definitionForProfile(profileId, Math.random());
    const fighter = this.acquireBody(kind, civilian.modelPath);
    const swims = Boolean(alley.aquatic);
    fighter.humanoid.group.position.copy(pos);
    fighter.humanoid.group.position.y = this.bodyHeight(pos.x, pos.z, swims);
    this.scene.add(fighter.humanoid.group);
    this.hosts.push({
      kind,
      swims,
      tier: archetype?.tier ?? 1,
      archetypeId: order.archetypeId,
      supernatural: Boolean(archetype?.supernatural),
      fighter,
      hp: spec.hp * scale.hp,
      maxHp: spec.hp * scale.hp,
      pos,
      radius: spec.radius,
      speed: spec.speed * scale.speed,
      damage: spec.damage * scale.damage,
      mass: spec.mass,
      preferredRange: spec.preferredRange,
      cooldown: 0.4 + Math.random() * 0.4,
      anim: Math.random() * 10,
      hit: 0,
      knock: new THREE.Vector3(),
      points: spec.points,
      summon: 6,
      stun: 0,
      swing: false,
      stagger: 0,
      airY: 0,
      airVel: 0,
      lean: 0,
      spin: 0,
      tumble: 0,
      held: 0,
      sink: 0,
      chain: 0,
      hitColor: 0xffffff,
      striker: this.makeCivilianStriker(),
      profileId: civilian.profile,
      animMap: civilian.animationMap,
      heldItem: null,
      throwWind: 0,
      winding: false,
      follow: null,
      guard: 0,
      powerCd: archetype?.supernatural ? 2.4 : 0,
      sinceAttack: 1 + Math.random() * 2,
      token: false,
      sinceSeen: 0,
      canDodge: false,
      modelPath: civilian.modelPath ?? null,
    });
    this.spawnedThisRound += 1;
    const spawned = this.hosts[this.hosts.length - 1];
    if (spawned && this.world.training) this.paintTraining(spawned, true);
  }

  /** Cyan signal glow for hosts inside P.A.D. Lab. Bodies stay opaque. Restored when they leave. */
  private paintTraining(host: Host, on: boolean) {
    host.fighter.humanoid.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        const std = mat as THREE.MeshStandardMaterial;
        if (!std.emissive) continue;
        const data = std.userData as { padBase?: { emissive: number; intensity: number } };
        if (!data.padBase) {
          data.padBase = { emissive: std.emissive.getHex(), intensity: std.emissiveIntensity ?? 0 };
        }
        const base = data.padBase;
        if (on) {
          std.emissive.setHex(0x39e7ff);
          std.emissiveIntensity = 0.55;
        } else {
          std.emissive.setHex(base.emissive);
          std.emissiveIntensity = base.intensity;
        }
      }
    });
  }

  private makeCivilianStriker() {
    const striker = new FighterStriker();
    striker.setRyder(null);
    return striker;
  }

  private updateHosts(dt: number, time: number) {
    const phased = this.isPhased();
    const shielded = this.isActive('forcefield');
    const budget = getCrowdBudget();
    this.frameTick += 1;

    // Spatial hash: separation and neighbour counts stay near-linear in a 40-body crowd.
    this.grid.rebuild(this.hosts);
    this.grid.separate(this.hosts);
    for (const host of this.hosts) {
      if (host.held > 0) continue;
      resolveCircle(host.pos, host.radius, this.world.obstacles);
    }
    this.assignAttackTokens();

    for (const host of this.hosts) {
      host.pacified = Math.max(0, (host.pacified ?? 0) - dt);
      host.immobile = Math.max(0, (host.immobile ?? 0) - dt);
      host.exposed = Math.max(0, (host.exposed ?? 0) - dt);
      const crowd = (host.pacified ?? 0) > 0 || (host.immobile ?? 0) > 0;
      if (host.ally && host.cpu) {
        if ((host.down ?? 0) > 0) {
          this.presentDownedHost(host, dt);
          continue;
        }
        host.fighter.humanoid.group.rotation.x = 0;
        if (crowd) {
          this.idleCrowd(host, dt, time);
          continue;
        }
        if (this.stepRevive(host, dt)) continue;
        this.driveAlly(host, dt);
        continue;
      }
      if (host.duelist && host.controlled) {
        this.driveLocalOpponent(host, dt, time);
        continue;
      }
      if (host.duelist && this.pvpCpu) {
        if (host.held > 0) {
          if (!this.casedCpu) {
            this.casedCpu = true;
            this.pvpCpu.stun();
          }
          stepReaction(host, dt);
          host.knock.set(0, 0, 0);
          const group = host.fighter.humanoid.group;
          group.rotation.order = 'YXZ';
          group.position.copy(host.pos);
          group.position.y = this.world.heightAt(host.pos.x, host.pos.z) - host.sink;
          group.rotation.x = 0;
          this.animateHost(host, dt, 0, time);
          if (host.hit > 0) flashEmissive(host.fighter.humanoid, host.hitColor, host.hit * 2.4);
          else flashEmissive(host.fighter.humanoid, 0x3de7ff, 0.35);
          continue;
        }
        if (crowd) {
          this.pvpCpu.stun();
          this.idleCrowd(host, dt, time);
          continue;
        }
        this.casedCpu = false;
        this.pvpCpu.update(dt, this.simTime);
        host.aura = this.pvpCpu.aura;
        host.maxAura = this.pvpCpu.maxAura;
        continue;
      }
      if (host.duelist && host.maxAura) {
        host.aura = Math.min(host.maxAura, (host.aura ?? host.maxAura) + dt * 4);
      }
      host.cooldown = Math.max(0, host.cooldown - dt);
      host.hit = Math.max(0, host.hit - dt);
      host.knock.multiplyScalar(Math.max(0, 1 - dt * 6));
      host.anim += dt * (6 + host.speed);
      host.stun = Math.max(0, host.stun - dt);
      const group = host.fighter.humanoid.group;
      group.rotation.order = 'YXZ';

      // In a Ryder's grip: the kit places the body (and pulls it under the
      // floor); no AI, no reactions until it lets go or the hold times out.
      if (host.held > 0) {
        stepReaction(host, dt);
        group.position.copy(host.pos);
        group.position.y = this.world.heightAt(host.pos.x, host.pos.z) - host.sink;
        group.rotation.x = -host.lean * 0.4;
        this.animateHost(host, dt, 0, time);
        if (host.hit > 0) flashEmissive(host.fighter.humanoid, host.hitColor, host.hit * 2.4);
        else flashEmissive(host.fighter.humanoid, 0x000000, 0);
        continue;
      }

      const farX = host.pos.x - this.pos.x;
      const farZ = host.pos.z - this.pos.z;
      const far2 = farX * farX + farZ * farZ;
      // Animation LOD: bodies past the animation radius pose every other frame.
      // Thinking is never skipped. A host on the far side of the map still
      // pathfinds to the Ryder every frame.
      host.animSkip = far2 > budget.animRadius * budget.animRadius && (this.frameTick + (host.lodTick ?? 0)) % 2 === 1;

      // Physical hit reactions: staggered hosts stop and reel, launched hosts
      // arc through the air and tumble, and both still drift with the shove.
      const landed = stepReaction(host, dt);
      if (landed) {
        host.stagger = Math.max(host.stagger, 0.35);
        this.particles.emit(this.hostAt(host, 0.15), 0x6a6070, 8, { speed: 3.5, size: 0.24, life: 0.4, up: 0.6, gravity: 6 });
      }
      if (host.airY > 0) {
        host.tumble += host.spin * dt;
        const room = this.headroom(host.pos.x, host.pos.z, 0.6);
        if (room !== null && host.airY > room) {
          host.airY = room;
          host.airVel = Math.min(host.airVel, 0);
        }
      } else host.tumble *= Math.max(0, 1 - dt * 10);
      if (host.stagger > 0 || host.airY > 0) {
        host.pos.x += host.knock.x * dt;
        host.pos.z += host.knock.z * dt;
        host.pos.x = clamp(host.pos.x, -this.limit(), this.limit());
        host.pos.z = clamp(host.pos.z, -this.limit(), this.limit());
        resolveCircle(host.pos, host.radius, this.world.obstacles);
        group.position.copy(host.pos);
        group.position.y = this.bodyHeight(host.pos.x, host.pos.z, Boolean(host.swims)) + host.airY - host.sink;
        // Reel back from the blow; spin while airborne.
        group.rotation.x = -host.lean * 0.5 - host.tumble;
        this.animateHost(host, dt, 0, time);
        if (host.hit > 0) flashEmissive(host.fighter.humanoid, host.hitColor, host.hit * 2.4);
        else flashEmissive(host.fighter.humanoid, 0x000000, 0);
        continue;
      }
      group.rotation.x = 0;

      if (host.stun > 0) {
        host.fighter.humanoid.group.position.copy(host.pos);
        host.fighter.humanoid.group.position.y =
          this.bodyHeight(host.pos.x, host.pos.z, Boolean(host.swims)) + Math.min(1.5, host.stun * 0.7);
        this.animateHost(host, dt, 0.12, time);
        if (host.hit > 0) flashEmissive(host.fighter.humanoid, host.hitColor, host.hit * 2.4);
        else flashEmissive(host.fighter.humanoid, 0x66cfff, 0.45);
        continue;
      }

      if (crowd) {
        this.idleCrowd(host, dt, time);
        continue;
      }

      this.driveCivilian(host, dt, time, phased, shielded);
    }
  }

  /**
   * The engagement director: only token holders swing. The number of tokens
   * grows with the round and the squad, so round 30 presses from every side
   * while round 1 is a readable one-two.
   */
  private assignAttackTokens() {
    if (this.gameMode === GameMode.PVP) return;
    const list = this.tokenScratch;
    list.length = 0;
    for (const host of this.hosts) {
      if (host.ally || host.duelist || host.hp <= 0) continue;
      const aim = this.hostAim(host);
      const dist = Math.hypot(aim.x - host.pos.x, aim.z - host.pos.z);
      host.aiDist = dist;
      list.push({
        ref: host,
        dist,
        sinceAttack: host.sinceAttack,
        tier: host.tier ?? 1,
        disabled: host.stagger > 0.05 || host.airY > 0.05 || host.held > 0 || host.stun > 0 || (host.pacified ?? 0) > 0 || (host.immobile ?? 0) > 0,
      });
    }
    const scale = this.survivalPlan.scale;
    const holders = this.engagement.assign(
      list,
      {
        slots: scale.attackSlots,
        reach: 5.6,
        rotate: 2.4 - Math.min(0.8, scale.round * 0.02),
        starve: Math.max(0.9, 2.1 - scale.round * 0.04),
        overflow: 4,
      },
      this.simTime,
    );
    this.attackersNow = holders.size;
    for (const c of list) (c.ref as Host).token = holders.has(c.ref);
  }

  /** Pacified or frozen bodies stay on the ground. They do not rise the way a stun does. */
  private idleCrowd(host: Host, dt: number, time: number) {
    host.striker?.interrupt();
    const group = host.fighter.humanoid.group;
    group.rotation.order = 'YXZ';
    group.rotation.x = 0;
    group.position.copy(host.pos);
    group.position.y = this.bodyHeight(host.pos.x, host.pos.z, Boolean(host.swims));
    this.animateHost(host, dt, 0, time);
    if (host.hit > 0) flashEmissive(host.fighter.humanoid, host.hitColor, host.hit * 2.4);
    else flashEmissive(host.fighter.humanoid, 0x000000, 0);
  }

  /** Outward unit vector when a host is standing in one of the player's danger zones. */
  private hazardPush(x: number, z: number) {
    const zones = this.kit?.hazards?.() ?? [];
    let best: { x: number; z: number; push: number } | null = null;
    for (const zone of zones) {
      const dx = x - zone.x;
      const dz = z - zone.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      const reach = zone.radius + (zone.kind === 'stomp' ? 1.35 : 0.4);
      if (dist > reach) continue;
      const push = (reach - dist) / reach;
      if (!best || push > best.push) best = { x: dx / dist, z: dz / dist, push };
    }
    return best;
  }

  private watchStall(
    host: Host,
    watch: NonNullable<Host['stall']>,
    wants: boolean,
    gx: number,
    gz: number,
    dt: number,
    seeking: ThrowBody | null,
  ) {
    // Net movement over a fixed window: a host shuffling back and forth on a corner still counts as stuck.
    if (!wants) {
      watch.x = host.pos.x;
      watch.z = host.pos.z;
      watch.t = 0;
      return;
    }
    watch.t += dt;
    if (watch.t < 1.6) return;
    const moved = Math.hypot(host.pos.x - watch.x, host.pos.z - watch.z);
    watch.x = host.pos.x;
    watch.z = host.pos.z;
    watch.t = 0;
    if (moved > 1.2) {
      watch.strikes = 0;
      return;
    }
    if (seeking) {
      host.passProp = seeking;
      host.passPropT = 12;
      watch.strikes = 0;
      return;
    }
    watch.strikes += 1;
    if (watch.strikes >= 2) {
      const aim = this.hostAim(host);
      if (Math.hypot(aim.x - host.pos.x, aim.z - host.pos.z) > 6 && this.blinkNear(host, aim.x, aim.z)) return;
    }
    let spot = this.world.openSpot?.(host.pos.x, host.pos.z, host.radius) ?? null;
    if (!spot) {
      const dx = gx - host.pos.x;
      const dz = gz - host.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      const side = Math.random() < 0.5 ? 1 : -1;
      spot = { x: host.pos.x - (dz / len) * 3 * side - (dx / len) * 1.2, z: host.pos.z + (dx / len) * 3 * side - (dz / len) * 1.2 };
    }
    watch.ox = spot.x;
    watch.oz = spot.z;
    watch.out = 1.4;
    if (host.nav) host.nav.lock = 0;
  }

  /**
   * A hunting host that has not closed on its target over a few seconds, while
   * the target stayed put, is lost behind something: it jumps in next to them.
   */
  private watchClosing(host: Host, watch: NonNullable<Host['stall']>, hunting: boolean, tx: number, tz: number, dt: number) {
    const dist = Math.hypot(tx - host.pos.x, tz - host.pos.z);
    if (!hunting || dist < 8 || host.held > 0) {
      watch.closeT = 0;
      return;
    }
    if (watch.closeT === 0) {
      watch.closeD = dist;
      watch.closePx = tx;
      watch.closePz = tz;
    }
    watch.closeT += dt;
    if (watch.closeT < 5) return;
    const closed = watch.closeD - dist;
    const targetMoved = Math.hypot(tx - watch.closePx, tz - watch.closePz);
    watch.closeT = 0;
    if (closed < 1.5 && targetMoved < 6) this.blinkNear(host, tx, tz);
  }

  /** Signal glitch: the host vanishes and reappears on open ground a few metres from (tx, tz). */
  private blinkNear(host: Host, tx: number, tz: number) {
    const start = Math.random() * Math.PI * 2;
    for (const ring of [3.5, 4.5, 6, 8]) {
      for (let i = 0; i < 16; i += 1) {
        const ang = start + (i / 16) * Math.PI * 2;
        const x = tx + Math.cos(ang) * ring;
        const z = tz + Math.sin(ang) * ring;
        if (this.npcBlocked(x, z, host.radius + 0.25)) continue;
        if (!host.swims && this.world.water && this.waterDepth(x, z) > 1.05) continue;
        if (!this.openLine(x, z, tx, tz, host.radius)) continue;
        if (this.hosts.some((o) => o !== host && o.hp > 0 && Math.hypot(o.pos.x - x, o.pos.z - z) < o.radius + host.radius + 0.4)) continue;
        this.particles.emit(this.hostAt(host, 1), 0xc45cff, 14, { speed: 4, size: 0.22, life: 0.4, up: 1 });
        host.pos.x = x;
        host.pos.z = z;
        host.knock.set(0, 0, 0);
        host.nav = freshNav();
        if (host.stall) {
          host.stall.out = 0;
          host.stall.strikes = 0;
          host.stall.t = 0;
          host.stall.closeT = 0;
          host.stall.x = x;
          host.stall.z = z;
        }
        this.particles.emit(this.hostAt(host, 1), 0xc45cff, 18, { speed: 4, size: 0.24, life: 0.45, up: 1 });
        return true;
      }
    }
    return false;
  }

  /** A body of `radius` can walk the straight segment between two points. */
  private openLine(ax: number, az: number, bx: number, bz: number, radius: number) {
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(len / 0.5));
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      if (this.npcBlocked(ax + (bx - ax) * t, az + (bz - az) * t, radius)) return false;
    }
    return true;
  }

  /** Walls, cars, and the map edge. Used so NPCs turn before they grind. */
  private npcBlocked(x: number, z: number, radius: number) {
    if (Math.abs(x) > this.limit() || Math.abs(z) > this.limit() || pointBlocked(x, z, radius, this.world.obstacles)) {
      return true;
    }
    const here = this.world.heightAt(x, z);
    const reach = Math.max(0.45, radius);
    const samples: Array<[number, number]> = [
      [reach, 0],
      [-reach, 0],
      [0, reach],
      [0, -reach],
    ];
    for (const [dx, dz] of samples) {
      if (slopeBlocks(this.world.heightAt(x + dx, z + dz) - here, reach, STEP_HEIGHT)) return true;
    }
    return false;
  }

  /**
   * Civilians close, stop, then punch, kick, shove, or throw. Walking into
   * the Ryder does not deal damage.
   */
  private driveCivilian(host: Host, dt: number, time: number, phased: boolean, shielded: boolean) {
    const striker = host.striker ?? this.makeCivilianStriker();
    host.striker = striker;
    const profile = CIVILIAN_PROFILES[host.profileId ?? profileForKind(host.kind, 0.2)];
    if (host.kind === 'broadcaster') {
      host.summon -= dt;
      const phase = host.maxHp > 0 ? host.hp / host.maxHp : 1;
      if (host.summon <= 0 && this.livingEnemies() < Math.min(this.survivalPlan.scale.cap, MAX_ALIVE_HOSTS) && this.phase === 'playing') {
        host.summon = phase < 0.3 ? 3.6 : phase < 0.6 ? 5.4 : 8;
        const caller = phase < 0.3 ? { kind: 'heavy' as const, archetypeId: 'enforcer' } : { kind: 'walker' as const, archetypeId: 'civilian' };
        this.spawnHost(caller, this.survivalPlan.scale);
      }
    }

    let slot = 0;
    for (const other of this.hosts) {
      if (other === host) break;
      if (!other.duelist && other.hp > 0) slot += 1;
    }
    const aim = this.hostAim(host);
    const pdx = aim.x - host.pos.x;
    const pdz = aim.z - host.pos.z;
    const playerDist = Math.hypot(pdx, pdz) || 0.0001;
    host.passPropT = Math.max(0, (host.passPropT ?? 0) - dt);
    if (!host.passPropT) host.passProp = null;
    const prop =
      this.throwables?.nearestFree(
        host.pos.x,
        host.pos.z,
        14,
        (item) => item === host.passProp || this.npcBlocked(item.pos.x, item.pos.z, 0.3),
      ) ?? null;
    const propDist = prop ? Math.hypot(prop.pos.x - host.pos.x, prop.pos.z - host.pos.z) : null;
    host.powerCd = Math.max(0, (host.powerCd ?? 0) - dt);
    host.guard = Math.max(0, (host.guard ?? 0) - dt);
    host.sinceAttack += dt;
    // Hosts always know where the Ryder is. Distance never sends them back to a patrol.
    host.sinceSeen = 0;
    const swayedEarly = swayOf(host, this.simTime);
    // Swayed hosts fight each other and ignore the token economy.
    const token = swayedEarly ? undefined : host.token;
    const sense: Parameters<typeof civilianOrder>[1] = {
      dist: playerDist,
      hpRatio: host.maxHp > 0 ? host.hp / host.maxHp : 1,
      holding: Boolean(host.heldItem),
      throwableDist: propDist,
      slot,
      recovering: striker.busy,
      rng: Math.random(),
      playerAttacking: this.striker.busy || this.meleeT > 0,
      playerTelegraphing: host.canDodge,
      playerChanneling: this.moveT.some((left) => left > 0.05),
      tier: host.tier ?? 1,
      tactics: this.tactics,
      token,
      comboReady: host.sinceAttack < 0.9 && host.sinceAttack > 0.3,
      ringDistance: 1.1 + Math.min(2.2, (slot % 4) * 0.45),
      sinceSeen: host.sinceSeen,
    };
    let order = civilianOrder(profile, sense);
    const swayed = swayOf(host, this.simTime);
    const turned = Boolean(swayed) && isProvoked(host);
    const rival = swayed && !turned ? pickRival(host, this.hosts) : null;
    const nowhereToTurn = Boolean(swayed) && !turned && !rival && influenceRank(host) !== 'elite';
    if (nowhereToTurn) order = { state: 'guard', move: 0, strafe: 0, attack: null };
    // A wounded host breaks off for a few seconds, then comes back. Left unchecked it runs into
    // the trees and hides there, and the last host of a round never comes out to be finished.
    host.braveT = Math.max(0, (host.braveT ?? 0) - dt);
    if (order.state === 'flee') {
      host.fleeT = (host.fleeT ?? 0) + dt;
      if (host.fleeT > 3.5 || playerDist > 16) {
        host.fleeT = 0;
        host.braveT = 10;
      }
      if (host.braveT > 0 || this.livingEnemies() <= 1) order = civilianOrder(profile, { ...sense, hpRatio: 1 });
    } else {
      host.fleeT = 0;
    }
    host.aiState = order.state;
    host.aiDist = playerDist;
    host.aiAttack = order.attack;
    host.aiWhy = !order.attack
      ? order.state
      : striker.busy
        ? 'animation'
        : host.cooldown > 0
          ? 'cooldown'
          : phased
            ? 'phased'
            : 'clear';
    if (order.state === 'guard' || order.state === 'defend') host.guard = 0.32;
    if (order.state === 'dodge' && host.cooldown <= 0.1) {
      // The side-step costs a beat and shows a dust kick, so a dodge is readable.
      host.cooldown = Math.max(host.cooldown, 0.35);
      this.particles.emit(this.hostAt(host, 0.2), 0x9a90a8, 6, { speed: 3, size: 0.2, life: 0.3, up: 0.5, gravity: 5 });
    }
    if (
      !swayed &&
      host.supernatural &&
      this.tactics.powers &&
      host.kind !== 'broadcaster' &&
      (host.powerCd ?? 0) <= 0 &&
      playerDist < 6.2 &&
      playerDist > 2.1 &&
      !phased
    ) {
      host.powerCd = 5.4;
      const pulse = new THREE.Vector3((aim.x - host.pos.x) / playerDist, 0, (aim.z - host.pos.z) / playerDist);
      this.particles.emit(this.hostAt(host, 1.2), 0xc45cff, 12, { speed: 5, size: 0.24, life: 0.35, direction: pulse });
      this.hurtPlayer(host.damage * 0.8, pulse);
    }

    if (order.state === 'pickup' && prop && !host.heldItem && this.throwables?.pickup(host, prop)) {
      host.heldItem = prop;
      host.cooldown = 0.28;
    }
    if (order.attack === 'throwObject' && host.heldItem && !phased && playerDist < 12) {
      if (!host.winding && host.cooldown <= 0) {
        host.winding = true;
        host.throwWind = 0.46;
        host.swing = true;
      }
    } else if (!host.heldItem) {
      host.winding = false;
      host.throwWind = 0;
    }
    if (host.winding && host.heldItem) {
      host.throwWind = Math.max(0, host.throwWind - dt);
      if (host.throwWind <= 0) {
        host.winding = false;
        const item = host.heldItem;
        const flight = Math.min(0.65, playerDist / Math.max(6, item.stats.throwForce));
        const thrownAt = this.hostAim(host);
        const aim = new THREE.Vector3(thrownAt.x, this.world.heightAt(thrownAt.x, thrownAt.z) + 1.05, thrownAt.z);
        const lead = thrownAt;
        aim.x += lead.vx * flight * 0.55;
        aim.z += lead.vz * flight * 0.55;
        const spread = 2.4 + (1 - profile.throwBias) * 3.2;
        const miss = (Math.random() - 0.5) * spread;
        this.throwables?.throwAt(item, this.hostAt(host, 1.35), aim, miss, host, this.simTime);
        host.heldItem = null;
        host.cooldown = 0.95 + Math.random() * 0.5;
        host.swing = true;
      }
    } else if (
      (order.attack === 'punch' || order.attack === 'kick' || order.attack === 'melee') &&
      !striker.busy &&
      host.cooldown <= 0 &&
      !phased &&
      !host.follow &&
      !this.hazardPush(host.pos.x, host.pos.z)
    ) {
      striker.queue(order.attack);
      host.sinceAttack = 0;
      // Telegraph: a flash the moment the swing is committed, before the hit frame.
      host.hit = Math.max(host.hit, 0.1);
      host.hitColor = (host.tier ?? 1) >= 4 ? 0xff6a3a : 0xffd27a;
      const pace = swayed?.mode === 'riot' ? 0.2 + swayed.haste * 0.05 : 0.48;
      host.cooldown = pace + Math.random() * (swayed?.mode === 'riot' ? 0.1 : 0.4);
      if (order.attack === 'punch' && Math.random() < (profile.id === 'brawler' || profile.id === 'aggressive' ? 0.55 : 0.28)) {
        host.follow = Math.random() < 0.6 ? 'punch' : 'kick';
      } else if (order.attack === 'kick' && Math.random() < 0.34) {
        host.follow = 'melee';
      }
    }
    if (host.follow === 'melee' && !phased && !striker.busy && host.cooldown <= 0) {
      striker.queue('melee');
      host.follow = null;
      host.cooldown = 0.4 + Math.random() * 0.2;
    }

    const chase = this.hostAim(host);
    let gx = chase.x;
    let gz = chase.z;
    if ((order.state === 'search' || order.state === 'pickup') && prop && (propDist ?? 99) < 14) {
      gx = prop.pos.x;
      gz = prop.pos.z;
    } else if (!phased) {
      const spread = this.tactics.surround || this.tactics.flank;
      const ang = spread ? slot * 2.15 + (this.tactics.flank ? 0.7 : 0) : slot * 1.9;
      // Token holders stand close; the rest hold a wider ring so the crowd reads as a crowd.
      const ring = (order.state === 'reposition' ? 2.4 : 0.85) + Math.min(slot, 4) * 0.16;
      gx += Math.cos(ang) * ring;
      gz += Math.sin(ang) * ring;
      if (this.tactics.protectElite && (host.tier ?? 1) <= 2) {
        const elite = this.hosts.find((other) => other !== host && !other.ally && other.hp > 0 && (other.tier ?? 1) >= 4);
        if (elite) {
          gx = (elite.pos.x * 2 + chase.x) / 3;
          gz = (elite.pos.z * 2 + chase.z) / 3;
        }
      }
    }
    const watch = (host.stall ??= { x: host.pos.x, z: host.pos.z, t: 0, out: 0, ox: 0, oz: 0, strikes: 0, closeT: 0, closeD: 0, closePx: 0, closePz: 0 });
    const aimDist = Math.hypot(gx - host.pos.x, gz - host.pos.z);
    if (watch.out > 0) {
      watch.out -= dt;
      if (Math.hypot(watch.ox - host.pos.x, watch.oz - host.pos.z) < 0.6) watch.out = 0;
      gx = watch.ox;
      gz = watch.oz;
    } else {
      const hop = this.world.routeTo?.(host.pos.x, host.pos.z, gx, gz, host.radius);
      if (hop) {
        gx = hop.x;
        gz = hop.z;
      }
    }
    const gdx = gx - host.pos.x;
    const gdz = gz - host.pos.z;
    const goalDist = Math.hypot(gdx, gdz) || 0.0001;
    let vx = (gdx / goalDist) * order.move;
    let vz = (gdz / goalDist) * order.move;
    vx += (-gdz / goalDist) * order.strafe;
    vz += (gdx / goalDist) * order.strafe;
    if (striker.busy) {
      vx *= 0.12;
      vz *= 0.12;
    }
    const hazard = this.hazardPush(host.pos.x, host.pos.z);
    if (hazard && this.tactics.dodgePowers) {
      vx = hazard.x * (1.1 + hazard.push);
      vz = hazard.z * (1.1 + hazard.push);
    } else if (hazard) {
      vx = vx * 0.65 + hazard.x * 0.28;
      vz = vz * 0.65 + hazard.z * 0.28;
    }
    if (!host.swims && this.waterDepth(host.pos.x, host.pos.z) > 1.05 && this.world.water) {
      const out = shallowDirection(host.pos.x, host.pos.z, (x, z) => this.world.water?.depthAt(x, z) ?? 0);
      if (out) {
        vx = out.x;
        vz = out.z;
      }
    }
    const hunting = playerDist > 12 && order.move > 0.2 && order.state !== 'flee' && order.state !== 'search' && order.state !== 'pickup';
    const speed = host.speed * profile.speed * (order.state === 'flee' || hazard ? 1.35 : hunting ? 1.45 : 1);
    const mag = Math.hypot(vx, vz);
    let travelX = 0;
    let travelZ = 0;
    if (mag > 0.05) {
      if (!host.nav) host.nav = freshNav();
      const steered = commitSteer(
        host.nav,
        host.pos.x,
        host.pos.z,
        (vx / mag) * speed,
        (vz / mag) * speed,
        host.radius,
        (x, z, radius) => this.npcBlocked(x, z, radius),
        gx,
        gz,
        dt,
      );
      travelX = steered.x;
      travelZ = steered.z;
      host.pos.x += travelX * dt + host.knock.x * dt;
      host.pos.z += travelZ * dt + host.knock.z * dt;
    } else {
      host.pos.x += host.knock.x * dt;
      host.pos.z += host.knock.z * dt;
    }
    host.pos.x = clamp(host.pos.x, -this.limit(), this.limit());
    host.pos.z = clamp(host.pos.z, -this.limit(), this.limit());
    resolveCircle(host.pos, host.radius, this.world.obstacles);
    const seeking = (order.state === 'search' || order.state === 'pickup') && prop ? prop : null;
    this.watchStall(host, watch, order.move > 0.2 && aimDist > 2.5 && !striker.busy, gx, gz, dt, seeking);
    const closingIn = !swayed && order.move > 0.2 && order.state !== 'flee' && order.state !== 'search' && order.state !== 'pickup';
    this.watchClosing(host, watch, closingIn, chase.x, chase.z, dt);
    if (!phased && !this.kit?.passthrough) {
      const sx = host.pos.x - this.pos.x;
      const sz = host.pos.z - this.pos.z;
      const sd = Math.hypot(sx, sz) || 0.0001;
      const min = host.radius + this.playerRadius() + 0.1;
      if (sd < min) {
        host.pos.x += (sx / sd) * (min - sd);
        host.pos.z += (sz / sd) * (min - sd);
      }
    }
    for (const other of this.grid.near(host.pos.x, host.pos.z, this.nearScratch)) {
      if (other === host || other.hp <= 0) continue;
      const ox = host.pos.x - other.pos.x;
      const oz = host.pos.z - other.pos.z;
      const od = Math.hypot(ox, oz) || 0.0001;
      const gap = host.radius + other.radius + 0.35;
      if (od >= gap) continue;
      host.pos.x += (ox / od) * (gap - od) * 0.5;
      host.pos.z += (oz / od) * (gap - od) * 0.5;
    }

    const faceAt = this.hostAim(host);
    const faceX = order.state === 'search' && prop ? prop.pos.x - host.pos.x : faceAt.x - host.pos.x;
    const faceZ = order.state === 'search' && prop ? prop.pos.z - host.pos.z : faceAt.z - host.pos.z;
    const facing = Math.atan2(faceX, faceZ);
    const group = host.fighter.humanoid.group;
    group.position.copy(host.pos);
    group.position.y = this.bodyHeight(host.pos.x, host.pos.z, Boolean(host.swims)) - host.sink;
    group.rotation.y = facing;

    if (host.heldItem && this.throwables) {
      const socket = host.fighter.rig?.weaponSocket;
      const lift = host.winding ? (1 - host.throwWind / 0.46) * 0.42 : 0;
      if (socket) this.throwables.grip(host.heldItem, socket, lift);
      else {
        this.throwables.holdPosition(
          host.heldItem,
          host.pos.x + Math.sin(facing) * 0.55,
          1.15 + lift,
          host.pos.z + Math.cos(facing) * 0.55,
        );
      }
    }

    const frenzy = swayed?.mode === 'riot' ? 1 + swayed.haste : 1;
    const haste = Math.min(1.85, Math.max(0.4, (host.attackScale ?? 1) * frenzy));
    const frame = striker.tick(dt * haste, {
      time: this.simTime,
      stunned: host.stagger > 0.05 || host.stun > 0,
      locked: false,
      facing,
      x: host.pos.x,
      z: host.pos.z,
      meleeDamage: host.damage,
      targets: phased ? [] : this.civilianTargets(host),
    });
    if (frame.lunge) {
      host.pos.x += Math.sin(facing) * frame.lunge * 0.65;
      host.pos.z += Math.cos(facing) * frame.lunge * 0.65;
      resolveCircle(host.pos, host.radius, this.world.obstacles);
      group.position.copy(host.pos);
    }
    const pose = striker.pose();
    if (frame.started) host.swing = true;
    if (host.follow === 'punch' || host.follow === 'kick') {
      if (striker.chainInto(host.follow)) host.follow = null;
    }
    const moving = Math.min(1, Math.hypot(travelX, travelZ) / Math.max(0.01, host.speed));
    this.animateHost(host, dt, moving, time, pose ? 1 - pose.p : 0, pose?.style, host.winding);
    if (swayed && host.hit <= 0.02) {
      host.hit = 0.14;
      host.hitColor = 0x228b22;
    }
    if (host.hit > 0) flashEmissive(host.fighter.humanoid, host.hitColor, host.hit * 2.4);
    else flashEmissive(host.fighter.humanoid, 0x000000, 0);

    this.cueStrike(frame);
    if (shielded && frame.hits.length) {
      this.particles.emit(this.playerAt(1.2), 0x66e7ff, 10, { speed: 6, size: 0.22, life: 0.3 });
      host.knock.set(-Math.sin(facing) * 8, 0, -Math.cos(facing) * 8);
      return;
    }
    for (const hit of frame.hits) {
      _tmp.set(Math.sin(facing), 0, Math.cos(facing));
      if (hit.target.ref !== this.playerBody) {
        const other = hit.target.ref as Host;
        if (swayed && other.hp > 0 && other !== host && !other.ally) {
          this.infighting = true;
          this.hurtHost(other, hit.damage, _tmp, hit.reaction, hit.strength);
          this.infighting = false;
        } else if (other.ally && other.hp > 0 && !swayed) {
          this.allowAllyDamage = true;
          this.hurtHost(other, hit.damage, _tmp, hit.reaction, hit.strength);
          this.allowAllyDamage = false;
        }
        continue;
      }
      // A blocked hit still reaches here; the player side decides how much lands.
      if (this.guarding) host.sinceAttack = Math.min(host.sinceAttack, 0.2);
      if (this.kit?.passthrough || this.hp <= 0) continue;
      this.raidTaken += hit.damage;
      this.hurtPlayer(hit.damage, _tmp, undefined, {
        reaction: hit.reaction,
        strength: hit.strength,
        hitStun: hit.hitStun,
        knockback: hit.knockback * 0.55,
      });
    }
  }

  /** Where this civilian is trying to get. A sway sends them at each other until TJ hurts them. */
  private hostAim(host: Host) {
    const mark = swayOf(host, this.simTime);
    if (mark && !isProvoked(host)) {
      const rival = pickRival(host, this.hosts);
      if (rival) return { x: rival.pos.x, z: rival.pos.z, vx: 0, vz: 0 };
      if (influenceRank(host) !== 'elite') return { x: host.pos.x, z: host.pos.z, vx: 0, vz: 0 };
    }
    return this.squadAim(host);
  }

  private squadAim(from: Host) {
    const choices: TrackPoint[] = [];
    if (this.hp > 0) {
      choices.push({
        x: this.pos.x,
        z: this.pos.z,
        vx: this.playerVel.x,
        vz: this.playerVel.z,
        hpRatio: this.maxHp > 0 ? this.hp / this.maxHp : 1,
        weight: 0.62,
      });
    }
    if (this.gameMode === GameMode.RAID) {
      for (const ally of this.hosts) {
        if (!ally.ally || ally.hp <= 0) continue;
        choices.push({
          x: ally.pos.x,
          z: ally.pos.z,
          vx: 0,
          vz: 0,
          hpRatio: ally.maxHp > 0 ? ally.hp / ally.maxHp : 1,
          weight: 1,
        });
      }
    }
    if (!choices.length) return { x: this.pos.x, z: this.pos.z, vx: 0, vz: 0 };
    return pressTarget(from.pos.x, from.pos.z, choices, this.tactics.targetWeak);
  }

  private civilianTargets(host?: Host) {
    const mark = host ? swayOf(host, this.simTime) : null;
    if (mark && host) {
      const targets: { ref: object; x: number; z: number; radius: number; airborne: boolean }[] = [];
      for (const other of this.hosts) {
        if (other === host || other.hp <= 0 || other.ally) continue;
        targets.push({ ref: other, x: other.pos.x, z: other.pos.z, radius: other.radius, airborne: other.airY > 0.3 });
      }
      const fightsPlayer = influenceRank(host) === 'elite' || isProvoked(host);
      if (fightsPlayer && this.hp > 0) {
        targets.push({ ref: this.playerBody, x: this.pos.x, z: this.pos.z, radius: PLAYER_RADIUS, airborne: this.airY > 0.3 });
      }
      return targets;
    }
    const targets: { ref: object; x: number; z: number; radius: number; airborne: boolean }[] = [];
    if (this.hp > 0) {
      targets.push({ ref: this.playerBody, x: this.pos.x, z: this.pos.z, radius: PLAYER_RADIUS, airborne: this.airY > 0.3 });
    }
    if (this.gameMode === GameMode.RAID) {
      for (const ally of this.hosts) {
        if (!ally.ally || ally.hp <= 0) continue;
        targets.push({ ref: ally, x: ally.pos.x, z: ally.pos.z, radius: ally.radius, airborne: ally.airY > 0.3 });
      }
    }
    return targets;
  }

  /** Block figures swing their limbs; GLB hosts run the skeleton through the strike. */
  private animateHost(
    host: Host,
    dt: number,
    moving: number,
    time: number,
    meleeT = 0,
    style?: MeleeStyle,
    throwing = false,
    pose: PoseOverride | null = null,
  ) {
    if (host.animSkip && !host.swing && meleeT <= 0) return;
    const swimming = Boolean(host.swims) && this.waterDepth(host.pos.x, host.pos.z) > 1.05;
    const stance = pose ?? (swimming ? { kind: 'swim' as const, t: (time % 1.15) / 1.15, weight: 1 } : null);
    if (host.fighter.meshSource === 'gltf') {
      animateGltfFighter(host.fighter, dt, host.anim, moving, host.speed > 5, meleeT, host.swing, {
        style,
        clipHint: clipHintFor(host.animMap, style, throwing),
        pose: stance,
      });
      host.swing = false;
    } else {
      animateHumanoid(host.fighter.humanoid, host.anim, moving, time);
    }
    host.fighter.glitch?.update(time, this.camera);
  }

  private hurtPlayer(amount: number, dir: THREE.Vector3, kind?: PvpDamageKind, physical?: PhysicalHit) {
    if (this.iframes > 0 || this.phase === 'dead' || this.kit?.intangible || this.raidDown) return;
    const scaled = kind ? calculatePvPDamage({ baseDamage: amount, kind }) : amount;
    // A braced Ryder (mid-spin) shrugs most of the blow off: less damage, no shove.
    let braced = clamp(this.kit?.braced ?? 0, 0, 1);
    const resist = this.kit?.incomingScale ?? 1;
    // A raised guard eats most of the hit and all of its stun. The tree's guard node adds to the block.
    const blocked = this.guarding && this.phase === 'playing';
    if (blocked) {
      braced = Math.max(braced, clamp(0.72 + this.modifiers.guard, 0, 0.95));
      this.guardT = Math.max(this.guardT, 0.1);
      this.particles.emit(this.playerAt(1.1), this.spec.color, 10, { speed: 5, size: 0.24, life: 0.3, up: 0.6 });
      this.emitSound('fight.punch.swing');
    }
    let incoming = scaled * (1 - (blocked ? braced : 0.4 * braced)) * resist;
    // Second Wind: once per round a lethal blow leaves one point of health.
    if (incoming >= this.hp && this.modifiers.passives.includes('secondWind') && !this.secondWindUsed && this.gameMode !== GameMode.PVP) {
      this.secondWindUsed = true;
      incoming = Math.max(0, this.hp - 1);
      this.iframes = Math.max(this.iframes, 1.2);
      this.banner = { title: 'SECOND WIND', sub: 'STILL STANDING' };
      this.bannerT = 1.6;
      this.powerVfx.surge(1);
    }
    this.hp = Math.max(0, this.hp - incoming);
    if (physical && blocked) {
      // Chip, a small push, and no stun. Blocking a launcher still lifts a little.
      this.hitKnock.copy(dir).multiplyScalar(physical.knockback * 0.35);
      this.hitStun = Math.max(this.hitStun, 0.05 * (1 - this.modifiers.hitStunResist));
      this.takenGap = 0;
    } else if (physical) {
      if (this.takenGap > 0.5) this.takenChain = 0;
      this.takenChain += 1;
      this.takenGap = 0;
      let stun = physical.hitStun * (1 - 0.65 * braced) * Math.max(0.3, 1 - this.modifiers.hitStunResist);
      if (this.takenChain >= 4) stun *= 0.5;
      if (this.takenChain >= 6) stun *= 0.45;
      this.hitStun = Math.max(this.hitStun, stun);
      this.iframes = Math.max(this.iframes, this.takenChain >= 4 ? 0.28 : 0.08);
      this.hitKnock.copy(dir).multiplyScalar(physical.knockback * (1 - braced));
      if (physical.reaction === 'launch' || physical.reaction === 'slam') {
        this.airVel = Math.max(this.airVel, 6.4);
        this.jumping = false;
      } else if (physical.reaction === 'heavy') {
        this.airVel = Math.max(this.airVel, 3.1);
        this.jumping = false;
      }
      this.striker.interrupt();
    } else {
      this.iframes = 0.55;
      this.pos.addScaledVector(dir, 0.35 * (1 - braced));
    }
    this.combatT = COMBAT_LINGER;
    this.rig.addShake(0.4 * (1 - 0.7 * braced));
    this.rig.addKick(0.22 * (1 - 0.7 * braced));
    this.particles.emit(this.playerAt(1.2), 0xff5570, 14, { speed: 6, size: 0.28, life: 0.4, up: 0.5 });
    if (this.hp <= 0) {
      this.hp = 0;
      if (this.gameMode === GameMode.RAID && this.raidPlan && this.squadUp()) {
        if (!this.raidDown) {
          this.raidDown = true;
          this.downLeft = DOWN_SECONDS;
          this.noteDown(this.controlledSeat);
          this.kit?.interrupt();
          this.striker.interrupt();
          this.banner = { title: 'YOU ARE DOWN', sub: 'A TEAMMATE CAN PICK YOU UP' };
          this.bannerT = 2.6;
        }
        return;
      }
      if (this.gameMode === GameMode.RAID && this.raidPlan) {
        this.failRaid();
        return;
      }
      this.flushSignalOrbs(false);
      this.phase = 'dead';
      this.kit?.interrupt();
      this.scheduler.clear();
      this.banner = {
        title: 'SIGNAL LOST',
        sub:
          this.arena.id === 'island-paradise' && this.swim.oxygen <= 0
            ? 'THE OCEAN TOOK YOU'
            : this.arena.id === 'training-pad'
              ? 'THE FACILITY TOOK YOU'
              : 'THE BLOCK TOOK YOU',
      };
      this.bannerT = 8;
      document.exitPointerLock();
    }
  }

  /**
   * Damage a host. With a `reaction` the host physically responds (stagger,
   * knockback, launch …); without one it takes the classic light shove so the
   * other Ryderz' moves behave exactly as before.
   */
  private hurtHost(host: Host, amount: number, dir: THREE.Vector3, reaction?: HitReaction, strength = 1) {
    if (host.hp <= 0) return;
    this.world.impact?.(host.pos.x, host.pos.z, reaction === 'launch' || strength > 1.2 ? 2.2 : 1.1);
    if (host.ally && !this.allowAllyDamage) return;
    if (!host.ally && !this.infighting && this.spec.id === 'tj') provoke(host);
    if (host.ally && host.cpu) amount *= host.cpu.incomingScale;
    if (host.ally && host.cpu && (host.cpu.iframes > 0 || host.cpu.intangible)) return;
    if (host.duelist && !host.ally && !host.controlled && this.pvpCpu && (this.pvpCpu.iframes > 0 || this.pvpCpu.intangible)) return;
    if (this.gameMode === GameMode.PVP && host.duelist) {
      amount = calculatePvPDamage({ baseDamage: amount, kind: this.outgoingPvpKind() });
    }
    if (!host.ally && (host.guard ?? 0) > 0) amount *= 0.45;
    // Snared bodies are left open.
    if (!host.ally && (host.exposed ?? 0) > 0) amount *= 1.35;
    // Team combo: a teammate's hit on a body another seat just launched lands harder.
    if (
      !host.ally &&
      !host.duelist &&
      host.launchedBy != null &&
      host.launchedBy !== this.actingSeat() &&
      host.airY > 0.05 &&
      this.simTime - (host.launchedAt ?? -10) < 1.8
    ) {
      amount *= 1.25;
      host.launchedBy = undefined;
      if (this.bannerT <= 0.2) {
        this.banner = { title: 'TEAM COMBO', sub: 'SQUAD DAMAGE +25%' };
        this.bannerT = 0.9;
      }
    }
    if (!host.ally) {
      if (!this.allowAllyDamage) this.raidDealt += amount;
      if (!host.duelist && this.gameMode !== GameMode.PVP) this.noteDamage(this.actingSeat(), amount);
    } else this.raidTaken += amount;
    host.hp -= amount;
    host.hit = 0.18;
    host.hitColor = 0xffffff;
    if (reaction) {
      // Elites build resistance to repeated launches so a crowd boss is not a yo-yo.
      const shaped = host.ally || host.duelist ? { reaction, strength } : resistReaction(host, reaction, strength, this.simTime);
      applyReaction(host, shaped.reaction, dir, shaped.strength);
      if (shaped.reaction !== 'stagger') host.cooldown = Math.max(host.cooldown, 0.5);
      if (shaped.reaction !== reaction) host.hitColor = 0xffc857;
    } else {
      host.knock.copy(dir).setY(0).multiplyScalar(8 / host.mass);
    }
    this.particles.emit(this.hostAt(host, 1.1), this.spec.color, 8, {
      speed: 7,
      size: 0.22,
      life: 0.28,
      direction: dir,
    });
    if (host.hp <= 0) {
      if (host.ally && this.gameMode === GameMode.RAID && this.raidPlan) {
        this.downAlly(host);
        return;
      }
      this.killHost(host, reaction && reaction !== 'stagger' ? dir : null, strength);
    }
  }

  /**
   * Remove a host. If it died to a heavy blow it keeps flying as a tumbling
   * body for a moment instead of vanishing on the spot.
   */
  private killHost(host: Host, flungBy: THREE.Vector3 | null = null, strength = 1) {
    if (swayOf(host, this.simTime)?.mode === 'riot') boostNearbyRiot(host, this.hosts, this.simTime);
    // Kits may still hold a reference; make sure it reads as dead.
    host.hp = Math.min(host.hp, 0);
    host.held = 0;
    if (!host.ally && !host.duelist) {
      this.raidEnemiesDown += 1;
      if (this.gameMode !== GameMode.PVP) this.noteKill(this.actingSeat());
    }
    if (host.ally) {
      host.cpu?.dispose();
      host.cpu = undefined;
    }
    if (host.duelist && !host.ally && host.ryderId) {
      this.foeHud = {
        ryderId: host.ryderId,
        name: RYDERZ[host.ryderId].name,
        hp: 0,
        maxHp: host.maxHp,
        aura: host.aura ?? 0,
        maxAura: host.maxAura ?? 0,
        cpu: !host.controlled,
      };
      this.phase = 'victory';
      this.banner = { title: 'YOU WIN', sub: 'OPPONENT DOWN' };
      this.bannerT = 30;
    } else {
      if (!host.ally) {
        const boss = host.kind === 'broadcaster' || (host.tier ?? 1) >= 6;
        this.awardPoints(killReward(host.tier ?? 1, boss));
        const finisher = Boolean(flungBy) || this.pendingFinisher;
        if (finisher) this.awardPoints(RAID_REWARDS.finisher);
        // Signal Points: keyed by body, so a flung corpse or a replayed death never drops twice.
        // The kill's SP leaves the body as Signal Orbs and pays when a Ryder collects them.
        if (this.gameMode !== GameMode.PVP && !host.paid) {
          host.paid = true;
          const seat = this.actingSeat();
          const owed = this.signalBank.claimKill(host, host.tier ?? 1, boss, finisher, this.currentRound(), seat);
          const y = this.bodyHeight(host.pos.x, host.pos.z, Boolean(host.swims)) + 1;
          this.signalOrbs.drop(owed, seat, host.pos.x, y, host.pos.z);
        }
      }
      const siphon = this.modifiers.passives.includes('auraOnKill') ? 6 : 0;
      this.aura = Math.min(this.maxAura, this.aura + KILL_AURA_SIPHON + this.upgrades.siphon * 4 + siphon);
    }
    this.engagement.release(host);
    this.burst(this.hostAt(host, 1), host.kind === 'broadcaster' ? 0xb84dff : 0x7dff9a, host.kind === 'broadcaster' ? 40 : 16);
    this.hosts = this.hosts.filter((h) => h !== host);
    if (this.gameMode === GameMode.RAID && this.raidPlan && this.hp <= 0 && this.livingAllies() === 0 && this.phase === 'playing') {
      this.failRaid();
    }
    if (flungBy && this.fallen.length < 8) {
      const vel = new THREE.Vector3(flungBy.x, 0, flungBy.z).normalize().multiplyScalar((9 * strength) / Math.max(0.6, host.mass));
      vel.add(host.knock);
      this.fallen.push({
        fighter: host.fighter,
        pos: host.pos.clone(),
        vel,
        airY: Math.max(host.airY, 0.05),
        airVel: Math.max(host.airVel, (5 * strength) / Math.sqrt(Math.max(0.6, host.mass))),
        spin: (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 4),
        tumble: host.tumble,
        life: 1.4,
      });
      flashEmissive(host.fighter.humanoid, 0xffffff, 0.6);
      return;
    }
    this.retireBody(host);
  }

  /** Round the fight is in, whichever mode is counting. */
  private currentRound() {
    return this.gameMode === GameMode.RAID && this.raidPlan ? this.raidWave : this.round;
  }

  // ---------------------------------------------------------------------------
  // Body pooling: a 400-civilian round reuses meshes instead of rebuilding them
  // ---------------------------------------------------------------------------

  private poolKey(kind: EnemyKind, modelPath: string | null | undefined) {
    return `${kind}|${modelPath ?? ''}`;
  }

  private acquireBody(kind: EnemyKind, modelPath: string | null | undefined): Fighter {
    const bucket = this.hostPool.get(this.poolKey(kind, modelPath));
    const pooled = bucket?.pop();
    if (pooled) {
      const group = pooled.humanoid.group;
      group.visible = true;
      group.rotation.set(0, 0, 0);
      group.scale.setScalar(1);
      setHumanoidOpacity(pooled.humanoid, 1);
      pooled.glitch?.setOpacity(0);
      return pooled;
    }
    return buildHost(kind, modelPath);
  }

  /** Put a dead body back on the shelf, or free it when the shelf is full. */
  private retireBody(host: Host) {
    const group = host.fighter.humanoid.group;
    this.scene.remove(group);
    if (host.ally || host.duelist) {
      disposeObject(group);
      return;
    }
    if (this.world.training) this.paintTraining(host, false);
    const key = this.poolKey(host.kind, host.modelPath);
    const bucket = this.hostPool.get(key) ?? [];
    let total = 0;
    for (const list of this.hostPool.values()) total += list.length;
    if (bucket.length >= 10 || total >= 40) {
      disposeObject(group);
      return;
    }
    group.visible = false;
    bucket.push(host.fighter);
    this.hostPool.set(key, bucket);
  }

  private updateFallen(dt: number) {
    for (let i = this.fallen.length - 1; i >= 0; i -= 1) {
      const body = this.fallen[i];
      body.life -= dt;
      body.airVel -= 22 * dt;
      body.airY += body.airVel * dt;
      if (body.airY <= 0) {
        body.airY = 0;
        body.airVel = 0;
        body.vel.multiplyScalar(Math.max(0, 1 - dt * 9));
        body.spin *= Math.max(0, 1 - dt * 12);
      }
      body.pos.addScaledVector(body.vel, dt);
      body.pos.x = clamp(body.pos.x, -this.limit(), this.limit());
      body.pos.z = clamp(body.pos.z, -this.limit(), this.limit());
      body.tumble += body.spin * dt;
      const group = body.fighter.humanoid.group;
      group.rotation.order = 'YXZ';
      group.position.copy(body.pos);
      group.position.y = this.world.heightAt(body.pos.x, body.pos.z) + body.airY;
      group.rotation.x = -body.tumble;
      const fade = Math.min(1, body.life * 2);
      setHumanoidOpacity(body.fighter.humanoid, fade);
      body.fighter.glitch?.setOpacity(fade);
      body.fighter.glitch?.update(this.simTime, this.camera);
      if (body.life <= 0) {
        this.scene.remove(group);
        disposeObject(group);
        this.fallen.splice(i, 1);
      }
    }
  }

  private spawnBolt(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    damage: number,
    fromPlayer: boolean,
    color: number,
    speed: number,
    shape?: ShotShape,
  ) {
    if (shape) {
      const shot = this.powerFx.acquireShot(shape, color, fromPlayer ? 1.7 : 1.3);
      const shaped: Bolt = {
        active: true,
        mesh: BOLT_PLACEHOLDER,
        vel: dir.clone().normalize().multiplyScalar(speed),
        pos: origin.clone(),
        damage,
        fromPlayer,
        life: 1.6,
        radius: fromPlayer ? 0.26 : 0.3,
        shot,
      };
      this.powerFx.placeShot(shot, shaped.pos, shaped.vel, 0);
      this.bolts.push(shaped);
      return;
    }
    let bolt = this.boltPool.pop();
    if (!bolt) {
      const mesh = new THREE.Mesh(BOLT_GEOMETRY, glow(color, 1.8));
      bolt = {
        active: false,
        mesh,
        vel: new THREE.Vector3(),
        pos: new THREE.Vector3(),
        damage: 0,
        fromPlayer: true,
        life: 0,
        radius: 0.22,
      };
      this.scene.add(mesh);
    }
    (bolt.mesh.material as THREE.MeshBasicMaterial).color.setHex(color).multiplyScalar(1.8);
    bolt.active = true;
    bolt.pos.copy(origin);
    bolt.mesh.position.copy(origin);
    bolt.vel.copy(dir).normalize().multiplyScalar(speed);
    bolt.damage = damage;
    bolt.fromPlayer = fromPlayer;
    bolt.life = 1.6;
    bolt.radius = fromPlayer ? 0.22 : 0.28;
    bolt.mesh.visible = true;
    this.bolts.push(bolt);
  }

  private updateBolts(dt: number) {
    const shielded = this.isActive('forcefield');
    for (let i = this.bolts.length - 1; i >= 0; i -= 1) {
      const bolt = this.bolts[i];
      bolt.life -= dt;
      bolt.pos.addScaledVector(bolt.vel, dt);
      if (bolt.shot) this.powerFx.placeShot(bolt.shot, bolt.pos, bolt.vel, dt);
      else bolt.mesh.position.copy(bolt.pos);
      const floor = this.world.heightAt(bolt.pos.x, bolt.pos.z);
      const water = this.world.water;
      const surface = water ? water.surfaceAt(bolt.pos.x, bolt.pos.z) : floor;
      const bed = water && floor < surface ? surface : floor;
      if (bolt.pos.y < bed + 0.15 || bolt.life <= 0 || Math.abs(bolt.pos.x) > this.limit() + 4 || Math.abs(bolt.pos.z) > this.limit() + 4) {
        this.retireBolt(i);
        continue;
      }
      if (pointBlocked(bolt.pos.x, bolt.pos.z, 0.12, this.world.obstacles) && bolt.pos.y < floor + 2.4) {
        this.particles.emit(bolt.pos, 0xffffff, 5, { speed: 4, size: 0.16, life: 0.2 });
        this.retireBolt(i);
        continue;
      }
      if (bolt.fromPlayer) {
        let hit = false;
        for (const host of this.hosts) {
          const dx = host.pos.x - bolt.pos.x;
          const dy = host.fighter.humanoid.group.position.y + 1.1 - bolt.pos.y;
          const dz = host.pos.z - bolt.pos.z;
          const r = host.radius + bolt.radius;
          if (dx * dx + dy * dy * 0.4 + dz * dz < r * r) {
            this.hurtHost(host, bolt.damage, bolt.vel);
            hit = true;
            break;
          }
        }
        if (hit) this.retireBolt(i);
      } else {
        const dx = this.pos.x - bolt.pos.x;
        const dy = this.feetY() + 1.15 - bolt.pos.y;
        const dz = this.pos.z - bolt.pos.z;
        const r = PLAYER_RADIUS + bolt.radius + (shielded ? 1.2 : 0);
        if (dx * dx + dy * dy + dz * dz < r * r) {
          if (shielded) {
            this.particles.emit(bolt.pos, 0x66e7ff, 8, { speed: 5, size: 0.2, life: 0.25 });
          } else {
            this.hurtPlayer(bolt.damage, _tmp.set(-dx, 0, -dz).normalize());
          }
          this.retireBolt(i);
        }
      }
    }
  }

  private retireBolt(index: number) {
    const bolt = this.bolts[index];
    bolt.active = false;
    this.bolts.splice(index, 1);
    if (bolt.shot) {
      this.powerFx.releaseShot(bolt.shot);
      return;
    }
    bolt.mesh.visible = false;
    this.boltPool.push(bolt);
  }

  private shotDamage() {
    const phased = this.isActive('phase');
    return this.spec.damage * (1 + 0.15 * this.upgrades.signal) * (phased ? 1.4 : 1);
  }

  /** Base fist damage before the striker's per-action multipliers. Tree and surge scaling ride on `strikeScale`. */
  private meleeDamage() {
    const fists = 1 + 0.25 * this.upgrades.fists;
    const burned = this.burnout ? (this.upgrades.fists >= 3 ? 0.85 : 0.45) : 1;
    return this.spec.meleeDamage * fists * burned * (this.kit?.outgoingScale ?? 1);
  }

  /**
   * Direction from the muzzle to whatever the crosshair is over. The camera
   * sits over the shoulder, so projectiles must converge on the crosshair ray
   * rather than travel parallel to it.
   */
  private lookDir(out: THREE.Vector3) {
    this.rig.aimRay(_aimRay);
    let range = 60;
    _ray.ray.copy(_aimRay);
    _ray.near = 0;
    _ray.far = range;
    const hits = _ray.intersectObjects(this.world.occluders, false);
    if (hits.length) range = Math.min(range, hits[0].distance);
    for (const host of this.hosts) {
      _tmp.copy(host.pos).setY(host.fighter.humanoid.group.position.y + 1.1);
      const hitDist = raySphere(_aimRay, _tmp, host.radius + 0.35);
      if (hitDist > 0 && hitDist < range) range = hitDist;
    }
    _aimRay.at(range, _aimPoint);
    const muzzle = this.muzzle();
    out.copy(_aimPoint).sub(muzzle);
    // If the aim point ended up behind the muzzle (camera pinned to a wall), fall back to the view direction.
    if (out.lengthSq() < 0.25 || out.dot(_aimRay.direction) <= 0) out.copy(_aimRay.direction);
    return out.normalize();
  }

  private muzzle() {
    return _tmp2.set(
      this.pos.x + Math.sin(this.yaw) * 0.7,
      this.feetY() + 1.25,
      this.pos.z + Math.cos(this.yaw) * 0.7,
    );
  }

  /**
   * Feet height for the player: ground, kit lift and jump, held under any roof
   * so the crown never passes through it. A jump that meets the roof stops rising.
   */
  private standY(scale = 1) {
    const floor = this.world.heightAt(this.pos.x, this.pos.z);
    const lift = (this.kit?.airY ?? 0) + this.airY;
    const y = floor + lift - (this.pvpCpu?.playerSink() ?? 0);
    const room = this.headroom(this.pos.x, this.pos.z, scale);
    if (room === null || lift <= room) return y;
    if (this.airY > 0) {
      this.airY = Math.max(0.02, room - (this.kit?.airY ?? 0));
      this.airVel = Math.min(this.airVel, 0);
    }
    return floor + room;
  }

  /** How far a body's feet may rise above the ground before its crown meets the roof. Null under open sky. */
  private headroom(x: number, z: number, scale = 1) {
    const roof = this.world.ceilingAt?.(x, z);
    if (roof === null || roof === undefined) return null;
    return Math.max(0, roof - this.world.heightAt(x, z) - BODY_CROWN * scale);
  }

  /** Body scale a growth power may reach here without clipping the roof. */
  private roofScale(x: number, z: number, scale: number) {
    if (scale <= 1) return scale;
    const roof = this.world.ceilingAt?.(x, z);
    if (roof === null || roof === undefined) return scale;
    return Math.min(scale, Math.max(1, (roof - this.world.heightAt(x, z) - 0.1) / BODY_CROWN));
  }

  /** Where the player's feet are, including jumps and flight. */
  private feetY() {
    return this.player?.humanoid.group.position.y ?? this.world.heightAt(this.pos.x, this.pos.z);
  }

  /** A point `lift` metres above the player's feet, for effects and throws on sloped ground. */
  private playerAt(lift: number) {
    return new THREE.Vector3(this.pos.x, this.feetY() + lift, this.pos.z);
  }

  private hostAt(host: Host, lift: number) {
    return new THREE.Vector3(host.pos.x, host.fighter.humanoid.group.position.y + lift, host.pos.z);
  }

  private nearestHost(from: THREE.Vector3) {
    let best: Host | null = null;
    let bestD = Infinity;
    for (const host of this.hosts) {
      if (host.ally || host.hp <= 0) continue;
      const d = host.pos.distanceToSquared(from);
      if (d < bestD) {
        bestD = d;
        best = host;
      }
    }
    return best;
  }

  private burst(pos: THREE.Vector3, color: number, count: number) {
    this.particles.emit(pos, color, count, { speed: 8, size: 0.32, life: 0.55, up: 1.2, gravity: 6 });
  }

  private cameraState(): CameraState {
    if (this.phase === 'dead') return 'EXPLORATION';
    if (this.fireHeld && !this.burnout) return 'AIM';
    if (this.abilityT > 0 || this.bodyLocked() || this.kit?.busy || this.moveT.some((t) => t > 0)) return 'ABILITY';
    if (this.lockTarget && this.lockTarget.hp > 0) return 'LOCK_ON';
    if (this.sprinting) return 'SPRINT';
    if (this.combatT > 0) return 'COMBAT';
    for (const host of this.hosts) {
      if (host.pos.distanceToSquared(this.pos) < COMBAT_PROXIMITY * COMBAT_PROXIMITY) return 'COMBAT';
    }
    return 'EXPLORATION';
  }

  private updateCamera(dt: number) {
    // Feet in the world, including stairs, jumps, levitation, and swimming.
    const body = this.player
      ? this.player.humanoid.group.position.y
      : this.world.heightAt(this.pos.x, this.pos.z) + (this.kit?.airY ?? 0) + this.airY - (this.pvpCpu?.playerSink() ?? 0);
    // A body pulled under the street (Afterimage, a phase grab) is watched from
    // above: the camera holds at street level instead of following it down.
    const street = this.world.heightAt(this.pos.x, this.pos.z);
    const sunk = (this.swim.mode === 'land' || this.swim.mode === 'wade') && body < street - 0.05;
    const feet = sunk ? street : body;
    this.cameraPivot.set(this.pos.x, feet, this.pos.z);
    if (this.camReady) {
      const hop = Math.hypot(this.cameraPivot.x - this.lastCam.x, this.cameraPivot.z - this.lastCam.z);
      // A hill changes height every step. Only a real teleport should cut the camera.
      if (hop > 6) this.rig.relocate(this.cameraPivot);
    }
    this.lastCam.copy(this.cameraPivot);
    this.camReady = true;
    const airborne =
      this.jumping || this.airY > 0.15 || Math.abs(this.airVel) > 0.45 || this.swim.mode === 'surface' || this.swim.mode === 'under';
    this.rig.ySmoothing = airborne ? 0.05 : 0.16;
    this.rig.setGround((x, z) => this.world.heightAt(x, z));
    this.rig.setRoof(this.world.roofAt ?? null);
    const extra = {
      distance: this.kit?.cameraExtra?.distance ?? 0,
      height: this.kit?.cameraExtra?.height ?? 0,
      targetHeight: this.kit?.cameraExtra?.targetHeight ?? 0,
    };
    if (sunk && !this.kit?.cameraExtra) {
      extra.distance += 2.4;
      extra.height += 3;
    }
    // Crowd framing: pull back as the ring around the Ryder fills, capped so the
    // fight never turns into a top-down map. Only bodies close enough to matter count.
    const near = this.grid.count(this.pos.x, this.pos.z, 9);
    if (near > 3) {
      const t = Math.min(1, (near - 3) / 14);
      extra.distance += 0.6 + t * 2.1;
      extra.height += 0.12 + t * 0.55;
      extra.targetHeight += t * 0.18;
    }
    this.rig.setFramingExtra(extra.distance || extra.height || extra.targetHeight ? extra : null);
    const planar = Math.hypot(this.playerVel.x, this.playerVel.z);
    const lead = planar > 0.4 ? Math.min(0.85, planar * 0.07) / planar : 0;
    _camLead.set(this.playerVel.x * lead, 0, this.playerVel.z * lead);
    this.rig.update(dt, this.cameraPivot, this.yaw, this.pitch, this.cameraState(), false, _camLead);
    this.stepFacility(dt);
    this.stepCaches();
    this.world.storyTriggers?.update(this.pos.x, this.pos.z);
    this.tintPadFog(dt);
    this.tintWater(dt);
  }

  /** Under the wave the fog goes deep and close. Back on the beach it restores the arena sky. */
  private tintWater(dt: number) {
    const fog = this.scene.fog as THREE.FogExp2 | null;
    if (!fog || !this.world.water) return;
    const feet = this.player?.humanoid.group.position.y ?? this.world.heightAt(this.pos.x, this.pos.z);
    const under = feet + 1.5 < this.world.water.surfaceAt(this.pos.x, this.pos.z);
    this.waterTint.setHex(under ? 0x07384c : this.aboveFog.getHex());
    const density = under ? 0.045 : this.aboveDensity;
    const blend = 1 - Math.exp(-dt * 3.2);
    fog.color.lerp(this.waterTint, blend);
    fog.density += (density - fog.density) * blend;
  }

  private partyLevel() {
    const source = this.world.ambience;
    if (source?.kind !== 'party') return null;
    const d = Math.hypot(source.x - this.pos.x, source.z - this.pos.z);
    return Math.max(0, Math.min(1, 1 - (d - 4) / 70));
  }

  /** Walking onto a hidden cache opens it once per match and spills its Signal Orbs. */
  private stepCaches() {
    const caches = this.world.caches;
    if (!caches || !this.player || this.hp <= 0 || this.gameMode === GameMode.PVP) return;
    const feet = this.feetY();
    for (const cache of caches) {
      if (this.foundCaches.has(cache.id)) continue;
      if ((cache.x - this.pos.x) ** 2 + (cache.z - this.pos.z) ** 2 > 1.7 * 1.7 || Math.abs(feet - cache.y) > 2.2) continue;
      this.foundCaches.add(cache.id);
      this.world.claimCache?.(cache.id);
      this.signalOrbs.drop(cache.reward, this.actingSeat(), cache.x, cache.y + 0.7, cache.z);
      this.particles.emit(new THREE.Vector3(cache.x, cache.y + 0.5, cache.z), 0x7ad8ff, 18, { speed: 3, size: 0.2, life: 0.5, up: 1.4 });
      this.banner = { title: 'SUPPLY CACHE', sub: `${cache.label.toUpperCase()} · ${this.foundCaches.size}/${caches.length}` };
      this.bannerT = 1.8;
    }
  }

  private stepFacility(dt: number) {
    if (!this.world.stepFacility) return;
    this.facilityAgents.length = 0;
    this.facilityAgents.push({ x: this.pos.x, z: this.pos.z });
    for (const host of this.hosts) {
      if (host.hp <= 0) continue;
      this.facilityAgents.push({ x: host.pos.x, z: host.pos.z });
    }
    this.world.stepFacility(this.facilityAgents, dt);
  }

  /** The lab hall eases the cyan facility fog toward a bright clinical white. */
  private tintPadFog(dt: number) {
    const fog = this.scene.fog as THREE.FogExp2 | null;
    if (!fog || this.arena.id !== 'training-pad') return;
    const inLab = this.pos.x < -41 && this.world.heightAt(this.pos.x, this.pos.z) > 3;
    this.labFog.setHex(inLab ? 0xe7eef2 : this.aboveFog.getHex());
    const density = inLab ? 0.003 : this.aboveDensity;
    const blend = 1 - Math.exp(-dt * 2.4);
    fog.color.lerp(this.labFog, blend);
    fog.density += (density - fog.density) * blend;
  }

  private powersOut() {
    return this.powerOut.down || Boolean(this.kit?.powersDown);
  }

  /** Cached footprints. Rebuilt when the arena swaps or a barrier opens. */
  private mapChart(): MapBlock[] {
    const list = this.world.obstacles;
    let sig = list.length;
    for (let i = 0; i < list.length; i += 1) {
      const obstacle = list[i];
      if (obstacle.kind === 'box') {
        sig = Math.imul(sig, 33) + Math.round(obstacle.minX * 10 + obstacle.maxZ * 10);
      } else {
        sig = Math.imul(sig, 33) + Math.round(obstacle.x * 10 + obstacle.r * 100);
      }
    }
    if (this.chartWorld === this.world && sig === this.chartSig) return this.chart;
    this.chartWorld = this.world;
    this.chartSig = sig;
    this.chart = chartBlocks(list);
    return this.chart;
  }

  private emitHud() {
    this.onHud({
      hp: this.hp,
      maxHp: this.maxHp,
      aura: this.aura,
      maxAura: this.maxAura,
      burnout: this.burnout,
      moves: this.moves.map((move, i) => ({
        id: move.id,
        key: MOVE_KEYS[i],
        name: move.name,
        ready:
          !this.burnout &&
          !this.powersOut() &&
          this.moveCd[i] <= 0.16 &&
          (this.moveT[i] > 0 ||
            (move.drain > 0 ? this.aura > 1 : this.aura >= move.auraCost * Math.max(0.4, 1 + this.modifiers.abilityCost))),
        cooldown: this.moveCd[i],
        duration: this.moveT[i],
      })),
      openSlots: this.openSlots,
      signal: this.signalHud(),
      signalPops: this.drainSignalPops(),
      guarding: this.guarding,
      round: this.gameMode === GameMode.RAID && this.raidPlan ? this.raidWave : this.round,
      remaining:
        this.gameMode === GameMode.RAID && this.raidPlan
          ? this.livingEnemies() + this.queue.length + this.reserve.length
          : this.queue.length + this.reserve.length + this.hosts.length,
      points: this.points,
      phase: this.phase,
      intermissionLeft: this.intermissionLeft,
      nearShop: this.phase === 'intermission' && nearDistrictHub(this.pos.x, this.pos.z, 6.2),
      banner: this.banner,
      upgrades: { ...this.upgrades },
      pointerLocked: this.pointerLocked,
      paused: this.paused,
      mapOpen: this.mapOpen,
      ryderId: this.spec.id,
      ryderName: this.spec.name,
      meleeOnly: this.burnout || this.powersOut(),
      tideOut: this.powersOut(),
      powerLeft: this.gameMode === GameMode.PVP ? 0 : this.powerOut.down ? this.powerOut.dry : this.powerOut.live,
      powerDown: this.gameMode === GameMode.PVP ? false : this.powerOut.down,
      powerUnlimited: this.gameMode === GameMode.PVP,
      cameraState: this.rig.getState(),
      cameraMode: this.cameraMode,
      lockOn: Boolean(this.lockTarget && this.lockTarget.hp > 0),
      difficulty: (this.raidPlan?.difficulty ?? 'normal').toUpperCase(),
      heldWeapon: this.heldThrow && !this.heldThrow.broken ? this.heldThrow.stats.kind : '',
      warzone: warzoneLabel(this.survivalPlan.event) ?? '',
      powerState: this.powerVfx.currentState,
      beacon: this.beacon ? this.beacon.hudState(this.clock.elapsedTime, this.pos) : null,
      recovering: this.recoveryT > 0,
      resonance: this.kit?.resonance ?? 0,
      opponent: this.publishFoe(),
      combo: this.comboHud(),
      radar: {
        x: this.pos.x,
        z: this.pos.z,
        yaw: this.yaw,
        span: this.limit(),
        terrain: this.arena.worldKey === 'island' ? 'island' : 'city',
        color: this.spec.colorHex,
        blocks: this.mapChart(),
        explored: this.arena.worldKey === 'island' ? this.explored : undefined,
        exploreN: this.exploreN,
        enemies: this.hosts.filter((host) => host.hp > 0 && !host.ally).map((host) => ({ x: host.pos.x, z: host.pos.z })),
        allies: this.hosts
          .filter((host) => host.ally && (host.hp > 0 || (host.down ?? 0) > 0))
          .map((host) => ({
            x: host.pos.x,
            z: host.pos.z,
            name: host.ryderId ? RYDERZ[host.ryderId].name : 'Ally',
            color: host.ryderId ? RYDERZ[host.ryderId].colorHex : '#66e7ff',
            down: (host.down ?? 0) > 0,
          })),
      },
      raid:
        this.gameMode === GameMode.RAID && this.raidPlan
          ? {
              wave: this.raidWave,
              waves: 0,
              defeated: this.raidEnemiesDown,
              dealt: Math.round(this.raidDealt + this.hosts.reduce((sum, host) => sum + (host.ally ? host.dealt ?? 0 : 0), 0)),
              taken: Math.round(this.raidTaken),
              allies: this.livingAllies(),
              contributions: this.raidReport().contributions,
            }
          : null,
      survival:
        this.gameMode === GameMode.PVP
          ? null
          : {
              round: this.survivalPlan.round,
              phase: this.survivalPlan.scale.phase.name,
              maxTier: this.survivalPlan.scale.maxTier,
              hp: this.survivalPlan.scale.hp,
              damage: this.survivalPlan.scale.damage,
              cap: this.survivalPlan.scale.cap,
              boss: this.survivalPlan.boss,
              population: this.survivalPlan.civilians,
              remaining: this.livingEnemies() + this.queue.length + this.reserve.length,
              alive: this.livingEnemies(),
              attackers: this.attackersNow,
            },
      party: this.gameMode === GameMode.RAID && this.raidPlan ? this.partyRows() : null,
      revive: this.gameMode === GameMode.RAID && this.raidPlan ? this.revivePrompt() : null,
      down:
        this.gameMode === GameMode.RAID && this.raidPlan && this.raidDown
          ? { left: this.downLeft, faded: this.downLeft <= 0 }
          : null,
      statBoard: this.phase === 'report' && this.reportRound > 0 ? this.publishStatBoard() : null,
      water: this.world.water
        ? { mode: this.swim.mode, oxygen: this.swim.oxygen, submerged: this.swim.mode === 'under' }
        : null,
      partyLevel: this.partyLevel(),
    });
  }

  private drainSignalPops() {
    if (!this.signalPops.length) return [];
    const out = this.signalPops;
    this.signalPops = [];
    return out;
  }

  private signalHud(): HudState['signal'] {
    const earned = this.signalLedger.earned;
    const progress = levelProgress(earned);
    return {
      available: availableSignal(this.signalLedger),
      earned,
      round: this.signalBank.earnedRound,
      level: progress.level,
      progress: progress.progress,
    };
  }

  private comboHud(): HudState['combo'] {
    const snap = this.striker.combo.snapshot(this.simTime);
    const link = combatProfileFor(this.spec.id).powerLink;
    return {
      count: snap.count,
      label: snap.powerReady && snap.count < 2 ? 'POWER LINK' : snap.label,
      tier: snap.tier,
      color: this.spec.colorHex,
      revision: snap.revision,
      power: snap.powerReady,
      powerLabel: link.label,
      powerLeft: snap.powerLeft,
    };
  }

  private publishFoe(): HudState['opponent'] {
    const foe = this.hosts.find((host) => host.duelist && host.ryderId);
    if (foe?.ryderId) {
      this.foeHud = {
        ryderId: foe.ryderId,
        name: RYDERZ[foe.ryderId].name,
        hp: foe.hp,
        maxHp: foe.maxHp,
        aura: foe.aura ?? foe.maxAura ?? 0,
        maxAura: foe.maxAura ?? 0,
        cpu: !foe.controlled,
      };
    }
    return this.gameMode === GameMode.PVP ? this.foeHud : null;
  }

  private async spawnDuelist(id: RyderId, controlled: boolean) {
    const { spec } = await resolveAppearance(id);
    if (this.disposed) return;
    const fighter = buildRyder(spec, { clone: true });
    const pos = new THREE.Vector3(-Math.sign(this.pos.x || 1) * 8, 0, -Math.sign(this.pos.z || 1) * 8);
    fighter.humanoid.group.position.copy(pos);
    fighter.humanoid.group.position.y = this.bodyHeight(pos.x, pos.z, true);
    fighter.humanoid.group.rotation.y = Math.atan2(this.pos.x - pos.x, this.pos.z - pos.z);
    this.scene.add(fighter.humanoid.group);
    const duelHp = pvpHealth(spec.maxHp);
    const host: Host = {
      kind: 'walker',
      fighter,
      hp: duelHp,
      maxHp: duelHp,
      pos,
      radius: PLAYER_RADIUS,
      speed: spec.speed * 0.92,
      damage: spec.meleeDamage,
      mass: 1,
      preferredRange: 0,
      cooldown: 0.6,
      anim: 0,
      hit: 0,
      knock: new THREE.Vector3(),
      points: 0,
      summon: 99,
      stun: 0,
      swing: false,
      stagger: 0,
      airY: 0,
      airVel: 0,
      lean: 0,
      spin: 0,
      tumble: 0,
      held: 0,
      sink: 0,
      chain: 0,
      hitColor: 0xffffff,
      throwWind: 0,
      winding: false,
      follow: null,
      duelist: true,
      swims: true,
      controlled,
      ryderId: id,
      aura: spec.maxAura,
      maxAura: spec.maxAura,
      sinceAttack: 0,
      token: false,
      sinceSeen: 0,
      canDodge: false,
    };
    this.hosts.push(host);
    if (!controlled) this.attachCpu(host, spec);
    else this.p2Striker.setRyder(spec.id);
  }

  /** CPU Ryder: same kit as a player, scored decisions, no extra aura. */
  private attachCpu(host: Host, spec: RyderSpec) {
    this.pvpCpu?.dispose();
    this.pvpCpu = new PvpCpu(
      {
        scene: this.scene,
        particles: this.particles,
        rings: this.rings,
        cracks: this.cracks,
        afterimages: this.afterimages,
        camera: this.rig,
        cameraObject: this.camera,
        playerPos: this.pos,
        playerHp: () => this.hp,
        playerMaxHp: () => this.maxHp,
        setPlayerHp: (value) => {
          this.hp = Math.max(0, value);
        },
        playerAttacking: () => this.meleeT > 0.15 || this.abilityT > 0.12 || this.fireHeld || this.striker.busy,
        playerVelocity: () => this.playerVel,
        playerIntangible: () => this.isPhased(),
        playerWhiff: () => this.striker.exposed,
        playerStunned: () => this.hitStun > 0.08 || this.stasis > 0 || (this.airY > 0.25 && !this.jumping),
        playerMemory: () => this.combatMemory.rates(this.simTime),
        heightAt: (x, z) => this.bodyHeight(x, z, true),
        waterDepth: (x, z) => this.waterDepth(x, z),
        resolve: (pos) => {
          pos.x = clamp(pos.x, -this.limit(), this.limit());
          pos.z = clamp(pos.z, -this.limit(), this.limit());
          resolveCircle(pos, PLAYER_RADIUS, this.world.obstacles);
        },
        blocked: (x, z, radius) => this.npcBlocked(x, z, radius),
        routeTo: (fromX, fromZ, toX, toZ, radius) => this.world.routeTo?.(fromX, fromZ, toX, toZ, radius) ?? null,
        hurtPlayer: (amount, dir, kind, physical) => this.hurtPlayer(amount, dir, kind, physical),
        stunPlayer: (seconds) => this.setStasis(seconds),
        suppressPlayer: (factor) => this.setSuppress(factor),
        time: () => this.simTime,
        sound: (id) => this.emitSound(id),
        playerHazards: () => this.kit?.hazards?.() ?? [],
      },
      spec.id,
    );
    this.pvpCpu.attach(host, spec);
  }

  private outgoingPvpKind(): PvpDamageKind {
    return this.pvpHitKindT > 0 ? this.pvpHitKind : 'basic';
  }

  private armPvpHit(slot: number) {
    if (this.gameMode !== GameMode.PVP) return;
    this.pvpHitKind = slot === 2 ? 'ultimate' : 'ability';
    this.pvpHitKindT = 1.5;
  }

  /** Local player 2. I/K move on Z, J/L move on X, U punches. Camera stays on player 1. */
  private driveLocalOpponent(host: Host, dt: number, time: number) {
    if (host.held > 0) {
      stepReaction(host, dt);
      host.knock.set(0, 0, 0);
      host.fighter.humanoid.group.position.copy(host.pos);
      host.fighter.humanoid.group.position.y = this.world.heightAt(host.pos.x, host.pos.z) - host.sink;
      this.animateHost(host, dt, 0, time);
      this.p2PunchQueued = false;
      this.p2KickQueued = false;
      this.p2MeleeQueued = false;
      return;
    }
    host.cooldown = Math.max(0, host.cooldown - dt);
    if (host.maxAura) host.aura = Math.min(host.maxAura, (host.aura ?? 0) + dt * 6);
    let mx = 0;
    let mz = 0;
    if (this.keys.has('j')) mx -= 1;
    if (this.keys.has('l')) mx += 1;
    if (this.keys.has('i')) mz -= 1;
    if (this.keys.has('k')) mz += 1;
    const moving = Math.hypot(mx, mz);
    if (moving > 0) {
      host.pos.x += (mx / moving) * host.speed * dt;
      host.pos.z += (mz / moving) * host.speed * dt;
      host.pos.x = clamp(host.pos.x, -this.limit(), this.limit());
      host.pos.z = clamp(host.pos.z, -this.limit(), this.limit());
      resolveCircle(host.pos, host.radius, this.world.obstacles);
      host.fighter.humanoid.group.rotation.y = Math.atan2(mx, mz);
    }
    this.stepLocalOpponentAir(host, dt);
    host.fighter.humanoid.group.position.copy(host.pos);
    host.fighter.humanoid.group.position.y = this.bodyHeight(host.pos.x, host.pos.z, true) + host.airY;
    this.animateHost(host, dt, Math.min(1, moving), time, 0, undefined, false, this.jumpPose(host.airY, host.airVel, this.p2Jumping));
    if (this.p2DodgeT > 0) this.p2DodgeT = Math.max(0, this.p2DodgeT - dt);
    if (this.p2PunchQueued) {
      this.p2PunchQueued = false;
      this.p2Striker.queue('punch');
    }
    if (this.p2KickQueued) {
      this.p2KickQueued = false;
      this.p2Striker.queue('kick');
    }
    if (this.p2MeleeQueued) {
      this.p2MeleeQueued = false;
      this.p2Striker.queue('melee');
    }
    if (this.p2DodgeQueued) {
      this.p2DodgeQueued = false;
      this.p2DodgeT = 0.18;
    }
    const facing = host.fighter.humanoid.group.rotation.y;
    const frame = this.p2Striker.tick(dt, {
      time: this.simTime,
      stunned: host.stagger > 0.2,
      locked: false,
      facing,
      x: host.pos.x,
      z: host.pos.z,
      meleeDamage: host.damage,
      targets: [
        {
          ref: this,
          x: this.pos.x,
          z: this.pos.z,
          radius: PLAYER_RADIUS,
          airborne: this.airY > 0.25,
        },
      ],
    });
    if (frame.lunge) {
      host.pos.x += Math.sin(facing) * frame.lunge;
      host.pos.z += Math.cos(facing) * frame.lunge;
    }
    if (frame.started) host.swing = true;
    if (frame.grab) {
      this.hitStun = Math.max(this.hitStun, 0.16);
      this.pos.x = host.pos.x + Math.sin(facing) * 0.95;
      this.pos.z = host.pos.z + Math.cos(facing) * 0.95;
    }
    this.cueStrike(frame);
    for (const hit of frame.hits) {
      _tmp.set(this.pos.x - host.pos.x, 0, this.pos.z - host.pos.z);
      if (_tmp.lengthSq() < 1e-4) _tmp.set(Math.sin(facing), 0, Math.cos(facing));
      _tmp.normalize();
      this.hurtPlayer(hit.damage, _tmp, 'basic', {
        reaction: hit.reaction,
        strength: hit.strength,
        hitStun: hit.hitStun,
        knockback: hit.knockback,
      });
    }
    if (this.p2DodgeT > 0 && moving > 0) {
      host.pos.x += (mx / moving) * host.speed * 0.8 * dt;
      host.pos.z += (mz / moving) * host.speed * 0.8 * dt;
    }
  }

  /**
   * Controlled duelists skip stepReaction, so their hop (and any launch that
   * already wrote air velocity) is integrated here. A voluntary landing does
   * not add stagger; a knockback landing still does.
   */
  private stepLocalOpponentAir(host: Host, dt: number) {
    host.stagger = Math.max(0, host.stagger - dt);
    host.lean = Math.max(0, host.lean - dt * 2.2);
    if (host.stagger > 0.2) this.p2Jumping = false;
    if (this.p2JumpQueued) {
      this.p2JumpQueued = false;
      if (host.airY <= 0.04 && host.airVel <= 0 && host.stagger < 0.2) {
        host.airVel = JUMP_SPEED;
        host.airY = 0.02;
        this.p2Jumping = true;
      }
    }
    if (host.airY > 0 || host.airVel > 0) {
      host.airVel -= 22 * dt;
      host.airY += host.airVel * dt;
      if (host.airY <= 0) {
        host.airY = 0;
        host.airVel = 0;
        if (this.p2Jumping) this.p2Jumping = false;
        else host.stagger = Math.max(host.stagger, 0.35);
      }
    }
  }

  private awardPoints(amount: number) {
    if (!Number.isFinite(amount) || amount <= 0 || this.gameMode === GameMode.PVP) return;
    this.points += amount;
    this.pointsEarnedRound += amount;
  }

  private allyDifficulty(): PvpDifficulty {
    const name = this.raidPlan?.difficulty ?? 'normal';
    if (name === 'nightmare') return 'hard';
    return name;
  }

  private stepLockOn(dt: number) {
    const target = this.lockTarget;
    if (!target || target.hp <= 0 || target.ally || !this.hosts.includes(target)) {
      this.lockTarget = null;
      return;
    }
    const aim = Math.atan2(target.pos.x - this.pos.x, target.pos.z - this.pos.z);
    this.yaw = dampAngle(this.yaw, aim, 0.12, dt);
  }

  private stepAutoLock(dt: number) {
    const off =
      this.rig.config.autoLock < 0.5 ||
      this.gameMode === GameMode.PVP ||
      this.phase !== 'playing' ||
      this.lockTarget !== null ||
      this.sprinting;
    if (off) {
      this.autoTarget = null;
      return;
    }
    this.autoTarget = pickAutoTarget(this.pos.x, this.pos.z, this.yaw, this.livingFoes(), this.autoTarget);
    if (this.autoTarget && this.lookIdle >= AUTO_LOCK.resume) {
      this.yaw = steerAutoLock(this.yaw, this.pos.x, this.pos.z, this.autoTarget, dt);
    }
  }

  private livingFoes() {
    return this.hosts.filter((host) => !host.ally && !host.duelist && host.hp > 0);
  }

  private toggleLock() {
    if (this.lockTarget && this.lockTarget.hp > 0) {
      this.lockTarget = null;
      return;
    }
    this.lockTarget = this.nearestHost(this.pos);
  }

  private cycleLock() {
    const foes = this.livingFoes();
    if (!foes.length) {
      this.lockTarget = null;
      return;
    }
    const ordered = foes
      .map((host) => ({ host, angle: Math.atan2(host.pos.x - this.pos.x, host.pos.z - this.pos.z) }))
      .sort((a, b) => a.angle - b.angle);
    const index = ordered.findIndex((row) => row.host === this.lockTarget);
    this.lockTarget = ordered[(index + 1) % ordered.length].host;
  }

  private cycleCameraMode() {
    const index = CAMERA_MODE_ORDER.indexOf(this.cameraMode);
    this.cameraMode = CAMERA_MODE_ORDER[(index + 1) % CAMERA_MODE_ORDER.length];
    this.rig.setMode(this.cameraMode);
    this.banner = { title: CAMERA_MODE_LABEL[this.cameraMode].toUpperCase(), sub: 'CAMERA' };
    this.bannerT = 1.2;
  }

  private openPoint(x: number, z: number) {
    if (!pointBlocked(x, z, 0.7, this.world.obstacles)) return { x, z };
    for (let radius = 1.2; radius <= 8; radius += 1.2) {
      for (let step = 0; step < 8; step += 1) {
        const angle = (step / 8) * Math.PI * 2;
        const nx = x + Math.cos(angle) * radius;
        const nz = z + Math.sin(angle) * radius;
        if (!pointBlocked(nx, nz, 0.7, this.world.obstacles)) return { x: nx, z: nz };
      }
    }
    return { x, z };
  }

  private spawnAllowed(position: THREE.Vector3) {
    if (pointBlocked(position.x, position.z, 0.6, this.world.obstacles)) return false;
    const dx = position.x - this.pos.x;
    const dz = position.z - this.pos.z;
    const reach = dx * dx + dz * dz;
    const clear = this.world.spawnClear ?? 8;
    if (reach > clear * clear) return true;
    const dist = Math.sqrt(reach) || 1;
    const facing = (dx / dist) * Math.sin(this.yaw) + (dz / dist) * Math.cos(this.yaw);
    return facing < 0.2;
  }

  private spawnStations() {
    if (this.stationRoot) {
      this.scene.remove(this.stationRoot);
      disposeObject(this.stationRoot);
    }
    const originX = this.arena.spawnPoint.x;
    const originZ = this.arena.spawnPoint.z;
    this.stations = fieldStations().map((station) => {
      const spot = this.openPoint(originX + station.x, originZ + station.z);
      return { ...station, x: spot.x, z: spot.z };
    });
    this.stationViews = [];
    const root = new THREE.Group();
    root.name = 'raid-stations';
    for (const station of this.stations) {
      const mesh = new THREE.Group();
      const color = station.kind === 'weapon' ? 0xc9a36a : station.kind === 'chest' ? 0xd4a017 : 0x7a5cff;
      const body = new THREE.Mesh(
        station.kind === 'weapon' ? new THREE.BoxGeometry(0.18, 1.15, 0.9) : new THREE.BoxGeometry(0.7, 0.42, 0.48),
        toon(color, { emissive: color, emissiveIntensity: station.kind === 'secret' ? 0.35 : 0.08 }),
      );
      body.position.y = station.kind === 'weapon' ? 1.05 : 0.28;
      mesh.add(body);
      mesh.position.set(station.x, this.world.heightAt(station.x, station.z), station.z);
      root.add(mesh);
      this.stationViews.push(mesh);
    }
    this.stationRoot = root;
    this.scene.add(root);
  }

  private restockStations() {
    this.stations.forEach((station, index) => {
      station.claimed = false;
      const view = this.stationViews[index];
      if (view) view.visible = true;
      if (station.kind !== 'weapon' || !this.throwables) return;
      if (this.throwables.nearestFree(station.x, station.z, 1.6)) return;
      this.throwables.place(station.weapon ?? 'brick', station.x, station.z);
    });
  }

  private tryFieldStation() {
    const station = nearestStation(this.stations, this.pos.x, this.pos.z, 1.8);
    if (!station) return false;
    if (station.kind === 'weapon') {
      const item = this.throwables?.nearestFree(station.x, station.z, 1.8);
      if (!item || !this.throwables?.pickup(this.playerBody, item)) return false;
      this.heldThrow = item;
      this.banner = { title: 'WEAPON TAKEN', sub: item.stats.kind.toUpperCase() };
      this.bannerT = 1.4;
      return true;
    }
    station.claimed = true;
    const view = this.stationViews[this.stations.indexOf(station)];
    if (view) view.visible = false;
    if (station.kind === 'chest') {
      this.awardPoints(RAID_REWARDS.chest);
      this.banner = { title: 'TREASURE', sub: '+300 RAID POINTS' };
    } else {
      this.awardPoints(RAID_REWARDS.secret);
      this.banner = { title: 'SECRET ROOM', sub: '+750 RAID POINTS' };
    }
    this.bannerT = 1.8;
    return true;
  }

  private spawnThrowables() {
    this.throwables?.dispose();
    this.heldThrow = null;
    this.throwables = new ThrowableField(this.scene, this.world.throwSpots);
  }

  private tryPickup() {
    if (this.heldThrow || !this.throwables) return;
    const item = this.throwables.nearestFree(this.pos.x, this.pos.z, 1.35);
    if (!item) return;
    if (this.throwables.pickup(this.playerBody, item)) this.heldThrow = item;
  }

  private releaseHeldThrow() {
    const item = this.heldThrow;
    if (!item || !this.throwables) return;
    const aim = this.pos.clone();
    const near = this.nearestHost(this.pos);
    if (near) aim.copy(near.pos);
    else {
      aim.x += Math.sin(this.yaw) * 6;
      aim.z += Math.cos(this.yaw) * 6;
    }
    aim.y = this.world.heightAt(aim.x, aim.z) + 1.1;
    this.throwables.throwAt(item, this.playerAt(1.2), aim, 0.2, this.playerBody, this.simTime);
    this.heldThrow = null;
  }

  /** A thrown prop broke on landing: glass, splinters or bent steel, and anything fragile nearby reacts. */
  private shatterProp(item: ThrowBody, point: THREE.Vector3) {
    const kind = item.stats.kind;
    const color = kind === 'bottle' ? 0x9fe0b0 : kind === 'chair' ? 0x8a8c94 : kind === 'brick' ? 0x9a4a3a : 0x9a7848;
    const at = new THREE.Vector3(point.x, point.y + 0.15, point.z);
    this.particles.emit(at, color, kind === 'bottle' ? 14 : 10, { speed: kind === 'bottle' ? 4.5 : 3.5, size: kind === 'bottle' ? 0.09 : 0.16, life: 0.55, up: 1.1, gravity: 9 });
    this.world.impact?.(point.x, point.z, 1.4);
  }

  private resolveThrowImpact(item: ThrowBody, point: THREE.Vector3) {
    if (item.dealt) return;
    if (item.lastThrower === this.playerBody) {
      const host = this.hosts.find(
        (candidate) =>
          !candidate.duelist &&
          candidate.hp > 0 &&
          (candidate.pos.x - point.x) ** 2 + (candidate.pos.z - point.z) ** 2 < (candidate.radius + 0.45) ** 2,
      );
      if (!host) return;
      item.dealt = true;
      _tmp.set(host.pos.x - point.x, 0, host.pos.z - point.z);
      if (_tmp.lengthSq() < 1e-4) _tmp.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      this.hurtHost(host, item.stats.damage, _tmp.normalize(), 'stagger', 0.65);
      return;
    }
    const dx = this.pos.x - point.x;
    const dz = this.pos.z - point.z;
    const rel = point.y - this.feetY();
    const inBody = rel > -0.05 && rel < 1.85;
    if (!inBody || dx * dx + dz * dz > 0.8 * 0.8) return;
    item.dealt = true;
    _tmp.set(dx, 0, dz);
    if (_tmp.lengthSq() < 1e-4) _tmp.set(0, 0, 1);
    this.hurtPlayer(item.stats.damage, _tmp.normalize(), undefined, {
      reaction: 'stagger',
      strength: 0.6,
      hitStun: item.stats.stun,
      knockback: 3.4,
    });
  }

  private ensureCombatDebug() {
    if (this.debugGroup) return;
    this.debugGroup = new THREE.Group();
    const ring = (radius: number, color: number) => {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(Math.max(0.05, radius - 0.05), radius, 32),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.08;
      return mesh;
    };
    this.debugGroup.add(ring(2.2, 0xffcc66));
    this.debugGroup.add(ring(2.7, 0xff7744));
    this.debugGroup.add(ring(1.35, 0x88ffcc));
    this.debugGroup.visible = false;
    this.scene.add(this.debugGroup);
  }

  private markRing(index: number, x: number, z: number, radius: number, color: number) {
    const group = this.debugGroup;
    if (!group) return;
    let mesh = this.debugMarks[index];
    if (!mesh) {
      mesh = new THREE.Mesh(
        new THREE.RingGeometry(0.94, 1, 28),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.1;
      group.add(mesh);
      this.debugMarks[index] = mesh;
    }
    (mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    mesh.visible = true;
    mesh.position.set(x - this.pos.x, 0.1, z - this.pos.z);
    mesh.scale.set(radius, radius, 1);
  }

  private updateCombatDebug() {
    if (!this.debugGroup) return;
    this.debugGroup.visible = this.combatDebug;
    if (!this.combatDebug) return;
    this.debugGroup.position.set(this.pos.x, 0.02, this.pos.z);
    let n = 0;
    for (const host of this.hosts) {
      if (host.hp <= 0 || host.duelist || !host.profileId) continue;
      const profile = CIVILIAN_PROFILES[host.profileId];
      this.markRing(n, host.pos.x, host.pos.z, profile.preferredDistance, 0x66ccff);
      n += 1;
      this.markRing(n, host.pos.x, host.pos.z, profile.attackRange, 0xffcc66);
      n += 1;
    }
    for (const item of this.throwables?.items ?? []) {
      if (item.broken) continue;
      this.markRing(n, item.pos.x, item.pos.z, item.stats.pickupRadius, 0x88ff88);
      n += 1;
    }
    for (let i = n; i < this.debugMarks.length; i += 1) this.debugMarks[i].visible = false;
  }

  private clearCombat() {
    this.pvpCpu?.dispose();
    this.pvpCpu = null;
    this.hosts.forEach((h) => {
      h.cpu?.dispose();
      this.scene.remove(h.fighter.humanoid.group);
      disposeObject(h.fighter.humanoid.group);
    });
    this.hosts = [];
    this.fallen.forEach((f) => {
      this.scene.remove(f.fighter.humanoid.group);
      disposeObject(f.fighter.humanoid.group);
    });
    this.fallen = [];
    this.unbindKit();
    this.clearClones();
    for (let i = this.bolts.length - 1; i >= 0; i -= 1) this.retireBolt(i);
    this.powerFx.clear();
    if (this.player) {
      this.scene.remove(this.player.humanoid.group);
      disposeObject(this.player.humanoid.group);
      this.player = null;
    }
    this.powerVfx.detach();
    this.throwables?.dispose();
    this.throwables = null;
    this.heldThrow = null;
    this.recoveryT = 0;
    if (this.shield) {
      this.scene.remove(this.shield);
      this.shield.geometry.dispose();
      (this.shield.material as THREE.Material).dispose();
      this.shield = null;
    }
  }
}

