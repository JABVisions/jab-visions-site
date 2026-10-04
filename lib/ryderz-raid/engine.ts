import * as THREE from 'three';
import {
  BOUNDARY,
  BURNOUT_RECOVERY,
  ENEMIES,
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
import type { MeleeStyle } from './skeletal';
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
import { buildWorld, pointBlocked, resolveCircle, type World } from './world';

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
  phase: 'playing' | 'intermission' | 'dead';
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
  /** Colour of the current hit flash; hits reset it to white, kits can tint it. */
  hitColor: number;
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
  private queuedMoves = [false, false, false];
  private pointerLocked = false;

  private spec: RyderSpec = RYDERZ.rubi;
  /** Powers bound to Q / E / R. Defaults to the Ryder's signature moves; the Power Deck can rebind them. */
  private moves: AbilitySpec[] = RYDERZ.rubi.moves;
  private gameMode: GameMode = GameMode.PVE;
  private switchToken = 0;
  private player: Fighter | null = null;
  private shield: THREE.Mesh | null = null;
  private pos = new THREE.Vector3(9, 0, 11);
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
    this.scene.fog = new THREE.FogExp2(0x1a0c22, 0.011);

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.08, 280);
    this.scene.add(new THREE.HemisphereLight(0xffd4b8, 0x1a1430, 1.35));
    const sun = new THREE.DirectionalLight(0xffe6c8, 1.55);
    sun.position.set(-18, 42, 12);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x66ffaa, 0.35);
    fill.position.set(16, 10, -20);
    this.scene.add(fill);

    this.world = buildWorld();
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
    this.maxHp = this.spec.maxHp;
    this.hp = this.maxHp;
    this.maxAura = this.spec.maxAura;
    this.aura = this.maxAura;
    this.burnout = false;
    this.points = 0;
    this.round = 0;
    this.fireCd = 0;
    this.meleeCd = 0;
    this.meleeT = 0;
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

    this.beginRound(1);
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
    // Rules do not branch on the mode yet; it is stored so spawning and damage can.
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
    // Menus own the keyboard while paused; only Escape reaches the raid.
    if (this.paused && e.key !== 'Escape') return;
    if (e.key === 'q' || e.key === 'Q' || e.key === '1') this.queuedMoves[0] = true;
    if (e.key === 'e' || e.key === 'E' || e.key === '2') this.queuedMoves[1] = true;
    if (e.key === 'r' || e.key === 'R' || e.key === '3') this.queuedMoves[2] = true;
    if (e.key === 'f' || e.key === 'F' || e.code === 'Space') {
      this.meleeQueued = true;
    }
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
    if (!this.paused && this.player && this.phase !== 'dead') this.update(dt, time);
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

    this.fireCd = Math.max(0, this.fireCd - dt);
    this.meleeCd = Math.max(0, this.meleeCd - dt);
    this.iframes = Math.max(0, this.iframes - dt);
    if (this.meleeT > 0) this.meleeT = Math.max(0, this.meleeT - dt * 3.4);
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
      this.kit.update({ dt, time: this.simTime, speed: this.playerSpeed, sprinting: this.sprinting, moving });
    }
    this.updatePlayerMove(dt, time);
    const recovering = this.recoveryT > 0;
    const locked = recovering || (this.kit?.locked ?? false);
    for (let i = 0; i < 3; i += 1) {
      if (this.queuedMoves[i]) {
        this.queuedMoves[i] = false;
        if (!locked) this.tryMove(i);
      }
    }
    if (this.meleeQueued) {
      this.meleeQueued = false;
      if (!locked) this.tryMelee();
    }
    if (this.fireHeld && !locked) this.tryFire();
    if (this.interactQueued) {
      this.interactQueued = false;
      this.tryInteract();
    }

    this.updateClones(dt);
    this.updateHosts(dt, time);
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
   * Point the raid at an arena definition. The world geometry is still the
   * city block for every arena; what changes is the fixed points: where the
   * Ryder drops in and where the single Ryder Beacon stands. Any Beacon from a
   * previous arena is torn down first so there is never more than one.
   */
  loadArena(id: ArenaId) {
    const def = arenaSpec(id) ?? arenaSpec(DEFAULT_ARENA)!;
    this.arena = def;
    this.unloadBeacon();
    const point = def.ryderBeaconPoint;
    const position = new THREE.Vector3(point.x, this.world.heightAt(point.x, point.z), point.z);
    this.beacon = new RyderBeacon(position, this.particles, { cooldownDuration: def.beaconCooldown });
    this.scene.add(this.beacon.group);
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
    if (!beacon || !beacon.isPlayerInRange(this.pos)) return;
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
    } else {
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
    if (this.isActive('lift')) this.liftHosts(0.4);
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
    if (this.recoveryT > 0 || locked) {
      x = 0;
      z = 0;
    }
    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    this.sprinting = this.keys.has('shift') && len > 0.1 && !this.fireHeld && this.meleeT <= 0;
    const speed =
      this.spec.speed *
      (this.sprinting ? SPRINT_MULTIPLIER : 1) *
      (this.burnout ? 0.82 : 1);

    _fwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    _right.set(-_fwd.z, 0, _fwd.x);
    _tmp.copy(_fwd).multiplyScalar(-z).add(_right.multiplyScalar(x));
    if (_tmp.lengthSq() > 0) _tmp.normalize();
    this.pos.addScaledVector(_tmp, speed * dt);
    this.pos.x = clamp(this.pos.x, -BOUNDARY, BOUNDARY);
    this.pos.z = clamp(this.pos.z, -BOUNDARY, BOUNDARY);
    resolveCircle(this.pos, PLAYER_RADIUS, this.world.obstacles);

    // Hosts shoulder the Ryder aside, except while a kit sequence is carrying
    // her through them (dashes decide their own contact).
    if (!phased && !locked) {
      for (const host of this.hosts) {
        const dx = this.pos.x - host.pos.x;
        const dz = this.pos.z - host.pos.z;
        const min = PLAYER_RADIUS + host.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) * (host.mass / (host.mass + 1));
        this.pos.x += (dx / d) * push * 0.35;
        this.pos.z += (dz / d) * push * 0.35;
      }
      resolveCircle(this.pos, PLAYER_RADIUS, this.world.obstacles);
    }

    // Horizontal speed for the kit's speed effects (measured, not commanded,
    // so dashes count too).
    this.playerSpeed = dt > 0 ? Math.hypot(this.pos.x - this.lastPos.x, this.pos.z - this.lastPos.z) / dt : 0;
    this.lastPos.copy(this.pos);

    this.player.humanoid.group.position.copy(this.pos);
    this.player.humanoid.group.position.y = this.world.heightAt(this.pos.x, this.pos.z) + (this.kit?.airY ?? 0);
    this.player.humanoid.group.rotation.y = this.yaw;
    const moving = Math.min(1, len);
    this.anim += dt * (8 + moving * (this.sprinting ? 9 : 6));
    if (this.player.meshSource === 'gltf') {
      animateGltfFighter(this.player, dt, this.anim, moving, this.sprinting, this.meleeT, this.meleeStarted, {
        pose: this.kit?.pose ?? null,
        style: this.meleeStarted ? this.strikeOverride ?? undefined : undefined,
      });
      this.meleeStarted = false;
      this.strikeOverride = null;
    } else {
      animateHumanoid(this.player.humanoid, this.anim, moving, time);
      if (this.meleeT > 0) poseMelee(this.player.humanoid, 1 - this.meleeT);
      else poseAim(this.player.humanoid, this.pitch);
    }

    if (this.shield) {
      this.shield.visible = this.isActive('forcefield');
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

  private tryFire() {
    if (!this.player || this.burnout || this.fireCd > 0) return;
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
    const dmg = this.meleeDamage();
    _fwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.particles.emit(this.muzzle(), this.burnout ? 0x8899aa : this.spec.color, 12, {
      speed: 7,
      size: 0.3,
      life: 0.28,
      direction: _fwd,
      up: 0.2,
    });
    for (const host of this.hosts) {
      const dx = host.pos.x - this.pos.x;
      const dz = host.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > MELEE_RANGE + host.radius) continue;
      const ang = Math.atan2(dx, dz);
      let diff = ang - this.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > MELEE_ARC) continue;
      this.hurtHost(host, dmg, _fwd);
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
      const dmg = this.meleeDamage() * step.damageMul;
      const hits = targetsInArc(this.hosts, this.pos, this.yaw, step.range, step.halfArc, [] as Host[]);
      if (!hits.length) {
        this.emitSound(`${step.sound}.whiff`);
        return;
      }
      for (const host of hits) {
        _tmp.set(host.pos.x - this.pos.x, 0, host.pos.z - this.pos.z);
        if (_tmp.lengthSq() < 0.0001) _tmp.copy(_fwd);
        _tmp.normalize();
        this.hurtHost(host, dmg, _tmp, step.reaction, step.strength);
        this.particles.emit(host.pos.clone().setY(1.1), 0xffffff, 4, { speed: 3, size: 0.3, life: 0.16 });
      }
      if (step.shake > 0) this.rig.addShake(step.shake);
      if (step.hitStop > 0) this.hitStop(step.hitStop);
      this.powerVfx.boost(0.9 + step.damageMul * 0.6);
      this.emitSound(step.sound);
    });
  }

  private hitStop(seconds: number) {
    this.hitStopT = Math.max(this.hitStopT, seconds);
  }

  private emitSound(id: string) {
    this.onSound?.(id);
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
    this.scheduler.clear();
    this.hitStopT = 0;
    if (this.player) {
      setHumanoidOpacity(this.player.humanoid, 1);
      if (this.playerGlow > 0) flashEmissive(this.player.humanoid, 0x000000, 0);
    }
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
      radius: PLAYER_RADIUS,
      yaw: () => this.yaw,
      time: () => this.simTime,
      fighter: () => this.player,
      targets: () => this.hosts,
      hurt: (target, damage, dir, reaction, strength) => this.hurtHost(target as Host, damage, dir, reaction, strength),
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
        resolveCircle(pos, PLAYER_RADIUS, this.world.obstacles);
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
    };
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
      this.moveT[slot] = 1;
      this.abilityT = ABILITY_LINGER;
      this.rig.addKick(0.3);
      // The toggle stays engine-owned (drain, HUD, switch-off); a kit that
      // claims the power dresses it and plays its effects while it is on.
      const kitOwned = this.kit?.tryAbility(move.id) ?? false;
      if (!kitOwned && move.id === 'duplicate') this.spawnClones([-1, 1]);
      if (!kitOwned && move.id === 'decoy') this.spawnClones([0]);
      if (!kitOwned && move.id === 'lift') this.liftHosts(2.2);
      this.particles.emit(this.pos.clone().setY(1.1), this.spec.color, 22, {
        speed: 8,
        size: 0.3,
        life: 0.45,
        up: 1,
      });
      return;
    }

    if (this.aura < move.auraCost) return;
    this.spendAura(move.auraCost);
    this.abilityT = ABILITY_LINGER;
    this.combatT = COMBAT_LINGER;
    const id = move.id;
    // A Ryder kit that owns this power plays it out itself.
    if (this.kit?.tryAbility(id)) {
      this.abilityT = Math.max(this.abilityT, 0.9);
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
      if (clone.fireCd <= 0 && target && !this.burnout) {
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
    this.banner = banner;
    this.bannerT = 3.2;
  }

  private updateRound(dt: number) {
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

  private spawnHost(kind: EnemyKind, scale: ReturnType<typeof roundScaling>) {
    const spec = ENEMIES[kind];
    const alley = this.world.alleys[Math.floor(Math.random() * this.world.alleys.length)];
    const lateral = (Math.random() - 0.5) * 2.4;
    const pos = alley.position.clone();
    pos.x += alley.inward.z * lateral;
    pos.z += -alley.inward.x * lateral;
    const fighter = buildHost(kind);
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
      hitColor: 0xffffff,
    });
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

      let tx = this.pos.x;
      let tz = this.pos.z;
      if (phased) {
        tx = 0;
        tz = 0;
      }
      const dx = tx - host.pos.x;
      const dz = tz - host.pos.z;
      const dist = Math.hypot(dx, dz) || 0.0001;
      const dirx = dx / dist;
      const dirz = dz / dist;

      let want = host.speed;
      if (host.preferredRange > 0) {
        if (dist < host.preferredRange - 1.5) want = -host.speed * 0.6;
        else if (dist < host.preferredRange + 1.2) want = host.speed * 0.15;
      }

      host.pos.x += dirx * want * dt + host.knock.x * dt;
      host.pos.z += dirz * want * dt + host.knock.z * dt;
      host.pos.x = clamp(host.pos.x, -BOUNDARY, BOUNDARY);
      host.pos.z = clamp(host.pos.z, -BOUNDARY, BOUNDARY);
      resolveCircle(host.pos, host.radius, this.world.obstacles);

      host.fighter.humanoid.group.position.copy(host.pos);
      host.fighter.humanoid.group.position.y = this.world.heightAt(host.pos.x, host.pos.z) - host.sink;
      host.fighter.humanoid.group.rotation.y = Math.atan2(dirx, dirz);
      this.animateHost(host, dt, Math.min(1, host.speed / 5), time);
      if (host.hit > 0) flashEmissive(host.fighter.humanoid, host.hitColor, host.hit * 2.4);
      else flashEmissive(host.fighter.humanoid, 0x000000, 0);

      if (host.kind === 'broadcaster') {
        host.summon -= dt;
        if (host.summon <= 0 && this.hosts.length < MAX_ALIVE_HOSTS && this.phase === 'playing') {
          host.summon = 8;
          const scale = roundScaling(this.round);
          this.spawnHost('walker', scale);
          if (this.hosts.length < MAX_ALIVE_HOSTS) this.spawnHost('sprinter', scale);
        }
      }

      if (host.kind === 'thrower' && host.cooldown <= 0 && dist < 16 && dist > 4 && !phased) {
        host.cooldown = 1.8;
        _tmp.copy(this.pos).setY(1.2).sub(host.pos.clone().setY(1.2)).normalize();
        this.spawnBolt(host.pos.clone().setY(1.3), _tmp, host.damage, false, 0x5dff9a, 16);
      }

      if (!phased && dist < host.radius + PLAYER_RADIUS + 0.55 && host.cooldown <= 0) {
        host.cooldown = host.kind === 'heavy' || host.kind === 'broadcaster' ? 1.35 : 0.85;
        poseMelee(host.fighter.humanoid, 0.6);
        host.swing = true;
        if (shielded) {
          this.particles.emit(this.pos.clone().setY(1.2), 0x66e7ff, 10, { speed: 6, size: 0.22, life: 0.3 });
          host.knock.set(-dirx * 10, 0, -dirz * 10);
        } else {
          this.hurtPlayer(host.damage, _tmp.set(-dirx, 0, -dirz));
        }
      }
    }
  }

  /** Block figures swing their limbs; GLB hosts run the skeleton and fire a strike after a hit. */
  private animateHost(host: Host, dt: number, moving: number, time: number) {
    if (host.fighter.meshSource === 'gltf') {
      animateGltfFighter(host.fighter, dt, host.anim, moving, host.speed > 5, 0, host.swing);
      host.swing = false;
    } else {
      animateHumanoid(host.fighter.humanoid, host.anim, moving, time);
    }
  }

  private hurtPlayer(amount: number, dir: THREE.Vector3) {
    if (this.iframes > 0 || this.phase === 'dead' || this.kit?.intangible) return;
    this.hp = Math.max(0, this.hp - amount);
    this.iframes = 0.55;
    this.combatT = COMBAT_LINGER;
    this.rig.addShake(0.4);
    this.rig.addKick(0.22);
    this.pos.addScaledVector(dir, 0.35);
    this.particles.emit(this.pos.clone().setY(1.2), 0xff5570, 14, { speed: 6, size: 0.28, life: 0.4, up: 0.5 });
    if (this.hp <= 0) {
      this.hp = 0;
      this.phase = 'dead';
      this.kit?.interrupt();
      this.scheduler.clear();
      this.banner = { title: 'SIGNAL LOST', sub: 'THE BLOCK TOOK YOU' };
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
    this.points += host.points;
    this.aura = Math.min(this.maxAura, this.aura + KILL_AURA_SIPHON + this.upgrades.siphon * 4);
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
      setHumanoidOpacity(body.fighter.humanoid, Math.min(1, body.life * 2));
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
    if (this.abilityT > 0 || this.kit?.locked || this.moveT.some((t) => t > 0)) return 'ABILITY';
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
    this.cameraPivot.y += Math.max(0, this.kit?.airY ?? 0) * 0.6;
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
      nearShop: this.phase === 'intermission' && this.pos.length() < 6.2,
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
    });
  }

  private clearCombat() {
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
    this.recoveryT = 0;
    if (this.shield) {
      this.scene.remove(this.shield);
      this.shield.geometry.dispose();
      (this.shield.material as THREE.Material).dispose();
      this.shield = null;
    }
  }
}

