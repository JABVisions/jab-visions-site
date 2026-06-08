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
    <div className="rounded-3xl border border-white/10 bg-black/25 backdrop-blur-md p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-white font-semibold text-lg">Quick Actions</div>
          <div className="text-white/60 text-sm">Remote control for Drop Pad OS.</div>
        </div>

        <div className="text-xs text-white/50">
          OS:{" "}
          <span className={clsx("font-semibold", osOn ? "text-white/80" : "text-white/40")}>
            {osOn ? "ON" : "OFF"}
          </span>
        </div>
      </div>

      <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-4">
        {/* ✅ POWER ROW */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onPower}
            className={clsx(
              "flex-1 rounded-2xl border px-3 py-2 text-sm transition",
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
            className="flex-1 rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 transition disabled:opacity-50"
          >
            Home
          </button>

          <button
            type="button"
            onClick={onOff}
            disabled={!osOn}
            className="flex-1 rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 transition disabled:opacity-50"
          >
            Off
          </button>
        </div>

        {/* Buttons stay disabled until power is on */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <RemoteButton label="Assets" active={activeApp === "assets"} disabled={!osOn} onClick={() => onNavigate("assets")} />
          <RemoteButton label="Board Drops" hint="Open console" active={activeApp === "board_drops"} disabled={!osOn} onClick={() => onNavigate("board_drops")} />
          <RemoteButton label="Portfolio" active={activeApp === "portfolio"} disabled={!osOn} onClick={() => onNavigate("portfolio")} />
          <RemoteButton label="Profile Drops" active={activeApp === "profile_drops"} disabled={!osOn} onClick={() => onNavigate("profile_drops")} />
          <RemoteButton label="Work Calls" active={activeApp === "work_calls"} disabled={!osOn} onClick={() => onNavigate("work_calls")} />
          <RemoteButton label="Store Drops" active={activeApp === "store_drops"} disabled={!osOn} onClick={() => onNavigate("store_drops")} />
        </div>

        {!osOn && <div className="mt-3 text-xs text-white/40">Power on to control the OS.</div>}
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
        "rounded-2xl border px-4 py-3 text-sm transition text-left",
        disabled
          ? "border-white/10 bg-white/5 text-white/40 cursor-not-allowed"
          : active
          ? "border-white/25 bg-white/15 text-white"
          : "border-white/15 bg-white/8 text-white/80 hover:bg-white/12"
      )}
    >
      {label}
      <div className="mt-1 text-[11px] text-white/45">{hint}</div>
    </button>
  );
}
