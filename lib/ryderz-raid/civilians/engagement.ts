/**
 * The engagement director hands out attack tokens. Only token holders swing;
 * everyone else closes to the ring and repositions. Tokens rotate so a crowd
 * is readable but never passive: a host that has waited too long inside
 * reach is guaranteed a swing, and a token holder who drifts out of reach
 * loses the token to someone who is in it.
 */
export interface EngagementCandidate {
  ref: object;
  /** Metres to the body it wants to hit. */
  dist: number;
  /** Seconds since this host last started a strike. */
  sinceAttack: number;
  tier: number;
  /** Staggered, launched, held, or otherwise unable to swing. */
  disabled: boolean;
}

export interface EngagementConfig {
  /** Simultaneous attackers. */
  slots: number;
  /** Metres inside which a host may hold a token. */
  reach: number;
  /** Seconds a token is held before it rotates to the next in line. */
  rotate: number;
  /** Seconds in reach without a swing before a host is forced in regardless of slots. */
  starve: number;
  /** Extra tokens the starvation rule may hand out above `slots`. */
  overflow: number;
}

export const DEFAULT_ENGAGEMENT: EngagementConfig = { slots: 2, reach: 4.2, rotate: 3.2, starve: 3.8, overflow: 2 };

export class EngagementDirector {
  private tokens = new Map<object, number>();

  /** Holders right now. For HUD and tests. */
  get holders(): ReadonlySet<object> {
    return new Set(this.tokens.keys());
  }

  reset() {
    this.tokens.clear();
  }

  /** A body left the fight (dead, pooled). */
  release(ref: object) {
    this.tokens.delete(ref);
  }

  /**
   * Recompute who may attack this frame. Returns the set of token holders.
   * Stable: holders keep their token until it expires or they fall out of
   * reach; the rest of the slots go to the most starved bodies in reach.
   */
  assign(candidates: readonly EngagementCandidate[], config: EngagementConfig, time: number): Set<object> {
    const byRef = new Map<object, EngagementCandidate>();
    for (const c of candidates) byRef.set(c.ref, c);

    for (const [ref, until] of this.tokens) {
      const c = byRef.get(ref);
      if (!c || c.disabled || c.dist > config.reach + 0.8 || time >= until) this.tokens.delete(ref);
    }

    const slots = Math.max(1, Math.floor(config.slots));
    const eligible = candidates
      .filter((c) => !c.disabled && c.dist <= config.reach && !this.tokens.has(c.ref))
      .sort((a, b) => {
        // Starved first, then tier (elites press), then closest.
        if (b.sinceAttack !== a.sinceAttack) return b.sinceAttack - a.sinceAttack;
        if (b.tier !== a.tier) return b.tier - a.tier;
        return a.dist - b.dist;
      });

    for (const c of eligible) {
      if (this.tokens.size >= slots) break;
      this.tokens.set(c.ref, time + config.rotate + (c.tier >= 4 ? 1.2 : 0));
    }

    // Nobody circles forever: a body that has stood in reach for too long gets a swing.
    let overflow = config.overflow;
    for (const c of eligible) {
      if (overflow <= 0) break;
      if (this.tokens.has(c.ref)) continue;
      if (c.sinceAttack >= config.starve && c.dist <= config.reach * 0.75) {
        this.tokens.set(c.ref, time + 1.4);
        overflow -= 1;
      }
    }

    return new Set(this.tokens.keys());
  }

  has(ref: object) {
    return this.tokens.has(ref);
  }
}

/** Where a host without a token should stand: a ring around the target, offset by its index. */
export function ringPoint(targetX: number, targetZ: number, index: number, count: number, radius: number) {
  const n = Math.max(1, count);
  const ang = (index / n) * Math.PI * 2 + (Math.floor(index / n) % 2) * 0.35;
  return { x: targetX + Math.cos(ang) * radius, z: targetZ + Math.sin(ang) * radius };
}
