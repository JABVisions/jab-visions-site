"use client";

import { useEffect, useState } from "react";
import {
  PAY_DROPS_UPDATED_EVENT,
  readPayDrops,
  type PayDrop,
} from "@/lib/board/paydrops";
import { openHostedPayDropCheckout } from "@/lib/board/payCheckout";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function PayDropsPanel() {
  const [drops, setDrops] = useState<PayDrop[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    const sb = supabaseBrowser();
    let cancelled = false;

    async function loadUser() {
      const { data } = await sb.auth.getUser();
      const nextUserId = data.user?.id ?? null;
      if (!cancelled) setUserId(nextUserId);
      if (!nextUserId) {
        if (!cancelled) {
          setUsername(null);
          setDisplayName(null);
        }
        return;
      }
      const { data: profile } = await sb
        .from("profiles")
        .select("username, display_name")
        .eq("id", nextUserId)
        .maybeSingle();
      if (!cancelled) {
        setUsername(String(profile?.username || "").toLowerCase() || null);
        setDisplayName(String(profile?.display_name || "").trim() || null);
      }
    }

    void loadUser();

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
      setUsername(null);
      setDisplayName(null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const load = () => setDrops(readPayDrops(userId, username === "johnandy"));
    load();

    const onStorage = () => load();
    window.addEventListener("storage", onStorage);
    window.addEventListener(
      PAY_DROPS_UPDATED_EVENT,
      onStorage as EventListener
    );

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(
        PAY_DROPS_UPDATED_EVENT,
        onStorage as EventListener
      );
    };
  }, [userId, username]);

  async function openCheckout(drop: PayDrop) {
    if (drop.checkoutUrl) {
      window.open(drop.checkoutUrl, "_blank", "noopener,noreferrer");
      return;
    }

    if (drop.provider !== "authorize_net_accept_hosted" && drop.checkoutUrl) return;

    try {
      setBusyId(drop.id);
      await openHostedPayDropCheckout({
        payDropId: drop.id,
        title: drop.title,
        description: drop.description,
        amountCents: drop.amountCents,
        recipientUserId: drop.recipientUserId ?? userId ?? undefined,
        recipientUsername: drop.recipientUsername ?? username ?? undefined,
        recipientDisplayName:
          drop.recipientDisplayName ?? displayName ?? username ?? undefined,
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
    <section className="rounded-[26px] bg-white/75 border border-black/10 p-4">
      <div className="text-[11px] font-extrabold tracking-[0.22em] uppercase text-black/55">
        Pay Drops
      </div>
      <div className="mt-2 text-sm text-black/70">
        BOARD payment shell is ready for direct links now and National Bankcard hosted checkout next.
      </div>

      <div className="mt-4 grid gap-3">
        {drops.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-black/15 bg-white/60 p-4 text-sm text-black/55">
            No Pay Drops yet.
          </div>
        ) : (
          drops.slice(0, 6).map((drop) => (
            <div
              key={drop.id}
              className="rounded-2xl border border-black/10 bg-white/70 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-extrabold text-black/70">{drop.title}</div>
                  <div className="mt-1 text-sm text-black/55">
                    ${(drop.amountCents / 100).toFixed(2)}
                  </div>
                </div>

                <div className="text-right text-[11px] font-extrabold tracking-[0.14em] uppercase text-black/45">
                  <div>{drop.provider === "authorize_net_accept_hosted" ? "Authorize.Net" : "Payment Link"}</div>
                  <div className="mt-1">{drop.status.replaceAll("_", " ")}</div>
                </div>
              </div>
              {drop.checkoutUrl || drop.provider === "authorize_net_accept_hosted" ? (
                <button
                  type="button"
                  onClick={() => void openCheckout(drop)}
                  disabled={busyId === drop.id}
                  className="mt-3 rounded-full border border-black/10 bg-white/70 px-3 py-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[rgba(255,0,190,0.88)] disabled:cursor-wait disabled:opacity-60"
                >
                  {busyId === drop.id ? "Opening..." : "Open checkout"}
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
