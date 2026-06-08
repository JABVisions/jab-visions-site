"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
    BOARD_OPTIONS_STORAGE_KEY,
    DEFAULT_BOARD_OPTIONS_SETTINGS,
    type BoardOptionsSettings,
} from "@/lib/board/optionsSettings";
import {
    BOARD_PROFILE_STORAGE_KEY,
    sanitizeBoardOptionsForStorage,
    sanitizeProfileForStorage,
} from "@/lib/board/profileStorage";
import { supabaseBrowser } from "@/lib/supabase/browser";

const PROFILE_STORAGE_KEY = BOARD_PROFILE_STORAGE_KEY;

type Visibility = "public" | "private";
type ThemeMode = "light" | "dark" | "system";
type TextSize = "s" | "m" | "l";
type UiMode = "classic" | "night";
type FriendDmMode = "open" | "requests" | "muted";
type PresenceScope = "everyone" | "friend_zone" | "groups" | "hidden";
type DefaultShareScope = "public" | "friend_zone" | "close_circle" | "private";
type BankingStatus =
    | "processor_setup_required"
    | "bank_not_connected"
    | "verification_needed"
    | "ready_for_pay_drops"
    | "cash_out_available";

type AuraKey =
    | "sloth_pink"
    | "lust_blue"
    | "greed_black"
    | "pride_yellow"
    | "envy_red"
    | "gluttony_orange"
    | "wrath_purple"
    | "lilly_yellowgreen";

type BoardSettings = BoardOptionsSettings & {
    uiMode: UiMode;

    displayName: string;
    username: string;
    bio: string;
    pronouns: string;
    links: string[];

    visibility: Visibility;
    allowTags: boolean;
    allowReposts: boolean;
    hideFollowerList: boolean;

    friendGroupsEnabled: boolean;
    defaultShareScope: DefaultShareScope;
    presenceScope: PresenceScope;
    closeCircleEnabled: boolean;
    constellationsEnabled: boolean;
    groupDmMode: FriendDmMode;
    groupNotifications: boolean;
    autoSortFriendSignals: boolean;

    dmFriendZoneOnly: boolean;
    dmClubmatesAllowed: boolean;
    readReceipts: boolean;
    typingIndicators: boolean;

    notifyLikesComments: boolean;
    notifyMentionsTags: boolean;
    notifyDMs: boolean;
    notifyDrops: boolean;
    notifyClubs: boolean;
    quietHoursEnabled: boolean;

    theme: ThemeMode;
    reduceMotion: boolean;
    textSize: TextSize;

    auraColor: AuraKey;
    auraIntensity: number;
    auraAnimated: boolean;

    dropFxAnimations: boolean;
    dropFxSound: boolean;
    dropFxHaptics: boolean;

    payDropsEnabled: boolean;
    showPayDropsOnProfile: boolean;
    notifyOnPayDrop: boolean;

    presenceOnline: boolean;
    presenceLastActive: boolean;
};

type ProfileDraft = {
    displayName?: string;
    username?: string;
    bio?: string;
    avatarDataUrl?: string | null;
    avatarUrl?: string | null;
    avatarPath?: string | null;
};

const STORAGE_KEY = BOARD_OPTIONS_STORAGE_KEY;

const DEFAULT_SETTINGS: BoardSettings = {
    ...DEFAULT_BOARD_OPTIONS_SETTINGS,

    uiMode: "classic",

    displayName: "Board User",
    username: "",
    bio: "",
    pronouns: "",
    links: ["", "", ""],

    visibility: "public",
    allowTags: true,
    allowReposts: true,
    hideFollowerList: false,

    friendGroupsEnabled: true,
    defaultShareScope: "friend_zone",
    presenceScope: "friend_zone",
    closeCircleEnabled: true,
    constellationsEnabled: true,
    groupDmMode: "requests",
    groupNotifications: true,
    autoSortFriendSignals: true,

    dmFriendZoneOnly: true,
    dmClubmatesAllowed: true,
    readReceipts: false,
    typingIndicators: true,

    notifyLikesComments: true,
    notifyMentionsTags: true,
    notifyDMs: true,
    notifyDrops: true,
    notifyClubs: true,
    quietHoursEnabled: false,

    theme: "system",
    reduceMotion: false,
    textSize: "m",

    auraColor: "sloth_pink",
    auraIntensity: 70,
    auraAnimated: true,

    dropFxAnimations: true,
    dropFxSound: true,
    dropFxHaptics: false,

    payDropsEnabled: true,
    showPayDropsOnProfile: true,
    notifyOnPayDrop: true,

    presenceOnline: true,
    presenceLastActive: true,
};

const bankingProfile = {
    processor: "Stripe Connect",
    status: "processor_setup_required" as BankingStatus,
    availableBalance: 0,
    pendingBalance: 0,
    lifetimePayDrops: 0,
    payoutsEnabled: false,
    payDropsEnabled: true,
    showPayDropsOnProfile: true,
    notifyOnPayDrop: true,
    bankName: null as string | null,
    bankLast4: null as string | null,
    recentPayDrops: [] as Array<{
        id: string;
        from: string;
        amount: number;
        createdAt: string;
        status: string;
    }>,
};

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function loadSettings(): BoardSettings {
    if (typeof window === "undefined") return DEFAULT_SETTINGS;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_SETTINGS;

        const parsed = JSON.parse(raw) as Partial<BoardSettings>;
        const links = Array.isArray(parsed.links)
            ? [parsed.links[0] ?? "", parsed.links[1] ?? "", parsed.links[2] ?? ""]
            : DEFAULT_SETTINGS.links;

        return {
            ...DEFAULT_SETTINGS,
            ...parsed,
            links,
            auraIntensity:
                typeof parsed.auraIntensity === "number"
                    ? clamp(parsed.auraIntensity, 0, 100)
                    : DEFAULT_SETTINGS.auraIntensity,
            uiMode: parsed.uiMode === "night" ? "night" : "classic",
        };
    } catch {
        return DEFAULT_SETTINGS;
    }
}

function loadLocalAvatar() {
    if (typeof window === "undefined") return "";
    try {
        const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
        if (!raw) return "";
        const parsed = sanitizeProfileForStorage(JSON.parse(raw) as ProfileDraft);
        return parsed.avatarUrl?.trim() || "";
    } catch {
        return "";
    }
}

function mergeSettingsFromBoardStyle(current: BoardSettings, boardStyle: Record<string, unknown>) {
    const remoteOptions =
        boardStyle.boardOptions && typeof boardStyle.boardOptions === "object"
            ? (boardStyle.boardOptions as Partial<BoardSettings>)
            : boardStyle.options && typeof boardStyle.options === "object"
                ? (boardStyle.options as Partial<BoardSettings>)
                : {};

    const merged = {
        ...current,
        ...remoteOptions,
        displayName:
            typeof boardStyle.displayName === "string" && boardStyle.displayName.trim()
                ? boardStyle.displayName.trim()
                : current.displayName,
        bio:
            typeof boardStyle.bio === "string"
                ? boardStyle.bio
                : current.bio,
        pronouns:
            typeof boardStyle.pronouns === "string"
                ? boardStyle.pronouns
                : current.pronouns,
        links: Array.isArray(boardStyle.links) ? boardStyle.links : current.links,
        auraColor:
            typeof boardStyle.auraColor === "string"
                ? (boardStyle.auraColor as AuraKey)
                : current.auraColor,
        auraIntensity:
            typeof boardStyle.auraIntensity === "number"
                ? boardStyle.auraIntensity
                : current.auraIntensity,
        visibility:
            boardStyle.visibility === "private" || boardStyle.visibility === "public"
                ? boardStyle.visibility
                : current.visibility,
    };

    return {
        ...merged,
        links: Array.isArray(merged.links)
            ? [merged.links[0] ?? "", merged.links[1] ?? "", merged.links[2] ?? ""]
            : DEFAULT_SETTINGS.links,
        auraIntensity: clamp(merged.auraIntensity, 0, 100),
        uiMode: merged.uiMode === "night" ? "night" : "classic",
    } as BoardSettings;
}

function isDefaultDisplayName(value: string) {
    return value.trim().toLowerCase() === DEFAULT_SETTINGS.displayName.toLowerCase();
}

function shouldHydrateDisplayName(value: string) {
    const clean = value.trim();
    return !clean || isDefaultDisplayName(clean);
}

function cleanUsername(value: unknown) {
    return typeof value === "string"
        ? value.trim().replace(/^@+/, "").toLowerCase()
        : "";
}

async function syncBoardSettingsToSupabase(settings: BoardSettings) {
    const swatch = AURA_SWATCHES.find((item) => item.key === settings.auraColor);
    const glowColor = swatch?.hex ?? "#FF4FD8";
    const username = settings.username.trim().replace(/^@+/, "").toLowerCase();
    const boardOptions = sanitizeBoardOptionsForStorage(settings);

    const res = await fetch("/api/board/posts/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            display_name: settings.displayName,
            username,
            bio: settings.bio,
            board_style: {
                boardOptions,
                displayName: settings.displayName,
                bio: settings.bio,
                glowColor,
                auraColor: settings.auraColor,
                auraIntensity: settings.auraIntensity,
                visibility: settings.visibility,
                pronouns: settings.pronouns,
                links: settings.links,
            },
        }),
    });

    if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || "Couldn't save settings to Supabase.");
    }
}

