/**
 * Combat reads these actions. Keyboard and pad mappings live here so the
 * engine never grows a new `if (key === 'f')` for each move.
 */
export type CombatCommand =
  | 'punch'
  | 'kick'
  | 'melee'
  | 'heavy'
  | 'launcher'
  | 'dodge'
  | 'jump'
  | 'ability1'
  | 'ability2'
  | 'ability3'
  | 'ability4'
  | 'ability5'
  | 'ability6';

/** Sprint held while a light strike is pressed turns it heavy. */
export function withSprintModifier(command: CombatCommand, sprinting: boolean): CombatCommand {
  if (!sprinting) return command;
  if (command === 'punch') return 'heavy';
  if (command === 'kick') return 'launcher';
  return command;
}

export const P1_BINDINGS: Record<'punch' | 'kick' | 'melee' | 'dodge' | 'jump', string[]> = {
  punch: ['c'],
  kick: ['v'],
  melee: ['f'],
  dodge: ['z'],
  jump: [' '],
};

export const P2_BINDINGS: Record<'punch' | 'kick' | 'melee' | 'dodge' | 'jump', string[]> = {
  punch: ['u'],
  kick: ['o'],
  melee: ['p'],
  dodge: ['n'],
  jump: ['m'],
};

/**
 * Face buttons follow a standard pad: Cross/A punch, Circle/B kick, Square/X melee.
 * LB dodges. RB / LT / RT are powers 1 / 2 / 3. D-pad up is the launcher, D-pad
 * down the heavy, D-pad left / right powers 4 and 5, R3 power 6.
 */
export const PAD_BUTTON: Record<CombatCommand, number> = {
  punch: 0,
  kick: 1,
  melee: 2,
  jump: 3,
  dodge: 4,
  ability1: 5,
  ability2: 6,
  ability3: 7,
  launcher: 12,
  heavy: 13,
  ability4: 14,
  ability5: 15,
  ability6: 11,
};

export const ABILITY_COMMANDS: CombatCommand[] = ['ability1', 'ability2', 'ability3', 'ability4', 'ability5', 'ability6'];

/** Number-row keys 1–6 fire the six power slots. Index is the slot. */
export const ABILITY_KEYS = ['1', '2', '3', '4', '5', '6'];

/** Slot index for an ability command, or -1. */
export function abilitySlotOf(command: CombatCommand | null): number {
  return command ? ABILITY_COMMANDS.indexOf(command) : -1;
}

/** Tab opens the raid map. M does too, except in local versus where M is player 2's jump. */
export function isMapKey(key: string, code: string, localTwoPlayer: boolean) {
  if (code === 'Tab') return true;
  if (localTwoPlayer) return false;
  return key.toLowerCase() === 'm';
}

export function commandForKey(key: string, code: string, player: 1 | 2): CombatCommand | null {
  const lower = key.toLowerCase();
  if (player === 1) {
    if (P1_BINDINGS.punch.includes(lower)) return 'punch';
    if (P1_BINDINGS.kick.includes(lower)) return 'kick';
    if (P1_BINDINGS.melee.includes(lower)) return 'melee';
    if (P1_BINDINGS.dodge.includes(lower)) return 'dodge';
    if (P1_BINDINGS.jump.includes(lower) || code === 'Space') return 'jump';
    const slot = ABILITY_KEYS.indexOf(lower);
    if (slot >= 0) return ABILITY_COMMANDS[slot];
    return null;
  }
  if (P2_BINDINGS.punch.includes(lower)) return 'punch';
  if (P2_BINDINGS.kick.includes(lower)) return 'kick';
  if (P2_BINDINGS.melee.includes(lower)) return 'melee';
  if (P2_BINDINGS.dodge.includes(lower)) return 'dodge';
  if (P2_BINDINGS.jump.includes(lower)) return 'jump';
  return null;
}

export function risingPadCommands(buttons: readonly boolean[], prev: boolean[]): CombatCommand[] {
  const commands: CombatCommand[] = [];
  (Object.keys(PAD_BUTTON) as CombatCommand[]).forEach((command) => {
    const index = PAD_BUTTON[command];
    const down = Boolean(buttons[index]);
    if (down && !prev[index]) commands.push(command);
    prev[index] = down;
  });
  return commands;
}
