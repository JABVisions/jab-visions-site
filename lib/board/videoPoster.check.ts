import {
  captureVideoPosterFile,
  captureVideoPosterFromFile,
  playableVideoPosterSrc,
  posterLooksStored,
  videoPosterFromUpload,
} from "./videoPoster";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const publicTape =
  "https://ywvzwtpy.supabase.co/storage/v1/object/public/board-media/user/project-media/tape.mp4";
const signedTape =
  "https://ywvzwtpy.supabase.co/storage/v1/object/sign/board-media/user/project-media/tape.mp4?token=abc";
const signedStill =
  "https://ywvzwtpy.supabase.co/storage/v1/object/sign/board-media/user/project-cover/still.jpg?token=abc";

assert(typeof captureVideoPosterFile === "function", "client first-frame capture path exists");
assert(typeof captureVideoPosterFromFile === "function", "local File capture path exists");

void (async () => {
  assert((await captureVideoPosterFile("")) === null, "empty src does not capture");
  assert(
    (await captureVideoPosterFile(publicTape)) === null,
    "public 403 tape URLs are not used as poster sources"
  );
  assert(
    (await captureVideoPosterFile(signedTape)) === null,
    "node has no <video> document; signed capture stays a client path"
  );

  const uploaded = videoPosterFromUpload({
    bucket: "board-media",
    storagePath: "user/project-cover/still.jpg",
    imageUrl: signedStill,
  });
  assert(uploaded?.storagePath === "user/project-cover/still.jpg", "cover upload reuses the still path");
  assert(playableVideoPosterSrc(uploaded?.url) === signedStill, "uploaded still is a signed thumb");
  assert(posterLooksStored(signedStill), "signed jpeg stills count as posters");
  assert(!posterLooksStored(publicTape), "the audition tape is not a poster");

  console.log("videoPoster.check.ts: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
