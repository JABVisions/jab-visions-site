import type { WorkBoardEntity, WorkDropPreview } from "./response";
import { expandedSearchTerms } from "./intents";

export type PublicWorkBoardRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url?: string | null;
  board_style?: Record<string, unknown> | null;
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

function haystackFor(row: PublicWorkBoardRow, job: string | null, boardLabel: string | null) {
  return [
    row.username,
    row.display_name,
    row.bio,
    job,
    boardLabel,
    asString(asRecord(row.board_style)?.bio),
    asString(asRecord(row.board_style)?.displayName),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function scoreRow(haystack: string, terms: string[], job: string | null, username: string) {
  let score = 0;
  const jobLower = (job || "").toLowerCase();
  const userLower = username.toLowerCase();
  for (const term of terms) {
    if (!term) continue;
    if (userLower === term) score += 48;
    else if (userLower.includes(term)) score += 22;
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
    if (!isPublicBoardStyle(boardStyle)) continue;
    const username = asString(row.username).toLowerCase().replace(/^@+/, "");
    const routeKey = username || row.id;
    if (!routeKey) continue;

    const displayName =
      asString(boardStyle?.displayName) || asString(row.display_name) || username || "Board User";
    const bio = asString(boardStyle?.bio) || asString(row.bio) || null;
    const boardLabel = asString(boardStyle?.boardLabel) || null;
    const desk = workDeskFromStyle(boardStyle);
    const haystack = haystackFor(row, desk.job, boardLabel);
    const score = browsing
      ? desk.job
        ? 20
        : 8
      : scoreRow(haystack, terms, desk.job, username);

    if (!browsing && score < 8) continue;
    if (intent === "work_board_search" && !browsing && !desk.job && score < 16) continue;

    const glow = asString(boardStyle?.glowColor) || null;
    const avatar =
      asString(boardStyle?.avatarDataUrl) || asString(row.avatar_url) || null;

    matched.push({
      kind: "work_board",
      id: row.id,
      username: username || routeKey,
      displayName,
      profession: desk.job,
      location: null,
      bio,
      boardLabel: boardLabel || (desk.job ? "Work Board" : "Profile Board"),
      avatarUrl: avatar,
      glowColor: glow,
      href: `/board/profile/${encodeURIComponent(routeKey)}`,
      previews: options?.previewsByUser?.get(row.id)?.slice(0, 3) ?? [],
      score,
    });
  }

  matched.sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName));
  return matched.slice(0, limit);
}

export function previewsFromActivity(rows: ActivityPreviewRow[]): Map<string, WorkDropPreview[]> {
  const map = new Map<string, WorkDropPreview[]>();
  for (const row of rows) {
    const userId = asString(row.user_id);
    if (!userId) continue;
    const meta = asRecord(row.meta);
    if (asString(meta?.visibility).toLowerCase() === "private") continue;
    const title = asString(row.title) || asString(row.body);
    if (!title) continue;
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
