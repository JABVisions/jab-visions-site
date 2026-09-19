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
    <div className="w-full rounded-3xl border border-white/10 bg-black/25 p-3 backdrop-blur-md">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-white">Quick Actions</div>
          <div className="text-[11px] leading-tight text-white/60">Remote control for Drop Pad OS.</div>
        </div>

        <div className="shrink-0 text-[11px] text-white/50">
          OS:{" "}
          <span className={clsx("font-semibold", osOn ? "text-white/80" : "text-white/40")}>
            {osOn ? "ON" : "OFF"}
          </span>
        </div>
      </div>

      <div className="mt-3 rounded-3xl border border-white/10 bg-white/5 p-2.5">
        {/* ✅ POWER ROW */}
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={onPower}
            className={clsx(
              "min-w-0 rounded-xl border px-1 py-2 text-[10px] leading-tight transition",
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
            className="min-w-0 rounded-xl border border-white/15 bg-white/5 px-1 py-2 text-[10px] leading-tight text-white/80 transition hover:bg-white/10 disabled:opacity-50"
          >
            Home
          </button>

          <button
            type="button"
            onClick={onOff}
            disabled={!osOn}
            className="min-w-0 rounded-xl border border-white/15 bg-white/5 px-1 py-2 text-[10px] leading-tight text-white/80 transition hover:bg-white/10 disabled:opacity-50"
          >
            Off
          </button>
        </div>

        {/* Buttons stay disabled until power is on */}
        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          <RemoteButton label="Assets" active={activeApp === "assets"} disabled={!osOn} onClick={() => onNavigate("assets")} />
          <RemoteButton label="Board Drops" hint="Open console" active={activeApp === "board_drops"} disabled={!osOn} onClick={() => onNavigate("board_drops")} />
          <RemoteButton label="Portfolio" active={activeApp === "portfolio"} disabled={!osOn} onClick={() => onNavigate("portfolio")} />
          <RemoteButton label="Profile Drops" active={activeApp === "profile_drops"} disabled={!osOn} onClick={() => onNavigate("profile_drops")} />
          <RemoteButton label="Work Calls" active={activeApp === "work_calls"} disabled={!osOn} onClick={() => onNavigate("work_calls")} />
          <RemoteButton label="Store Drops" active={activeApp === "store_drops"} disabled={!osOn} onClick={() => onNavigate("store_drops")} />
        </div>

        {!osOn && <div className="mt-2 text-[10px] text-white/40">Power on to control the OS.</div>}
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
        "min-w-0 rounded-xl border px-1.5 py-2 text-center text-[10px] leading-tight transition",
        disabled
          ? "border-white/10 bg-white/5 text-white/40 cursor-not-allowed"
          : active
          ? "border-white/25 bg-white/15 text-white"
          : "border-white/15 bg-white/8 text-white/80 hover:bg-white/12"
      )}
    >
      <span className="block leading-tight">{label}</span>
      <span className="sr-only">{hint}</span>
    </button>
  );
}
