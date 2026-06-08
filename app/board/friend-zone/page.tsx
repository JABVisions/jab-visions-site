"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import FriendZoneOrb from "@/app/components/board/FriendZoneOrb";
import type { FriendZoneOrbUser } from "@/lib/board/friendZoneSignals";
import { loadBoardUserFriendZoneOrbs } from "@/lib/board/friendZoneUsers";

export default function FriendZonePage() {
  const [orbs, setOrbs] = useState<FriendZoneOrbUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadOrbs() {
      const boardUsers = await loadBoardUserFriendZoneOrbs(18);
      if (!cancelled) {
        setOrbs(boardUsers);
        setLoading(false);
      }
    }

    void loadOrbs();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen px-5 py-10 text-[#241f12]">
      <section className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[rgba(0,160,80,0.72)]">
              Friend Zone
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight md:text-5xl">
              Relationship Orbs
            </h1>
          </div>

          <Link
            href="/board"
            className="rounded-full border border-black/10 bg-white/70 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-black/65"
          >
            Back to Board
          </Link>
        </div>

        <div className="rounded-[34px] border border-black/10 bg-[rgba(255,255,255,0.66)] p-6 shadow-2xl backdrop-blur-xl">
          {loading ? (
            <div className="rounded-[24px] border border-black/10 bg-white/55 px-5 py-10 text-center">
              <p className="text-sm font-black uppercase tracking-[0.18em] text-black/55">
                Syncing live Board users...
              </p>
            </div>
          ) : orbs.length ? (
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-9">
              {orbs.map((user) => (
                <FriendZoneOrb key={user.id || user.username} user={user} />
              ))}
            </div>
          ) : (
            <div className="rounded-[24px] border border-black/10 bg-white/55 px-5 py-10 text-center">
              <p className="text-sm font-black uppercase tracking-[0.18em] text-black/60">
                No current orbs found yet.
              </p>
              <p className="mx-auto mt-2 max-w-lg text-sm font-semibold text-black/45">
                Friend Zone is ready for live Board users once public profiles are available.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
