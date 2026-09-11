export { AudioSessionEngine } from "./engine";
export { connectScheduledClip, isVoicePreset } from "./graph";
export { mixTwoFiles, mixTakeDurationMs, renderSessionFile } from "./mixdown";
export {
  addTrack,
  createAudioSession,
  createClipFromFile,
  createTrackFromFile,
  defaultAlteration,
  defaultTrackMix,
  duplicateAdlibTrack,
  duplicateClip,
  isStudioPreset,
  moveAdlibTrack,
  removeClip,
  removeLane,
  removeTrackById,
  renameTrack,
  reorderAdlibTracks,
  replaceTrack,
  restoreClipOriginal,
  sessionFromVocalAndInstrumental,
  sessionHasLane,
  splitClipAtPlayhead,
  updateClip,
  updateTrackMix,
  upsertLaneFromFile,
} from "./session";
export {
  applySessionSnapshot,
  createSessionHistory,
  pushHistory,
  redoHistory,
  snapshotSession,
  undoHistory,
  type SessionHistory,
} from "./history";
export { readStudioLatencyMs, writeStudioLatencyMs, STUDIO_LATENCY_MAX_MS } from "./latency";
export {
  createStudioRecorder,
  createStudioTakeCapture,
  cloneStreamForMeter,
  getMusicMicStream,
  MUSIC_MIC_CONSTRAINTS,
  STUDIO_COUNT_IN_MS,
  studioAudioExtension,
  type StudioTakeCapture,
} from "./record";
export {
  audibleTracks,
  clipEndOnTimelineMs,
  clipPlayableMs,
  clipMixStartMs,
  resolveTrimOutMs,
  scheduleClip,
  scheduleSession,
  sessionDurationMs,
  trackEndMs,
  type ScheduledClip,
} from "./timeline";
export {
  MAX_AUDIO_SESSION_LANES,
  type AlterationParams,
  type AudioDropExtras,
  type AudioSession,
  type LaneKind,
  type SessionEditSnapshot,
  type SessionTrack,
  type StudioPresetKey,
  type TrackClip,
  type TrackMix,
} from "./types";
export { audioBufferToWav, decodeAudioFile, getAudioContextConstructor, wavFileFromBuffer } from "./wav";
