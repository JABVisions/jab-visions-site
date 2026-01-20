"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type DropType = "YouTube" | "Music" | "News" | "Link" | "Media" | "Pay" | "Doc";

type DropItem = {
  id: string;
  title: string;
  type: DropType;
  createdAt: number;

  // Pay metadata
  priceCents?: number;
  description?: string;
  linkUrl?: string;

  // optional
  fileName?: string;
};

const DROPS_KEY = "jab_board_drops_v2";
const PREF_MODE_KEY = "jab_board_dropconsole_mode"; // used only to preselect Pay on Feed

function fmtMoney(cents?: number) {
  if (!cents || cents <= 0) return "";
  return `$${(cents / 100).toFixed(2)}`;
}

function safeParseDrops(): DropItem[] {
  try {
    const raw = localStorage.getItem(DROPS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x) => x && typeof x === "object")
      .map((x: any) => ({
        id: String(x.id ?? ""),
        title: String(x.title ?? "Untitled"),
        type: (x.type as DropType) ?? "Link",
        createdAt: Number(x.createdAt ?? Date.now()),
        priceCents: typeof x.priceCents === "number" ? x.priceCents : undefined,
        description: typeof x.description === "string" ? x.description : undefined,
        linkUrl: typeof x.linkUrl === "string" ? x.linkUrl : undefined,
        fileName: typeof x.fileName === "string" ? x.fileName : undefined,
      }))
      .filter((d) => d.id);
  } catch {
    return [];
  }
}

export default function PayDropsMiniPanel({
  max = 4,
  compact = false,
}: {
  max?: number;
  compact?: boolean;
}) {
  const router = useRouter();

  const [drops, setDrops] = useState<DropItem[]>([]);

  // Load + keep reasonably in sync in same tab
  useEffect(() => {
    const read = () => setDrops(safeParseDrops());

    read();
    const onStorage = (e: StorageEvent) => {
      if (e.key === DROPS_KEY) read();
    };
    window.addEventListener("storage", onStorage);

    // Same-tab updates don’t fire "storage", so we poll lightly
    const t = window.setInterval(read, 1200);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.clearInterval(t);
    };
  }, []);

  const payDrops = useMemo(() => {
    return drops
      .filter((d) => String(d.type).toLowerCase() === "pay")
      .filter((d) => (d.priceCents ?? 0) > 0) // ✅ amount required
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      .slice(0, max);
  }, [drops, max]);

  const goAddPay = () => {
    try {
      localStorage.setItem(PREF_MODE_KEY, "Pay");
    } catch {}
    router.push("/board/feed");
  };

  return (
    <section
      className={[
        "rounded-[26px] border border-black/10 bg-white/70 shadow-[0_10px_24px_rgba(0,0,0,0.06)]",
        compact ? "p-4" : "p-5",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[11px] font-extrabold tracking-[0.22em] uppercase text-black/55">
            Pay Drops
          </div>
          <div className="mt-1 text-sm text-black/65">
            Recent payments + paid requests you posted.
          </div>
        </div>

        <button
          type="button"
          onClick={goAddPay}
          className="rounded-full px-4 py-2 text-xs font-extrabold tracking-[0.16em] uppercase bg-black/85 text-emerald-200 border border-emerald-400/25"
        >
          Add Pay Drop
        </button>
      </div>

      {payDrops.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-black/15 bg-white/60 p-4">
          <div className="font-extrabold text-black/65">No Pay Drops yet</div>
          <div className="mt-1 text-sm text-black/55">
            Hit <b>Add Pay Drop</b> to create one in the Feed drop console.
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {payDrops.map((d) => (
            <div
              key={d.id}
              className="rounded-[22px] border border-black/10 bg-white/75 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-extrabold text-black/75 truncate">
                    {d.title}
                  </div>
                  {d.description ? (
                    <div className="mt-2 text-sm text-black/60 line-clamp-2 whitespace-pre-wrap">
                      {d.description}
                    </div>
                  ) : (
                    <div className="mt-2 text-sm text-black/40">No description.</div>
                  )}
                </div>

                <div className="shrink-0 rounded-full px-3 py-1 text-[11px] font-extrabold tracking-[0.14em] uppercase bg-[#FFE36A]/70 border border-black/10 text-black/70">
                  {fmtMoney(d.priceCents)}
                </div>
              </div>

              {d.linkUrl ? (
                <a
                  href={d.linkUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex rounded-full px-3 py-2 text-xss text-xs font-extrabold tracking-[0.12em] uppercase bg-white/70 border border-black/10 text-[rgba(255,0,190,0.9)]"
                >
                  Link →
                </a>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
