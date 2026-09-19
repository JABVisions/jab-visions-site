import * as THREE from 'three';
import {
  BOUNDARY,
  BURNOUT_RECOVERY,
  ENEMIES,
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
  type EnemyKind,
  type RyderId,
  type RyderSpec,
  type UpgradeId,
} from './config';
import { BOLT_GEOMETRY, buildHost, buildRyder, type Fighter } from './characters';
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
const _ray = new THREE.Raycaster();

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
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
  private player: Fighter | null = null;
  private shield: THREE.Mesh | null = null;
  private pos = new THREE.Vector3(9, 0, 11);
  private yaw = Math.PI * 0.2;
  private pitch = 0.28;
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
  private camDist = 7.2;

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

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 280);
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

    this.particles = new ParticleSystem();
    this.scene.add(this.particles.points);

    this.resize();
    this.bind();
    this.clock.start();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  start(id: RyderId) {
    this.clearCombat();
    this.spec = RYDERZ[id];
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
    this.pos.set(9, 0, 11);
    this.yaw = Math.PI * 0.85;
    this.pitch = 0.28;
    this.paused = false;
    this.phase = 'playing';

    this.player = buildRyder(this.spec);
    this.scene.add(this.player.humanoid.group);

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

  requestPointerLock() {
    this.canvas.requestPointerLock();
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
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('pointerlockchange', this.onPointerLock);
    window.addEventListener('resize', this.onResize);
    this.canvas.addEventListener('contextmenu', this.prevent);
  }

  private unbind() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
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
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    this.keys.add(e.key.toLowerCase());
    if (e.key === 'q' || e.key === 'Q' || e.key === '1') this.queuedMoves[0] = true;
    if (e.key === 'e' || e.key === 'E' || e.key === '2') this.queuedMoves[1] = true;
    if (e.key === 'r' || e.key === 'R' || e.key === '3') this.queuedMoves[2] = true;
    if (e.key === 'f' || e.key === 'F' || e.code === 'Space') {
      e.preventDefault();
      this.meleeQueued = true;
    }
    if (e.key === 'Escape') this.setPaused(true);
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
    const dt = Math.min(0.05, this.clock.getDelta());
    const time = this.clock.elapsedTime;
    if (!this.paused && this.player && this.phase !== 'dead') this.update(dt, time);
    else if (this.player) this.updateCamera();
    this.world.animate(time);
    this.particles.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.emitHud();
  }

  private update(dt: number, time: number) {
    this.yaw -= this.lookAcc.x * 0.0024;
    this.pitch = clamp(this.pitch - this.lookAcc.y * 0.0018, -0.12, 0.82);
    this.lookAcc.x = 0;
    this.lookAcc.y = 0;

    this.fireCd = Math.max(0, this.fireCd - dt);
    this.meleeCd = Math.max(0, this.meleeCd - dt);
    this.iframes = Math.max(0, this.iframes - dt);
    if (this.meleeT > 0) this.meleeT = Math.max(0, this.meleeT - dt * 3.4);
    for (let i = 0; i < 3; i += 1) {
      this.moveCd[i] = Math.max(0, this.moveCd[i] - dt);
      if (this.moveT[i] > 0) {
        this.moveT[i] = Math.max(0, this.moveT[i] - dt);
        if (this.moveT[i] <= 0) this.endMove(i);
      }
    }
    if (this.bannerT > 0) {
      this.bannerT = Math.max(0, this.bannerT - dt);
      if (this.bannerT <= 0) this.banner = null;
    }

    this.updateAura(dt);
    this.updatePlayerMove(dt, time);
    for (let i = 0; i < 3; i += 1) {
      if (this.queuedMoves[i]) {
        this.queuedMoves[i] = false;
        this.tryMove(i);
      }
    }
    if (this.meleeQueued) {
      this.meleeQueued = false;
      this.tryMelee();
    }
    if (this.fireHeld) this.tryFire();

    this.updateClones(dt);
    this.updateHosts(dt, time);
    this.updateBolts(dt);
    this.updateRound(dt);
    this.updateCamera();
  }

  private updateAura(dt: number) {
    const regen =
      this.spec.auraRegen +
      this.upgrades.capacity * 1.2 +
      (this.phase === 'intermission' ? 6 : 0);
    const using = this.fireHeld || this.moveT.some((t) => t > 0);
    const rate = this.burnout ? regen * 0.42 : using ? regen * 0.18 : regen;
    this.aura = Math.min(this.maxAura, this.aura + rate * dt);
    if (this.burnout && this.aura >= this.maxAura * BURNOUT_RECOVERY) {
      this.burnout = false;
    }
    this.syncWeaponGlow();
  }

  private spendAura(amount: number) {
    this.aura = Math.max(0, this.aura - amount);
    if (this.aura <= 0.01) {
      this.aura = 0;
      this.burnout = true;
      this.particles.emit(this.muzzle(), 0x8899aa, 18, { speed: 4, size: 0.28, life: 0.45, up: 0.4 });
    }
  }

  private syncWeaponGlow() {
    if (!this.player) return;
    const on = !this.burnout;
    this.player.glowMeshes.forEach((mesh) => {
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.color.setHex(this.spec.color);
      mat.color.multiplyScalar(on ? 1.8 : 0.18);
    });
  }

  private updatePlayerMove(dt: number, time: number) {
    if (!this.player) return;
    const overdrive = this.isActive('overdrive');
    const phased = this.isActive('phase');
    const speed = this.spec.speed * (overdrive ? 1.85 : 1) * (this.burnout ? 0.82 : 1);

    let x = this.moveAxis.x;
    let z = this.moveAxis.z;
    if (this.keys.has('w') || this.keys.has('arrowup')) z -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) z += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;
    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }

    _fwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    _right.set(_fwd.z, 0, -_fwd.x);
    _tmp.copy(_fwd).multiplyScalar(-z).add(_right.multiplyScalar(x));
    if (_tmp.lengthSq() > 0) _tmp.normalize();
    this.pos.addScaledVector(_tmp, speed * dt);
    this.pos.x = clamp(this.pos.x, -BOUNDARY, BOUNDARY);
    this.pos.z = clamp(this.pos.z, -BOUNDARY, BOUNDARY);
    resolveCircle(this.pos, PLAYER_RADIUS, this.world.obstacles);

    if (!phased) {
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
        if (overdrive && host.cooldown <= 0) {
          this.hurtHost(host, 16, _tmp);
          host.cooldown = 0.35;
        }
      }
      resolveCircle(this.pos, PLAYER_RADIUS, this.world.obstacles);
    }

    this.player.humanoid.group.position.copy(this.pos);
    this.player.humanoid.group.rotation.y = this.yaw;
    const moving = Math.min(1, len);
    this.anim += dt * (8 + moving * 6);
    animateHumanoid(this.player.humanoid, this.anim, moving, time);
    if (this.meleeT > 0) poseMelee(this.player.humanoid, 1 - this.meleeT);
    else poseAim(this.player.humanoid, this.pitch);

    if (this.shield) {
      this.shield.visible = this.isActive('forcefield');
      this.shield.position.copy(this.pos).setY(1.1);
      this.shield.rotation.y = time * 1.4;
      const pulse = 1 + Math.sin(time * 8) * 0.04;
      this.shield.scale.setScalar(pulse);
    }

    setHumanoidOpacity(this.player.humanoid, phased ? 0.28 : 1);
    if (phased) {
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
    const overdrive = this.isActive('overdrive');
    const rate = this.spec.fireRate * (overdrive ? 1.85 : 1);
    this.fireCd = 1 / rate;
    this.spendAura(volleyCost);
    this.lookDir(_look);
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
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
    const rate = this.spec.meleeRate * (this.burnout ? 0.75 : 1);
    this.meleeCd = 1 / rate;
    this.meleeT = 1;
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

  private isActive(id: AbilityId) {
    return this.spec.moves.some((move, i) => move.id === id && this.moveT[i] > 0);
  }

  private tryMove(slot: number) {
    if (!this.player || this.burnout) return;
    const move = this.spec.moves[slot];
    if (!move || this.moveCd[slot] > 0) return;
    if (move.duration > 0 && this.moveT[slot] > 0) return;
    if (this.aura < move.auraCost) return;
    this.spendAura(move.auraCost);
    this.moveCd[slot] = move.cooldown;
    this.moveT[slot] = move.duration;
    const id = move.id;
    if (id === 'bladeFan') this.fireSpread(5, 0.22, 1.2);
    if (id === 'duplicate') this.spawnClones([-1, 1]);
    if (id === 'envyPulse') this.pulse(6.6, 24, -8);
    if (id === 'shockwave') this.pulse(6.2, 20, 11);
    if (id === 'prideDash') this.prideDash();
    if (id === 'cleave') this.cleave();
    if (id === 'blink') {
      this.moveT[slot] = 0;
      this.blink();
    }
    if (id === 'greedSiphon') this.greedSiphon();
    if (id === 'lift') this.liftHosts();
    if (id === 'heartbreak') this.pulse(8.8, 38, 6);
    if (id === 'decoy') this.spawnClones([0]);
    if (id === 'dartStorm') this.fireSpread(10, 0.32, 0.85);
    this.particles.emit(this.pos.clone().setY(1.1), this.spec.color, 28, {
      speed: 9,
      size: 0.32,
      life: 0.5,
      up: 1,
    });
  }

  private endMove(slot: number) {
    const id = this.spec.moves[slot]?.id;
    this.moveT[slot] = 0;
    if (id === 'duplicate' || id === 'decoy') this.clearClones();
    if (id === 'phase' && this.player) setHumanoidOpacity(this.player.humanoid, 1);
  }

  private endAllMoves() {
    for (let i = 0; i < 3; i += 1) this.endMove(i);
  }

  private fireSpread(count: number, spread: number, damageMul: number) {
    this.lookDir(_look);
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
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

  private liftHosts() {
    for (const host of this.hosts) {
      const dist = Math.hypot(host.pos.x - this.pos.x, host.pos.z - this.pos.z);
      if (dist < 7.2 + host.radius) host.stun = Math.max(host.stun, 2.6);
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
    _right.set(_fwd.z, 0, -_fwd.x);
    for (const clone of this.clones) {
      _tmp.copy(this.pos).addScaledVector(_right, clone.side * 1.65).addScaledVector(_fwd, -0.4);
      clone.fighter.humanoid.group.position.lerp(_tmp.setY(0), 0.25);
      clone.fighter.humanoid.group.position.y = 0;
      const target = this.nearestHost(clone.fighter.humanoid.group.position);
      if (target) {
        const dx = target.pos.x - clone.fighter.humanoid.group.position.x;
        const dz = target.pos.z - clone.fighter.humanoid.group.position.z;
        clone.fighter.humanoid.group.rotation.y = Math.atan2(dx, dz);
      } else {
        clone.fighter.humanoid.group.rotation.y = this.yaw;
      }
      animateHumanoid(clone.fighter.humanoid, this.anim + clone.side, 0.6, this.clock.elapsedTime);
      poseAim(clone.fighter.humanoid, 0.1);
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
    });
  }

  private updateHosts(dt: number, time: number) {
    const phased = this.isActive('phase');
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

      if (host.stun > 0) {
        host.fighter.humanoid.group.position.copy(host.pos);
        host.fighter.humanoid.group.position.y = Math.min(1.5, host.stun * 0.7);
        animateHumanoid(host.fighter.humanoid, host.anim, 0.12, time);
        if (host.hit > 0) flashEmissive(host.fighter.humanoid, 0xffffff, host.hit * 2.4);
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
      host.fighter.humanoid.group.rotation.y = Math.atan2(dirx, dirz);
      animateHumanoid(host.fighter.humanoid, host.anim, Math.min(1, host.speed / 5), time);
      if (host.hit > 0) flashEmissive(host.fighter.humanoid, 0xffffff, host.hit * 2.4);
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
        if (shielded) {
          this.particles.emit(this.pos.clone().setY(1.2), 0x66e7ff, 10, { speed: 6, size: 0.22, life: 0.3 });
          host.knock.set(-dirx * 10, 0, -dirz * 10);
        } else {
          this.hurtPlayer(host.damage, _tmp.set(-dirx, 0, -dirz));
        }
      }
    }
  }

  private hurtPlayer(amount: number, dir: THREE.Vector3) {
    if (this.iframes > 0 || this.phase === 'dead') return;
    this.hp = Math.max(0, this.hp - amount);
    this.iframes = 0.55;
    this.pos.addScaledVector(dir, 0.35);
    this.particles.emit(this.pos.clone().setY(1.2), 0xff5570, 14, { speed: 6, size: 0.28, life: 0.4, up: 0.5 });
    if (this.hp <= 0) {
      this.hp = 0;
      this.phase = 'dead';
      this.banner = { title: 'SIGNAL LOST', sub: 'THE BLOCK TOOK YOU' };
      this.bannerT = 8;
      document.exitPointerLock();
    }
  }

  private hurtHost(host: Host, amount: number, dir: THREE.Vector3) {
    host.hp -= amount;
    host.hit = 0.18;
    host.knock.copy(dir).setY(0).multiplyScalar(8 / host.mass);
    this.particles.emit(host.pos.clone().setY(1.1), this.spec.color, 8, {
      speed: 7,
      size: 0.22,
      life: 0.28,
      direction: dir,
    });
    if (host.hp <= 0) this.killHost(host);
  }

  private killHost(host: Host) {
    this.points += host.points;
    this.aura = Math.min(this.maxAura, this.aura + KILL_AURA_SIPHON + this.upgrades.siphon * 4);
    this.burst(host.pos.clone().setY(1), host.kind === 'broadcaster' ? 0xb84dff : 0x7dff9a, host.kind === 'broadcaster' ? 40 : 16);
    this.scene.remove(host.fighter.humanoid.group);
    disposeObject(host.fighter.humanoid.group);
    this.hosts = this.hosts.filter((h) => h !== host);
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

  private lookDir(out: THREE.Vector3) {
    out.set(
      Math.sin(this.yaw) * Math.cos(this.pitch * 0.6),
      -this.pitch * 0.85,
      Math.cos(this.yaw) * Math.cos(this.pitch * 0.6),
    );
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

  private updateCamera() {
    const dist = this.camDist;
    _tmp.set(
      this.pos.x - Math.sin(this.yaw) * Math.cos(this.pitch) * dist,
      1.55 + Math.sin(this.pitch) * dist * 0.9 + 1.1,
      this.pos.z - Math.cos(this.yaw) * Math.cos(this.pitch) * dist,
    );
    const target = _tmp2.copy(this.pos).setY(1.45);
    _ray.set(target, _tmp.clone().sub(target).normalize());
    const hits = _ray.intersectObjects(this.world.occluders, false);
    const desired = target.distanceTo(_tmp);
    if (hits.length && hits[0].distance < desired - 0.4) {
      _tmp.copy(hits[0].point).add(_ray.ray.direction.clone().multiplyScalar(-0.45));
    }
    if (_tmp.y < 0.6) _tmp.y = 0.6;
    this.camera.position.lerp(_tmp, 0.22);
    this.camera.lookAt(target.x, target.y + 0.2, target.z);
  }

  private emitHud() {
    this.onHud({
      hp: this.hp,
      maxHp: this.maxHp,
      aura: this.aura,
      maxAura: this.maxAura,
      burnout: this.burnout,
      moves: this.spec.moves.map((move, i) => ({
        key: MOVE_KEYS[i],
        name: move.name,
        ready: !this.burnout && this.moveCd[i] <= 0 && this.aura >= move.auraCost,
        cooldown: this.moveCd[i],
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
    });
  }

  private clearCombat() {
    this.hosts.forEach((h) => {
      this.scene.remove(h.fighter.humanoid.group);
      disposeObject(h.fighter.humanoid.group);
    });
    this.hosts = [];
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
    if (this.shield) {
      this.scene.remove(this.shield);
      this.shield.geometry.dispose();
      (this.shield.material as THREE.Material).dispose();
      this.shield = null;
    }
  }
}

