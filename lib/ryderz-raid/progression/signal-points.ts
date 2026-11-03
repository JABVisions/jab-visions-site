/**
 * Signal Points (SP): the persistent progression currency. Earned from
 * authoritative combat events, spent on a Ryder's Power Tree, saved with the
 * player's profile. Match Raid Points (the spire shop) are a separate,
 * per-fight balance and live in `raid/rewards.ts`.
 */
export const SP_REWARDS = {
  civilian: 10,
  finisher: 25,
  elite: 75,
  boss: 150,
  round: 100,
  revive: 50,
  milestone: 500,
} as const;

/** Rounds that pay the survival bonus: 10, 20, 30… */
export const SP_MILESTONE_EVERY = 10;

export type SignalEventKind = 'kill' | 'finisher' | 'round' | 'revive' | 'milestone';

export interface SignalEvent {
  kind: SignalEventKind;
  amount: number;
  /** Round the event happened in. */
  round: number;
  /** Party seat credited. 0 is the local player in solo. */
  seat: number;
}

export interface SignalLedger {
  earned: number;
  spent: number;
}

export function emptyLedger(): SignalLedger {
  return { earned: 0, spent: 0 };
}

export function availableSignal(ledger: SignalLedger) {
  return Math.max(0, Math.floor(ledger.earned) - Math.floor(ledger.spent));
}

/** Tier 4 and up are elites. Bosses pay their own line. */
export function signalForKill(tier: number, boss = false) {
  if (boss || tier >= 6) return SP_REWARDS.boss;
  if (tier >= 4) return SP_REWARDS.elite;
  return SP_REWARDS.civilian;
}

/** Round clear pays 100; every tenth round adds the survival bonus on top. */
export function signalForRound(round: number) {
  const n = Math.max(1, Math.floor(round));
  return SP_REWARDS.round + (n % SP_MILESTONE_EVERY === 0 ? SP_REWARDS.milestone : 0);
}

/**
 * Character level from lifetime SP. Level 1 at zero, level 2 at 150, level
 * 12 near 18,000. Purely cosmetic; unlocks come from spending.
 */
export function levelForSignal(earned: number) {
  const e = Math.max(0, earned);
  return 1 + Math.floor(Math.sqrt(e / 150));
}

/** SP needed for the next level, and progress 0–1 toward it. */
export function levelProgress(earned: number) {
  const level = levelForSignal(earned);
  const floor = (level - 1) ** 2 * 150;
  const next = level ** 2 * 150;
  return { level, next, progress: Math.max(0, Math.min(1, (earned - floor) / Math.max(1, next - floor))) };
}

/**
 * One match's SP accounting. Every kill is keyed by the host object so a
 * body that dies twice (a flung corpse, a second hit on the same tick, a
 * replayed death event) is only paid once. Rounds are paid once per round
 * number. Totals are reported upward to whoever persists them.
 */
export class SignalBank {
  private paidHosts = new WeakSet<object>();
  /** `${round}:${seat}` so each seat is paid once per round in co-op. */
  private paidRounds = new Set<string>();
  private paidRevives = new Map<string, number>();
  private listeners = new Set<(event: SignalEvent) => void>();
  /** SP this match so far. */
  earned = 0;
  /** SP since the current round began. The Stat Board shows this. */
  earnedRound = 0;
  /** Per-seat totals for the raid report. */
  readonly bySeat = new Map<number, number>();
  /** How many of each event paid out this match. */
  readonly tally: Record<SignalEventKind, number> = { kill: 0, finisher: 0, round: 0, revive: 0, milestone: 0 };

  subscribe(listener: (event: SignalEvent) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  reset() {
    this.paidHosts = new WeakSet();
    this.paidRounds.clear();
    this.paidRevives.clear();
    this.earned = 0;
    this.earnedRound = 0;
    this.bySeat.clear();
    for (const key of Object.keys(this.tally) as SignalEventKind[]) this.tally[key] = 0;
  }

  /** A new round started: the per-round counter clears, lifetime totals stay. */
  beginRound() {
    this.earnedRound = 0;
  }

  /** Pays the kill (and a finisher bonus when the blow was a finisher). Returns 0 when this host was already paid. */
  kill(host: object, tier: number, boss: boolean, finisher: boolean, round: number, seat: number): number {
    if (this.paidHosts.has(host)) return 0;
    this.paidHosts.add(host);
    let total = this.pay('kill', signalForKill(tier, boss), round, seat);
    if (finisher) total += this.pay('finisher', SP_REWARDS.finisher, round, seat);
    return total;
  }

  /** Pays the round clear once per round number per seat, plus the milestone bonus on tens. */
  roundClear(round: number, seat: number): number {
    const n = Math.max(1, Math.floor(round));
    const key = `${n}:${seat}`;
    if (this.paidRounds.has(key)) return 0;
    this.paidRounds.add(key);
    let total = this.pay('round', SP_REWARDS.round, n, seat);
    if (n % SP_MILESTONE_EVERY === 0) total += this.pay('milestone', SP_REWARDS.milestone, n, seat);
    return total;
  }

  /** A revive pays once per patient per round, so trading downs cannot farm it. */
  revive(patientKey: string, round: number, seat: number): number {
    const n = Math.max(1, Math.floor(round));
    if (this.paidRevives.get(patientKey) === n) return 0;
    this.paidRevives.set(patientKey, n);
    return this.pay('revive', SP_REWARDS.revive, n, seat);
  }

  private pay(kind: SignalEventKind, amount: number, round: number, seat: number) {
    if (amount <= 0) return 0;
    this.earned += amount;
    this.earnedRound += amount;
    this.bySeat.set(seat, (this.bySeat.get(seat) ?? 0) + amount);
    this.tally[kind] += 1;
    const event: SignalEvent = { kind, amount, round, seat };
    this.listeners.forEach((listener) => listener(event));
    return amount;
  }
}
