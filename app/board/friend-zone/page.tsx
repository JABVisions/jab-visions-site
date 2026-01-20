// app/board/friends/page.tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Users, Search, ChevronRight } from "lucide-react";

type Friend = {
  id: string;
  name: string;
  handle: string;
  status?: "online" | "idle" | "offline";
};

function safeId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export default function FriendsPage() {
  const [q, setQ] = useState("");

  const friends = useMemo<Friend[]>(() => {
    return [
      { id: safeId(), name: "Amelia", handle: "@amelia", status: "online" },
      { id: safeId(), name: "Marilyn", handle: "@marilyn", status: "idle" },
      { id: safeId(), name: "Mark", handle: "@mark", status: "offline" },
    ];
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return friends;
    return friends.filter((f) =>
      `${f.name} ${f.handle}`.toLowerCase().includes(s)
    );
  }, [q, friends]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            <h1 className="text-xl font-semibold tracking-tight">Friend Zone</h1>
          </div>
          <p className="mt-1 text-sm text-neutral-400">
            Route restored. Next we plug your real Friend Zone UI back in.
          </p>
        </div>

        <Link
          href="/board"
          className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-sm hover:bg-neutral-900"
        >
          Back to Feed
        </Link>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/30 p-3">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-neutral-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search friends..."
            className="w-full bg-transparent text-sm outline-none placeholder:text-neutral-500"
          />
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map((f) => (
          <div
            key={f.id}
            className="rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-base font-semibold">{f.name}</div>
                <div className="text-sm text-neutral-400">{f.handle}</div>
              </div>

              <div className="flex items-center gap-2">
                <span className="rounded-full border border-neutral-800 bg-neutral-950/40 px-2 py-1 text-xs text-neutral-300">
                  {f.status || "offline"}
                </span>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-sm hover:bg-neutral-900"
                  onClick={() => alert("Later: open DM / friend profile")}
                >
                  Open <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
