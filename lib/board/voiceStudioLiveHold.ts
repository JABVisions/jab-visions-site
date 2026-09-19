import type { AudioSession, SessionHistory } from "@/lib/board/audioSession";

export type VoiceStudioLiveHold = {
  draftId: string;
  session: AudioSession;
  history: SessionHistory;
  voiceStudioOpen: boolean;
};

let hold: VoiceStudioLiveHold | null = null;

/** In-memory live mixer — survives overlay unmount without rereading IndexedDB blobs. */
export function rememberLiveVoiceStudio(next: VoiceStudioLiveHold | null) {
  hold = next;
}

export function peekLiveVoiceStudio(): VoiceStudioLiveHold | null {
  return hold;
}

export function clearLiveVoiceStudio() {
  hold = null;
}
