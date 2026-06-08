"use client";

import {
  AURA_HEX,
  BOARD_OPTIONS_STORAGE_KEY,
  loadBoardOptionsSettings,
} from "@/lib/board/optionsSettings";
import { BOARD_PROFILE_STORAGE_KEY } from "@/lib/board/profileStorage";

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

  const profile = safeParse(window.localStorage.getItem(BOARD_PROFILE_STORAGE_KEY));
  const rawOptions = safeParse(window.localStorage.getItem(BOARD_OPTIONS_STORAGE_KEY));
  const options = loadBoardOptionsSettings();
  const username = cleanText(rawOptions?.username ?? profile?.username).replace(/^@+/, "");
  const displayName =
    cleanText(options.displayName) ||
    cleanText(profile?.displayName) ||
    cleanText(profile?.name) ||
    username ||
    "Board User";
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
