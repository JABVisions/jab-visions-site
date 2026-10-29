export const LEADERBOARD_NAME_KEY = 'ryderz-raid:leaderboard-name';

export function sanitizeLeaderboardName(value: string) {
  return value.replace(/[<>\u0000-\u001f\u007f]/g, '').trim().replace(/\s+/g, ' ').slice(0, 16);
}

export function readLeaderboardName(fallback = 'Ryder Guest') {
  if (typeof window === 'undefined') return fallback;
  try {
    const saved = sanitizeLeaderboardName(window.localStorage.getItem(LEADERBOARD_NAME_KEY) ?? '');
    return saved.length >= 2 ? saved : fallback;
  } catch {
    return fallback;
  }
}

export function leaderboardScore(wave: number, kills: number, damage: number, difficulty: string) {
  const multiplier = { easy: 1, normal: 1.15, hard: 1.3, nightmare: 1.5 }[difficulty.toLowerCase() as 'easy' | 'normal' | 'hard' | 'nightmare'] ?? 1;
  return Math.floor((wave * 1_000_000_000 + kills * 1_000 + Math.min(damage, 999_999)) * multiplier);
}
