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
  /** Hurt a target: damage, hit direction, how it should react. */
  hurt(target: KitTarget, damage: number, dir: THREE.Vector3, reaction?: HitReaction, strength?: number): void;
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
}

export interface KitFrame {
  dt: number;
  time: number;
  /** Horizontal speed this frame in m/s. */
  speed: number;
  sprinting: boolean;
  moving: boolean;
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
  /** Next melee step, or null to use the engine's default swing. */
  melee(time: number): MeleeStep | null;
  /** Cut any running sequence (death, Ryder switch, Beacon recovery). */
  interrupt(): void;
}
