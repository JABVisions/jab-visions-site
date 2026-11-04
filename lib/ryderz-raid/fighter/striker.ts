import type { RyderId } from '../config';
import type { HitReaction } from '../combat';
import type { MeleeStyle } from '../skeletal';
import { forkStrike, type CombatAction, type StrikeInput, type StrikeKind } from './actions';
import { ComboManager, meleeWantsGrab, reactionForEffect, type ComboRecipe, type ComboSnapshot } from './combo';
import { actionFor, combatProfileFor, recipesFor } from './profiles';

export interface StrikeTarget {
  ref: object;
  x: number;
  z: number;
  radius: number;
  airborne: boolean;
  /** On the floor and still reeling. Melee over this body becomes a finisher. */
  downed?: boolean;
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
  /** Shock radius around a connected pitchfork slam. Set on the first hit only. */
  shockRange?: number;
  /** Extra upward speed for a target that was already airborne. 0 when grounded. */
  juggle: number;
  /** True for the first (closest) body the strike reached. */
  primary: boolean;
}

export interface StrikerFrame {
  hits: StrikerHit[];
  lunge: number;
  swing: MeleeStyle | null;
  started: boolean;
  grab: StrikeTarget | null;
  exposed: boolean;
  busy: boolean;
  /** The strike that just began, so callers can play an aerial or finisher differently. */
  kind: StrikeKind | null;
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
  /** The fighter is off the ground. Strikes become aerials. */
  airborne?: boolean;
  /** Multiplier on every strike's damage from progression. */
  damageScale?: number;
}

const empty = (): StrikerFrame => ({
  hits: [],
  lunge: 0,
  swing: null,
  started: false,
  grab: null,
  exposed: false,
  busy: false,
  kind: null,
});

