"use client";

// Types, storage keys, and pure helpers for the DropPad OS surface.
// Extracted verbatim from DropPadOS.tsx.

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { ensureImageFileMinResolution } from "@/lib/board/imageQuality";
import type { WorkCallItem } from "@/app/components/board/WorkCallsList";

export type DropRoute =
  | "board"
  | "assets"
  | "projects"
  | "portfolio"
  | "workcalls"
  | "profiledrops"
  | "storedrops";
export type ScreenMode = "menu" | "screen";

// This matches your Remote + WorkPage usage
export type DropPadApp =
  | "home"
  | "board_drops"
  | "assets"
  | "projects"
  | "portfolio"
  | "work_calls"
  | "profile_drops"
  | "store_drops";

export type DropBubble = {
  id: string;
  label: string;
  route: DropRoute;
  emoji?: string;
};

export type AssetKind = "media" | "music" | "youtube" | "link" | "doc" | "note";
export type DropDestination = "assets" | "portfolio" | "projects";

export type AssetItem = {
  id: string;
  kind: AssetKind;
  title: string;
  description?: string;
  createdAt: number;

  payload?: {
    // media
    mediaUrl?: string;
    mediaType?: "image";

    // embeds
    embedUrl?: string;

    // link/doc
    url?: string;

    // note
    text?: string;
  };
};

export type WorkCallType = "casting" | "crew" | "gigs" | "collaborations";

export type WorkCallDraft = {
  open: boolean;
  type: WorkCallType;
  title: string;
  preview: string;
  error?: string | null;
};

export const ASSETS_STORAGE_KEY = "jab_drop_pad_assets_v4";
export const PORTFOLIO_DROPS_STORAGE_KEY = "jab_drop_pad_portfolio_drops_v1";
export const PROJECT_DROPS_STORAGE_KEY = "jab_drop_pad_project_drops_v1";
export const PROJECT_DROPS_UPDATED_EVENT = "board:project-drops:updated";
export const WORK_CALLS_STORAGE_KEY = "jab_work_calls_v1";

// Crown center image (expects: public/assets/BoardLogo.png)
export const CROWN_SRC = "/assets/BoardLogo.png";
// Orbit mode: "circle" (full orbit) or "arch" (top arc)
export const ORBIT_MODE: "circle" | "arch" = "circle";

/* -------------------------------------------------------------------------- */
/* helpers                                                                    */
/* -------------------------------------------------------------------------- */

export function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(!!mq.matches);
    onChange();
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

export function RouteTitle(route: DropRoute) {
  switch (route) {
    case "board":
      return "Board Drops";
    case "assets":
      return "Assets";
    case "projects":
      return "Projects";
    case "portfolio":
      return "Portfolio";
    case "workcalls":
      return "Work Calls";
    case "profiledrops":
      return "Profile Drops";
    case "storedrops":
      return "Store Drops";
    default:
      return "Drop Pad";
  }
}

export function kindLabel(kind: AssetKind) {
    switch (kind) {
      case "media":
        return "Vision Drop";
    case "music":
      return "Music Drop";
    case "youtube":
      return "YouTube Drop";
    case "doc":
      return "Doc Drop";
    case "link":
      return "Link Drop";
    case "note":
      return "Note Drop";
  }
}

export function kindEmoji(kind: AssetKind) {
  switch (kind) {
    case "media":
      return "🖼️";
    case "music":
      return "🎧";
    case "youtube":
      return "📺";
    case "doc":
      return "📄";
    case "link":
      return "🔗";
    case "note":
      return "📝";
  }
}

export function safeHostname(url?: string) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function readAssetsFromStorage(): AssetItem[] {
  return readDropItemsFromStorage(ASSETS_STORAGE_KEY);
}

export function readDropItemsFromStorage(key: string): AssetItem[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x: any) => ({
        id: String(x?.id ?? ""),
        kind: x?.kind as AssetKind,
        title: String(x?.title ?? ""),
        description: x?.description ? String(x.description) : undefined,
        createdAt: Number(x?.createdAt ?? Date.now()),
        payload: typeof x?.payload === "object" ? x.payload : undefined,
      }))
      .filter((x) => x.id && x.kind && x.title);
  } catch {
    return [];
  }
}

export function writeAssetsToStorage(items: AssetItem[]) {
  writeDropItemsToStorage(ASSETS_STORAGE_KEY, items);
}

export function writeDropItemsToStorage(key: string, items: AssetItem[]) {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {}
}

export function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("read_error"));
    reader.readAsDataURL(file);
  });
}

export function withTimeout<T>(promise: Promise<T>, ms: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("timeout")), ms);
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

export function readWorkCallsFromStorage(): WorkCallItem[] {
  try {
    const raw = localStorage.getItem(WORK_CALLS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x: any) => ({
        id: String(x?.id ?? ""),
        type: x?.type,
        title: String(x?.title ?? ""),
        preview: x?.preview ? String(x.preview) : undefined,
        createdAt: Number(x?.createdAt ?? Date.now()),
        unread: !!x?.unread,
      }))
      .filter((x) => x.id && x.type && x.title);
  } catch {
    return [];
  }
}

export function writeWorkCallsToStorage(items: WorkCallItem[]) {
  try {
    localStorage.setItem(WORK_CALLS_STORAGE_KEY, JSON.stringify(items));
  } catch {}
}

/* -------------------------------------------------------------------------- */
/* URL + embed helpers                                                         */
/* -------------------------------------------------------------------------- */

