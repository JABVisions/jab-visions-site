"use client";

import React from "react";

export type ReactionKey = "heart" | "pleased" | "funny" | "omg" | "angry" | "aww";
export type ReactionsMap = Record<ReactionKey, number>;

export const REACTIONS: Array<{
  key: ReactionKey;
  emoji: string;
  label: string;
}> = [
  { key: "heart", emoji: "🤍", label: "love" },
  { key: "pleased", emoji: "🙂", label: "pleased" },
  { key: "funny", emoji: "🤡", label: "funny" },
  { key: "omg", emoji: "💀", label: "omg" },
  { key: "angry", emoji: "😱", label: "angry" },
  { key: "aww", emoji: "😢", label: "aww" },
];

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function makeEmptyReactions(): ReactionsMap {
  return {
    heart: 0,
    pleased: 0,
    funny: 0,
    omg: 0,
    angry: 0,
    aww: 0,
  };
}

export default function ReactionsBar({
  reactions,
  onReact,
}: {
  reactions: ReactionsMap;
  onReact: (key: ReactionKey) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {REACTIONS.map((r) => {
        const count = reactions?.[r.key] ?? 0;

        return (
          <button
            key={r.key}
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation(); // ✅ reacting shouldn’t open the thread
              onReact(r.key);
            }}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-full border",
              "border-black/10 bg-white/70",
              "px-2.5 py-1",
              "text-xs text-black/70",
              "shadow-sm",
              "hover:bg-white hover:border-black/15",
              "active:scale-[0.99] transition"
            )}
            aria-label={`React ${r.label}`}
            title={r.label}
          >
            <span className="text-[13px] leading-none">{r.emoji}</span>
            <span className="tabular-nums text-[12px]">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
