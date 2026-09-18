import { DEFAULT_ORB_AVATAR, publicOrbAvatarUrl } from "@/lib/board/friendZoneOrbs";
import { toPublicBoardStorageUrl } from "@/lib/board/dropDisplay";
import { workDeskFromStyle } from "./searchWorkBoards";
import type { WorkBoardEntity } from "./response";

export type WorkBoardSection = "portfolio" | "assets";

export type WorkBoardLibraryKind = "media" | "music" | "youtube" | "link" | "doc" | "note";

export type WorkBoardLibraryDrop = {
  id: string;
  title: string;
  kind: WorkBoardLibraryKind;
  createdAt: number;
  description?: string | null;
  mediaUrl?: string | null;
  mediaType?: "image" | "video" | "audio" | "file" | null;
  embedUrl?: string | null;
  url?: string | null;
  text?: string | null;
  source: "board_assets" | "board_drops";
  section: WorkBoardSection;
};

export type WorkBoardPreviewCreator = {
  id: string;
  username: string;
  displayName: string;
  profession: string | null;
  bio: string | null;
  avatarUrl: string | null;
  glowColor: string | null;
  href: string;
};

export type WorkBoardPreviewParams = {
  creatorId?: string;
  username: string;
  initialSection?: WorkBoardSection | null;
  selectedDropId?: string | null;
  filters?: Record<string, string>;
};

export type WorkBoardPreviewData = {
  creator: WorkBoardPreviewCreator;
  assets: WorkBoardLibraryDrop[];
  portfolio: WorkBoardLibraryDrop[];
  defaultSection: WorkBoardSection;
};

