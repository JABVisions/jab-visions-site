import {
  activityFromProjectRoomPost,
  applyCommittedRoomPostGuard,
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
  projectRoomDropDownloadKind,
  projectRoomDropTitle,
  projectRoomMediaKindForFile,
  projectRoomPostHasMedia,
  projectRoomPostIsVideo,
  projectRoomPostStorageCoords,
  projectHasVisibleRoomDrop,
  PROJECT_ROOM_CLOUD_SYNC_TIMEOUT_MS,
  projectRoomStudioSaveKey,
  projectRoomVideoLoadError,
  projectRoomVideoPlaybackType,
  projectRoomVideoSrcIsPlayable,
  isUnplayableProjectRoomVideoPost,
  rememberCommittedRoomPosts,
  removeProjectRoomPost,
  stripUnplayableProjectRoomVideos,
  runProjectRoomStudioSaveOnce,
  viewerCanPostToProjectRoom,
  withDeadline,
} from "./projectRoomDrop";
import { mergeProjectRecord, preferLiveRoomPosts, reconcileProjectsWithLive, type BoardProject } from "./projects";
import { mergeNotebookRoomPosts, profileBoardDropFromProject } from "./projectProfileDrop";

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
assert(
  built.activity.href === "https://cdn.example/tape.mp4",
  "playable non-public media URLs can stay on activity href"
);
assert(!built.coverMedia, "existing cover is left in place");

const publicTape = buildProjectRoomDrop({
  project,
  media: {
    kind: "video",
    src: "https://ywvzwtpy.supabase.co/storage/v1/object/public/board-media/user/project-media/tape.mp4",
    bucket: "board-media",
    storagePath: "user/project-media/tape.mp4",
  },
  author: {
    id: "user_zoe",
    displayName: "Board User",
    username: "johnandy",
  },
  fileName: "tape.mp4",
  dropId: "project_room_public_tape",
});
assert(
  publicTape.activity.href == null,
  "public board-media URLs must not become feed hrefs"
);
assert(
  publicTape.activity.meta?.bucket === "board-media" &&
    publicTape.activity.meta?.storagePath === "user/project-media/tape.mp4",
  "feed activity keeps private coords so ActivityCard can createSignedUrl"
);

const postedWithPoster = buildProjectRoomDrop({
  project,
  media: {
    kind: "video",
    src: "https://cdn.example/tape.mp4",
    bucket: "board-media",
    storagePath: "user/project-media/tape.mp4",
    posterUrl:
      "https://example.supabase.co/storage/v1/object/sign/board-media/user/project-cover/still.jpg?token=1",
    posterBucket: "board-media",
    posterStoragePath: "user/project-cover/still.jpg",
  },
  author: {
    id: "user_zoe",
    displayName: "Zoe",
    username: "zoe",
  },
  fileName: "tape.mp4",
  dropId: "project_room_poster_tape",
  postId: "post_poster_tape",
});
assert(
  postedWithPoster.activity.image_url?.includes("project-cover/still.jpg") === true,
  "video room drops expose a poster still, not a blank player"
);
assert(
  postedWithPoster.activity.meta?.posterStoragePath === "user/project-cover/still.jpg",
  "video room drops keep poster coords for signed thumbs"
);
assert(
  postedWithPoster.post.posterStoragePath === "user/project-cover/still.jpg",
  "ROOM DROPS persist the still path without re-uploading the tape"
);
assert(
  activityFromProjectRoomPost(postedWithPoster.post, project).meta?.posterStoragePath ===
    "user/project-cover/still.jpg",
  "ActivityCard can sign the stored poster for the feed"
);

const emptyCoverVideo = { ...project, media: undefined };
const posterCover = buildProjectRoomDrop({
  project: emptyCoverVideo,
  media: {
    kind: "video",
    src: "https://cdn.example/tape.mp4",
    bucket: "board-media",
    storagePath: "user/project-media/tape.mp4",
    posterUrl: "https://cdn.example/still.jpg",
    posterBucket: "board-media",
    posterStoragePath: "user/project-cover/still.jpg",
  },
  author: { id: "user_host", displayName: "John Andy" },
  fileName: "tape.mp4",
  dropId: "project_room_poster_cover",
});
assert(posterCover.coverMedia?.kind === "image", "video still becomes the notebook thumbnail");
assert(
  posterCover.coverMedia?.storagePath === "user/project-cover/still.jpg",
  "notebook thumb uses the small still, not the 65MB tape"
);

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

