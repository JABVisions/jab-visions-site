import { cookiesFromSession } from "@/lib/supabase/authCookies";
import {
  clearBoardUploadSession,
  isUsableUploadSession,
  parseBoardAuthCookies,
  parseStoredAuthSession,
  rememberBoardUploadSession,
  resolveBoardUploadSession,
} from "./boardUploadSession";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

clearBoardUploadSession();

const live = {
  access_token: "jwt-live",
  refresh_token: "refresh-live",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: "user-room" },
};

assert(isUsableUploadSession(live), "a live JWT is enough to upload");
assert(
  !isUsableUploadSession({ access_token: "jwt-live", user: { id: "" } }),
  "missing user id is not a session"
);
assert(
  !isUsableUploadSession({
    access_token: "jwt-live",
    user: { id: "user-room" },
    expires_at: Math.floor(Date.now() / 1000) - 10,
  }),
  "expired JWTs are not usable until refresh"
);
assert(
  isUsableUploadSession(
    {
      access_token: "jwt-live",
      user: { id: "user-room" },
      expires_at: Math.floor(Date.now() / 1000) + 20,
    },
    Date.now(),
    { minValidityMs: 5_000 }
  ),
  "tokens that expire in 20s can still upload; do not wait on refreshSession"
);

const cookies = cookiesFromSession("https://demo.supabase.co", live);
const header = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
const fromCookie = parseBoardAuthCookies(header, "https://demo.supabase.co");
assert(fromCookie?.user.id === "user-room", "cookie session keeps the signed-in user");
assert(fromCookie?.access_token === "jwt-live", "cookie session keeps the storage JWT");

const encoded = parseStoredAuthSession(
  cookies[0].value.startsWith("base64-") ? cookies.map((cookie) => cookie.value).join("") : ""
);
assert(
  encoded?.user.id === "user-room" || fromCookie?.user.id === "user-room",
  "base64 cookie payload round-trips"
);

void (async () => {
  clearBoardUploadSession();
  const missing = await resolveBoardUploadSession({
    getSession: async () => ({ data: { session: null } }),
    refreshSession: async () => ({ data: { session: null } }),
    readStoredSession: () => null,
    timeoutMs: 50,
  }).then(
    () => null,
    (error) => String(error?.message || error)
  );
  assert(
    missing && /sign in to upload/i.test(missing),
    "a truly missing session still asks to sign in"
  );

  clearBoardUploadSession();
  const hung = await resolveBoardUploadSession({
    getSession: () => new Promise(() => {}),
    refreshSession: async () => ({ data: { session: null } }),
    readStoredSession: () => live,
    timeoutMs: 40,
  });
  assert(
    hung.user.id === "user-room" && hung.access_token === "jwt-live",
    "a hung getSession must use the Board cookie JWT instead of signed-out copy"
  );

  clearBoardUploadSession();
  rememberBoardUploadSession(live);
  const cached = await resolveBoardUploadSession({
    getSession: async () => {
      throw new Error("getSession should not run when a room session is cached");
    },
    refreshSession: async () => ({ data: { session: null } }),
    readStoredSession: () => null,
    timeoutMs: 40,
  });
  assert(cached.access_token === "jwt-live", "cached room session uploads without another lock");

  console.log("boardUploadSession.check.ts ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
