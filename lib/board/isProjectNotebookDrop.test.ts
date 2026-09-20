import {
  isAssetOrPortfolioLibraryItem,
  isDropPadProjectStorageKey,
  isExplicitProjectDropRecord,
  isStoredNotebookProject,
  notebookSourceForProjectRecord,
} from "./isProjectNotebookDrop";
import { profileBoardDropFromProject, isCloudProjectDrop, mergeCollectionPreservingProjectDrops } from "./projectProfileDrop";
import { normalizeBoardDropType } from "./dropDisplay";

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

assert(
  !isExplicitProjectDropRecord({
    id: "project_room_tape_1",
    kind: "board_drop",
    title: "Those Ryderz — Audition tape",
    body: "Zoe posted an audition tape in Those Ryderz.",
    meta: {
      origin: "project_room",
      cardStyle: "project_room_drop",
      dropType: "video",
      projectId: "project_keep_me",
      signalSeed: { type: "project_room_drop_created", projectId: "project_keep_me" },
    },
  }),
  "project room media drops must not mint a new project room"
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

assert(
  isStoredNotebookProject({
    id: "uuid-zoe-audition",
    title: "zoe audition",
    projectType: "Feature Film",
  }),
  "unsourced Project Drop Menu rooms should stay in the notebook"
);

assert(
  isStoredNotebookProject({
    id: "project_drop_project_k1abc",
    source: "profiles.board_style.boardDrops",
    projectType: "Project",
  }),
  "profile-persisted Project Drops should stay in the notebook"
);

assert(
  isStoredNotebookProject({
    id: "profile_project_user_project_drop_k1",
    origin: "project_notebook",
    projectType: "Project",
  }),
  "profile notebook mirrors should stay in the notebook"
);

assert(
  notebookSourceForProjectRecord({
    meta: { source: "profiles.board_style.boardDrops", dropType: "project" },
  }) === "work_board",
  "profile board-drop sources should remap onto the notebook"
);

assert(
  isExplicitProjectDropRecord({
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    kind: "board_drop",
    title: "Project Drop: zoe audition",
    body: "Casting sides",
    meta: { dropType: "project", cardStyle: "project_drop" },
  }),
  "remote Project Drop activities without a source stamp should still count"
);

assert(
  isExplicitProjectDropRecord(
    profileBoardDropFromProject({
      id: "project_zoe",
      title: "zoe audition",
      logline: "Casting sides for Zoe",
      projectType: "Feature Film",
      status: "casting",
      location: "Atlanta",
      startDate: "",
      contactName: "Johnandy",
    })
  ),
  "profile Project rows built from notebook rooms should count as notebook drops"
);

assert(
  isCloudProjectDrop(
    profileBoardDropFromProject({
      id: "project_zoe",
      title: "zoe audition",
      logline: "Casting sides for Zoe",
      projectType: "Feature Film",
      status: "casting",
      location: "Atlanta",
      startDate: "",
      contactName: "Johnandy",
    })
  ),
  "profile Project rows should be recognized as cloud project drops"
);

assert(
  normalizeBoardDropType("Project") === "Project",
  "Project drop type must not be remapped to Link"
);

const preserved = mergeCollectionPreservingProjectDrops(
  [
    { id: "thought_1", type: "Thought", title: "Hello" },
    { id: "media_1", type: "Media", title: "Still" },
  ],
  [
    { id: "project_drop_project_zoe", type: "Project", title: "zoe audition", origin: "project_notebook" },
    { id: "thought_1", type: "Thought", title: "Hello" },
  ]
);
assert(
  preserved.some((drop) => drop.id === "project_drop_project_zoe") &&
    preserved.some((drop) => drop.id === "thought_1") &&
    preserved.some((drop) => drop.id === "media_1"),
  `collection writes must keep cloud Project Drops, got ${preserved.map((drop) => drop.id).join(",")}`
);

console.log("isProjectNotebookDrop tests passed");
