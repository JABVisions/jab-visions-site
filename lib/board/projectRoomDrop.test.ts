import {
  applyProjectRoomActivitiesToProjects,
  applyProjectRoomDropToProject,
  buildProjectRoomDrop,
  commitProjectRoomDrop,
  isProjectRoomDropActivity,
  isProjectRoomHost,
  matchingProjectInvite,
  mergeRoomPosts,
  persistableProjectRoomMediaUrl,
  preferredProjectRoomMediaSrc,
  projectRoomDropTitle,
  projectRoomMediaKindForFile,
  projectRoomPostHasMedia,
  projectRoomPostIsVideo,
  projectRoomPostStorageCoords,
  projectRoomStudioSaveKey,
  projectRoomVideoLoadError,
  projectRoomVideoPlaybackType,
  projectRoomVideoSrcIsPlayable,
  isUnplayableProjectRoomVideoPost,
  stripUnplayableProjectRoomVideos,
  runProjectRoomStudioSaveOnce,
  viewerCanPostToProjectRoom,
} from "./projectRoomDrop";
import { mergeProjectRecord, reconcileProjectsWithLive, type BoardProject } from "./projects";

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
  unionStatus: "SAG-AFTRA",
  compensationType: "Paid",
  rolesNeeded: "Lead",
  contactName: "John Andy",
  contactEmail: "john@example.com",
  authorId: "user_host",
  authorName: "John Andy",
  authorUsername: "jabvisions",
  media: {
    kind: "image",
    src: "https://cdn.example/cover.jpg",
    bucket: "board-media",
    storagePath: "user/project-cover/cover.jpg",
  },
  invites: [
    {
      id: "invite_1",
      name: "Zoe",
      handle: "@zoe",
      email: "zoe@example.com",
      role: "Lead",
      status: "joined",
      invitedAt: 1_700_000_050_000,
    },
    {
      id: "invite_2",
      name: "Cam",
      handle: "camcut",
      status: "invited",
      invitedAt: 1_700_000_060_000,
    },
  ],
  roomPosts: [
    {
      id: "post_welcome",
      authorName: "John Andy",
      text: "Welcome in.",
      createdAt: 1_700_000_060_000,
    },
  ],
};

assert(
  isProjectRoomHost(project, { id: "user_host", displayName: "Other" }),
  "matching authorId is the host"
);
assert(
  isProjectRoomHost(project, { username: "jabvisions", displayName: "JAB" }),
  "matching username is the host"
);
assert(
  !isProjectRoomHost(project, { id: "user_zoe", displayName: "Zoe", username: "zoe" }),
  "applicants are not the host"
);

assert(
  matchingProjectInvite(project, { displayName: "Zoe", username: "zoe" })?.id ===
    "invite_1",
  "joined applicant matches by handle"
);
assert(
  matchingProjectInvite(project, { username: "camcut" })?.status === "invited",
  "invited collaborator still matches"
);
assert(
  !matchingProjectInvite(project, { id: "stranger", displayName: "Sam" }),
  "unrelated viewers are not invited"
);

assert(
  viewerCanPostToProjectRoom(project, { id: "user_host" }),
  "host can post without Drop Console"
);
assert(
  viewerCanPostToProjectRoom(project, {
    id: "user_zoe",
    displayName: "Zoe",
    username: "zoe",
    email: "zoe@example.com",
  }),
  "joined applicant can post a room drop"
);
assert(
  viewerCanPostToProjectRoom(project, { username: "camcut" }),
  "invited collaborator viewing the room can post"
);
assert(
  viewerCanPostToProjectRoom(project, { id: "stranger", displayName: "Sam" }, { viewing: true }),
  "current user viewing a room they can open can post"
);
assert(
  !viewerCanPostToProjectRoom(project, { id: "stranger", displayName: "Sam" }),
  "strangers who are not in the room cannot post"
);
assert(
  !viewerCanPostToProjectRoom(null, { id: "user_host" }),
  "missing project cannot be posted to"
);

