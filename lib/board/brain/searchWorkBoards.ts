import { DEFAULT_ORB_AVATAR, isFriendZonePresenceMeta, publicOrbAvatarUrl } from "@/lib/board/friendZoneOrbs";
import type { CreatorEntity, WorkBoardEntity, WorkDropPreview } from "./response";
import { expandedSearchTerms } from "./intents";

export type PublicWorkBoardRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url?: string | null;
  avatar_path?: string | null;
  board_style?: Record<string, unknown> | string | null;
};

export type ActivityPreviewRow = {
  id?: string | null;
  user_id?: string | null;
  kind?: string | null;
  title?: string | null;
  body?: string | null;
  created_at?: string | null;
  meta?: Record<string, unknown> | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isPublicBoardStyle(boardStyle: Record<string, unknown> | null) {
  return asString(boardStyle?.visibility).toLowerCase() !== "private";
}

export function workDeskFromStyle(boardStyle: Record<string, unknown> | null) {
  const desk = asRecord(boardStyle?.workDesk);
  return {
    job: asString(desk?.job) || null,
    status: asString(desk?.status) || null,
  };
}

function locationFromStyle(boardStyle: Record<string, unknown> | null) {
  return (
    asString(boardStyle?.location) ||
    asString(boardStyle?.city) ||
    asString(boardStyle?.hometown) ||
    asString(boardStyle?.basedIn) ||
    null
  );
}

function haystackFor(
  row: PublicWorkBoardRow,
  job: string | null,
  boardLabel: string | null,
  previewText: string
) {
  return [
    row.username,
    row.display_name,
    row.bio,
    job,
    boardLabel,
    previewText,
    asString(asRecord(row.board_style)?.bio),
    asString(asRecord(row.board_style)?.displayName),
    asString(asRecord(row.board_style)?.location),
    asString(asRecord(row.board_style)?.city),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function scoreRow(haystack: string, terms: string[], job: string | null, username: string, displayName: string) {
  let score = 0;
  const jobLower = (job || "").toLowerCase();
  const userLower = username.toLowerCase();
  const nameLower = displayName.toLowerCase();
  for (const term of terms) {
    if (!term) continue;
    if (userLower === term) score += 48;
    else if (userLower.includes(term)) score += 22;
    if (nameLower === term) score += 40;
    else if (nameLower.includes(term)) score += 16;
    if (jobLower && (jobLower === term || jobLower.includes(term) || term.includes(jobLower))) {
      score += 36;
    }
    if (haystack.includes(term)) score += 8;
  }
  if (job) score += 6;
  return score;
}

export function matchWorkBoards(
  rows: PublicWorkBoardRow[],
  query: string,
  options?: {
    intent?: "work_board_search" | "creator_search" | "hybrid_query" | "board_content_search";
    previewsByUser?: Map<string, WorkDropPreview[]>;
    limit?: number;
    viewerId?: string | null;
  }
): WorkBoardEntity[] {
  const terms = expandedSearchTerms(query);
  const browsing =
    !terms.length ||
    /^(find creators|search work boards|work boards|creators)$/i.test(query.trim());
  const intent = options?.intent ?? "work_board_search";
  const limit = options?.limit ?? 12;
  const matched: WorkBoardEntity[] = [];

  for (const row of rows) {
    const boardStyle = asRecord(row.board_style);
    const isSelf = Boolean(options?.viewerId && row.id === options.viewerId);
    if (!isPublicBoardStyle(boardStyle) && !isSelf) continue;
    const username = asString(row.username).toLowerCase().replace(/^@+/, "");
    if (!username) continue;

    const displayName =
      asString(boardStyle?.displayName) || asString(row.display_name) || username || "Board User";
    const bio = asString(boardStyle?.bio) || asString(row.bio) || null;
    const boardLabel = asString(boardStyle?.boardLabel) || null;
    const desk = workDeskFromStyle(boardStyle);
    const previews = options?.previewsByUser?.get(row.id)?.slice(0, 3) ?? [];
    const previewText = previews.map((preview) => preview.title).join(" ");
    const haystack = haystackFor(row, desk.job, boardLabel, previewText);
    const score = browsing
      ? desk.job
        ? 20
        : 8
      : scoreRow(haystack, terms, desk.job, username, displayName);

    if (!browsing && score < 8) continue;
    if (intent === "work_board_search" && !browsing && !desk.job && score < 16) continue;

    const glow = asString(boardStyle?.glowColor) || null;
    const avatar = publicOrbAvatarUrl(
      boardStyle?.avatarUrl,
      boardStyle?.avatarDataUrl,
      row.avatar_url,
      row.avatar_path,
      boardStyle?.avatarPath
    );
    const location = locationFromStyle(boardStyle);

    matched.push({
      kind: "work_board",
      id: row.id,
      username,
      displayName,
      profession: desk.job,
      location,
      bio,
      boardLabel: boardLabel || (desk.job ? "Work Board" : "Profile Board"),
      avatarUrl: avatar === DEFAULT_ORB_AVATAR ? null : avatar,
      glowColor: glow,
      href: isSelf ? "/board/work" : `/board/profile/${encodeURIComponent(username)}`,
      previews,
      score,
    });
  }

  matched.sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName));
  return matched.slice(0, limit);
}

export function creatorsFromWorkBoards(boards: WorkBoardEntity[]): CreatorEntity[] {
  return boards.map((board) => ({
    kind: "creator",
    id: board.id,
    username: board.username,
    displayName: board.displayName,
    profession: board.profession,
    bio: board.bio,
    avatarUrl: board.avatarUrl,
    href: board.href,
    score: board.score,
  }));
}

export function previewsFromActivity(rows: ActivityPreviewRow[]): Map<string, WorkDropPreview[]> {
  const map = new Map<string, WorkDropPreview[]>();
  for (const row of rows) {
    const userId = asString(row.user_id);
    if (!userId) continue;
    if (isFriendZonePresenceMeta(row.meta)) continue;
    const meta = asRecord(row.meta);
    if (asString(meta?.visibility).toLowerCase() === "private") continue;
    const title = asString(row.title) || asString(row.body);
    if (!title || title.length < 2) continue;
    const list = map.get(userId) ?? [];
    if (list.length >= 3) continue;
    list.push({
      id: asString(row.id) || `${userId}-${list.length}`,
      title: title.slice(0, 72),
      kind: asString(row.kind) || asString(meta?.dropType) || null,
    });
    map.set(userId, list);
  }
  return map;
}

export function mergePublicWorkBoardRows(groups: PublicWorkBoardRow[][]): PublicWorkBoardRow[] {
  const byId = new Map<string, PublicWorkBoardRow>();
  for (const group of groups) {
    for (const row of group) {
      if (!row?.id) continue;
      const existing = byId.get(row.id);
      byId.set(row.id, existing ? { ...existing, ...row } : row);
    }
  }
  return [...byId.values()];
}
