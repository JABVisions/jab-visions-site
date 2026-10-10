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
  MELEE_ARC,
  MELEE_RANGE,
  MOVE_KEYS,
  PLAYER_RADIUS,
  RYDERZ,
  composeRound,
  roundBanner,
  roundScaling,
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
import { DEFAULT_ARENA, arenaSpec, type ArenaDefinition, type ArenaId } from './arenas';
import { RyderBeacon, type BeaconHudState } from './beacon';
import { RyderPowerVFX, type PowerState } from './power-vfx';
import {
  CrackDecalPool,
  HitScheduler,
  ShockRingPool,
  applyReaction,
  stepReaction,
  targetsInArc,
  type HitReaction,
} from './combat';
import { AfterimagePool } from './speed-vfx';
import { createRyderKit, type KitContext, type MeleeStep, type RyderKit } from './ryderz';
import type { MeleeStyle, PoseOverride } from './skeletal';
import {
  ThirdPersonCamera,
  type CameraConfig,
  type CameraSnapshot,
  type CameraState,
} from './camera';
import {
  animateGltfFighter,
  BOLT_GEOMETRY,
  buildHost,
  buildRyder,
  preloadCivilianModels,
  preloadHostGltf,
  preloadRyderGltf,
  type Fighter,
} from './characters';
import { ParticleSystem } from './particles';
import {
  animateHumanoid,
  disposeObject,
  flashEmissive,
  glow,
  poseAim,
  poseMelee,
  setHumanoidOpacity,
} from './toon';
import { buildWorld, nearDistrictHub, pointBlocked, resolveCircle, steerVelocity, type World } from './world';
import { buildPadWorld } from './world-pad';
import { calculatePvPDamage, pvpHealth, PvpCpu, type PvpDamageKind } from './pvp';
import {
  CombatMemory,
  FighterStriker,
  combatProfileFor,
  commandForKey,
  meleeWantsGrab,
  reactionForEffect,
  recipesFor,
  resolvePowerLink,
  risingPadCommands,
  type CombatCommand,
  type PhysicalHit,
  type StrikeKind,
  type StrikerHit,
} from './fighter';
import { CIVILIAN_PROFILES, civilianOrder, profileForKind, type CivilianProfileId } from './civilians/profiles';
import { CIVILIAN_REGISTRY, clipHintFor, definitionForProfile, type CivilianDefinition } from './civilians/registry';
import { ThrowableField, type ThrowBody } from './throwables';

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
  round: number;
  remaining: number;
  points: number;
  phase: 'playing' | 'intermission' | 'dead' | 'victory';
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
  ryderId: RyderId;
  ryderName: string;
  meleeOnly: boolean;
  cameraState: CameraState;
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
  /** Player and living hostiles, in world metres, for the corner map. */
  radar: {
    x: number;
    z: number;
    yaw: number;
    enemies: { x: number; z: number }[];
  };
}

interface Host {
  kind: EnemyKind;
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
  /** Seconds left in a raise-then-throw. 0 means not winding up. */
  throwWind: number;
  winding: boolean;
  /** Next physical strike after this one, for a short jab chain. */
  follow: StrikeKind | null;
  /** Last shove, kept so props can read it later. */
  lastImpact?: { x: number; z: number; speed: number; kind: string };
  /** Colour of the current hit flash; hits reset it to white, kits can tint it. */
  hitColor: number;
  /** Versus opponent wearing a Ryder model. Not a mind-controlled host. */
  duelist?: boolean;
  /** Local player 2, rather than CPU. */
  controlled?: boolean;
  ryderId?: RyderId;
  aura?: number;
  maxAura?: number;
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
}

interface Clone {
  fighter: Fighter;
  fireCd: number;
  side: number;
}

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _look = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();
const _aimPoint = new THREE.Vector3();
const _ray = new THREE.Raycaster();
const _aimRay = new THREE.Ray();

