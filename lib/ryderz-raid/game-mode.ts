/**
 * Session modes. Solo, PvP, and Raid are separate flows that share characters,
 * models, and combat utilities. Networking is a later step.
 *
 * Older saves stored `pve` — hydrate maps that onto Solo.
 */
export enum GameMode {
  SOLO = 'solo',
  PVP = 'pvp',
  RAID = 'raid',
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
    id: GameMode.SOLO,
    name: 'Solo',
    tagline: 'Single-player experience',
    description: 'Play the story and open-world combat alone. Choose your Ryder and enter the arena.',
    available: true,
  },
  {
    id: GameMode.PVP,
    name: 'PvP',
    tagline: 'Ryderz fighting each other',
    description: 'Competitive Ryder-vs-Ryder combat. Other players are opponents, not allies.',
    available: true,
  },
  {
    id: GameMode.RAID,
    name: 'Raid',
    tagline: 'Cooperative squad versus civilians',
    description:
      'Four allied Ryderz, you plus computer teammates, against civilian waves. Friends can replace a computer slot. Friendly fire is off.',
    available: true,
  },
];

export function coerceGameMode(value: unknown): GameMode {
  if (value === 'pve' || value === GameMode.SOLO) return GameMode.SOLO;
  if (value === GameMode.PVP) return GameMode.PVP;
  if (value === GameMode.RAID) return GameMode.RAID;
  return GameMode.SOLO;
}

export function gameModeSpec(id: GameMode | string): GameModeSpec {
  const mode = coerceGameMode(id);
  return GAME_MODES.find((entry) => entry.id === mode) ?? GAME_MODES[0];
}
