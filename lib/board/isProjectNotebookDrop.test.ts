import {
  isAssetOrPortfolioLibraryItem,
  isDropPadProjectStorageKey,
  isExplicitProjectDropRecord,
  isStoredNotebookProject,
} from "./isProjectNotebookDrop";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

// Drop Pad projects destination
assert(
  isExplicitProjectDropRecord({
    id: "studio_1",
    kind: "media",
    title: "Set stills",
    destination: "projects",
    payload: { library: { isAsset: false, isPortfolio: false }, origin: "drop-studio" },
  }),
  "drops sent to Projects should appear in the notebook"
);

assert(
  isDropPadProjectStorageKey("jab_drop_pad_project_drops_v1"),
  "project library storage key should be recognized"
);

assert(
  !isDropPadProjectStorageKey("jab_drop_pad_assets_v4"),
  "assets storage key must not count as the project library"
);

// Assets / portfolio must stay out
assert(
  isAssetOrPortfolioLibraryItem({
    id: "asset_1",
    kind: "media",
    title: "Work still",
    payload: { library: { isAsset: true, isPortfolio: false } },
  }),
  "asset-library items should be classified as assets"
);

assert(
  !isExplicitProjectDropRecord({
    id: "asset_1",
    kind: "media",
    title: "Work still from the production",
    description: "saved from work board",
    payload: { library: { isAsset: true, isPortfolio: false }, origin: "drop-studio" },
  }),
  "assets mentioning work/production must not become project drops"
);

assert(
  !isExplicitProjectDropRecord({
    id: "folio_1",
    kind: "music",
    title: "Portfolio reel",
    destination: "portfolio",
    payload: { library: { isAsset: false, isPortfolio: true } },
  }),
  "portfolio items must not become project drops"
);

// Board / feed collection drops
assert(
  !isExplicitProjectDropRecord({
    id: "yt_1",
    type: "youtube",
    title: "Work tape",
    description: "audition work for the production",
    meta: { dropType: "youtube", source: "board_drops_storage" },
  }),
  "board collection drops must not enter the notebook from text matching"
);

assert(
  !isExplicitProjectDropRecord({
    id: "thought_1",
    kind: "board_drop",
    title: "Work Thought",
    body: "a work thought landed on Board",
    meta: { source: "work_board", origin: "work_board", dropType: "thought" },
  }),
  "work thoughts must not count as project drops"
);

// Genuine project drops
assert(
  isExplicitProjectDropRecord({
    id: "project_abc",
    title: "Project Drop: Those Ryderz",
    meta: {
      kind: "project_drop",
      cardStyle: "project_drop",
      dropType: "project",
      source: "work_board",
      origin: "project_notebook",
    },
  }),
  "Project Drop Menu items should appear"
);

assert(
  isExplicitProjectDropRecord({
    id: "uni_1",
    type: "project",
    title: "Casting room",
    origin: "project_notebook",
    source: "work_board",
  }),
  "universal drops typed as project should appear"
);

// Stored notebook records (after backfill pollution)
assert(
  isStoredNotebookProject({
    id: "project_k1abc",
    source: "work_board",
    projectType: "Short Film",
  }),
  "Project Drop Menu rooms should stay in the notebook"
);

assert(
  isStoredNotebookProject({
    id: "droppad_studio_1",
    source: "drop_pad_projects",
    projectType: "Vision Drop",
  }),
  "Drop Pad project-library records should stay in the notebook"
);

assert(
  !isStoredNotebookProject({
    id: "loose_asset_1",
    source: "jab_drop_pad_assets_v4",
    projectType: "media",
  }),
  "loose-scanned assets must be pruned from stored notebook projects"
);

assert(
  !isStoredNotebookProject({
    id: "feed_yt_1",
    source: "board_drops_storage",
    projectType: "youtube",
  }),
  "feed-converted board drops must be pruned"
);

assert(
  !isStoredNotebookProject({
    id: "work_thought_xyz",
    source: "work_board",
    projectType: "thought",
  }),
  "work thoughts persisted into board projects must be pruned"
);

assert(
  !isStoredNotebookProject({
    id: "local_status_drop",
    source: "board_drops_storage",
    projectType: "Project",
  }),
  "generic board drops defaulting to projectType Project must be pruned"
);

assert(
  !isStoredNotebookProject({
    id: "uuid-board-drop",
    projectType: "Project",
  }),
  "unsourced default Project tiles from the old greedy matcher must be pruned"
);

console.log("isProjectNotebookDrop tests passed");