assert(
  projectRoomMediaKindForFile({ type: "video/mp4", name: "tape.mp4" }) === "video",
  "mp4 files are room video drops"
);
assert(
  projectRoomMediaKindForFile({ type: "image/png", name: "still.png" }) === "image",
  "png files are room photo drops"
);
assert(
  projectRoomMediaKindForFile({ type: "audio/mpeg", name: "voice.mp3" }) === null,
  "audio is not a project-room studio drop"
);

assert(
  projectRoomDropTitle("Those Ryderz", "video") === "Those Ryderz — Audition tape",
  "video titles use audition tape copy"
);
assert(
  persistableProjectRoomMediaUrl("blob:https://jabvisions.com/1") === null,
  "blob URLs must not persist"
);
assert(
  persistableProjectRoomMediaUrl("https://cdn.example/tape.mp4") ===
    "https://cdn.example/tape.mp4",
  "https media URLs persist"
);

const built = buildProjectRoomDrop({
  project,
  media: {
    kind: "video",
    src: "https://cdn.example/tape.mp4",
    bucket: "board-media",
    storagePath: "user/project-media/tape.mp4",
  },
  author: {
    id: "user_zoe",
    displayName: "Zoe",
    username: "zoe",
  },
  fileName: "tape.mp4",
  createdAt: 1_700_000_200_000,
  dropId: "project_room_tape",
  postId: "post_tape",
});

assert(built.drop.projectId === "project_keep_me", "drop is attached to the open project");
assert(built.drop.mediaKind === "video", "drop keeps video kind");
assert(built.drop.origin === "project_room", "drop origin is project room, not Drop Console");
assert(built.post.projectId === "project_keep_me", "room post keeps project id");
assert(built.post.mediaUrl === "https://cdn.example/tape.mp4", "room post keeps media");
assert(built.post.bucket === "board-media", "room post keeps the private bucket");
assert(
  built.post.storagePath === "user/project-media/tape.mp4",
  "room post keeps the storage path for createSignedUrl"
);
assert(
  preferredProjectRoomMediaSrc({
    signedUrl: "https://example.supabase.co/storage/v1/object/sign/board-media/tape.mp4?token=1",
    publicUrl: "https://example.supabase.co/storage/v1/object/public/board-media/tape.mp4",
  }).includes("/object/sign/"),
  "room drop commit prefers signed URL, not the public 403 URL"
);
assert(
  !projectRoomVideoSrcIsPlayable(
    "https://example.supabase.co/storage/v1/object/public/board-media/tape.mp4"
  ),
  "ROOM DROPS must not use a public board-media URL as <video src>"
);
assert(
  projectRoomVideoSrcIsPlayable(
    "https://example.supabase.co/storage/v1/object/sign/board-media/tape.mp4?token=1"
  ),
  "signed board-media URLs are playable"
);
assert(
  projectRoomPostStorageCoords(built.post)?.storagePath === "user/project-media/tape.mp4",
  "room renderer can resolve coords for createSignedUrl"
);
assert(
  projectRoomPostHasMedia({
    bucket: "board-media",
    storagePath: "user/project-media/tape.mp4",
  }),
  "bucket + path is enough to render even if mediaUrl was a public 403 URL"
);
assert(
  projectRoomVideoPlaybackType({ storagePath: "user/project-media/tape.mov" }) ===
    "video/quicktime",
  "iPhone .mov tapes advertise quicktime for Safari"
);
assert(
  projectRoomVideoPlaybackType({ storagePath: "user/project-media/tape.mp4" }) === "video/mp4",
  "mp4 tapes advertise video/mp4"
);
assert(
  projectRoomVideoLoadError("missing").toLowerCase().includes("try uploading"),
  "missing objects show a real error instead of a black player"
);
assert(built.activity.kind === "board_drop", "activity uses existing board_drop kind");
assert(
  built.activity.meta?.signalSeed?.type === "project_room_drop_created",
  "activity uses a distinct project-room signal"
);
assert(
  built.activity.title === "Those Ryderz — Audition tape",
  "activity title names the project and media"
);
assert(
  isProjectRoomDropActivity(built.activity),
  "built activity is recognized as a project-room drop"
);
assert(
  built.activity.meta?.cardStyle === "project_room_drop",
  "activity card style is not a cover-only project drop"
);
assert(!built.coverMedia, "existing cover is left in place");