function angleDiff(from: number, to: number) {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

/**
 * Bodies a strike reaches. The arc is tested at the end of the lunge; a
 * strike with `sweepWidth` also catches anyone the fist travelled through
 * between `fromX/fromZ` and `x/z`, so a wide swing through a crowd lands on
 * the crowd and not only on whoever stands at the tip.
 */
export function targetsInStrike(
  targets: readonly StrikeTarget[],
  x: number,
  z: number,
  yaw: number,
  action: CombatAction,
  fromX = x,
  fromZ = z,
): StrikeTarget[] {
  const hits: StrikeTarget[] = [];
  const sx = x - fromX;
  const sz = z - fromZ;
  const len2 = sx * sx + sz * sz;
  for (const target of targets) {
    const dx = target.x - x;
    const dz = target.z - z;
    const dist = Math.hypot(dx, dz);
    let inArc = dist <= action.range + target.radius;
    if (inArc && action.halfArc < Math.PI) {
      const facing = Math.atan2(dx, dz);
      const slack = Math.min(0.5, target.radius / Math.max(dist, 0.3));
      if (Math.abs(angleDiff(yaw, facing)) > action.halfArc + slack) inArc = false;
    }
    let swept = false;
    if (!inArc && action.sweepWidth && len2 > 1e-6) {
      const u = Math.max(0, Math.min(1, ((target.x - fromX) * sx + (target.z - fromZ) * sz) / len2));
      const px = fromX + sx * u;
      const pz = fromZ + sz * u;
      const r = action.sweepWidth + target.radius;
      swept = (target.x - px) ** 2 + (target.z - pz) ** 2 <= r * r;
    }
    if (inArc || swept) hits.push(target);
  }
  hits.sort((a, b) => (a.x - x) ** 2 + (a.z - z) ** 2 - ((b.x - x) ** 2 + (b.z - z) ** 2));
  return hits;
}

type Phase = 'idle' | 'startup' | 'active' | 'recovery' | 'hold';

/**
 * Startup, the hit, then recovery. Punch recovery always cancels into the
 * next strike. Any strike that connected may cancel once its active frames
 * end (hit confirm). A missed kick, heavy, or melee stays exposed until
 * recovery ends.
 */
export class FighterStriker {
  readonly combo = new ComboManager();
  private phase: Phase = 'idle';
  private kind: StrikeKind | null = null;
  private inputKind: StrikeKind | null = null;
  private action: CombatAction | null = null;
  private elapsed = 0;
  private connected = false;
  private buffer: StrikeInput | null = null;
  private holdLeft = 0;
  private holdTarget: StrikeTarget | null = null;
  private throwNext = false;
  private ryderId: RyderId | null = null;
  private fork = false;
  private grabWindowUntil = 0;
  private didLunge = false;
  private startedFlag = false;
  private punchN = 0;
  private kickN = 0;
  /** Where the fighter stood when the strike began, for the swept volume. */
  private originX = 0;
  private originZ = 0;
  private extraRecipes: ComboRecipe[] = [];

  setRyder(id: RyderId | null) {
    this.ryderId = id;
    this.applyRecipes();
  }

  /** Recipes the Power Tree granted on top of the character's own. */
  setExtraRecipes(recipes: ComboRecipe[]) {
    this.extraRecipes = recipes;
    this.applyRecipes();
  }

  private applyRecipes() {
    const base = recipesFor(this.ryderId);
    // Tree recipes win when they repeat a sequence, so an upgrade can retune a shared chain.
    const extra = this.extraRecipes.filter(
      (recipe) => !base.some((own) => own.id === recipe.id),
    );
    this.combo.setRecipes(extra.length ? [...extra, ...base] : base);
  }

  /** Aura pitchfork. Other Ryderz leave this off, so their punch chains stay as they are. */
  setFork(on: boolean) {
    this.fork = on;
  }

  get busy() {
    return this.phase !== 'idle';
  }

  get exposed() {
    return this.phase === 'recovery' && !this.connected;
  }

  /** The strike in flight, or null. */
  get current(): StrikeKind | null {
    return this.phase === 'idle' ? null : this.kind;
  }

  /** The hit has landed and the fighter is only recovering. Dodges and powers may cut this short. */
  get cancelable() {
    return this.phase === 'recovery';
  }

  /** Winding up a slow strike: the moment an enemy can read and dodge. */
  get telegraphing() {
    return this.phase === 'startup' && (this.action?.startup ?? 0) >= 0.16;
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

  queue(kind: StrikeInput) {
    if (this.phase === 'hold') {
      this.throwNext = true;
      return;
    }
    if (this.phase === 'idle') {
      this.buffer = kind;
      return;
    }
    if (this.phase === 'recovery' || this.phase === 'active') {
      if (this.kind === 'punch' || this.fork || this.connected) this.buffer = kind;
    }
  }

  /** Buffer the next strike of a punch so a jab can become jab-cross or jab-kick. */
  chainInto(kind: StrikeInput) {
    if (this.kind !== 'punch' || this.phase === 'idle' || this.phase === 'hold') return false;
    this.buffer = kind;
    return true;
  }

  /** Cut recovery short (a dodge or a power). Returns true when there was something to cancel. */
  cancel() {
    if (this.phase !== 'recovery') return false;
    this.phase = 'idle';
    this.kind = null;
    this.inputKind = null;
    this.action = null;
    this.buffer = null;
    this.connected = false;
    this.elapsed = 0;
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
        frame.kind = this.kind;
        // The press counts from this frame, so a quick jab is not a frame late.
      } else {
        frame.busy = false;
        return frame;
      }
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
    const next = this.buffer;
    const chainOpen =
      this.kind === 'punch' ||
      (this.fork && this.kind !== 'grab' && this.kind !== 'throw') ||
      (this.connected && Boolean(action.cancelOnHit));
    const chain = next !== null && this.elapsed >= activeEnd && chainOpen;
    if (this.phase === 'recovery' && chain && next) {
      this.begin(next, ctx);
      this.buffer = null;
      frame.started = true;
      this.startedFlag = true;
      frame.swing = this.action?.style ?? null;
      frame.kind = this.kind;
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

  private begin(kind: StrikeInput, ctx: StrikerContext) {
    let use: StrikeKind = kind;
    const near = nearest(ctx);
    const dist = near ? Math.hypot(near.x - ctx.x, near.z - ctx.z) : 99;
    if (ctx.airborne && (kind === 'punch' || kind === 'kick' || kind === 'melee' || kind === 'heavy' || kind === 'launcher')) {
      use = 'aerial';
    } else if (kind === 'melee') {
      if (near?.downed && dist < 2.2) use = 'finisher';
      else if (near && !near.airborne && meleeWantsGrab(this.combo.sequence, dist, ctx.time < this.grabWindowUntil, this.combo.activeRecipes)) {
        use = 'grab';
      }
    }
    this.inputKind = kind;
    this.kind = use;
    this.action = actionFor(use, this.ryderId);
    const cycle = combatProfileFor(this.ryderId);
    if (use === 'punch' && cycle.punchCycle?.length) {
      const style = cycle.punchCycle[this.punchN % cycle.punchCycle.length];
      this.punchN += 1;
      this.action = { ...this.action, style };
    } else if (use === 'kick' && cycle.kickCycle?.length) {
      const style = cycle.kickCycle[this.kickN % cycle.kickCycle.length];
      this.kickN += 1;
      this.action = { ...this.action, style };
    }
    if (this.fork && (use === 'punch' || use === 'kick' || use === 'melee')) this.action = forkStrike(this.action, use);
    this.phase = 'startup';
    this.elapsed = 0;
    this.connected = false;
    this.didLunge = false;
    this.originX = ctx.x;
    this.originZ = ctx.z;
  }

  private connect(ctx: StrikerContext, frame: StrikerFrame) {
    const action = this.action;
    if (!action || !this.kind) return;
    const reachX = ctx.x + Math.sin(ctx.facing) * action.lunge;
    const reachZ = ctx.z + Math.cos(ctx.facing) * action.lunge;
    const hits = targetsInStrike(ctx.targets, reachX, reachZ, ctx.facing, action, this.originX, this.originZ);
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
    const recorded: StrikeKind = this.inputKind === 'melee' && this.kind === 'melee' ? 'melee' : this.kind;
    const snap = this.combo.land(recorded, ctx.time, primary.ref);
    if (snap.effect === 'grabOpportunity') this.grabWindowUntil = ctx.time + 1.15;
    const shaped = reactionForEffect(snap.effect, action.reaction, action.strength);
    const scale = ctx.damageScale ?? 1;
    for (const target of hits) {
      frame.hits.push({
        target,
        damage: ctx.meleeDamage * action.damageMul * snap.scale * scale,
        reaction: shaped.reaction,
        strength: shaped.strength,
        hitStun: action.hitStun * snap.stunScale,
        knockback: action.knockback,
        kind: this.kind,
        combo: snap,
        shockRange: action.style === 'forkSlam' && target === primary ? 4.4 : undefined,
        juggle: target.airborne ? action.juggle ?? 0 : 0,
        primary: target === primary,
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
      damage: ctx.meleeDamage * action.damageMul * snap.scale * (ctx.damageScale ?? 1),
      reaction: 'knockback',
      strength: action.strength,
      hitStun: action.hitStun * snap.stunScale,
      knockback: action.knockback,
      kind: 'throw',
      combo: snap,
      juggle: 0,
      primary: true,
    });
    frame.swing = action.style;
    frame.started = true;
    this.startedFlag = true;
    frame.kind = 'throw';
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
