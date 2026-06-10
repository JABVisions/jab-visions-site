// app/components/board/WorkDesk.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  PAY_DROPS_UPDATED_EVENT,
  readPayDrops,
  type PayDrop,
} from "@/lib/board/paydrops";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { openHostedPayDropCheckout } from "@/lib/board/payCheckout";

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const BOARD_PROFILE_STORAGE_KEY = "jab_board_profile_v2";
const WORK_DESK_STORAGE_KEY = "jab_board_work_desk_v1";
const PROFILE_UPDATED_EVENT = "board:profile:updated";

function scopedStorageKey(base: string, userId: string | null) {
  return userId ? `${base}:${userId}` : null;
}

type ProfilePayload = {
  avatarDataUrl?: string | null;
  glowColor?: string;
  avatarUrl?: string | null;
  avatar?: string | null;
  profilePic?: string | null;
};

type WorkDeskPayload = {
  status?: "unemployed" | "working" | "on_vacation";
  job?: string;
};

type BoardStylePayload = {
  workDesk?: WorkDeskPayload;
  [key: string]: unknown;
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
  const sb = useMemo(() => supabaseBrowser(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [payDrops, setPayDrops] = useState<PayDrop[]>([]);
  const [status, setStatus] = useState<"unemployed" | "working" | "on_vacation">("unemployed");
  const [job, setJob] = useState("");
  const [savedState, setSavedState] = useState<Required<WorkDeskPayload>>({
    status: "unemployed",
    job: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const dirtyRef = useRef(false);

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
    const key = scopedStorageKey(BOARD_PROFILE_STORAGE_KEY, userId);
    const payload = safeParse<ProfilePayload>(
      key
        ? localStorage.getItem(key) ?? localStorage.getItem(BOARD_PROFILE_STORAGE_KEY)
        : localStorage.getItem(BOARD_PROFILE_STORAGE_KEY),
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
    const list = readPayDrops(userId, username === "johnandy");
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    setPayDrops(list);
  }

  function loadWorkDeskState(force = false) {
    if (typeof window === "undefined") return;
    if (!force && dirtyRef.current) return;

    const payload = safeParse<WorkDeskPayload>(
      localStorage.getItem(WORK_DESK_STORAGE_KEY),
      {}
    );

    if (
      payload.status === "unemployed" ||
      payload.status === "working" ||
      payload.status === "on_vacation"
    ) {
      setStatus(payload.status);
    }

    if (typeof payload.job === "string") {
      setJob(payload.job);
    }

    setSavedState({
      status:
        payload.status === "working" || payload.status === "on_vacation"
          ? payload.status
          : "unemployed",
      job: typeof payload.job === "string" ? payload.job : "",
    });
  }

  function persistWorkDeskState(next: WorkDeskPayload) {
    if (typeof window === "undefined") return;

    const current = safeParse<WorkDeskPayload>(
      localStorage.getItem(WORK_DESK_STORAGE_KEY),
      {}
    );

    const payload: WorkDeskPayload = {
      status: next.status ?? current.status ?? "unemployed",
      job: next.job ?? current.job ?? "",
    };

    localStorage.setItem(WORK_DESK_STORAGE_KEY, JSON.stringify(payload));
  }

  async function loadWorkDeskStateFromSupabase(force = false) {
    try {
      const { data: auth, error: authError } = await sb.auth.getUser();
      if (authError || !auth?.user) return;

      const { data: profile, error } = await sb
        .from("profiles")
        .select("board_style")
        .eq("id", auth.user.id)
        .single();

      if (error) return;

      const boardStyle = safeParse<BoardStylePayload>(
        JSON.stringify(profile?.board_style ?? {}),
        {}
      );

      if (!force && dirtyRef.current) return;

      const workDesk = boardStyle.workDesk;
      if (!workDesk) return;

      if (
        workDesk.status === "unemployed" ||
        workDesk.status === "working" ||
        workDesk.status === "on_vacation"
      ) {
        setStatus(workDesk.status);
      }

      if (typeof workDesk.job === "string") {
        setJob(workDesk.job);
      }

      const nextSavedState = {
        status:
          workDesk.status === "unemployed" ||
          workDesk.status === "working" ||
          workDesk.status === "on_vacation"
            ? workDesk.status
            : "unemployed",
        job: typeof workDesk.job === "string" ? workDesk.job : "",
      } satisfies Required<WorkDeskPayload>;

      persistWorkDeskState(nextSavedState);
      setSavedState(nextSavedState);
    } catch {
      // ignore remote hydration failures
    }
  }

  async function persistWorkDeskStateToSupabase(next: WorkDeskPayload) {
    try {
      const { data: auth, error: authError } = await sb.auth.getUser();
      if (authError || !auth?.user) return;

      const { data: profile, error: profileError } = await sb
        .from("profiles")
        .select("board_style")
        .eq("id", auth.user.id)
        .single();

      if (profileError) return;

      const currentBoardStyle = safeParse<BoardStylePayload>(
        JSON.stringify(profile?.board_style ?? {}),
        {}
      );

      const currentWorkDesk = currentBoardStyle.workDesk ?? {};
      const mergedWorkDesk: WorkDeskPayload = {
        status: next.status ?? currentWorkDesk.status ?? "unemployed",
        job: next.job ?? currentWorkDesk.job ?? "",
      };

      const { error: updateError } = await sb
        .from("profiles")
        .update({
          board_style: {
            ...currentBoardStyle,
            workDesk: mergedWorkDesk,
          },
        })
        .eq("id", auth.user.id);

      if (updateError) return;
    } catch {
      // ignore remote persistence failures
    }
  }

  async function saveWorkDeskState() {
    const next = {
      status,
      job,
    } satisfies Required<WorkDeskPayload>;

    setIsSaving(true);
    setSaveMessage(null);

    try {
      persistWorkDeskState(next);
      await persistWorkDeskStateToSupabase(next);
      setSavedState(next);
      dirtyRef.current = false;
      setSaveMessage("Saved.");
      window.setTimeout(() => setSaveMessage(null), 1800);
    } catch {
      setSaveMessage("Couldn’t save.");
    } finally {
      setIsSaving(false);
    }
  }

  useEffect(() => {
    dirtyRef.current = status !== savedState.status || job !== savedState.job;
  }, [job, savedState.job, savedState.status, status]);

  useEffect(() => {
    let cancelled = false;

    async function loadAuthUser() {
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

    void loadAuthUser();

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
  }, [sb]);

  useEffect(() => {
    loadPayDrops();
    loadProfileAvatar();
    loadWorkDeskState(true);
    void loadWorkDeskStateFromSupabase(true);

    function onStorage(e: StorageEvent) {
      if (e.key && e.key !== BOARD_PROFILE_STORAGE_KEY && e.key !== WORK_DESK_STORAGE_KEY) {
        loadPayDrops();
      }
      if (e.key === BOARD_PROFILE_STORAGE_KEY) loadProfileAvatar();
      if (e.key === WORK_DESK_STORAGE_KEY) loadWorkDeskState();
    }
    function onPayDropsUpdated() {
      loadPayDrops();
    }
    function onProfileUpdated() {
      loadProfileAvatar();
    }

    window.addEventListener("storage", onStorage);
    window.addEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated as EventListener);
    window.addEventListener(
      PAY_DROPS_UPDATED_EVENT,
      onPayDropsUpdated as EventListener
    );

    // light polling for same-tab changes
    const t = window.setInterval(() => {
      loadPayDrops();
      loadProfileAvatar();
    }, 1200);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated as EventListener);
      window.removeEventListener(
        PAY_DROPS_UPDATED_EVENT,
        onPayDropsUpdated as EventListener
      );
      window.clearInterval(t);
    };
  }, [sb, userId, username]);

  const canQuit = status !== "unemployed";
  const isDirty = status !== savedState.status || job !== savedState.job;

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

        <div className="flex items-center gap-2">
          {saveMessage ? <div className="text-[11px] text-white/60">{saveMessage}</div> : null}
          <button
            type="button"
            onClick={saveWorkDeskState}
            disabled={!isDirty || isSaving}
            className={clsx(
              "rounded-2xl border px-3 py-2 text-xs transition",
              !isDirty || isSaving
                ? "cursor-not-allowed border-white/10 bg-white/5 text-white/35"
                : "border-[#b7ff2d]/30 bg-[#b7ff2d]/12 text-[#efffc9] hover:bg-[#b7ff2d]/18"
            )}
          >
            {isSaving ? "Saving..." : "Save Desk"}
          </button>
          <button
            type="button"
            onClick={onToggleDropPadPower}
            className="rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-xs text-white hover:bg-white/15 transition"
          >
            Toggle OS
          </button>
        </div>
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

                if (v) {
                  setStatus("working");
                  return;
                }

                setStatus("unemployed");
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
            <StatusChip
              active={status === "working"}
              onClick={() => {
                setStatus("working");
              }}
            >
              Work
            </StatusChip>
            <StatusChip
              active={status === "on_vacation"}
              onClick={() => {
                setStatus("on_vacation");
              }}
            >
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
  payDrops: PayDrop[];
  onManagePayDrops: () => void;
}) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const slots = 4;
  const filled = useMemo(() => payDrops.slice(0, slots), [payDrops]);
  const [thumbnailById, setThumbnailById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadThumbnails() {
      const next: Record<string, string> = {};

      await Promise.all(
        filled.map(async (item) => {
          if (item.imageUrl) {
            next[item.id] = item.imageUrl;
            return;
          }

          if (!item.bucket || !item.storagePath) return;

          const { data, error } = await sb.storage
            .from(item.bucket)
            .createSignedUrl(item.storagePath, 60 * 30);

          if (!error && data?.signedUrl) next[item.id] = data.signedUrl;
        })
      );

      if (!cancelled) setThumbnailById(next);
    }

    void loadThumbnails();

    return () => {
      cancelled = true;
    };
  }, [filled, sb]);

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
          const thumbnail = item ? thumbnailById[item.id] : null;
          const isBusy = item ? busyId === item.id : false;

          if (!item) {
            return (
              <div key={i} className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                <div className="flex h-full min-h-[154px] items-center justify-center p-2 text-[10px] text-white/35">
                  Empty
                </div>
              </div>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => void openCheckout(item)}
              disabled={isBusy}
              className="group overflow-hidden rounded-2xl border border-white/10 bg-black/30 text-left transition hover:border-lime-200/35 hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-lime-200/40 disabled:cursor-wait disabled:opacity-70"
              aria-label={`Pay on Board for ${item.title}`}
            >
              <div className="min-h-[154px] p-2">
                <div className="grid gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full border border-white/15 bg-white/8 px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-white/70">
                      Pay
                    </span>
                    <span className="rounded-full border border-white/15 bg-white/8 px-2 py-1 text-[9px] font-black text-white/70">
                      ${(item.amountCents / 100).toFixed(2)}
                    </span>
                    <span className="rounded-full border border-lime-200/20 bg-lime-300/10 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-lime-100/80">
                      {isBusy ? "Opening" : "Pay on Board"}
                    </span>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/8">
                    {thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumbnail}
                        alt={item.title}
                        className="h-24 w-full object-cover transition duration-200 group-hover:scale-[1.03]"
                        draggable={false}
                      />
                    ) : (
                      <div className="flex h-24 items-center justify-center px-3 text-center text-[10px] font-semibold text-white/35">
                        Thumbnail preparing
                      </div>
                    )}
                  </div>

                  <div className="text-[11px] font-extrabold leading-tight text-white/85 line-clamp-2">
                    {item.title}
                  </div>
                  {item.description ? (
                    <div className="text-[10px] leading-tight text-white/50 line-clamp-2">
                      {item.description}
                    </div>
                  ) : null}
                </div>
              </div>
            </button>
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
