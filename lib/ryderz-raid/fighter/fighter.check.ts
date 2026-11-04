import { AERIAL, FINISHER, HEAVY, LAUNCHER, comboDamageScale, comboStunScale, heavyVariant, isKnockedDown } from './actions';
import { ComboManager, COMBO_WINDOW, matchRecipe, meleeWantsGrab, POWER_LINK_WINDOW, SHARED_COMBOS, type ComboRecipe } from './combo';
import { hostStrikeDamage, nextHostStrike } from './hostStriker';
import { commandForKey, isMapKey } from './input';
import { CombatMemory } from './memory';
import { openingPlan } from './planner';
import { actionFor, combatProfileFor } from './profiles';
import { FighterStriker, targetsInStrike, type StrikeTarget, type StrikerContext } from './striker';
import { choosePvpAction } from '../pvp/decide';
import { aiProfileFor, tuningFor } from '../pvp/aiProfile';

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

const breaker = matchRecipe(['punch', 'punch', 'kick'], SHARED_COMBOS);
assert(breaker?.id === 'breaker', 'punch punch kick is the breaker');
assert(matchRecipe(['punch', 'punch'], SHARED_COMBOS)?.id === 'jabs', 'two punches stay the jab chain');
assert(matchRecipe(['punch', 'kick', 'melee'], SHARED_COMBOS)?.effect === 'powerLink', 'punch kick melee opens a power link');
assert(matchRecipe(['kick', 'melee'], SHARED_COMBOS)?.effect === 'grabOpportunity', 'kick melee wants a grab');
assert(!meleeWantsGrab(['punch', 'punch'], 1.1, false), 'a weapon finisher is not a grab');
assert(meleeWantsGrab(['kick'], 1.6, false), 'kick then melee grabs');
assert(meleeWantsGrab([], 1.1, false), 'point-blank melee grabs');
assert(!meleeWantsGrab([], 2.4, false), 'a far melee does not grab');

assert(comboDamageScale(1) === 1, 'first hit is full');
assert(Math.abs(comboDamageScale(3) - 0.9) < 1e-6, 'third hit scales');
assert(comboDamageScale(20) === 0.62, 'scaling floors');
assert(comboStunScale(8) < comboStunScale(1), 'long chains stun less');

const chain = new ComboManager();
const foe = {};
const other = {};
let snap = chain.land('punch', 1, foe);
snap = chain.land('punch', 1.4, foe);
snap = chain.land('kick', 1.9, foe);
assert(snap.count === 3 && snap.recipeId === 'breaker' && snap.effect === 'heavyKnockback', 'chain resolves the breaker');
assert(snap.powerReady === false, 'breaker does not open a power link by itself');
const linker = new ComboManager();
linker.land('punch', 2, foe);
linker.land('kick', 2.3, foe);
const linked = linker.land('melee', 2.6, foe);
assert(linked.powerReady && linked.effect === 'powerLink', 'the power-link recipe arms the window');
assert(linker.consumePower(2.7) === true, 'using the link spends it');
assert(linker.powerReady(2.8) === false, 'a spent link is gone');
const fifth = new ComboManager();
for (let i = 0; i < 5; i += 1) fifth.land(i % 2 === 0 ? 'punch' : 'kick', i * 0.3, foe);
assert(fifth.snapshot(1.2).tier === 'power', 'five hits reach the power tier');
assert(fifth.powerReady(1.2), 'five hits arm a power link');
assert(!fifth.powerReady(1.2 + POWER_LINK_WINDOW + 0.05), 'the link expires');
const dropped = chain.land('punch', 20, other);
assert(dropped.count === 1, 'a new target starts a new chain');
chain.land('punch', 21, foe);
chain.expire(21 + COMBO_WINDOW + 0.05);
assert(chain.snapshot(21 + COMBO_WINDOW + 0.05).count === 0, 'a late window clears the counter');

