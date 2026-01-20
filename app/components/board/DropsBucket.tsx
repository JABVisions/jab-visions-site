"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { BoardActivity } from "@/lib/board/activity";
import { getLocalActivity } from "@/lib/board/activity";

import {
  type BucketFolder,
  type BucketBrainState,
  readBrain,
  writeBrain,
  sendWave,
  simulateIncomingWave,
  BUCKET_BRAIN_KEY,
  EVT_UPDATED,
} from "@/lib/board/bucketBrain";

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type BucketEntry = { activityId: string; savedAt: number };

/* --------------------------- embed helpers --------------------------- */

type EmbedKind = "youtube" | "spotify" | "soundcloud" | "none";

function safeStr(x: any): string {
  return typeof x === "string" ? x : "";
}
function isExternalHref(href: string) {
  return /^https?:\/\//i.test(href);
}
function fmtShort(ts: number) {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "2-digit",
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

function toSoundCloudEmbed(url: string): string | null {
  try {
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

  const sc = toSoundCloudEmbed(href);
  if (sc) return { kind: "soundcloud", url: sc };

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
}: {
  title?: string;
  subtitle?: string;
  selfUser?: string;
}) {
  const [brain, setBrain] = useState<BucketBrainState>(() => readBrain());
  const [active, setActive] = useState<BucketFolder>("pin");
  const [open, setOpen] = useState(false);

  // Wave UI
  const [waveOpen, setWaveOpen] = useState(false);
  const [waveTo, setWaveTo] = useState("someone");
  const [toast, setToast] = useState<string | null>(null);

  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const onUpdated = () => setBrain(readBrain());
    window.addEventListener(EVT_UPDATED, onUpdated as EventListener);
    return () => window.removeEventListener(EVT_UPDATED, onUpdated as EventListener);
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
    const items = getLocalActivity?.() ?? [];
    const map = new Map<string, BoardActivity>();
    for (const it of items) if (it?.id) map.set(String(it.id), it);
    return map;
  }, [brain.updatedAt, open]);

  const counts = useMemo(() => {
    return {
      pass: brain.pass.length,
      pin: brain.pin.length,
      push: brain.push.length,
    };
  }, [brain]);

  const list = (brain as any)[active] as BucketEntry[] | undefined;

  // Waves
  const my = String(selfUser || "me").trim().toLowerCase();
  const inbound = useMemo(() => brain.waves.filter((w) => w.to === my), [brain.waves, my]);
  const outbound = useMemo(() => brain.waves.filter((w) => w.from === my), [brain.waves, my]);

  const mutualsForMe = useMemo(() => {
    return brain.mutuals.filter((m) => m.a === my || m.b === my);
  }, [brain.mutuals, my]);

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
              <span className="waveCount">{inbound.length}</span>
            </span>
          </button>

          <div className="waveMeta">
            <span className="metaDot" />
            self: <b>{my}</b>
            <span className="metaSep">•</span>
            mutuals: <b>{mutualsForMe.length}</b>
          </div>
        </div>

        {waveOpen && (
          <div className="wavePanel">
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
                      <div className="waveFrom">@{w.from}</div>
                      <div className="waveTime">{fmtShort(w.createdAt)}</div>
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
                      <div className="waveFrom">to @{w.to}</div>
                      <div className="waveTime">{fmtShort(w.createdAt)}</div>
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
                        <div className="mutualText">“a connection is forming”</div>
                        <div className="mutualWho">@{other}</div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
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
                const it = activityIndex.get(String(e.activityId));
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
                    const it = activityIndex.get(String(e.activityId));
                    return <BucketDropCard key={e.activityId} folder={active} entry={e} item={it ?? null} />;
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* styles */}
      <style jsx>{`
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

        @media (max-width: 900px) {
          .waveGrid { grid-template-columns: 1fr; }
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
          padding: 10px 12px;
          border-radius: 16px;
          border: 1px solid rgba(0,0,0,0.08);
          background: rgba(255,255,255,0.72);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .waveFrom { font-weight: 950; color: rgba(0,0,0,0.70); }
        .waveTime { font-weight: 900; opacity: 0.55; font-size: 11px; }

        .mutualItem {
          margin-top: 10px;
          padding: 10px 12px;
          border-radius: 16px;
          border: 1px solid rgba(0, 140, 135, 0.18);
          background: rgba(0, 140, 135, 0.08);
        }

        .mutualText {
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.04em;
          color: rgba(0, 0, 0, 0.68);
        }

        .mutualWho {
          margin-top: 6px;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(255, 0, 190, 0.85);
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
}: {
  folder: BucketFolder;
  entry: BucketEntry;
  item: BoardActivity | null;
}) {
  const href = safeStr(item?.href);
  const external = href ? isExternalHref(href) : false;

  const [embedFailed, setEmbedFailed] = useState(false);
  const embed = useMemo(() => computeEmbed(href), [href]);
  const showEmbed = !!embed.url && !embedFailed;

  return (
    <div className="card">
      <div className="top">
        <div className="badge">{folder.toUpperCase()}</div>
        <div className="time">{item?.created_at ? fmtWhen(item.created_at) : fmtShort(entry.savedAt)}</div>
      </div>

      <div className="title">{item?.title || "Saved Drop"}</div>
      {item?.body && <div className="body">{item.body}</div>}

      {showEmbed && (
        <div className={clsx("embed", embed.kind)}>
          <iframe
            title={`bucket-embed-${embed.kind}-${entry.activityId}`}
            src={embed.url}
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            onError={() => setEmbedFailed(true)}
          />
          <div className="embedFoot">
            {href ? (
              <a className="embedLink" href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined}>
                Open attachment
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
        </div>
      )}

      {!showEmbed && href && (
        <a className="linkCard" href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined}>
          <div className="linkLabel">Attachment</div>
          <div className="link">{href}</div>
          {embedFailed && <div className="linkNote">Embed was blocked. Link still works.</div>}
        </a>
      )}

      <style jsx>{`
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
        .title { margin-top: 10px; font-weight: 950; color: rgba(220, 255, 250, 0.92); letter-spacing: 0.04em; font-size: 13px; }
        .body { margin-top: 8px; font-size: 12px; color: rgba(120, 255, 240, 0.72); white-space: pre-wrap; line-height: 1.45; }

        .embed { margin-top: 12px; border-radius: 18px; overflow: hidden; border: 1px solid rgba(120, 255, 240, 0.14); background: rgba(0, 0, 0, 0.22); }
        iframe { width: 100%; height: 240px; border: none; display: block; background: rgba(255, 255, 255, 0.05); }
        .embed.spotify iframe { height: 160px; }

        .embedFoot { display: flex; gap: 10px; align-items: center; justify-content: space-between; padding: 10px 12px; background: rgba(0, 0, 0, 0.18); border-top: 1px solid rgba(120, 255, 240, 0.10); }
        .embedLink { font-size: 10px; font-weight: 950; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255, 0, 190, 0.85); text-decoration: underline; text-underline-offset: 4px; }
        .embedLink.dim { color: rgba(120, 255, 240, 0.55); text-decoration: none; }

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

