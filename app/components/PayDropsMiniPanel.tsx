"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PAY_DROPS_UPDATED_EVENT,
  readPayDrops,
  type PayDrop,
} from "@/lib/board/paydrops";
import { openHostedPayDropCheckout } from "@/lib/board/payCheckout";
import { supabaseBrowser } from "@/lib/supabase/browser";
const PREF_MODE_KEY = "jab_board_dropconsole_mode"; // used only to preselect Pay on Feed

function fmtMoney(cents?: number) {
  if (!cents || cents <= 0) return "";
  return `$${(cents / 100).toFixed(2)}`;
}

export default function PayDropsMiniPanel({
  max = 4,
  compact = false,
}: {
  max?: number;
  compact?: boolean;
}) {
  const router = useRouter();

  const [drops, setDrops] = useState<PayDrop[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    const sb = supabaseBrowser();
    let cancelled = false;

    async function loadUser() {
      const { data } = await sb.auth.getUser();
      const nextUserId = data.user?.id ?? null;
      if (!cancelled) setUserId(nextUserId);
      if (!nextUserId) {
        if (!cancelled) setUsername(null);
        return;
      }
      const { data: profile } = await sb
        .from("profiles")
        .select("username")
        .eq("id", nextUserId)
        .maybeSingle();
      if (!cancelled) setUsername(String(profile?.username || "").toLowerCase() || null);
    }

    void loadUser();

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
      setUsername(null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // Load + keep reasonably in sync in same tab
  useEffect(() => {
    const read = () => setDrops(readPayDrops(userId, username === "johnandy"));

    read();
    const onStorage = (e: StorageEvent) => {
      if (e.key) read();
    };
    const onUpdated = () => read();
    window.addEventListener("storage", onStorage);
    window.addEventListener(PAY_DROPS_UPDATED_EVENT, onUpdated as EventListener);

    // Same-tab updates don’t fire "storage", so we poll lightly
    const t = window.setInterval(read, 1200);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(PAY_DROPS_UPDATED_EVENT, onUpdated as EventListener);
      window.clearInterval(t);
    };
  }, [userId, username]);

  const payDrops = useMemo(() => {
    return drops
      .filter((d) => (d.amountCents ?? 0) > 0)
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      .slice(0, max);
  }, [drops, max]);

  const goAddPay = () => {
    try {
      localStorage.setItem(PREF_MODE_KEY, "Pay");
    } catch {}
    router.push("/board/feed");
  };

  async function openCheckout(drop: PayDrop) {
    if (drop.provider === "payment_link" && drop.checkoutUrl) {
      window.open(drop.checkoutUrl, "_blank", "noopener,noreferrer");
      return;
    }

    try {
      setBusyId(drop.id);
      await openHostedPayDropCheckout({
        payDropId: drop.id,
        title: drop.title,
        description: drop.description,
        amountCents: drop.amountCents,
      });
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Could not open National Bankcard checkout."
      );
    } finally {
      setBusyId(null);
    }
  }

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
                  {fmtMoney(d.amountCents)}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-extrabold tracking-[0.12em] uppercase">
                <span className="rounded-full border border-black/10 bg-white/70 px-3 py-2 text-black/55">
                  {d.provider === "authorize_net_accept_hosted"
                    ? "Authorize.Net Hosted"
                    : "Payment Link"}
                </span>
                <span className="rounded-full border border-black/10 bg-white/70 px-3 py-2 text-black/45">
                  {d.status.replaceAll("_", " ")}
                </span>
              </div>

              {d.checkoutUrl || d.provider === "authorize_net_accept_hosted" ? (
                <button
                  type="button"
                  onClick={() => void openCheckout(d)}
                  disabled={busyId === d.id}
                  className="mt-3 inline-flex rounded-full px-3 py-2 text-xs font-extrabold tracking-[0.12em] uppercase bg-white/70 border border-black/10 text-[rgba(255,0,190,0.9)] disabled:opacity-60 disabled:cursor-wait"
                >
                  {busyId === d.id ? "Opening..." : "Checkout →"}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