const applied = applyProjectRoomDropToProject(project, built);
assert(applied.roomPosts[0]?.id === "post_tape", "new room post is first");
assert(
  applied.roomPosts.some((post) => post.id === "post_welcome"),
  "existing room posts stay"
);
assert(applied.media === project.media, "cover is optional and not overwritten");

const emptyCoverProject = { ...project, media: undefined };
const coverBuilt = buildProjectRoomDrop({
  project: emptyCoverProject,
  media: {
    kind: "image",
    src: "https://cdn.example/still.jpg",
    bucket: "board-media",
    storagePath: "user/project-media/still.jpg",
  },
  author: { id: "user_host", displayName: "John Andy" },
  fileName: "still.jpg",
  dropId: "project_room_still",
});
assert(coverBuilt.coverMedia?.kind === "image", "first photo can fill an empty cover");
assert(
  applyProjectRoomDropToProject(emptyCoverProject, coverBuilt).media?.src ===
    "https://cdn.example/still.jpg",
  "empty cover receives the first room drop"
);

const merged = mergeRoomPosts(project.roomPosts, [built.post, project.roomPosts[0]]);
assert(merged.length === 2, "room posts merge by id instead of replacing the thread");
assert(merged[0]?.id === "post_tape", "newest room post sorts first");

const hydrated = applyProjectRoomActivitiesToProjects(
  [project],
  [built.activity]
);
assert(
  hydrated[0]?.roomPosts.some((post) => post.dropId === "project_room_tape"),
  "activity channel events hydrate into the project room thread"
);

const committed = commitProjectRoomDrop([project], project, built);
assert(committed.saved.roomPosts[0]?.mediaUrl === "https://cdn.example/tape.mp4", "commit writes media onto the room post");
assert(
  committed.projects.find((item) => item.id === "project_keep_me")?.roomPosts.some(
    (post) => post.id === "post_tape"
  ),
  "commit updates the open project in the list, not a duplicate room"
);

assert(
  projectRoomPostIsVideo({ mediaUrl: "https://cdn.example/tape.mp4" }),
  "video URLs still render even if mediaKind was dropped"
);
assert(
  !projectRoomPostIsVideo({ mediaKind: "image", mediaUrl: "https://cdn.example/still.jpg" }),
  "photo posts are not treated as video"
);

const staleReload = { ...project, updatedAt: project.updatedAt };
const liveAfterSave = committed.saved;
const reconciled = reconcileProjectsWithLive([staleReload], [liveAfterSave]);
assert(
  reconciled[0]?.roomPosts.some((post) => post.mediaUrl === "https://cdn.example/tape.mp4"),
  "stale loadProjects snapshots must not wipe a just-saved room video"
);

const mergedRecords = mergeProjectRecord(staleReload, liveAfterSave);
assert(
  mergedRecords.roomPosts.some((post) => post.id === "post_tape"),
  "merging a stale notebook into the live room keeps the new tape"
);

const spam = Array.from({ length: 300 }, (_, index) => ({
  id: `post_dup_${index}`,
  authorName: "Zoe",
  text: "Zoe posted an audition tape in Those Ryderz.",
  createdAt: 1_700_000_200_000 + index,
  mediaUrl: "https://cdn.example/tape.mp4",
  mediaKind: "video" as const,
  dropId: index < 150 ? "project_room_tape" : undefined,
}));
const collapsedSpam = mergeRoomPosts(spam, []);
assert(
  collapsedSpam.length === 1,
  `300 duplicate tape posts must collapse to one room drop, got ${collapsedSpam.length}`
);

const welcomes = Array.from({ length: 300 }, (_, index) => ({
  id: `post_welcome_${index}`,
  authorName: "John Andy",
  text: "Welcome to Those Ryderz. Use this room to invite collaborators, post updates, and keep the project moving.",
  createdAt: 1_700_000_060_000 + index,
}));
assert(
  mergeRoomPosts(welcomes, []).length === 1,
  "300 seeded welcome posts must collapse to one"
);