async function protectIdentityBeforeSave(settings: BoardSettings): Promise<BoardSettings> {
    if (!shouldHydrateDisplayName(settings.displayName) && cleanUsername(settings.username)) {
        return settings;
    }

    try {
        const res = await fetch("/api/board/posts/profile", { cache: "no-store" });
        if (!res.ok) return settings;

        const data = await res.json();
        const profile = data?.profile;
        if (!profile) return settings;

        const boardStyle =
            profile.board_style && typeof profile.board_style === "object"
                ? profile.board_style
                : {};
        const remoteDisplayName =
            (typeof boardStyle.displayName === "string" && boardStyle.displayName.trim()) ||
            (typeof profile.display_name === "string" && profile.display_name.trim()) ||
            "";
        const remoteUsername = cleanUsername(profile.username);

        return {
            ...settings,
            displayName:
                shouldHydrateDisplayName(settings.displayName) && remoteDisplayName
                    ? remoteDisplayName
                    : settings.displayName,
            username: !cleanUsername(settings.username) && remoteUsername
                ? remoteUsername
                : settings.username,
        };
    } catch {
        return settings;
    }
}

const TABS = [
    { key: "profile", label: "Profile" },
    { key: "privacy", label: "Privacy" },
    { key: "friendzone", label: "Friend Zone" },
    { key: "messaging", label: "Messaging" },
    { key: "notifications", label: "Notifications" },
    { key: "appearance", label: "Appearance" },
    { key: "magic", label: "Board Magic" },
    { key: "banking", label: "Banking" },
    { key: "security", label: "Security" },
    { key: "plus", label: "Board+" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const AURA_SWATCHES: { key: AuraKey; label: string; hex: string }[] = [
    { key: "sloth_pink", label: "Sleepy Pink", hex: "#FF4FD8" },
    { key: "lust_blue", label: "Dreamy Blue", hex: "#2D7CFF" },
    { key: "greed_black", label: "Selfish Black", hex: "#111111" },
    { key: "pride_yellow", label: "Pride", hex: "#FFD12D" },
    { key: "envy_red", label: "Really Red", hex: "#FF2D2D" },
    { key: "gluttony_orange", label: "Cautious Orange", hex: "#FF7A1A" },
    { key: "wrath_purple", label: "Royal Purple", hex: "#7A44FF" },
    { key: "lilly_yellowgreen", label: "Nature Green", hex: "#B7FF2D" },
];

function cx(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(" ");
}

const SPACE_BG =
    "bg-[radial-gradient(1000px_420px_at_50%_0%,rgba(196,214,148,0.18),transparent_62%),linear-gradient(180deg,rgba(16,17,18,1),rgba(12,13,14,1))]";

const DEVICE_RIM =
    "bg-[linear-gradient(180deg,rgba(94,95,96,0.92),rgba(59,60,61,0.96))] border border-white/18 shadow-[0_22px_72px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.18)]";

const DEVICE_TILE =
    "bg-[linear-gradient(180deg,rgba(58,58,59,0.96),rgba(50,50,51,0.96))] border border-white/14 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-1px_0_rgba(0,0,0,0.24)]";

const HOLO_PANEL =
    "border border-[#9eb7ad]/45 bg-[linear-gradient(180deg,rgba(116,130,126,0.62),rgba(98,111,107,0.58))] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-[12px]";
const HOLO_SUBPANEL =
    "border border-[#a8beb5]/42 bg-[linear-gradient(180deg,rgba(118,134,128,0.52),rgba(103,117,112,0.48))] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-[10px]";
const HOLO_TEXT = "text-white/82";
const HOLO_MUTED = "text-white/48";
const HOLO_INK = "text-black/72";
const HOLO_INK_MUTED = "text-black/48";

const CLASSIC_TEXT = "text-black/80";
const CLASSIC_MUTED = "text-black/55";

function chromaShadow(intensity = 0.35) {
    return {
        textShadow: `0 0 ${4 * intensity}px rgba(137,255,173,0.20)`,
    } as React.CSSProperties;
}

function Divider({ night }: { night: boolean }) {
    return <div className={cx("my-5 h-px w-full", night ? "bg-white/12" : "bg-black/10")} />;
}

function Card({
    title,
    subtitle,
    children,
    night,
}: {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    night: boolean;
}) {
    return (
        <div
            className={cx(
                "rounded-2xl p-5",
                night ? HOLO_PANEL : "rounded-2xl border border-black/10 bg-white/60 p-5"
            )}
        >
            <div>
                <div
                    className="text-sm font-semibold board-accent"
                    style={night ? chromaShadow(0.35) : undefined}
                >
                    {title}
                </div>
                {subtitle ? (
                    <div className={cx("mt-1 text-xs", night ? HOLO_MUTED : CLASSIC_MUTED)}>
                        {subtitle}
                    </div>
                ) : null}
            </div>
            <div className="mt-4 grid gap-3">{children}</div>
        </div>
    );
}

function Row({
    label,
    hint,
    right,
    night,
}: {
    label: string;
    hint?: string;
    right: React.ReactNode;
    night: boolean;
}) {
    return (
        <div
            className={cx(
                "flex flex-col gap-2 rounded-xl p-3 sm:flex-row sm:items-center sm:justify-between",
                night ? HOLO_SUBPANEL : "border border-black/10 bg-white/60"
            )}
        >
            <div className="min-w-0">
                <div className={cx("text-sm font-medium", night ? "text-white/85" : "text-black/80")}>
                    {label}
                </div>
                {hint ? (
                    <div className={cx("mt-0.5 text-xs", night ? HOLO_MUTED : CLASSIC_MUTED)}>
                        {hint}
                    </div>
                ) : null}
            </div>
            <div className="w-full min-w-0 sm:w-auto sm:max-w-[min(100%,560px)]">{right}</div>
        </div>
    );
}

function Toggle({
    checked,
    onChange,
    ariaLabel,
    night,
}: {
    checked: boolean;
    onChange: (v: boolean) => void;
    ariaLabel: string;
    night: boolean;
}) {
    return (
        <button
            type="button"
            aria-label={ariaLabel}
            aria-pressed={checked}
            onClick={() => onChange(!checked)}
            className={cx(
                "relative inline-flex h-7 w-12 items-center rounded-full border transition",
                night
                    ? checked
                        ? "border-white/25 bg-white/85"
                        : "border-white/20 bg-white/10"
                    : checked
                        ? "border-black/15 bg-black/80"
                        : "border-black/15 bg-black/10"
            )}
        >
            <span
                className={cx(
                    "inline-block h-5 w-5 rounded-full shadow transition",
                    night
                        ? checked
                            ? "translate-x-6 bg-black/85"
                            : "translate-x-1 bg-white/85"
                        : checked
                            ? "translate-x-6 bg-white"
                            : "translate-x-1 bg-white"
                )}
            />
        </button>
    );
}

function ModeToggle({
    value,
    onChange,
    night,
}: {
    value: UiMode;
    onChange: (v: UiMode) => void;
    night: boolean;
}) {
    const isNightMode = value === "night";

    return (
        <div
            className={cx(
                "inline-flex items-center gap-1 rounded-2xl border p-1",
                night
                    ? "border-white/15 bg-white/8 backdrop-blur-md"
                    : "border-black/10 bg-white/75"
            )}
        >
            <button
                type="button"
                onClick={() => onChange("classic")}
                className={cx(
                    "rounded-xl px-3 py-1.5 text-sm transition",
                    !isNightMode
                        ? night
                            ? "bg-white/90 text-black/85"
                            : "bg-black/85 text-white"
                        : night
                            ? "text-white/68 hover:bg-white/8"
                            : "text-black/65 hover:bg-black/5"
                )}
            >
                Day
            </button>
            <button
                type="button"
                onClick={() => onChange("night")}
                className={cx(
                    "rounded-xl px-3 py-1.5 text-sm transition",
                    isNightMode
                        ? night
                            ? "bg-white/90 text-black/85"
                            : "bg-black/85 text-white"
                        : night
                            ? "text-white/68 hover:bg-white/8"
                            : "text-black/65 hover:bg-black/5"
                )}
            >
                Night
            </button>
        </div>
    );
}

function Select({
    value,
    onChange,
    options,
    ariaLabel,
    night,
}: {
    value: string;
    onChange: (v: string) => void;
    options: { value: string; label: string }[];
    ariaLabel: string;
    night: boolean;
}) {
    return (
        <select
            aria-label={ariaLabel}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={cx(
                "h-10 w-full rounded-xl border px-3 text-sm outline-none focus:ring-2 sm:w-56",
                night
                    ? "border-white/20 bg-[rgba(245,248,244,0.82)] text-black/75 focus:ring-white/15"
                    : "border-black/10 bg-white/70 text-black/80 focus:ring-black/10"
            )}
        >
            {options.map((o) => (
                <option key={o.value} value={o.value} className={night ? "bg-[#edf1ec] text-black" : "bg-white"}>
                    {o.label}
                </option>
            ))}
        </select>
    );
}

function Input({
    value,
    onChange,
    placeholder,
    ariaLabel,
    maxLength,
    night,
}: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    ariaLabel: string;
    maxLength?: number;
    night: boolean;
}) {
    return (
        <input
            aria-label={ariaLabel}
            value={value}
            placeholder={placeholder}
            maxLength={maxLength}
            onChange={(e) => onChange(e.target.value)}
            className={cx(
                "h-10 w-full rounded-xl border px-3 text-sm outline-none placeholder:opacity-80 focus:ring-2 sm:w-80",
                night
                    ? "border-white/20 bg-[rgba(245,248,244,0.82)] text-black/75 placeholder:text-black/38 focus:ring-white/15"
                    : "border-black/10 bg-white/70 text-black/80 placeholder:text-black/40 focus:ring-black/10"
            )}
        />
    );
}

function Textarea({
    value,
    onChange,
    placeholder,
    ariaLabel,
    maxLength,
    night,
}: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    ariaLabel: string;
    maxLength?: number;
    night: boolean;
}) {
    return (
        <textarea
            aria-label={ariaLabel}
            value={value}
            placeholder={placeholder}
            maxLength={maxLength}
            onChange={(e) => onChange(e.target.value)}
            className={cx(
                "min-h-[92px] w-full resize-none rounded-xl border p-3 text-sm outline-none focus:ring-2",
                night
                    ? "border-white/20 bg-[rgba(245,248,244,0.82)] text-black/75 placeholder:text-black/38 focus:ring-white/15"
                    : "border-black/10 bg-white/70 text-black/80 placeholder:text-black/40 focus:ring-black/10"
            )}
        />
    );
}

