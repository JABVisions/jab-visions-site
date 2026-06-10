"use client";

// Shared types, constants, settings helpers, and small UI primitives for the
// Board Options screen. Extracted verbatim from OptionsClient.tsx.

import React from "react";
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

export const PROFILE_STORAGE_KEY = BOARD_PROFILE_STORAGE_KEY;

export type Visibility = "public" | "private";
export type ThemeMode = "light" | "dark" | "system";
export type TextSize = "s" | "m" | "l";
export type UiMode = "classic" | "night";
export type FriendDmMode = "open" | "requests" | "muted";
export type PresenceScope = "everyone" | "friend_zone" | "groups" | "hidden";
export type DefaultShareScope = "public" | "friend_zone" | "close_circle" | "private";
export type BankingStatus =
    | "processor_setup_required"
    | "bank_not_connected"
    | "verification_needed"
    | "ready_for_pay_drops"
    | "cash_out_available";

export type AuraKey =
    | "sloth_pink"
    | "lust_blue"
    | "greed_black"
    | "pride_yellow"
    | "envy_red"
    | "gluttony_orange"
    | "wrath_purple"
    | "lilly_yellowgreen";

export type BoardSettings = BoardOptionsSettings & {
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

export type ProfileDraft = {
    displayName?: string;
    username?: string;
    bio?: string;
    avatarDataUrl?: string | null;
    avatarUrl?: string | null;
    avatarPath?: string | null;
};

export const STORAGE_KEY = BOARD_OPTIONS_STORAGE_KEY;

export const DEFAULT_SETTINGS: BoardSettings = {
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

export const bankingProfile = {
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

export function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

export function loadSettings(): BoardSettings {
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

export function loadLocalAvatar() {
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

export function mergeSettingsFromBoardStyle(current: BoardSettings, boardStyle: Record<string, unknown>) {
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

export function isDefaultDisplayName(value: string) {
    return value.trim().toLowerCase() === DEFAULT_SETTINGS.displayName.toLowerCase();
}

export function shouldHydrateDisplayName(value: string) {
    const clean = value.trim();
    return !clean || isDefaultDisplayName(clean);
}

export function cleanUsername(value: unknown) {
    return typeof value === "string"
        ? value.trim().replace(/^@+/, "").toLowerCase()
        : "";
}

export async function syncBoardSettingsToSupabase(settings: BoardSettings) {
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

export async function protectIdentityBeforeSave(settings: BoardSettings): Promise<BoardSettings> {
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

export const TABS = [
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

export type TabKey = (typeof TABS)[number]["key"];

export const AURA_SWATCHES: { key: AuraKey; label: string; hex: string }[] = [
    { key: "sloth_pink", label: "Sleepy Pink", hex: "#FF4FD8" },
    { key: "lust_blue", label: "Dreamy Blue", hex: "#2D7CFF" },
    { key: "greed_black", label: "Selfish Black", hex: "#111111" },
    { key: "pride_yellow", label: "Pride", hex: "#FFD12D" },
    { key: "envy_red", label: "Really Red", hex: "#FF2D2D" },
    { key: "gluttony_orange", label: "Cautious Orange", hex: "#FF7A1A" },
    { key: "wrath_purple", label: "Royal Purple", hex: "#7A44FF" },
    { key: "lilly_yellowgreen", label: "Nature Green", hex: "#B7FF2D" },
];

export function cx(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(" ");
}

export const SPACE_BG =
    "bg-[radial-gradient(1000px_420px_at_50%_0%,rgba(196,214,148,0.18),transparent_62%),linear-gradient(180deg,rgba(16,17,18,1),rgba(12,13,14,1))]";

export const DEVICE_RIM =
    "bg-[linear-gradient(180deg,rgba(94,95,96,0.92),rgba(59,60,61,0.96))] border border-white/18 shadow-[0_22px_72px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.18)]";

export const DEVICE_TILE =
    "bg-[linear-gradient(180deg,rgba(58,58,59,0.96),rgba(50,50,51,0.96))] border border-white/14 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-1px_0_rgba(0,0,0,0.24)]";

export const HOLO_PANEL =
    "border border-[#9eb7ad]/45 bg-[linear-gradient(180deg,rgba(116,130,126,0.62),rgba(98,111,107,0.58))] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-[12px]";
export const HOLO_SUBPANEL =
    "border border-[#a8beb5]/42 bg-[linear-gradient(180deg,rgba(118,134,128,0.52),rgba(103,117,112,0.48))] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-[10px]";
export const HOLO_TEXT = "text-white/82";
export const HOLO_MUTED = "text-white/48";
export const HOLO_INK = "text-black/72";
export const HOLO_INK_MUTED = "text-black/48";

export const CLASSIC_TEXT = "text-black/80";
export const CLASSIC_MUTED = "text-black/55";

export function chromaShadow(intensity = 0.35) {
    return {
        textShadow: `0 0 ${4 * intensity}px rgba(137,255,173,0.20)`,
    } as React.CSSProperties;
}

export function Divider({ night }: { night: boolean }) {
    return <div className={cx("my-5 h-px w-full", night ? "bg-white/12" : "bg-black/10")} />;
}

export function Card({
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

export function Row({
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

export function Toggle({
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

export function ModeToggle({
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

export function Select({
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

export function Input({
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

export function Textarea({
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

export function Slider({
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

export function AuraSwatches({
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

export function MiniProfilePreview({
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

export function AuroraDrift({ enabled }: { enabled: boolean }) {
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
