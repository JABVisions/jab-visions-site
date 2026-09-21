import { classifyDropbookLinkUrl, isYouTubeDropUrl } from "./dropbookLink";
import { canonicalDropType } from "./dropDisplay";
import { dedupeDropItems, dropDedupeKey, type DropItem } from "./dropItem";
import {
  dedupeActivity,
  mergeActivityWithFeed,
  hydrateFeedWithNotebook,
  universalDropToActivity,
} from "./feedActivity";
import { activityLooksLikeStoredImage, activityLooksLikeStreamingMusicDrop } from "./feedDropMedia";
import { activityDropFamily, activityFamiliesCompatible } from "./activityMerge";
import {
  buildProjectRoomDrop,
  commitProjectRoomDrop,
} from "./projectRoomDrop";
import { mergeUniversalDrops, pushDrop, readDrops, writeDrops, type UniversalDrop } from "./drops/storage";
import { toSoundCloudEmbed } from "./soundCloudEmbed";
import type { BoardActivity } from "./activity";
import type { BoardProject } from "./projects";

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
    sessionStorage: localStorage,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
  };
  (globalThis as any).window = windowLike;
  (globalThis as any).localStorage = localStorage;
  (globalThis as any).sessionStorage = localStorage;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

installLocalStorage();

const LANA = "https://soundcloud.com/lanadelrey/video-games";
const LANA_ART = "https://i1.sndcdn.com/artworks-lana-del-rey-t500x500.jpg";
const LANA_EMBED = toSoundCloudEmbed(LANA);
const YOUTUBE = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const AUDITION_PATH = "user/those-ryderz/zoe-folie-audition.MOV";
const AUDITION_URL =
  "https://ywvzwtpy.supabase.co/storage/v1/object/sign/board-media/user/those-ryderz/zoe-folie-audition.MOV?token=tape";

assert(classifyDropbookLinkUrl(LANA) === "music", "SoundCloud stays Music");
assert(classifyDropbookLinkUrl(YOUTUBE) === "youtube", "YouTube stays not-Music");
assert(isYouTubeDropUrl(YOUTUBE), "youtube-not-music still holds");
assert(LANA_EMBED, "Lana SoundCloud URL still builds a player");
assert(
  canonicalDropType("Music", { url: LANA, embedUrl: LANA_EMBED }) === "Music",
  "canonical type stays Music"
);

const lanaActivity: BoardActivity = {
  id: "activity_lana_soundcloud",
  created_at: new Date("2026-09-01T12:00:00.000Z").toISOString(),
  user_id: "user-jab",
  kind: "board_drop",
  title: "Lana Del Rey",
  body: "New Music Drop added to Board.",
  href: LANA,
  image_url: LANA_ART,
  meta: {
    dropId: "lana_soundcloud_1",
    dropType: "Music",
    drop_flavor: "music",
    embedUrl: LANA_EMBED,
    mediaUrl: LANA_ART,
    mediaKind: "image",
    ownerUsername: "jabvisions",
  },
};

const zoeActivity: BoardActivity = {
  id: "project_room_zoe_audition",
  created_at: new Date("2026-09-21T16:00:00.000Z").toISOString(),
  user_id: "user-jab",
  kind: "board_drop",
  title: "THOSE RYDERZ — Audition tape",
  body: "Zoe Folie posted an audition tape in THOSE RYDERZ.",
  href: AUDITION_URL,
  image_url: "https://cdn.example/zoe-poster.jpg",
  meta: {
    cardStyle: "project_room_drop",
    origin: "project_room",
    dropId: "project_room_zoe_audition",
    projectId: "those-ryderz",
    dropType: "video",
    drop_flavor: "video",
    mediaKind: "video",
    mediaUrl: AUDITION_URL,
    bucket: "board-media",
    storagePath: AUDITION_PATH,
    ownerUsername: "jabvisions",
  },
};

assert(activityDropFamily(lanaActivity) === "streaming_music", "Lana is streaming music");
assert(activityDropFamily(zoeActivity) === "stored_video", "Zoe audition is stored video");
assert(
  !activityFamiliesCompatible(lanaActivity, zoeActivity),
  "Music and audition families never merge"
);

const collided = dedupeActivity([
  lanaActivity,
  zoeActivity,
  {
    ...zoeActivity,
    id: "local_newer_audition",
    created_at: new Date("2026-09-21T16:05:00.000Z").toISOString(),
    meta: {
      ...zoeActivity.meta,
      dropId: "lana_soundcloud_1",
      projectId: "those-ryderz",
    },
  },
]);

