"use client";

import { useMemo, useState } from "react";
import type { BoardSignal } from "@/lib/board/boardSignals";

type BrainMessage = {
  id: string;
  role: "user" | "brain";
  text: string;
  createdAt: string;
};

const suggestionChips = [
  "Summarize my drops",
  "Find my next move",
  "Organize my work drops",
  "What am I building?",
  "Turn this into a drop",
];

const seedResponses = [
  "I’m sensing a calm workflow pulse. Your drops are clustering around creative action.",
  "The Board is holding your idea in a low-key orbit. A short burst of focus can move it forward.",
  "I see a clear path: turn the latest vision into a drop and let the signal breathe.",
  "Bucket Brain suggests: capture the next thought as a micro-drop and label it for later.",
];

function generateBrainResponse(prompt: string) {
  const normalized = prompt.trim().toLowerCase();
  if (normalized.includes("summarize")) {
    return "Your recent drops are soft, cinematic, and waiting for a stronger signal. A short title and a striking image will help them land.";
  }
  if (normalized.includes("next move")) {
    return "A strong next move is to pin the vision drop, then create a follow-up thought drop to capture momentum.";
  }
  if (normalized.includes("organize")) {
    return "I recommend sorting work drops by urgency and then marking one goal as a priority for today.";
  }
  if (normalized.includes("building")) {
    return "You are building a more vivid Board presence. Think in terms of signal, story, and steady follow-up.";
  }
  if (normalized.includes("turn this into")) {
    return "Make it a drop with a concise insight, an image or short audio moment, and a clear call to feel it again.";
  }
  return seedResponses[Math.floor(Math.random() * seedResponses.length)];
}

