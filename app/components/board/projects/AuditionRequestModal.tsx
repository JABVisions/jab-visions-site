"use client";

import React, { useMemo, useState } from "react";
import type { ProjectDrop } from "./ProjectDropMenu";

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function AuditionRequestModal({
  open,
  drop,
  onClose,
}: {
  open: boolean;
  drop: ProjectDrop | null;
  onClose: () => void;
}) {
  const [role, setRole] = useState("");
  const [deadline, setDeadline] = useState("");
  const [message, setMessage] = useState(
    "Hi! We’d love to invite you to submit a self-tape audition.\n\nPlease follow the instructions below:\n- Slate: name, age, location\n- Read: provided sides\n- 1 take, best performance\n\nThank you!"
  );

  const mailto = useMemo(() => {
    if (!drop) return "";
    const subject = encodeURIComponent(`Audition Request: ${drop.title}`);
    const body = encodeURIComponent(
      `Project: ${drop.title}\nRole: ${role || "(role)"}\nDeadline: ${
        deadline || "(deadline)"
      }\n\nMessage:\n${message}\n\n---\nSent from JAB Board Projects`
    );
    return `mailto:${encodeURIComponent(drop.contactEmail)}?subject=${subject}&body=${body}`;
  }, [drop, role, deadline, message]);

  if (!open || !drop) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full md:max-w-2xl rounded-t-3xl md:rounded-3xl border border-white/10 bg-black/60 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <div className="text-white font-semibold text-lg">Audition Request</div>
            <div className="text-white/60 text-sm truncate">
              {drop.title}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 transition"
          >
            Close
          </button>
        </div>

        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto grid gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-black/40 p-3">
              <div className="text-xs text-white/50">Role (optional)</div>
              <input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Lead, Supporting, DP, etc."
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-white outline-none"
              />
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/40 p-3">
              <div className="text-xs text-white/50">Deadline (optional)</div>
              <input
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                placeholder="Jan 20, 11:59pm"
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-white outline-none"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/40 p-3">
            <div className="text-xs text-white/50">Message</div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={10}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-white outline-none resize-none"
            />
            <div className="mt-2 text-xs text-white/40">
              This opens your email app using the project’s Contact Email.
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-white/10 flex items-center justify-between gap-3">
          <div className="text-xs text-white/50 truncate">
            To: <span className="text-white/70">{drop.contactEmail}</span>
          </div>

          <a
            href={mailto}
            className={clsx(
              "rounded-xl border border-white/20 bg-white/10 px-5 py-2 text-sm text-white",
              "hover:bg-white/15 transition"
            )}
          >
            Send Request
          </a>
        </div>
      </div>
    </div>
  );
}
