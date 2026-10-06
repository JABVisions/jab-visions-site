import type { HitReaction } from '../combat';
import type { StrikeKind } from './actions';
import { comboDamageScale, comboStunScale } from './actions';

/** Time between connecting hits before the chain drops. Tuned to punch recovery plus a beat. */
export const COMBO_WINDOW = 1.05;
/** How long a finished chain leaves a special power available. */
export const POWER_LINK_WINDOW = 3;

export type ComboEffect = 'stagger' | 'heavyKnockback' | 'launcher' | 'grabOpportunity' | 'powerLink' | 'finisher';

export type ComboTier = 'none' | 'chain' | 'combo' | 'power' | 'finisher';

export interface ComboRecipe {
  id: string;
  sequence: StrikeKind[];
  effect: ComboEffect;
}

/**
 * Starter vocabulary. Characters append their own recipes; they do not replace
 * these unless they repeat the same sequence.
 */
export const SHARED_COMBOS: ComboRecipe[] = [
  { id: 'jabs', sequence: ['punch', 'punch'], effect: 'stagger' },
  { id: 'breaker', sequence: ['punch', 'punch', 'kick'], effect: 'heavyKnockback' },
  { id: 'flurry', sequence: ['punch', 'kick', 'punch'], effect: 'stagger' },
  { id: 'power-link', sequence: ['punch', 'kick', 'melee'], effect: 'powerLink' },
  { id: 'pressure', sequence: ['kick', 'kick'], effect: 'heavyKnockback' },
  { id: 'dump', sequence: ['kick', 'melee'], effect: 'grabOpportunity' },
  { id: 'signature', sequence: ['punch', 'punch', 'melee'], effect: 'finisher' },
];

export interface ComboSnapshot {
  count: number;
  sequence: StrikeKind[];
  tier: ComboTier;
  recipeId: string | null;
  effect: ComboEffect | null;
  powerReady: boolean;
  powerLeft: number;
  scale: number;
  stunScale: number;
  label: string;
  /** Bumps when the chain grows, so the HUD can replay its pop. */
  revision: number;
}

export function comboTier(count: number): ComboTier {
  if (count >= 8) return 'finisher';
  if (count >= 5) return 'power';
  if (count >= 3) return 'combo';
  if (count >= 2) return 'chain';
  return 'none';
}

export function comboLabel(count: number, tier: ComboTier, powerReady: boolean): string {
  if (powerReady && count < 2) return 'POWER LINK';
  if (tier === 'finisher') return `${count} HIT`;
  if (tier === 'power') return `${count} HIT`;
  if (count >= 2) return `${count} HIT COMBO`;
  return '';
}

/** Longest matching tail wins, so Punch Punch Kick is the breaker and not only the jab chain. */
export function matchRecipe(sequence: readonly StrikeKind[], recipes: readonly ComboRecipe[]): ComboRecipe | null {
  for (let length = sequence.length; length >= 2; length -= 1) {
    const tail = sequence.slice(-length);
    const found = recipes.find(
      (recipe) => recipe.sequence.length === tail.length && recipe.sequence.every((step, i) => step === tail[i]),
    );
    if (found) return found;
  }
  return null;
}

export function reactionForEffect(
  effect: ComboEffect | null,
  base: HitReaction,
  strength = 1,
): { reaction: HitReaction; strength: number } {
  if (effect === 'heavyKnockback') return { reaction: 'knockback', strength: strength * 1.35 };
  if (effect === 'launcher') return { reaction: 'launch', strength: strength * 1.15 };
  if (effect === 'finisher') return { reaction: 'heavy', strength: strength * 1.25 };
  if (effect === 'stagger') return { reaction: 'stagger', strength };
  return { reaction: base, strength };
}

export function recipeOpensPower(effect: ComboEffect | null, tier: ComboTier): boolean {
  return effect === 'powerLink' || effect === 'finisher' || tier === 'power' || tier === 'finisher';
}

