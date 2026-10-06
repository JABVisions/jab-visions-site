import * as THREE from 'three';
import {
  BOUNDARY,
  BURNOUT_RECOVERY,
  MELEE_ARC,
  MELEE_RANGE,
  PLAYER_RADIUS,
  type AbilitySpec,
  type RyderSpec,
} from '../config';
import { animateGltfFighter, type Fighter } from '../characters';
import {
  HitScheduler,
  applyReaction,
  stepReaction,
  targetsInArc,
  type HitReaction,
  type ReactiveBody,
} from '../combat';
import type { KitTarget, MeleeStep, RyderKit } from '../ryderz';
import { createRyderKit } from '../ryderz';
import { RyderPowerVFX } from '../power-vfx';
import type { ParticleSystem } from '../particles';
import type { ShockRingPool, CrackDecalPool } from '../combat';
import type { AfterimagePool } from '../speed-vfx';
import type { ThirdPersonCamera } from '../camera';
import { animateHumanoid, flashEmissive, setHumanoidOpacity } from '../toon';
import { ABILITY_BANDS } from './abilityBands';
import { aiProfileFor, tuningFor, type AiProfile, type AiTuning, type PvpDifficulty } from './aiProfile';
import type { PvpDamageKind } from './balance';
import { choosePvpAction, type AbilityRead, type PvpIntent } from './decide';

export interface DuelBody {
  fighter: Fighter;
  hp: number;
  maxHp: number;
  pos: THREE.Vector3;
  radius: number;
  speed: number;
  aura?: number;
  maxAura?: number;
  ryderId?: RyderSpec['id'];
  anim: number;
  swing: boolean;
  sink: number;
  hit: number;
  hitColor: number;
}

export interface PvpCpuHooks {
  scene: THREE.Scene;
  particles: ParticleSystem;
  rings: ShockRingPool;
  cracks: CrackDecalPool;
  afterimages: AfterimagePool;
  camera: ThirdPersonCamera;
  cameraObject: THREE.Camera;
  playerPos: THREE.Vector3;
  playerHp(): number;
  playerMaxHp(): number;
  setPlayerHp(value: number): void;
  playerAttacking(): boolean;
  playerVelocity(): THREE.Vector3;
  playerIntangible(): boolean;
  heightAt(x: number, z: number): number;
  resolve(pos: THREE.Vector3): void;
  blocked(x: number, z: number, radius: number): boolean;
  hurtPlayer(amount: number, dir: THREE.Vector3, kind: PvpDamageKind): void;
  time(): number;
}

interface PlayerBody extends ReactiveBody, KitTarget {
  pos: THREE.Vector3;
}

const _dir = new THREE.Vector3();

/**
 * One CPU Ryder. Decisions are scored, then the same kit the player would
 * use plays the power. Aura, cooldowns and a rhythm gap keep it from spamming.
 */
export class PvpCpu {
  abilitiesCast = 0;
  lastAction: PvpIntent = 'chase';
  aura = 100;
  maxAura = 100;
  burnout = false;
  facing = 0;
  iframes = 0;
  readonly profile: AiProfile;
  readonly tuning: AiTuning;

  private spec: RyderSpec | null = null;
  private kit: RyderKit | null = null;
  private power: RyderPowerVFX | null = null;
  private scheduler = new HitScheduler();
  private body: DuelBody | null = null;
  private foe: PlayerBody | null = null;
  private moveCd = [0, 0, 0];
  private moveOn = [false, false, false];
  private rhythm = [0, 0, 0];
  private meleeCd = 0;
  private decideAt = 0.4;
  private intent: PvpIntent = 'chase';
  private intentSlot: number | null = null;
  private aimX = 0;
  private aimZ = 0;
  private aimRefresh = 0;
  private disposed = false;

  constructor(
    private hooks: PvpCpuHooks,
    id: RyderSpec['id'],
    difficulty: PvpDifficulty = 'normal',
  ) {
    this.profile = aiProfileFor(id);
    this.tuning = tuningFor(difficulty);
  }

  get intangible() {
    return this.kit?.intangible ?? false;
  }

  grabsPlayer() {
    return (this.foe?.held ?? 0) > 0;
  }

  playerSink() {
    return this.foe?.sink ?? 0;
  }

