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
}: {
  onReturn: () => void;
  signals?: BoardSignal[];
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

  const visibleMessages = useMemo(() => messages.slice(-4), [messages]);

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
    <div className="relative flex h-full min-h-[540px] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-black/35 shadow-[0_30px_90px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <div className="relative z-10 border-b border-white/10 px-5 py-5 backdrop-blur-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.3em] text-fuchsia-200/80">Bucket Brain</div>
            <h3 className="mt-2 text-2xl font-semibold text-white/95">Bucket Brain</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
              Your Board intelligence layer.
            </p>
          </div>

          <button
            type="button"
            onClick={onReturn}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:border-white/20 hover:bg-white/10"
          >
            ↑ Orb Home
          </button>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-20 flex justify-center">
        <div className="relative h-20 w-20 rounded-full bg-gradient-to-br from-fuchsia-400/20 via-cyan-300/15 to-lime-300/10 shadow-[0_0_60px_rgba(163,230,53,0.16)]">
          <div className="absolute inset-0 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fuchsia-400/20 ring-1 ring-white/15" />
        </div>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto px-5 pt-40 pb-5">
        {signals.length > 0 ? (
          <div className="mb-5">
            <div className="mb-2 text-[11px] uppercase tracking-[0.26em] text-fuchsia-200/70">
              Signals · what&rsquo;s moving
            </div>
            <div className="space-y-2">
              {signals.slice(0, 8).map((s) => (
                <div
                  key={s.id}
                  className={
                    s.kind === "interaction"
                      ? "flex items-center gap-3 rounded-2xl border border-fuchsia-300/20 bg-fuchsia-400/10 px-3 py-2 text-sm text-fuchsia-50/90"
                      : "flex items-center gap-3 rounded-2xl border border-cyan-200/15 bg-cyan-400/[0.08] px-3 py-2 text-sm text-cyan-50/90"
                  }
                >
                  <span aria-hidden className="text-base leading-none">
                    {s.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{s.text}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-3">
          {visibleMessages.map((message) => (
            <div
              key={message.id}
              className={
                message.role === "user"
                  ? "rounded-3xl border border-white/10 bg-white/10 p-4 text-sm text-white/90 shadow-[0_12px_40px_rgba(0,0,0,0.20)]"
                  : "rounded-[28px] border border-cyan-200/15 bg-gradient-to-br from-cyan-400/10 to-slate-900/35 p-4 text-sm text-cyan-100 shadow-[0_18px_50px_rgba(34,211,238,0.16)]"
              }
            >
              <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.24em] text-white/50">
                <span>{message.role === "user" ? "You" : "Brain Pulse"}</span>
                <span>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <p className="mt-3 leading-7">{message.text}</p>
            </div>
          ))}

          {working ? (
            <div className="rounded-[28px] border border-cyan-200/15 bg-cyan-400/10 p-4 text-sm text-cyan-100 shadow-[0_18px_40px_rgba(34,211,238,0.16)]">
              <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-cyan-300" />
              <span className="ml-2">Bucket Brain is thinking...</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="border-t border-white/10 bg-black/20 px-5 py-4 backdrop-blur-sm">
        <div className="mb-3 flex flex-wrap gap-2">
          {suggestionChips.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => sendMessage(chip)}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs uppercase tracking-[0.18em] text-white/70 transition hover:border-white/20 hover:bg-white/10"
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
          className="flex gap-3"
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Type a thought, question, command, or idea…"
            className="flex-1 rounded-3xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white/90 placeholder:text-white/40 focus:border-cyan-300/50 focus:outline-none focus:ring-2 focus:ring-cyan-300/20"
          />
          <button
            type="submit"
            disabled={working}
            className="rounded-3xl bg-gradient-to-r from-cyan-400 to-fuchsia-400 px-4 py-3 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
