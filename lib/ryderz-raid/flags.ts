/**
 * RAID 2.0 feature flags.
 *
 * Every engine change that touches the renderer, physics, or controls ships
 * behind one of these so it can be switched off without a redeploy. A flag
 * that is off runs the code path the game shipped with before the overhaul.
 *
 * Sources, later wins:
 *   1. `DEFAULT_RAID_FLAGS`
 *   2. localStorage `ryderz.raid.flags`  ("cameraBvh,-sweptMove")
 *   3. URL `?raidflags=profiler,-cameraFollow`
 *
 * Tokens: `name` or `+name` turns a flag on, `-name` turns it off, `legacy`
 * turns every overhaul system off, `all` turns every one on.
 */

export interface RaidFlags {
  /** Camera and aim raycasts walk a bounding-volume tree instead of every triangle. */
  cameraBvh: boolean;
  /** Camera follow whose trailing distance and turn lag do not change with frame time. */
  cameraFollow: boolean;
  /** Jump presses are held briefly, and a jump still fires just after leaving a ledge. */
  jumpAssist: boolean;
  /** Fast moves are stepped so a body cannot cross a thin wall in one frame. */
  sweptMove: boolean;
  /** Frame-time overlay and section timers. Off by default. */
  profiler: boolean;
}

export type RaidFlagName = keyof RaidFlags;

export const DEFAULT_RAID_FLAGS: RaidFlags = {
  cameraBvh: true,
  cameraFollow: true,
  jumpAssist: true,
  sweptMove: true,
  profiler: false,
};

/** Flags that change how the game plays or draws. `legacy` switches these off; tooling flags are left alone. */
export const RAID_SYSTEM_FLAGS: RaidFlagName[] = ['cameraBvh', 'cameraFollow', 'jumpAssist', 'sweptMove'];

export const RAID_FLAGS_STORAGE_KEY = 'ryderz.raid.flags';

const NAMES = Object.keys(DEFAULT_RAID_FLAGS) as RaidFlagName[];
const BY_LOWER = new Map(NAMES.map((name) => [name.toLowerCase(), name]));

/** Apply a comma or space separated token list on top of `base`. Unknown tokens are ignored. */
export function applyRaidFlagTokens(base: RaidFlags, tokens: string | null | undefined): RaidFlags {
  const next = { ...base };
  if (!tokens) return next;
  for (const raw of tokens.split(/[\s,]+/)) {
    const token = raw.trim().toLowerCase();
    if (!token) continue;
    if (token === 'legacy') {
      for (const name of RAID_SYSTEM_FLAGS) next[name] = false;
      continue;
    }
    if (token === 'all') {
      for (const name of RAID_SYSTEM_FLAGS) next[name] = true;
      continue;
    }
    const off = token.startsWith('-') || token.startsWith('!');
    const name = BY_LOWER.get(token.replace(/^[-+!]/, ''));
    if (name) next[name] = !off;
  }
  return next;
}

export function resolveRaidFlags(stored?: string | null, search?: string | null): RaidFlags {
  let flags = applyRaidFlagTokens(DEFAULT_RAID_FLAGS, stored);
  if (search) {
    const query = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    flags = applyRaidFlagTokens(flags, query.get('raidflags'));
  }
  return flags;
}

/** Flags for this page load. Safe on the server, where it returns the defaults. */
export function readRaidFlags(): RaidFlags {
  if (typeof window === 'undefined') return { ...DEFAULT_RAID_FLAGS };
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(RAID_FLAGS_STORAGE_KEY);
  } catch {
    stored = null;
  }
  return resolveRaidFlags(stored, window.location?.search ?? '');
}

/** Token list that reproduces `flags` from the defaults. Empty when nothing differs. */
export function serializeRaidFlags(flags: RaidFlags) {
  return NAMES.filter((name) => flags[name] !== DEFAULT_RAID_FLAGS[name])
    .map((name) => (flags[name] ? name : `-${name}`))
    .join(',');
}

/** Persist one override for later page loads. Takes effect the next time a match engine is created. */
export function storeRaidFlag(name: RaidFlagName, value: boolean) {
  if (typeof window === 'undefined') return;
  try {
    const current = applyRaidFlagTokens(DEFAULT_RAID_FLAGS, window.localStorage.getItem(RAID_FLAGS_STORAGE_KEY));
    current[name] = value;
    const text = serializeRaidFlags(current);
    if (text) window.localStorage.setItem(RAID_FLAGS_STORAGE_KEY, text);
    else window.localStorage.removeItem(RAID_FLAGS_STORAGE_KEY);
  } catch {
    // Private browsing: the override simply does not persist.
  }
}