  attach(body: DuelBody, spec: RyderSpec) {
    this.disposeKit();
    this.spec = spec;
    this.body = body;
    this.maxAura = spec.maxAura;
    this.aura = spec.maxAura;
    this.burnout = false;
    this.abilitiesCast = 0;
    this.moveCd = [0, 0, 0];
    this.moveOn = [false, false, false];
    this.rhythm = [0, 0, 0];
    this.meleeCd = 0;
    this.decideAt = 0.35 + Math.random() * 0.4;
    this.facing = Math.atan2(this.hooks.playerPos.x - body.pos.x, this.hooks.playerPos.z - body.pos.z);
    this.foe = this.makePlayerBody();
    this.power = new RyderPowerVFX(this.hooks.scene, this.hooks.particles);
    this.power.attach(body.fighter, spec.visual);
    this.kit = createRyderKit(spec.id);
    this.kit?.attach(this.makeContext());
  }

  dispose() {
    this.disposed = true;
    this.disposeKit();
  }

  update(dt: number, time: number) {
    const body = this.body;
    const spec = this.spec;
    const foe = this.foe;
    if (!body || !spec || !foe || this.disposed || body.hp <= 0) return;

    this.iframes = Math.max(0, this.iframes - dt);
    this.meleeCd = Math.max(0, this.meleeCd - dt);
    for (let i = 0; i < 3; i += 1) {
      this.moveCd[i] = Math.max(0, this.moveCd[i] - dt);
      this.rhythm[i] = Math.max(0, this.rhythm[i] - dt);
    }
    stepReaction(foe, dt);
    this.regen(dt, spec);
    this.aimRefresh -= dt;
    if (this.aimRefresh <= 0) {
      const wobble = (1 - this.tuning.prediction) * 1.6;
      this.aimX = (Math.random() * 2 - 1) * wobble;
      this.aimZ = (Math.random() * 2 - 1) * wobble;
      this.aimRefresh = 0.7 + Math.random() * 0.7;
    }

    if (!(this.kit?.locked ?? false) && time >= this.decideAt) this.decide(time);
    if (!(this.kit?.locked ?? false) && !(this.kit?.busy ?? false)) this.act(dt, spec);
    const moving = this.intent === 'chase' || this.intent === 'reposition' || this.intent === 'evade' || this.intent === 'retreat';
    this.kit?.update({
      dt,
      time,
      speed: moving ? spec.speed : 0,
      sprinting: this.intent === 'chase' && this.profile.aggression > 0.7,
      moving,
      aura: this.aura,
      maxAura: this.maxAura,
      burnout: this.burnout,
    });
    this.scheduler.update(time);
    this.power?.update(dt, time, this.aura, this.maxAura, !this.burnout, this.hooks.cameraObject);

    const group = body.fighter.humanoid.group;
    group.position.copy(body.pos);
    group.position.y = this.hooks.heightAt(body.pos.x, body.pos.z) + (this.kit?.airY ?? 0) - body.sink;
    group.rotation.y = this.facing + (this.kit?.bodyYaw ?? 0);
    const opacity = this.kit?.opacity ?? 1;
    setHumanoidOpacity(body.fighter.humanoid, opacity);
    const glow = this.kit?.glow ?? 0;
    if (glow > 0) flashEmissive(body.fighter.humanoid, spec.visual.auraColor, glow * 0.9);
    else if (body.hit <= 0) flashEmissive(body.fighter.humanoid, 0x000000, 0);
    body.anim += dt * 6;
    if (body.fighter.meshSource === 'gltf') {
      animateGltfFighter(body.fighter, dt, body.anim, moving ? 1 : 0, this.intent === 'chase', 0, body.swing);
      body.swing = false;
    } else {
      animateHumanoid(body.fighter.humanoid, body.anim, moving ? 1 : 0, time);
    }
    body.aura = this.aura;
    body.maxAura = this.maxAura;
  }