const feedLike = activityFromProjectRoomPost(committed.saved.roomPosts[0], committed.saved);
assert(feedLike.kind === "board_drop", "room renderer uses the feed drop kind");
assert(feedLike.meta?.mediaKind === "video", "room renderer keeps video playback fields");
assert(feedLike.meta?.bucket === "board-media", "room renderer keeps private bucket coords");
assert(
  String(feedLike.meta?.storagePath || "").includes("project-media/tape.mp4"),
  "room renderer keeps storage path for signed playback"
);
assert(feedLike.meta?.authorName === "Zoe", "room renderer keeps the drop author");
assert(
  projectRoomDropDownloadKind(committed.saved.roomPosts[0]) === "video",
  "room download uses the video file, not a public 403 URL"
);

const removableProject = { ...committed.saved, id: "project_remove_room" };
const removed = removeProjectRoomPost(removableProject, "post_tape");
assert(removed.removed?.id === "post_tape", "remove targets that room Drop");
assert(
  !removed.project.roomPosts.some((post) => post.id === "post_tape"),
  "remove deletes only that room Drop"
);
assert(
  removed.project.roomPosts.some((post) => post.id === "post_welcome"),
  "remove must not wipe the rest of the room"
);
const resurrected = preferLiveRoomPosts(
  [
    {
      ...removableProject,
      roomPosts: [built.post, ...(project.roomPosts ?? [])],
    },
  ],
  [removed.project]
);
assert(
  !resurrected[0]?.roomPosts.some((post) => post.id === "post_tape"),
  "stale hydrate cannot bring a removed room Drop back"
);
assert(
  resurrected[0]?.roomPosts.some((post) => post.id === "post_welcome"),
  "tombstone still keeps the rest of the room"
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
    mediaUrl: "",
  }),
  "video posts with no src and no coords are unplayable"
);
assert(
  !isUnplayableProjectRoomVideoPost({
    mediaKind: "video",
    mediaUrl: deadPublic,
    bucket: "board-media",
    storagePath: "user/project-media/dead.mp4",
  }),
  "storage coords can re-sign a public 403 URL, so the Drop stays"
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
  projectHasVisibleRoomDrop(replacedDead, {
    storagePath: "user/project-media/dead.mp4",
  }),
  "a previous tape with storage coords is not deleted by the next save"
);
assert(
  stripUnplayableProjectRoomVideos(
    [
      {
        id: "post_dead_url",
        authorName: "Zoe",
        authorId: "user_zoe",
        text: "Zoe posted an audition tape in Those Ryderz.",
        createdAt: 1_700_000_150_000,
        mediaUrl: "",
        mediaKind: "video" as const,
      },
      ...(project.roomPosts ?? []),
    ],
    liveTape.post
  ).every((post) => post.id !== "post_dead_url"),
  "unplayable same-author tapes without coords are stripped before merge"
);

const signedSameTape = {
  ...built.post,
  id: "post_signed_same",
  mediaUrl:
    "https://example.supabase.co/storage/v1/object/sign/board-media/user/project-media/tape.mp4?token=abc",
  bucket: "board-media",
  storagePath: "user/project-media/tape.mp4",
};
assert(
  mergeRoomPosts([built.post, signedSameTape], []).length === 1,
  "signed URL and storage path for the same tape must stay one room Drop"
);

const wipedAfterCommit = {
  ...committed.saved,
  roomPosts: project.roomPosts,
};
rememberCommittedRoomPosts("project_keep_me", committed.saved.roomPosts);
const restored = applyCommittedRoomPostGuard([wipedAfterCommit]);
assert(
  restored[0]?.roomPosts.some((post) => post.id === "post_tape"),
  "a stale notebook reload must restore the just-committed tape"
);

const rewound = preferLiveRoomPosts([wipedAfterCommit], [committed.saved]);
assert(
  rewound[0]?.roomPosts.some((post) => post.mediaUrl === "https://cdn.example/tape.mp4"),
  "stale React state must not rewind live room posts"
);
assert(
  preferLiveRoomPosts([], [committed.saved]).length === 1,
  "an empty stale render must not wipe live room posts from the ref"
);
assert(
  preferLiveRoomPosts([], [committed.saved])[0]?.roomPosts.some(
    (post) => post.id === "post_tape"
  ),
  "empty stale render still keeps the committed tape"
);
assert(
  !preferLiveRoomPosts([{ ...project, id: "project_other" }], [committed.saved]).some(
    (item) => item.id === "project_keep_me"
  ),
  "preferLiveRoomPosts must not resurrect a deleted project"
);

