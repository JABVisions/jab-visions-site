"use client";

import { useEffect, useMemo, useState } from "react";

type WorkStatus = "unemployed" | "working" | "vacation";

type WorkView = "drop-pad" | "assets" | "portfolio" | "projects" | "work-calls";

type Props = {
  activeView?: WorkView;
  onChangeView?: (view: WorkView) => void;
};

/** Board Profile storage (you’ve used this pattern already) */
const BOARD_PROFILE_KEY = "jab_board_profile_v2";

/** WorkStation storage */
const WORKSTATION_KEY = "jab_workstation_v1";

type BoardProfilePayload = {
  displayName?: string;
  avatarDataUrl?: string | null;
};

type WorkStationState = {
  profession: string;
  status: WorkStatus;
  updatedAt: number;
};

const PROFESSIONS = [
  "",
  "Actor",
  "Director",
  "Writer",
  "Producer",
  "Cinematographer / DP",
  "Editor",
  "VFX Artist",
  "Composer",
  "Sound Designer",
  "Production Assistant",
  "Makeup Artist",
  "Hair Stylist",
  "Photographer",
  "Model",
  "Graphic Designer",
  "Animator",
  "Software Developer",
  "Other",
];

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function statusLabel(s: WorkStatus) {
  if (s === "working") return "Working";
  if (s === "vacation") return "On Vacation";
  return "Unemployed";
}

export default function WorkStatusTile({ onChangeView }: Props) {
  const boardProfile = useMemo(() => {
    if (typeof window === "undefined") return { displayName: "You", avatarDataUrl: null };
    return safeParse<BoardProfilePayload>(localStorage.getItem(BOARD_PROFILE_KEY), {
      displayName: "You",
      avatarDataUrl: null,
    });
  }, []);

  const [state, setState] = useState<WorkStationState>({
    profession: "",
    status: "unemployed",
    updatedAt: Date.now(),
  });

  // Load workstation state
  useEffect(() => {
    if (typeof window === "undefined") return;
    const loaded = safeParse<WorkStationState | null>(localStorage.getItem(WORKSTATION_KEY), null);
    if (loaded) setState(loaded);
  }, []);

  // Persist workstation state
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(WORKSTATION_KEY, JSON.stringify(state));
  }, [state]);

  // Rule: If profession is empty, force status to unemployed.
  useEffect(() => {
    if (!state.profession && state.status !== "unemployed") {
      setState((s) => ({ ...s, status: "unemployed", updatedAt: Date.now() }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.profession]);

  const canBeEmployed = !!state.profession;

  const avatar = boardProfile.avatarDataUrl ?? null;
  const name = boardProfile.displayName?.trim() || "You";

  return (
    <div className="rounded-[18px] border border-black/10 bg-white/75 p-4 shadow-[0_10px_25px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-between gap-3">
        {/* Left: avatar + identity */}
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 overflow-hidden rounded-full border border-black/10 bg-black/5">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="Profile" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-black/50">
                IMG
              </div>
            )}
          </div>

          <div className="leading-tight">
            <div className="text-sm font-semibold text-black/80">{name}</div>
            <div className="text-xs text-black/55">
              {state.profession ? state.profession : "Choose a profession to start working"}
            </div>
          </div>
        </div>

        {/* Right: Work Calls button (opens Drop Pad screen) */}
        <button
          type="button"
          onClick={() => onChangeView?.("drop-pad")}
          className="rounded-full border border-black/10 bg-black px-3 py-2 text-xs font-semibold text-white hover:bg-black/90"
          title="Open Work Calls inside Drop Pad"
        >
          Work Calls
        </button>
      </div>

      {/* Divider */}
      <div className="my-4 h-px w-full bg-black/10" />

      {/* Controls */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {/* Profession */}
        <div>
          <div className="mb-1 text-xs font-semibold text-black/70">Profession</div>
          <select
            value={state.profession}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                profession: e.target.value,
                // optional: if they pick a profession and they were unemployed, gently move to working
                status: e.target.value ? (s.status === "unemployed" ? "working" : s.status) : "unemployed",
                updatedAt: Date.now(),
              }))
            }
            className="w-full rounded-[12px] border border-black/10 bg-white px-3 py-2 text-sm text-black/80 outline-none"
          >
            {PROFESSIONS.map((p) => (
              <option key={p || "none"} value={p}>
                {p || "Select profession…"}
              </option>
            ))}
          </select>
        </div>

        {/* Status */}
        <div>
          <div className="mb-1 text-xs font-semibold text-black/70">Status</div>

          <div className="flex flex-wrap items-center gap-2">
            {(["unemployed", "working", "vacation"] as WorkStatus[]).map((s) => {
              const active = state.status === s;

              // If no profession, only "unemployed" is allowed.
              const disabled = !canBeEmployed && s !== "unemployed";

              return (
                <button
                  key={s}
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    setState((prev) => ({
                      ...prev,
                      status: s,
                      updatedAt: Date.now(),
                    }))
                  }
                  className={[
                    "rounded-full px-3 py-2 text-xs font-semibold transition",
                    active ? "bg-black text-white" : "bg-white text-black/70 border border-black/10",
                    disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-black/5",
                  ].join(" ")}
                >
                  {statusLabel(s)}
                </button>
              );
            })}
          </div>

          {!canBeEmployed && (
            <div className="mt-2 text-xs text-black/45">
              Status stays <span className="font-semibold">Unemployed</span> until you select a profession.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
