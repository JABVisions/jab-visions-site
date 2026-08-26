"use client";

import React from "react";

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export type DropPadApp =
  | "home"
  | "board_drops"
  | "assets"
  | "projects"
  | "portfolio"
  | "work_calls"
  | "profile_drops"
  | "store_drops";

export default function QuickActionsRemote({
  osOn,
  activeApp,
  onPower,
  onHome,
  onOff,
  onNavigate,
}: {
  osOn: boolean;
  activeApp: DropPadApp;
  onPower: () => void;      // ✅ toggles
  onHome: () => void;
  onOff: () => void;
  onNavigate: (app: DropPadApp) => void;
}) {
  return (
    <div className="w-full rounded-3xl border border-white/10 bg-black/25 p-3 backdrop-blur-md sm:p-4 md:p-5">
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div>
          <div className="text-base font-semibold text-white sm:text-lg">Quick Actions</div>
          <div className="text-xs text-white/60 sm:text-sm">Remote control for Drop Pad OS.</div>
        </div>

        <div className="shrink-0 text-xs text-white/50">
          OS:{" "}
          <span className={clsx("font-semibold", osOn ? "text-white/80" : "text-white/40")}>
            {osOn ? "ON" : "OFF"}
          </span>
        </div>
      </div>

      <div className="mt-3 rounded-3xl border border-white/10 bg-white/5 p-3 md:mt-4 md:p-4">
        {/* ✅ POWER ROW */}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={onPower}
            className={clsx(
              "min-w-0 rounded-xl border px-1.5 py-2 text-xs transition sm:text-sm md:rounded-2xl md:px-3",
              osOn
                ? "border-white/25 bg-white/15 text-white hover:bg-white/20"
                : "border-white/20 bg-white/10 text-white hover:bg-white/15"
            )}
          >
            {osOn ? "Power Off" : "Power On"}
          </button>

          <button
            type="button"
            onClick={onHome}
            disabled={!osOn}
            className="min-w-0 rounded-xl border border-white/15 bg-white/5 px-1.5 py-2 text-xs text-white/80 transition hover:bg-white/10 disabled:opacity-50 sm:text-sm md:rounded-2xl md:px-3"
          >
            Home
          </button>

          <button
            type="button"
            onClick={onOff}
            disabled={!osOn}
            className="min-w-0 rounded-xl border border-white/15 bg-white/5 px-1.5 py-2 text-xs text-white/80 transition hover:bg-white/10 disabled:opacity-50 sm:text-sm md:rounded-2xl md:px-3"
          >
            Off
          </button>
        </div>

        {/* Buttons stay disabled until power is on */}
        <div className="mt-3 grid grid-cols-3 gap-2 md:mt-4 md:grid-cols-2">
          <RemoteButton label="Assets" active={activeApp === "assets"} disabled={!osOn} onClick={() => onNavigate("assets")} />
          <RemoteButton label="Board Drops" hint="Open console" active={activeApp === "board_drops"} disabled={!osOn} onClick={() => onNavigate("board_drops")} />
          <RemoteButton label="Portfolio" active={activeApp === "portfolio"} disabled={!osOn} onClick={() => onNavigate("portfolio")} />
          <RemoteButton label="Profile Drops" active={activeApp === "profile_drops"} disabled={!osOn} onClick={() => onNavigate("profile_drops")} />
          <RemoteButton label="Work Calls" active={activeApp === "work_calls"} disabled={!osOn} onClick={() => onNavigate("work_calls")} />
          <RemoteButton label="Store Drops" active={activeApp === "store_drops"} disabled={!osOn} onClick={() => onNavigate("store_drops")} />
        </div>

        {!osOn && <div className="mt-2 text-[11px] text-white/40 md:mt-3 md:text-xs">Power on to control the OS.</div>}
      </div>
    </div>
  );
}

function RemoteButton({
  label,
  hint = "Open window",
  active,
  disabled,
  onClick,
}: {
  label: string;
  hint?: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "min-w-0 rounded-xl border px-2 py-2 text-center text-xs transition md:rounded-2xl md:px-4 md:py-3 md:text-left md:text-sm",
        disabled
          ? "border-white/10 bg-white/5 text-white/40 cursor-not-allowed"
          : active
          ? "border-white/25 bg-white/15 text-white"
          : "border-white/15 bg-white/8 text-white/80 hover:bg-white/12"
      )}
    >
      <span className="block leading-tight">{label}</span>
      <div className="mt-1 hidden text-[11px] text-white/45 md:block">{hint}</div>
    </button>
  );
}