const striker = new FighterStriker();
striker.setRyder('rubi');
const dummy = { ref: foe, x: 0.2, z: 1.2, radius: 0.45, airborne: false };
striker.queue('punch');
let frame = striker.tick(0.02, { time: 0, stunned: false, locked: false, facing: 0, x: 0, z: 0, meleeDamage: 26, targets: [dummy] });
assert(frame.started && frame.hits.length === 0, 'punch has startup');
frame = striker.tick(0.08, { time: 0.1, stunned: false, locked: false, facing: 0, x: 0, z: 0, meleeDamage: 26, targets: [dummy] });
assert(frame.hits.length === 1, 'punch connects in range');
assert(frame.hits[0].damage < 26, 'a punch is lighter than a full melee');
const far = { ref: other, x: 12, z: 0, radius: 0.45, airborne: false };
const kicker = new FighterStriker();
kicker.setRyder('leo');
kicker.queue('kick');
kicker.tick(0.02, { time: 0, stunned: false, locked: false, facing: 0, x: 0, z: 0, meleeDamage: 32, targets: [far] });
kicker.tick(0.2, { time: 0.2, stunned: false, locked: false, facing: 0, x: 0, z: 0, meleeDamage: 32, targets: [far] });
frame = kicker.tick(0.12, { time: 0.32, stunned: false, locked: false, facing: 0, x: 0, z: 0, meleeDamage: 32, targets: [far] });
assert(frame.hits.length === 0, 'a kick does not hit from across the block');
assert(kicker.exposed, 'a missed kick is punishable');

assert(actionFor('punch', 'leo').recovery < actionFor('punch', 'aaron').recovery, 'leo punches recover faster');
assert(combatProfileFor('aaron').melee.label === 'Axe', 'aaron melee is the axe');
assert(combatProfileFor('rubi').melee.label === 'Blade', 'rubi melee is the blade');
assert(combatProfileFor('keven').powerLink.abilityId === 'dartStorm', 'keven links into dart storm');
assert(combatProfileFor(null).melee.label === 'Melee', 'unknown fighters inherit the default');
assert(commandForKey('c', 'KeyC', 1) === 'punch', 'C punches');
assert(commandForKey('v', 'KeyV', 1) === 'kick', 'V kicks');
assert(commandForKey('f', 'KeyF', 1) === 'melee', 'F stays melee');
assert(commandForKey(' ', 'Space', 1) === 'jump', 'Space jumps');
assert(commandForKey('m', 'KeyM', 2) === 'jump', 'player 2 jumps with M');
assert(commandForKey('m', 'KeyM', 1) === null, 'M does not jump for player 1');
assert(isMapKey('m', 'KeyM', false), 'M opens the map when player 2 is not on this keyboard');
assert(isMapKey('Tab', 'Tab', true), 'Tab opens the map in local versus');
assert(!isMapKey('m', 'KeyM', true), 'local versus keeps M as player 2 jump');
assert(commandForKey('1', 'Digit1', 1) === 'ability1', '1 is the first power');
assert(commandForKey('6', 'Digit6', 1) === 'ability6', '6 is the sixth power');
assert(commandForKey('q', 'KeyQ', 1) === null, 'Q no longer fires a power');
assert(commandForKey('e', 'KeyE', 1) === null, 'E no longer fires a power');
assert(commandForKey('r', 'KeyR', 1) === null, 'R no longer fires a power');
assert(commandForKey('u', 'KeyU', 2) === 'punch', 'player 2 punches with U');
assert(commandForKey('u', 'KeyU', 1) === null, 'U does not punch for player 1');

const memory = new CombatMemory();
memory.note('punch', 1);
memory.note('punch', 1.2);
memory.note('punch', 1.4);
memory.note('dodge', 1.6);
const rates = memory.rates(2);
assert(rates.punch > rates.dodge, 'repeated punches dominate the recent tally');

const leo = aiProfileFor('leo');
const plan = openingPlan(leo, true, () => 0.1);
assert(plan && plan.length >= 2, 'an aggressive ryder commits to a chain');
assert(openingPlan(leo, false, () => 0.1) === null, 'a hurt ryder does not start a reckless chain');

const tuning = tuningFor('normal');
const quiet = () => 0.99;
const punchPick = choosePvpAction(
  {
    dist: 1.5,
    selfHp: 1,
    foeHp: 1,
    aura: 1,
    burnout: false,
    foeAttacking: false,
    foeRetreating: false,
    foeClosing: false,
    slots: [],
    nextStrike: 'punch',
  },
  leo,
  tuning,
  quiet,
);
assert(punchPick.intent === 'punch', 'a committed punch beats wandering');

