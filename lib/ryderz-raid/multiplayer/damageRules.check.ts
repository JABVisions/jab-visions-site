import { GameMode } from '../game-mode';
import { canDamage } from './damageRules';
import { isFriendly, npcIdentity, type CombatIdentity } from './teamUtils';

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

const p1: CombatIdentity = { faction: 'player', playerId: 'player-1', team: 'raiders', partyId: 'party-a' };
const p2: CombatIdentity = { faction: 'player', playerId: 'player-2', team: 'raiders', partyId: 'party-a' };
const foe: CombatIdentity = { faction: 'player', playerId: 'player-2', team: 'opposing', partyId: 'party-b' };
const npc = npcIdentity();

assert(!canDamage(p1, p1, GameMode.SOLO), 'cannot damage self');
assert(canDamage(p1, npc, GameMode.SOLO), 'solo can damage NPCs');
assert(!isFriendly(p1, npc, GameMode.SOLO), 'NPCs are not friendly');
assert(!canDamage(p1, p2, GameMode.RAID), 'raid friendly fire off');
assert(isFriendly(p1, p2, GameMode.RAID), 'raid party is friendly');
assert(canDamage(p1, foe, GameMode.PVP), 'pvp players can damage each other');
assert(!isFriendly(p1, foe, GameMode.PVP), 'pvp players are not friendly');

console.log('multiplayer damage rules ok');