  private decide(time: number) {
    const body = this.body;
    const spec = this.spec;
    const foe = this.foe;
    if (!body || !spec || !foe) return;
    const dist = Math.hypot(foe.pos.x - body.pos.x, foe.pos.z - body.pos.z);
    const vel = this.hooks.playerVelocity();
    const awayX = body.pos.x - foe.pos.x;
    const awayZ = body.pos.z - foe.pos.z;
    const awayLen = Math.hypot(awayX, awayZ) || 1;
    const retreatDot = (vel.x * awayX + vel.z * awayZ) / awayLen;
    const slots: AbilityRead[] = spec.moves.map((move, index) => ({
      band: ABILITY_BANDS[move.id],
      affordable: move.drain > 0 ? this.aura > 2 : this.aura >= move.auraCost,
      cooling: this.rhythm[index] > 0 || this.moveCd[index] > 0,
      ultimate: index === 2,
      active: this.moveOn[index],
    }));
    const choice = choosePvpAction(
      {
        dist,
        selfHp: body.maxHp > 0 ? body.hp / body.maxHp : 1,
        foeHp: this.hooks.playerMaxHp() > 0 ? this.hooks.playerHp() / this.hooks.playerMaxHp() : 1,
        aura: this.maxAura > 0 ? this.aura / this.maxAura : 0,
        burnout: this.burnout,
        foeAttacking: this.hooks.playerAttacking(),
        foeRetreating: retreatDot > 1.2,
        foeClosing: retreatDot < -1.2,
        powerHunger: this.abilitiesCast === 0 && time > 1.2 ? 0.35 : 0,
        slots,
      },
      this.profile,
      this.tuning,
    );
    this.intent = choice.intent;
    this.intentSlot = choice.slot;
    this.lastAction = choice.intent;
    const wait = this.tuning.reactionMin + Math.random() * (this.tuning.reactionMax - this.tuning.reactionMin);
    this.decideAt = time + wait;
    if (choice.intent === 'ability' && choice.slot != null) {
      const before = this.abilitiesCast;
      this.cast(choice.slot);
      if (this.abilitiesCast === before) {
        this.intent = 'chase';
        this.lastAction = 'chase';
      }
    }
  }

  private act(dt: number, spec: RyderSpec) {
    const body = this.body;
    const foe = this.foe;
    if (!body || !foe) return;
    const dx = foe.pos.x - body.pos.x;
    const dz = foe.pos.z - body.pos.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    let mx = dx / dist;
    let mz = dz / dist;
    if (this.intent === 'retreat') {
      mx = -mx;
      mz = -mz;
    } else if (this.intent === 'evade' || this.intent === 'reposition') {
      const side = this.profile.evasiveness > 0.5 ? 1 : -1;
      const strafe = this.intent === 'evade' ? 1 : 0.65;
      mx = (-mz * side) * strafe + mx * (this.intent === 'reposition' ? 0.35 : 0.1);
      mz = (dx / dist) * side * strafe + mz * (this.intent === 'reposition' ? 0.35 : 0.1);
      if (this.intent === 'reposition') {
        const preferred = this.profile.preferredRange === 'close' ? 2.2 : this.profile.preferredRange === 'long' ? 9 : 6;
        if (dist > preferred + 1) {
          mx += dx / dist;
          mz += dz / dist;
        } else if (dist < preferred - 1.2) {
          mx -= dx / dist;
          mz -= dz / dist;
        }
      }
    } else if (this.intent === 'attack') {
      if (dist < MELEE_RANGE + foe.radius + 0.3) {
        this.swing(spec);
        mx *= 0.15;
        mz *= 0.15;
      }
    } else if (this.intent !== 'chase') {
      mx = 0;
      mz = 0;
    }

    const len = Math.hypot(mx, mz);
    if (len > 0.08 && this.intent !== 'ability') {
      const speed = spec.speed * (this.intent === 'chase' ? 0.96 : 0.82) * (this.burnout ? 0.82 : 1);
      body.pos.x += (mx / len) * speed * dt;
      body.pos.z += (mz / len) * speed * dt;
      this.facing = Math.atan2(mx, mz);
      this.place(body.pos);
    } else if (dist > 0.2) {
      this.facing = Math.atan2(dx, dz);
    }
  }

  private swing(spec: RyderSpec) {
    if (this.meleeCd > 0 || this.hooks.playerIntangible()) return;
    const step = this.kit?.melee(this.hooks.time()) ?? null;
    if (step) {
      this.meleeStep(step);
      return;
    }
    this.meleeCd = 1 / spec.meleeRate;
    this.body!.swing = true;
    this.strikePlayer(spec.meleeDamage, MELEE_RANGE, MELEE_ARC, 'basic');
  }

