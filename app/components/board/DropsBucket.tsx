"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { BoardActivity } from "@/lib/board/activity";
import { getLocalActivity } from "@/lib/board/activity";
import { mergeActivityWithFeed } from "@/lib/board/feedActivity";
import { EVENTS, readFeed } from "@/lib/boardStore";
import { resolveStoredAudioSrc } from "@/lib/board/musicPlayback";
import { supabaseBrowser } from "@/lib/supabase/browser";
import AudioDropPlayer from "./AudioDropPlayer";

import {
  type BucketFolder,
  type BucketBrainState,
  type BucketEntry,
  type BucketMemoryDrop,
  readBrain,
  writeBrain,
  sendWave,
  simulateIncomingWave,
  getResonanceScore,
  waveBucketDrop,
  BUCKET_BRAIN_KEY,
  EVT_UPDATED,
  EVT_OPEN,
} from "@/lib/board/bucketBrain";

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type BucketStatsOverride = {
  pass: number;
  pin: number;
  push: number;
  waves: number;
  mutuals: number;
  updatedAt?: number;
};

const fallbackAuraColor = "#8ee7ff";
const EMPTY_BRAIN: BucketBrainState = {
  version: 3,
  pass: [],
  pin: [],
  push: [],
  waves: [],
  mutuals: [],
  updatedAt: 0,
};

function readUserAuraColor() {
  try {
    if (typeof window === "undefined") return fallbackAuraColor;
    const optionsRaw = window.localStorage.getItem("board.options.v1");
    const profileRaw = window.localStorage.getItem("jab_board_profile_v2");
    const options = optionsRaw ? JSON.parse(optionsRaw) : null;
    const profile = profileRaw ? JSON.parse(profileRaw) : null;
    const auraColor =
      typeof options?.auraColor === "string" && options.auraColor.trim()
        ? options.auraColor.trim()
        : "";
    const auraHex: Record<string, string> = {
      sloth_pink: "#FF4FD8",
      lust_blue: "#2D7CFF",
      greed_black: "#111111",
      pride_yellow: "#FFD12D",
      envy_red: "#FF2D2D",
      gluttony_orange: "#FF7A1A",
      wrath_purple: "#7A44FF",
      lilly_yellowgreen: "#B7FF2D",
    };
    return (
      auraHex[auraColor] ||
      (typeof profile?.glowColor === "string" && profile.glowColor.trim()) ||
      fallbackAuraColor
    );
  } catch {
    return fallbackAuraColor;
  }
}

const WAVE_AVATARS: Record<string, string> = {
  johnandy: "/assets/john_andy_headshot.jpg",
};

/* --------------------------- embed helpers --------------------------- */

type EmbedKind =
  | "youtube"
  | "spotify"
  | "apple_music"
  | "soundcloud"
  | "image"
  | "video"
  | "audio"
  | "none";

function safeStr(x: any): string {
  return typeof x === "string" ? x : "";
}
function isExternalHref(href: string) {
  return /^https?:\/\//i.test(href);
}
function getExt(url: string) {
  const clean = url.split("?")[0].split("#")[0];
  const dot = clean.lastIndexOf(".");
  if (dot === -1) return "";
  return clean.slice(dot + 1).toLowerCase();
}
function guessMediaKind(url: string): EmbedKind {
  const ext = getExt(url);
  if (["png", "jpg", "jpeg", "webp", "gif", "avif"].includes(ext)) return "image";
  if (["mp4", "webm", "mov", "m4v"].includes(ext)) return "video";
  if (["mp3", "wav", "m4a", "aac", "ogg", "flac"].includes(ext)) return "audio";
  return "none";
}
function fmtShort(ts: number) {
  try {
    return new Date(ts).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return String(ts);
  }
}
function fmtWhen(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
function formatLastWaved(iso: string) {
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return "";
  const diff = Math.max(0, Date.now() - time);
  const hour = 60 * 60 * 1000;
  if (diff < hour * 24) return "Last waved today";
  const days = Math.max(1, Math.floor(diff / (hour * 24)));
  return days === 1 ? "Last waved yesterday" : `Last waved ${days} days ago`;
}

function avatarForUser(user: string) {
  const key = String(user || "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "");
  return WAVE_AVATARS[key] ?? null;
}

function memoryDropToActivity(entry: BucketEntry): BoardActivity | null {
  const item = entry.item;
  if (!item || typeof item !== "object") return null;

  const body = typeof item.body === "string" ? item.body : "";
  const title = typeof item.title === "string" ? item.title : null;
  const createdAt =
    typeof item.created_at === "string" && item.created_at
      ? item.created_at
      : new Date(entry.savedAt).toISOString();
  const kind = String(item.kind || "board_drop") as BoardActivity["kind"];

  if (!body && !title && !item.href && !item.image_url) return null;

  return {
    id: String(item.id || entry.activityId),
    created_at: createdAt,
    user_id: typeof item.user_id === "string" ? item.user_id : null,
    kind,
    title,
    body,
    href: typeof item.href === "string" ? item.href : null,
    image_url: typeof item.image_url === "string" ? item.image_url : null,
    meta: item.meta && typeof item.meta === "object" ? item.meta : null,
  };
}

function ytId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.replace("/", "") || null;
    if (u.hostname.includes("youtube.com")) {
      return u.searchParams.get("v") || u.pathname.split("/").filter(Boolean).pop() || null;
    }
  } catch {}
  return null;
}

function toYouTubeEmbed(url: string, origin?: string): string | null {
  const id = ytId(url);
  if (!id) return null;

  const params = new URLSearchParams({ modestbranding: "1", rel: "0", playsinline: "1" });
  if (origin) params.set("origin", origin);

  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
}

function toSpotifyEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/open\.spotify\.com$/i.test(u.hostname)) return null;
    return `https://open.spotify.com/embed${u.pathname}`;
  } catch {
    return null;
  }
}

function toAppleMusicEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host === "embed.music.apple.com") return u.toString();
    if (host !== "music.apple.com") return null;

    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "embed") {
      return `https://embed.music.apple.com/${parts.slice(1).join("/")}${u.search}`;
    }
    if (parts.length < 3) return null;

    return `https://embed.music.apple.com${u.pathname}${u.search}`;
  } catch {
    return null;
  }
}

function toSoundCloudEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const isSC =
      host === "soundcloud.com" ||
      host.endsWith(".soundcloud.com") ||
      host === "snd.sc" ||
      host.endsWith(".snd.sc") ||
      host === "on.soundcloud.com" ||
      host.endsWith(".on.soundcloud.com");

    if (!isSC) return null;

    return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=false&visual=true`;
  } catch {
    return null;
  }
}

function computeEmbed(href: string): { kind: EmbedKind; url: string } {
  if (!href) return { kind: "none", url: "" };
  const origin = typeof window !== "undefined" ? window.location.origin : undefined;

  const yt = toYouTubeEmbed(href, origin);
  if (yt) return { kind: "youtube", url: yt };

  const sp = toSpotifyEmbed(href);
  if (sp) return { kind: "spotify", url: sp };

  const am = toAppleMusicEmbed(href);
  if (am) return { kind: "apple_music", url: am };

  const sc = toSoundCloudEmbed(href);
  if (sc) return { kind: "soundcloud", url: sc };

  const mk = guessMediaKind(href);
  if (mk !== "none") return { kind: mk, url: href };

  return { kind: "none", url: "" };
}

/* --------------------------- UI constants --------------------------- */

const FOLDERS: Array<{ key: BucketFolder; label: string; short: string }> = [
  { key: "pass", label: "PASS", short: "ACK" },
  { key: "pin", label: "PIN", short: "SAVE" },
  { key: "push", label: "PUSH", short: "BOOST" },
];

export default function DropsBucket({
  title = "Drops Bucket",
  subtitle = "Your smart bucket. Manual only. Feed never auto-syncs.",
  // TEMP: for testability until auth/users are wired
  selfUser = "me",
  statsOverride,
}: {
  title?: string;
  subtitle?: string;
  selfUser?: string;
  statsOverride?: BucketStatsOverride;
}) {
  const [brain, setBrain] = useState<BucketBrainState>(EMPTY_BRAIN);
  const [active, setActive] = useState<BucketFolder>("pin");
  const [open, setOpen] = useState(false);
  const [viewer, setViewer] = useState<{
    folder: BucketFolder;
    entry: BucketEntry;
    item: BoardActivity | null;
  } | null>(null);

  // Wave UI
  const [waveOpen, setWaveOpen] = useState(false);
  const [waveTo, setWaveTo] = useState("someone");
  const [toast, setToast] = useState<string | null>(null);
  const [userAuraColor, setUserAuraColor] = useState(fallbackAuraColor);

  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const onUpdated = () => {
      setUserAuraColor(readUserAuraColor());
      setBrain(readBrain());
    };
    setUserAuraColor(readUserAuraColor());
    setBrain(readBrain());
    window.addEventListener(EVT_UPDATED, onUpdated as EventListener);
    window.addEventListener("storage", onUpdated as EventListener);
    return () => {
      window.removeEventListener(EVT_UPDATED, onUpdated as EventListener);
      window.removeEventListener("storage", onUpdated as EventListener);
    };
  }, []);

  useEffect(() => {
    const onOpenBucket = (event: Event) => {
      const detail = ((event as CustomEvent).detail ?? {}) as { folder?: BucketFolder };
      if (detail.folder && FOLDERS.some((folder) => folder.key === detail.folder)) {
        setActive(detail.folder);
      }
      setBrain(readBrain());
      setOpen(true);
    };

    window.addEventListener(EVT_OPEN, onOpenBucket as EventListener);
    return () => window.removeEventListener(EVT_OPEN, onOpenBucket as EventListener);
  }, []);

  useEffect(() => {
    const onFeedUpdated = () => setBrain(readBrain());
    window.addEventListener(EVENTS.feedUpdated, onFeedUpdated as EventListener);
    return () =>
      window.removeEventListener(EVENTS.feedUpdated, onFeedUpdated as EventListener);
  }, []);

  // Keep brain synced (local demo). We can remove once backend real-time exists.
  useEffect(() => {
    const t = window.setInterval(() => setBrain(readBrain()), 1200);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => closeBtnRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(t);
  }, [toast]);

  const activityIndex = useMemo(() => {
    const items = mergeActivityWithFeed(
      getLocalActivity?.() ?? [],
      readFeed()
    );
    const map = new Map<string, BoardActivity>();
    for (const it of items) if (it?.id) map.set(String(it.id), it);
    for (const folder of FOLDERS) {
      const bucketItems = (brain as any)[folder.key] as BucketEntry[] | undefined;
      if (!Array.isArray(bucketItems)) continue;
      for (const entry of bucketItems) {
        const memoryActivity = memoryDropToActivity(entry);
        if (memoryActivity?.id && !map.has(String(entry.activityId))) {
          map.set(String(entry.activityId), memoryActivity);
        }
      }
    }
    return map;
  }, [brain.updatedAt, open]);

  const counts = useMemo(() => {
    if (statsOverride) {
      return {
        pass: statsOverride.pass,
        pin: statsOverride.pin,
        push: statsOverride.push,
      };
    }
    return {
      pass: brain.pass.length,
      pin: brain.pin.length,
      push: brain.push.length,
    };
  }, [brain, statsOverride]);

  const list = useMemo(() => {
    const raw = ((brain as any)[active] as BucketEntry[] | undefined) ?? [];
    return [...raw]
      .map((entry) => ({
        ...entry,
        resonanceScore: getResonanceScore(entry, active),
      }))
      .sort((a, b) => {
        const scoreDiff = (b.resonanceScore ?? 0) - (a.resonanceScore ?? 0);
        if (scoreDiff) return scoreDiff;
        const aWave = a.lastWavedAt ? new Date(a.lastWavedAt).getTime() : 0;
        const bWave = b.lastWavedAt ? new Date(b.lastWavedAt).getTime() : 0;
        if (bWave !== aWave) return bWave - aWave;
        return (b.savedAt ?? 0) - (a.savedAt ?? 0);
      });
  }, [active, brain]);

  // Waves
  const my = String(selfUser || "me").trim().toLowerCase();
  const inbound = useMemo(() => brain.waves.filter((w) => w.to === my), [brain.waves, my]);
  const outbound = useMemo(() => brain.waves.filter((w) => w.from === my), [brain.waves, my]);

  const mutualsForMe = useMemo(() => {
    return brain.mutuals.filter((m) => m.a === my || m.b === my);
  }, [brain.mutuals, my]);

  const waveCount = statsOverride?.waves ?? inbound.length;
  const mutualCount = statsOverride?.mutuals ?? mutualsForMe.length;

  function handleBucketWave(entry: BucketEntry, item: BoardActivity | null) {
    const result = waveBucketDrop(active, entry.activityId, my || "me");
    if (result.status === "missing") {
      setToast("Drop memory not found.");
      return;
    }
    if (result.status === "cooldown") {
      setToast("That drop is still glowing.");
      return;
    }

    setBrain(readBrain());
    setToast("Wave sent. This memory rose in the Bucket.");
    window.dispatchEvent(
      new CustomEvent("board:whisper:create", {
        detail: {
          type: "bucket_wave",
          dropId: item?.id || entry.activityId,
          userId: my || "me",
          text: "A saved drop rippled back through your orbit.",
          createdAt: new Date().toISOString(),
        },
      })
    );
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (statsOverride) return;

    let cancelled = false;

    async function persistBucketStatsToSupabase() {
      try {
        const sb = supabaseBrowser();
        const { data: auth, error: authError } = await sb.auth.getUser();
        if (cancelled || authError || !auth?.user) return;

        const { data: profile, error: profileError } = await sb
          .from("profiles")
          .select("username, board_style")
          .eq("id", auth.user.id)
          .single();

        if (cancelled || profileError) return;

        const normalizedSelf = String(selfUser || "")
          .trim()
          .toLowerCase()
          .replace(/^@+/, "");
        const profileUsername = String(profile?.username || "")
          .trim()
          .toLowerCase()
          .replace(/^@+/, "");

        if (
          normalizedSelf &&
          normalizedSelf !== "me" &&
          normalizedSelf !== profileUsername &&
          normalizedSelf !== String(auth.user.id).toLowerCase()
        ) {
          return;
        }

        const boardStyle =
          profile?.board_style && typeof profile.board_style === "object"
            ? profile.board_style
            : {};

        const nextBucketStats = {
          pass: brain.pass.length,
          pin: brain.pin.length,
          push: brain.push.length,
          waves: inbound.length,
          mutuals: mutualsForMe.length,
          updatedAt: brain.updatedAt,
        };

        const prevStats = (boardStyle as any).bucketStats;
        const unchanged =
          prevStats &&
          prevStats.pass === nextBucketStats.pass &&
          prevStats.pin === nextBucketStats.pin &&
          prevStats.push === nextBucketStats.push &&
          prevStats.waves === nextBucketStats.waves &&
          prevStats.mutuals === nextBucketStats.mutuals;

        if (unchanged) return;

        await sb
          .from("profiles")
          .update({
            board_style: {
              ...boardStyle,
              bucketStats: nextBucketStats,
            },
          })
          .eq("id", auth.user.id);
      } catch {
        // local bucket remains usable if remote sync fails
      }
    }

    void persistBucketStatsToSupabase();

    return () => {
      cancelled = true;
    };
  }, [brain, inbound.length, mutualsForMe.length, selfUser, statsOverride]);

  return (
    <div className="bucket">
      <div className="shell">
        <div className="topRow">
          <div className="left">
            <div className="kicker">BUCKET</div>
            <div className="title">{title}</div>
            <div className="sub">{subtitle}</div>
          </div>

          <div className="right">
            <button
              type="button"
              className={clsx("openBtn", open && "on")}
              onClick={() => setOpen(true)}
              title="Open Drops Bucket"
            >
              OPEN BUCKET
            </button>
          </div>
        </div>

        {/* WAVE PANEL (above PASS/PIN/PUSH) */}
        <div className="waveBar">
          <button
            type="button"
            className={clsx("waveBtn", waveOpen && "on")}
            onClick={() => setWaveOpen((v) => !v)}
            title="Open Wave menu"
          >
            <span className="waveGlyph" aria-hidden>
              <WavePalm />
            </span>
            <span className="waveText">
              <span className="waveLabel">WAVE</span>
              <span className="waveCount">{waveCount}</span>
            </span>
          </button>

          <div className="waveMeta">
            <span className="metaDot" />
            self: <b>{my}</b>
            <span className="metaSep">•</span>
            mutuals: <b>{mutualCount}</b>
          </div>
        </div>

        {waveOpen && (
          <div className="wavePanel">
            {statsOverride ? (
              <div className="waveSummaryOnly">
                <div className="waveSummaryCard">
                  <div className="waveColTitle">Waves</div>
                  <div className="waveSummaryValue">{waveCount}</div>
                </div>
                <div className="waveSummaryCard">
                  <div className="waveColTitle">Pass</div>
                  <div className="waveSummaryValue">{counts.pass}</div>
                </div>
                <div className="waveSummaryCard">
                  <div className="waveColTitle">Pin</div>
                  <div className="waveSummaryValue">{counts.pin}</div>
                </div>
                <div className="waveSummaryCard">
                  <div className="waveColTitle">Push</div>
                  <div className="waveSummaryValue">{counts.push}</div>
                </div>
                <div className="waveSummaryCard">
                  <div className="waveColTitle">Mutuals</div>
                  <div className="waveSummaryValue">{mutualCount}</div>
                </div>
              </div>
            ) : (
              <>
            <div className="waveRow">
              <div className="waveInputWrap">
                <div className="waveHint">Wave to (username)</div>
                <input
                  className="waveInput"
                  value={waveTo}
                  onChange={(e) => setWaveTo(e.target.value)}
                  placeholder="someone"
                />
              </div>

              <button
                type="button"
                className="waveSend"
                onClick={() => {
                  sendWave(my, waveTo);
                  setToast(`Wave sent to ${String(waveTo).trim().toLowerCase()} ✋`);
                }}
              >
                SEND WAVE
              </button>

              {process.env.NODE_ENV !== "production" && (
                <button
                  type="button"
                  className="waveSim"
                  onClick={() => {
                    simulateIncomingWave(my, waveTo);
                    setToast(`Incoming wave from ${String(waveTo).trim().toLowerCase()} ✋`);
                  }}
                  title="DEV: simulate someone waving at you"
                >
                  SIMULATE INCOMING
                </button>
              )}
            </div>

            <div className="waveGrid">
              <div className="waveCol">
                <div className="waveColTitle">INBOX</div>
                {inbound.length === 0 ? (
                  <div className="waveEmpty">No waves yet.</div>
                ) : (
                  inbound.slice(0, 6).map((w) => (
                    <div key={w.id} className="waveItem">
                      <div className="waveStampCol">
                        <div className="waveBubble" aria-label={`Wave from @${w.from}`}>
                          {avatarForUser(w.from) ? (
                            <img className="waveAvatarImg" src={avatarForUser(w.from)!} alt="" />
                          ) : (
                            <span className="waveAvatarFallback">
                              {String(w.from).slice(0, 1).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="waveTime">{fmtShort(w.createdAt)}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="waveCol">
                <div className="waveColTitle">SENT</div>
                {outbound.length === 0 ? (
                  <div className="waveEmpty">No sent waves yet.</div>
                ) : (
                  outbound.slice(0, 6).map((w) => (
                    <div key={w.id} className="waveItem">
                      <div className="waveStampCol">
                        <div className="waveBubble" aria-label={`Wave sent to @${w.to}`}>
                          {avatarForUser(w.to) ? (
                            <img className="waveAvatarImg" src={avatarForUser(w.to)!} alt="" />
                          ) : (
                            <span className="waveAvatarFallback">
                              {String(w.to).slice(0, 1).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="waveTime">{fmtShort(w.createdAt)}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="waveCol">
                <div className="waveColTitle">MUTUAL</div>
                {mutualsForMe.length === 0 ? (
                  <div className="waveEmpty">No mutuals yet.</div>
                ) : (
                  mutualsForMe.slice(0, 6).map((m) => {
                    const other = m.a === my ? m.b : m.a;
                    return (
                      <div key={m.id} className="mutualItem">
                        <div className="waveStampCol">
                          <div className="waveBubble mutual" aria-label={`Mutual with @${other}`}>
                            {avatarForUser(other) ? (
                              <img className="waveAvatarImg" src={avatarForUser(other)!} alt="" />
                            ) : (
                              <span className="waveAvatarFallback">
                                {String(other).slice(0, 1).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div className="waveTime">{fmtShort(m.createdAt)}</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
              </>
            )}
          </div>
        )}

        <div className="folderRow">
          {FOLDERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={clsx("folder", active === f.key && "on")}
              onClick={() => setActive(f.key)}
              title={`${f.label} folder`}
            >
              <span className="emblem" aria-hidden>
                {f.key === "pass" ? <HandEmblem /> : f.key === "pin" ? <StarEmblem /> : <ArrowEmblem />}
              </span>
              <span className="folderText">
                <span className="folderLabel">{f.label}</span>
                <span className="folderCount">{counts[f.key]}</span>
              </span>
            </button>
          ))}
        </div>

        {/* mini viewport stays visible even when “sleep mode” */}
        <div className="miniViewport">
          <div className="miniTop">
            <div className="miniHint">
              Selected: <b>{active.toUpperCase()}</b>
              <span className="miniHint2"> | Bucket is your control panel</span>
            </div>
            <button type="button" className="miniOpen" onClick={() => setOpen(true)} title="Open bucket">
              VIEW
            </button>
          </div>

          <div className="miniList">
            {!list || list.length === 0 ? (
              <div className="empty">No saved drops yet.</div>
            ) : (
              list.slice(0, 4).map((e) => {
                const it =
                  activityIndex.get(String(e.activityId)) ?? memoryDropToActivity(e);
                return (
                  <div key={e.activityId} className="miniItem">
                    <div className="miniTitle">{it?.title ? it.title : "Saved Drop"}</div>
                    <div className="miniMeta">
                      <span className="miniKind">{String(it?.kind || active).toUpperCase()}</span>
                      <span className="miniTime">{fmtShort(e.savedAt)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {toast && <div className="toast">{toast}</div>}
      </div>

      {/* --------------------------- SONAR DOME OVERLAY --------------------------- */}
      {open && (
        <div
          className="overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Drops Bucket"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="dome">
            <div className="sonar" aria-hidden>
              <div className="sonarRings" />
              <div className="sonarSweep" />
              <div className="sonarBlips" />
              <div className="sonarNoise" />
            </div>

            <div className="domeTop">
              <div className="domeLeft">
                <div className="domeKicker">JAB BUCKET</div>
                <div className="domeTitle">Consciousness Compass</div>
                <div className="domeSub">
                  Bucket stores what you choose. Pass, Pin, Push are signals. Waves are invitations.
                </div>
              </div>

              <div className="domeRight">
                <button
                  type="button"
                  className="clearBtn"
                  onClick={() => {
                    const next = readBrain();
                    (next as any)[active] = [];
                    writeBrain(next);
                  }}
                  title="Clear current folder"
                >
                  CLEAR {active.toUpperCase()}
                </button>

                <button ref={closeBtnRef} type="button" className="closeBtn" onClick={() => setOpen(false)} title="Close">
                  ✕
                </button>
              </div>
            </div>

            <div className="compass">
              {FOLDERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={clsx("compassChip", active === f.key && "on")}
                  onClick={() => setActive(f.key)}
                  title={`Switch to ${f.label}`}
                >
                  <span className="chipEmblem" aria-hidden>
                    {f.key === "pass" ? <HandEmblemBright /> : f.key === "pin" ? <StarEmblemBright /> : <ArrowEmblemBright />}
                  </span>
                  <span className="chipLabel">
                    {f.label}
                    <span className="chipSub">{f.short}</span>
                  </span>
                  <span className="chipCount">{counts[f.key]}</span>
                </button>
              ))}

              <div className="compassMeta">
                <span className="metaDot" />
                tracking: <b>{active.toUpperCase()}</b>
                <span className="metaSep">•</span>
                updated: {fmtShort(brain.updatedAt)}
              </div>
            </div>

            <div className="domeBody">
              <div className="panelTitle">
                {active.toUpperCase()} FOLDER
                <span className="panelSub">Only signals land here. No feed auto-population.</span>
              </div>

              {!list || list.length === 0 ? (
                <div className="domeEmpty">
                  No saved drops in {active.toUpperCase()}.
                  <div className="domeEmptyHint">Use the reaction rail on any drop to deposit it.</div>
                </div>
              ) : (
                <div className="domeTiles">
                  {list.map((e) => {
                    const it =
                      activityIndex.get(String(e.activityId)) ?? memoryDropToActivity(e);
                    return (
                      <BucketDropCard
                        key={e.activityId}
                        folder={active}
                        entry={e}
                        item={it ?? null}
                        userAuraColor={userAuraColor}
                        onWave={() => handleBucketWave(e, it ?? null)}
                        onOpenFull={() =>
                          setViewer({ folder: active, entry: e, item: it ?? null })
                        }
                      />
                    );
                  })}
                </div>
              )}
            </div>

            {viewer ? (
              <div className="memoryViewer" role="dialog" aria-modal="true" aria-label="Full bucket memory drop">
                <div className="memoryViewerBackdrop" onClick={() => setViewer(null)} />
                <div className="memoryViewerPanel">
                  <div className="memoryViewerTop">
                    <div>
                      <div className="memoryViewerKicker">
                        Bucket Brain Memory · {viewer.folder.toUpperCase()}
                      </div>
                      <div className="memoryViewerTitle">
                        {viewer.item?.title || "Saved Drop"}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="memoryViewerClose"
                      onClick={() => setViewer(null)}
                    >
                      Close
                    </button>
                  </div>
                  <BucketDropCard
                    folder={viewer.folder}
                    entry={viewer.entry}
                    item={viewer.item}
                    userAuraColor={userAuraColor}
                    onWave={() => handleBucketWave(viewer.entry, viewer.item)}
                    expanded
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* styles */}
      <style>{`
        .bucket { width: 100%; }

        .shell {
          border-radius: 26px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          overflow: hidden;
          background:
            radial-gradient(circle at 18% 20%, rgba(120, 255, 240, 0.38), rgba(255, 255, 255, 0) 55%),
            radial-gradient(circle at 85% 70%, rgba(160, 220, 255, 0.34), rgba(255, 255, 255, 0) 60%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(246, 248, 255, 0.92));
          box-shadow: 0 18px 44px rgba(0, 0, 0, 0.14);
          padding: 14px;
          position: relative;
        }

        .topRow {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
        }

        .kicker {
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgba(0, 140, 135, 1);
        }

        .title {
          margin-top: 6px;
          font-size: 16px;
          font-weight: 950;
          color: rgba(0, 0, 0, 0.72);
        }

        .sub {
          margin-top: 6px;
          font-size: 12px;
          font-weight: 800;
          color: rgba(0, 0, 0, 0.52);
          max-width: 620px;
        }

        .openBtn {
          border-radius: 999px;
          padding: 10px 12px;
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          border: 1px solid rgba(0, 0, 0, 0.10);
          background: rgba(0, 0, 0, 0.84);
          color: rgba(255, 255, 255, 0.92);
          cursor: pointer;
        }

        .openBtn.on {
          background: rgba(0, 140, 135, 0.92);
          border-color: rgba(0, 140, 135, 0.25);
          box-shadow: 0 0 18px rgba(0, 140, 135, 0.22);
        }

        /* WAVE BAR */
        .waveBar {
          margin-top: 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .waveBtn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          border-radius: 999px;
          padding: 10px 12px;
          border: 1px solid rgba(0, 0, 0, 0.10);
          background: rgba(255, 255, 255, 0.78);
          cursor: pointer;
          transition: transform 140ms ease, filter 140ms ease;
        }

        .waveBtn:hover { transform: translateY(-1px); filter: brightness(1.02); }
        .waveBtn.on {
          background: rgba(0, 0, 0, 0.84);
          border-color: rgba(0, 0, 0, 0.14);
        }

        .waveGlyph { width: 18px; height: 18px; display: grid; place-items: center; }
        .waveText { display: inline-flex; gap: 10px; align-items: baseline; }
        .waveLabel {
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(0, 0, 0, 0.60);
        }
        .waveBtn.on .waveLabel { color: rgba(255,255,255,0.92); }

        .waveCount {
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.12em;
          color: rgba(255, 0, 190, 0.85);
        }

        .waveMeta {
          display: flex;
          align-items: center;
          gap: 8px;
          color: rgba(0, 0, 0, 0.55);
          font-weight: 900;
          letter-spacing: 0.10em;
          text-transform: uppercase;
          font-size: 10px;
        }
        .metaDot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: rgba(0, 140, 135, 0.85);
          box-shadow: 0 0 14px rgba(0, 140, 135, 0.18);
        }
        .metaSep { opacity: 0.6; margin: 0 2px; }

        .wavePanel {
          margin-top: 10px;
          border-radius: 22px;
          border: 1px solid rgba(0, 0, 0, 0.10);
          background: rgba(0, 0, 0, 0.04);
          padding: 12px;
        }

        .waveRow {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: flex-end;
        }

        .waveInputWrap { flex: 1; min-width: 220px; }
        .waveHint {
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          opacity: 0.6;
        }

        .waveInput {
          width: 100%;
          margin-top: 6px;
          border-radius: 14px;
          padding: 10px 12px;
          border: 1px solid rgba(0,0,0,0.12);
          background: rgba(255,255,255,0.78);
          font-weight: 900;
          letter-spacing: 0.02em;
          outline: none;
        }

        .waveSend {
          border-radius: 999px;
          padding: 10px 12px;
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          border: 1px solid rgba(0, 0, 0, 0.10);
          background: rgba(0, 0, 0, 0.84);
          color: rgba(255, 255, 255, 0.92);
          cursor: pointer;
        }

        .waveSim {
          border-radius: 999px;
          padding: 10px 12px;
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          border: 1px solid rgba(255, 0, 190, 0.22);
          background: rgba(255, 0, 190, 0.10);
          color: rgba(120, 0, 90, 0.92);
          cursor: pointer;
        }

        .waveGrid {
          margin-top: 12px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }

        .waveSummaryOnly {
          margin-top: 12px;
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 10px;
        }

        .waveSummaryCard {
          border-radius: 18px;
          border: 1px solid rgba(0,0,0,0.10);
          background: rgba(255,255,255,0.65);
          padding: 12px;
          text-align: center;
        }

        .waveSummaryValue {
          margin-top: 8px;
          font-size: 20px;
          font-weight: 950;
          color: rgba(0,0,0,0.78);
        }

        @media (max-width: 900px) {
          .waveGrid { grid-template-columns: 1fr; }
          .waveSummaryOnly { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }

        .waveCol {
          border-radius: 18px;
          border: 1px solid rgba(0,0,0,0.10);
          background: rgba(255,255,255,0.65);
          padding: 10px;
        }

        .waveColTitle {
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          opacity: 0.65;
        }

        .waveEmpty {
          margin-top: 10px;
          font-size: 12px;
          font-weight: 900;
          opacity: 0.55;
        }

        .waveItem {
          margin-top: 10px;
          padding: 12px;
          border-radius: 16px;
          border: 1px solid rgba(0,0,0,0.08);
          background: rgba(255,255,255,0.72);
          display: flex;
          align-items: flex-end;
          justify-content: flex-end;
          gap: 10px;
          min-height: 86px;
          position: relative;
        }

        .waveStampCol {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 6px;
        }

        .waveBubble {
          width: 58px;
          height: 58px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.58);
          background:
            radial-gradient(circle at 30% 25%, rgba(255,255,255,0.9), rgba(255,255,255,0.12) 34%, rgba(255,255,255,0.03) 58%),
            linear-gradient(145deg, rgba(255,255,255,0.45), rgba(170,245,255,0.18) 48%, rgba(255,186,245,0.14));
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.78),
            0 0 22px rgba(255,255,255,0.18),
            0 0 34px rgba(165,240,255,0.14);
          backdrop-filter: blur(10px);
        }

        .waveBubble.mutual {
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.78),
            0 0 22px rgba(0,140,135,0.16),
            0 0 34px rgba(255,0,190,0.12);
        }

        .waveAvatarImg {
          width: 44px;
          height: 44px;
          object-fit: cover;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.45);
          display: block;
        }

        .waveAvatarFallback {
          font-size: 18px;
          font-weight: 950;
          color: rgba(0,0,0,0.58);
        }

        .waveTime {
          font-weight: 900;
          opacity: 0.48;
          font-size: 10px;
          line-height: 1;
          text-align: right;
        }

        .mutualItem {
          margin-top: 10px;
          padding: 12px;
          border-radius: 16px;
          border: 1px solid rgba(0, 140, 135, 0.18);
          background: rgba(0, 140, 135, 0.08);
          display: flex;
          align-items: flex-end;
          justify-content: flex-end;
          gap: 10px;
          min-height: 86px;
        }

        /* folders */
        .folderRow { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 10px; }

        .folder {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          border-radius: 999px;
          padding: 10px 12px;
          border: 1px solid rgba(0, 0, 0, 0.10);
          background: rgba(255, 255, 255, 0.78);
          cursor: pointer;
          transition: transform 140ms ease, filter 140ms ease;
        }
        .folder:hover { transform: translateY(-1px); filter: brightness(1.02); }
        .folder.on { background: rgba(0, 0, 0, 0.84); border-color: rgba(0, 0, 0, 0.14); }

        .emblem { width: 18px; height: 18px; display: grid; place-items: center; }

        .folderText { display: inline-flex; align-items: baseline; gap: 10px; }
        .folderLabel {
          font-size: 10px; font-weight: 950; letter-spacing: 0.18em; text-transform: uppercase;
          color: rgba(0, 0, 0, 0.60);
        }
        .folder.on .folderLabel { color: rgba(255, 255, 255, 0.92); }

        .folderCount {
          font-size: 10px; font-weight: 950; letter-spacing: 0.12em;
          color: rgba(0, 140, 135, 1);
        }
        .folder.on .folderCount { color: rgba(120, 255, 240, 0.95); }

        /* mini viewport */
        .miniViewport {
          margin-top: 12px;
          border-radius: 22px;
          border: 1px solid rgba(0, 0, 0, 0.10);
          background: rgba(0, 0, 0, 0.04);
          padding: 12px;
        }

        .miniTop { display: flex; align-items: center; justify-content: space-between; gap: 10px; }

        .miniHint {
          font-size: 10px; font-weight: 950; letter-spacing: 0.18em; text-transform: uppercase;
          color: rgba(0, 0, 0, 0.55);
        }
        .miniHint2 { opacity: 0.62; }

        .miniOpen {
          border-radius: 999px; padding: 8px 10px;
          border: 1px solid rgba(0, 0, 0, 0.10);
          background: rgba(255, 255, 255, 0.72);
          cursor: pointer;
          font-size: 10px; font-weight: 950; letter-spacing: 0.18em; text-transform: uppercase;
          color: rgba(255, 0, 190, 0.85);
        }

        .miniList { margin-top: 10px; display: grid; gap: 8px; }

        .miniItem {
          border-radius: 16px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          background: rgba(255, 255, 255, 0.76);
          padding: 10px 12px;
        }

        .miniTitle { font-weight: 950; color: rgba(0, 0, 0, 0.72); font-size: 12px; }
        .miniMeta { margin-top: 6px; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .miniKind { font-size: 10px; font-weight: 950; letter-spacing: 0.18em; color: rgba(0, 140, 135, 1); }
        .miniTime { font-size: 10px; font-weight: 900; letter-spacing: 0.10em; opacity: 0.55; }

        .empty { font-weight: 900; letter-spacing: 0.10em; opacity: 0.55; font-size: 11px; }

        /* toast */
        .toast {
          position: absolute;
          right: 14px;
          bottom: 14px;
          border-radius: 999px;
          padding: 10px 12px;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.06em;
          border: 1px solid rgba(0,0,0,0.10);
          background: rgba(255,255,255,0.85);
          box-shadow: 0 12px 30px rgba(0,0,0,0.12);
        }

        /* Overlay + Dome (same as your sonar styling, trimmed) */
        .overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: rgba(0, 0, 0, 0.56);
          backdrop-filter: blur(12px);
          display: grid;
          place-items: center;
          padding: 18px;
        }

        .dome {
          width: min(1160px, 100%);
          max-height: min(86vh, 920px);
          overflow: hidden;
          border-radius: 30px;
          border: 1px solid rgba(120, 255, 240, 0.22);
          background: rgba(0, 10, 14, 0.92);
          box-shadow: 0 30px 95px rgba(0, 0, 0, 0.55);
          position: relative;
          padding: 16px;
          display: grid;
          grid-template-rows: auto auto 1fr;
          gap: 12px;
        }

        .sonar { position: absolute; inset: 0; z-index: 0; pointer-events: none; opacity: 0.95; }
        .sonarRings {
          position: absolute;
          inset: -40%;
          background:
            radial-gradient(circle at center, rgba(120,255,240,0.0) 0%, rgba(120,255,240,0.10) 22%, rgba(0,0,0,0) 23%),
            radial-gradient(circle at center, rgba(0,0,0,0) 0%, rgba(120,255,240,0.08) 40%, rgba(0,0,0,0) 41%),
            radial-gradient(circle at center, rgba(0,0,0,0) 0%, rgba(120,255,240,0.06) 60%, rgba(0,0,0,0) 61%),
            radial-gradient(circle at center, rgba(0,0,0,0) 0%, rgba(120,255,240,0.05) 78%, rgba(0,0,0,0) 79%);
        }
        .sonarSweep {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 1100px;
          height: 1100px;
          transform: translate(-50%, -50%);
          background: conic-gradient(from 0deg, rgba(0,0,0,0) 0deg, rgba(0,0,0,0) 300deg, rgba(120,255,240,0.08) 330deg, rgba(120,255,240,0.22) 348deg, rgba(120,255,240,0.0) 360deg);
          mask-image: radial-gradient(circle at center, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 68%);
          animation: sweep 2200ms linear infinite;
          opacity: 0.85;
        }
        @keyframes sweep { 0% { transform: translate(-50%, -50%) rotate(0deg); } 100% { transform: translate(-50%, -50%) rotate(360deg); } }
        .sonarBlips {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 18% 32%, rgba(255,0,190,0.45) 0 2px, rgba(0,0,0,0) 3px),
            radial-gradient(circle at 74% 42%, rgba(120,255,240,0.52) 0 2px, rgba(0,0,0,0) 3px),
            radial-gradient(circle at 62% 71%, rgba(120,255,240,0.35) 0 2px, rgba(0,0,0,0) 3px),
            radial-gradient(circle at 30% 78%, rgba(255,0,190,0.28) 0 2px, rgba(0,0,0,0) 3px);
          animation: blip 1800ms ease-in-out infinite;
          opacity: 0.9;
        }
        @keyframes blip { 0%, 100% { filter: brightness(0.85); opacity: 0.65; } 50% { filter: brightness(1.15); opacity: 0.95; } }
        .sonarNoise {
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(120,255,240,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(120,255,240,0.04) 1px, transparent 1px);
          background-size: 28px 28px;
          opacity: 0.20;
          mix-blend-mode: screen;
        }

        .domeTop, .compass, .domeBody { position: relative; z-index: 1; }
        .domeTop { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; padding: 10px 10px 2px; }
        .domeKicker { font-size: 10px; font-weight: 950; letter-spacing: 0.24em; text-transform: uppercase; color: rgba(120, 255, 240, 0.85); }
        .domeTitle { margin-top: 6px; font-size: 18px; font-weight: 950; letter-spacing: 0.06em; color: rgba(220, 255, 250, 0.92); }
        .domeSub { margin-top: 6px; font-size: 12px; font-weight: 800; color: rgba(120, 255, 240, 0.68); max-width: 820px; }

        .domeRight { display: inline-flex; gap: 10px; align-items: center; }
        .clearBtn {
          border-radius: 999px; padding: 10px 12px; font-size: 10px; font-weight: 950;
          letter-spacing: 0.16em; text-transform: uppercase;
          border: 1px solid rgba(255, 0, 190, 0.22);
          background: rgba(255, 0, 190, 0.10);
          color: rgba(255, 215, 245, 0.92);
          cursor: pointer;
        }
        .closeBtn {
          width: 42px; height: 42px; border-radius: 999px;
          border: 1px solid rgba(120, 255, 240, 0.24);
          background: rgba(120, 255, 240, 0.10);
          color: rgba(220, 255, 250, 0.95);
          font-size: 18px; font-weight: 900;
          cursor: pointer;
        }

        .compass {
          display: grid; gap: 10px; padding: 10px;
          border-radius: 22px;
          border: 1px solid rgba(120, 255, 240, 0.14);
          background: rgba(0, 0, 0, 0.26);
        }
        .compassMeta {
          display: flex; align-items: center; gap: 8px;
          color: rgba(120, 255, 240, 0.62);
          font-weight: 900; letter-spacing: 0.10em; text-transform: uppercase; font-size: 10px;
          opacity: 0.95;
        }
        .compassChip {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          border-radius: 999px; padding: 10px 12px;
          border: 1px solid rgba(120, 255, 240, 0.14);
          background: rgba(0, 0, 0, 0.20);
          cursor: pointer;
        }
        .compassChip.on {
          border-color: rgba(120, 255, 240, 0.28);
          background: rgba(120, 255, 240, 0.10);
          box-shadow: 0 0 18px rgba(120, 255, 240, 0.10);
        }
        .chipEmblem { width: 18px; height: 18px; display: grid; place-items: center; }
        .chipLabel {
          display: inline-flex; gap: 10px; align-items: baseline; flex: 1; justify-content: flex-start;
          color: rgba(220, 255, 250, 0.90);
          font-size: 11px; font-weight: 950; letter-spacing: 0.16em; text-transform: uppercase;
        }
        .chipSub { color: rgba(120, 255, 240, 0.65); font-weight: 900; letter-spacing: 0.10em; font-size: 10px; }
        .chipCount { color: rgba(255, 0, 190, 0.85); font-weight: 950; letter-spacing: 0.12em; font-size: 11px; }

        .domeBody { overflow: auto; padding: 10px; }
        .panelTitle {
          color: rgba(220, 255, 250, 0.92);
          font-weight: 950; letter-spacing: 0.14em; text-transform: uppercase; font-size: 12px;
          display: flex; align-items: baseline; gap: 10px; margin-bottom: 10px;
        }
        .panelSub { color: rgba(120, 255, 240, 0.62); font-weight: 900; letter-spacing: 0.08em; font-size: 10px; opacity: 0.95; }
        .domeTiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        .domeEmpty {
          padding: 18px; border-radius: 18px;
          border: 1px solid rgba(120, 255, 240, 0.16);
          background: rgba(0, 0, 0, 0.22);
          color: rgba(120, 255, 240, 0.80);
          font-weight: 900; letter-spacing: 0.10em;
        }
        .domeEmptyHint { margin-top: 10px; font-size: 12px; font-weight: 800; color: rgba(220, 255, 250, 0.72); letter-spacing: 0.04em; text-transform: none; opacity: 0.9; }
        .memoryViewer {
          position: absolute;
          inset: 0;
          z-index: 4;
          display: grid;
          place-items: center;
          padding: 18px;
        }
        .memoryViewerBackdrop {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.58);
          backdrop-filter: blur(8px);
        }
        .memoryViewerPanel {
          position: relative;
          z-index: 1;
          width: min(760px, 100%);
          max-height: min(78vh, 780px);
          overflow: auto;
          border-radius: 26px;
          border: 1px solid rgba(120, 255, 240, 0.24);
          background: rgba(0, 10, 14, 0.94);
          box-shadow: 0 30px 90px rgba(0, 0, 0, 0.58);
          padding: 14px;
        }
        .memoryViewerTop {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          margin-bottom: 12px;
          padding: 4px 2px 0;
        }
        .memoryViewerKicker {
          color: rgba(120, 255, 240, 0.70);
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }
        .memoryViewerTitle {
          margin-top: 5px;
          color: rgba(220, 255, 250, 0.94);
          font-size: 16px;
          font-weight: 950;
          letter-spacing: 0.04em;
        }
        .memoryViewerClose {
          border-radius: 999px;
          border: 1px solid rgba(120, 255, 240, 0.24);
          background: rgba(120, 255, 240, 0.10);
          color: rgba(220, 255, 250, 0.94);
          cursor: pointer;
          padding: 9px 12px;
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        @media (max-width: 900px) { .domeTiles { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}

/* --------------------------- Bucket Drop Card --------------------------- */

function BucketDropCard({
  folder,
  entry,
  item,
  userAuraColor = fallbackAuraColor,
  expanded = false,
  onWave,
  onOpenFull,
}: {
  folder: BucketFolder;
  entry: BucketEntry;
  item: BoardActivity | null;
  userAuraColor?: string;
  expanded?: boolean;
  onWave?: () => void;
  onOpenFull?: () => void;
}) {
  const rawMeta = item?.meta && typeof item.meta === "object" ? item.meta : null;
  const preview = rawMeta?.preview && typeof rawMeta.preview === "object" ? rawMeta.preview : rawMeta;
  const previewBucket =
    typeof preview?.bucket === "string" && preview.bucket ? preview.bucket : "";
  const previewStoragePath =
    typeof preview?.storagePath === "string" && preview.storagePath ? preview.storagePath : "";
  const previewHref =
    safeStr(item?.href) ||
    safeStr((preview as any)?.embedUrl) ||
    safeStr((preview as any)?.linkUrl) ||
    safeStr((preview as any)?.url) ||
    safeStr((preview as any)?.href) ||
    safeStr((preview as any)?.src);
  const [signedPreviewUrl, setSignedPreviewUrl] = useState("");
  const href = signedPreviewUrl || previewHref;
  const external = href ? isExternalHref(href) : false;

  const [embedFailed, setEmbedFailed] = useState(false);
  const embed = useMemo(() => computeEmbed(href), [href]);
  const mediaKind =
    typeof rawMeta?.mediaKind === "string"
      ? rawMeta.mediaKind
      : typeof preview?.mediaKind === "string"
        ? preview.mediaKind
        : "";
  const storedAudioSrc = resolveStoredAudioSrc({
    mediaKind,
    dropType: String(rawMeta?.dropType ?? rawMeta?.drop_flavor ?? preview?.dropType ?? ""),
    signedUrl: signedPreviewUrl,
    mediaUrl: typeof rawMeta?.mediaUrl === "string" ? rawMeta.mediaUrl : null,
    href: previewHref && /\.(mp3|wav|m4a|aac|ogg|flac|weba)(\?|#|$)/i.test(previewHref)
      ? previewHref
      : "",
    hasStoragePath: !!(previewBucket && previewStoragePath),
  });
  const showFullSongPlayer = !!storedAudioSrc;
  const showEmbed =
    !!embed.url && !embedFailed && embed.kind !== "none" && !showFullSongPlayer;
  const attachmentLabel =
    embed.kind === "spotify"
      ? "Play full track in Spotify"
      : embed.kind === "apple_music"
        ? "Open in Apple Music"
        : "Open attachment";
  const waveCount = entry.waveCount ?? 0;
  const lastWavedLabel = entry.lastWavedAt ? formatLastWaved(entry.lastWavedAt) : "";

  useEffect(() => {
    let cancelled = false;
    setSignedPreviewUrl("");

    if (!previewBucket || !previewStoragePath) return;

    async function signPreviewDrop() {
      try {
        const supabase = supabaseBrowser();
        const { data, error } = await supabase.storage
          .from(previewBucket)
          .createSignedUrl(previewStoragePath, 60 * 45);

        if (!cancelled && !error && data?.signedUrl) {
          setSignedPreviewUrl(data.signedUrl);
        }
      } catch {
        // Keep the saved href/preview fallback if signing fails.
      }
    }

    void signPreviewDrop();

    return () => {
      cancelled = true;
    };
  }, [previewBucket, previewStoragePath]);

  return (
    <div
      className={clsx("card", expanded && "expanded")}
      style={
        {
          "--bucket-aura": userAuraColor || fallbackAuraColor,
        } as React.CSSProperties
      }
    >
      <div className="top">
        <div className="badge">{folder.toUpperCase()}</div>
        <div className="time">{item?.created_at ? fmtWhen(item.created_at) : fmtShort(entry.savedAt)}</div>
      </div>

      <div className="memoryDropTitle">{item?.title || "Saved Drop"}</div>
      {item?.body && <div className="memoryDropCaption">{item.body}</div>}

      <div className="waveActionRow">
        <button type="button" className="memoryWaveButton" onClick={onWave}>
          <span>〰 Wave</span>
          {waveCount ? <b>{waveCount}</b> : null}
        </button>
        <span className="waveStatus">
          {waveCount
            ? lastWavedLabel || `${waveCount} waves`
            : "Still waiting for its first ripple"}
        </span>
      </div>

      {!item ? (
        <div className="memoryMissing">
          This older bucket memory only saved an id. New Pass, Pin, and Push signals now save the full drop into Bucket Brain memory.
        </div>
      ) : null}

      {showFullSongPlayer ? (
        <div className="storedAudioFrame">
          <div className="audioLabel">Full song</div>
          <AudioDropPlayer src={storedAudioSrc} onError={() => setEmbedFailed(true)} />
        </div>
      ) : null}

      {showEmbed && (
        <div className={clsx("embed", embed.kind)}>
          {embed.kind === "image" && (
            <div className="mediaFrame">
              <img
                src={embed.url}
                alt={item?.title || "Saved drop image"}
                className="img"
                loading="lazy"
                onError={() => setEmbedFailed(true)}
              />
            </div>
          )}

          {embed.kind === "video" && (
            <div className="mediaFrame">
              <video
                className="vid"
                src={embed.url}
                controls
                playsInline
                onError={() => setEmbedFailed(true)}
              />
            </div>
          )}

          {embed.kind === "audio" && (
            <div className="mediaFrame">
              <audio
                className="aud"
                src={embed.url}
                controls
                onError={() => setEmbedFailed(true)}
              />
            </div>
          )}

          {(embed.kind === "youtube" ||
            embed.kind === "spotify" ||
            embed.kind === "apple_music" ||
            embed.kind === "soundcloud") && (
            <iframe
              title={`bucket-embed-${embed.kind}-${entry.activityId}`}
              src={embed.url}
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              onError={() => setEmbedFailed(true)}
            />
          )}
          <div className="embedFoot">
            {href ? (
              <a className="embedLink" href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined}>
                {attachmentLabel}
              </a>
            ) : (
              <span className="embedLink dim">No attachment</span>
            )}

            {href && (
              <button type="button" className="embedFallback" onClick={() => setEmbedFailed(true)}>
                Embed blocked? Show link
              </button>
            )}
          </div>

          {embed.kind === "spotify" ? (
            <div className="embedNote">
              Spotify’s embed can fall back to a preview clip in some browser sessions. Use the link above for full playback in Spotify.
            </div>
          ) : null}
        </div>
      )}

      {!showEmbed && href && (
        <a className="linkCard" href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined}>
          <div className="linkLabel">Attachment</div>
          <div className="link">{href}</div>
          {embedFailed && <div className="linkNote">Embed was blocked. Link still works.</div>}
        </a>
      )}

      {!expanded && item ? (
        <button type="button" className="viewFullBtn" onClick={onOpenFull}>
          View Full Drop
        </button>
      ) : null}

      <style>{`
        .card {
          border-radius: 22px;
          border: 1px solid rgba(120, 255, 240, 0.18);
          background: rgba(0, 0, 0, 0.24);
          padding: 12px;
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.20);
          backdrop-filter: blur(6px);
        }
        .top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .badge {
          border-radius: 999px; padding: 7px 10px; font-size: 10px; font-weight: 950;
          letter-spacing: 0.18em; text-transform: uppercase;
          background: rgba(120, 255, 240, 0.10);
          border: 1px solid rgba(120, 255, 240, 0.20);
          color: rgba(220, 255, 250, 0.92);
        }
        .time { color: rgba(120, 255, 240, 0.72); font-weight: 900; font-size: 10px; letter-spacing: 0.10em; text-transform: uppercase; white-space: nowrap; opacity: 0.95; }
        .memoryDropTitle {
          margin-top: 10px;
          color: rgba(220, 255, 250, 0.92) !important;
          font-size: 13px;
          font-weight: 950;
          letter-spacing: 0.04em;
        }
        .memoryDropTitle::selection {
          color: rgba(220, 255, 250, 0.92);
          background: rgba(120, 255, 240, 0.22);
        }
        .memoryDropCaption {
          margin-top: 8px;
          color: rgba(220, 255, 250, 0.92) !important;
          font-size: 12px;
          line-height: 1.45;
          white-space: pre-wrap;
        }
        .memoryDropCaption::selection {
          color: rgba(220, 255, 250, 0.92);
          background: rgba(120, 255, 240, 0.22);
        }
        .waveActionRow {
          margin-top: 10px;
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .memoryWaveButton {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          overflow: hidden;
          border-radius: 999px;
          padding: 0.45rem 0.75rem;
          border: 1px solid var(--bucket-aura, ${fallbackAuraColor});
          background: rgba(255, 255, 255, 0.055);
          color: rgba(220, 255, 250, 0.90);
          cursor: pointer;
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          box-shadow: 0 0 18px color-mix(in srgb, var(--bucket-aura, ${fallbackAuraColor}) 20%, transparent);
          transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
        }
        .memoryWaveButton:hover { transform: translateY(-1px); }
        .memoryWaveButton::after {
          content: "";
          position: absolute;
          inset: -40%;
          opacity: 0;
          background: radial-gradient(circle, rgba(255,255,255,0.28), transparent 55%);
          transform: scale(0.2);
          transition: opacity 220ms ease, transform 420ms ease;
        }
        .memoryWaveButton:active::after {
          opacity: 1;
          transform: scale(1);
        }
        .memoryWaveButton b {
          color: var(--bucket-aura, ${fallbackAuraColor});
          text-shadow: 0 0 10px var(--bucket-aura, ${fallbackAuraColor});
        }
        .waveStatus {
          color: rgba(120, 255, 240, 0.68);
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.10em;
          text-transform: uppercase;
        }
        .memoryMissing { margin-top: 10px; border-radius: 14px; border: 1px solid rgba(255, 0, 190, 0.18); background: rgba(255, 0, 190, 0.08); color: rgba(255, 210, 246, 0.86); padding: 10px; font-size: 11px; font-weight: 800; line-height: 1.45; }

        .embed { margin-top: 12px; border-radius: 18px; overflow: hidden; border: 1px solid rgba(120, 255, 240, 0.14); background: rgba(0, 0, 0, 0.22); }
        iframe { width: 100%; height: 240px; border: none; display: block; background: rgba(255, 255, 255, 0.05); }
        .embed.spotify iframe { height: 160px; }
        .embed.apple_music iframe { height: 175px; }
        .mediaFrame { background: rgba(255, 255, 255, 0.04); }
        .img { width: 100%; height: auto; display: block; }
        .vid { width: 100%; display: block; background: #000; max-height: 520px; }
        .aud { width: 100%; display: block; padding: 10px; }

        .embedFoot { display: flex; gap: 10px; align-items: center; justify-content: space-between; padding: 10px 12px; background: rgba(0, 0, 0, 0.18); border-top: 1px solid rgba(120, 255, 240, 0.10); }
        .embedLink { font-size: 10px; font-weight: 950; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255, 0, 190, 0.85); text-decoration: underline; text-underline-offset: 4px; }
        .embedLink.dim { color: rgba(120, 255, 240, 0.55); text-decoration: none; }
        .embedNote { padding: 10px 12px 12px; border-top: 1px solid rgba(120, 255, 240, 0.10); font-size: 11px; font-weight: 800; color: rgba(180, 245, 238, 0.76); background: rgba(255, 255, 255, 0.04); }
        .storedAudioFrame {
          margin-top: 12px;
          padding: 12px;
          border-radius: 18px;
          border: 1px solid rgba(120, 255, 240, 0.14);
          background: rgba(255, 255, 255, 0.05);
        }
        .audioLabel {
          margin: 0 0 8px;
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(180, 245, 238, 0.82);
        }

        .embedFallback {
          border-radius: 999px; padding: 8px 10px;
          border: 1px solid rgba(120, 255, 240, 0.18);
          background: rgba(120, 255, 240, 0.10);
          color: rgba(220, 255, 250, 0.92);
          font-size: 10px; font-weight: 950; letter-spacing: 0.14em; text-transform: uppercase;
          cursor: pointer;
        }

        .linkCard { margin-top: 12px; display: block; padding: 12px; border-radius: 16px; border: 1px solid rgba(120, 255, 240, 0.14); background: rgba(0, 0, 0, 0.18); text-decoration: none; }
        .linkLabel { font-size: 10px; font-weight: 950; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(120, 255, 240, 0.60); }
        .link { margin-top: 8px; font-size: 12px; font-weight: 900; color: rgba(220, 255, 250, 0.90); word-break: break-word; line-height: 1.35; }
        .linkNote { margin-top: 8px; font-size: 12px; font-weight: 800; color: rgba(120, 255, 240, 0.60); }
        .viewFullBtn {
          margin-top: 12px; width: 100%; border-radius: 999px; border: 1px solid rgba(120, 255, 240, 0.22);
          background: rgba(120, 255, 240, 0.12); color: rgba(220, 255, 250, 0.94);
          padding: 10px 12px; cursor: pointer; font-size: 10px; font-weight: 950;
          letter-spacing: 0.16em; text-transform: uppercase;
        }
        .viewFullBtn:hover { background: rgba(120, 255, 240, 0.18); }
        .expanded { background: rgba(0, 0, 0, 0.42); }
        .expanded iframe { height: min(58vh, 520px); }
        .expanded .embed.spotify iframe { height: 352px; }
        .expanded .embed.apple_music iframe { height: 360px; }
      `}</style>
    </div>
  );
}

/* --------------------------- Wave glyph --------------------------- */

function WavePalm() {
  // Wide open palm, clean stencil vibe
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M8 11.2V5.9c0-.9.7-1.6 1.6-1.6S11.2 5 11.2 5.9v4.2"
        fill="none"
        stroke="rgba(0,0,0,0.62)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M11.2 10V4.9c0-.9.7-1.6 1.6-1.6S14.4 4 14.4 4.9V10"
        fill="none"
        stroke="rgba(0,0,0,0.62)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M14.4 10.2V5.7c0-.88.72-1.6 1.6-1.6.88 0 1.6.72 1.6 1.6V13"
        fill="none"
        stroke="rgba(0,0,0,0.62)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M7.1 12.3l-.25-2.3c-.1-.9-.85-1.55-1.72-1.45-.88.1-1.52.9-1.42 1.78l.38 3.4c.2 1.8 1.2 3.45 2.7 4.4l1.05.66c1.2.76 2.6 1.17 4.02 1.17h1.55c2.9 0 5.25-2.35 5.25-5.25V13"
        fill="none"
        stroke="rgba(0,0,0,0.62)"
        strokeWidth="2.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* --------------------------- Emblems (your existing set) --------------------------- */

function HandEmblem() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.4 11.2V5.6c0-.9.7-1.6 1.6-1.6s1.6.7 1.6 1.6v4.4" fill="none" stroke="rgba(0,0,0,0.62)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M11.6 10V4.8c0-.9.7-1.6 1.6-1.6s1.6.7 1.6 1.6V10" fill="none" stroke="rgba(0,0,0,0.62)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M14.8 10.4V5.5c0-.85.7-1.55 1.55-1.55.86 0 1.55.7 1.55 1.55V13" fill="none" stroke="rgba(0,0,0,0.62)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M7.1 12.2l-.2-2.2c-.08-.9-.83-1.55-1.7-1.45-.88.1-1.52.9-1.42 1.78l.38 3.4c.2 1.8 1.2 3.45 2.7 4.4l1.05.66c1.2.76 2.6 1.17 4.02 1.17h1.55c2.9 0 5.25-2.35 5.25-5.25V13" fill="none" stroke="rgba(0,0,0,0.62)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function StarEmblem() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.8l2.9 6.1 6.7.9-4.9 4.7 1.2 6.6L12 18l-5.9 3.1 1.2-6.6L2.4 9.8l6.7-.9L12 2.8z" fill="transparent" stroke="rgba(0,0,0,0.62)" strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowEmblem() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4l7 7-1.7 1.7L13.2 8.6V20h-2.4V8.6L6.7 12.7 5 11l7-7z" fill="transparent" stroke="rgba(0,0,0,0.62)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function HandEmblemBright() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.4 11.2V5.6c0-.9.7-1.6 1.6-1.6s1.6.7 1.6 1.6v4.4" fill="none" stroke="rgba(220,255,250,0.92)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M11.6 10V4.8c0-.9.7-1.6 1.6-1.6s1.6.7 1.6 1.6V10" fill="none" stroke="rgba(220,255,250,0.92)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M14.8 10.4V5.5c0-.85.7-1.55 1.55-1.55.86 0 1.55.7 1.55 1.55V13" fill="none" stroke="rgba(220,255,250,0.92)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M7.1 12.2l-.2-2.2c-.08-.9-.83-1.55-1.7-1.45-.88.1-1.52.9-1.42 1.78l.38 3.4c.2 1.8 1.2 3.45 2.7 4.4l1.05.66c1.2.76 2.6 1.17 4.02 1.17h1.55c2.9 0 5.25-2.35 5.25-5.25V13" fill="none" stroke="rgba(220,255,250,0.92)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function StarEmblemBright() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.8l2.9 6.1 6.7.9-4.9 4.7 1.2 6.6L12 18l-5.9 3.1 1.2-6.6L2.4 9.8l6.7-.9L12 2.8z" fill="transparent" stroke="rgba(220,255,250,0.92)" strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowEmblemBright() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4l7 7-1.7 1.7L13.2 8.6V20h-2.4V8.6L6.7 12.7 5 11l7-7z" fill="transparent" stroke="rgba(220,255,250,0.92)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
