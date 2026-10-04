"use client";

import React, { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatUsdFromCents, parseAmountToCents, type PayDropBankingSettings } from "@/lib/board/banking/status";
import { markResumePayDrop } from "@/lib/board/banking/resume";
import { useBoardBanking } from "@/lib/board/banking/useBoardBanking";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function Toggle({
  night,
  checked,
  onChange,
  ariaLabel,
}: {
  night: boolean;
  checked: boolean;
  onChange: (value: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={cx(
        "h-7 w-12 rounded-full border transition",
        checked
          ? "border-emerald-300/40 bg-emerald-300/80"
          : night
            ? "border-white/20 bg-white/10"
            : "border-black/15 bg-black/10"
      )}
    >
      <span
        className={cx(
          "block h-5 w-5 rounded-full bg-white transition",
          checked ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  );
}

export default function BankingPanel({ night }: { night: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resumePay = searchParams.get("pay") === "continue";
  const { snapshot, settings, setSettings, transactions, loading, error, refresh } = useBoardBanking();
  const [pane, setPane] = useState<"home" | "setup" | "settings" | "history">("home");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [defaultAmount, setDefaultAmount] = useState("");

  const selected = useMemo(
    () => transactions.find((row) => row.id === selectedId) ?? null,
    [selectedId, transactions]
  );

  async function startOnboarding() {
    setBusy(true);
    try {
      const res = await fetch("/api/paydrops/stripe/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          returnPath: "/board/options?tab=banking&pay=continue",
          refreshPath: "/board/options?tab=banking",
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok || !data.url) {
        throw new Error(data?.error || "Could not start Banking setup.");
      }
      window.location.href = data.url;
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not start Banking setup.");
      setBusy(false);
    }
  }

  async function managePayouts() {
    setBusy(true);
    try {
      const res = await fetch("/api/paydrops/stripe/login-link", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok || !data.url) {
        throw new Error(data?.error || "Could not open payout settings.");
      }
      window.location.href = data.url;
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not open payout settings.");
      setBusy(false);
    }
  }

  async function saveSettings(next: PayDropBankingSettings) {
    setSettings(next);
    await fetch("/api/paydrops/banking", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
  }

  const card = "rounded-[22px] border p-5";
  const cardTone = night ? "border-white/14 bg-white/6" : "border-black/10 bg-white/70";

  return (
    <div className="grid gap-4">
      <div
        className={cx(
          "relative overflow-hidden rounded-[26px] border p-5 sm:p-6",
          night
            ? "border-emerald-200/20 bg-[linear-gradient(135deg,rgba(185,255,221,0.12),rgba(255,216,101,0.08),rgba(255,255,255,0.05))]"
            : "border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.78),rgba(222,255,238,0.58),rgba(255,239,167,0.44))]"
        )}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className={cx("text-2xl font-black tracking-tight sm:text-3xl", night ? "text-white" : "text-black/82")}>
              Banking
            </div>
            <p className={cx("mt-2 max-w-3xl text-sm", night ? "text-white/64" : "text-black/58")}>
              {snapshot?.message || "Connect payouts, receive Pay Drops, and review history."}
            </p>
          </div>
          <div
            className={cx(
              "inline-flex w-fit items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em]",
              snapshot?.readyForPayDrops
                ? "border-emerald-300/40 bg-emerald-300/15 text-emerald-100"
                : night
                  ? "border-[#ffe58c]/30 bg-[#ffe58c]/12 text-[#ffe58c]"
                  : "border-[#d5ad25]/35 bg-[#fff1a8]/70 text-[#7a6417]"
            )}
          >
            {loading ? "Checking…" : snapshot?.label || "Not Connected"}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {[
            { label: "Available", value: formatUsdFromCents(snapshot?.availableCents ?? 0) },
            { label: "Pending", value: formatUsdFromCents(snapshot?.pendingCents ?? 0) },
            { label: "Pay Drop Revenue", value: formatUsdFromCents(snapshot?.lifetimeCents ?? 0) },
          ].map((item) => (
            <div key={item.label} className={cx(card, cardTone)}>
              <div className={cx("text-[11px] font-black uppercase tracking-[0.16em]", night ? "text-white/48" : "text-black/45")}>
                {item.label}
              </div>
              <div className={cx("mt-2 text-2xl font-black", night ? "text-white/90" : "text-black/80")}>{item.value}</div>
            </div>
          ))}
        </div>

        {resumePay ? (
          <div className={cx("mt-5 rounded-2xl border px-4 py-3 text-sm", night ? "border-emerald-300/25 bg-emerald-300/10" : "border-emerald-700/20 bg-emerald-50")}>
            {snapshot?.readyForPayDrops
              ? "Your Banking is ready. Continue your Pay Drop."
              : "Finish Banking setup, then you can continue your Pay Drop."}
            {snapshot?.readyForPayDrops ? (
              <button
                type="button"
                className="ml-3 rounded-full bg-emerald-300 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-emerald-950"
                onClick={() => {
                  markResumePayDrop();
                  router.push("/board/profile?pay=compose");
                }}
              >
                Continue Pay Drop
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          {(
            [
              ["home", "Home"],
              ["setup", "Payment Setup"],
              ["settings", "Pay Drop Settings"],
              ["history", "History"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPane(key)}
              className={cx(
                "rounded-full border px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em]",
                pane === key
                  ? "border-emerald-300/50 bg-emerald-300/20 text-emerald-50"
                  : night
                    ? "border-white/15 text-white/70"
                    : "border-black/10 text-black/60"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className={cx(card, cardTone, "text-sm")}>{error}</div>
      ) : null}

      {pane === "home" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className={cx(card, cardTone)}>
            <div className="text-lg font-black">Payouts</div>
            <p className={cx("mt-2 text-sm", night ? "text-white/60" : "text-black/55")}>
              {snapshot?.nextPayoutHint ||
                "Payouts go automatically to your connected account. Board does not move money to a card from here."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={startOnboarding}
                className="rounded-full bg-emerald-300 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-950"
              >
                {snapshot?.stripeAccountId ? "Continue Setup" : "Set Up Banking"}
              </button>
              <button
                type="button"
                disabled={busy || !snapshot?.stripeAccountId}
                onClick={managePayouts}
                className={cx(
                  "rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.14em]",
                  night ? "border-white/20 text-white/80" : "border-black/15 text-black/70"
                )}
              >
                Manage Banking
              </button>
              <button
                type="button"
                onClick={() => void refresh()}
                className={cx(
                  "rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.14em]",
                  night ? "border-white/20 text-white/80" : "border-black/15 text-black/70"
                )}
              >
                Refresh
              </button>
            </div>
          </div>
          <div className={cx(card, cardTone)}>
            <div className="text-lg font-black">Recent Pay Drops</div>
            {transactions.length ? (
              <div className="mt-3 grid gap-2">
                {transactions.slice(0, 5).map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(row.id);
                      setPane("history");
                    }}
                    className={cx(
                      "flex items-center justify-between rounded-xl border px-3 py-2 text-left text-sm",
                      night ? "border-white/10" : "border-black/8"
                    )}
                  >
                    <span>{row.title || "Pay Drop"}</span>
                    <span>{formatUsdFromCents(row.creator_amount_cents ?? row.amount_cents)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className={cx("mt-3 text-sm", night ? "text-white/50" : "text-black/45")}>
                No Pay Drops have landed yet.
              </p>
            )}
          </div>
        </div>
      ) : null}

      {pane === "setup" ? (
        <div className={cx(card, cardTone)}>
          <div className="text-lg font-black">Payment Setup</div>
          <p className={cx("mt-2 text-sm", night ? "text-white/60" : "text-black/55")}>
            Connect a payout account so supporters can complete a Pay Drop and funds can reach you.
          </p>
          <dl className="mt-4 grid gap-2 text-sm">
            <div>Account: {snapshot?.stripeAccountId ? "Connected" : "Not connected"}</div>
            <div>Charges: {snapshot?.chargesEnabled ? "Enabled" : "Off"}</div>
            <div>Payouts: {snapshot?.payoutsEnabled ? "Enabled" : "Off"}</div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={startOnboarding}
              className="rounded-full bg-emerald-300 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-950"
            >
              {snapshot?.readyForPayDrops ? "Update Banking" : "Set Up Banking"}
            </button>
            {snapshot?.stripeAccountId ? (
              <button
                type="button"
                disabled={busy}
                onClick={managePayouts}
                className={cx(
                  "rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.14em]",
                  night ? "border-white/20 text-white/80" : "border-black/15 text-black/70"
                )}
              >
                Open payout account
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {pane === "settings" ? (
        <div className={cx(card, cardTone, "grid gap-4")}>
          <div className="text-lg font-black">Pay Drop Settings</div>
          <label className="grid gap-1 text-sm">
            Default amount (USD)
            <input
              className={cx(
                "rounded-xl border px-3 py-2",
                night ? "border-white/15 bg-black/20 text-white" : "border-black/10 bg-white"
              )}
              value={defaultAmount || String((settings.defaultAmountCents / 100).toFixed(2))}
              onChange={(event) => setDefaultAmount(event.target.value)}
              onBlur={() => {
                const cents = parseAmountToCents(defaultAmount);
                if (cents && cents > 0) {
                  void saveSettings({ ...settings, defaultAmountCents: cents });
                }
                setDefaultAmount("");
              }}
            />
          </label>
          {(
            [
              ["payDropsEnabled", "Allow Pay Drops"],
              ["directRequestsEnabled", "Direct Requests"],
              ["paymentLinkPreferred", "Prefer external payment links"],
              ["showOnProfile", "Show on Profile Board"],
              ["showOnWorkBoard", "Show on Work Board"],
              ["notifyOnPayDrop", "Notify me when a Pay Drop lands"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <span className="text-sm">{label}</span>
              <Toggle
                night={night}
                ariaLabel={label}
                checked={settings[key]}
                onChange={(value) => void saveSettings({ ...settings, [key]: value })}
              />
            </div>
          ))}
        </div>
      ) : null}

      {pane === "history" ? (
        <div className={cx(card, cardTone)}>
          <div className="text-lg font-black">Withdrawals & History</div>
          <p className={cx("mt-2 text-sm", night ? "text-white/60" : "text-black/55")}>
            {snapshot?.nextPayoutHint || "Payouts are handled by your connected payout account."}
          </p>
          <div className="mt-4 grid gap-2">
            {transactions.length ? (
              transactions.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedId(row.id === selectedId ? null : row.id)}
                  className={cx(
                    "rounded-xl border px-3 py-3 text-left",
                    night ? "border-white/10" : "border-black/8"
                  )}
                >
                  <div className="flex items-center justify-between gap-3 text-sm font-bold">
                    <span>{row.title || "Pay Drop"}</span>
                    <span>{formatUsdFromCents(row.amount_cents)}</span>
                  </div>
                  <div className={cx("mt-1 text-xs uppercase tracking-[0.12em]", night ? "text-white/45" : "text-black/40")}>
                    {row.payment_status} · {row.payout_status || "pending"} ·{" "}
                    {row.payer_id ? "Board supporter" : "Guest"} ·{" "}
                    {new Date(row.created_at).toLocaleString()}
                  </div>
                  {selected?.id === row.id ? (
                    <dl className={cx("mt-3 grid gap-1 text-xs", night ? "text-white/65" : "text-black/60")}>
                      <div>Gross: {formatUsdFromCents(row.amount_cents)}</div>
                      <div>Board fee: {formatUsdFromCents(row.platform_fee_cents ?? 0)}</div>
                      <div>Net: {formatUsdFromCents(row.creator_amount_cents ?? row.amount_cents)}</div>
                      <div>Reference: {row.id}</div>
                    </dl>
                  ) : null}
                </button>
              ))
            ) : (
              <p className={cx("text-sm", night ? "text-white/50" : "text-black/45")}>No transactions yet.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
