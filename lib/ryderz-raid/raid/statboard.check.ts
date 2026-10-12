import assert from 'node:assert/strict';
import { callSign, formatStat, mvpRound, placeLabel, rankLines, sumStats, type SquadStatLine } from './statboard';

function line(partial: Pick<SquadStatLine, 'seat' | 'name'> & Partial<SquadStatLine['round']> & { control?: SquadStatLine['control'] }): SquadStatLine {
  const stat = { kills: partial.kills ?? 0, downs: partial.downs ?? 0, damage: partial.damage ?? 0 };
  return {
    seat: partial.seat,
    ryderId: 'keven',
    name: partial.name,
    control: partial.control ?? 'computer',
    round: stat,
    raid: stat,
  };
}

const board = [
  line({ seat: 4, name: 'Keven Hart', kills: 32, downs: 1, damage: 15420, control: 'human' }),
  line({ seat: 1, name: 'Leo Montana', kills: 25, downs: 0, damage: 12180 }),
  line({ seat: 2, name: 'Aaron Addams', kills: 18, downs: 2, damage: 9750 }),
  line({ seat: 3, name: 'Zoe Folie', kills: 11, downs: 2, damage: 5500 }),
];
const ranked = rankLines(board, 'round');
assert.deepEqual(
  ranked.map((row) => row.place),
  ['MVP', '2ND', '3RD', '4TH'],
);
assert.deepEqual(
  ranked.map((row) => callSign(row.name)),
  ['KEVEN', 'LEO', 'AARON', 'ZOE'],
);
assert.equal(ranked[0].control, 'human');
const totals = sumStats(board, 'round');
assert.equal(totals.kills, 86);
assert.equal(totals.downs, 5);
assert.equal(totals.damage, 42850);
assert.equal(formatStat(totals.damage), '42,850');

const tied = [
  line({ seat: 2, name: 'Aaron', kills: 4, downs: 2, damage: 100 }),
  line({ seat: 0, name: 'Rubi', kills: 4, downs: 0, damage: 100, control: 'human' }),
  line({ seat: 1, name: 'Leo', kills: 4, downs: 0, damage: 80 }),
];
assert.deepEqual(
  rankLines(tied, 'round').map((row) => row.name),
  ['Rubi', 'Aaron', 'Leo'],
);
assert.equal(placeLabel(0), 'MVP');
assert.equal(placeLabel(5), '6TH');
assert.equal(mvpRound(1), false);
assert.equal(mvpRound(5), true);
assert.equal(mvpRound(10), true);
assert.equal(mvpRound(0), false);
console.log('raid stat board ok');
