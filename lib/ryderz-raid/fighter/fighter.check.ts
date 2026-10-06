import { comboDamageScale, comboStunScale } from './actions';
import { ComboManager, COMBO_WINDOW, matchRecipe, meleeWantsGrab, POWER_LINK_WINDOW, SHARED_COMBOS } from './combo';
import { hostStrikeDamage, nextHostStrike } from './hostStriker';
import { commandForKey } from './input';
import { CombatMemory } from './memory';
import { openingPlan } from './planner';
import { actionFor, combatProfileFor } from './profiles';
import { FighterStriker } from './striker';
import { choosePvpAction } from '../pvp/decide';
import { aiProfileFor, tuningFor } from '../pvp/aiProfile';

function assert(cond: unknown, message: string) {
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
assert(commandForKey('q', 'KeyQ', 1) === 'ability1', 'Q stays the first power');
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

const host = nextHostStrike({ chain: 1, dist: 1.4, foeStun: 0.2, rng: 0.1 });
assert(host.chain === 2 && host.kind === 'punch', 'a host continues a short chain');
const priced = hostStrikeDamage(20, 'punch', 1);
assert(priced.damage < 20 && priced.damage > 0, 'host punches chip their authored damage');

console.log('fighter combat ok');