const secondTape = buildProjectRoomDrop({
  project,
  media: {
    kind: "video",
    src: "https://cdn.example/tape.mp4",
    bucket: "board-media",
    storagePath: "user/project-media/tape.mp4",
  },
  author: { id: "user_zoe", displayName: "Zoe", username: "zoe" },
  fileName: "tape.mp4",
  dropId: "project_room_tape_again",
  postId: "post_tape_again",
});
const committedTwice = commitProjectRoomDrop(committed.projects, committed.saved, secondTape);
const tapePosts = committedTwice.saved.roomPosts.filter(
  (post) => post.mediaUrl === "https://cdn.example/tape.mp4"
);
assert(
  tapePosts.length === 1,
  `the same tape committed twice must stay one room post, got ${tapePosts.length}`
);

const deadPublic =
  "https://example.supabase.co/storage/v1/object/public/board-media/user/project-media/dead.mp4";
const playableSigned =
  "https://example.supabase.co/storage/v1/object/sign/board-media/user/project-media/live.mp4?token=1";
assert(
  isUnplayableProjectRoomVideoPost({
    mediaKind: "video",
    mediaUrl: deadPublic,
    storagePath: "user/project-media/dead.mp4",
  }),
  "public board-media URLs are dead playback rows"
);
const liveTape = buildProjectRoomDrop({
  project,
  media: {
    kind: "video",
    src: playableSigned,
    bucket: "board-media",
    storagePath: "user/project-media/live.mp4",
  },
  author: { id: "user_zoe", displayName: "Zoe", username: "zoe" },
  fileName: "tape.mp4",
  dropId: "project_room_live",
  postId: "post_live",
});
const withDead = {
  ...project,
  roomPosts: [
    {
      id: "post_dead",
      authorName: "Zoe",
      authorId: "user_zoe",
      text: "Zoe posted an audition tape in Those Ryderz.",
      createdAt: 1_700_000_150_000,
      mediaUrl: deadPublic,
      mediaKind: "video" as const,
      bucket: "board-media",
      storagePath: "user/project-media/dead.mp4",
    },
    ...(project.roomPosts ?? []),
  ],
};
const replacedDead = applyProjectRoomDropToProject(withDead, liveTape);
assert(
  replacedDead.roomPosts.some((post) => post.mediaUrl === playableSigned),
  "a verified studio save adds a playable drop"
);
assert(
  !replacedDead.roomPosts.some((post) => post.mediaUrl === deadPublic),
  "the next successful save replaces the dead public-URL row"
);
assert(
  stripUnplayableProjectRoomVideos(withDead.roomPosts, liveTape.post).every(
    (post) => post.mediaUrl !== deadPublic
  ),
  "unplayable same-author tapes are stripped before merge"
);

const saveKey = projectRoomStudioSaveKey("project_keep_me", {
  name: "tape.mp4",
  size: 62 * 1024 * 1024,
  lastModified: 1,
});
let runs = 0;
void (async () => {
  const first = runProjectRoomStudioSaveOnce(saveKey, async () => {
    runs += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  const joined = runProjectRoomStudioSaveOnce(saveKey, async () => {
    runs += 1;
  });
  await Promise.all([first, joined]);
  assert(runs === 1, `in-flight studio save must be single-flight, ran ${runs} times`);
  await runProjectRoomStudioSaveOnce(saveKey, async () => {
    runs += 1;
  });
  assert(runs === 1, "finished studio save cannot post the same tape again");

  const failKey = projectRoomStudioSaveKey("project_keep_me", {
    name: "retry.mp4",
    size: 62 * 1024 * 1024,
    lastModified: 2,
  });
  let retryRuns = 0;
  try {
    await runProjectRoomStudioSaveOnce(failKey, async () => {
      retryRuns += 1;
      throw new Error("This video didn't finish saving to Board storage. Try uploading it again.");
    });
  } catch {
    // expected
  }
  await runProjectRoomStudioSaveOnce(failKey, async () => {
    retryRuns += 1;
  });
  assert(retryRuns === 2, `failed studio save must upload again, ran ${retryRuns} times`);
  console.log("projectRoomDrop.test.ts: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
