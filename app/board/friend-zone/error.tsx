"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function FriendZoneError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[FriendZone] route render failed", error);
  }, [error]);

  return (
    <main className="min-h-screen px-5 py-10 text-[#241f12]">
      <section className="mx-auto max-w-xl rounded-[30px] border border-black/10 bg-white/70 p-6 text-center shadow-2xl backdrop-blur-xl">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-[rgba(0,160,80,0.72)]">
          Friend Zone
        </p>
        <h1 className="mt-3 text-2xl font-black">The orbit lost its signal.</h1>
        <p className="mt-2 text-sm font-semibold text-black/55">
          Your Board is still safe. Retry the Friend Zone or return to Board.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-black px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-white"
          >
            Retry
          </button>
          <Link
            href="/board"
            className="rounded-full border border-black/15 bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-black/70"
          >
            Back to Board
          </Link>
        </div>
      </section>
    </main>
  );
}
