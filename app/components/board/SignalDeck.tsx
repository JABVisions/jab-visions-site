"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function SignalDeck({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      if (panelRef.current && !panelRef.current.contains(t)) onClose();
    }

    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80]">
      {/* soft veil */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />

      {/* anchored dropdown-ish panel */}
      <div className="absolute left-4 top-[120px] w-[320px] max-w-[calc(100vw-2rem)]">
        <div
          ref={panelRef}
          className={clsx(
            "rounded-[22px]",
            "bg-white/70 backdrop-blur-xl",
            "border border-black/10",
            "shadow-[0_20px_60px_rgba(0,0,0,0.25),0_0_40px_rgba(0,255,150,0.12)]",
            "p-4"
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-black/60">
              Signal Deck
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-3 py-1 text-xs text-black/60 hover:text-black/80 hover:bg-white/60 border border-black/10"
            >
              Close
            </button>
          </div>

          <div className="mt-3 grid gap-2">
            <SignalRow
              title="Messages"
              desc="Open your inbox and start a thread"
              href="/board/messages"
            />
            <SignalRow
              title="New Post"
              desc="Jump to the feed composer"
              href="/board#composer"
            />
            <SignalRow
              title="Forums"
              desc="Threads, theories, and worldbuilding"
              href="/board/forums"
            />
            <SignalRow
              title="Profile Hub"
              desc="Your boards, identity, links"
              href="/board/profile"
            />
          </div>

          <div className="mt-3 text-[11px] text-black/50">
            Tip: press <span className="font-semibold">ESC</span> to close.
          </div>
        </div>
      </div>
    </div>
  );
}

function SignalRow({
  title,
  desc,
  href,
}: {
  title: string;
  desc: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={clsx(
        "block rounded-2xl",
        "bg-[#FFE36A]/45",
        "border border-black/10",
        "px-4 py-3",
        "transition hover:translate-y-[-1px] hover:bg-[#FFE36A]/60",
        "shadow-[0_0_18px_rgba(255,0,190,0.10)]"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-[rgba(0,160,80,1)]">
          {title}
        </div>
        <div className="text-[rgba(255,0,190,0.92)] text-xs uppercase tracking-[0.24em]">
          open
        </div>
      </div>
      <div className="mt-1 text-xs text-black/55">{desc}</div>
    </Link>
  );
}
