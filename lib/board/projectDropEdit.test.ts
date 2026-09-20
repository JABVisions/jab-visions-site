import {
  applyProjectDropUpdate,
  boardProjectPatchFromDrop,
  isProjectDropStatus,
  isProjectStudioVideoFile,
  projectCoverFromUpload,
  projectDropFromBoardProject,
  projectMediaFromStudioUpload,
  type ProjectDropEditInput,
} from "./projectDropEdit";
import type { BoardProject } from "./projects";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const project: BoardProject = {
  id: "project_keep_me",
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_100_000,
  title: "Those Ryderz",
  logline: "A crew rebuilds a city block.",
  projectType: "Feature Film",
  status: "casting",
  location: "NYC",
  startDate: "07/01/2026",
  endDate: "10/01/2026",
  unionStatus: "SAG-AFTRA",
  compensationType: "Paid",
  rate: "$200/day",
  rolesNeeded: "Lead, DP",
  contactName: "John Andy",
  contactEmail: "john@example.com",
  notes: "Bring stills.",
  goal: "Cast leads",
  milestone: "Table read",
  source: "work_board",
  media: {
    kind: "image",
    src: "https://cdn.example/cover.jpg",
    bucket: "board-media",
    storagePath: "user/project-cover/cover.jpg",
  },
  authorId: "user_1",
  authorName: "John Andy",
  invites: [
    {
      id: "invite_1",
      name: "Zoe",
      status: "joined",
      invitedAt: 1_700_000_050_000,
    },
  ],
  roomPosts: [
    {
      id: "post_1",
      authorName: "John Andy",
      text: "Welcome in.",
      createdAt: 1_700_000_060_000,
    },
  ],
};

const drop: ProjectDropEditInput = {
  id: "project_keep_me",
  title: "Those Ryderz: Cut",
  logline: "The block comes back online.",
  projectType: "Short Film",
  status: "pre_production",
  location: "Brooklyn",
  startDate: "08/01/2026",
  endDate: "11/01/2026",
  unionStatus: "Non-Union",
  compensationType: "Negotiable",
  rate: "Deferred + meals",
  rolesNeeded: "Editor",
  contactName: "JAB",
  contactEmail: "jab@example.com",
  notes: "New stills incoming.",
  goal: "Lock picture",
  milestone: "Fine cut",
  media: {
    kind: "image",
    src: "https://cdn.example/new.jpg",
    bucket: "board-media",
    storagePath: "user/project-cover/new.jpg",
  },
  createdAt: 9_999,
};

assert(isProjectDropStatus("production"), "production is a valid project status");
assert(!isProjectDropStatus("draft"), "unknown statuses are rejected");

const snapshot = projectDropFromBoardProject(project);
assert(snapshot.id === "project_keep_me", "snapshot keeps the project id");
assert(snapshot.title === "Those Ryderz", "snapshot copies title");
assert(snapshot.media?.storagePath === "user/project-cover/cover.jpg", "snapshot copies cover");

const patch = boardProjectPatchFromDrop(drop);
assert(!("invites" in patch), "field patch must not include invites");
assert(!("roomPosts" in patch), "field patch must not include room posts");
assert(!("id" in patch), "field patch must not mint or replace the id");
assert(patch.title === "Those Ryderz: Cut", "patch copies edited title");

const updated = applyProjectDropUpdate(project, drop);
assert(updated.id === "project_keep_me", "update keeps the original project id");
assert(updated.createdAt === project.createdAt, "update keeps createdAt");
assert(updated.invites === project.invites, "update keeps invites");
assert(updated.roomPosts === project.roomPosts, "update keeps room posts");
assert(updated.title === "Those Ryderz: Cut", "update applies title");
assert(updated.location === "Brooklyn", "update applies location");
assert(updated.media?.storagePath === "user/project-cover/new.jpg", "update applies cover");
assert(updated.updatedAt >= project.updatedAt, "update bumps updatedAt");

const cover = projectCoverFromUpload({
  bucket: "board-media",
  storagePath: "user/project-cover/studio.jpg",
  imageUrl: "https://cdn.example/studio.jpg",
});
assert(cover.kind === "image", "studio upload becomes an image cover");
assert(cover.storagePath === "user/project-cover/studio.jpg", "studio upload keeps storage path");

assert(isProjectStudioVideoFile({ type: "video/mp4", name: "clip.mp4" }), "mp4 files are studio video");
assert(isProjectStudioVideoFile({ type: "video/mp4 ", name: "tape.MOV " }), "iOS names with trailing space stay video");
assert(!isProjectStudioVideoFile({ type: "image/png", name: "art.png" }), "png files are not studio video");

const studioMedia = projectMediaFromStudioUpload({
  kind: "video",
  src: "https://cdn.example/clip.mp4",
  bucket: "board-media",
  storagePath: "user/project-media/clip.mp4",
});
assert(studioMedia.kind === "video", "studio helper preserves video kind");
assert(studioMedia.storagePath === "user/project-media/clip.mp4", "studio helper keeps path");

console.log("projectDropEdit.test.ts: ok");