assert(
  collided.some((item) => item.href === LANA && String(item.meta?.dropType) === "Music"),
  "Lana SoundCloud href survives even if the audition reuses her dropId"
);
assert(
  collided.some((item) => String(item.meta?.storagePath) === AUDITION_PATH),
  "Zoe audition video survives alongside Lana"
);

const lanaHref = collided.find((item) => item.href === LANA);
assert(lanaHref?.href === LANA, "merge never replaces the SoundCloud href with the tape");
assert(
  !/zoe-folie-audition/i.test(String(lanaHref?.href || "")),
  "Lana href is not the audition video"
);
assert(
  activityLooksLikeStreamingMusicDrop(lanaHref!),
  "Lana is still streaming music after audition hydrate"
);
assert(!activityLooksLikeStoredImage(lanaHref!), "Lana is still not a Vision image");

const recoveredLana: BoardActivity = {
  ...lanaActivity,
  id: "profile_board_drop_user-jab_lana_soundcloud_1",
  body: "New music drop from JAB Visions.",
  href: LANA_ART,
  meta: {
    ...lanaActivity.meta,
    source: "profiles.board_style.boardDrops",
    mediaKind: "image",
  },
};
const recoveredMix = dedupeActivity([zoeActivity, recoveredLana, lanaActivity]);
assert(
  recoveredMix.filter((item) => activityDropFamily(item) === "streaming_music").length >= 1,
  "recovered Lana still present with Zoe"
);
assert(
  recoveredMix.some((item) => item.href === LANA),
  "recovered hydrate keeps the SoundCloud track URL"
);
assert(
  recoveredMix.some((item) => String(item.meta?.storagePath) === AUDITION_PATH),
  "audition is not collapsed into the Music Drop"
);

const lanaDrop: DropItem = {
  id: "lana_soundcloud_1",
  title: "Lana Del Rey",
  type: "Music",
  createdAt: 1,
  url: LANA,
  embedUrl: LANA_EMBED,
};
const zoeDrop: DropItem = {
  id: "project_room_zoe_audition",
  title: "THOSE RYDERZ — Audition tape",
  type: "Media",
  createdAt: 2,
  url: AUDITION_URL,
  mediaUrl: AUDITION_URL,
  mediaKind: "video",
  bucket: "board-media",
  storagePath: AUDITION_PATH,
};
const sameIdTape: DropItem = {
  ...zoeDrop,
  id: "lana_soundcloud_1",
};
const afterItems = dedupeDropItems([lanaDrop, zoeDrop, sameIdTape]);
assert(afterItems.some((drop) => drop.id === "lana_soundcloud_1" && drop.url === LANA), "Drop list keeps Lana URL");
assert(
  afterItems.some((drop) => drop.storagePath === AUDITION_PATH),
  "Drop list keeps the Zoe tape even if ids collide"
);
assert(dropDedupeKey(lanaDrop) === "id:lana_soundcloud_1", "Lana still keys by drop id");

const lanaUniversal: UniversalDrop = {
  id: "lana_soundcloud_1",
  type: "music",
  title: "Lana Del Rey",
  createdAt: 1,
  url: LANA,
  embedUrl: LANA_EMBED,
  mediaUrl: LANA_ART,
  origin: "create",
};
const zoeUniversal: UniversalDrop = {
  id: "project_room_zoe_audition",
  type: "video",
  title: "THOSE RYDERZ — Audition tape",
  createdAt: 2,
  url: AUDITION_URL,
  mediaUrl: AUDITION_URL,
  mediaKind: "video",
  origin: "project_room",
  projectId: "those-ryderz",
  meta: { origin: "project_room", dropType: "video", storagePath: AUDITION_PATH },
};

writeDrops([lanaUniversal]);
pushDrop(zoeUniversal);
const stored = readDrops();
assert(stored.some((drop) => drop.id === "lana_soundcloud_1" && drop.url === LANA), "pushDrop appends, does not replace Lana");
assert(stored.some((drop) => drop.id === "project_room_zoe_audition"), "pushDrop keeps the audition");
assert(
  mergeUniversalDrops([zoeUniversal, lanaUniversal]).length === 2,
  "universal merge keeps both families"
);