const SPRINT_MULTIPLIER = 1.28;
/** Short hop. v² / (2g) with g = 22 lands near 1.15 m. */
const JUMP_SPEED = 7.1;
const KEY_YAW_RATE = 2.4; // rad/s while holding A/D
const KEY_PITCH_RATE = 1.3; // rad/s while holding W/S
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
  private camera: THREE.PerspectiveCamera;
  private rig: ThirdPersonCamera;
  private world: World;
  private worlds = new Map<'block' | 'pad', World>();
  private particles: ParticleSystem;
  private clock = new THREE.Clock();
  private raf = 0;
  private disposed = false;
  private paused = true;
  private keys = new Set<string>();
  private moveAxis = { x: 0, z: 0 };
  private lookAcc = { x: 0, y: 0 };
  private fireHeld = false;
  private meleeQueued = false;
  private punchQueued = false;
  private kickQueued = false;
  private dodgeQueued = false;
  private jumpQueued = false;
  /** Sim time of the last grounded hop, so a second press can mount. */
  private jumpAt = -10;
  private jumping = false;
  private queuedMoves = [false, false, false];
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
  /** Powers bound to Q / E / R. Defaults to the Ryder's signature moves; the Power Deck can rebind them. */
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
  private playerVel = new THREE.Vector3();
  private pvpHitKind: PvpDamageKind = 'basic';
  private pvpHitKindT = 0;
  private foeHud: HudState['opponent'] = null;
  private switchToken = 0;
  private player: Fighter | null = null;
  private shield: THREE.Mesh | null = null;
  private pos = new THREE.Vector3(9 + HOME_DISTRICT, 0, 11 + HOME_DISTRICT);
  private yaw = Math.PI * 0.2;
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
  private fireCd = 0;
  private meleeCd = 0;
  private meleeT = 0;
  private moveCd = [0, 0, 0];
  private moveT = [0, 0, 0];
  private iframes = 0;
  private anim = 0;
  private points = 0;
  private round = 0;
  private phase: HudState['phase'] = 'playing';
  private intermissionLeft = 0;
  private queue: EnemyKind[] = [];
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
  /** Ability ids the current kit has claimed via `tryAbility`. */
  private kitClaimed = new Set<AbilityId>();
  private scheduler = new HitScheduler();
  private rings = new ShockRingPool(10);
  private cracks = new CrackDecalPool(4);
  private afterimages = new AfterimagePool(5);
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
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setClearColor(0x0a0614, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x1a0c22, 0.007);

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.08, 480);
    this.scene.add(new THREE.HemisphereLight(0xffd4b8, 0x1a1430, 1.35));
    const sun = new THREE.DirectionalLight(0xffe6c8, 1.55);
    sun.position.set(-18, 42, 12);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x66ffaa, 0.35);
    fill.position.set(16, 10, -20);
    this.scene.add(fill);

    this.world = buildWorld();
    this.worlds.set('block', this.world);
    this.scene.add(this.world.group);
    this.scene.updateMatrixWorld(true);
    this.rig = new ThirdPersonCamera(this.camera, this.world.occluders);

    this.particles = new ParticleSystem();
    this.scene.add(this.particles.points);
    this.powerVfx = new RyderPowerVFX(this.scene, this.particles);
    this.scene.add(this.rings.group, this.cracks.group, this.afterimages.group);

    this.arena = arenaSpec(DEFAULT_ARENA)!;
    this.loadArena(this.arena.id);
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
    this.clearCombat();
    this.spec = RYDERZ[id];
    this.moves = moves?.length === 3 ? moves : this.spec.moves;
    this.upgrades = emptyUpgrades();
    this.maxHp = this.gameMode === GameMode.PVP ? pvpHealth(this.spec.maxHp) : this.spec.maxHp;
    this.hp = this.maxHp;
    this.maxAura = this.spec.maxAura;
    this.aura = this.maxAura;
    this.burnout = false;
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
    this.moveCd = [0, 0, 0];
    this.moveT = [0, 0, 0];
    this.queuedMoves = [false, false, false];
    this.iframes = 0;
    this.recoveryT = 0;
    this.interactQueued = false;
    this.pos.set(this.arena.spawnPoint.x, 0, this.arena.spawnPoint.z);
    this.yaw = Math.PI * 0.85;
    this.pitch = 0.12;
    this.combatT = 0;
    this.abilityT = 0;
    this.sprinting = false;
    this.paused = false;
    this.phase = 'playing';
    this.rig.snap(this.pos, this.yaw, this.pitch);

    await Promise.all([
      this.spec.glb
        ? preloadRyderGltf(this.spec).catch((error) => {
            console.warn('[raid] failed to load Ryder GLB, using block figure', error);
          })
        : Promise.resolve(),
      preloadHostGltf(),
    ]);
    await preloadCivilianModels(CIVILIAN_REGISTRY.map((entry) => entry.modelPath));
    if (this.disposed) return;

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
      if (this.disposed) return;
      this.round = 0;
      this.queue = [];
      this.phase = 'playing';
      this.banner = {
        title: 'VERSUS',
        sub: this.pvpLocalTwo ? 'P2 · IJKL MOVE · U PUNCH' : 'CPU STEPS IN AND STRIKES',
      };
      this.bannerT = 2.6;
    } else {
      this.pvpLocalTwo = false;
      this.beginRound(1);
    }
    this.spawnThrowables();
  }

  /** Versus lineup. Cleared by Solo and Raid starts. */
  setPvpSetup(setup: { opponentId: RyderId; localTwoPlayer: boolean } | null) {
    this.pvpSetup = setup;
    if (!setup) this.pvpLocalTwo = false;
  }

  setPaused(value: boolean) {
    this.paused = value;
    if (value && document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
  }

  /** Rebind Q / E / R. Sustained powers that leave the deck are switched off first. */
  setLoadout(moves: AbilitySpec[]) {
    if (moves.length !== 3) return;
    for (let i = 0; i < 3; i += 1) {
      if (this.moves[i]?.id !== moves[i].id && this.moveT[i] > 0) this.endMove(i);
    }
    this.moves = moves;
    this.moveCd = [0, 0, 0];
    this.queuedMoves = [false, false, false];
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
    const spec = RYDERZ[id];
    if (spec.glb) {
      await preloadRyderGltf(spec).catch((error) => {
        console.warn('[raid] failed to load Ryder GLB, using block figure', error);
      });
    }
    if (this.disposed || token !== this.switchToken) return;

    this.endAllMoves();
    this.unbindKit();
    const hpFrac = this.maxHp > 0 ? this.hp / this.maxHp : 1;
    const auraFrac = this.maxAura > 0 ? this.aura / this.maxAura : 1;
    this.spec = spec;
    this.moves = moves?.length === 3 ? moves : spec.moves;
    this.maxHp = spec.maxHp + this.upgrades.vitality * 25;
    this.hp = Math.max(1, this.maxHp * hpFrac);
    this.maxAura = spec.maxAura + this.upgrades.capacity * 20;
    this.aura = this.maxAura * auraFrac;
    this.moveCd = [0, 0, 0];
    this.moveT = [0, 0, 0];
    this.queuedMoves = [false, false, false];
    this.meleeT = 0;
    this.meleeCd = 0;

    if (this.player) {
      this.scene.remove(this.player.humanoid.group);
      disposeObject(this.player.humanoid.group);
    }
    this.player = buildRyder(spec);
    this.player.humanoid.group.position.copy(this.pos);
    this.player.humanoid.group.position.y = this.world.heightAt(this.pos.x, this.pos.z);
    this.player.humanoid.group.rotation.y = this.yaw;
    this.scene.add(this.player.humanoid.group);
    this.powerVfx.attach(this.player, spec.visual);
    this.bindKit();
    this.particles.emit(this.pos.clone().setY(1.1), spec.color, 30, {
      speed: 7,
      size: 0.32,
      life: 0.6,
      up: 1.2,
    });
  }

  requestPointerLock() {
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
    const i = Math.max(0, Math.min(2, slot));
    this.queuedMoves[i] = true;
  }

  buyUpgrade(id: UpgradeId) {
    if (this.phase !== 'intermission' || this.pos.length() > 6.2) return false;
    const level = this.upgrades[id];
    if (level >= UPGRADES[id].maxLevel) return false;
    const cost = upgradeCost(id, level);
    if (this.points < cost) return false;
    this.points -= cost;
    this.upgrades[id] += 1;
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
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.particles.setViewportHeight(h);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.unbind();
    this.clearCombat();
    this.powerVfx.dispose();
    this.rings.dispose();
    this.cracks.dispose();
    this.afterimages.dispose();
    this.unloadBeacon();
    this.world.dispose();
    this.particles.dispose();
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
    const rival = this.pvpLocalTwo ? commandForKey(e.key, e.code, 2) : null;
    const command = rival ?? commandForKey(e.key, e.code, 1);
    if (command) this.queueCommand(command, rival ? 2 : 1);
    if (INTERACT_KEYS.includes(e.key.toLowerCase())) this.interactQueued = true;
    if (e.key === 'Escape') {
      if (this.tuneMode) {
        if (document.pointerLockElement === this.canvas) document.exitPointerLock();
      } else {
        this.setPaused(true);
      }
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.pointerLocked) return;
    this.lookAcc.x += e.movementX;
    this.lookAcc.y += e.movementY;
  };

  private onMouseDown = (e: MouseEvent) => {
    if (this.paused) return;
    if (e.button === 0) this.fireHeld = true;
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
    this.renderer.render(this.scene, this.camera);
    this.emitHud();
  }

  private update(dt: number, time: number) {
    const cam = this.rig.config;
    const sens = cam.lookSensitivity;
    // Keyboard camera: A/D orbit, W/S tilt. Mouse look still applies on top.
    let keyYaw = 0;
    let keyPitch = 0;
    if (this.keys.has('a')) keyYaw += 1;
    if (this.keys.has('d')) keyYaw -= 1;
    if (this.keys.has('w')) keyPitch -= 1;
    if (this.keys.has('s')) keyPitch += 1;
    this.yaw += keyYaw * KEY_YAW_RATE * sens * dt;
    this.yaw -= this.lookAcc.x * 0.0024 * sens;
    this.pitch = clamp(
      this.pitch + keyPitch * KEY_PITCH_RATE * sens * dt - this.lookAcc.y * 0.0018 * sens,
      cam.pitchMin,
      cam.pitchMax,
    );
    this.lookAcc.x = 0;
    this.lookAcc.y = 0;
    this.combatT = Math.max(0, this.combatT - dt);
    this.abilityT = Math.max(0, this.abilityT - dt);
    this.pvpHitKindT = Math.max(0, this.pvpHitKindT - dt);

    this.fireCd = Math.max(0, this.fireCd - dt);
    this.meleeCd = Math.max(0, this.meleeCd - dt);
    this.iframes = Math.max(0, this.iframes - dt);
    if (!this.striker.busy && this.meleeT > 0) this.meleeT = Math.max(0, this.meleeT - dt * 3.4);
    for (let i = 0; i < 3; i += 1) {
      this.moveCd[i] = Math.max(0, this.moveCd[i] - dt);
    }
    if (this.bannerT > 0) {
      this.bannerT = Math.max(0, this.bannerT - dt);
      if (this.bannerT <= 0) this.banner = null;
    }

    this.updateRecovery(dt);
    this.updateAura(dt);
    this.simTime += dt;
    this.scheduler.update(this.simTime);
    if (this.kit) {
      const moving = this.moveAxis.x !== 0 || this.moveAxis.z !== 0 || ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].some((k) => this.keys.has(k));
      this.kit.update({
        dt,
        time: this.simTime,
        speed: this.playerSpeed,
        sprinting: this.sprinting,
        moving,
        aura: this.aura,
        maxAura: this.maxAura,
        burnout: this.burnout,
        ascend: this.keys.has(' '),
        descend: this.keys.has('control'),
        boost: this.keys.has('shift'),
        stunned: this.hitStun > 0.12,
      });
      this.striker.setFork(this.kit.forkArmed ?? false);
    } else this.striker.setFork(false);
    this.updatePlayerMove(dt, time);
    const recovering = this.recoveryT > 0;
    const locked = recovering || (this.kit?.locked ?? false);
    // Busy hands (weapon thrown, spinning): only the power that is on may be
    // pressed, to switch it off.
    const busy = this.kit?.busy ?? false;
    for (let i = 0; i < 3; i += 1) {
      if (this.queuedMoves[i]) {
        this.queuedMoves[i] = false;
        if (!locked && (!busy || this.moveT[i] > 0)) this.tryMove(i);
      }
    }
    this.pollPad();
    if (this.fireHeld && !this.fireEdge) {
      this.fireEdge = true;
      const near = this.nearestHost(this.pos);
      const close = near ? Math.hypot(near.pos.x - this.pos.x, near.pos.z - this.pos.z) < 2.75 : false;
      if (close) {
        this.punchQueued = true;
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
    this.throwables?.update(dt, this.simTime, (x, z) => this.world.heightAt(x, z), (item, point) => {
      this.resolveThrowImpact(item, point);
    });
    this.updateCombatDebug();
    this.updateFallen(dt);
    this.updateBolts(dt);
    this.updateRound(dt);
    this.updateCamera(dt);
    this.rings.update(dt);
    this.cracks.update(dt);
    this.afterimages.update(dt);
    this.beacon?.update(dt, time, this.pos, this.spec.visual.auraColor, this.camera);
    this.powerVfx.update(dt, time, this.aura, this.maxAura, !this.burnout, this.camera);
  }

  // ---------------------------------------------------------------------------
  // Arena + Ryder Beacon
  // ---------------------------------------------------------------------------

  /**
   * Point the raid at an arena. The city stays loaded. Training P.A.D. is
   * built the first time it is selected, then the two groups swap visibility.
   * The Beacon is rebuilt at that arena's fixed point.
   */
  loadArena(id: ArenaId) {
    const def = arenaSpec(id) ?? arenaSpec(DEFAULT_ARENA)!;
    this.arena = def;
    const key = def.worldKey ?? 'block';
    let next = this.worlds.get(key);
    if (!next && key === 'pad') {
      next = buildPadWorld();
      this.worlds.set('pad', next);
      this.scene.add(next.group);
    }
    if (!next) next = this.worlds.get('block') ?? this.world;
    if (next !== this.world) {
      this.world.group.visible = false;
      next.group.visible = true;
      this.world = next;
      this.scene.updateMatrixWorld(true);
      this.rig.setOccluders(this.world.occluders);
    }
    const fog = this.scene.fog as THREE.FogExp2 | null;
    if (fog) {
      if (key === 'pad') {
        fog.color.setHex(0x07141c);
        fog.density = 0.011;
      } else {
        fog.color.setHex(0x1a0c22);
        fog.density = 0.007;
      }
    }
    this.unloadBeacon();
    const point = def.ryderBeaconPoint;
    const position = new THREE.Vector3(point.x, this.world.heightAt(point.x, point.z), point.z);
    this.beacon = new RyderBeacon(position, this.particles, { cooldownDuration: def.beaconCooldown });
    this.scene.add(this.beacon.group);
    if (this.player) {
      this.pos.set(def.spawnPoint.x, 0, def.spawnPoint.z);
      this.player.humanoid.group.position.copy(this.pos);
      this.player.humanoid.group.position.y = this.world.heightAt(this.pos.x, this.pos.z) + (this.kit?.airY ?? 0);
      this.rig.snap(this.pos, this.yaw, this.pitch);
      for (const host of this.hosts) {
        if (host.hp <= 0) continue;
        const alley = this.spawnAlley();
        host.pos.copy(alley.position);
        host.fighter.humanoid.group.position.copy(host.pos);
        host.fighter.humanoid.group.position.y = this.world.heightAt(host.pos.x, host.pos.z);
        this.paintTraining(host, Boolean(this.world.training));
      }
      if (def.id === 'training-pad') {
        this.banner = { title: 'TRAINING P.A.D.', sub: 'JAB VISIONS · PARANORMAL ACTIVITY DIVISION' };
        this.bannerT = 3.2;
      }
    }
  }

  getArena(): ArenaDefinition {
    return this.arena;
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
    if (!this.player || this.phase === 'dead' || this.recoveryT > 0 || this.kit?.locked) return;
    const beacon = this.beacon;
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
    this.recoveryFrom = { hp: this.hp, aura: this.aura };
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
      this.particles.emit(this.pos.clone().setY(0.3), this.spec.visual.electricityColor, 26, {
        speed: 9,
        size: 0.3,
        life: 0.5,
        up: 0.25,
        gravity: 2,
      });
    }
  }

  private updateAura(dt: number) {
    let drain = 0;
    for (let i = 0; i < 3; i += 1) {
      if (this.moveT[i] > 0) drain += this.moves[i].drain;
    }
    if (drain > 0) {
      this.spendAura(drain * dt);
      if (this.burnout || this.aura <= 0) this.endAllMoves();
    } else if (!this.kit?.flying) {
      const regen =
        this.spec.auraRegen +
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
    this.aura = Math.max(0, this.aura - amount);
    if (this.aura <= 0.01) {
      this.aura = 0;
      this.burnout = true;
      this.particles.emit(this.muzzle(), 0x8899aa, 18, { speed: 4, size: 0.28, life: 0.45, up: 0.4 });
    }
  }

  private updatePlayerMove(dt: number, time: number) {
    if (!this.player) return;
    const phased = this.isPhased();
    const locked = this.kit?.locked ?? false;

    let x = this.moveAxis.x;
    let z = this.moveAxis.z;
    if (this.keys.has('arrowup')) z -= 1;
    if (this.keys.has('arrowdown')) z += 1;
    if (this.keys.has('arrowleft')) x -= 1;
    if (this.keys.has('arrowright')) x += 1;
    if (this.simTime > this.suppressUntil) this.suppress = 1;
    if (this.recoveryT > 0 || locked || this.pvpCpu?.grabsPlayer() || this.stasis > 0) {
      x = 0;
      z = 0;
    }
    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    const busy = this.kit?.busy ?? false;
    this.sprinting = this.keys.has('shift') && len > 0.1 && !this.fireHeld && this.meleeT <= 0 && !busy;
    let speed =
      this.spec.speed *
      (this.sprinting ? SPRINT_MULTIPLIER : 1) *
      (this.burnout ? 0.82 : 1) *
      (this.kit?.moveScale ?? 1) *
      this.suppress;
    if (this.hitStun > 0.05) speed *= 0.22;

    _fwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    _right.set(-_fwd.z, 0, _fwd.x);
    _tmp.copy(_fwd).multiplyScalar(-z).add(_right.multiplyScalar(x));
    if (this.dodgeT > 0) {
      _tmp.set(this.dodgeX, 0, this.dodgeZ);
      speed = 15;
    } else if (_tmp.lengthSq() > 0) _tmp.normalize();
    this.pos.addScaledVector(_tmp, speed * dt);
    this.hitKnock.multiplyScalar(Math.max(0, 1 - dt * 5));
    this.pos.addScaledVector(this.hitKnock, dt);
    this.pos.x = clamp(this.pos.x, -BOUNDARY, BOUNDARY);
    this.pos.z = clamp(this.pos.z, -BOUNDARY, BOUNDARY);
    resolveCircle(this.pos, this.playerRadius(), this.world.obstacles);

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

    this.player.humanoid.group.position.copy(this.pos);
    this.player.humanoid.group.position.y =
      this.world.heightAt(this.pos.x, this.pos.z) + (this.kit?.airY ?? 0) + this.airY - (this.pvpCpu?.playerSink() ?? 0);
    this.player.humanoid.group.rotation.y = this.yaw + (this.kit?.bodyYaw ?? 0);
    const bodyScale = this.kit?.bodyScale ?? 1;
    if (Math.abs(this.player.humanoid.group.scale.x - bodyScale) > 0.0001) {
      this.player.humanoid.group.scale.setScalar(bodyScale);
    }

    if (this.shield) {
      this.shield.visible = this.isActive('forcefield') && !this.kitClaimed.has('forcefield');
      this.shield.position.copy(this.pos).setY(1.1);
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
    const kitGlow = this.kit?.glow ?? 0;
    if (kitGlow > 0 || this.playerGlow > 0) {
      flashEmissive(this.player.humanoid, kitGlow > 0 ? this.spec.visual.auraColor : 0x000000, kitGlow * 0.9);
      this.playerGlow = kitGlow;
    }
    if (phased && !this.kit) {
      this.particles.emit(this.pos.clone().setY(1), this.spec.color, 1, {
        speed: 1.4,
        size: 0.18,
        life: 0.35,
        up: 0.8,
      });
    }
  }

  /** Pose runs after the strike window so the fist and the hit share a frame. */
  private presentPlayer(dt: number, time: number) {
    if (!this.player) return;
    const moving = this.locomote;
    this.player.humanoid.group.rotation.y = this.yaw + (this.kit?.bodyYaw ?? 0);
    this.anim += dt * (8 + moving * (this.sprinting ? 9 : 6));
    if (this.player.meshSource === 'gltf') {
      animateGltfFighter(this.player, dt, this.anim, moving, this.sprinting, this.meleeT, this.meleeStarted, {
        pose: this.kit?.pose ?? this.jumpPose(),
        style: this.strikeOverride ?? undefined,
        camera: this.camera,
      });
      this.meleeStarted = false;
      this.strikeOverride = null;
    } else {
      animateHumanoid(this.player.humanoid, this.anim, moving, time);
      if (this.meleeT > 0) poseMelee(this.player.humanoid, 1 - this.meleeT);
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
    this.yaw = Math.atan2(dx, dz);
  }

  private tryFire() {
    if (!this.player || this.burnout || this.fireCd > 0) return;
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
    if (command === 'melee') this.meleeQueued = true;
    if (command === 'dodge') this.dodgeQueued = true;
    if (command === 'jump') this.jumpQueued = true;
    if (command === 'ability1') this.queuedMoves[0] = true;
    if (command === 'ability2') this.queuedMoves[1] = true;
    if (command === 'ability3') this.queuedMoves[2] = true;
  }

  private pollPad() {
    const pads = typeof navigator === 'undefined' ? null : navigator.getGamepads?.();
    const pad = pads ? Array.from(pads).find((item) => item && item.connected) : null;
    if (!pad) return;
    const commands = risingPadCommands(
      pad.buttons.map((button) => button.pressed),
      this.padPrev,
    );
    for (const command of commands) this.queueCommand(command, 1);
  }

  private tryDodge() {
    if (this.dodgeCd > 0 || this.hitStun > 0.18 || this.stasis > 0 || (this.kit?.locked ?? false)) return;
    let x = this.moveAxis.x;
    let z = this.moveAxis.z;
    if (this.keys.has('arrowup')) z -= 1;
    if (this.keys.has('arrowdown')) z += 1;
    if (this.keys.has('arrowleft')) x -= 1;
    if (this.keys.has('arrowright')) x += 1;
    const len = Math.hypot(x, z);
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
    this.dodgeCd = 0.88;
    this.iframes = Math.max(this.iframes, 0.16);
    this.combatMemory.note('dodge', this.simTime);
    this.striker.interrupt();
    this.kit?.onDodge?.();
  }

  /** Grounded hop. A second press while that hop is still up can mount, for a kit that flies. */
  private tryJump() {
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
    if (this.hitStun > 0.12 || this.dodgeT > 0 || (this.kit?.locked ?? false)) return;
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
        this.player.humanoid.group.position.y =
          this.world.heightAt(this.pos.x, this.pos.z) + (this.kit?.airY ?? 0) + this.airY - (this.pvpCpu?.playerSink() ?? 0);
      }
    }
    const canAct = !locked && !busy && this.hitStun < 0.12 && this.dodgeT <= 0 && this.stasis <= 0;
    if ((this.punchQueued || this.kickQueued || this.meleeQueued) && canAct) this.faceNearest(3.4);
    if (this.heldThrow && (this.punchQueued || this.kickQueued)) {
      this.releaseHeldThrow();
      this.punchQueued = false;
      this.kickQueued = false;
    }
    if (this.kit?.flying) {
      if (this.punchQueued) {
        this.punchQueued = false;
        this.kit.airStrike?.('punch');
      }
      if (this.kickQueued) {
        this.kickQueued = false;
        this.kit.airStrike?.('kick');
      }
      if (this.meleeQueued) {
        this.meleeQueued = false;
        this.kit.airStrike?.('melee');
      }
    }
    if (this.punchQueued) {
      this.punchQueued = false;
      if (canAct || this.striker.busy) this.striker.queue('punch');
      this.combatMemory.note('punch', this.simTime);
    }
    if (this.kickQueued) {
      this.kickQueued = false;
      if (canAct || this.striker.busy) this.striker.queue('kick');
      this.combatMemory.note('kick', this.simTime);
    }
    if (this.meleeQueued) {
      this.meleeQueued = false;
      if (this.striker.busy) this.striker.queue('melee');
      else if (canAct && this.meleeCd <= 0) {
        const near = this.nearestHost(this.pos);
        const dist = near ? Math.hypot(near.pos.x - this.pos.x, near.pos.z - this.pos.z) : 99;
        const sequence = this.striker.combo.snapshot(this.simTime).sequence;
        if (near && meleeWantsGrab(sequence, dist, false, recipesFor(this.spec.id))) this.striker.queue('melee');
        else this.tryMelee();
        this.combatMemory.note('melee', this.simTime);
      }
    }
    if (this.dodgeQueued) {
      this.dodgeQueued = false;
      if (canAct) this.tryDodge();
    }
    const tempo = Math.min(1.2, Math.max(0.4, (this.kit?.haste ?? 1) * this.suppress));
    const frame = this.striker.tick(dt * tempo, {
      time: this.simTime,
      stunned: this.hitStun > 0.12 || this.stasis > 0,
      locked: locked || busy,
      facing: this.yaw,
      x: this.pos.x,
      z: this.pos.z,
      meleeDamage: this.meleeDamage(),
      targets: this.hosts
        .filter((host) => host.hp > 0)
        .map((host) => ({
          ref: host,
          x: host.pos.x,
          z: host.pos.z,
          radius: host.radius,
          airborne: host.airY > 0.3,
        })),
    });
    if (frame.lunge) {
      _fwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      this.pos.addScaledVector(_fwd, frame.lunge);
      this.pos.x = clamp(this.pos.x, -BOUNDARY, BOUNDARY);
      this.pos.z = clamp(this.pos.z, -BOUNDARY, BOUNDARY);
      resolveCircle(this.pos, PLAYER_RADIUS, this.world.obstacles);
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
    const shock = frame.hits.find((hit) => hit.shockRange);
    if (shock?.shockRange) this.forkShock(shock.shockRange, frame.hits.map((hit) => hit.target.ref));
    this.cueStrike(frame);
  }

  private applyFighterHit(hit: StrikerHit) {
    const host = hit.target.ref as Host;
    if (!this.hosts.includes(host) || host.hp <= 0) return;
    _tmp.set(host.pos.x - this.pos.x, 0, host.pos.z - this.pos.z);
    if (_tmp.lengthSq() < 1e-4) _tmp.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    _tmp.normalize();
    host.lastImpact = { x: _tmp.x, z: _tmp.z, speed: hit.knockback, kind: hit.kind };
    if (hit.kind === 'throw') host.held = 0;
    this.hurtHost(host, hit.damage, _tmp, hit.reaction, hit.strength);
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
      this.pos.x = clamp(this.pos.x, -BOUNDARY, BOUNDARY);
      this.pos.z = clamp(this.pos.z, -BOUNDARY, BOUNDARY);
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
        this.particles.emit(host.pos.clone().setY(1.1), 0xffffff, 4, { speed: 3, size: 0.3, life: 0.16 });
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
        this.hurtHost(host, damage, dir, reaction, strength);
        return Math.max(0, before - Math.max(0, host.hp));
      },
      flash: (target, color, seconds) => {
        const host = target as Host;
        host.hit = Math.max(host.hit, seconds);
        host.hitColor = color;
      },
      meleeDamage: () => this.meleeDamage(),
      heightAt: (x, z) => this.world.heightAt(x, z),
      resolve: (pos) => {
        pos.x = clamp(pos.x, -BOUNDARY, BOUNDARY);
        pos.z = clamp(pos.z, -BOUNDARY, BOUNDARY);
        resolveCircle(pos, engine.playerRadius(), this.world.obstacles);
      },
      blocked: (x, z, radius) => Math.abs(x) > BOUNDARY || Math.abs(z) > BOUNDARY || pointBlocked(x, z, radius, this.world.obstacles),
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
        if (cut) this.rig.snap(this.pos, this.yaw, this.pitch);
      },
      gainAura: (amount) => {
        this.aura = Math.min(this.maxAura, this.aura + Math.max(0, amount));
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
        const slot = this.moves.findIndex((move) => move.id === id);
        if (slot >= 0) this.moveCd[slot] = Math.max(this.moveCd[slot], seconds);
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
    if (!this.player || this.burnout) return;
    const move = this.moves[slot];
    if (!move || this.moveCd[slot] > 0) return;
    this.moveCd[slot] = 0.16;

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
        this.particles.emit(this.pos.clone().setY(1.1), this.spec.color, 22, {
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

    if (this.aura < move.auraCost) return;
    this.armPvpHit(slot);
    this.spendAura(move.auraCost);
    this.abilityT = ABILITY_LINGER;
    this.combatT = COMBAT_LINGER;
    const id = move.id;
    // A Ryder kit that owns this power plays it out itself.
    if (this.kit?.tryAbility(id)) {
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
    this.particles.emit(this.pos.clone().setY(1.1), this.spec.color, 18, {
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
    for (let i = 0; i < 3; i += 1) this.endMove(i);
  }

  private fireSpread(count: number, spread: number, damageMul: number) {
    if (this.spec.id !== 'zoe') return;
    this.lookDir(_look);
    _right.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const origin = this.muzzle();
    const dmg = this.shotDamage() * damageMul;
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
      this.hurtHost(host, damage, knock < 0 ? _tmp.multiplyScalar(-1) : _tmp);
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
      this.pos.x = clamp(this.pos.x, -BOUNDARY, BOUNDARY);
      this.pos.z = clamp(this.pos.z, -BOUNDARY, BOUNDARY);
      resolveCircle(this.pos, PLAYER_RADIUS, this.world.obstacles);
      for (const host of this.hosts) {
        if (hit.has(host)) continue;
        const d = Math.hypot(host.pos.x - this.pos.x, host.pos.z - this.pos.z);
        if (d < host.radius + 1.35) {
          hit.add(host);
          this.hurtHost(host, 26, _look);
        }
      }
    }
    this.iframes = Math.max(this.iframes, 0.28);
  }

  private cleave() {
    this.meleeT = 1;
    this.meleeStarted = true;
    _fwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const dmg = this.meleeDamage() * 1.45;
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
      this.hurtHost(host, 18, _tmp);
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
      if (!pointBlocked(_tmp.x, _tmp.z, PLAYER_RADIUS + 0.15, this.world.obstacles) && Math.abs(_tmp.x) < BOUNDARY && Math.abs(_tmp.z) < BOUNDARY) {
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
        _tmp2.copy(target.pos).setY(1.1).sub(clone.fighter.humanoid.group.position.clone().setY(1.1)).normalize();
        this.spawnBolt(
          clone.fighter.humanoid.group.position.clone().setY(1.25),
          _tmp2,
          this.shotDamage() * 0.55,
          true,
          this.spec.color,
          this.spec.projectileSpeed,
        );
      }
    }
  }

  private beginRound(n: number) {
    this.round = n;
    this.phase = 'playing';
    this.queue = composeRound(n);
    this.spawnTimer = 0.4;
    const banner = roundBanner(n);
    if (this.arena.id === 'training-pad' && n === 1) banner.sub = 'P.A.D. · TRAINING FACILITY';
    this.banner = banner;
    this.bannerT = 3.2;
    this.kit?.onRound?.();
  }

  private updateRound(dt: number) {
    if (this.gameMode === GameMode.PVP) return;
    if (this.phase === 'intermission') {
      this.intermissionLeft = Math.max(0, this.intermissionLeft - dt);
      if (this.intermissionLeft <= 0) this.beginRound(this.round + 1);
      return;
    }
    const scale = roundScaling(this.round);
    this.spawnTimer -= dt;
    while (this.spawnTimer <= 0 && this.queue.length && this.hosts.length < MAX_ALIVE_HOSTS) {
      const kind = this.queue.shift();
      if (kind) this.spawnHost(kind, scale);
      this.spawnTimer += scale.spawnInterval;
    }
    if (this.queue.length === 0 && this.hosts.length === 0 && this.round > 0) {
      this.phase = 'intermission';
      this.intermissionLeft = INTERMISSION;
      this.points += this.round * 250;
      this.hp = Math.min(this.maxHp, this.hp + 16);
      this.banner = { title: 'ROUND CLEAR', sub: 'HOLD THE SPIRE · BUY STRENGTH' };
      this.bannerT = 3;
    }
  }

  /** Prefer alleys in the block the Ryder is standing in, so a wave still arrives on a four-block map. */
  private spawnAlley() {
    const alleys = this.world.alleys;
    const reach = DISTRICT_SPAN * 0.65;
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

  private spawnHost(kind: EnemyKind, scale: ReturnType<typeof roundScaling>) {
    const spec = ENEMIES[kind];
    const alley = this.spawnAlley();
    const lateral = (Math.random() - 0.5) * 2.4;
    const pos = alley.position.clone();
    pos.x += alley.inward.z * lateral;
    pos.z += -alley.inward.x * lateral;
    const profileId = profileForKind(kind, Math.random());
    const civilian = definitionForProfile(profileId, Math.random());
    const fighter = buildHost(kind, civilian.modelPath);
    fighter.humanoid.group.position.copy(pos);
    fighter.humanoid.group.position.y = this.world.heightAt(pos.x, pos.z);
    this.scene.add(fighter.humanoid.group);
    this.hosts.push({
      kind,
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
    });
    const spawned = this.hosts[this.hosts.length - 1];
    if (spawned && this.world.training) this.paintTraining(spawned, true);
  }

  /** Holographic paint for hosts inside Training P.A.D. Restored when they leave. */
  private paintTraining(host: Host, on: boolean) {
    host.fighter.humanoid.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        const std = mat as THREE.MeshStandardMaterial;
        if (!std.emissive) continue;
        const data = std.userData as {
          padBase?: { opacity: number; transparent: boolean; emissive: number; intensity: number };
        };
        if (!data.padBase) {
          data.padBase = {
            opacity: std.opacity,
            transparent: std.transparent,
            emissive: std.emissive.getHex(),
            intensity: std.emissiveIntensity ?? 0,
          };
        }
        const base = data.padBase;
        if (on) {
          std.emissive.setHex(0x39e7ff);
          std.emissiveIntensity = 0.55;
          std.transparent = true;
          std.opacity = 0.72;
        } else {
          std.emissive.setHex(base.emissive);
          std.emissiveIntensity = base.intensity;
          std.transparent = base.transparent;
          std.opacity = base.opacity;
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

    for (let i = 0; i < this.hosts.length; i += 1) {
      for (let j = i + 1; j < this.hosts.length; j += 1) {
        const a = this.hosts[i];
        const b = this.hosts[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) / (a.mass + b.mass);
        a.pos.x -= (dx / d) * push * b.mass;
        a.pos.z -= (dz / d) * push * b.mass;
        b.pos.x += (dx / d) * push * a.mass;
        b.pos.z += (dz / d) * push * a.mass;
      }
    }
    for (const host of this.hosts) {
      if (host.held > 0) continue;
      resolveCircle(host.pos, host.radius, this.world.obstacles);
    }

    for (const host of this.hosts) {
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

      // Physical hit reactions: staggered hosts stop and reel, launched hosts
      // arc through the air and tumble, and both still drift with the shove.
      const landed = stepReaction(host, dt);
      if (landed) {
        host.stagger = Math.max(host.stagger, 0.35);
        this.particles.emit(host.pos.clone().setY(0.15), 0x6a6070, 8, { speed: 3.5, size: 0.24, life: 0.4, up: 0.6, gravity: 6 });
      }
      if (host.airY > 0) host.tumble += host.spin * dt;
      else host.tumble *= Math.max(0, 1 - dt * 10);
      if (host.stagger > 0 || host.airY > 0) {
        host.pos.x += host.knock.x * dt;
        host.pos.z += host.knock.z * dt;
        host.pos.x = clamp(host.pos.x, -BOUNDARY, BOUNDARY);
        host.pos.z = clamp(host.pos.z, -BOUNDARY, BOUNDARY);
        resolveCircle(host.pos, host.radius, this.world.obstacles);
        group.position.copy(host.pos);
        group.position.y = this.world.heightAt(host.pos.x, host.pos.z) + host.airY - host.sink;
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
        host.fighter.humanoid.group.position.y = this.world.heightAt(host.pos.x, host.pos.z) + Math.min(1.5, host.stun * 0.7);
        this.animateHost(host, dt, 0.12, time);
        if (host.hit > 0) flashEmissive(host.fighter.humanoid, host.hitColor, host.hit * 2.4);
        else flashEmissive(host.fighter.humanoid, 0x66cfff, 0.45);
        continue;
      }

      this.driveCivilian(host, dt, time, phased, shielded);
    }
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

  /** Walls, cars, and the map edge. Used so NPCs turn before they grind. */
  private npcBlocked(x: number, z: number, radius: number) {
    return Math.abs(x) > BOUNDARY || Math.abs(z) > BOUNDARY || pointBlocked(x, z, radius, this.world.obstacles);
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
      if (host.summon <= 0 && this.hosts.length < MAX_ALIVE_HOSTS && this.phase === 'playing') {
        host.summon = 8;
        const scale = roundScaling(this.round);
        this.spawnHost('walker', scale);
        if (this.hosts.length < MAX_ALIVE_HOSTS) this.spawnHost('sprinter', scale);
      }
    }

    let slot = 0;
    for (const other of this.hosts) {
      if (other === host) break;
      if (!other.duelist && other.hp > 0) slot += 1;
    }
    const pdx = this.pos.x - host.pos.x;
    const pdz = this.pos.z - host.pos.z;
    const playerDist = Math.hypot(pdx, pdz) || 0.0001;
    const prop = this.throwables?.nearestFree(host.pos.x, host.pos.z) ?? null;
    const propDist = prop ? Math.hypot(prop.pos.x - host.pos.x, prop.pos.z - host.pos.z) : null;
    const order = civilianOrder(profile, {
      dist: playerDist,
      hpRatio: host.maxHp > 0 ? host.hp / host.maxHp : 1,
      holding: Boolean(host.heldItem),
      throwableDist: propDist,
      slot,
      recovering: striker.busy,
      rng: Math.random(),
    });

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
        const aim = this.pos.clone();
        aim.x += this.playerVel.x * flight * 0.55;
        aim.z += this.playerVel.z * flight * 0.55;
        aim.y = 1.05;
        const spread = 2.4 + (1 - profile.throwBias) * 3.2;
        const miss = (Math.random() - 0.5) * spread;
        this.throwables?.throwAt(item, host.pos.clone().setY(1.35), aim, miss, host, this.simTime);
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
      host.cooldown = 0.48 + Math.random() * 0.4;
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

    let gx = this.pos.x;
    let gz = this.pos.z;
    if ((order.state === 'search' || order.state === 'pickup') && prop) {
      gx = prop.pos.x;
      gz = prop.pos.z;
    } else if (!phased) {
      const ang = slot * 1.9;
      const ring = slot >= 2 ? 1.7 : 0;
      gx += Math.cos(ang) * ring;
      gz += Math.sin(ang) * ring;
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
    if (hazard) {
      vx = hazard.x;
      vz = hazard.z;
    }
    const speed = host.speed * profile.speed * (order.state === 'flee' || hazard ? 1.35 : 1);
    const mag = Math.hypot(vx, vz);
    let travelX = 0;
    let travelZ = 0;
    if (mag > 0.05) {
      const steered = steerVelocity(
        host.pos.x,
        host.pos.z,
        (vx / mag) * speed,
        (vz / mag) * speed,
        host.radius,
        (x, z, radius) => this.npcBlocked(x, z, radius),
        gx,
        gz,
      );
      travelX = steered.x;
      travelZ = steered.z;
      host.pos.x += travelX * dt + host.knock.x * dt;
      host.pos.z += travelZ * dt + host.knock.z * dt;
    } else {
      host.pos.x += host.knock.x * dt;
      host.pos.z += host.knock.z * dt;
    }
    host.pos.x = clamp(host.pos.x, -BOUNDARY, BOUNDARY);
    host.pos.z = clamp(host.pos.z, -BOUNDARY, BOUNDARY);
    resolveCircle(host.pos, host.radius, this.world.obstacles);
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

    const faceX = order.state === 'search' && prop ? prop.pos.x - host.pos.x : this.pos.x - host.pos.x;
    const faceZ = order.state === 'search' && prop ? prop.pos.z - host.pos.z : this.pos.z - host.pos.z;
    const facing = Math.atan2(faceX, faceZ);
    const group = host.fighter.humanoid.group;
    group.position.copy(host.pos);
    group.position.y = this.world.heightAt(host.pos.x, host.pos.z) - host.sink;
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

    const haste = Math.min(1, Math.max(0.4, host.attackScale ?? 1));
    const frame = striker.tick(dt * haste, {
      time: this.simTime,
      stunned: host.stagger > 0.05 || host.stun > 0,
      locked: false,
      facing,
      x: host.pos.x,
      z: host.pos.z,
      meleeDamage: host.damage,
      targets: phased
        ? []
        : [{ ref: this.playerBody, x: this.pos.x, z: this.pos.z, radius: PLAYER_RADIUS, airborne: this.airY > 0.3 }],
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
    if (host.hit > 0) flashEmissive(host.fighter.humanoid, host.hitColor, host.hit * 2.4);
    else flashEmissive(host.fighter.humanoid, 0x000000, 0);

    this.cueStrike(frame);
    if (shielded && frame.hits.length) {
      this.particles.emit(this.pos.clone().setY(1.2), 0x66e7ff, 10, { speed: 6, size: 0.22, life: 0.3 });
      host.knock.set(-Math.sin(facing) * 8, 0, -Math.cos(facing) * 8);
      return;
    }
    for (const hit of frame.hits) {
      if (hit.target.ref !== this.playerBody || this.kit?.passthrough) continue;
      _tmp.set(Math.sin(facing), 0, Math.cos(facing));
      this.hurtPlayer(hit.damage, _tmp, undefined, {
        reaction: hit.reaction,
        strength: hit.strength,
        hitStun: hit.hitStun,
        knockback: hit.knockback * 0.55,
      });
    }
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
    if (host.fighter.meshSource === 'gltf') {
      animateGltfFighter(host.fighter, dt, host.anim, moving, host.speed > 5, meleeT, host.swing, {
        style,
        clipHint: clipHintFor(host.animMap, style, throwing),
        pose,
      });
      host.swing = false;
    } else {
      animateHumanoid(host.fighter.humanoid, host.anim, moving, time);
    }
    host.fighter.glitch?.update(time, this.camera);
  }

  private hurtPlayer(amount: number, dir: THREE.Vector3, kind?: PvpDamageKind, physical?: PhysicalHit) {
    if (this.iframes > 0 || this.phase === 'dead' || this.kit?.intangible) return;
    const scaled = kind ? calculatePvPDamage({ baseDamage: amount, kind }) : amount;
    // A braced Ryder (mid-spin) shrugs most of the blow off: less damage, no shove.
    const braced = clamp(this.kit?.braced ?? 0, 0, 1);
    this.hp = Math.max(0, this.hp - scaled * (1 - 0.4 * braced));
    if (physical) {
      if (this.takenGap > 0.5) this.takenChain = 0;
      this.takenChain += 1;
      this.takenGap = 0;
      let stun = physical.hitStun * (1 - 0.65 * braced);
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
    this.particles.emit(this.pos.clone().setY(1.2), 0xff5570, 14, { speed: 6, size: 0.28, life: 0.4, up: 0.5 });
    if (this.hp <= 0) {
      this.hp = 0;
      this.phase = 'dead';
      this.kit?.interrupt();
      this.scheduler.clear();
      this.banner = {
        title: 'SIGNAL LOST',
        sub: this.arena.id === 'training-pad' ? 'THE FACILITY TOOK YOU' : 'THE BLOCK TOOK YOU',
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
    if (host.duelist && !host.controlled && this.pvpCpu && (this.pvpCpu.iframes > 0 || this.pvpCpu.intangible)) return;
    if (this.gameMode === GameMode.PVP && host.duelist) {
      amount = calculatePvPDamage({ baseDamage: amount, kind: this.outgoingPvpKind() });
    }
    host.hp -= amount;
    host.hit = 0.18;
    host.hitColor = 0xffffff;
    if (reaction) {
      applyReaction(host, reaction, dir, strength);
      if (reaction !== 'stagger') host.cooldown = Math.max(host.cooldown, 0.5);
    } else {
      host.knock.copy(dir).setY(0).multiplyScalar(8 / host.mass);
    }
    this.particles.emit(host.pos.clone().setY(1.1), this.spec.color, 8, {
      speed: 7,
      size: 0.22,
      life: 0.28,
      direction: dir,
    });
    if (host.hp <= 0) this.killHost(host, reaction && reaction !== 'stagger' ? dir : null, strength);
  }

  /**
   * Remove a host. If it died to a heavy blow it keeps flying as a tumbling
   * body for a moment instead of vanishing on the spot.
   */
  private killHost(host: Host, flungBy: THREE.Vector3 | null = null, strength = 1) {
    // Kits may still hold a reference; make sure it reads as dead.
    host.hp = Math.min(host.hp, 0);
    host.held = 0;
    if (host.duelist && host.ryderId) {
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
      this.points += host.points;
      this.aura = Math.min(this.maxAura, this.aura + KILL_AURA_SIPHON + this.upgrades.siphon * 4);
    }
    this.burst(host.pos.clone().setY(1), host.kind === 'broadcaster' ? 0xb84dff : 0x7dff9a, host.kind === 'broadcaster' ? 40 : 16);
    this.hosts = this.hosts.filter((h) => h !== host);
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
    this.scene.remove(host.fighter.humanoid.group);
    disposeObject(host.fighter.humanoid.group);
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
      body.pos.x = clamp(body.pos.x, -BOUNDARY, BOUNDARY);
      body.pos.z = clamp(body.pos.z, -BOUNDARY, BOUNDARY);
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
  ) {
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
      bolt.mesh.position.copy(bolt.pos);
      if (bolt.pos.y < 0.15 || bolt.life <= 0 || Math.abs(bolt.pos.x) > BOUNDARY + 4 || Math.abs(bolt.pos.z) > BOUNDARY + 4) {
        this.retireBolt(i);
        continue;
      }
      if (pointBlocked(bolt.pos.x, bolt.pos.z, 0.12, this.world.obstacles) && bolt.pos.y < 2.4) {
        this.particles.emit(bolt.pos, 0xffffff, 5, { speed: 4, size: 0.16, life: 0.2 });
        this.retireBolt(i);
        continue;
      }
      if (bolt.fromPlayer) {
        let hit = false;
        for (const host of this.hosts) {
          const dx = host.pos.x - bolt.pos.x;
          const dy = 1.1 - bolt.pos.y;
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
        const dy = 1.15 - bolt.pos.y;
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
    bolt.mesh.visible = false;
    this.bolts.splice(index, 1);
    this.boltPool.push(bolt);
  }

  private shotDamage() {
    const phased = this.isActive('phase');
    return this.spec.damage * (1 + 0.15 * this.upgrades.signal) * (phased ? 1.4 : 1);
  }

  private meleeDamage() {
    const fists = 1 + 0.25 * this.upgrades.fists;
    const burned = this.burnout ? (this.upgrades.fists >= 3 ? 0.85 : 0.45) : 1;
    return this.spec.meleeDamage * fists * burned;
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
      _tmp.copy(host.pos).setY(1.1);
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
      1.25,
      this.pos.z + Math.cos(this.yaw) * 0.7,
    );
  }

  private nearestHost(from: THREE.Vector3) {
    let best: Host | null = null;
    let bestD = Infinity;
    for (const host of this.hosts) {
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
    if (this.abilityT > 0 || this.kit?.locked || this.kit?.busy || this.moveT.some((t) => t > 0)) return 'ABILITY';
    if (this.sprinting) return 'SPRINT';
    if (this.combatT > 0) return 'COMBAT';
    for (const host of this.hosts) {
      if (host.pos.distanceToSquared(this.pos) < COMBAT_PROXIMITY * COMBAT_PROXIMITY) return 'COMBAT';
    }
    return 'EXPLORATION';
  }

  private updateCamera(dt: number) {
    // Ride part of a kit's airtime so a flip or leap stays in frame; descents
    // (phasing underground) leave the pivot on the ground.
    this.cameraPivot.copy(this.pos);
    this.cameraPivot.y += Math.max(0, this.kit?.airY ?? 0) * 0.6 + this.airY * 0.45;
    this.rig.setFramingExtra(this.kit?.cameraExtra ?? null);
    this.rig.update(dt, this.cameraPivot, this.yaw, this.pitch, this.cameraState());
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
          (this.moveT[i] > 0 ||
            (move.drain > 0 ? this.aura > 1 : this.aura >= move.auraCost)),
        cooldown: 0,
        duration: this.moveT[i],
      })),
      round: this.round,
      remaining: this.queue.length + this.hosts.length,
      points: this.points,
      phase: this.phase,
      intermissionLeft: this.intermissionLeft,
      nearShop: this.phase === 'intermission' && nearDistrictHub(this.pos.x, this.pos.z, 6.2),
      banner: this.banner,
      upgrades: { ...this.upgrades },
      pointerLocked: this.pointerLocked,
      paused: this.paused,
      ryderId: this.spec.id,
      ryderName: this.spec.name,
      meleeOnly: this.burnout,
      cameraState: this.rig.getState(),
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
        enemies: this.hosts.filter((host) => host.hp > 0).map((host) => ({ x: host.pos.x, z: host.pos.z })),
      },
    });
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
    const spec = RYDERZ[id];
    if (spec.glb) {
      await preloadRyderGltf(spec).catch((error) => {
        console.warn('[raid] failed to load opponent GLB, using block figure', error);
      });
    }
    if (this.disposed) return;
    const fighter = buildRyder(spec, { clone: true });
    const pos = new THREE.Vector3(-Math.sign(this.pos.x || 1) * 8, 0, -Math.sign(this.pos.z || 1) * 8);
    fighter.humanoid.group.position.copy(pos);
    fighter.humanoid.group.position.y = this.world.heightAt(pos.x, pos.z);
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
      controlled,
      ryderId: id,
      aura: spec.maxAura,
      maxAura: spec.maxAura,
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
        heightAt: (x, z) => this.world.heightAt(x, z),
        resolve: (pos) => {
          pos.x = clamp(pos.x, -BOUNDARY, BOUNDARY);
          pos.z = clamp(pos.z, -BOUNDARY, BOUNDARY);
          resolveCircle(pos, PLAYER_RADIUS, this.world.obstacles);
        },
        blocked: (x, z, radius) =>
          Math.abs(x) > BOUNDARY || Math.abs(z) > BOUNDARY || pointBlocked(x, z, radius, this.world.obstacles),
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
      host.pos.x = clamp(host.pos.x, -BOUNDARY, BOUNDARY);
      host.pos.z = clamp(host.pos.z, -BOUNDARY, BOUNDARY);
      resolveCircle(host.pos, host.radius, this.world.obstacles);
      host.fighter.humanoid.group.rotation.y = Math.atan2(mx, mz);
    }
    this.stepLocalOpponentAir(host, dt);
    host.fighter.humanoid.group.position.copy(host.pos);
    host.fighter.humanoid.group.position.y = this.world.heightAt(host.pos.x, host.pos.z) + host.airY;
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

  private spawnThrowables() {
    this.throwables?.dispose();
    this.heldThrow = null;
    this.throwables = new ThrowableField(this.scene);
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
    aim.y = 1.1;
    this.throwables.throwAt(item, this.pos.clone().setY(1.2), aim, 0.2, this.playerBody, this.simTime);
    this.heldThrow = null;
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
    const inBody = point.y > -0.05 && point.y < 1.85;
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
    this.bolts.forEach((b) => {
      b.mesh.visible = false;
      this.boltPool.push(b);
    });
    this.bolts = [];
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

