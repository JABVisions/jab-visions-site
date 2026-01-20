"use client";

import React, { useEffect, useMemo, useState } from "react";

const VIBE_KEY = "jab_work_vibe_check_v1";
const ANN_KEY = "jab_work_project_announcements_v1";

type VibeOption = {
  value: string;
  label: string;
  emoji: string;
};

type Announcement = {
  id: string;
  text: string;
  vibe: string; // vibe value
  createdAt: number;
};

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function formatTime(ts: number) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleString();
  }
}

export function ProjectAnnouncementsBanner() {
  const vibes: VibeOption[] = useMemo(
    () => [
      { value: "locked-in", label: "Locked In", emoji: "🎯" },
      { value: "creative", label: "Creative", emoji: "🎨" },
      { value: "inspired", label: "Inspired", emoji: "✨" },
      { value: "confident", label: "Confident", emoji: "😌" },
      { value: "focused", label: "Focused", emoji: "🧠" },
      { value: "hyped", label: "Hyped", emoji: "🔥" },
      { value: "motivated", label: "Motivated", emoji: "🚀" },
      { value: "peaceful", label: "Peaceful", emoji: "🕊️" },
      { value: "chill", label: "Chill", emoji: "🧊" },
      { value: "curious", label: "Curious", emoji: "🕵️" },
      { value: "playful", label: "Playful", emoji: "😄" },
      { value: "romantic", label: "Romantic", emoji: "💌" },
      { value: "mysterious", label: "Mysterious", emoji: "🕯️" },
      { value: "bold", label: "Bold", emoji: "🦁" },
      { value: "grateful", label: "Grateful", emoji: "🙏" },
      { value: "nostalgic", label: "Nostalgic", emoji: "📼" },
      { value: "overwhelmed", label: "Overwhelmed", emoji: "😵‍💫" },
      { value: "tired", label: "Tired", emoji: "😴" },
      { value: "stressed", label: "Stressed", emoji: "😮‍💨" },
      { value: "ready-to-build", label: "Ready to Build", emoji: "🧱" },
    ],
    []
  );

  const vibeMap = useMemo(() => new Map(vibes.map((v) => [v.value, v])), [vibes]);

  const [vibe, setVibe] = useState<string>("locked-in");
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [draft, setDraft] = useState("");

  // Load saved vibe + announcements
  useEffect(() => {
    try {
      const savedVibe = localStorage.getItem(VIBE_KEY);
      if (savedVibe) setVibe(savedVibe);
    } catch {}

    try {
      const raw = localStorage.getItem(ANN_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Announcement[];
        if (Array.isArray(parsed)) setAnnouncements(parsed);
      }
    } catch {}
  }, []);

  // Persist vibe
  useEffect(() => {
    try {
      localStorage.setItem(VIBE_KEY, vibe);
    } catch {}
  }, [vibe]);

  // Persist announcements
  useEffect(() => {
    try {
      localStorage.setItem(ANN_KEY, JSON.stringify(announcements));
    } catch {}
  }, [announcements]);

  const current = vibeMap.get(vibe) ?? vibes[0];

  const canPost = draft.trim().length >= 3;

  const postAnnouncement = () => {
    if (!canPost) return;
    const next: Announcement = {
      id: newId("ann"),
      text: draft.trim(),
      vibe,
      createdAt: Date.now(),
    };
    setAnnouncements((prev) => [next, ...prev]);
    setDraft("");
  };

  const removeAnnouncement = (id: string) => {
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <section className="rounded-[28px] bg-white/80 ring-1 ring-emerald-200 shadow-[0_10px_30px_rgba(0,0,0,0.08)] p-5 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        {/* Left: Title + description */}
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.25em] text-emerald-700/80">
            Project Announcements
          </div>

          <div className="mt-1 text-base md:text-lg font-extrabold text-emerald-800">
            Broadcast updates that matter
          </div>

          <p className="mt-1 text-xs md:text-sm text-emerald-700/70 max-w-2xl">
            Post project-wide updates, deadlines, and join notes. Every announcement carries your vibe.
          </p>
        </div>

        {/* Right: Vibe Check */}
        <div className="w-full md:w-[320px]">
          <div className="text-[11px] uppercase tracking-[0.25em] text-emerald-700/80">
            Vibe Check
          </div>

          <div className="mt-1 rounded-2xl bg-[#FFFDF1] ring-1 ring-emerald-200 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-extrabold text-emerald-800 truncate">
                <span className="mr-2">{current.emoji}</span>
                {current.label}
              </div>

              <select
                value={vibe}
                onChange={(e) => setVibe(e.target.value)}
                className="w-[165px] rounded-xl bg-white px-3 py-2 text-xs font-bold text-emerald-900 ring-1 ring-emerald-200 outline-none focus:ring-2 focus:ring-emerald-300"
                aria-label="Select vibe"
              >
                {vibes.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.emoji} {v.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-2 text-[11px] text-emerald-700/70">
              This vibe stamps your next post.
            </div>
          </div>
        </div>
      </div>

      {/* Composer */}
      <div className="mt-4 rounded-2xl bg-[#FFFDF1] ring-1 ring-emerald-200 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start">
          <div className="flex-1">
            <div className="text-[11px] uppercase tracking-[0.25em] text-emerald-700/80">
              New Announcement
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="e.g., Casting call closes Friday at 6PM. Send reels + headshots."
              className="mt-2 w-full min-h-[90px] rounded-2xl bg-white px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200 outline-none focus:ring-2 focus:ring-emerald-300"
            />
            <div className="mt-2 flex items-center gap-2 text-[11px] text-emerald-700/70">
              <span className="inline-flex items-center gap-2 rounded-full bg-[#E7FFEE] px-3 py-1 ring-1 ring-emerald-200">
                <span>{current.emoji}</span>
                <span className="font-semibold text-emerald-900">{current.label}</span>
              </span>
              <span>will be attached to this announcement.</span>
            </div>
          </div>

          <div className="md:w-[180px] md:pt-[22px] flex md:flex-col gap-2">
            <button
              onClick={postAnnouncement}
              disabled={!canPost}
              className="w-full rounded-2xl bg-[#E7FFEE] px-4 py-3 text-xs font-extrabold text-emerald-900 ring-1 ring-emerald-200 hover:bg-[#D7FFE3] disabled:opacity-50"
            >
              Post
            </button>
            <button
              onClick={() => setDraft("")}
              className="w-full rounded-2xl bg-white px-4 py-3 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200 hover:bg-[#E7FFEE]"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="mt-4 space-y-3">
        {announcements.length === 0 ? (
          <div className="rounded-2xl bg-white/70 ring-1 ring-emerald-200 p-4 text-sm text-emerald-700/70">
            No announcements yet. Post one to broadcast a project update.
          </div>
        ) : (
          announcements.map((a) => {
            const v = vibeMap.get(a.vibe) ?? { emoji: "📌", label: "Update", value: "update" };
            return (
              <div
                key={a.id}
                className="rounded-2xl bg-white/80 ring-1 ring-emerald-200 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-2 rounded-full bg-[#E7FFEE] px-3 py-1 text-[11px] font-extrabold text-emerald-900 ring-1 ring-emerald-200">
                        <span>{v.emoji}</span>
                        <span>{v.label}</span>
                      </span>

                      <span className="text-[11px] text-emerald-700/70">
                        {formatTime(a.createdAt)}
                      </span>
                    </div>

                    <div className="mt-2 text-sm text-emerald-900 whitespace-pre-wrap break-words">
                      {a.text}
                    </div>
                  </div>

                  <button
                    onClick={() => removeAnnouncement(a.id)}
                    className="shrink-0 rounded-xl bg-white px-3 py-2 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200 hover:bg-[#E7FFEE]"
                    title="Remove announcement"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
