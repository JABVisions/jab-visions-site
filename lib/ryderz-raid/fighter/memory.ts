export type MemoryKind = 'punch' | 'kick' | 'melee' | 'ability' | 'dodge' | 'retreat' | 'throw';

export interface CombatRates {
  punch: number;
  kick: number;
  melee: number;
  ability: number;
  dodge: number;
  retreat: number;
}

const EMPTY: CombatRates = { punch: 0, kick: 0, melee: 0, ability: 0, dodge: 0, retreat: 0 };

/**
 * A short tally of what the other fighter has been doing. Rates are the share
 * of recent actions, not a model of their mind.
 */
export class CombatMemory {
  private events: { kind: MemoryKind; time: number }[] = [];
  private readonly horizon: number;

  constructor(horizon = 4.5) {
    this.horizon = horizon;
  }

  note(kind: MemoryKind, time: number) {
    this.events.push({ kind, time });
    const cutoff = time - this.horizon;
    if (this.events.length > 24) this.events = this.events.filter((event) => event.time >= cutoff);
  }

  reset() {
    this.events = [];
  }

  rates(time: number): CombatRates {
    const recent = this.events.filter((event) => time - event.time <= this.horizon);
    if (!recent.length) return { ...EMPTY };
    const tally = { ...EMPTY };
    for (const event of recent) {
      if (event.kind === 'throw') continue;
      tally[event.kind] += 1;
    }
    const total = recent.length;
    return {
      punch: tally.punch / total,
      kick: tally.kick / total,
      melee: tally.melee / total,
      ability: tally.ability / total,
      dodge: tally.dodge / total,
      retreat: tally.retreat / total,
    };
  }
}