/**
 * One attacker's chain. A new target, a late hit, or an interrupt drops the
 * sequence. An earned Power Link keeps its own clock.
 */
export class ComboManager {
  count = 0;
  sequence: StrikeKind[] = [];
  revision = 0;
  private lastTime = -10;
  private target: object | null = null;
  private recipes: ComboRecipe[] = SHARED_COMBOS;
  private powerUntil = 0;
  private lastRecipe: ComboRecipe | null = null;

  setRecipes(recipes: ComboRecipe[]) {
    this.recipes = recipes;
  }

  reset() {
    this.count = 0;
    this.sequence = [];
    this.lastTime = -10;
    this.target = null;
    this.powerUntil = 0;
    this.lastRecipe = null;
  }

  /** Drop the chain. A Power Link that was already earned stays up. */
  interrupt() {
    this.count = 0;
    this.sequence = [];
    this.target = null;
    this.lastTime = -10;
  }

  expire(time: number) {
    if (this.count > 0 && time - this.lastTime > COMBO_WINDOW) {
      this.count = 0;
      this.sequence = [];
      this.target = null;
    }
  }

  powerReady(time: number): boolean {
    return time < this.powerUntil;
  }

  consumePower(time: number): boolean {
    if (!this.powerReady(time)) return false;
    this.powerUntil = 0;
    return true;
  }

  /**
   * Record a connecting hit. `scale` applies to this hit, not the next one.
   * Passing the same target keeps the chain; a different body starts over.
   */
  land(kind: StrikeKind, time: number, target: object): ComboSnapshot {
    if (this.target !== target || time - this.lastTime > COMBO_WINDOW) {
      this.sequence = [];
      this.count = 0;
      this.target = target;
    }
    this.sequence.push(kind);
    this.count += 1;
    this.lastTime = time;
    this.revision += 1;
    const recipe = matchRecipe(this.sequence, this.recipes);
    const tier = comboTier(this.count);
    this.lastRecipe = recipe;
    if (recipeOpensPower(recipe?.effect ?? null, tier)) {
      this.powerUntil = time + POWER_LINK_WINDOW;
    }
    return this.snapshot(time, recipe?.id ?? null, recipe?.effect ?? null);
  }

  snapshot(time: number): ComboSnapshot;
  snapshot(time: number, recipeId: string | null, effect: ComboEffect | null): ComboSnapshot;
  snapshot(time: number, recipeId?: string | null, effect?: ComboEffect | null): ComboSnapshot {
    this.expire(time);
    const alive = this.count > 0 && time - this.lastTime <= COMBO_WINDOW;
    const count = alive ? this.count : 0;
    const tier = comboTier(count);
    const recipe = recipeId !== undefined ? recipeId : this.lastRecipe?.id ?? null;
    const resolved = effect !== undefined ? effect : alive ? this.lastRecipe?.effect ?? null : null;
    const powerReady = this.powerReady(time);
    return {
      count,
      sequence: alive ? [...this.sequence] : [],
      tier,
      recipeId: alive ? recipe : null,
      effect: resolved,
      powerReady,
      powerLeft: powerReady ? Math.max(0, this.powerUntil - time) : 0,
      scale: comboDamageScale(Math.max(1, this.count)),
      stunScale: comboStunScale(Math.max(1, this.count)),
      label: comboLabel(count, tier, powerReady),
      revision: this.revision,
    };
  }
}

/**
 * What the melee button should do with the chain so far.
 * Weapon finishers stay weapon swings. Kick → Melee becomes a grab.
 */
export function meleeWantsGrab(
  sequence: readonly StrikeKind[],
  dist: number,
  grabWindow: boolean,
  recipes: readonly ComboRecipe[] = SHARED_COMBOS,
): boolean {
  const next = [...sequence, 'melee' as const];
  const recipe = matchRecipe(next, recipes);
  if (recipe?.effect === 'finisher' || recipe?.effect === 'powerLink') return false;
  if (recipe?.effect === 'grabOpportunity' || grabWindow) return dist < 2.05;
  return dist < 1.32;
}