function Slider({
    value,
    onChange,
    ariaLabel,
    night,
}: {
    value: number;
    onChange: (v: number) => void;
    ariaLabel: string;
    night: boolean;
}) {
    return (
        <div className="flex items-center gap-3">
            <input
                aria-label={ariaLabel}
                type="range"
                min={0}
                max={100}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className={cx("w-48", night ? "accent-white/70" : "accent-black/70")}
            />
            <div className={cx("w-10 text-right text-xs", night ? HOLO_INK_MUTED : "text-black/55")}>
                {value}
            </div>
        </div>
    );
}

function AuraSwatches({
    value,
    onChange,
    night,
}: {
    value: AuraKey;
    onChange: (v: AuraKey) => void;
    night: boolean;
}) {
    return (
        <div className="flex flex-wrap gap-2">
            {AURA_SWATCHES.map((s) => {
                const active = s.key === value;
                return (
                    <button
                        key={s.key}
                        type="button"
                        onClick={() => onChange(s.key)}
                        className={cx(
                            "group flex items-center gap-2 rounded-full border px-3 py-2 text-xs transition",
                            night
                                ? active
                                    ? "border-white/35 bg-white/10"
                                    : "border-white/18 bg-white/5 hover:border-white/28"
                                : active
                                    ? "border-black/10 bg-white/70"
                                    : "border-black/10 bg-white/50 hover:bg-white/70"
                        )}
                        aria-pressed={active}
                        aria-label={`Set aura color: ${s.label}`}
                    >
                        <span
                            className="h-3 w-3 rounded-full border border-white/30"
                            style={{ backgroundColor: s.hex }}
                        />
                        <span
                            className={cx(
                                active
                                    ? night
                                        ? "font-semibold text-white/90"
                                        : "font-semibold text-black/80"
                                    : night
                                        ? "text-white/70"
                                        : "text-black/65"
                            )}
                        >
                            {s.label}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

function MiniProfilePreview({
    displayName,
    pronouns,
    bio,
    avatarSrc,
    auraKey,
    auraIntensity,
    auraAnimated,
    night,
}: {
    displayName: string;
    pronouns: string;
    bio: string;
    avatarSrc?: string;
    auraKey: AuraKey;
    auraIntensity: number;
    auraAnimated: boolean;
    night: boolean;
}) {
    const swatch = AURA_SWATCHES.find((s) => s.key === auraKey);
    const glow = clamp(auraIntensity, 0, 100) / 100;

    return (
        <div
            className={cx(
                "rounded-2xl p-5",
                night ? HOLO_PANEL : "rounded-2xl border border-black/10 bg-white/60 p-5"
            )}
        >
            <div className="flex items-center gap-4">
                <div
                    className={cx(
                        "relative grid h-14 w-14 place-items-center rounded-full border",
                        night ? "border-white/20 bg-white/8" : "border-black/10 bg-white/70",
                        auraAnimated ? "animate-pulse" : ""
                    )}
                    style={{
                        boxShadow: `0 0 ${18 + glow * 28}px ${2 + glow * 10}px ${swatch?.hex ?? "#999"}66`,
                    }}
                >
                    <div
                        className={cx(
                            "h-9 w-9 rounded-full border",
                            night ? "border-white/15 bg-white/5" : "border-black/10 bg-black/5"
                        )}
                    >
                        {avatarSrc ? (
                            <img
                                src={avatarSrc}
                                alt="Profile"
                                className="h-full w-full rounded-full object-cover"
                                draggable={false}
                            />
                        ) : null}
                    </div>
                </div>

                <div className="min-w-0">
                    <div className={cx("truncate text-sm font-semibold", night ? HOLO_INK : "text-black/80")}>
                        {displayName}
                    </div>
                    <div className={cx("mt-0.5 text-xs", night ? HOLO_INK_MUTED : "text-black/55")}>
                        {pronouns ? pronouns : "Pronouns hidden"}
                    </div>
                </div>
            </div>

            <div className={cx("mt-3 text-xs", night ? HOLO_INK : "text-black/70")}>
                {bio ? bio : "Bio preview will appear here."}
            </div>

            <div className={cx("mt-3 text-[11px]", night ? HOLO_INK_MUTED : "text-black/50")}>
                Aura: {swatch?.label ?? "Unknown"} • Intensity: {auraIntensity}
            </div>
        </div>
    );
}

function AuroraDrift({ enabled }: { enabled: boolean }) {
    return (
        <>
            <style>{`
        @keyframes aurora-pan {
          0%   { transform: translate3d(-6%, -6%, 0) scale(1.05); filter: blur(46px) saturate(1.15); }
          50%  { transform: translate3d(6%, 8%, 0) scale(1.12);  filter: blur(52px) saturate(1.25); }
          100% { transform: translate3d(-6%, -6%, 0) scale(1.05); filter: blur(46px) saturate(1.15); }
        }
        @keyframes aurora-pan-2 {
          0%   { transform: translate3d(7%, -4%, 0) scale(1.08); filter: blur(54px) saturate(1.05); }
          50%  { transform: translate3d(-8%, 6%, 0) scale(1.14); filter: blur(60px) saturate(1.20); }
          100% { transform: translate3d(7%, -4%, 0) scale(1.08); filter: blur(54px) saturate(1.05); }
        }
        .aurora-wrap{
          pointer-events: none;
          position: absolute;
          inset: -40px;
          overflow: hidden;
          z-index: 0;
        }
        .aurora{
          position: absolute;
          inset: -20%;
          opacity: 0.58;
          mix-blend-mode: screen;
          background:
            radial-gradient(60% 55% at 20% 25%, rgba(0, 255, 234, 0.35), rgba(0,0,0,0) 60%),
            radial-gradient(55% 50% at 70% 35%, rgba(120, 255, 200, 0.28), rgba(0,0,0,0) 62%),
            radial-gradient(65% 60% at 45% 80%, rgba(255, 255, 140, 0.16), rgba(0,0,0,0) 62%),
            radial-gradient(60% 55% at 85% 75%, rgba(255, 140, 220, 0.14), rgba(0,0,0,0) 60%);
          animation: aurora-pan 34s ease-in-out infinite;
        }
        .aurora2{
          position: absolute;
          inset: -25%;
          opacity: 0.40;
          mix-blend-mode: screen;
          background:
            radial-gradient(60% 55% at 30% 70%, rgba(0, 170, 255, 0.16), rgba(0,0,0,0) 60%),
            radial-gradient(55% 50% at 70% 20%, rgba(200, 255, 120, 0.18), rgba(0,0,0,0) 62%),
            radial-gradient(65% 60% at 80% 60%, rgba(255, 90, 90, 0.10), rgba(0,0,0,0) 62%);
          animation: aurora-pan-2 42s ease-in-out infinite;
        }
        .aurora-mask{
          position: absolute;
          inset: 0;
          background: radial-gradient(120% 120% at 50% 40%, rgba(255,255,255,0.18), rgba(0,0,0,0) 70%);
          opacity: 0.7;
        }
      `}</style>

            <div
                className="aurora-wrap"
                style={{
                    opacity: enabled ? 1 : 0,
                    transition: "opacity 300ms ease",
                }}
                aria-hidden="true"
            >
                <div className="aurora" />
                <div className="aurora2" />
                <div className="aurora-mask" />
            </div>
        </>
    );
}

const BANKING_STATUS_LABELS: Record<BankingStatus, string> = {
    processor_setup_required: "Processor Setup Required",
    bank_not_connected: "Bank Not Connected",
    verification_needed: "Verification Needed",
    ready_for_pay_drops: "Ready for Pay Drops",
    cash_out_available: "Cash Out Available",
};

function formatMoney(cents: number) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
    }).format(cents / 100);
}

function BankingPayDropsPanel({
    night,
    settings,
    setSettings,
}: {
    night: boolean;
    settings: BoardSettings;
    setSettings: React.Dispatch<React.SetStateAction<BoardSettings>>;
}) {
    const profile = {
        ...bankingProfile,
        payDropsEnabled: settings.payDropsEnabled,
        showPayDropsOnProfile: settings.showPayDropsOnProfile,
        notifyOnPayDrop: settings.notifyOnPayDrop,
    };
    const statusLabel = BANKING_STATUS_LABELS[profile.status];
    const bankingConnected = Boolean(profile.bankName && profile.bankLast4);
    const cashOutDisabled =
        !profile.payoutsEnabled ||
        !bankingConnected ||
        profile.availableBalance <= 0 ||
        profile.status !== "cash_out_available";

    async function connectBanking() {
        // Kick off Stripe Connect (Express) onboarding. The route creates/links the
        // connected account and returns a one-time onboarding URL. Requires
        // STRIPE_SECRET_KEY + Connect enabled (otherwise the route returns a
        // helpful 503 surfaced below).
        try {
            const supabase = supabaseBrowser();
            const { data: auth } = await supabase.auth.getUser();
            const uid = auth?.user?.id;

            // Reuse an existing connected account if onboarding was started before.
            let currentStyle: Record<string, any> = {};
            let existingAccountId: string | undefined;
            if (uid) {
                const { data: prof } = await supabase
                    .from("profiles")
                    .select("board_style")
                    .eq("id", uid)
                    .maybeSingle();
                currentStyle =
                    prof?.board_style && typeof prof.board_style === "object"
                        ? (prof.board_style as Record<string, any>)
                        : {};
                if (typeof currentStyle.stripeAccountId === "string" && currentStyle.stripeAccountId.trim()) {
                    existingAccountId = currentStyle.stripeAccountId.trim();
                }
            }

            const res = await fetch("/api/paydrops/stripe/connect", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    accountId: existingAccountId,
                    email: auth?.user?.email,
                    returnPath: "/board/options",
                    refreshPath: "/board/options",
                }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data?.ok || !data.url) {
                throw new Error(data?.error || "Could not start Stripe onboarding.");
            }

            // Persist the connected account id so checkout can route funds and we
            // can reuse onboarding next time.
            if (uid && data.accountId) {
                await supabase
                    .from("profiles")
                    .upsert(
                        { id: uid, board_style: { ...currentStyle, stripeAccountId: data.accountId } },
                        { onConflict: "id" }
                    );
            }

            window.location.href = data.url;
        } catch (error) {
            if (typeof window !== "undefined") {
                window.alert(
                    error instanceof Error ? error.message : "Could not start Stripe onboarding."
                );
            }
        }
    }

    function cashOut() {
        // TODO: Fetch payout status.
        // TODO: Fetch Pay Drop balance.
        // TODO: Create cash-out transfer.
        // TODO: Listen for payment/payout webhooks.
        // TODO: Store safe transaction records in Supabase.
        console.log("Cash Out clicked", { processor: profile.processor });
    }

    const balanceCards = [
        { label: "Available Balance", value: formatMoney(profile.availableBalance), accent: "seafoam" },
        { label: "Pending Balance", value: formatMoney(profile.pendingBalance), accent: "gold" },
        { label: "Lifetime Pay Drops", value: formatMoney(profile.lifetimePayDrops), accent: "pink" },
    ];

    return (
        <div className="grid gap-4">
            <div
                className={cx(
                    "relative overflow-hidden rounded-[26px] border p-5 sm:p-6",
                    night
                        ? "border-white/18 bg-[linear-gradient(135deg,rgba(185,255,221,0.12),rgba(255,216,101,0.08),rgba(255,255,255,0.05))] shadow-[0_24px_70px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.12)]"
                        : "border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.78),rgba(222,255,238,0.58),rgba(255,239,167,0.44))] shadow-[0_24px_70px_rgba(118,128,77,0.16),inset_0_1px_0_rgba(255,255,255,0.8)]"
                )}
            >
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full blur-3xl"
                    style={{ background: "rgba(118,255,202,0.26)" }}
                />
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -bottom-24 left-1/4 h-52 w-72 rounded-full blur-3xl"
                    style={{ background: "rgba(255,214,74,0.20)" }}
                />

                <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                        <div className={cx("text-2xl font-black tracking-tight sm:text-3xl", night ? "text-white" : "text-black/82")}>
                            Banking & Pay Drops
                        </div>
                        <p className={cx("mt-2 max-w-3xl text-sm", night ? "text-white/64" : "text-black/58")}>
                            Connect your payout account, manage Pay Drop earnings, and transfer eligible balances to your bank.
                        </p>
                    </div>

                    <div
                        className={cx(
                            "inline-flex w-fit items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em]",
                            night
                                ? "border-[#ffe58c]/30 bg-[#ffe58c]/12 text-[#ffe58c]"
                                : "border-[#d5ad25]/35 bg-[#fff1a8]/70 text-[#7a6417]"
                        )}
                    >
                        <span className="h-2 w-2 rounded-full bg-[#ffd64a] shadow-[0_0_14px_rgba(255,214,74,0.75)]" />
                        {statusLabel}
                    </div>
                </div>

                <div className="relative z-10 mt-5 grid gap-3 md:grid-cols-3">
                    {balanceCards.map((card) => (
                        <div
                            key={card.label}
                            className={cx(
                                "rounded-2xl border p-4",
                                night ? "border-white/14 bg-black/18" : "border-white/70 bg-white/62"
                            )}
                        >
                            <div className={cx("text-[11px] font-black uppercase tracking-[0.16em]", night ? "text-white/48" : "text-black/45")}>
                                {card.label}
                            </div>
                            <div className={cx("mt-2 text-2xl font-black", night ? "text-white/90" : "text-black/80")}>
                                {card.value}
                            </div>
                            <div
                                className="mt-3 h-1.5 rounded-full"
                                style={{
                                    background:
                                        card.accent === "seafoam"
                                            ? "linear-gradient(90deg,#7cffcf,transparent)"
                                            : card.accent === "gold"
                                                ? "linear-gradient(90deg,#ffd64a,transparent)"
                                                : "linear-gradient(90deg,#ff77dd,transparent)",
                                }}
                            />
                        </div>
                    ))}
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <Card
                    title="Payout Account"
                    subtitle={`Processor: ${profile.processor}`}
                    night={night}
                >
                    <div
                        className={cx(
                            "rounded-2xl border p-4",
                            night ? "border-white/14 bg-white/6" : "border-black/10 bg-white/68"
                        )}
                    >
                        <div className={cx("text-base font-black", night ? "text-white/88" : "text-black/80")}>
                            {bankingConnected
                                ? `${profile.bankName} ending in ${profile.bankLast4}`
                                : "No payout account connected"}
                        </div>
                        <p className={cx("mt-2 text-xs leading-relaxed", night ? "text-white/55" : "text-black/55")}>
                            Banking details are handled securely through our payment processor. Board only stores payout status and safe account metadata.
                        </p>
                        <button
                            type="button"
                            onClick={connectBanking}
                            className={cx(
                                "mt-4 rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.14em] transition",
                                night
                                    ? "border-[#8fffd2]/30 bg-[#8fffd2]/12 text-[#b8ffe5] hover:bg-[#8fffd2]/18"
                                    : "border-[#139b69]/25 bg-[#dffff1] text-[#146d50] hover:bg-[#cefde8]"
                            )}
                        >
                            Connect Banking
                        </button>
                    </div>
                </Card>

                <Card title="Cash Out" subtitle="Transfer eligible balances." night={night}>
                    <div
                        className={cx(
                            "rounded-2xl border p-4",
                            night ? "border-white/14 bg-white/6" : "border-black/10 bg-white/68"
                        )}
                    >
                        <button
                            type="button"
                            disabled={cashOutDisabled}
                            onClick={cashOut}
                            className={cx(
                                "w-full rounded-full border px-4 py-3 text-xs font-black uppercase tracking-[0.14em] transition",
                                cashOutDisabled
                                    ? night
                                        ? "cursor-not-allowed border-white/10 bg-white/6 text-white/32"
                                        : "cursor-not-allowed border-black/8 bg-black/5 text-black/32"
                                    : night
                                        ? "border-[#ffd64a]/35 bg-[#ffd64a]/18 text-[#fff0ad] hover:bg-[#ffd64a]/25"
                                        : "border-[#d5ad25]/35 bg-[#fff1a8] text-[#725a0f] hover:bg-[#ffe77b]"
                            )}
                        >
                            Cash Out to Bank
                        </button>
                        <p className={cx("mt-3 text-xs leading-relaxed", night ? "text-white/55" : "text-black/55")}>
                            Payout timing depends on the payment processor and the receiving bank.
                        </p>
                    </div>
                </Card>
            </div>

            <Card title="Pay Drop Settings" subtitle="Control how Pay Drops appear and notify you." night={night}>
                <Row
                    night={night}
                    label="Allow Pay Drops"
                    hint="Let your Board receive eligible Pay Drops when processor setup is complete."
                    right={
                        <Toggle
                            night={night}
                            ariaLabel="Allow Pay Drops"
                            checked={settings.payDropsEnabled}
                            onChange={(v) => setSettings((s) => ({ ...s, payDropsEnabled: v }))}
                        />
                    }
                />
                <Row
                    night={night}
                    label="Show Pay Drops on my profile"
                    hint="Display Pay Drop artifacts and earnings signals on your profile board."
                    right={
                        <Toggle
                            night={night}
                            ariaLabel="Show Pay Drops on my profile"
                            checked={settings.showPayDropsOnProfile}
                            onChange={(v) => setSettings((s) => ({ ...s, showPayDropsOnProfile: v }))}
                        />
                    }
                />
                <Row
                    night={night}
                    label="Notify me when I receive a Pay Drop"
                    hint="Send a Board notification when a Pay Drop lands."
                    right={
                        <Toggle
                            night={night}
                            ariaLabel="Notify me when I receive a Pay Drop"
                            checked={settings.notifyOnPayDrop}
                            onChange={(v) => setSettings((s) => ({ ...s, notifyOnPayDrop: v }))}
                        />
                    }
                />
            </Card>

            <Card title="Recent Pay Drops" subtitle="Transaction records will land here." night={night}>
                {profile.recentPayDrops.length ? (
                    <div className="grid gap-2">
                        {profile.recentPayDrops.map((drop) => (
                            <div
                                key={drop.id}
                                className={cx(
                                    "flex items-center justify-between rounded-xl border p-3 text-sm",
                                    night ? "border-white/14 bg-white/6" : "border-black/10 bg-white/68"
                                )}
                            >
                                <span>{drop.from}</span>
                                <span>{formatMoney(drop.amount)}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div
                        className={cx(
                            "rounded-2xl border p-6 text-center text-sm font-semibold",
                            night ? "border-white/14 bg-white/6 text-white/56" : "border-black/10 bg-white/62 text-black/48"
                        )}
                    >
                        No Pay Drops have landed yet.
                    </div>
                )}
            </Card>
        </div>
    );
}

export default function OptionsClient() {
    const [tab, setTab] = useState<TabKey>("profile");

    const [settings, setSettings] = useState<BoardSettings>(() => {
        if (typeof window === "undefined") return DEFAULT_SETTINGS;
        return loadSettings();
    });
    const [savedSettings, setSavedSettings] = useState<BoardSettings>(() => {
        if (typeof window === "undefined") return DEFAULT_SETTINGS;
        return loadSettings();
    });

    const [mounted, setMounted] = useState(false);
    const [savedBanner, setSavedBanner] = useState<null | "saved" | "error">(null);
    const [errorMsg, setErrorMsg] = useState<string>("");
    const [avatarSrc, setAvatarSrc] = useState("");

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        let alive = true;

        async function hydrateIdentity() {
            try {
                const localRaw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
                const localProfile = localRaw ? (JSON.parse(localRaw) as ProfileDraft) : null;

                const localDisplayName =
                    typeof localProfile?.displayName === "string"
                        ? localProfile.displayName.trim()
                        : "";
                const localUsername = cleanUsername(localProfile?.username);
                const localBio =
                    typeof localProfile?.bio === "string" ? localProfile.bio.trim() : "";

                if (alive && (localDisplayName || localUsername || localBio)) {
                    setSettings((current) => {
                        const next = {
                            ...current,
                            displayName:
                                shouldHydrateDisplayName(current.displayName) && localDisplayName
                                    ? localDisplayName
                                    : current.displayName,
                            username: !cleanUsername(current.username) && localUsername
                                ? localUsername
                                : current.username,
                            bio: !current.bio.trim() && localBio ? localBio : current.bio,
                        };
                        setSavedSettings(next);
                        return next;
                    });
                }
            } catch {
                // Remote profile load below can still hydrate identity.
            }

            try {
                const res = await fetch("/api/board/posts/profile", { cache: "no-store" });
                if (!res.ok) return;
                const data = await res.json();
                const profile = data?.profile;
                if (!alive || !profile) return;

                const boardStyle =
                    profile.board_style && typeof profile.board_style === "object"
                        ? profile.board_style
                        : {};
                const remoteDisplayName =
                    (typeof boardStyle.displayName === "string" && boardStyle.displayName.trim()) ||
                    (typeof profile.display_name === "string" && profile.display_name.trim()) ||
                    "";
                const remoteUsername = cleanUsername(profile.username);
                const remoteBio =
                    (typeof boardStyle.bio === "string" && boardStyle.bio.trim()) ||
                    (typeof profile.bio === "string" && profile.bio.trim()) ||
                    "";

                setSettings((current) => {
                    const remoteSettings = mergeSettingsFromBoardStyle(current, boardStyle);
                    const next = {
                        ...remoteSettings,
                        displayName:
                            shouldHydrateDisplayName(remoteSettings.displayName) && remoteDisplayName
                                ? remoteDisplayName
                                : remoteSettings.displayName,
                        username: !cleanUsername(remoteSettings.username) && remoteUsername
                            ? remoteUsername
                            : remoteSettings.username,
                        bio: !remoteSettings.bio.trim() && remoteBio ? remoteBio : remoteSettings.bio,
                    };
                    setSavedSettings(next);
                    return next;
                });
            } catch {
                // Keep local settings if profile hydrate fails.
            }
        }

        void hydrateIdentity();

        return () => {
            alive = false;
        };
    }, []);

    useEffect(() => {
        let alive = true;

        async function loadAvatar() {
            const localAvatar = loadLocalAvatar();
            if (alive && localAvatar) setAvatarSrc(localAvatar);

            try {
                const supabase = supabaseBrowser();
                const { data: auth } = await supabase.auth.getUser();
                const user = auth.user;
                if (!user) return;

                const { data: profile } = await supabase
                    .from("profiles")
                    .select("avatar_url, avatar_path, board_style")
                    .eq("id", user.id)
                    .maybeSingle();

                if (!alive || !profile) return;

                const boardStyle =
                    profile.board_style && typeof profile.board_style === "object"
                        ? (profile.board_style as ProfileDraft)
                        : {};
                const avatarPath =
                    typeof profile.avatar_path === "string" && profile.avatar_path.trim()
                        ? profile.avatar_path.trim()
                        : typeof boardStyle.avatarPath === "string" && boardStyle.avatarPath.trim()
                            ? boardStyle.avatarPath.trim()
                            : "";

                if (avatarPath) {
                    const { data: signed } = await supabase.storage
                        .from("board-avatars")
                        .createSignedUrl(avatarPath, 60 * 45);

                    if (alive && signed?.signedUrl) {
                        setAvatarSrc(signed.signedUrl);
                        return;
                    }
                }

                const styleAvatar =
                    typeof boardStyle.avatarUrl === "string" && !boardStyle.avatarUrl.startsWith("data:")
                        ? boardStyle.avatarUrl.trim()
                        : "";
                const legacyStyleAvatar =
                    typeof boardStyle.avatarDataUrl === "string" &&
                    !boardStyle.avatarDataUrl.startsWith("data:")
                        ? boardStyle.avatarDataUrl.trim()
                        : "";
                const remoteAvatar =
                    (typeof profile.avatar_url === "string" && profile.avatar_url.trim()) ||
                    styleAvatar ||
                    legacyStyleAvatar ||
                    "";
                if (alive && remoteAvatar) setAvatarSrc(remoteAvatar);
            } catch {
                // Keep local avatar preview if remote loading fails.
            }
        }

        void loadAvatar();

        function onStorage(event: StorageEvent) {
            if (event.key === PROFILE_STORAGE_KEY) {
                const localAvatar = loadLocalAvatar();
                if (localAvatar) setAvatarSrc(localAvatar);
            }
        }

        window.addEventListener("storage", onStorage);
        return () => {
            alive = false;
            window.removeEventListener("storage", onStorage);
        };
    }, []);

    const dirty = useMemo(() => {
        return JSON.stringify(settings) !== JSON.stringify(savedSettings);
    }, [savedSettings, settings]);

    async function commitSave() {
        const protectedSettings = await protectIdentityBeforeSave(settings);
        if (protectedSettings !== settings) {
            setSettings(protectedSettings);
        }

        try {
            await syncBoardSettingsToSupabase(protectedSettings);
            setSavedSettings(protectedSettings);
            setSavedBanner("saved");
            setErrorMsg("");
            window.setTimeout(() => setSavedBanner(null), 1800);
        } catch (error: any) {
            setSavedBanner("error");
            setErrorMsg(error?.message || "Couldn't save settings to Supabase.");
        }
    }

    function resetAll() {
        setSettings(savedSettings);
        setSavedBanner(null);
        setErrorMsg("");
    }

    if (!mounted) return <div className="min-h-screen" />;

    const isNight = settings.uiMode === "night";
    const auroraEnabled = !settings.reduceMotion;

    return (
        <div className={cx("min-h-screen px-3 py-6 sm:px-6", isNight ? SPACE_BG : "", isNight ? HOLO_TEXT : CLASSIC_TEXT)}>
            <div className="mx-auto w-full max-w-[1480px]">
                <div className={cx("relative overflow-visible rounded-[28px] p-[10px]", isNight ? DEVICE_RIM : "board-rim")}>
                    {isNight ? (
                        <>
                            <div
                                aria-hidden="true"
                                className="pointer-events-none absolute inset-[1px] rounded-[27px] opacity-90"
                                style={{
                                    background:
                                        "linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0.02) 18%, rgba(255,255,255,0.00) 42%)",
                                }}
                            />
                            <div
                                aria-hidden="true"
                                className="pointer-events-none absolute left-[8%] top-[3%] h-16 w-[42%] rounded-full blur-2xl"
                                style={{
                                    background:
                                        "linear-gradient(90deg, rgba(255,255,255,0.12), rgba(255,255,255,0.02))",
                                }}
                            />
                            <div
                                aria-hidden="true"
                                className="pointer-events-none absolute bottom-[8%] right-[10%] h-24 w-[30%] rounded-full blur-3xl"
                                style={{
                                    background:
                                        "radial-gradient(circle, rgba(166,220,188,0.16), rgba(0,0,0,0) 70%)",
                                }}
                            />
                        </>
                    ) : null}

                    {isNight ? (
                        <div
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0 opacity-[0.14]"
                            style={{
                                backgroundImage:
                                    "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.18) 0.6px, transparent 1px), radial-gradient(circle at 70% 20%, rgba(255,255,255,0.14) 0.5px, transparent 1px), radial-gradient(circle at 40% 80%, rgba(255,255,255,0.12) 0.5px, transparent 1px)",
                                backgroundSize: "260px 260px, 340px 340px, 420px 420px",
                            }}
                        />
                    ) : null}

                    {isNight ? <AuroraDrift enabled={auroraEnabled} /> : null}

                    {isNight ? (
                        <div
                            aria-hidden="true"
                            className="pointer-events-none absolute left-1/2 top-[78%] h-[320px] w-[520px] -translate-x-1/2 rounded-full blur-3xl"
                            style={{
                                background:
                                    "radial-gradient(circle at 50% 40%, rgba(160,196,152,0.20), rgba(0,0,0,0) 62%)",
                                opacity: 0.7,
                            }}
                        />
                    ) : null}

                    <div className={cx("relative z-10 rounded-[22px] p-4 sm:p-6 lg:p-8", isNight ? DEVICE_TILE : "board-tile")}>
                        {isNight ? (
                            <>
                                <div
                                    aria-hidden="true"
                                    className="pointer-events-none absolute inset-0 rounded-[22px]"
                                    style={{
                                        background:
                                            "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02) 14%, rgba(255,255,255,0.00) 30%)",
                                    }}
                                />
                                <div
                                    aria-hidden="true"
                                    className="pointer-events-none absolute left-[2%] top-[2%] h-14 w-[46%] rounded-full blur-2xl opacity-70"
                                    style={{
                                        background:
                                            "linear-gradient(90deg, rgba(255,255,255,0.10), rgba(255,255,255,0.02))",
                                    }}
                                />
                            </>
                        ) : null}

                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <h1
                                    className="text-3xl font-semibold board-accent"
                                    style={isNight ? chromaShadow(0.6) : undefined}
                                >
                                    Options
                                </h1>
                                <p className={cx("mt-2 text-sm", isNight ? "text-white/65" : "opacity-80")}>
                                    Tune your identity, boundaries, Friend Zone, and Board magic. Local-first now.
                                    Supabase-ready next.
                                </p>
                            </div>

                            <div className="flex items-center gap-3">
                                <ModeToggle
                                    night={isNight}
                                    value={settings.uiMode}
                                    onChange={(v) => setSettings((s) => ({ ...s, uiMode: v }))}
                                />

                                {dirty ? <span className="board-chip">Unsaved changes</span> : <span className="board-chip">Up to date</span>}

                                <button
                                    type="button"
                                    onClick={resetAll}
                                    className={cx(
                                        "rounded-2xl border px-4 py-2 text-sm",
                                        isNight
                                            ? "border-white/15 bg-white/6 text-white/75 hover:bg-white/10"
                                            : "border-black/10 bg-white/70"
                                    )}
                                >
                                    Reset
                                </button>

                                <button
                                    type="button"
                                    onClick={commitSave}
                                    className={cx(
                                        "rounded-2xl border px-4 py-2 text-sm",
                                        isNight
                                            ? "border-white/15 bg-white/90 text-black/90 hover:bg-white"
                                            : "border-black/10 bg-black/85 text-white"
                                    )}
                                >
                                    Save
                                </button>
                            </div>
                        </div>

                        {savedBanner ? (
                            <div
                                className={cx(
                                    "mt-4 rounded-2xl border p-3 text-sm",
                                    savedBanner === "saved"
                                        ? isNight
                                            ? "border-white/15 bg-white/6 text-white/80"
                                            : "border-black/10 bg-white/70 text-black/70"
                                        : "border-red-500/30 bg-red-950/40 text-red-100"
                                )}
                            >
                                {savedBanner === "saved" ? (
                                    <div>Saved.</div>
                                ) : (
                                    <div>
                                        Couldn’t save settings. <span className="opacity-80">{errorMsg}</span>
                                    </div>
                                )}
                            </div>
                        ) : null}

                        <Divider night={isNight} />

                        <div className="grid min-w-0 gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
                            <div className={cx("rounded-2xl p-3", isNight ? HOLO_PANEL : "rounded-2xl border border-black/10 bg-white/60")}>
                                <div className={cx("px-3 pb-2 text-xs font-semibold tracking-widest", isNight ? HOLO_MUTED : CLASSIC_MUTED)}>
                                    SETTINGS
                                </div>

                                <div className="grid gap-1">
                                    {TABS.map((t) => {
                                        const active = t.key === tab;
                                        const comingSoon = t.key === "security" || t.key === "plus";

                                        return (
                                            <button
                                                key={t.key}
                                                type="button"
                                                onClick={() => setTab(t.key)}
                                                className={cx(
                                                    "flex items-center justify-between rounded-xl px-3 py-2 text-sm transition",
                                                    isNight
                                                        ? active
                                                            ? "border border-white/25 bg-white/10"
                                                            : "hover:bg-white/7"
                                                        : active
                                                            ? "border border-black/10 bg-white/80"
                                                            : "hover:bg-white/70"
                                                )}
                                            >
                                                <span
                                                    className={cx(
                                                        "text-sm",
                                                        active
                                                            ? isNight
                                                                ? "font-semibold text-white"
                                                                : "font-semibold text-black/80"
                                                            : isNight
                                                                ? "text-white/70"
                                                                : "text-black/70"
                                                    )}
                                                >
                                                    {t.label}
                                                </span>

                                                {comingSoon ? (
                                                    <span
                                                        className={cx(
                                                            "rounded-full border px-2 py-0.5 text-[11px]",
                                                            isNight
                                                                ? "border-white/15 bg-white/6 text-white/55"
                                                                : "border-black/10 bg-white/70 text-black/55"
                                                        )}
                                                    >
                                                        Soon
                                                    </span>
                                                ) : null}
                                            </button>
                                        );
                                    })}
                                </div>

                                <div
                                    className={cx(
                                        "mt-4 rounded-xl border p-3 text-xs",
                                        isNight ? "border-white/15 bg-white/6 text-white/60" : "border-black/10 bg-white/70 text-black/60"
                                    )}
                                >
                                    Tip: Friend Zone groups turn your social life into circles, constellations, and orbits.
                                </div>
                            </div>

                            <div className="grid min-w-0 gap-4">
                                {tab === "profile" ? (
                                    <>
                                        <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
                                            <Card title="Profile Identity" subtitle="Your public face on Board." night={isNight}>
                                                <Row
                                                    night={isNight}
                                                    label="Display name"
                                                    hint="Shown on your profile and posts."
                                                    right={
                                                        <Input
                                                            night={isNight}
                                                            ariaLabel="Display name"
                                                            value={settings.displayName}
                                                            onChange={(v) => setSettings((s) => ({ ...s, displayName: v }))}
                                                            placeholder="Your name"
                                                            maxLength={40}
                                                        />
                                                    }
                                                />

                                                <Row
                                                    night={isNight}
                                                    label="Username"
                                                    hint="Used in your Board profile link."
                                                    right={
                                                        <Input
                                                            night={isNight}
                                                            ariaLabel="Username"
                                                            value={settings.username}
                                                            onChange={(v) =>
                                                                setSettings((s) => ({
                                                                    ...s,
                                                                    username: v.replace(/^@+/, "").toLowerCase(),
                                                                }))
                                                            }
                                                            placeholder="yourname"
                                                            maxLength={24}
                                                        />
                                                    }
                                                />

                                                <Row
                                                    night={isNight}
                                                    label="Pronouns (optional)"
                                                    hint="Only shown if you fill it in."
                                                    right={
                                                        <Input
                                                            night={isNight}
                                                            ariaLabel="Pronouns"
                                                            value={settings.pronouns}
                                                            onChange={(v) => setSettings((s) => ({ ...s, pronouns: v }))}
                                                            placeholder="e.g., he/him, she/her, they/them"
                                                            maxLength={24}
                                                        />
                                                    }
                                                />

                                                <Row
                                                    night={isNight}
                                                    label="Bio"
                                                    hint="Short, sharp, and you."
                                                    right={
                                                        <div className="w-full sm:min-w-[320px] lg:min-w-[420px]">
                                                            <Textarea
                                                                night={isNight}
                                                                ariaLabel="Bio"
                                                                value={settings.bio}
                                                                onChange={(v) => setSettings((s) => ({ ...s, bio: v }))}
                                                                placeholder="What are you building?"
                                                                maxLength={220}
                                                            />
                                                        </div>
                                                    }
                                                />
                                            </Card>

                                            <MiniProfilePreview
                                                night={isNight}
                                                displayName={settings.displayName}
                                                pronouns={settings.pronouns}
                                                bio={settings.bio}
                                                avatarSrc={avatarSrc}
                                                auraKey={settings.auraColor}
                                                auraIntensity={settings.auraIntensity}
                                                auraAnimated={settings.auraAnimated}
                                            />
                                        </div>

                                        <Card title="Links" subtitle="Add up to 3 links." night={isNight}>
                                            {[0, 1, 2].map((i) => (
                                                <Row
                                                    night={isNight}
                                                    key={i}
                                                    label={`Link ${i + 1}`}
                                                    hint="Include https://"
                                                    right={
                                                        <Input
                                                            night={isNight}
                                                            ariaLabel={`Link ${i + 1}`}
                                                            value={settings.links[i] ?? ""}
                                                            onChange={(v) =>
                                                                setSettings((s) => {
                                                                    const next = [...s.links];
                                                                    next[i] = v;
                                                                    return { ...s, links: next };
                                                                })
                                                            }
                                                            placeholder="https://"
                                                            maxLength={140}
                                                        />
                                                    }
                                                />
                                            ))}
                                        </Card>
                                    </>
                                ) : null}

                                {tab === "privacy" ? (
                                    <>
                                        <Card title="Visibility" subtitle="Keep it simple for now." night={isNight}>
                                            <Row
                                                night={isNight}
                                                label="Account visibility"
                                                hint="Public profiles can be viewed by anyone. Private profiles require approval."
                                                right={
                                                    <Select
                                                        night={isNight}
                                                        ariaLabel="Account visibility"
                                                        value={settings.visibility}
                                                        onChange={(v) => setSettings((s) => ({ ...s, visibility: (v as Visibility) ?? "public" }))}
                                                        options={[
                                                            { value: "public", label: "Public" },
                                                            { value: "private", label: "Private" },
                                                        ]}
                                                    />
                                                }
                                            />
                                        </Card>

                                        <Card title="Interaction Controls" subtitle="Decide what others can do with your content." night={isNight}>
                                            <Row
                                                night={isNight}
                                                label="Allow tags & mentions"
                                                hint="If off, users can’t tag or mention you."
                                                right={
                                                    <Toggle
                                                        night={isNight}
                                                        ariaLabel="Allow tags & mentions"
                                                        checked={settings.allowTags}
                                                        onChange={(v) => setSettings((s) => ({ ...s, allowTags: v }))}
                                                    />
                                                }
                                            />

                                            <Row
                                                night={isNight}
                                                label="Allow reposts/quotes"
                                                hint="If off, your posts can’t be reshared."
                                                right={
                                                    <Toggle
                                                        night={isNight}
                                                        ariaLabel="Allow reposts/quotes"
                                                        checked={settings.allowReposts}
                                                        onChange={(v) => setSettings((s) => ({ ...s, allowReposts: v }))}
                                                    />
                                                }
                                            />

                                            <Row
                                                night={isNight}
                                                label="Hide follower list"
                                                hint="Optional privacy layer."
                                                right={
                                                    <Toggle
                                                        night={isNight}
                                                        ariaLabel="Hide follower list"
                                                        checked={settings.hideFollowerList}
                                                        onChange={(v) => setSettings((s) => ({ ...s, hideFollowerList: v }))}
                                                    />
                                                }
                                            />
                                        </Card>
                                    </>
                                ) : null}

                                {tab === "friendzone" ? (
                                    <>
                                        <Card
                                            title="Friend Zone Groups"
                                            subtitle="Organize your people into circles, constellations, and social orbits."
                                            night={isNight}
                                        >
                                            <Row
                                                night={isNight}
                                                label="Enable social groups"
                                                hint="Turns Friend Zone into a relationship map instead of a flat friend list."
                                                right={
                                                    <Toggle
                                                        night={isNight}
                                                        ariaLabel="Enable Friend Zone social groups"
                                                        checked={settings.friendGroupsEnabled}
                                                        onChange={(v) => setSettings((s) => ({ ...s, friendGroupsEnabled: v }))}
                                                    />
                                                }
                                            />

                                            <Row
                                                night={isNight}
                                                label="Close Circle"
                                                hint="A smaller trusted group for private Drops, DMs, and presence."
                                                right={
                                                    <Toggle
                                                        night={isNight}
                                                        ariaLabel="Enable Close Circle"
                                                        checked={settings.closeCircleEnabled}
                                                        onChange={(v) => setSettings((s) => ({ ...s, closeCircleEnabled: v }))}
                                                    />
                                                }
                                            />

                                            <Row
                                                night={isNight}
                                                label="Constellations"
                                                hint="Larger groups for cast, crew, classmates, collaborators, or vibe-based circles."
                                                right={
                                                    <Toggle
                                                        night={isNight}
                                                        ariaLabel="Enable Friend Zone constellations"
                                                        checked={settings.constellationsEnabled}
                                                        onChange={(v) => setSettings((s) => ({ ...s, constellationsEnabled: v }))}
                                                    />
                                                }
                                            />

                                            <Row
                                                night={isNight}
                                                label="Auto-sort friend signals"
                                                hint="Board can suggest groups based on DMs, Drops, reactions, and activity later."
                                                right={
                                                    <Toggle
                                                        night={isNight}
                                                        ariaLabel="Auto-sort friend signals"
                                                        checked={settings.autoSortFriendSignals}
                                                        onChange={(v) => setSettings((s) => ({ ...s, autoSortFriendSignals: v }))}
                                                    />
                                                }
                                            />
                                        </Card>

                                        <Card title="Sharing Rules" subtitle="Choose who sees your Drops by default." night={isNight}>
                                            <Row
                                                night={isNight}
                                                label="Default Drop audience"
                                                hint="This becomes the starting visibility for new Drops."
                                                right={
                                                    <Select
                                                        night={isNight}
                                                        ariaLabel="Default Drop audience"
                                                        value={settings.defaultShareScope}
                                                        onChange={(v) =>
                                                            setSettings((s) => ({
                                                                ...s,
                                                                defaultShareScope: (v as DefaultShareScope) ?? "friend_zone",
                                                            }))
                                                        }
                                                        options={[
                                                            { value: "public", label: "Public" },
                                                            { value: "friend_zone", label: "Friend Zone" },
                                                            { value: "close_circle", label: "Close Circle" },
                                                            { value: "private", label: "Private" },
                                                        ]}
                                                    />
                                                }
                                            />
                                        </Card>

                                        <Card
                                            title="Presence + DMs"
                                            subtitle="Decide how visible and reachable you are inside your social universe."
                                            night={isNight}
                                        >
                                            <Row
                                                night={isNight}
                                                label="Presence visibility"
                                                hint="Controls who can see your online, resting, or working-style status later."
                                                right={
                                                    <Select
                                                        night={isNight}
                                                        ariaLabel="Presence visibility"
                                                        value={settings.presenceScope}
                                                        onChange={(v) =>
                                                            setSettings((s) => ({
                                                                ...s,
                                                                presenceScope: (v as PresenceScope) ?? "friend_zone",
                                                            }))
                                                        }
                                                        options={[
                                                            { value: "everyone", label: "Everyone" },
                                                            { value: "friend_zone", label: "Friend Zone" },
                                                            { value: "groups", label: "Selected Groups" },
                                                            { value: "hidden", label: "Hidden" },
                                                        ]}
                                                    />
                                                }
                                            />

                                            <Row
                                                night={isNight}
                                                label="Group DM mode"
                                                hint="Controls how group-based messages reach you."
                                                right={
                                                    <Select
                                                        night={isNight}
                                                        ariaLabel="Group DM mode"
                                                        value={settings.groupDmMode}
                                                        onChange={(v) =>
                                                            setSettings((s) => ({
                                                                ...s,
                                                                groupDmMode: (v as FriendDmMode) ?? "requests",
                                                            }))
                                                        }
                                                        options={[
                                                            { value: "open", label: "Open" },
                                                            { value: "requests", label: "Requests First" },
                                                            { value: "muted", label: "Muted" },
                                                        ]}
                                                    />
                                                }
                                            />

                                            <Row
                                                night={isNight}
                                                label="Group notifications"
                                                hint="Get pings from circles and constellations."
                                                right={
                                                    <Toggle
                                                        night={isNight}
                                                        ariaLabel="Group notifications"
                                                        checked={settings.groupNotifications}
                                                        onChange={(v) => setSettings((s) => ({ ...s, groupNotifications: v }))}
                                                    />
                                                }
                                            />
                                        </Card>
                                    </>
                                ) : null}

                                {tab === "messaging" ? (
                                    <>
                                        <Card title="DM Rules" subtitle="Board DMs are gated by trust, not chaos." night={isNight}>
                                            <div className={cx("text-sm", isNight ? "text-white/70" : "text-black/70")}>
                                                Messages can be sent to you only by:
                                                <ul className={cx("mt-2 list-disc pl-5 text-sm", isNight ? "text-white/70" : "text-black/70")}>
                                                    <li>
                                                        <span className={cx("font-semibold", isNight ? "text-white/85" : "text-black/80")}>
                                                            Friend Zone
                                                        </span>{" "}
                                                        connections
                                                    </li>
                                                    <li>
                                                        <span className={cx("font-semibold", isNight ? "text-white/85" : "text-black/80")}>
                                                            Clubmates
                                                        </span>{" "}
                                                        shared clubs
                                                    </li>
                                                </ul>
                                                <div className={cx("mt-3 text-xs", isNight ? "text-white/55" : "text-black/55")}>
                                                    Enforcement will be wired when Friend Zone and Clubs are fully integrated.
                                                </div>
                                            </div>

                                            <Divider night={isNight} />

                                            <Row
                                                night={isNight}
                                                label="Friend Zone required"
                                                hint="Keeps DMs intentional."
                                                right={
                                                    <Toggle
                                                        night={isNight}
                                                        ariaLabel="Friend Zone required for DMs"
                                                        checked={settings.dmFriendZoneOnly}
                                                        onChange={(v) => setSettings((s) => ({ ...s, dmFriendZoneOnly: v }))}
                                                    />
                                                }
                                            />

                                            <Row
                                                night={isNight}
                                                label="Allow Clubmates"
                                                hint="Club members can message you if you share a club."
                                                right={
                                                    <Toggle
                                                        night={isNight}
                                                        ariaLabel="Allow Clubmates to DM"
                                                        checked={settings.dmClubmatesAllowed}
                                                        onChange={(v) => setSettings((s) => ({ ...s, dmClubmatesAllowed: v }))}
                                                    />
                                                }
                                            />
                                        </Card>

                                        <Card title="Message Signals" subtitle="Tiny details. Big comfort." night={isNight}>
                                            <Row
                                                night={isNight}
                                                label="Read receipts"
                                                hint="Let others see when you’ve read a message."
                                                right={
                                                    <Toggle
                                                        night={isNight}
                                                        ariaLabel="Read receipts"
                                                        checked={settings.readReceipts}
                                                        onChange={(v) => setSettings((s) => ({ ...s, readReceipts: v }))}
                                                    />
                                                }
                                            />
                                            <Row
                                                night={isNight}
                                                label="Typing indicators"
                                                hint="Show when you’re typing."
                                                right={
                                                    <Toggle
                                                        night={isNight}
                                                        ariaLabel="Typing indicators"
                                                        checked={settings.typingIndicators}
                                                        onChange={(v) => setSettings((s) => ({ ...s, typingIndicators: v }))}
                                                    />
                                                }
                                            />
                                        </Card>
                                    </>
                                ) : null}

                                {tab === "notifications" ? (
                                    <Card title="Notification Toggles" subtitle="Keep it sharp." night={isNight}>
                                        <Row
                                            night={isNight}
                                            label="Likes & comments"
                                            hint="Activity on your posts."
                                            right={
                                                <Toggle
                                                    night={isNight}
                                                    ariaLabel="Likes & comments notifications"
                                                    checked={settings.notifyLikesComments}
                                                    onChange={(v) => setSettings((s) => ({ ...s, notifyLikesComments: v }))}
                                                />
                                            }
                                        />
                                        <Row
                                            night={isNight}
                                            label="Mentions & tags"
                                            hint="When someone calls your name."
                                            right={
                                                <Toggle
                                                    night={isNight}
                                                    ariaLabel="Mentions & tags notifications"
                                                    checked={settings.notifyMentionsTags}
                                                    onChange={(v) => setSettings((s) => ({ ...s, notifyMentionsTags: v }))}
                                                />
                                            }
                                        />
                                        <Row
                                            night={isNight}
                                            label="Direct messages"
                                            hint="Friend Zone and clubmate messages."
                                            right={
                                                <Toggle
                                                    night={isNight}
                                                    ariaLabel="DM notifications"
                                                    checked={settings.notifyDMs}
                                                    onChange={(v) => setSettings((s) => ({ ...s, notifyDMs: v }))}
                                                />
                                            }
                                        />
                                        <Row
                                            night={isNight}
                                            label="Drops activity"
                                            hint="Drop pings, reactions, and effects."
                                            right={
                                                <Toggle
                                                    night={isNight}
                                                    ariaLabel="Drops notifications"
                                                    checked={settings.notifyDrops}
                                                    onChange={(v) => setSettings((s) => ({ ...s, notifyDrops: v }))}
                                                />
                                            }
                                        />
                                        <Row
                                            night={isNight}
                                            label="Club activity"
                                            hint="Threads, announcements, and collabs."
                                            right={
                                                <Toggle
                                                    night={isNight}
                                                    ariaLabel="Club notifications"
                                                    checked={settings.notifyClubs}
                                                    onChange={(v) => setSettings((s) => ({ ...s, notifyClubs: v }))}
                                                />
                                            }
                                        />
                                        <Row
                                            night={isNight}
                                            label="Quiet hours"
                                            hint="Disable push notifications."
                                            right={
                                                <Toggle
                                                    night={isNight}
                                                    ariaLabel="Quiet hours"
                                                    checked={settings.quietHoursEnabled}
                                                    onChange={(v) => setSettings((s) => ({ ...s, quietHoursEnabled: v }))}
                                                />
                                            }
                                        />
                                    </Card>
                                ) : null}

                                {tab === "appearance" ? (
                                    <Card title="Appearance" subtitle="How Board feels on your device." night={isNight}>
                                        <Row
                                            night={isNight}
                                            label="Interface mode"
                                            hint="Flip between the daytime board and the smoked-glass night board."
                                            right={
                                                <ModeToggle
                                                    value={settings.uiMode}
                                                    night={isNight}
                                                    onChange={(v) => setSettings((s) => ({ ...s, uiMode: v }))}
                                                />
                                            }
                                        />

                                        <Row
                                            night={isNight}
                                            label="Theme mode"
                                            hint="System follows your OS setting."
                                            right={
                                                <Select
                                                    night={isNight}
                                                    ariaLabel="Theme mode"
                                                    value={settings.theme}
                                                    onChange={(v) => setSettings((s) => ({ ...s, theme: (v as ThemeMode) ?? "system" }))}
                                                    options={[
                                                        { value: "system", label: "System" },
                                                        { value: "dark", label: "Dark" },
                                                        { value: "light", label: "Light" },
                                                    ]}
                                                />
                                            }
                                        />

                                        <Row
                                            night={isNight}
                                            label="Reduce motion"
                                            hint="Tames aura pulses and drop animations."
                                            right={
                                                <Toggle
                                                    night={isNight}
                                                    ariaLabel="Reduce motion"
                                                    checked={settings.reduceMotion}
                                                    onChange={(v) => setSettings((s) => ({ ...s, reduceMotion: v }))}
                                                />
                                            }
                                        />

                                        <Row
                                            night={isNight}
                                            label="Text size"
                                            hint="Simple readability control."
                                            right={
                                                <Select
                                                    night={isNight}
                                                    ariaLabel="Text size"
                                                    value={settings.textSize}
                                                    onChange={(v) => setSettings((s) => ({ ...s, textSize: (v as TextSize) ?? "m" }))}
                                                    options={[
                                                        { value: "s", label: "Small" },
                                                        { value: "m", label: "Medium" },
                                                        { value: "l", label: "Large" },
                                                    ]}
                                                />
                                            }
                                        />
                                    </Card>
                                ) : null}

                                {tab === "magic" ? (
                                    <>
                                        <Card title="Aura Settings" subtitle="Pick your sin-spectrum and decide how loud it glows." night={isNight}>
                                            <Row
                                                night={isNight}
                                                label="Aura color"
                                                hint="Curated palette: sins plus Lilly."
                                                right={
                                                    <div className="w-full sm:min-w-[320px] lg:min-w-[520px]">
                                                        <AuraSwatches
                                                            night={isNight}
                                                            value={settings.auraColor}
                                                            onChange={(v) => setSettings((s) => ({ ...s, auraColor: v }))}
                                                        />
                                                    </div>
                                                }
                                            />

                                            <Row
                                                night={isNight}
                                                label="Aura intensity"
                                                hint="0 is subtle. 100 is celestial neon."
                                                right={
                                                    <Slider
                                                        night={isNight}
                                                        ariaLabel="Aura intensity"
                                                        value={settings.auraIntensity}
                                                        onChange={(v) => setSettings((s) => ({ ...s, auraIntensity: v }))}
                                                    />
                                                }
                                            />

                                            <Row
                                                night={isNight}
                                                label="Aura animation"
                                                hint="Pulse effect on your profile aura."
                                                right={
                                                    <Toggle
                                                        night={isNight}
                                                        ariaLabel="Aura animation"
                                                        checked={settings.auraAnimated && !settings.reduceMotion}
                                                        onChange={(v) => setSettings((s) => ({ ...s, auraAnimated: v }))}
                                                    />
                                                }
                                            />

                                            {settings.reduceMotion ? (
                                                <div className={cx("text-xs", isNight ? "text-white/55" : "text-black/55")}>
                                                    Reduce motion is on, so aura animation will be muted.
                                                </div>
                                            ) : null}
                                        </Card>

                                        <Card title="Drop Effects" subtitle="Make Drops feel alive, or silent." night={isNight}>
                                            <Row
                                                night={isNight}
                                                label="Animations"
                                                hint="Visual effects for Drops."
                                                right={
                                                    <Toggle
                                                        night={isNight}
                                                        ariaLabel="Drop animations"
                                                        checked={settings.dropFxAnimations && !settings.reduceMotion}
                                                        onChange={(v) => setSettings((s) => ({ ...s, dropFxAnimations: v }))}
                                                    />
                                                }
                                            />
                                            <Row
                                                night={isNight}
                                                label="Sounds"
                                                hint="Audio cues for Drops."
                                                right={
                                                    <Toggle
                                                        night={isNight}
                                                        ariaLabel="Drop sounds"
                                                        checked={settings.dropFxSound}
                                                        onChange={(v) => setSettings((s) => ({ ...s, dropFxSound: v }))}
                                                    />
                                                }
                                            />
                                            <Row
                                                night={isNight}
                                                label="Haptics"
                                                hint="Mobile vibration cues."
                                                right={
                                                    <Toggle
                                                        night={isNight}
                                                        ariaLabel="Drop haptics"
                                                        checked={settings.dropFxHaptics}
                                                        onChange={(v) => setSettings((s) => ({ ...s, dropFxHaptics: v }))}
                                                    />
                                                }
                                            />

                                            {settings.reduceMotion ? (
                                                <div className={cx("text-xs", isNight ? "text-white/55" : "text-black/55")}>
                                                    Reduce motion is on, so Drop animations will be muted.
                                                </div>
                                            ) : null}
                                        </Card>

                                        <Card title="Presence" subtitle="Control how visible you feel." night={isNight}>
                                            <Row
                                                night={isNight}
                                                label="Show online status"
                                                hint="Lets others see when you’re active."
                                                right={
                                                    <Toggle
                                                        night={isNight}
                                                        ariaLabel="Show online status"
                                                        checked={settings.presenceOnline}
                                                        onChange={(v) => setSettings((s) => ({ ...s, presenceOnline: v }))}
                                                    />
                                                }
                                            />
                                            <Row
                                                night={isNight}
                                                label="Show last active"
                                                hint="Shows a soft timestamp like active recently."
                                                right={
                                                    <Toggle
                                                        night={isNight}
                                                        ariaLabel="Show last active"
                                                        checked={settings.presenceLastActive}
                                                        onChange={(v) => setSettings((s) => ({ ...s, presenceLastActive: v }))}
                                                    />
                                                }
                                            />
                                        </Card>
                                    </>
                                ) : null}

                                {tab === "banking" ? (
                                    <BankingPayDropsPanel
                                        night={isNight}
                                        settings={settings}
                                        setSettings={setSettings}
                                    />
                                ) : null}

                                {tab === "security" ? (
                                    <Card title="Security" subtitle="Coming soon." night={isNight}>
                                        <div className={cx("text-sm", isNight ? "text-white/70" : "text-black/70")}>
                                            Email, password, active sessions, login alerts, and device history will live
                                            here once auth is fully locked.
                                        </div>
                                    </Card>
                                ) : null}

                                {tab === "plus" ? (
                                    <Card title="Board+" subtitle="Coming soon." night={isNight}>
                                        <div className={cx("text-sm", isNight ? "text-white/70" : "text-black/70")}>
                                            Membership status, perks, billing, and receipts will appear here.
                                        </div>
                                    </Card>
                                ) : null}
                            </div>
                        </div>

                        <div className={cx("mt-8 text-xs", isNight ? "text-white/50" : "text-black/50")}>
                            Note: Settings are saved locally for now. We’ll swap the adapter to Supabase once auth and
                            schema are ready.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
