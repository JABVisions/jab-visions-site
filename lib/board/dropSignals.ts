"use client";

export const BOARD_DROP_SIGNAL_EVENT = "board:drop-signal";

export type BoardDropSignalType =
  | "drop_created"
  | "thought_drop_created"
  | "project_drop_created"
  | "drop_commented"
  | "drop_pushed"
  | "drop_funded";

export type BoardDropSignal = {
  type: BoardDropSignalType;
  dropId: string;
  projectId?: string;
  userId?: string | null;
  title?: string;
  createdAt?: string;
  meta?: Record<string, any>;
};

export function emitBoardDropSignal(signal: BoardDropSignal) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent(BOARD_DROP_SIGNAL_EVENT, {
      detail: {
        ...signal,
        createdAt: signal.createdAt ?? new Date().toISOString(),
      },
    })
  );
  // Future: turn these signal events into Board Whispers, analytics, and
  // Supabase-backed activity triggers without changing drop creation code.
}
