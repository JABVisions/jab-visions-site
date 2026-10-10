import type * as THREE from 'three';
import type { AbilityId, RyderSpec } from '../config';
import type { Fighter } from '../characters';
import type { ThirdPersonCamera } from '../camera';
import type { ParticleSystem } from '../particles';
import type { RyderPowerVFX } from '../power-vfx';
import type { CrackDecalPool, HitReaction, ReactiveBody, ShockRingPool } from '../combat';
import type { AfterimagePool } from '../speed-vfx';
import type { MeleeStyle, PoseOverride } from '../skeletal';

/**
 * A Ryder combat kit owns one Ryder's physical moves: how her abilities play
 * out over time, what her melee combo is, and how she dresses her own speed.
 * The engine keeps ownership of inputs, aura costs, cooldowns, the Power Deck,
 * switching, rounds and enemies; a kit only drives the player body and asks
 * the engine to hurt things through the context it is handed.
 */

/** The slice of an enemy a kit may read and react. The engine's `Host` satisfies it. */
export interface KitTarget extends ReactiveBody {
  hp: number;
  maxHp: number;
  /** Seconds of hit flash left and the colour it flashes. */
  hit: number;
  hitColor: number;
}

export interface KitContext {
  /** Player position; kits move it directly during dashes (the engine resolves collisions after). */
  readonly pos: THREE.Vector3;
  readonly spec: RyderSpec;
  readonly particles: ParticleSystem;
  readonly camera: ThirdPersonCamera;
  readonly cameraObject: THREE.Camera;
  readonly power: RyderPowerVFX;
  readonly rings: ShockRingPool;
  readonly cracks: CrackDecalPool;
  readonly afterimages: AfterimagePool;
  readonly scene: THREE.Scene;
  /** Player collision radius in metres. */
  readonly radius: number;
  yaw(): number;
  time(): number;
  fighter(): Fighter | null;
  targets(): readonly KitTarget[];
  /**
   * Hurt a target: damage, hit direction, how it should react.
   * Kits that can hit other Ryderz should gate this with `canDamage`
   * (`lib/ryderz-raid/combat`) so Raid allies are not friendly-fired.
   */
  /** Returns the health actually removed. */
  hurt(target: KitTarget, damage: number, dir: THREE.Vector3, reaction?: HitReaction, strength?: number): number;
  /** Flash a target a colour for `seconds` without hurting it. */
  flash(target: KitTarget, color: number, seconds: number): void;
  /** Base melee damage after upgrades / burnout. */
  meleeDamage(): number;
  heightAt(x: number, z: number): number;
  /** Clamp to the arena and push out of obstacles. */
  resolve(pos: THREE.Vector3): void;
  blocked(x: number, z: number, radius: number): boolean;
  /** Direction from the muzzle to whatever the crosshair is over. */
  lookDir(out: THREE.Vector3): THREE.Vector3;
  /** Freeze gameplay for a beat (seconds); impacts read heavier. */
  hitStop(seconds: number): void;
  /** Grant invulnerability for at least this long. */
  iframes(seconds: number): void;
  /** Play a strike animation from the kit (no damage; the kit schedules that). */
  strike(style: MeleeStyle): void;
  /** Run `fn` after `delay` seconds; cleared if the kit is interrupted. */
  schedule(delay: number, fn: () => void): void;
  /** Audio hook: ids like `leo.crack.impact`. The engine forwards to whoever is listening. */
  sound(id: string): void;
  /** Turn the Ryder (and the camera behind her) to face `yaw`; `cut` places the camera there at once. */
  turn(yaw: number, cut?: boolean): void;
  /** Give aura back (siphons, greed). Clamped to the maximum. */
  gainAura(amount: number): void;
  /** Spend aura. Returns what remains. Empty aura burns out. */
  spendAura(amount: number): number;
  /**
   * Restore health. Returns the amount actually gained, which is 0 once the
   * Ryder is already at maximum.
   */
  heal(amount: number): number;
  /** Hold an ability off the input for `seconds`. */
  cooldown(id: AbilityId, seconds: number): void;
  /** Current health. Rewind reads this so it can restore a capped loss. */
  vitals?(): { hp: number; maxHp: number };
  /**
   * Hold a target still for `seconds`. `0` releases it. The engine counts the
   * hold down, so a dropped connection cannot leave anyone frozen.
   */
  hold?(target: KitTarget, seconds: number): void;
  /** True in a Ryder-versus-Ryder match. Durations and slows use the shorter PvP tuning. */
  pvp?(): boolean;
  /** Slow the local player. The factor is a fraction of their normal speed, never zero. */
  suppress?(factor: number): void;
  /** False for allies, defeated bodies, and anyone this mode must not hit. */
  canHit?(target: KitTarget): boolean;
}

/** A ground area enemies should leave. `drain` is a standing puddle; `stomp` is an incoming foot. */
export interface HazardZone {
  x: number;
  z: number;
  radius: number;
  kind: 'drain' | 'stomp';
}

export interface CameraExtra {
  distance: number;
  height: number;
  targetHeight: number;
}

