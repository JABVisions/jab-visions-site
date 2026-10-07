/**
 * Combat reads these actions. Keyboard and pad mappings live here so the
 * engine never grows a new `if (key === 'f')` for each move.
 */
export type CombatCommand = 'punch' | 'kick' | 'melee' | 'dodge' | 'jump' | 'ability1' | 'ability2' | 'ability3';

export const P1_BINDINGS: Record<Exclude<CombatCommand, 'ability1' | 'ability2' | 'ability3'>, string[]> = {
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
 * LB dodges. RB / LT / RT are Q / E / R.
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
};

export function commandForKey(key: string, code: string, player: 1 | 2): CombatCommand | null {
  const lower = key.toLowerCase();
  if (player === 1) {
    if (P1_BINDINGS.punch.includes(lower)) return 'punch';
    if (P1_BINDINGS.kick.includes(lower)) return 'kick';
    if (P1_BINDINGS.melee.includes(lower)) return 'melee';
    if (P1_BINDINGS.dodge.includes(lower)) return 'dodge';
    if (P1_BINDINGS.jump.includes(lower) || code === 'Space') return 'jump';
    if (lower === 'q' || lower === '1') return 'ability1';
    if (lower === 'e' || lower === '2') return 'ability2';
    if (lower === 'r' || lower === '3') return 'ability3';
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
