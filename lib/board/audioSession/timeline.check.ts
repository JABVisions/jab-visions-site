import {
  audibleTracks,
  clipPlayableMs,
  createAudioSession,
  createClipFromFile,
  createTrackFromFile,
  scheduleClip,
  sessionDurationMs,
  mixTakeDurationMs,
  sessionFromVocalAndInstrumental,
} from "./index";
import type { SessionTrack, TrackClip } from "./types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function fakeFile(name: string) {
  return { name, type: "audio/wav" } as File;
}

function clipWithDuration(durationSeconds: number, extra: Partial<TrackClip> = {}): TrackClip {
  return {
    ...createClipFromFile(fakeFile("take.wav")),
    decoded: { duration: durationSeconds } as AudioBuffer,
    ...extra,
  };
}

function track(kind: SessionTrack["kind"], clips: TrackClip[], extra: Partial<SessionTrack> = {}): SessionTrack {
  return {
    ...createTrackFromFile(kind, fakeFile(`${kind}.wav`)),
    clips,
    ...extra,
  };
}

function run() {
  const twoSeconds = clipWithDuration(2);
  assert(clipPlayableMs(twoSeconds) === 2000, "full clip should be 2000ms");

  const trimmed = clipWithDuration(2, { trimInMs: 250, trimOutMs: 1750 });
  assert(clipPlayableMs(trimmed) === 1500, "trim should yield 1500ms");

  const delayed = track("vocal", [clipWithDuration(1, { offsetMs: 500 })]);
  const session = { ...createAudioSession(), tracks: [delayed] };
  assert(sessionDurationMs(session) === 1500, "offset + duration should be 1500ms");

  const mutedBeat = track("instrumental", [clipWithDuration(4)], {
    mix: { ...createTrackFromFile("instrumental", fakeFile("beat.wav")).mix, muted: true },
  });
  const vocal = track("vocal", [clipWithDuration(1)]);
  const mixed = { ...createAudioSession(), tracks: [vocal, mutedBeat] };
  assert(audibleTracks(mixed).length === 1, "muted instrumental should not be audible");
  assert(audibleTracks(mixed)[0].kind === "vocal", "only vocal should remain");

  const soloBeat = track("instrumental", [clipWithDuration(4)], {
    mix: { ...createTrackFromFile("instrumental", fakeFile("beat.wav")).mix, solo: true },
  });
  const withSolo = { ...createAudioSession(), tracks: [vocal, soloBeat] };
  assert(audibleTracks(withSolo).length === 1, "solo should mute non-solo lanes");
  assert(audibleTracks(withSolo)[0].kind === "instrumental", "solo instrumental should win");

  const lateTake = track(
    "vocal",
    [clipWithDuration(1)],
    { latencyMs: 200 }
  );
  const scheduled = scheduleClip(lateTake, lateTake.clips[0]);
  assert(scheduled, "latency-shifted clip should still schedule");
  assert(scheduled.whenSeconds === 0, "negative start should clamp to 0");
  assert(Math.abs(scheduled.bufferOffsetSeconds - 0.2) < 0.0001, "latency should skip into the buffer");
  assert(Math.abs(scheduled.durationSeconds - 0.8) < 0.0001, "playable length should shrink by latency");

  const pair = sessionFromVocalAndInstrumental(fakeFile("vocal.wav"), fakeFile("beat.wav"));
  assert(pair.tracks.length === 2, "helper should create two lanes");
  assert(pair.tracks[0].kind === "vocal" && pair.tracks[0].mix.preset === "clean", "vocal defaults to clean");
  assert(pair.tracks[1].kind === "instrumental" && pair.tracks[1].mix.preset === "none", "beat stays dry");

  const vocalTake = track("vocal", [clipWithDuration(2)]);
  const longBeat = track("instrumental", [clipWithDuration(30)]);
  const mixSession = { ...createAudioSession(), tracks: [vocalTake, longBeat] };
  assert(mixTakeDurationMs(mixSession) === 2320, "mix to drop should follow the vocal take, not the beat");

  console.log("audioSession timeline checks passed");
}

run();
