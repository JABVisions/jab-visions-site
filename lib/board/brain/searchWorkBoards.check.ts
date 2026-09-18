import { matchWorkBoards } from "./searchWorkBoards";
import { creatorFromProfile } from "./workBoardPreview";
import { DEFAULT_ORB_AVATAR } from "../friendZoneOrbs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co";

const boards = matchWorkBoards(
  [
    {
      id: "user-maya",
      username: "maya",
      display_name: "Maya",
      bio: "Product designer",
      avatar_url: null,
      board_style: {
        displayName: "Maya",
        avatarPath: "user-maya/avatar-77.jpg",
        workDesk: { job: "Designer" },
      },
    },
  ],
  "designer"
);

assert(boards.length === 1, "work board search matches the designer");
assert(
  boards[0].avatarUrl?.includes("user-maya/avatar-77.jpg"),
  "work board search uses profile avatarPath"
);
assert(boards[0].avatarUrl !== DEFAULT_ORB_AVATAR, "work board search does not drop avatarPath");

const creator = creatorFromProfile({
  id: "user-maya",
  username: "maya",
  display_name: "Maya",
  avatar_url: null,
  board_style: { avatarPath: "user-maya/avatar-77.jpg", workDesk: { job: "Designer" } },
});
assert(creator?.avatarUrl?.includes("user-maya/avatar-77.jpg"), "work board preview uses avatarPath");

console.log("work board avatar path checks passed");