  private meleeStep(step: MeleeStep) {
    this.meleeCd = step.recovery;
    this.body!.swing = true;
    this.scheduler.schedule(this.hooks.time(), step.hitDelay, () => {
      if (!this.body || this.body.hp <= 0) return;
      _dir.set(Math.sin(this.facing), 0, Math.cos(this.facing));
      this.body.pos.addScaledVector(_dir, step.lunge * 0.65);
      this.place(this.body.pos);
      const dmg = (this.spec?.meleeDamage ?? 10) * step.damageMul;
      this.strikePlayer(dmg, step.range, step.halfArc, 'basic', step.reaction, step.strength);
    });
  }

  private strikePlayer(
    damage: number,
    range: number,
    halfArc: number,
    kind: PvpDamageKind,
    reaction?: HitReaction,
    strength = 1,
  ) {
    const body = this.body;
    const foe = this.foe;
    if (!body || !foe || this.hooks.playerIntangible()) return;
    const hits = targetsInArc([foe], body.pos, this.facing, range, halfArc, [] as PlayerBody[]);
    if (!hits.length) return;
    _dir.set(foe.pos.x - body.pos.x, 0, foe.pos.z - body.pos.z);
    if (_dir.lengthSq() < 1e-4) _dir.set(Math.sin(this.facing), 0, Math.cos(this.facing));
    _dir.normalize();
    if (reaction) applyReaction(foe, reaction, _dir, strength);
    this.hooks.hurtPlayer(damage, _dir, kind);
  }

  private cast(slot: number) {
    const spec = this.spec;
    const move = spec?.moves[slot];
    if (!spec || !move || this.burnout) return;
    if (this.moveCd[slot] > 0 || this.rhythm[slot] > 0) return;
    if (move.drain > 0) {
      if (this.moveOn[slot]) {
        this.endSlot(slot, move);
        return;
      }
      if (this.aura < 2) return;
      this.moveOn[slot] = true;
      this.moveCd[slot] = 0.2;
      this.kit?.tryAbility(move.id);
      this.noteCast(slot);
      return;
    }
    if (this.aura < move.auraCost) return;
    this.aura = Math.max(0, this.aura - move.auraCost);
    if (this.aura <= 0.01) this.burnout = true;
    const owned = this.kit?.tryAbility(move.id) ?? false;
    this.moveCd[slot] = 0.2;
    this.noteCast(slot);
    if (!owned) this.aura = Math.min(this.maxAura, this.aura + move.auraCost);
  }

  private noteCast(slot: number) {
    const gap = (1.7 + slot * 0.85) * (1.2 - this.profile.abilityFrequency * 0.45);
    this.rhythm[slot] = Math.max(0.8, gap);
    this.abilitiesCast += 1;
    this.intent = 'ability';
  }

  private endSlot(slot: number, move: AbilitySpec) {
    this.moveOn[slot] = false;
    this.kit?.endAbility?.(move.id);
    this.rhythm[slot] = 1.1;
  }

  private regen(dt: number, spec: RyderSpec) {
    let drain = 0;
    for (let i = 0; i < 3; i += 1) if (this.moveOn[i]) drain += spec.moves[i].drain;
    if (drain > 0) {
      this.aura = Math.max(0, this.aura - drain * dt);
      if (this.aura <= 0.5) {
        this.burnout = true;
        for (let i = 0; i < 3; i += 1) if (this.moveOn[i]) this.endSlot(i, spec.moves[i]);
      }
      return;
    }
    const rate = this.burnout ? spec.auraRegen * 0.5 : spec.auraRegen;
    this.aura = Math.min(this.maxAura, this.aura + rate * dt);
    if (this.burnout && this.aura >= this.maxAura * BURNOUT_RECOVERY) this.burnout = false;
  }

  private place(pos: THREE.Vector3) {
    pos.x = Math.max(-BOUNDARY, Math.min(BOUNDARY, pos.x));
    pos.z = Math.max(-BOUNDARY, Math.min(BOUNDARY, pos.z));
    this.hooks.resolve(pos);
  }

