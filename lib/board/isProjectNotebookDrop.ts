/**
 * Positive allow-list for Project Notebook.
 *
 * Notebook should only show drops saved into Projects / the project library
 * (Drop Pad destination "projects", Project Drop Menu rooms, and typed
 * `project` / `project_drop` records). Assets, portfolio items, feed/board
 * collection drops, and work thoughts must stay on their own surfaces.
 */

export const DROP_PAD_PROJECT_DROPS_STORAGE_KEYS: readonly string[] = [
  "jab_drop_pad_project_drops_v1",
  "jab_drop_pad_project_drops",
  "jab_drop_pad_projects_v1",
];

const PROJECT_KIND_RE =
  /^(project|project_drop|casting|casting_call|crew|crew_call|gig|audition)$/i;

const NOTEBOOK_SOURCE_RE =
  /^(work_board|project_notebook|drop_pad_projects|universal_drop)$/i;

const PRODUCTION_TYPE_RE =
  /^(feature_film|short_film|web_series|tv_pilot|music_video|commercial|photo_shoot|other|series)$/i;

const ASSET_OR_PORTFOLIO_SOURCE_RE =
  /jab_drop_pad_assets|jab_drop_pad_portfolio|portfolio_drops|board_assets/i;

const POLLUTED_ID_RE = /^(loose_|feed_|work_thought_)/i;

const NOTEBOOK_ID_RE =
  /^(droppad_|project_|project_drop_|profile_project_|universal_|asset_project_)/i;

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

export function normalizeProjectToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function nestedMeta(value: Record<string, any>): Record<string, any> {
  return {
    ...asRecord(value.payload),
    ...asRecord(value.meta),
  };
}

export function isDropPadProjectStorageKey(key: unknown): boolean {
  return DROP_PAD_PROJECT_DROPS_STORAGE_KEYS.includes(String(key ?? ""));
}

export function isNotebookProjectSource(value: unknown): boolean {
  const sourceRaw = String(value ?? "");
  return NOTEBOOK_SOURCE_RE.test(normalizeProjectToken(sourceRaw)) ||
    isDropPadProjectStorageKey(sourceRaw);
}

export function notebookSourceForProjectRecord(value: unknown): string {
  const item = asRecord(value);
  const meta = nestedMeta(item);
  const sourceRaw = item.source ?? meta.source;
  if (isNotebookProjectSource(sourceRaw)) {
    return normalizeProjectToken(sourceRaw);
  }
  return "work_board";
}

export function isAssetOrPortfolioLibraryItem(value: unknown): boolean {
  const item = asRecord(value);
  const meta = nestedMeta(item);
  const library = asRecord(meta.library || item.library);
  const destination = normalizeProjectToken(
    item.destination ?? meta.destination
  );

  // A drop explicitly sent to Projects is a project drop even if it also
  // exists in Assets/Portfolio as a classified library view.
  if (destination === "projects") return false;
  if (isDropPadProjectStorageKey(item.storageKey || meta.storageKey)) return false;

  if (library.isAsset === true || library.isPortfolio === true) return true;
  if (destination === "assets" || destination === "portfolio") return true;
  if (ASSET_OR_PORTFOLIO_SOURCE_RE.test(String(item.source ?? meta.source ?? ""))) {
    return true;
  }
  return false;
}

export function isExplicitProjectDropRecord(value: unknown): boolean {
  const item = asRecord(value);
  if (Object.keys(item).length === 0) return false;
  if (isAssetOrPortfolioLibraryItem(item)) return false;

  const meta = nestedMeta(item);
  const destination = normalizeProjectToken(item.destination ?? meta.destination);
  const origin = normalizeProjectToken(item.origin ?? meta.origin);
  const source = normalizeProjectToken(item.source ?? meta.source);
  const kind = normalizeProjectToken(item.kind ?? meta.kind ?? meta.cardStyle);
  const dropType = normalizeProjectToken(
    item.dropType ??
      meta.dropType ??
      meta.drop_type ??
      item.type ??
      meta.type
  );
  const title = String(item.title ?? meta.title ?? "");

  if (
    dropType === "thought" ||
    kind === "thought" ||
    (origin === "work_board" && dropType === "thought")
  ) {
    return false;
  }

  if (destination === "projects") return true;
  if (origin === "project_notebook") return true;
  if (isDropPadProjectStorageKey(item.storageKey || meta.storageKey || source)) {
    return true;
  }
  if (kind === "project" || kind === "project_drop") return true;
  if (dropType === "project" || dropType === "project_drop") return true;
  if (normalizeProjectToken(meta.cardStyle) === "project_drop") return true;
  if (/^project_drop:\s*/i.test(title)) return true;
  if (PROJECT_KIND_RE.test(kind) || PROJECT_KIND_RE.test(dropType)) return true;
  if (
    (source === "work_board" || source === "project_notebook") &&
    (kind === "project_drop" ||
      dropType === "project" ||
      /^project_drop:\s*/i.test(title))
  ) {
    return true;
  }
  return false;
}

export function isStoredNotebookProject(project: {
  id?: string;
  source?: string;
  origin?: string;
  projectType?: string;
  title?: string;
}): boolean {
  const id = String(project.id ?? "");
  const sourceRaw = String(project.source ?? "");
  const source = normalizeProjectToken(sourceRaw);
  const origin = normalizeProjectToken(project.origin);
  const projectType = normalizeProjectToken(project.projectType);
  const title = String(project.title ?? "");

  if (!id) return false;
  if (POLLUTED_ID_RE.test(id)) return false;
  if (ASSET_OR_PORTFOLIO_SOURCE_RE.test(sourceRaw)) return false;
  if (projectType === "thought" || projectType === "work_thought") return false;
  if (isAssetOrPortfolioLibraryItem(project)) return false;

  // Canonical Drop Pad project-library records and Project Drop Menu rooms.
  if (NOTEBOOK_ID_RE.test(id)) return true;
  if (isNotebookProjectSource(sourceRaw) || NOTEBOOK_SOURCE_RE.test(source)) {
    return true;
  }
  if (origin === "project_notebook") return true;
  if (/^project_drop:\s*/i.test(title)) return true;

  // Host-created rooms that lost their source stamp still keep production types.
  // Bare projectType "Project" stays rejected — that was the old greedy matcher.
  if (!source && PRODUCTION_TYPE_RE.test(projectType)) return true;

  return false;
}
