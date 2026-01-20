// app/components/board/WorkDesk.tsx
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const PAYDROPS_STORAGE_KEY = "jab_board_pay_drops_v1";
const BOARD_PROFILE_STORAGE_KEY = "jab_board_profile_v2";

type PayDropLite = {
  id: string;
  title: string;
  thumb?: string;
  createdAt: number;
};

type ProfilePayload = {
  avatarDataUrl?: string | null;
  glowColor?: string;
  avatarUrl?: string | null;
  avatar?: string | null;
  profilePic?: string | null;
};

const JOBS = [
  "Actor",
  "Director",
  "Writer",
  "Producer",
  "DP / Camera",
  "Editor",
  "Sound Mixer",
  "Production Designer",
  "Wardrobe Stylist",
  "HMU Artist",
  "VFX Artist",
  "Stunt Coordinator",
  "Location Manager",
  "Casting Assistant",
  "Production Assistant",
  "Social Media Manager",
  "Photographer",
  "Composer",
  "Music Artist",
  // JAB Vision flavored jobs
  "JAB Board Moderator",
  "JAB Board Builder",
  "JAB Comics Artist",
  "JAB Store Curator",
  "JAB Music Curator",
  "JAB Visions Intern",
  "Other",
] as const;

export default function WorkDesk({
  onToggleDropPadPower = () => {},
  onManagePayDrops = () => {},
  compact,
}: {
  /** ✅ Optional so <WorkDesk /> won't break builds */
  onToggleDropPadPower?: () => void;
  /** ✅ Optional so <WorkDesk /> won't break builds */
  onManagePayDrops?: () => void;
  compact?: boolean;
}) {
  const [payDrops, setPayDrops] = useState<PayDropLite[]>([]);
  const [status, setStatus] = useState<"unemployed" | "working" | "on_vacation">("unemployed");
  const [job, setJob] = useState("");

  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
  const [avatarGlow, setAvatarGlow] = useState<string>("#A3FF12");

  function safeParse<T>(raw: string | null, fallback: T): T {
    try {
      if (!raw) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  function loadProfileAvatar() {
    if (typeof window === "undefined") return;

    const payload = safeParse<ProfilePayload>(
      localStorage.getItem(BOARD_PROFILE_STORAGE_KEY),
      {}
    );

    const url =
      payload?.avatarDataUrl ??
      payload?.avatarUrl ??
      payload?.avatar ??
      payload?.profilePic ??
      null;

    setAvatarDataUrl(url);

    const glow = payload?.glowColor;
    if (typeof glow === "string" && glow.trim()) setAvatarGlow(glow);
  }

  function loadPayDrops() {
    if (typeof window === "undefined") return;

    const parsed = safeParse<PayDropLite[]>(localStorage.getItem(PAYDROPS_STORAGE_KEY), []);
    const list = Array.isArray(parsed) ? parsed : [];
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    setPayDrops(list);
  }

  useEffect(() => {
    loadPayDrops();
    loadProfileAvatar();

    function onStorage(e: StorageEvent) {
      if (e.key === PAYDROPS_STORAGE_KEY) loadPayDrops();
      if (e.key === BOARD_PROFILE_STORAGE_KEY) loadProfileAvatar();
    }

    window.addEventListener("storage", onStorage);

    // light polling for same-tab changes
    const t = window.setInterval(() => {
      loadPayDrops();
      loadProfileAvatar();
    }, 1200);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.clearInterval(t);
    };
  }, []);

  const canQuit = status !== "unemployed";

  const quitJob = () => {
    setJob("");
    setStatus("unemployed");
  };

  return (
    <div
      className={clsx(
        "rounded-3xl border border-white/12 bg-black/25 backdrop-blur-md p-4",
        compact ? "md:p-4" : "md:p-6"
      )}
      style={{
        boxShadow: "0 0 0 1px rgba(255,255,255,0.06), 0 0 48px rgba(168,85,247,0.18)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-white font-semibold text-lg">Work Desk</div>
          <div className="text-white/60 text-xs">Status + Pay Drops.</div>
        </div>

        <button
          type="button"
          onClick={onToggleDropPadPower}
          className="rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-xs text-white hover:bg-white/15 transition"
        >
          Toggle OS
        </button>
      </div>

      {/* STATUS */}
      <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="text-white/80 text-sm font-medium">Status</div>
            <StatusLight color={statusIndicator(status)} />
          </div>

          <Link href="/board/profile" className="shrink-0">
            <ProfileAvatarCircle src={avatarDataUrl} glow={avatarGlow} />
          </Link>
        </div>

        <div className="mt-2 text-white text-lg font-semibold">{statusLabel(status)}</div>

        <div className="mt-3 grid gap-2">
          {/* QUIT button */}
          <button
            type="button"
            onClick={quitJob}
            disabled={!canQuit}
            className={clsx(
              "w-full rounded-xl border px-3 py-2 text-xs transition text-left",
              canQuit
                ? "border-white/18 bg-black/35 text-white/80 hover:bg-black/45"
                : "border-white/10 bg-black/20 text-white/35 cursor-not-allowed"
            )}
            title={canQuit ? "Quit job (set Unemployed)" : "You’re already unemployed"}
          >
            Quit
          </button>

          {/* Job dropdown */}
          <label className="text-xs text-white/60 -mt-0.5">Job</label>

          <div className="-ml-1">
            <select
              value={job}
              onChange={(e) => {
                const v = e.target.value;
                setJob(v);

                if (v) setStatus("working");
                if (!v) setStatus("unemployed");
              }}
              className="w-[calc(100%+4px)] rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none"
            >
              <option value="">Choose a job…</option>
              {JOBS.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
          </div>

          {/* Status toggles */}
          <div className="mt-2 flex items-center gap-2">
            <StatusChip active={status === "working"} onClick={() => setStatus("working")}>
              Work
            </StatusChip>
            <StatusChip active={status === "on_vacation"} onClick={() => setStatus("on_vacation")}>
              Vacation
            </StatusChip>
          </div>
        </div>
      </div>

      {/* PAY DROP STAND */}
      <PayDropStand payDrops={payDrops} onManagePayDrops={onManagePayDrops} />
    </div>
  );
}

function PayDropStand({
  payDrops,
  onManagePayDrops,
}: {
  payDrops: PayDropLite[];
  onManagePayDrops: () => void;
}) {
  const slots = 4;
  const filled = payDrops.slice(0, slots);

  return (
    <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-white/85 font-semibold">Pay Drop Stand</div>
          <div className="text-white/55 text-xs">4 slots.</div>
        </div>

        <button
          type="button"
          onClick={onManagePayDrops}
          className="rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10 transition"
        >
          Manage
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {Array.from({ length: slots }).map((_, i) => {
          const item = filled[i];
          return (
            <div key={i} className="rounded-2xl border border-white/10 bg-black/30 overflow-hidden">
              <div className="h-14 flex items-center justify-center">
                {item ? (
                  <div className="px-2 text-center">
                    <div className="text-[10px] text-white/50">Pay</div>
                    <div className="mt-0.5 text-[11px] leading-tight text-white/80 line-clamp-2">
                      {item.title}
                    </div>
                  </div>
                ) : (
                  <div className="text-[10px] text-white/35">Empty</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProfileAvatarCircle({ src, glow }: { src: string | null; glow: string }) {
  return (
    <div
      className="h-16 w-16 rounded-full overflow-hidden flex items-center justify-center border border-white/15 bg-black/35"
      style={{
        boxShadow: `0 0 0 2px rgba(255,255,255,0.08),
                    0 0 0 8px ${glow}22,
                    0 0 45px ${glow}88`,
      }}
      title="Profile Picture"
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="Profile" className="h-full w-full object-cover" draggable={false} />
      ) : (
        <div className="text-[10px] text-white/40 text-center px-1">Avatar</div>
      )}
    </div>
  );
}

/* UI helpers */

function StatusChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "rounded-xl border px-3 py-2 text-xs transition",
        active
          ? "border-white/25 bg-white/15 text-white"
          : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80"
      )}
    >
      {children}
    </button>
  );
}

function StatusLight({ color }: { color: "off" | "green" | "yellow" }) {
  const styles =
    color === "green"
      ? "bg-green-400 shadow-[0_0_16px_rgba(74,222,128,0.65)]"
      : color === "yellow"
      ? "bg-yellow-300 shadow-[0_0_16px_rgba(253,224,71,0.65)]"
      : "bg-white/15";

  return <span className={clsx("inline-block h-2.5 w-2.5 rounded-full", styles)} />;
}

function statusIndicator(status: "unemployed" | "working" | "on_vacation") {
  if (status === "working") return "green" as const;
  if (status === "on_vacation") return "yellow" as const;
  return "off" as const;
}

function statusLabel(s: "unemployed" | "working" | "on_vacation") {
  if (s === "working") return "Working";
  if (s === "on_vacation") return "On Vacation";
  return "Unemployed";
}
