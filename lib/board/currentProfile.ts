"use client";

import {
  AURA_HEX,
  BOARD_OPTIONS_STORAGE_KEY,
  loadBoardOptionsSettings,
} from "@/lib/board/optionsSettings";
import { BOARD_PROFILE_STORAGE_KEY } from "@/lib/board/profileStorage";
import { pickBoardDisplayName } from "@/lib/board/boardAuthor";

export type BoardAuthorIdentity = {
  id: string;
  displayName: string;
  username: string;
  avatar: string;
  glow: string;
  auraIntensity: number;
};

function safeParse(raw: string | null) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanStoredUrl(value: unknown) {
  const clean = cleanText(value);
  return clean.startsWith("data:") ? "" : clean;
}

function identityKey(...values: string[]) {
  return (
    values
      .find(Boolean)
      ?.toLowerCase()
      .replace(/^@+/, "")
      .replace(/[^a-z0-9_.-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "board-user"
  );
}

export function readCurrentBoardIdentity(): BoardAuthorIdentity {
  if (typeof window === "undefined") {
    return {
      id: "board-user",
      displayName: "Board User",
      username: "",
      avatar: "",
      glow: "#FF4FD8",
      auraIntensity: 70,
    };
  }

  let profile: any = null;
  let rawOptions: any = null;
  try {
    profile = safeParse(window.localStorage.getItem(BOARD_PROFILE_STORAGE_KEY));
    rawOptions = safeParse(window.localStorage.getItem(BOARD_OPTIONS_STORAGE_KEY));
  } catch {
    profile = null;
    rawOptions = null;
  }
  const options = loadBoardOptionsSettings();
  const username = cleanText(rawOptions?.username ?? profile?.username).replace(/^@+/, "");
  const displayName =
    pickBoardDisplayName(
      options.displayName,
      profile?.displayName,
      profile?.name,
      username
    ) || "Board User";
  const avatar =
    cleanStoredUrl(profile?.avatarUrl) ||
    cleanStoredUrl(profile?.avatarDataUrl) ||
    cleanStoredUrl(rawOptions?.avatarUrl) ||
    cleanStoredUrl(rawOptions?.avatarDataUrl);
  const auraKey = options.auraColor;
  const glow =
    AURA_HEX[auraKey] ||
    cleanText(profile?.glowColor) ||
    cleanText(profile?.avatarGlow) ||
    "#FF4FD8";

  return {
    id: identityKey(username, displayName),
    displayName,
    username,
    avatar,
    glow,
    auraIntensity: options.auraIntensity,
  };
}

/** Session profile wins over the Options "Board User" placeholder. */
export async function resolveCurrentBoardIdentity(
  userId?: string | null
): Promise<BoardAuthorIdentity> {
  const local = readCurrentBoardIdentity();
  try {
    const { supabaseBrowser } = await import("@/lib/supabase/browser");
    const sb = supabaseBrowser();
    const { data: auth } = userId ? { data: { user: { id: userId } } } : await sb.auth.getUser();
    const id = userId || auth?.user?.id || "";
    if (!id) return local;
    const { data: profile } = await sb
      .from("profiles")
      .select("id, username, display_name, avatar_url, avatar_path, board_style")
      .eq("id", id)
      .maybeSingle();
    if (!profile) {
      return { ...local, id };
    }
    const boardStyle =
      profile.board_style && typeof profile.board_style === "object"
        ? (profile.board_style as Record<string, unknown>)
        : {};
    let avatar = cleanStoredUrl(local.avatar) || cleanStoredUrl(profile.avatar_url);
    const avatarPath = cleanText(boardStyle.avatarPath || boardStyle.avatar_path || profile.avatar_path);
    if (avatarPath && !avatar.includes("token=")) {
      const { data: signed } = await sb.storage.from("board-avatars").createSignedUrl(avatarPath, 60 * 45);
      if (signed?.signedUrl) avatar = signed.signedUrl;
    }
    return {
      id,
      displayName:
        pickBoardDisplayName(
          boardStyle.displayName,
          profile.display_name,
          local.displayName,
          profile.username,
          local.username
        ) || local.displayName,
      username: cleanText(profile.username || local.username).replace(/^@+/, ""),
      avatar: avatar || cleanStoredUrl(boardStyle.avatarUrl),
      glow: local.glow,
      auraIntensity: local.auraIntensity,
    };
  } catch {
    return local;
  }
}