export function normalizeUrl(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

export function parseYouTubeId(url: string) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.replace("/", "");
      return id || null;
    }
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v");
      if (id) return id;
      const parts = u.pathname.split("/").filter(Boolean);
      const embedIdx = parts.indexOf("embed");
      if (embedIdx >= 0 && parts[embedIdx + 1]) return parts[embedIdx + 1];
      const shortsIdx = parts.indexOf("shorts");
      if (shortsIdx >= 0 && parts[shortsIdx + 1]) return parts[shortsIdx + 1];
    }
    return null;
  } catch {
    return null;
  }
}

export function buildYouTubeEmbed(rawUrl: string) {
  const url = normalizeUrl(rawUrl);
  if (!url) return { embedUrl: "" };
  const id = parseYouTubeId(url);
  if (!id) return { embedUrl: "" };
  return { embedUrl: `https://www.youtube.com/embed/${id}` };
}

export function parseSpotify(url: string) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("open.spotify.com") && u.pathname.startsWith("/embed/")) {
      return { embedUrl: url, label: "Spotify" };
    }
    if (!u.hostname.includes("open.spotify.com")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) {
      const type = parts[0];
      const id = parts[1];
      const embedUrl = `https://open.spotify.com/embed/${type}/${id}`;
      return { embedUrl, label: "Spotify" };
    }
    return null;
  } catch {
    return null;
  }
}

export function parseSoundCloud(url: string) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("soundcloud.com") && !u.hostname.includes("snd.sc")) return null;
    const embedUrl = `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}`;
    return { embedUrl, label: "SoundCloud" };
  } catch {
    return null;
  }
}

export function parseAppleMusic(url: string) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host === "embed.music.apple.com") return { embedUrl: url, label: "Apple Music" };
    if (host !== "music.apple.com") return null;

    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "embed") {
      return {
        embedUrl: `https://embed.music.apple.com/${parts.slice(1).join("/")}${u.search}`,
        label: "Apple Music",
      };
    }
    if (parts.length < 3) return null;

    return { embedUrl: `https://embed.music.apple.com${u.pathname}${u.search}`, label: "Apple Music" };
  } catch {
    return null;
  }
}

export function buildMusicEmbed(rawUrl: string) {
  const url = normalizeUrl(rawUrl);
  if (!url) return { embedUrl: "", provider: "" };

  const sp = parseSpotify(url);
  if (sp) return { embedUrl: sp.embedUrl, provider: sp.label };

  const sc = parseSoundCloud(url);
  if (sc) return { embedUrl: sc.embedUrl, provider: sc.label };

  const am = parseAppleMusic(url);
  if (am) return { embedUrl: am.embedUrl, provider: am.label };

  return { embedUrl: "", provider: "" };
}

/* -------------------------------------------------------------------------- */
/* Supabase wiring                                                             */
/* -------------------------------------------------------------------------- */

export async function getAuthedUserId(sb: ReturnType<typeof supabaseBrowser>): Promise<string | null> {
  const { data, error } = await sb.auth.getUser();
  if (error) return null;
  return data?.user?.id ?? null;
}

export async function fetchAssetsFromSupabase(sb: ReturnType<typeof supabaseBrowser>, userId: string) {
  const { data, error } = await sb
    .from("board_assets")
    .select("id, kind, title, description, payload, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) return { ok: false as const, items: [] as AssetItem[] };

  const items: AssetItem[] =
    data?.map((r: any) => ({
      id: String(r.id),
      kind: r.kind as AssetKind,
      title: String(r.title),
      description: r.description ? String(r.description) : undefined,
      createdAt: new Date(r.created_at).getTime(),
      payload: (r.payload ?? undefined) as any,
    })) ?? [];

  return { ok: true as const, items };
}

export async function upsertAssetToSupabase(
  sb: ReturnType<typeof supabaseBrowser>,
  userId: string,
  asset: AssetItem
) {
  const row = {
    id: asset.id,
    user_id: userId,
    kind: asset.kind,
    title: asset.title,
    description: asset.description ?? null,
    payload: asset.payload ?? null,
    created_at: new Date(asset.createdAt).toISOString(),
  };

  const { error } = await sb.from("board_assets").upsert(row, { onConflict: "id" });
  return { ok: !error };
}

export async function deleteAllAssetsFromSupabase(sb: ReturnType<typeof supabaseBrowser>, userId: string) {
  const { error } = await sb.from("board_assets").delete().eq("user_id", userId);
  return { ok: !error };
}

export async function uploadMediaToSupabaseStorage(
  sb: ReturnType<typeof supabaseBrowser>,
  userId: string,
  file: File
): Promise<{ ok: true; publicUrl: string } | { ok: false }> {
  const uploadFile =
    file.type.startsWith("image/") &&
    file.type !== "image/gif" &&
    file.type !== "image/svg+xml"
      ? await ensureImageFileMinResolution(file)
      : file;

  const safeName = uploadFile.name.replace(/[^\w.\-]+/g, "_");
  const path = `${userId}/${Date.now()}_${safeName}`;

  const { error: upErr } = await withTimeout(
    sb.storage.from("board-media").upload(path, uploadFile, {
      cacheControl: "3600",
      upsert: false,
      contentType: uploadFile.type,
    }),
    12000
  ).catch(() => ({ error: new Error("upload_timeout") }));

  if (upErr) return { ok: false };

  const { data } = sb.storage.from("board-media").getPublicUrl(path);
  const publicUrl = data?.publicUrl ?? "";
  if (!publicUrl) return { ok: false };

  return { ok: true, publicUrl };
}
