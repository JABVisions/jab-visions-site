"use client";

import styles from "./bucketBrainSpace.module.css";
import type { BucketBrainIntent } from "@/lib/board/bucketBrain/response";

const ACTIONS: Array<{ intent: BucketBrainIntent; label: string; prompt: string }> = [
  { intent: "creator_search", label: "Find Creators", prompt: "Find creators" },
  { intent: "work_board_search", label: "Search Work Boards", prompt: "Search Work Boards" },
  { intent: "visionary_question", label: "Ask Visionary", prompt: "" },
  { intent: "personal_search", label: "My Projects", prompt: "What projects have I been working on?" },
];

export default function BucketBrainQuickActions({
  active,
  onSelect,
}: {
  active: BucketBrainIntent | null;
  onSelect: (intent: BucketBrainIntent, prompt: string) => void;
}) {
  return (
    <div className={styles.chips} role="group" aria-label="Bucket Brain shortcuts">
      {ACTIONS.map((action) => (
        <button
          key={action.intent}
          type="button"
          className={active === action.intent ? styles.chipOn : styles.chip}
          onClick={() => onSelect(action.intent, action.prompt)}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