/** One step of a melee combo, as the engine executes it. */
export interface MeleeStep {
  style: MeleeStyle;
  damageMul: number;
  /** Seconds after the swing starts before the fist arrives. */
  hitDelay: number;
  range: number;
  /** Half-angle of the hit cone; ≥ π hits all around. */
  halfArc: number;
  reaction: HitReaction;
  strength: number;
  /** Seconds before the next swing can start. */
  recovery: number;
  shake: number;
  hitStop: number;
  /** Metres the Ryder steps into the hit. */
  lunge: number;
  sound: string;
  /** Extra radius that takes a lighter hit when the swing connects. */
  shockRange?: number;
  /** Multiplier on melee damage for targets inside the shock but outside the swing. */
  shockMul?: number;
}

export interface KitFrame {
  dt: number;
  time: number;
  /** Horizontal speed this frame in m/s. */
  speed: number;
  sprinting: boolean;
  moving: boolean;
  /** Current aura (0 → maxAura). Kits dim their own effects when it is gone. */
  aura?: number;
  maxAura?: number;
  burnout?: boolean;
  /** Space is held. Flight uses this to climb. */
  ascend?: boolean;
  /** Control is held. Flight uses this to descend. */
  descend?: boolean;
  /** Shift is held. Flight spends more aura and moves faster. */
  boost?: boolean;
  /** Hard hit stun. Flight ends. */
  stunned?: boolean;
}

export interface RyderKit {
  /** True while a sequence owns the body: no walking, firing or other moves. */
  readonly locked: boolean;
  /** Extra height of the figure above the ground (jumps, dives). */
  readonly airY: number;
  /** Stance to blend over locomotion this frame, if any. */
  readonly pose: PoseOverride | null;
  /** Body opacity the kit wants this frame (1 = solid). The engine restores 1 when the kit is gone. */
  readonly opacity?: number;
  /** Aura-coloured emissive glow over the body this frame (0 = none, 1 = fully lit). Restored to 0 when the kit is gone. */
  readonly glow?: number;
  /** True while enemies cannot touch, block or find the Ryder (phasing, underground). */
  readonly intangible?: boolean;
  /**
   * Glide through hosts without becoming unhittable: skips body-blocking and
   * melee bump, but incoming damage (bolts, etc.) still applies.
   */
  readonly passthrough?: boolean;
  /**
   * Hands are busy (weapon thrown, mid-spin): no firing, melee or other
   * powers, but the player keeps walking. The power that is on can still be
   * switched off.
   */
  readonly busy?: boolean;
  /** Walking speed multiplier this frame (1 = normal). */
  readonly moveScale?: number;
  /** Extra yaw on the figure beyond the camera facing (spins). */
  readonly bodyYaw?: number;
  /** 0 → 1 resistance to being hurt: damage, shove and camera shake are scaled down. */
  readonly braced?: number;
  /** Uniform scale of the figure. 1 is the authored size. The engine restores 1 when the kit is gone. */
  readonly bodyScale?: number;
  /** Multiplier on the Ryder's collision radius. */
  readonly radiusScale?: number;
  /** Extra third-person distance while the figure is enlarged or airborne. */
  readonly cameraExtra?: CameraExtra | null;
  /** True while a kit is holding the body off the ground (flight). Engine gravity stays off. */
  readonly flying?: boolean;
  /** Aura weapon is live, so punch and kick use the pitchfork hitboxes. */
  readonly forkArmed?: boolean;
  /** Areas the enemy AI should step out of. */
  hazards?(): HazardZone[];
  attach(ctx: KitContext): void;
  detach(): void;
  update(frame: KitFrame): void;
  /**
   * Start an ability this kit owns. Return false to let the engine's generic
   * handler run. Toggled (drain) powers call this when switched on and
   * `endAbility` when the engine switches them off.
   */
  tryAbility(id: AbilityId): boolean;
  endAbility?(id: AbilityId): void;
  /**
   * Basic ranged attack. Zoe does not implement this and keeps the plasma
   * volley. Keven throws an arrow. Return false to spend nothing.
   */
  rangedShot?(damage: number): boolean;
  /** Next melee step, or null to use the engine's default swing. */
  melee(time: number): MeleeStep | null;
  /**
   * A second jump while still in the first hop. `height` is the engine hop
   * still under her. Return true when the kit takes over the air.
   */
  tryAirJump?(sinceJump: number, height: number): boolean;
  /** Punch, kick, or melee while `flying` is set. Ground strikers stay idle. */
  airStrike?(kind: 'punch' | 'kick' | 'melee'): void;
  /** 0–100 charge some kits spend to strengthen the next ability. */
  readonly resonance?: number;
  /** Attack animation rate. 1 is normal. Kits leave it unset. */
  readonly haste?: number;
  /** A basic strike just started. Kits dress the swing; damage stays on the striker. */
  onStrike?(style: MeleeStyle): void;
  /** A basic hit connected. Ability damage does not call this. */
  noteHit?(): void;
  /** A named chain just connected. Unlabeled chains are not reported. */
  noteCombo?(snap: { recipeId: string | null; label: string; revision: number }): void;
  /** The dodge dash started. Kits may open a counter window. */
  onDodge?(): void;
  /** A round began. Kits reset round-scoped meters here. */
  onRound?(): void;
  /** Cut any running sequence (death, Ryder switch, Beacon recovery). */
  interrupt(): void;
}
