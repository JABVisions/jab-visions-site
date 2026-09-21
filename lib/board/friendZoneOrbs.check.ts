import {
  DEFAULT_ORB_AVATAR,
  deriveFriendZoneState,
  formatFriendZoneLastActive,
  hostedOrbAvatarUrl,
  mergeFriendZoneOrbs,
  orbFromProfileLike,
  orbsFromActivityRows,
  publicOrbAvatarUrl,
  type FriendZoneActivityRow,
} from "./friendZoneOrbs";
import type { FriendZoneOrbUser } from "./friendZoneSignals";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

const oldDrop: FriendZoneActivityRow = {
  user_id: "user-old",
  kind: "board_drop",
  created_at: daysAgo(40),
  meta: { authorUsername: "johnandy", authorName: "John Andy" },
};

const onlinePresence: FriendZoneActivityRow = {
  user_id: "user-live",
  kind: "system",
  created_at: minutesAgo(2),
  meta: {
    presence: true,
    lastSeenAt: minutesAgo(2),
    authorUsername: "betaonline",
    authorName: "Beta Online",
  },
};

assert(formatFriendZoneLastActive(minutesAgo(2)) === "Active now", "recent presence is Active now");
assert(
  deriveFriendZoneState([oldDrop, onlinePresence], daysAgo(40), minutesAgo(2)) === "active",
  "currently online users stay active even with old drops"
);
assert(
  deriveFriendZoneState([oldDrop], daysAgo(40), daysAgo(40)) === "phantom",
  "old drop-only users stay phantom"
);

const activityOrbs = orbsFromActivityRows([oldDrop, onlinePresence], {
  currentUserId: "viewer",
  limit: 18,
});
assert(
  activityOrbs.some((orb) => orb.username === "betaonline" && orb.lastActiveLabel === "Active now"),
  "presence rows become Friend Zone orbs"
);
assert(
  activityOrbs.some((orb) => orb.username === "johnandy"),
  "older drop authors remain in Friend Zone"
);

const liveProfile = orbFromProfileLike({
  id: "user-live",
  username: "betaonline",
  displayName: "Beta Online",
  lastSeenAt: minutesAgo(1),
});
assert(liveProfile?.relationshipState === "active", "profile lastSeenAt marks Active");
assert(liveProfile?.lastActiveLabel === "Active now", "profile lastSeenAt labels Active now");

const merged = mergeFriendZoneOrbs(
  [
    [
      {
        id: "user-old",
        name: "John Andy",
        username: "johnandy",
        avatarUrl: "/assets/board-welcome-mark.jpg",
        lastActiveLabel: "Jun 11",
        relationshipState: "phantom",
      },
      {
        id: "user-old-2",
        name: "M",
        username: "mshantayah",
        avatarUrl: "/assets/board-welcome-mark.jpg",
        lastActiveLabel: "Jun 8",
        relationshipState: "phantom",
      },
    ] satisfies FriendZoneOrbUser[],
    [liveProfile!],
  ],
  { currentUserId: "viewer", limit: 18 }
);

assert(merged.length === 3, "online users merge into existing activity orbs");
assert(merged[0].username === "betaonline", "currently online users sort first");
assert(
  !merged.some((orb) => orb.id === "viewer"),
  "the viewing user is excluded from Friend Zone"
);

const signedMerge = mergeFriendZoneOrbs(
  [
    [
      {
        id: "user-maya",
        name: "Maya",
        username: "maya",
        avatarUrl:
          "https://abc.supabase.co/storage/v1/object/sign/board-avatars/user-maya/avatar.jpg?token=keep-me",
        lastActiveLabel: "2h ago",
        relationshipState: "fresh",
      },
    ] satisfies FriendZoneOrbUser[],
    [
      {
        id: "user-maya",
        name: "Maya",
        username: "maya",
        avatarUrl: "https://abc.supabase.co/storage/v1/object/public/board-avatars/user-maya/avatar.jpg",
        lastActiveLabel: "Active now",
        relationshipState: "active",
      },
    ],
  ],
  { currentUserId: "viewer", limit: 18 }
);
assert(
  signedMerge[0].avatarUrl.includes("token=keep-me"),
  "signed avatar tokens survive Friend Zone merges"
);

assert(
  publicOrbAvatarUrl("data:image/png;base64,abc") === DEFAULT_ORB_AVATAR,
  "data URLs stay out of Friend Zone orbs"
);
assert(
  hostedOrbAvatarUrl("") === "",
  "Forums orbs do not invent a default photo when someone has no Board avatar"
);
assert(
  hostedOrbAvatarUrl("https://cdn.example.com/maya.jpg") === "https://cdn.example.com/maya.jpg",
  "avatar URL is passed to Forums UI when a Friendzone photo exists"
);
const signedKept = publicOrbAvatarUrl(
  "https://abc.supabase.co/storage/v1/object/sign/board-avatars/user-1/avatar.jpg?token=secret"
);
assert(
  signedKept.includes("/storage/v1/object/sign/board-avatars/user-1/avatar.jpg") &&
    signedKept.includes("token=secret"),
  "signed avatar URLs keep their token"
);

process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co";

const pathOrb = orbFromProfileLike({
  id: "user-maya",
  username: "maya",
  displayName: "Maya",
  boardStyle: { avatarPath: "user-maya/avatar-77.jpg" },
});
assert(pathOrb?.avatarUrl.includes("user-maya/avatar-77.jpg"), "profile avatarPath becomes an orb photo");
assert(pathOrb?.avatarUrl !== DEFAULT_ORB_AVATAR, "avatarPath does not fall back to the welcome mark");

console.log("friend zone online orb checks passed");