type AssetRow = {
  id?: unknown;
  kind?: unknown;
  title?: unknown;
  description?: unknown;
  payload?: unknown;
  created_at?: unknown;
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

function publicMediaUrl(value: unknown): string | null {
  const raw = asString(value);
  if (!raw || raw.startsWith("data:")) return null;
  return toPublicBoardStorageUrl(raw) || raw;
}

function isFramedDraft(payload: Record<string, unknown> | null) {
  const lifecycle = asRecord(payload?.lifecycle);
  return asString(lifecycle?.phase).toLowerCase() === "framed";
}

function isArchived(payload: Record<string, unknown> | null) {
  const library = asRecord(payload?.library);
  return Boolean(library?.archivedAt);
}

export function isPublicLibraryAsset(payload: Record<string, unknown> | null) {
  if (!payload || isFramedDraft(payload) || isArchived(payload)) return false;
  const library = asRecord(payload.library);
  return library?.isAsset === true || library?.isPortfolio === true;
}

function libraryKindFromAsset(kind: string): WorkBoardLibraryKind {
  if (kind === "music" || kind === "youtube" || kind === "link" || kind === "doc" || kind === "note") {
    return kind;
  }
  return "media";
}

function libraryKindFromBoardDrop(type: string, mediaKind: string): WorkBoardLibraryKind {
  const t = type.toLowerCase();
  if (t.includes("youtube")) return "youtube";
  if (t.includes("music")) return "music";
  if (mediaKind === "audio" || mediaKind === "video" || mediaKind === "image") return "media";
  if (t.includes("doc")) return "doc";
  if (t.includes("thought") || t.includes("note")) return "note";
  if (t.includes("link") || t.includes("news") || t.includes("pay")) return "link";
  return "media";
}

export function libraryDropFromAssetRow(row: AssetRow, section: WorkBoardSection): WorkBoardLibraryDrop | null {
  const payload = asRecord(row.payload);
  if (!isPublicLibraryAsset(payload)) return null;
  const library = asRecord(payload?.library);
  if (section === "portfolio" && library?.isPortfolio !== true) return null;
  if (section === "assets" && library?.isAsset !== true) return null;

  const id = asString(row.id);
  const title = asString(row.title) || "Untitled Drop";
  if (!id) return null;

  const kind = libraryKindFromAsset(asString(row.kind).toLowerCase());
  const mediaTypeRaw = asString(payload?.mediaType).toLowerCase();
  const mediaType =
    mediaTypeRaw === "video" || mediaTypeRaw === "audio" || mediaTypeRaw === "file" || mediaTypeRaw === "image"
      ? mediaTypeRaw
      : kind === "media"
        ? "image"
        : null;

  return {
    id,
    title,
    kind,
    createdAt: Date.parse(asString(row.created_at)) || 0,
    description: asString(row.description) || asString(payload?.text) || null,
    mediaUrl: publicMediaUrl(payload?.mediaUrl) || publicMediaUrl(payload?.url),
    mediaType,
    embedUrl: asString(payload?.embedUrl) || null,
    url: asString(payload?.url) || asString(payload?.embedUrl) || null,
    text: asString(payload?.text) || null,
    source: "board_assets",
    section,
  };
}

export function libraryDropFromBoardDrop(raw: unknown): WorkBoardLibraryDrop | null {
  const drop = asRecord(raw);
  if (!drop) return null;
  if (asString(drop.visibility).toLowerCase() === "private") return null;
  const id = asString(drop.id);
  const title = asString(drop.title) || asString(drop.previewTitle);
  if (!id) return null;

  const type = asString(drop.type);
  const mediaKind = asString(drop.mediaKind).toLowerCase();
  const kind = libraryKindFromBoardDrop(type, mediaKind);
  const mediaType =
    mediaKind === "video" || mediaKind === "audio" || mediaKind === "image"
      ? mediaKind
      : kind === "media"
        ? "image"
        : null;
  const mediaUrl =
    publicMediaUrl(drop.mediaUrl) ||
    publicMediaUrl(drop.url) ||
    publicMediaUrl(drop.previewImage);
  const embedUrl = asString(drop.embedUrl);
  if (!title && !mediaUrl && !embedUrl) return null;

  return {
    id,
    title: title || "Untitled Drop",
    kind,
    createdAt: Number(drop.createdAt) || Number(drop.updatedAt) || 0,
    description: asString(drop.description) || asString(drop.thoughtText) || null,
    mediaUrl,
    mediaType,
    embedUrl: embedUrl || null,
    url: asString(drop.linkUrl) || asString(drop.url) || asString(drop.paymentLink) || null,
    text: asString(drop.thoughtText) || asString(drop.description) || null,
    source: "board_drops",
    section: "portfolio",
  };
}

export function splitWorkBoardLibraries(
  assetRows: AssetRow[],
  boardDrops: unknown[]
): { assets: WorkBoardLibraryDrop[]; portfolio: WorkBoardLibraryDrop[] } {
  const assets = assetRows
    .map((row) => libraryDropFromAssetRow(row, "assets"))
    .filter((item): item is WorkBoardLibraryDrop => Boolean(item));
  const portfolioFromAssets = assetRows
    .map((row) => libraryDropFromAssetRow(row, "portfolio"))
    .filter((item): item is WorkBoardLibraryDrop => Boolean(item));

  const seen = new Set(portfolioFromAssets.map((item) => item.id));
  const portfolioFromBoard = boardDrops
    .map(libraryDropFromBoardDrop)
    .filter((item): item is WorkBoardLibraryDrop => Boolean(item && !seen.has(item.id)));

  // Prefer classified Work Board portfolio rows. Public board drops fill
  // Portfolio only when the library table is not readable or empty.
  const portfolio = portfolioFromAssets.length ? portfolioFromAssets : portfolioFromBoard;

  return {
    assets,
    portfolio,
  };
}

export function defaultWorkBoardSection(
  portfolio: WorkBoardLibraryDrop[],
  assets: WorkBoardLibraryDrop[],
  requested?: WorkBoardSection | null
): WorkBoardSection {
  if (requested === "assets" && assets.length) return "assets";
  if (requested === "portfolio" && portfolio.length) return "portfolio";
  if (portfolio.length) return "portfolio";
  if (assets.length) return "assets";
  return requested === "assets" ? "assets" : "portfolio";
}

export function creatorFromProfile(
  row: {
    id: string;
    username: string | null;
    display_name?: string | null;
    bio?: string | null;
    avatar_url?: string | null;
    board_style?: unknown;
  },
  viewerId?: string | null
): WorkBoardPreviewCreator | null {
  const boardStyle = asRecord(row.board_style);
  if (asString(boardStyle?.visibility).toLowerCase() === "private" && row.id !== viewerId) {
    return null;
  }
  const username = asString(row.username).toLowerCase().replace(/^@+/, "");
  if (!username) return null;
  const desk = workDeskFromStyle(boardStyle);
  const avatar = publicOrbAvatarUrl(
    boardStyle?.avatarUrl,
    boardStyle?.avatarDataUrl,
    row.avatar_url,
    boardStyle?.avatarPath
  );
  return {
    id: row.id,
    username,
    displayName: asString(boardStyle?.displayName) || asString(row.display_name) || username,
    profession: desk.job,
    bio: asString(boardStyle?.bio) || asString(row.bio) || null,
    avatarUrl: avatar === DEFAULT_ORB_AVATAR ? null : avatar,
    glowColor: asString(boardStyle?.glowColor) || null,
    href: viewerId && row.id === viewerId ? "/board/work" : `/board/profile/${encodeURIComponent(username)}`,
  };
}

export function creatorFromWorkBoardEntity(board: WorkBoardEntity): WorkBoardPreviewCreator {
  return {
    id: board.id,
    username: board.username,
    displayName: board.displayName,
    profession: board.profession,
    bio: board.bio,
    avatarUrl: board.avatarUrl,
    glowColor: board.glowColor,
    href: board.href,
  };
}

export async function fetchWorkBoardPreview(
  username: string,
  params?: Omit<WorkBoardPreviewParams, "username">,
  signal?: AbortSignal
): Promise<WorkBoardPreviewData> {
  const query = new URLSearchParams();
  if (params?.creatorId) query.set("creatorId", params.creatorId);
  if (params?.initialSection) query.set("section", params.initialSection);
  if (params?.selectedDropId) query.set("drop", params.selectedDropId);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await fetch(`/api/board/work-board/${encodeURIComponent(username)}${suffix}`, {
    method: "GET",
    headers: { accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    throw new Error("That Work Board could not be opened.");
  }
  const payload = (await response.json()) as WorkBoardPreviewData & { ok?: boolean; error?: string };
  if (!payload?.creator) {
    throw new Error(payload.error || "That Work Board could not be opened.");
  }
  return payload;
}