const notebookRow = profileBoardDropFromProject(committed.saved);
assert(
  Array.isArray((notebookRow as { roomPosts?: unknown[] }).roomPosts) &&
    (notebookRow as { roomPosts: Array<{ storagePath?: string }> }).roomPosts.some(
      (post) => post.storagePath === "user/project-media/tape.mp4"
    ),
  "cloud notebook rows must persist room Drop storage paths"
);
assert(
  Array.isArray((notebookRow as { meta?: { roomPosts?: unknown[] } }).meta?.roomPosts) &&
    ((notebookRow as { meta: { roomPosts: Array<{ dropId?: string }> } }).meta.roomPosts.some(
      (post) => post.dropId === "project_room_tape"
    )),
  "cloud notebook meta must keep the room Drop id"
);
assert(
  (notebookRow as { roomPosts: Array<{ mediaUrl?: string; storagePath?: string }> }).roomPosts.every(
    (post) => !post.storagePath || !post.mediaUrl
  ),
  "notebook persist must not store giant signed URLs when storage coords exist"
);

const coordsOnly = buildProjectRoomDrop({
  project,
  media: {
    kind: "video",
    src: "",
    bucket: "board-media",
    storagePath: "user/project-media/late-sign.mp4",
  },
  author: { id: "user_zoe", displayName: "Zoe", username: "zoe" },
  fileName: "late-sign.mp4",
  dropId: "project_room_late",
  postId: "post_late",
});
const committedLate = commitProjectRoomDrop([project], project, coordsOnly);
assert(
  projectHasVisibleRoomDrop(committedLate.saved, {
    dropId: "project_room_late",
    storagePath: "user/project-media/late-sign.mp4",
  }),
  "commit creates a visible room post even if the signed URL is late"
);
assert(
  projectRoomPostHasMedia(coordsOnly.post),
  "renderer includes video posts that only have storage coords"
);
assert(
  activityFromProjectRoomPost(committedLate.saved.roomPosts[0], committedLate.saved).meta
    ?.mediaKind === "video",
  "room renderer still treats coords-only posts as feed video Drops"
);
assert(
  !isUnplayableProjectRoomVideoPost({
    mediaKind: "video",
    mediaUrl: "",
    bucket: "board-media",
    storagePath: "user/project-media/late-sign.mp4",
  }),
  "coords-only videos are not stripped as unplayable"
);

const staleNotebook = {
  ...committedLate.saved,
  roomPosts: project.roomPosts,
};
rememberCommittedRoomPosts("project_keep_me", committedLate.saved.roomPosts);
const guardedLate = applyCommittedRoomPostGuard([staleNotebook]);
assert(
  projectHasVisibleRoomDrop(guardedLate[0], {
    storagePath: "user/project-media/late-sign.mp4",
  }),
  "hydrate cannot wipe a fresh coords-only commit"
);
const reconciledLate = reconcileProjectsWithLive([staleNotebook], [committedLate.saved]);
assert(
  projectHasVisibleRoomDrop(reconciledLate[0], { dropId: "project_room_late" }),
  "load/seed/merge must keep a just-committed room video"
);

const staleCloud = [
  {
    id: "post_welcome",
    authorName: "John Andy",
    text: "Welcome in.",
    createdAt: 1_700_000_060_000,
  },
];
const mergedCloud = mergeNotebookRoomPosts(staleCloud, committed.saved.roomPosts);
assert(
  mergedCloud.some((post) => post.storagePath === "user/project-media/tape.mp4"),
  "a stale cloud persist cannot drop a committed room Drop"
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

  assert(
    PROJECT_ROOM_CLOUD_SYNC_TIMEOUT_MS <= 4_000 && PROJECT_ROOM_CLOUD_SYNC_TIMEOUT_MS >= 2_000,
    "cloud activity must time out in seconds so a hung network cannot clone the post"
  );
  const hangKey = projectRoomStudioSaveKey("project_keep_me", {
    name: "persist-hang.mp4",
    size: 62 * 1024 * 1024,
    lastModified: 3,
  });
  let committed = false;
  const started = Date.now();
  await runProjectRoomStudioSaveOnce(hangKey, async () => {
    committed = true;
    await withDeadline(new Promise<void>(() => {}), 40, undefined);
  });
  assert(committed, "room Drop commits before persist/activity");
  assert(
    Date.now() - started < 1_000,
    "a hung persist/activity promise cannot block studio close"
  );
  let secondHang = 0;
  await runProjectRoomStudioSaveOnce(hangKey, async () => {
    secondHang += 1;
  });
  assert(secondHang === 0, "retry after a posted tape must not clone the room Drop");

  const timed = await withDeadline(Promise.resolve("saved"), 50, "timeout");
  assert(timed === "saved", "finished persist wins the deadline race");
  const missed = await withDeadline(new Promise<string>(() => {}), 20, "timeout");
  assert(missed === "timeout", "hung persist resolves to the deadline fallback");

  console.log("projectRoomDrop.test.ts: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