  private makePlayerBody(): PlayerBody {
    const hooks = this.hooks;
    const body: PlayerBody = {
      pos: hooks.playerPos,
      radius: PLAYER_RADIUS,
      mass: 1,
      knock: new THREE.Vector3(),
      stun: 0,
      stagger: 0,
      airY: 0,
      airVel: 0,
      lean: 0,
      spin: 0,
      held: 0,
      sink: 0,
      hp: hooks.playerHp(),
      maxHp: hooks.playerMaxHp(),
      hit: 0,
      hitColor: 0xffffff,
    };
    Object.defineProperty(body, 'hp', {
      get: () => hooks.playerHp(),
      set: (value: number) => hooks.setPlayerHp(value),
    });
    Object.defineProperty(body, 'maxHp', { get: () => hooks.playerMaxHp() });
    return body;
  }

  private makeContext() {
    const cpu = this;
    const hooks = this.hooks;
    const softCam = {
      addKick: (value: number) => hooks.camera.addKick(value * 0.28),
      addShake: (value: number) => hooks.camera.addShake(value * 0.32),
      addFovPunch: (value: number) => hooks.camera.addFovPunch(value * 0.22),
    } as ThirdPersonCamera;
    return {
      pos: cpu.body!.pos,
      get spec() {
        return cpu.spec!;
      },
      particles: hooks.particles,
      camera: softCam,
      cameraObject: hooks.cameraObject,
      power: cpu.power!,
      rings: hooks.rings,
      cracks: hooks.cracks,
      afterimages: hooks.afterimages,
      scene: hooks.scene,
      radius: PLAYER_RADIUS,
      yaw: () => cpu.facing,
      time: () => hooks.time(),
      fighter: () => cpu.body?.fighter ?? null,
      targets: () => (cpu.foe ? [cpu.foe] : []),
      hurt: (target: KitTarget, damage: number, dir: THREE.Vector3, reaction?: HitReaction, strength = 1) => {
        if (target !== cpu.foe || cpu.hooks.playerIntangible()) return;
        const kind: PvpDamageKind = cpu.intentSlot === 2 ? 'ultimate' : 'ability';
        if (reaction) applyReaction(cpu.foe, reaction, dir, strength ?? 1);
        hooks.hurtPlayer(damage, dir, kind);
      },
      flash: (target: KitTarget, color: number, seconds: number) => {
        if (target === cpu.foe) {
          cpu.foe.hit = Math.max(cpu.foe.hit, seconds);
          cpu.foe.hitColor = color;
        }
      },
      meleeDamage: () => (cpu.burnout ? (cpu.spec?.meleeDamage ?? 10) * 0.45 : cpu.spec?.meleeDamage ?? 10),
      heightAt: (x: number, z: number) => hooks.heightAt(x, z),
      resolve: (pos: THREE.Vector3) => cpu.place(pos),
      blocked: (x: number, z: number, radius: number) => hooks.blocked(x, z, radius),
      lookDir: (out: THREE.Vector3) => {
        const foe = cpu.foe;
        const from = cpu.body?.pos;
        if (!foe || !from) return out.set(0, 0, 1);
        out.set(foe.pos.x - from.x + cpu.aimX, -0.15, foe.pos.z - from.z + cpu.aimZ);
        if (out.lengthSq() < 1e-4) out.set(Math.sin(cpu.facing), -0.1, Math.cos(cpu.facing));
        return out.normalize();
      },
      hitStop: (seconds: number) => hooks.camera.addShake(seconds * 0.4),
      iframes: (seconds: number) => {
        cpu.iframes = Math.max(cpu.iframes, seconds);
      },
      strike: () => {
        if (cpu.body) cpu.body.swing = true;
      },
      schedule: (delay: number, fn: () => void) => cpu.scheduler.schedule(hooks.time(), delay, fn),
      sound: () => undefined,
      turn: (yaw: number) => {
        cpu.facing = yaw;
      },
      gainAura: (amount: number) => {
        cpu.aura = Math.min(cpu.maxAura, cpu.aura + Math.max(0, amount));
        if (cpu.burnout && cpu.aura >= cpu.maxAura * BURNOUT_RECOVERY) cpu.burnout = false;
      },
    };
  }

  private disposeKit() {
    this.kit?.interrupt();
    this.kit?.detach();
    this.kit = null;
    this.scheduler.clear();
    this.power?.release(this.hooks.scene);
    this.power = null;
    this.body = null;
  }
}