memory.set("jab_board_drops_v2:user-jab", JSON.stringify([lanaUniversal]));
memory.set("jab_board_drops_v2", JSON.stringify([zoeUniversal]));
const unioned = readDrops();
assert(
  unioned.some((drop) => drop.url === LANA) && unioned.some((drop) => drop.id === "project_room_zoe_audition"),
  "scoped Music Drops union with the unscoped audition write"
);

const asActivities = [lanaUniversal, zoeUniversal]
  .map((drop) => universalDropToActivity(drop))
  .filter(Boolean) as BoardActivity[];
const fromUniversal = dedupeActivity(asActivities);
assert(fromUniversal.some((item) => item.href === LANA), "universal hydrate keeps Lana href");
assert(
  fromUniversal.some((item) => String(item.meta?.origin) === "project_room"),
  "universal hydrate keeps the audition"
);

const project: BoardProject = {
  id: "those-ryderz",
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_100_000,
  title: "THOSE RYDERZ",
  logline: "Zoe Folie audition.",
  projectType: "Feature Film",
  status: "casting",
  location: "NYC",
  startDate: "07/01/2026",
  unionStatus: "SAG-AFTRA",
  compensationType: "Paid",
  rolesNeeded: "Lead",
  contactName: "John Andy",
  contactEmail: "john@example.com",
  authorId: "user-jab",
  authorName: "John Andy",
  authorUsername: "jabvisions",
  media: {
    kind: "image",
    src: "https://cdn.example/cover.jpg",
    bucket: "board-media",
    storagePath: "user/project-cover/cover.jpg",
  },
  invites: [],
  roomPosts: [],
};

const built = buildProjectRoomDrop({
  project,
  media: {
    kind: "video",
    src: AUDITION_URL,
    bucket: "board-media",
    storagePath: AUDITION_PATH,
  },
  author: {
    id: "user-jab",
    displayName: "Zoe Folie",
    username: "zoe",
  },
  fileName: "zoe-folie-audition.MOV",
  dropId: "project_room_zoe_audition",
});

writeDrops([lanaUniversal]);
const committed = commitProjectRoomDrop([project], project, built);
pushDrop(built.drop);
const afterCommit = readDrops();
assert(committed.projects.length === 1, "commit updates the project list, not the global Music Drop list");
assert(
  afterCommit.some((drop) => drop.id === "lana_soundcloud_1" && drop.url === LANA),
  "project room commit does not erase the SoundCloud Drop"
);
assert(
  afterCommit.some((drop) => drop.id === built.dropId),
  "project room commit still lands the audition Drop"
);

const feedMix = mergeActivityWithFeed([lanaActivity], []);
const withZoe = mergeActivityWithFeed([lanaActivity, built.activity], []);
assert(feedMix.some((item) => item.href === LANA), "feed merge includes Lana before audition");
assert(withZoe.some((item) => item.href === LANA), "feed merge includes Lana after audition");
assert(
  withZoe.some((item) => String(item.meta?.storagePath || item.meta?.dropId || "").includes("zoe") || String(item.title || "").includes("Audition")),
  "feed merge includes Zoe audition"
);

const apiPageIsOnlyAudition = hydrateFeedWithNotebook([built.activity]);
assert(
  apiPageIsOnlyAudition.some((item) => item.href === LANA),
  "hydrate unions local Music Drops so an audition-only API page cannot wipe Lana"
);
assert(
  apiPageIsOnlyAudition.some((item) => String(item.meta?.origin) === "project_room"),
  "hydrate still includes the audition"
);

const youtubeActivity: BoardActivity = {
  id: "yt_1",
  created_at: new Date().toISOString(),
  user_id: "user-jab",
  kind: "board_drop",
  title: "Never Gonna Give You Up",
  body: "New YouTube Drop added to Board.",
  href: YOUTUBE,
  image_url: null,
  meta: { dropType: "YouTube", dropId: "yt_1" },
};
const withYoutube = mergeActivityWithFeed([lanaActivity, youtubeActivity, built.activity], []);
assert(
  withYoutube.some((item) => item.href === YOUTUBE && String(item.meta?.dropType) === "YouTube"),
  "YouTube stays not-Music after audition + SoundCloud merge"
);

const failedEmbed = {
  ...lanaActivity,
  meta: { ...lanaActivity.meta, embedUrl: null },
};
assert(failedEmbed.href === LANA, "embed failure keeps the SoundCloud card href");
assert(
  mergeActivityWithFeed([failedEmbed, built.activity], []).some((item) => item.href === LANA),
  "embed failure still cannot drop Lana when Zoe posts"
);

console.log("auditionWipeSoundCloud.check.ts: ok");