const hands = choosePvpAction(
  {
    dist: 1.6,
    selfHp: 0.9,
    foeHp: 0.9,
    aura: 0.8,
    burnout: false,
    foeAttacking: false,
    foeRetreating: false,
    foeClosing: false,
    slots: [{ band: 'close', affordable: true, cooling: false, ultimate: false, active: false }],
  },
  leo,
  tuning,
  quiet,
);
assert(hands.intent === 'punch' || hands.intent === 'kick' || hands.intent === 'melee', 'fists win at point-blank until a power is earned');
const linkedPick = choosePvpAction(
  {
    dist: 1.6,
    selfHp: 0.9,
    foeHp: 0.9,
    aura: 0.8,
    burnout: false,
    foeAttacking: false,
    foeRetreating: false,
    foeClosing: false,
    powerLink: true,
    slots: [{ band: 'close', affordable: true, cooling: false, ultimate: false, active: false }],
  },
  leo,
  tuning,
  quiet,
);
assert(linkedPick.intent === 'ability', 'a power link spends the power at the end of the chain');

const farPick = choosePvpAction(
  {
    dist: 14,
    selfHp: 1,
    foeHp: 1,
    aura: 0.2,
    burnout: false,
    foeAttacking: false,
    foeRetreating: false,
    foeClosing: false,
    slots: [],
  },
  leo,
  tuning,
  quiet,
);
assert(farPick.intent === 'chase', 'a far ryder chases instead of swinging');

const evadePick = choosePvpAction(
  {
    dist: 2,
    selfHp: 0.8,
    foeHp: 0.8,
    aura: 0.4,
    burnout: false,
    foeAttacking: true,
    foeRetreating: false,
    foeClosing: true,
    slots: [],
    memory: { punch: 0.85, kick: 0, melee: 0, ability: 0, dodge: 0, retreat: 0 },
  },
  aiProfileFor('keven'),
  tuning,
  quiet,
);
assert(evadePick.intent === 'evade' || evadePick.intent === 'retreat', 'punch spam pushes an evasive ryder off the line');

// --- Combat Evolution strikes ----------------------------------------------

const ctx = (time: number, targets: StrikeTarget[], extra: Partial<StrikerContext> = {}): StrikerContext => ({
  time,
  stunned: false,
  locked: false,
  facing: 0,
  x: 0,
  z: 0,
  meleeDamage: 20,
  targets,
  ...extra,
});
const run = (s: FighterStriker, targets: StrikeTarget[], extra: Partial<StrikerContext> = {}) => {
  // Step through startup and active frames; return the first frame that connects.
  let t = 0;
  for (let i = 0; i < 40; i += 1) {
    const f = s.tick(0.02, ctx(t, targets, extra));
    t += 0.02;
    if (f.hits.length) return f;
  }
  return null;
};

assert(heavyVariant('punch') === 'heavy' && heavyVariant('kick') === 'launcher' && heavyVariant('melee') === 'melee', 'sprint upgrades light strikes');
assert(HEAVY.sweepWidth && HEAVY.sweepWidth > 0, 'the heavy sweeps');
assert(LAUNCHER.reaction === 'launch' && (LAUNCHER.juggle ?? 0) > 1, 'the launcher pops bodies up');
assert(AERIAL.halfArc >= Math.PI - 1e-9, 'the aerial lands all around');
assert(FINISHER.damageMul >= 2, 'finishers hit twice as hard as a melee');

// Heavy: a wide swing lands on the whole front row, and the swept path catches a body beside the fist.
const row = [
  { ref: {}, x: 0.3, z: 1.6, radius: 0.45, airborne: false },
  { ref: {}, x: -0.9, z: 1.4, radius: 0.45, airborne: false },
  { ref: {}, x: 1.0, z: 1.9, radius: 0.45, airborne: false },
  { ref: {}, x: 0, z: 6, radius: 0.45, airborne: false },
];
const heavy = new FighterStriker();
heavy.setRyder('leo');
heavy.queue('heavy');
const heavyHit = run(heavy, row);
assert(heavyHit && heavyHit.kind === null && heavyHit.hits.length === 3, `the heavy sweeps three bodies, not ${heavyHit?.hits.length}`);
assert(heavyHit.hits.every((h) => h.kind === 'heavy'), 'hits are tagged heavy');
assert(heavyHit.hits.filter((h) => h.primary).length === 1, 'exactly one primary target');
assert(heavyHit.hits[0].damage > 20 * 1.3, 'the heavy multiplies melee damage');
const swept = targetsInStrike([{ ref: {}, x: 1.6, z: 0.3, radius: 0.45, airborne: false }], 0, 0.55, 0, HEAVY, 0, 0);
assert(swept.length === 0, 'a body off the arc and off the path is missed');
const sweptPath = targetsInStrike([{ ref: {}, x: 0.9, z: 0.3, radius: 0.45, airborne: false }], 0, 2.4, 0, HEAVY, 0, 0);
assert(sweptPath.length === 1, 'the fist path catches a body beside the lunge');

