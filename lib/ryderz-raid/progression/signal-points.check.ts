import assert from 'node:assert/strict';
import {
  SP_REWARDS,
  SignalBank,
  availableSignal,
  levelForSignal,
  levelProgress,
  signalForKill,
  signalForRound,
  type SignalEvent,
} from './signal-points';

// The reward table from the brief.
assert.equal(SP_REWARDS.civilian, 10);
assert.equal(SP_REWARDS.finisher, 25);
assert.equal(SP_REWARDS.elite, 75);
assert.equal(SP_REWARDS.round, 100);
assert.equal(SP_REWARDS.revive, 50);
assert.equal(SP_REWARDS.milestone, 500);

assert.equal(signalForKill(1), 10);
assert.equal(signalForKill(3), 10);
assert.equal(signalForKill(4), 75, 'tier 4 is an elite');
assert.equal(signalForKill(5), 75);
assert.equal(signalForKill(2, true), SP_REWARDS.boss, 'a boss pays the boss line regardless of tier');
assert.equal(signalForRound(1), 100);
assert.equal(signalForRound(9), 100);
assert.equal(signalForRound(10), 600, 'round ten carries the survival bonus');
assert.equal(signalForRound(20), 600);
assert.equal(signalForRound(25), 100);

assert.equal(availableSignal({ earned: 1000, spent: 250 }), 750);
assert.equal(availableSignal({ earned: 100, spent: 400 }), 0, 'available never goes negative');
assert.equal(availableSignal({ earned: 99.9, spent: 0.5 }), 99, 'fractions floor');
assert.equal(levelForSignal(0), 1);
assert.equal(levelForSignal(149), 1);
assert.equal(levelForSignal(150), 2);
assert.equal(levelForSignal(600), 3);
const mid = levelProgress(300);
assert.equal(mid.level, 2);
assert.equal(mid.next, 600);
assert.ok(mid.progress > 0.3 && mid.progress < 0.4, 'progress sits a third of the way to level 3');
assert.equal(levelProgress(0).progress, 0);

// --- Bank: dedupe and per-seat accounting ---------------------------------

const bank = new SignalBank();
const events: SignalEvent[] = [];
const unsubscribe = bank.subscribe((event) => events.push(event));

const civ = {};
const elite = {};
const boss = {};
assert.equal(bank.kill(civ, 1, false, false, 1, 0), 10);
assert.equal(bank.kill(civ, 1, false, false, 1, 0), 0, 'a body that dies twice is paid once');
assert.equal(bank.kill(civ, 1, false, true, 1, 0), 0, 'even when the second death is a finisher');
assert.equal(bank.kill(elite, 4, false, true, 1, 0), 75 + 25, 'an elite finisher pays both lines');
assert.equal(bank.kill(boss, 6, true, false, 1, 1), SP_REWARDS.boss, 'the boss pays seat 1');
assert.equal(bank.earned, 10 + 100 + SP_REWARDS.boss);
assert.equal(bank.bySeat.get(0), 110);
assert.equal(bank.bySeat.get(1), SP_REWARDS.boss);
assert.equal(bank.tally.kill, 3);
assert.equal(bank.tally.finisher, 1);

assert.equal(bank.roundClear(1, 0), 100);
assert.equal(bank.roundClear(1, 0), 0, 'a round pays a seat once');
assert.equal(bank.roundClear(1, 1), 100, 'but every seat in a raid is paid');
assert.equal(bank.roundClear(1, 1), 0);
assert.equal(bank.roundClear(10, 0), 600, 'round ten pays the milestone');
assert.equal(bank.tally.round, 3);
assert.equal(bank.tally.milestone, 1);

assert.equal(bank.revive('seat:2', 3, 0), 50);
assert.equal(bank.revive('seat:2', 3, 1), 0, 'the same patient in the same round pays nobody twice');
assert.equal(bank.revive('seat:2', 4, 1), 50, 'a new round opens the revive bonus again');
assert.equal(bank.revive('seat:3', 4, 1), 50, 'a different patient pays');

const roundBefore = bank.earnedRound;
bank.beginRound();
assert.equal(bank.earnedRound, 0, 'a new round clears the per-round counter');
assert.ok(bank.earned >= roundBefore, 'lifetime totals keep going');
assert.equal(
  events.reduce((sum, event) => sum + event.amount, 0),
  bank.earned,
  'every paid point reached a subscriber',
);
assert.ok(events.every((event) => event.amount > 0 && Number.isInteger(event.amount)), 'events are positive integers');

unsubscribe();
const before = events.length;
bank.kill({}, 1, false, false, 11, 0);
assert.equal(events.length, before, 'an unsubscribed listener hears nothing');

bank.reset();
assert.equal(bank.earned, 0);
assert.equal(bank.bySeat.size, 0);
assert.equal(bank.kill(civ, 1, false, false, 1, 0), 10, 'a reset bank may pay a body again (new match)');
assert.equal(bank.roundClear(1, 0), 100, 'and rounds again');

console.log('signal points ok');
