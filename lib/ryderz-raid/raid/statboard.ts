import type { RyderId } from '../config';

/** Kills, downs, and damage for one fighter over one span of a raid. */
export interface CombatStat {
  kills: number;
  downs: number;
  damage: number;
}

export interface SquadStatLine {
  seat: number;
  ryderId: RyderId;
  name: string;
  control: 'human' | 'computer';
  round: CombatStat;
  raid: CombatStat;
}

export type StatView = 'round' | 'raid';

export interface RankedLine extends SquadStatLine {
  place: string;
  stat: CombatStat;
}

export const REPORT_HOLD = 6.4;
export const MVP_HOLD = 10.5;

export function emptyStat(): CombatStat {
  return { kills: 0, downs: 0, damage: 0 };
}

const PLACES = ['MVP', '2ND', '3RD', '4TH', '5TH'];

export function placeLabel(index: number) {
  return PLACES[index] ?? `${index + 1}TH`;
}

/** First name, the way the combat report prints it. */
export function callSign(name: string) {
  const first = name.trim().split(/\s+/)[0] ?? name;
  return first.toUpperCase();
}

export function formatStat(value: number) {
  return Math.round(value).toLocaleString('en-US');
}

/** Rounds 5, 10, 15… close on the MVP cinematic. */
export function mvpRound(round: number) {
  return round > 0 && round % 5 === 0;
}

/**
 * Highest kills, then highest damage, then fewer downs.
 * Seat order keeps a tied squad stable.
 */
export function rankLines(lines: SquadStatLine[], view: StatView): RankedLine[] {
  const ranked = [...lines].sort((a, b) => {
    const left = a[view];
    const right = b[view];
    if (right.kills !== left.kills) return right.kills - left.kills;
    if (right.damage !== left.damage) return right.damage - left.damage;
    if (left.downs !== right.downs) return left.downs - right.downs;
    return a.seat - b.seat;
  });
  return ranked.map((line, index) => ({ ...line, place: placeLabel(index), stat: line[view] }));
}

export function sumStats(lines: SquadStatLine[], view: StatView): CombatStat {
  return lines.reduce(
    (sum, line) => ({
      kills: sum.kills + line[view].kills,
      downs: sum.downs + line[view].downs,
      damage: sum.damage + line[view].damage,
    }),
    emptyStat(),
  );
}
