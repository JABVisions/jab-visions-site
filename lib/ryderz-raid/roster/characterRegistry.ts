import { RYDERZ, RYDER_ORDER, type RyderId, type RyderSpec } from '../config';
import { GameMode } from '../game-mode';
import { aiProfileFor, DEFAULT_AI_PROFILE, type AiProfile } from '../pvp/aiProfile';
import { combatProfileFor, DEFAULT_COMBAT_PROFILE, type CombatProfile } from '../fighter/profiles';

/**
 * One roster for Solo, PvP, and Raid. Screens map this list; they do not
 * branch on Keven / Leo / Aaron / Zoe / Rubi.
 *
 * Add a playable Ryder by adding a `RyderSpec` in `config.ts` — it is picked
 * up here automatically.
 * Reserve a future name by appending a locked entry to `FUTURE_CHARACTERS`.
 * A locked entry is visible in PvP and Raid grids and cannot be dropped in
 * until it has a model, kit, and `playable: true`.
 */
export type CharacterCategory = 'ryder' | 'villain' | 'support' | 'jab-visions' | 'guest';

export const ROSTER_FILTERS = ['all', 'ryder', 'villain', 'jab-visions', 'guest'] as const;
export type RosterFilter = (typeof ROSTER_FILTERS)[number];

export interface RaidCharacter {
  id: string;
  /** Set only when this entry can drive the current combat engine. */
  ryderId: RyderId | null;
  name: string;
  universe: string;
  category: CharacterCategory;
  portrait: string;
  modelPath: string;
  primaryColor: string;
  secondaryColor?: string;
  maxHealth: number;
  maxAura: number;
  abilities: { q: string; e: string; r: string };
  availableInSolo: boolean;
  availableInPvp: boolean;
  availableInRaid: boolean;
  unlocked: boolean;
  playable: boolean;
  /** How a CPU copy of this character fights. Omitted entries use the default profile. */
  aiProfile: AiProfile;
  /** Punch, kick, melee, combos, and the power that a chain can unlock. */
  combatProfile: CombatProfile;
}

const FUTURE_CHARACTERS: RaidCharacter[] = [
  stub('baxter', 'Baxter', 'ryder', true),
  stub('tj', 'TJ', 'villain', false),
  stub('lilly', 'Lilly', 'ryder', true),
  stub('ester', 'Ester', 'support', false),
];

function stub(id: string, name: string, category: CharacterCategory, solo: boolean): RaidCharacter {
  return {
    id,
    ryderId: null,
    name,
    universe: 'Those Ryderz',
    category,
    portrait: '',
    modelPath: '',
    primaryColor: '#39ff6a',
    maxHealth: 100,
    maxAura: 100,
    abilities: { q: '—', e: '—', r: '—' },
    availableInSolo: solo,
    availableInPvp: true,
    availableInRaid: true,
    unlocked: false,
    playable: false,
    aiProfile: DEFAULT_AI_PROFILE,
    combatProfile: DEFAULT_COMBAT_PROFILE,
  };
}

function fromSpec(spec: RyderSpec): RaidCharacter {
  const [q, e, r] = spec.moves;
  return {
    id: spec.id,
    ryderId: spec.id,
    name: spec.name,
    universe: 'Those Ryderz',
    category: 'ryder',
    portrait: spec.icon || spec.portrait,
    modelPath: spec.glb ?? '',
    primaryColor: spec.colorHex,
    secondaryColor: `#${spec.accent.toString(16).padStart(6, '0')}`,
    maxHealth: spec.maxHp,
    maxAura: spec.maxAura,
    abilities: { q: q.name, e: e.name, r: r.name },
    availableInSolo: true,
    availableInPvp: true,
    availableInRaid: true,
    unlocked: true,
    playable: true,
    aiProfile: aiProfileFor(spec.id),
    combatProfile: combatProfileFor(spec.id),
  };
}

export function characterRegistry(): RaidCharacter[] {
  return [...RYDER_ORDER.map((id) => fromSpec(RYDERZ[id])), ...FUTURE_CHARACTERS];
}

export function charactersForMode(mode: GameMode): RaidCharacter[] {
  return characterRegistry().filter((character) => {
    if (mode === GameMode.SOLO) return character.availableInSolo;
    if (mode === GameMode.PVP) return character.availableInPvp;
    return character.availableInRaid;
  });
}

export function playableCharacters(mode: GameMode): RaidCharacter[] {
  return charactersForMode(mode).filter((character) => character.playable && character.unlocked && character.ryderId);
}

export function filterRoster(characters: RaidCharacter[], filter: RosterFilter): RaidCharacter[] {
  if (filter === 'all') return characters;
  if (filter === 'jab-visions') return characters.filter((character) => character.universe !== 'Those Ryderz' || character.category === 'jab-visions');
  if (filter === 'guest') return characters.filter((character) => character.category === 'guest');
  if (filter === 'villain') return characters.filter((character) => character.category === 'villain');
  return characters.filter((character) => character.category === 'ryder' || character.category === 'support');
}
