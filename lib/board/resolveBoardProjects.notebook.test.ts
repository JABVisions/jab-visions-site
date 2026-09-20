import { resolveBoardProjects, writeBoardProjects, projectsFromProfileBoardDrops, notebookProjectsOwnedByViewer } from "./projects";

const memory = new Map<string, string>();

function installLocalStorage() {
  const localStorage = {
    getItem(key: string) {
      return memory.has(key) ? memory.get(key)! : null;
    },
    setItem(key: string, value: string) {
      memory.set(key, String(value));
    },
    removeItem(key: string) {
      memory.delete(key);
    },
    clear() {
      memory.clear();
    },
    key(index: number) {
      return [...memory.keys()][index] ?? null;
    },
    get length() {
      return memory.size;
    },
  };

  const windowLike = {
    localStorage,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
  };

  (globalThis as any).window = windowLike;
  (globalThis as any).localStorage = localStorage;
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

installLocalStorage();

memory.set(
  "jab_drop_pad_assets_v4",
  JSON.stringify([
    {
      id: "asset_work_still",
      kind: "media",
      title: "Work still from production",
      description: "saved from the work board",
      createdAt: Date.now(),
      payload: { library: { isAsset: true, isPortfolio: false }, origin: "drop-studio" },
    },
  ])
);

memory.set(
  "jab_drop_pad_portfolio_drops_v1",
  JSON.stringify([
    {
      id: "folio_reel",
      kind: "music",
      title: "Portfolio reel",
      createdAt: Date.now(),
      payload: { library: { isAsset: false, isPortfolio: true }, destination: "portfolio" },
    },
  ])
);

memory.set(
  "jab_board_drops_v2",
  JSON.stringify([
    {
      id: "yt_work_tape",
      type: "youtube",
      title: "Work tape",
      description: "audition work for the production",
      createdAt: Date.now(),
    },
    {
      id: "uni_project",
      type: "project",
      title: "Project Drop: Night Shoot",
      createdAt: Date.now(),
      origin: "project_notebook",
      source: "work_board",
      projectId: "project_nightshoot",
    },
  ])
);

memory.set(
  "jab_board_activity_v1",
  JSON.stringify([
    {
      id: "work_thought_abc",
      created_at: new Date().toISOString(),
      user_id: "u1",
      kind: "board_drop",
      title: "Work Thought",
      body: "a work thought landed on Board",
      href: "/board/work",
      image_url: null,
      meta: { source: "work_board", origin: "work_board", dropType: "thought" },
    },
    {
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      created_at: new Date().toISOString(),
      user_id: "u1",
      kind: "board_drop",
      title: "Project Drop: zoe audition",
      body: "Casting sides for Zoe",
      href: "/board/work",
      image_url: null,
      meta: {
        dropType: "project",
        cardStyle: "project_drop",
        projectType: "Feature Film",
      },
    },
  ])
);

memory.set(
  "jab_drop_pad_project_drops_v1",
  JSON.stringify([
    {
      id: "studio_project",
      kind: "media",
      title: "Set bible stills",
      createdAt: Date.now(),
      payload: { destination: "projects", library: { isAsset: false, isPortfolio: false } },
    },
  ])
);

memory.set(
  "jab_board_projects_v2",
  JSON.stringify([
    {
      id: "project_realroom",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title: "Those Ryderz S2",
      logline: "A host-ready project room",
      projectType: "Series",
      status: "casting",
      location: "Atlanta",
      startDate: "",
      unionStatus: "Negotiable",
      compensationType: "Negotiable",
      rolesNeeded: "Camera",
      contactName: "Host",
      contactEmail: "",
      source: "work_board",
      invites: [],
      roomPosts: [],
    },
    {
      id: "loose_asset_work_still",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title: "Work still from production",
      logline: "saved from the work board",
      projectType: "media",
      status: "casting",
      location: "",
      startDate: "",
      unionStatus: "Negotiable",
      compensationType: "Negotiable",
      rolesNeeded: "",
      contactName: "Host",
      contactEmail: "",
      source: "jab_drop_pad_assets_v4",
      invites: [],
      roomPosts: [],
    },
  ])
);

const resolved = resolveBoardProjects();
const ids = resolved.map((project) => project.id).sort();

assert(
  ids.includes("project_realroom"),
  `expected Project Drop room in notebook, got ${ids.join(",")}`
);
assert(
  ids.includes("droppad_studio_project"),
  `expected Drop Pad project-library drop in notebook, got ${ids.join(",")}`
);
assert(
  ids.includes("project_nightshoot"),
  `expected typed universal project drop in notebook, got ${ids.join(",")}`
);
assert(
  ids.includes("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
  `expected remote Project Drop without a source stamp in notebook, got ${ids.join(",")}`
);
assert(
  !ids.some((id) => id.includes("asset") || id.includes("folio") || id.includes("yt_work") || id.includes("thought") || id.startsWith("loose_")),
  `notebook included non-project records: ${ids.join(",")}`
);

const fromProfile = projectsFromProfileBoardDrops({
  id: "user-1",
  username: "johnandy",
  display_name: "JAB",
  board_style: {
    boardDrops: [
      {
        id: "project_drop_project_zoe",
        type: "Project",
        title: "zoe audition",
        createdAt: Date.now(),
        description: "Casting sides for Zoe",
        origin: "project_notebook",
        source: "work_board",
        meta: {
          dropType: "project",
          projectId: "project_zoe",
          cardStyle: "project_drop",
        },
      },
    ],
  },
});
assert(
  fromProfile.some((project) => /zoe audition/i.test(project.title)),
  `profile Project Drops should hydrate into notebook records, got ${fromProfile.map((project) => project.title).join(",")}`
);

writeBoardProjects(resolved);
const persisted = JSON.parse(memory.get("jab_board_projects_v2") || "[]") as Array<{ id: string; source?: string }>;
assert(
  persisted.every((item) => ids.includes(item.id)),
  "persisted notebook storage should only contain resolved project drops"
);
assert(
  !persisted.some((item) => item.id.startsWith("loose_")),
  "polluted loose asset records should be pruned from notebook storage"
);
assert(
  persisted.every((item) => Boolean(item.source)),
  `persisted notebook rooms should keep a source stamp, got ${persisted.map((item) => item.source).join(",")}`
);

const owned = notebookProjectsOwnedByViewer(
  [
    { id: "mine", authorId: "user-1", title: "zoe audition" } as any,
    { id: "theirs", authorId: "user-2", title: "Other room" } as any,
    { id: "local", title: "Unscoped room" } as any,
  ],
  "user-1"
);
assert(
  owned.map((project) => project.id).join(",") === "mine,local",
  `viewer should persist owned and unscoped rooms, got ${owned.map((project) => project.id).join(",")}`
);

console.log("resolveBoardProjects integration passed", ids);
