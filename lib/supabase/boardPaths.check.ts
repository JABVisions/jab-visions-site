import { isPublicBoardRoute, isPublicForumsRoute } from "./boardPaths";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(isPublicForumsRoute("/board/forums") === true, "hallway is a public Forums route");
assert(isPublicForumsRoute("/board/forums/music") === true, "Room interiors are public to read");
assert(isPublicBoardRoute("/board/forums") === true, "incognito can open the hallway");
assert(isPublicBoardRoute("/board/forums/those-ryderz") === true, "incognito can open official rooms");
assert(isPublicBoardRoute("/board/feed") === false, "feed stays login-gated");
assert(isPublicBoardRoute("/board/login") === true, "login remains a public Board route");

console.log("forums public board path checks passed");
