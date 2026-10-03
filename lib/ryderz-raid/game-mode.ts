/**
 * Game modes. The engine stores the active mode so round composition, damage
 * rules and spawning can branch on it later; today only PvE has rules.
 */
export enum GameMode {
  PVE = 'pve',
  PVP = 'pvp',
}

export interface GameModeSpec {
  id: GameMode;
  name: string;
  tagline: string;
  description: string;
  /** False renders the mode as Coming Soon and refuses selection. */
  available: boolean;
}

export const GAME_MODES: GameModeSpec[] = [
  {
    id: GameMode.PVE,
    name: 'PvE · Raid',
    tagline: 'Hold the block',
    description:
      'Waves of mind-controlled hosts pour out of the alleys. Survive the rounds, bank Signal and buy strength at the spire.',
    available: true,
  },
  {
    id: GameMode.PVP,
    name: 'PvP · Ryder vs Ryder',
    tagline: 'Coming soon',
    description:
      'Ryderz turn on each other. Decks, aura and arenas all carry over; the host mob stays home.',
    available: false,
  },
];

export function gameModeSpec(id: GameMode): GameModeSpec {
  return GAME_MODES.find((mode) => mode.id === id) ?? GAME_MODES[0];
}