export default function DropPadBucketBrain({
  onReturn,
  signals = [],
  layout = "overlay",
}: {
  onReturn?: () => void;
  signals?: BoardSignal[];
  /** `zone` = compact bottom-space panel in the Drop Pad OS spatial home. */
  layout?: "overlay" | "zone";
}) {
  const [messages, setMessages] = useState<BrainMessage[]>([
    {
      id: "bucket-brain-welcome",
      role: "brain",
      text: "Bucket Brain is ready. Ask it about your drops, your work, or your next move.",
      createdAt: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [working, setWorking] = useState(false);

  const isZone = layout === "zone";
  const visibleMessages = useMemo(
    () => messages.slice(isZone ? -2 : -4),
    [messages, isZone]
  );
  const chips = isZone ? suggestionChips.slice(0, 3) : suggestionChips;

  const sendMessage = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    const userMessage: BrainMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: trimmed,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setWorking(true);

    window.setTimeout(() => {
      const brainMessage: BrainMessage = {
        id: `brain-${Date.now()}`,
        role: "brain",
        text: generateBrainResponse(trimmed),
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, brainMessage]);
      setWorking(false);
    }, 800);
  };

  return (
    <div
      className={
        isZone
          ? "relative flex h-full min-h-0 flex-col overflow-hidden rounded-[18px] border border-white/10 bg-black/40 shadow-[0_16px_40px_rgba(0,0,0,0.28)] backdrop-blur-xl"
          : "relative flex h-full min-h-[540px] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-black/35 shadow-[0_30px_90px_rgba(0,0,0,0.35)] backdrop-blur-xl"
      }
    >
      <div
        className={
          isZone
            ? "relative z-10 border-b border-white/10 px-3 py-2.5 backdrop-blur-sm"
            : "relative z-10 border-b border-white/10 px-5 py-5 backdrop-blur-sm"
        }
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.28em] text-fuchsia-200/80">
              {isZone ? "Drop Pad · Bottom Space" : "Bucket Brain"}
            </div>
            <h3 className={isZone ? "mt-0.5 text-base font-semibold text-white/95" : "mt-2 text-2xl font-semibold text-white/95"}>
              Bucket Brain
            </h3>
            {!isZone ? (
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
                Your Board intelligence layer.
              </p>
            ) : null}
          </div>

          {onReturn && !isZone ? (
            <button
              type="button"
              onClick={onReturn}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:border-white/20 hover:bg-white/10"
            >
              ↑ Orb Home
            </button>
          ) : null}
        </div>
      </div>

      {!isZone ? (
        <div className="pointer-events-none absolute inset-x-0 top-20 flex justify-center">
          <div className="relative h-20 w-20 rounded-full bg-gradient-to-br from-fuchsia-400/20 via-cyan-300/15 to-lime-300/10 shadow-[0_0_60px_rgba(163,230,53,0.16)]">
            <div className="absolute inset-0 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fuchsia-400/20 ring-1 ring-white/15" />
          </div>
        </div>
      ) : null}

      <div
        className={
          isZone
            ? "relative z-10 flex-1 overflow-y-auto px-3 py-2 min-h-0"
            : "relative z-10 flex-1 overflow-y-auto px-5 pt-40 pb-5"
        }
      >
        {signals.length > 0 ? (
          <div className={isZone ? "mb-2" : "mb-5"}>
            {!isZone ? (
              <div className="mb-2 text-[11px] uppercase tracking-[0.26em] text-fuchsia-200/70">
                Signals · what&rsquo;s moving
              </div>
            ) : null}
            <div className="space-y-1.5">
              {signals.slice(0, isZone ? 3 : 8).map((s) => (
                <div
                  key={s.id}
                  className={
                    s.kind === "interaction"
                      ? "flex items-center gap-2 rounded-xl border border-fuchsia-300/20 bg-fuchsia-400/10 px-2.5 py-1.5 text-xs text-fuchsia-50/90"
                      : "flex items-center gap-2 rounded-xl border border-cyan-200/15 bg-cyan-400/[0.08] px-2.5 py-1.5 text-xs text-cyan-50/90"
                  }
                >
                  <span aria-hidden className="text-sm leading-none">
                    {s.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{s.text}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className={isZone ? "space-y-2" : "space-y-3"}>
          {visibleMessages.map((message) => (
            <div
              key={message.id}
              className={
                message.role === "user"
                  ? "rounded-2xl border border-white/10 bg-white/10 p-3 text-xs text-white/90"
                  : "rounded-2xl border border-cyan-200/15 bg-gradient-to-br from-cyan-400/10 to-slate-900/35 p-3 text-xs text-cyan-100"
              }
            >
              <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.2em] text-white/50">
                <span>{message.role === "user" ? "You" : "Brain Pulse"}</span>
                <span>
                  {new Date(message.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className={isZone ? "mt-1.5 leading-5" : "mt-3 leading-7 text-sm"}>{message.text}</p>
            </div>
          ))}

          {working ? (
            <div className="rounded-2xl border border-cyan-200/15 bg-cyan-400/10 p-3 text-xs text-cyan-100">
              <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-cyan-300" />
              <span className="ml-2">Bucket Brain is thinking...</span>
            </div>
          ) : null}
        </div>
      </div>

      <div
        className={
          isZone
            ? "border-t border-white/10 bg-black/25 px-3 py-2 backdrop-blur-sm"
            : "border-t border-white/10 bg-black/20 px-5 py-4 backdrop-blur-sm"
        }
      >
        <div className={isZone ? "mb-2 flex flex-wrap gap-1.5" : "mb-3 flex flex-wrap gap-2"}>
          {chips.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => sendMessage(chip)}
              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-white/70 transition hover:border-white/20 hover:bg-white/10"
            >
              {chip}
            </button>
          ))}
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            sendMessage(input);
          }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={isZone ? "Ask Bucket Brain…" : "Type a thought, question, command, or idea…"}
            className="flex-1 rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white/90 placeholder:text-white/40 focus:border-cyan-300/50 focus:outline-none focus:ring-2 focus:ring-cyan-300/20"
          />
          <button
            type="submit"
            disabled={working}
            className="rounded-2xl bg-gradient-to-r from-cyan-400 to-fuchsia-400 px-3 py-2 text-xs font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
