import assert from 'node:assert/strict';
import { GameMode } from '../game-mode';
import {
  canConfirmFighter,
  charactersInCategory,
  lineupFormation,
  lineupFrame,
  lineupGap,
  premiereCategory,
  premiereRoster,
} from './premiere';

const roster = premiereRoster();
const names = (category: 'ryderz' | 'boomerz' | 'jab-visions') =>
  charactersInCategory(roster, category).map((character) => character.name);

const ryderz = names('ryderz');
for (const name of ['Keven Hart', 'Leo Montana', 'Aaron Addams', 'Zoe Folie', 'Rubi Wong', 'Lilly James', 'Baxter Banks', 'Ester Maxin', 'TJ']) {
  assert.ok(ryderz.includes(name), `${name} belongs on the Ryderz tab`);
}
assert.deepEqual(names('boomerz'), ['Marilyn Monroe', 'Martin Luther King Jr.']);
assert.ok(names('jab-visions').includes('Kid Paranormal'));
assert.ok(names('jab-visions').includes('Agent Yesterday-Nyx'));
assert.ok(names('jab-visions').includes('Marywantis'));
assert.equal(ryderz.includes('Marywantis'), false);
assert.equal(names('boomerz').some((name) => ryderz.includes(name)), false);

const baxter = roster.find((character) => character.id === 'baxter');
const rubi = roster.find((character) => character.id === 'rubi');
const marilyn = roster.find((character) => character.id === 'marilyn-monroe');
assert.ok(baxter && !canConfirmFighter(baxter, GameMode.SOLO));
assert.ok(baxter && !baxter.playable && baxter.modelPath === '');
assert.ok(rubi && canConfirmFighter(rubi, GameMode.RAID) && rubi.modelPath.includes('rubi-wong.glb'));
assert.ok(marilyn && marilyn.abilities.e === "Let's Be Bad" && marilyn.abilities.q === 'Showtime' && marilyn.abilities.r === 'Abracadabra');
assert.equal(premiereCategory(marilyn), 'boomerz');
const mary = roster.find((character) => character.id === 'marywantis');
assert.equal(premiereCategory(mary!), 'jab-visions');
assert.equal(mary?.universe, 'JAB Visions Universe');

const six = lineupFormation(6, 1.2);
assert.equal(six.length, 6);
assert.equal(new Set(six.map((slot) => slot.row)).size, 1);
assert.ok(six.every((slot, index) => index === 0 || slot.x > six[index - 1].x));

const seven = lineupFormation(7, 1.2);
assert.equal(seven.length, 7);
assert.equal(new Set(seven.map((slot) => slot.row)).size, 2);
const front = seven.filter((slot) => slot.row === 1);
const back = seven.filter((slot) => slot.row === 0);
assert.ok(front.every((slot) => !back.some((other) => Math.abs(other.x - slot.x) < 0.2)));

assert.ok(lineupGap([0.4, 0.5]) >= 0.95);
assert.ok(lineupGap([1.4, 0.8]) > lineupGap([0.7]));

const frame = lineupFrame(seven, 16 / 9);
assert.ok(frame.z > Math.max(...seven.map((slot) => slot.z)), 'the camera sits in front of every fighter');
assert.ok(frame.y > 1);

console.log('premiere select ok');
