import type { RyderId } from '../config';
import type { HitReaction } from '../combat';
import type { MeleeStyle } from '../skeletal';
import type { CombatAction, StrikeKind } from './actions';
import { ComboManager, meleeWantsGrab, reactionForEffect, type ComboSnapshot } from './combo';
import { actionFor, recipesFor } from './profiles';

export interface StrikeTarget {
  ref: object;
  x: number;
  z: number;
  radius: number;
  airborne: boolean;
}

export interface StrikerHit {
  target: StrikeTarget;
  damage: number;
  reaction: HitReaction;
  strength: number;
  hitStun: number;
  knockback: number;
  kind: StrikeKind;
  combo: ComboSnapshot;
}

export interface StrikerFrame {
  hits: StrikerHit[];
  lunge: number;
  swing: MeleeStyle | null;
  started: boolean;
  grab: StrikeTarget | null;
  exposed: boolean;
  busy: boolean;
}

export interface StrikerContext {
  time: number;
  stunned: boolean;
  locked: boolean;
  facing: number;
  x: number;
  z: number;
  meleeDamage: number;
  targets: readonly StrikeTarget[];
}

const empty = (): StrikerFrame => ({
  hits: [],
  lunge: 0,
  swing: null,
  started: false,
  grab: null,
  exposed: false,
  busy: false,
});

