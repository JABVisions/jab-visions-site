import {
  collapseAuthCookies,
  cookiesFromSession,
} from "./authCookies";
import { isBoardAuthRoute, safeBoardNext } from "./boardPaths";
import { supabaseAuthCookieName } from "./config";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(safeBoardNext("/board/feed") === "/board/feed", "feed next stays on feed");
assert(
  safeBoardNext("/board/work?tab=desk") === "/board/work?tab=desk",
  "work next keeps query"
);
assert(safeBoardNext("/board/login") === "/board/feed", "login next does not bounce");
assert(
  safeBoardNext("/board/login?next=/board/feed") === "/board/feed",
  "nested login next does not bounce"
);
assert(safeBoardNext("/elsewhere") === "/board/feed", "non-board next is rejected");
assert(safeBoardNext("//evil.com") === "/board/feed", "protocol-relative next is rejected");
assert(
  safeBoardNext("%2Fboard%2Ffeed") === "/board/feed",
  "encoded board next is decoded"
);
assert(isBoardAuthRoute("/board/signup"), "signup is an auth route");
assert(!isBoardAuthRoute("/board/feed"), "feed is not an auth route");

const collapsed = collapseAuthCookies(
  [
    { name: "sb-demo-auth-token", value: "session-1", options: { maxAge: 100 } },
    { name: "sb-demo-auth-token", value: "", options: { maxAge: 0 } },
    { name: "other", value: "keep" },
  ],
  { keepSession: true }
);

assert(
  collapsed.some((cookie) => cookie.name === "sb-demo-auth-token" && cookie.value === "session-1"),
  "session cookie survives a later wipe"
);
assert(
  collapsed.some((cookie) => cookie.name === "other" && cookie.value === "keep"),
  "unrelated cookies are preserved"
);

const lastWins = collapseAuthCookies([
  { name: "a", value: "1" },
  { name: "a", value: "2" },
]);
assert(lastWins.length === 1 && lastWins[0].value === "2", "later cookie writes win");

assert(
  supabaseAuthCookieName("https://ywvzwtpycuhapdxevqsc.supabase.co") ===
    "sb-ywvzwtpycuhapdxevqsc-auth-token",
  "cookie name follows the project ref"
);

const synthesized = cookiesFromSession("https://demo.supabase.co", {
  access_token: "aaa",
  refresh_token: "bbb",
  user: { id: "user-1" },
});
assert(synthesized.length >= 1, "session is written as one or more cookie chunks");
assert(
  synthesized[0].name === "sb-demo-auth-token" || synthesized[0].name.startsWith("sb-demo-auth-token."),
  "synthesized cookies use the project storage key"
);
assert(synthesized[0].value.startsWith("base64-"), "synthesized cookies use supabase ssr encoding");

console.log("authCookies.check.ts: ok");