// Launcher: hits in front, launches, and the following punch juggles.
const single = [{ ref: {}, x: 0, z: 1.4, radius: 0.45, airborne: false }];
const launcher = new FighterStriker();
launcher.setRyder('rubi');
launcher.queue('launcher');
const launched = run(launcher, single);
assert(launched && launched.hits[0].kind === 'launcher' && launched.hits[0].reaction === 'launch', 'the launcher launches');
assert(launched.hits[0].juggle === 0, 'a grounded body takes no juggle lift on the launch itself');
single[0] = { ...single[0], airborne: true };
launcher.queue('punch');
const juggle = run(launcher, single);
assert(juggle && juggle.hits[0].juggle > 0, 'a punch on an airborne body juggles it');
assert(juggle.hits[0].combo.count === 2, 'the juggle continues the chain');

// Aerial: any strike thrown while airborne becomes an aerial slam.
const aerial = new FighterStriker();
aerial.setRyder('keven');
aerial.queue('kick');
const slam = run(aerial, row, { airborne: true });
assert(slam && slam.hits.every((h) => h.kind === 'aerial'), 'airborne kick is an aerial');
assert(slam.hits.length >= 3, 'the aerial comes down on the crowd');

// Finisher: melee over a downed body in reach is a finisher; over a standing one it is a melee or grab.
const downed = [{ ref: {}, x: 0, z: 1.2, radius: 0.45, airborne: false, downed: true }];
const finisher = new FighterStriker();
finisher.setRyder('aaron');
finisher.queue('melee');
const finished = run(finisher, downed);
assert(finished && finished.hits[0].kind === 'finisher', 'melee on a downed host finishes');
assert(finished.hits[0].damage >= 20 * 2 * 0.99, 'the finisher doubles melee damage');
assert(isKnockedDown({ airY: 0, stagger: 0.8, held: 0 }), 'a staggered body on the floor is down');
assert(!isKnockedDown({ airY: 1.2, stagger: 0.8 }), 'an airborne body is not down');
assert(!isKnockedDown({ airY: 0, stagger: 0.1 }), 'a recovered body is not down');

// Progression scale and tree recipes flow through the striker.
const scaled = new FighterStriker();
scaled.setRyder('leo');
scaled.queue('punch');
const plain = run(scaled, [{ ref: {}, x: 0, z: 1.2, radius: 0.45, airborne: false }]);
const boosted = new FighterStriker();
boosted.setRyder('leo');
boosted.queue('punch');
const scaledHit = run(boosted, [{ ref: {}, x: 0, z: 1.2, radius: 0.45, airborne: false }], { damageScale: 1.25 });
assert(plain && scaledHit && Math.abs(scaledHit.hits[0].damage / plain.hits[0].damage - 1.25) < 1e-6, 'damageScale multiplies strikes');
const treeRecipe: ComboRecipe = { id: 'test-chain', sequence: ['launcher', 'punch'], effect: 'juggle', label: 'TEST' };
const recipes = new ComboManager();
recipes.setWindowScale(1.3);
assert(Math.abs(recipes.window - COMBO_WINDOW * 1.3) < 1e-9, 'the combo window scales with the tree');
const custom = new FighterStriker();
custom.setRyder('leo');
custom.setExtraRecipes([treeRecipe]);
custom.queue('launcher');
const t1 = run(custom, [{ ref: single[0].ref, x: 0, z: 1.4, radius: 0.45, airborne: false }]);
custom.queue('punch');
const t2 = run(custom, [{ ref: single[0].ref, x: 0, z: 1.4, radius: 0.45, airborne: true }]);
assert(t1 && t2 && t2.hits[0].combo.recipeId === 'test-chain', 'a tree recipe resolves inside the striker');

const host = nextHostStrike({ chain: 1, dist: 1.4, foeStun: 0.2, rng: 0.1 });
assert(host.chain === 2 && host.kind === 'punch', 'a host continues a short chain');
const priced = hostStrikeDamage(20, 'punch', 1);
assert(priced.damage < 20 && priced.damage > 0, 'host punches chip their authored damage');

console.log('fighter combat ok');