function angleDiff(from: number, to: number) {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

export function targetsInStrike(targets: readonly StrikeTarget[], x: number, z: number, yaw: number, action: CombatAction): StrikeTarget[] {
  const hits: StrikeTarget[] = [];
  for (const target of targets) {
    const dx = target.x - x;
    const dz = target.z - z;
    const dist = Math.hypot(dx, dz);
    if (dist > action.range + target.radius) continue;
    if (action.halfArc < Math.PI) {
      const facing = Math.atan2(dx, dz);
      const slack = Math.min(0.5, target.radius / Math.max(dist, 0.3));
      if (Math.abs(angleDiff(yaw, facing)) > action.halfArc + slack) continue;
    }
    hits.push(target);
  }
  hits.sort((a, b) => (a.x - x) ** 2 + (a.z - z) ** 2 - ((b.x - x) ** 2 + (b.z - z) ** 2));
  return hits;
}

type Phase = 'idle' | 'startup' | 'active' | 'recovery' | 'hold';

/**
 * Startup, the hit, then recovery. Punch recovery can cancel into the next
 * strike. A missed kick or melee stays exposed until recovery ends.
 */
export class FighterStriker {
  readonly combo = new ComboManager();
  private phase: Phase = 'idle';
  private kind: StrikeKind | null = null;
  private inputKind: StrikeKind | null = null;
  private action: CombatAction | null = null;
  private elapsed = 0;
  private connected = false;
  private buffer: StrikeKind | null = null;
  private holdLeft = 0;
  private holdTarget: StrikeTarget | null = null;
  private throwNext = false;
  private ryderId: RyderId | null = null;
  private grabWindowUntil = 0;
  private didLunge = false;
  private startedFlag = false;

  setRyder(id: RyderId | null) {
    this.ryderId = id;
    this.combo.setRecipes(recipesFor(id));
  }

  get busy() {
    return this.phase !== 'idle';
  }

  get exposed() {
    return this.phase === 'recovery' && !this.connected;
  }

  /** True on the tick an attack begins, so the body can start its swing once. */
  get justStarted() {
    return this.startedFlag;
  }

  /**
   * 0 at the windup, about 0.5 as the hit lands, 1 as the limb returns.
   * Null while idle. Callers turn this into the pose clock.
   */
  pose(): { style: MeleeStyle; p: number } | null {
    const action = this.action;
    if (!action || this.phase === 'idle') return null;
    const startup = Math.max(action.startup, 0.04);
    const active = Math.max(action.active, 0.04);
    const recovery = Math.max(action.recovery, 0.04);
    let p = 0.45;
    if (this.phase === 'startup') p = (this.elapsed / startup) * 0.32;
    else if (this.phase === 'active') p = 0.32 + ((this.elapsed - action.startup) / active) * 0.3;
    else if (this.phase === 'recovery') {
      const into = this.elapsed - action.startup - action.active;
      p = 0.62 + Math.min(1, into / recovery) * 0.38;
    }
    return { style: action.style, p: Math.max(0, Math.min(1, p)) };
  }

  queue(kind: StrikeKind) {
    if (this.phase === 'hold') {
      this.throwNext = true;
      return;
    }
    if (this.phase === 'idle') {
      this.buffer = kind;
      return;
    }
    if (this.kind === 'punch' && (this.phase === 'recovery' || this.phase === 'active')) {
      this.buffer = kind;
    }
  }

  /** Buffer the next strike of a punch so a jab can become jab-cross or jab-kick. */
  chainInto(kind: StrikeKind) {
    if (this.kind !== 'punch' || this.phase === 'idle' || this.phase === 'hold') return false;
    this.buffer = kind;
    return true;
  }

  interrupt() {
    this.phase = 'idle';
    this.kind = null;
    this.inputKind = null;
    this.action = null;
    this.buffer = null;
    this.holdTarget = null;
    this.throwNext = false;
    this.connected = false;
    this.elapsed = 0;
    this.combo.interrupt();
  }

  reset() {
    this.interrupt();
    this.combo.reset();
    this.grabWindowUntil = 0;
  }

  tick(dt: number, ctx: StrikerContext): StrikerFrame {
    const frame = empty();
    this.startedFlag = false;
    this.combo.expire(ctx.time);
    if (ctx.stunned && this.phase !== 'idle' && this.phase !== 'hold') {
      this.interrupt();
      return frame;
    }

    if (this.phase === 'hold') {
      this.holdLeft -= dt;
      frame.grab = this.holdTarget;
      frame.busy = true;
      if (this.throwNext || this.holdLeft <= 0) this.releaseThrow(ctx, frame);
      return frame;
    }

    if (this.phase === 'idle') {
      if (this.buffer && !ctx.stunned && !ctx.locked) {
        this.begin(this.buffer, ctx);
        this.buffer = null;
        frame.started = true;
        this.startedFlag = true;
        frame.swing = this.action?.style ?? null;
      }
      frame.busy = this.phase !== 'idle';
      return frame;
    }

    this.elapsed += dt;
    const action = this.action;
    if (!action) {
      this.phase = 'idle';
      return frame;
    }

    if (this.phase === 'startup' && this.elapsed >= action.startup) {
      this.phase = 'active';
      if (!this.didLunge) {
        frame.lunge = action.lunge;
        this.didLunge = true;
      }
    }

    if (this.phase === 'active' && !this.connected && this.elapsed <= action.startup + action.active + dt) {
      this.connect(ctx, frame);
    }

    const activeEnd = action.startup + action.active;
    const total = activeEnd + action.recovery;
    if (this.phase === 'active' && this.elapsed >= activeEnd) this.phase = 'recovery';
    if (this.phase === 'recovery' && this.kind === 'punch' && this.buffer && this.elapsed >= activeEnd) {
      this.begin(this.buffer, ctx);
      this.buffer = null;
      frame.started = true;
      this.startedFlag = true;
      frame.swing = this.action?.style ?? null;
    } else if (this.elapsed >= total) {
      this.phase = 'idle';
      this.kind = null;
      this.action = null;
      this.connected = false;
    }

    frame.exposed = this.exposed;
    frame.busy = this.phase !== 'idle';
    return frame;
  }

  private begin(kind: StrikeKind, ctx: StrikerContext) {
    let use: StrikeKind = kind;
    if (kind === 'melee') {
      const near = nearest(ctx);
      const dist = near ? Math.hypot(near.x - ctx.x, near.z - ctx.z) : 99;
      if (near && !near.airborne && meleeWantsGrab(this.combo.sequence, dist, ctx.time < this.grabWindowUntil)) {
        use = 'grab';
      }
    }
    this.inputKind = kind;
    this.kind = use;
    this.action = actionFor(use, this.ryderId);
    this.phase = 'startup';
    this.elapsed = 0;
    this.connected = false;
    this.didLunge = false;
  }

  private connect(ctx: StrikerContext, frame: StrikerFrame) {
    const action = this.action;
    if (!action || !this.kind) return;
    const reachX = ctx.x + Math.sin(ctx.facing) * action.lunge;
    const reachZ = ctx.z + Math.cos(ctx.facing) * action.lunge;
    const hits = targetsInStrike(ctx.targets, reachX, reachZ, ctx.facing, action);
    if (this.kind === 'grab') {
      const target = hits[0];
      if (!target) return;
      this.connected = true;
      this.phase = 'hold';
      this.holdLeft = 0.42;
      this.holdTarget = target;
      frame.grab = target;
      this.combo.land(this.inputKind === 'melee' ? 'melee' : 'grab', ctx.time, target.ref);
      return;
    }
    if (!hits.length) return;
    this.connected = true;
    const primary = hits[0];
    const recorded = this.inputKind === 'melee' ? 'melee' : this.kind;
    const snap = this.combo.land(recorded, ctx.time, primary.ref);
    if (snap.effect === 'grabOpportunity') this.grabWindowUntil = ctx.time + 1.15;
    const shaped = reactionForEffect(snap.effect, action.reaction, action.strength);
    for (const target of hits) {
      frame.hits.push({
        target,
        damage: ctx.meleeDamage * action.damageMul * snap.scale,
        reaction: shaped.reaction,
        strength: shaped.strength,
        hitStun: action.hitStun * snap.stunScale,
        knockback: action.knockback,
        kind: this.kind,
        combo: snap,
      });
    }
  }

  private releaseThrow(ctx: StrikerContext, frame: StrikerFrame) {
    const target = this.holdTarget;
    const action = actionFor('throw', this.ryderId);
    this.phase = 'recovery';
    this.kind = 'throw';
    this.action = action;
    this.elapsed = action.startup + action.active;
    this.connected = true;
    this.throwNext = false;
    this.holdTarget = null;
    if (!target) return;
    const snap = this.combo.land('throw', ctx.time, target.ref);
    frame.hits.push({
      target,
      damage: ctx.meleeDamage * action.damageMul * snap.scale,
      reaction: 'knockback',
      strength: action.strength,
      hitStun: action.hitStun * snap.stunScale,
      knockback: action.knockback,
      kind: 'throw',
      combo: snap,
    });
    frame.swing = action.style;
    frame.started = true;
    this.startedFlag = true;
  }
}

function nearest(ctx: StrikerContext): StrikeTarget | null {
  let best: StrikeTarget | null = null;
  let bestD = Infinity;
  for (const target of ctx.targets) {
    const d = (target.x - ctx.x) ** 2 + (target.z - ctx.z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = target;
    }
  }
  return best;
}
