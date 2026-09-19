import {
  adoptAudioFile,
  clipFileKey,
  createAudioSession,
  createSessionHistory,
  isMissingAudioObjectError,
  isUnreadableClipError,
  playableAudioMessage,
  pushHistory,
  SESSION_HISTORY_LIMIT,
  snapshotSession,
  upsertLaneFromFile,
} from "./audioSession";
import {
  sessionFromVoiceStudioProject,
  serializeVoiceStudioClipFiles,
  sessionHasClips,
  type VoiceStudioProjectBlob,
} from "./voiceStudioProject";
import {
  clearLiveVoiceStudio,
  liveVoiceHoldHasClips,
  peekLiveVoiceStudio,
  rememberLiveVoiceStudio,
} from "./voiceStudioLiveHold";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function run() {
  const safariErr = Object.assign(new Error("The object can not be found here."), {
    name: "NotFoundError",
  });
  assert(isMissingAudioObjectError(safariErr), "Safari NotFoundError should be recognized");
  assert(
    /soundboard clip could not be loaded/i.test(playableAudioMessage(safariErr)),
    "missing-object errors should map to a recoverable studio message"
  );
  const encodingErr = Object.assign(new Error("Unable to decode audio data"), {
    name: "EncodingError",
  });
  assert(isUnreadableClipError(encodingErr), "decode failures should be skippable");
  assert(
    /soundboard clip could not be loaded/i.test(playableAudioMessage(encodingErr)),
    "unreadable clips should map to a recoverable studio message"
  );

  const bytes = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4, 5, 6]);
  const uploaded = new File([bytes], "clap.wav", {
    type: "audio/wav",
    lastModified: 1_700_000_000_000,
  });
  const owned = await adoptAudioFile(uploaded);
  assert(owned.name === "clap.wav", "adopted file should keep the name");
  assert(owned.lastModified === uploaded.lastModified, "adopted file should keep lastModified");
  assert(clipFileKey(owned) === clipFileKey(uploaded), "fileKey must stay stable after adopt");
  const ownedBytes = new Uint8Array(await owned.arrayBuffer());
  assert(ownedBytes.length === bytes.length, "adopted file should keep byte length");
  assert(ownedBytes[0] === 82 && ownedBytes[3] === 70, "adopted file should keep payload");

  let session = createAudioSession();
  session = upsertLaneFromFile(session, "instrumental", owned);
  const adlib = new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], "yeah.wav", {
    type: "audio/wav",
    lastModified: 1_700_000_000_111,
  });
  session = upsertLaneFromFile(session, "adlib", adlib, { offsetMs: 250, name: "Yeah" });
  assert(sessionHasClips(session), "session should have clips");
  assert(session.tracks.some((track) => track.kind === "adlib"), "ad-lib lane should exist");

  const files = await serializeVoiceStudioClipFiles(session);
  assert(files.length === 2, "instrumental and soundboard clips should both serialize");
  assert(
    files.every((file) => file.bytes && file.bytes.byteLength > 0 && !file.blob),
    "clips should persist as ArrayBuffers, not Safari-fragile blobs"
  );
  const snap = snapshotSession(session);
  for (const track of snap.tracks) {
    for (const clip of track.clips) {
      assert(
        files.some((file) => file.key === clip.fileKey),
        `snapshot fileKey ${clip.fileKey} should match a stored clip`
      );
    }
  }

  const restored = await sessionFromVoiceStudioProject({
    draftId: "draft_test",
    updatedAt: Date.now(),
    snapshot: snap,
    files,
  });
  assert(restored, "project should restore");
  assert(restored!.tracks.length === 2, "restore should keep both lanes");
  const restoredAdlib = restored!.tracks.find((track) => track.kind === "adlib");
  assert(restoredAdlib?.clips[0]?.name === "Yeah", "ad-lib name should restore");
  const restoredBytes = new Uint8Array(await restoredAdlib!.clips[0].file.arrayBuffer());
  assert(restoredBytes.length === 8, "restored soundboard clip should be playable bytes");
  assert(restoredBytes[0] === 1 && restoredBytes[7] === 8, "restored soundboard payload should match");

  const missingBlob: VoiceStudioProjectBlob = {
    draftId: "draft_missing",
    updatedAt: Date.now(),
    snapshot: snap,
    files: files.filter((file) => file.name !== "yeah.wav"),
  };
  const partial = await sessionFromVoiceStudioProject(missingBlob);
  assert(partial, "timeline should restore even if a soundboard blob is gone");
  const missingLane = partial!.tracks.find((track) => track.kind === "adlib");
  assert(missingLane?.clips.length === 1, "missing soundboard clip should stay on the timeline");
  assert(missingLane!.clips[0].file.size === 0, "missing clip should use a placeholder file");

  rememberLiveVoiceStudio({
    draftId: "draft_live",
    session: restored!,
    history: createSessionHistory(),
    voiceStudioOpen: true,
  });
  assert(peekLiveVoiceStudio()?.draftId === "draft_live", "live hold should remember the mixer");
  assert(liveVoiceHoldHasClips(), "live hold should report clips while the mixer is held");
  clearLiveVoiceStudio();
  assert(peekLiveVoiceStudio() === null, "live hold should clear after mix-to-drop");
  assert(!liveVoiceHoldHasClips(), "live hold should be empty after mix-to-drop");

  const again = await serializeVoiceStudioClipFiles(session);
  assert(again.length === files.length, "serialize should reuse clip keys on a second pass");
  assert(
    again.every((file) => file.bytes && file.bytes.byteLength > 0),
    "cached serialize should still persist ArrayBuffers"
  );

  assert(SESSION_HISTORY_LIMIT <= 8, "undo history should stay shallow during long sessions");
  let history = createSessionHistory();
  let walking = session;
  for (let i = 0; i < 12; i += 1) {
    history = pushHistory(history, walking);
    walking = { ...walking, playheadMs: i * 100 };
  }
  assert(history.past.length <= SESSION_HISTORY_LIMIT, "pushHistory should cap undo snapshots");

  console.log("voice studio soundboard persist/restore checks passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
