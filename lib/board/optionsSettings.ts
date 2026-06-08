export type Visibility = "public" | "private";
export type UiMode = "classic" | "night";
export type ThemeMode = "light" | "dark" | "system";
export type TextSize = "s" | "m" | "l";

export type AuraKey =
    | "sloth_pink"
    | "lust_blue"
    | "greed_black"
    | "pride_yellow"
    | "envy_red"
    | "gluttony_orange"
    | "wrath_purple"
    | "lilly_yellowgreen";

export type FriendDmMode = "open" | "requests" | "muted";
export type PresenceScope = "everyone" | "friend_zone" | "groups" | "hidden";
export type DefaultShareScope = "public" | "friend_zone" | "close_circle" | "private";

export type BoardOptionsSettings = {
    uiMode: UiMode;

    displayName: string;
    bio: string;
    pronouns: string;
    links: string[];

    visibility: Visibility;
    hideFollowerList: boolean;

    friendGroupsEnabled: boolean;
    defaultShareScope: DefaultShareScope;
    presenceScope: PresenceScope;
    closeCircleEnabled: boolean;
    constellationsEnabled: boolean;
    groupDmMode: FriendDmMode;
    groupNotifications: boolean;
    autoSortFriendSignals: boolean;

    auraColor: AuraKey;
    auraIntensity: number;
    auraAnimated: boolean;

    presenceOnline: boolean;
    presenceLastActive: boolean;

    theme: ThemeMode;
    reduceMotion: boolean;
    textSize: TextSize;
};

export const BOARD_OPTIONS_STORAGE_KEY = "board.options.v1";

export const DEFAULT_BOARD_OPTIONS_SETTINGS: BoardOptionsSettings = {
    uiMode: "classic",

    displayName: "Board User",
    bio: "",
    pronouns: "",
    links: ["", "", ""],

    visibility: "public",
    hideFollowerList: false,

    friendGroupsEnabled: true,
    defaultShareScope: "friend_zone",
    presenceScope: "friend_zone",
    closeCircleEnabled: true,
    constellationsEnabled: true,
    groupDmMode: "requests",
    groupNotifications: true,
    autoSortFriendSignals: true,

    auraColor: "sloth_pink",
    auraIntensity: 70,
    auraAnimated: true,

    presenceOnline: true,
    presenceLastActive: true,

    theme: "system",
    reduceMotion: false,
    textSize: "m",
};

export const AURA_HEX: Record<AuraKey, string> = {
    sloth_pink: "#FF4FD8",
    lust_blue: "#2D7CFF",
    greed_black: "#111111",
    pride_yellow: "#FFD12D",
    envy_red: "#FF2D2D",
    gluttony_orange: "#FF7A1A",
    wrath_purple: "#7A44FF",
    lilly_yellowgreen: "#B7FF2D",
};

export function loadBoardOptionsSettings(): BoardOptionsSettings {
    if (typeof window === "undefined") return DEFAULT_BOARD_OPTIONS_SETTINGS;

    try {
        const raw = window.localStorage.getItem(BOARD_OPTIONS_STORAGE_KEY);
        if (!raw) return DEFAULT_BOARD_OPTIONS_SETTINGS;

        const parsed = JSON.parse(raw) as Partial<BoardOptionsSettings>;

        return {
            ...DEFAULT_BOARD_OPTIONS_SETTINGS,
            ...parsed,
            links: Array.isArray(parsed.links)
                ? [parsed.links[0] ?? "", parsed.links[1] ?? "", parsed.links[2] ?? ""]
                : DEFAULT_BOARD_OPTIONS_SETTINGS.links,
            auraIntensity:
                typeof parsed.auraIntensity === "number"
                    ? Math.max(0, Math.min(100, parsed.auraIntensity))
                    : DEFAULT_BOARD_OPTIONS_SETTINGS.auraIntensity,
        };
    } catch {
        return DEFAULT_BOARD_OPTIONS_SETTINGS;
    }
}