"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "jab_board_profile_v2";

type MusicPlatform = "Spotify" | "SoundCloud" | "YouTube" | "Other";

type MusicLink = {
  id: string;
  title: string;
  platform: MusicPlatform;
  url: string;
  embedUrl: string;
  createdAt: number;
};

type ProfilePayload = {
  user: string;
  displayName: string;
  bio: string;
  glowColor: string;
  avatarDataUrl: string | null;

  // Vision Wall + Cover
  visionSlots?: (string | null)[];
  coverDataUrl?: string | null;

  // Music
  musicLinks?: MusicLink[];
};

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function colorName(hex: string) {
  const map: Record<string, string> = {
    "#ff3dbf": "Pink Glow",
    "#22ff77": "Emerald Glow",
    "#25f6ff": "Cyan Glow",
    "#8b5cff": "Violet Glow",
    "#ffd64a": "Gold Glow",
    "#ffffff": "White Glow",
  };
  return map[hex.toLowerCase()] || "Custom Glow";
}

function safeId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function cleanUrl(input: string) {
  return input.trim();
}

function inferPlatformFromUrl(u: URL): MusicPlatform {
  const host = u.hostname.toLowerCase();
  if (host.includes("spotify.com")) return "Spotify";
  if (host.includes("soundcloud.com")) return "SoundCloud";
  if (host.includes("youtube.com") || host.includes("youtu.be")) return "YouTube";
  return "Other";
}

function toYouTubeEmbed(u: URL) {
  if (u.hostname.includes("youtu.be")) {
    const id = u.pathname.replace("/", "").trim();
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }

  if (u.hostname.includes("youtube.com")) {
    const v = u.searchParams.get("v");
    if (v) return `https://www.youtube.com/embed/${v}`;

    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "shorts" && parts[1]) return `https://www.youtube.com/embed/${parts[1]}`;
    if (parts[0] === "embed" && parts[1]) return `https://www.youtube.com/embed/${parts[1]}`;
  }

  return null;
}

function toSpotifyEmbed(u: URL) {
  if (!u.hostname.includes("spotify.com")) return null;
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  const type = parts[0];
  const id = parts[1];
  const allowed = new Set(["track", "album", "playlist", "artist", "episode", "show"]);
  if (!allowed.has(type) || !id) return null;

  return `https://open.spotify.com/embed/${type}/${id}`;
}

function toSoundCloudEmbed(u: URL) {
  if (!u.hostname.includes("soundcloud.com")) return null;
  const encoded = encodeURIComponent(u.toString());
  return `https://w.soundcloud.com/player/?url=${encoded}&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&visual=true`;
}

function makeEmbedUrl(rawUrl: string): { platform: MusicPlatform; embedUrl: string } | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }

  const platform = inferPlatformFromUrl(u);

  if (platform === "YouTube") {
    const embed = toYouTubeEmbed(u);
    return embed ? { platform, embedUrl: embed } : null;
  }
  if (platform === "Spotify") {
    const embed = toSpotifyEmbed(u);
    return embed ? { platform, embedUrl: embed } : null;
  }
  if (platform === "SoundCloud") {
    const embed = toSoundCloudEmbed(u);
    return embed ? { platform, embedUrl: embed } : null;
  }

  return null;
}

export default function BoardProfileHubPage() {
  // TEMP user id until auth exists
  const userId = "demo";

  const [displayName, setDisplayName] = useState("Your Name");
  const [bio, setBio] = useState("Where imagination meets reality.");
  const [glowColor, setGlowColor] = useState("#25f6ff");
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);

  // Vision wall + cover
  const [visionSlots, setVisionSlots] = useState<(string | null)[]>(Array.from({ length: 6 }, () => null));
  const [coverDataUrl, setCoverDataUrl] = useState<string | null>(null);

  // Music
  const [musicTitle, setMusicTitle] = useState("");
  const [musicUrl, setMusicUrl] = useState("");
  const [musicMsg, setMusicMsg] = useState<string | null>(null);
  const [musicLinks, setMusicLinks] = useState<MusicLink[]>([]);

  // Load local backup fast, then try server
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw) as Partial<ProfilePayload>;

        if (typeof data.displayName === "string") setDisplayName(data.displayName);
        if (typeof data.bio === "string") setBio(data.bio);
        if (typeof data.glowColor === "string") setGlowColor(data.glowColor);
        if (typeof data.avatarDataUrl === "string" || data.avatarDataUrl === null)
          setAvatarDataUrl(data.avatarDataUrl ?? null);

        if (Array.isArray(data.visionSlots) && data.visionSlots.length === 6) {
          setVisionSlots(data.visionSlots.map((x) => (typeof x === "string" ? x : null)));
        }
        if (typeof data.coverDataUrl === "string" || data.coverDataUrl === null) {
          setCoverDataUrl(data.coverDataUrl ?? null);
        }

        if (Array.isArray(data.musicLinks)) {
          setMusicLinks(
            data.musicLinks
              .filter((m) => m && typeof m === "object")
              .map((m: any) => ({
                id: String(m.id ?? safeId()),
                title: String(m.title ?? "Untitled"),
                platform: (m.platform as MusicPlatform) ?? "Other",
                url: String(m.url ?? ""),
                embedUrl: String(m.embedUrl ?? ""),
                createdAt: Number(m.createdAt ?? Date.now()),
              }))
              .filter((m) => m.url && m.embedUrl)
          );
        }
      }
    } catch {
      // ignore
    }

    (async () => {
      try {
        const res = await fetch(`/api/profile?user=${encodeURIComponent(userId)}`, { cache: "no-store" });
        const data = await res.json();

        if (data?.ok && data?.profile) {
          const p = data.profile as Partial<ProfilePayload>;
          if (typeof p.displayName === "string") setDisplayName(p.displayName);
          if (typeof p.bio === "string") setBio(p.bio);
          if (typeof p.glowColor === "string") setGlowColor(p.glowColor);
          if (typeof p.avatarDataUrl === "string" || p.avatarDataUrl === null)
            setAvatarDataUrl(p.avatarDataUrl ?? null);

          if (Array.isArray(p.visionSlots) && p.visionSlots.length === 6) {
            setVisionSlots(p.visionSlots.map((x) => (typeof x === "string" ? x : null)));
          }
          if (typeof p.coverDataUrl === "string" || p.coverDataUrl === null) {
            setCoverDataUrl(p.coverDataUrl ?? null);
          }
          if (Array.isArray(p.musicLinks)) {
            setMusicLinks(
              p.musicLinks
                .map((m: any) => ({
                  id: String(m.id ?? safeId()),
                  title: String(m.title ?? "Untitled"),
                  platform: (m.platform as MusicPlatform) ?? "Other",
                  url: String(m.url ?? ""),
                  embedUrl: String(m.embedUrl ?? ""),
                  createdAt: Number(m.createdAt ?? Date.now()),
                }))
                .filter((m) => m.url && m.embedUrl)
            );
          }

          // keep local backup in sync
          const merged: ProfilePayload = {
            user: userId,
            displayName: p.displayName ?? displayName,
            bio: p.bio ?? bio,
            glowColor: p.glowColor ?? glowColor,
            avatarDataUrl: (p.avatarDataUrl ?? avatarDataUrl) ?? null,
            visionSlots: (p.visionSlots as any) ?? visionSlots,
            coverDataUrl: (p.coverDataUrl as any) ?? coverDataUrl,
            musicLinks: (p.musicLinks as any) ?? musicLinks,
          };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        }
      } catch {
        // server not ready yet - local still works
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  function persistLocal(partial: Partial<ProfilePayload>) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const prev = raw ? (JSON.parse(raw) as Partial<ProfilePayload>) : {};
      const next = { ...prev, user: userId, ...partial };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  function persistMusic(next: MusicLink[]) {
    persistLocal({ musicLinks: next });
  }

  function addMusicLink() {
    const url = cleanUrl(musicUrl);
    const title = musicTitle.trim() || "Untitled";
    if (!url) return;

    const embed = makeEmbedUrl(url);

    if (!embed) {
      setMusicMsg("Paste a Spotify, SoundCloud, or YouTube link.");
      window.setTimeout(() => setMusicMsg(null), 1800);
      return;
    }

    const next: MusicLink[] = [
      {
        id: safeId(),
        title,
        platform: embed.platform,
        url,
        embedUrl: embed.embedUrl,
        createdAt: Date.now(),
      },
      ...musicLinks,
    ];

    setMusicLinks(next);
    setMusicTitle("");
    setMusicUrl("");
    setMusicMsg("Saved ✓");
    window.setTimeout(() => setMusicMsg(null), 1400);
    persistMusic(next);
  }

  function removeMusicLink(id: string) {
    const next = musicLinks.filter((m) => m.id !== id);
    setMusicLinks(next);
    persistMusic(next);
  }

  const aura = useMemo(() => {
    const glowSoft = hexToRgba(glowColor, 0.18);
    const glowMid = hexToRgba(glowColor, 0.28);
    const glowStrong = hexToRgba(glowColor, 0.38);

    return {
      border: hexToRgba(glowColor, 0.55),
      ring: `0 0 0 1px ${hexToRgba(glowColor, 0.22)}, 0 0 26px ${glowSoft}, 0 0 60px ${glowMid}, 0 0 95px ${glowStrong}`,
      chipGlow: `0 0 22px ${hexToRgba(glowColor, 0.12)}`,
    };
  }, [glowColor]);

  return (
    <main className="min-h-screen board-bg text-black">
      <section className="mx-auto max-w-6xl px-6 pt-16 pb-28">
        <div className="poster-board" style={{ boxShadow: aura.ring, borderColor: aura.border }}>
          {/* Board header strip */}
          <div className="board-top">
            <div className="board-top-left">
              <div className="board-title">JAB Visions™ Board</div>
              <div className="board-subtitle">Profile: your personal vision wall inside the Board</div>
            </div>

            <div className="board-top-right">
              <Link href="/board" className="board-pill-link" style={{ boxShadow: aura.chipGlow }}>
                ← Back
              </Link>

              <Link href="/board/profile/edit" className="board-pill-cta" style={{ boxShadow: aura.chipGlow }}>
                Tune aura + avatar
              </Link>
            </div>
          </div>

          {/* 3-column Vision Board Layout */}
          <div className="board-grid-vision">
            {/* LEFT: Vision Wall + Music Player */}
            <div className="left-stack">
              <div className="inner-tile vision">
                <div className="tile-head">
                  <div>
                    <div className="tile-title">Vision Wall</div>
                    <div className="tile-sub">Six snapshots of what you’re becoming.</div>
                  </div>
                </div>

                <div className="vision-grid">
                  {visionSlots.map((img, idx) => (
                    <div key={idx} className="vision-slot">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="vision-img" src={img} alt={`Vision slot ${idx + 1}`} />
                      ) : (
                        <div className="vision-empty" aria-hidden>
                          <div className="plus">+</div>
                          <div className="label">ADD PHOTO</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="vision-hint">
                  Tip: these can be moodboards, goals, film stills, or icons of your era.
                </div>

                <div className="vision-cta-row">
                  <Link href="/board/profile/edit" className="tiny-cta">
                    Edit vision wall →
                  </Link>
                </div>
              </div>

              {/* MUSIC TILE (part of the vision board, plays while viewing) */}
              <div className="inner-tile music">
                <div className="tile-head">
                  <div>
                    <div className="tile-title">Soundtrack</div>
                    <div className="tile-sub">The music that lives on your board.</div>
                  </div>

                  <Link href="/board/profile/edit" className="tiny-cta" style={{ paddingTop: 2 }}>
                    Edit →
                  </Link>
                </div>

                <div className="music-form">
                  <input
                    value={musicTitle}
                    onChange={(e) => setMusicTitle(e.target.value)}
                    className="music-input"
                    placeholder="Title (optional)"
                  />
                  <input
                    value={musicUrl}
                    onChange={(e) => setMusicUrl(e.target.value)}
                    className="music-input"
                    placeholder="Paste Spotify / SoundCloud / YouTube URL"
                  />
                  <button type="button" className="music-add" onClick={addMusicLink}>
                    Add + Embed
                  </button>
                </div>

                {musicMsg && <div className="music-msg">{musicMsg}</div>}

                <div className="music-list">
                  {musicLinks.length === 0 ? (
                    <div className="note-card">
                      <div className="note-title">No soundtrack yet.</div>
                      <div className="note-text">Add a link and it becomes a player on your vision board.</div>
                    </div>
                  ) : (
                    musicLinks.map((m) => (
                      <div key={m.id} className="music-item-embed">
                        <div className="music-item-top">
                          <div className="music-meta">
                            <div className="music-title">{m.title}</div>
                            <div className="music-sub">
                              <span className="badge">{m.platform}</span>
                              <a className="music-link" href={m.url} target="_blank" rel="noreferrer">
                                Open original
                              </a>
                            </div>
                          </div>

                          <button type="button" className="music-remove" onClick={() => removeMusicLink(m.id)}>
                            Remove
                          </button>
                        </div>

                        <div className={`embed-shell ${m.platform.toLowerCase()}`}>
                          <iframe
                            src={m.embedUrl}
                            title={`${m.platform} player: ${m.title}`}
                            loading="lazy"
                            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                            allowFullScreen
                            referrerPolicy="strict-origin-when-cross-origin"
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="music-note">
                  Demo mode saves locally. Later we’ll persist these to Supabase <code>music_links</code>.
                </div>
              </div>
            </div>

            {/* CENTER: Identity + Aura Snapshot + Recent Drops */}
            <div className="center-stack">
              <div className="inner-tile identity">
                <div className="identity-row">
                  <div
                    className="avatar-shell"
                    style={{
                      boxShadow: `0 0 0 2px ${hexToRgba(glowColor, 0.35)}, 0 0 28px ${hexToRgba(glowColor, 0.22)}`,
                      borderColor: hexToRgba(glowColor, 0.55),
                    }}
                  >
                    <div className="avatar-inner">
                      {avatarDataUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatarDataUrl} alt="Avatar" className="avatar-img" />
                      ) : (
                        <span className="avatar-emoji" aria-hidden>
                          🙂
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="identity-meta">
                    <div className="name-row">
                      <h1 className="name">{displayName || "Your Name"}</h1>
                      <span className="aura-badge">AURA ACTIVE</span>
                    </div>

                    <p className="bio">{bio || "Where imagination meets reality."}</p>

                    <div className="mini-pills">
                      <MiniPill label="Posts" value="0" />
                      <MiniPill label="Glow" value={colorName(glowColor)} />
                      <MiniPill label="Mode" value="Demo" />
                    </div>

                    <div className="micro-row">
                      <div className="micro-note pink">Pinned goals (coming next)</div>
                      <div className="micro-note green">Saved threads (coming next)</div>
                      <div className="micro-note gold">Collabs & calls (coming next)</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="inner-tile aura">
                <div className="tile-head">
                  <div>
                    <div className="tile-title">Aura Snapshot</div>
                    <div className="tile-sub">Your glow color is your board signature.</div>
                  </div>

                  <div
                    className="swatch"
                    style={{ background: glowColor, boxShadow: `0 0 30px ${hexToRgba(glowColor, 0.22)}` }}
                    aria-hidden
                  />
                </div>

                <div className="snap-grid">
                  <SnapCard label="Energy" value="Focused" />
                  <SnapCard label="Signal" value="Building" />
                  <SnapCard label="Vibe" value="Cinematic" />
                  <SnapCard label="Intent" value="Launch" />
                </div>
              </div>

              <div className="inner-tile drops">
                <div className="tile-head">
                  <div>
                    <div className="tile-title">Recent Drops</div>
                    <div className="tile-sub">Your latest feed posts, framed like scrapbook notes.</div>
                  </div>

                  <Link href="/board" className="open-link">
                    Open feed
                  </Link>
                </div>

                <div className="note-card">
                  <div className="note-title">No posts yet.</div>
                  <div className="note-text">Drop a status or announcement and this board will start to glow.</div>
                </div>
              </div>
            </div>

            {/* RIGHT: Cover Poster + Bookmarks */}
            <div className="right-stack">
              <div className="inner-tile cover">
                <div className="tile-head">
                  <div>
                    <div className="tile-title">Cover Poster</div>
                    <div className="tile-sub">A vertical cover that frames your whole board vibe.</div>
                  </div>
                </div>

                <div className="cover-shell">
                  {coverDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="cover-img" src={coverDataUrl} alt="Cover poster" />
                  ) : (
                    <div className="cover-empty" aria-hidden>
                      <div className="plus">+</div>
                      <div className="label">UPLOAD COVER</div>
                    </div>
                  )}
                </div>

                <div className="cover-hint">Think: magazine cover, film poster, or banner.</div>

                <div className="vision-cta-row">
                  <Link href="/board/profile/edit" className="tiny-cta">
                    Edit cover →
                  </Link>
                </div>
              </div>

              <div className="inner-tile bookmarks">
                <div className="tile-head">
                  <div>
                    <div className="tile-title">Board Bookmarks</div>
                    <div className="tile-sub">Fast jumps that feel like “tabs in your brain.”</div>
                  </div>
                </div>

                <div className="bookmark-stack">
                  <Bookmark href="/board/forums" title="Forums Hub" sub="threads, topics, announcements" />
                  <Bookmark href="/board/work" title="Work Board" sub="tasks, roles, collabs" />
                  <Bookmark href="/board" title="Community Feed" sub="status, boards, thread links" />
                  <Bookmark href="/board/profile/edit" title="Edit Profile" sub="avatar, bio, glow, vision" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <style jsx global>{`
        .board-bg {
          background:
            radial-gradient(1100px 700px at 20% 12%, rgba(0, 255, 150, 0.10), transparent 60%),
            radial-gradient(900px 600px at 85% 28%, rgba(255, 0, 190, 0.10), transparent 55%),
            linear-gradient(180deg, #fff7c9, #fff3b0);
        }

        .poster-board {
          position: relative;
          border-radius: 34px;
          border: 2px solid rgba(0, 0, 0, 0.12);
          overflow: hidden;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.70), rgba(255, 255, 255, 0.55)),
            repeating-linear-gradient(
              0deg,
              rgba(0, 0, 0, 0.03) 0px,
              rgba(0, 0, 0, 0.03) 1px,
              transparent 1px,
              transparent 10px
            ),
            repeating-linear-gradient(
              90deg,
              rgba(0, 0, 0, 0.02) 0px,
              rgba(0, 0, 0, 0.02) 1px,
              transparent 1px,
              transparent 12px
            );
          backdrop-filter: blur(10px);
          padding: 18px;
        }

        .poster-board:before {
          content: "";
          position: absolute;
          inset: -40px -60px auto -60px;
          height: 120px;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.55), transparent);
          transform: rotate(-6deg);
          opacity: 0.6;
          pointer-events: none;
        }

        .board-top {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 14px;
          padding: 18px 18px 14px 18px;
          border-radius: 26px;
          background: rgba(255, 242, 166, 0.82);
          border: 1px solid rgba(0, 0, 0, 0.10);
          box-shadow: 0 18px 55px rgba(0, 0, 0, 0.10);
          backdrop-filter: blur(10px);
        }

        .board-title {
          font-weight: 700;
          letter-spacing: 0.06em;
          font-size: 18px;
          color: rgba(0, 160, 80, 1);
          text-transform: uppercase;
        }

        .board-subtitle {
          margin-top: 6px;
          font-size: 13px;
          color: rgba(255, 0, 190, 0.80);
        }

        .board-top-right {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          justify-content: flex-end;
        }

        .board-pill-link,
        .board-pill-cta {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          padding: 10px 14px;
          font-size: 12px;
          font-weight: 600;
          border: 1px solid rgba(0, 0, 0, 0.16);
          transition: transform 160ms ease, filter 160ms ease;
          text-decoration: none;
          white-space: nowrap;
        }

        .board-pill-link {
          background: rgba(255, 255, 255, 0.70);
          color: rgba(0, 0, 0, 0.70);
        }

        .board-pill-cta {
          background: rgba(0, 0, 0, 0.86);
          color: rgba(200, 255, 230, 0.95);
          border-color: rgba(0, 255, 150, 0.30);
        }

        .board-pill-link:hover,
        .board-pill-cta:hover {
          transform: translateY(-1px);
          filter: brightness(1.02);
        }

        /* 3-column layout */
        .board-grid-vision {
          margin-top: 14px;
          display: grid;
          grid-template-columns: 0.95fr 1.25fr 0.9fr;
          gap: 14px;
          align-items: start;
        }

        .left-stack,
        .center-stack,
        .right-stack {
          display: grid;
          gap: 14px;
        }

        @media (max-width: 1100px) {
          .board-grid-vision {
            grid-template-columns: 1fr;
          }
        }

        .inner-tile {
          border-radius: 28px;
          border: 1px solid rgba(0, 0, 0, 0.10);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(255, 255, 255, 0.62));
          box-shadow: 0 18px 55px rgba(0, 0, 0, 0.08);
          padding: 18px;
          position: relative;
          overflow: hidden;
          outline: 2px solid rgba(37, 246, 255, 0.22);
          outline-offset: -6px;
        }

        .inner-tile:after {
          content: "";
          position: absolute;
          inset: 0;
          background:
            radial-gradient(1px 1px at 20% 30%, rgba(0, 0, 0, 0.05), transparent 55%),
            radial-gradient(1px 1px at 65% 55%, rgba(0, 0, 0, 0.04), transparent 55%),
            radial-gradient(1px 1px at 35% 75%, rgba(0, 0, 0, 0.04), transparent 55%);
          opacity: 0.35;
          pointer-events: none;
        }

        .tile-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
        }

        .tile-title {
          font-size: 16px;
          font-weight: 750;
          letter-spacing: 0.02em;
          color: rgba(0, 160, 80, 1);
        }

        .tile-sub {
          margin-top: 6px;
          font-size: 12.5px;
          color: rgba(0, 0, 0, 0.58);
        }

        /* Vision wall */
        .vision-grid {
          margin-top: 14px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }

        .vision-slot {
          border-radius: 16px;
          border: 1px solid rgba(0,0,0,0.12);
          background: rgba(255,255,255,0.65);
          overflow: hidden;
          height: 120px;
          position: relative;
        }

        .vision-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .vision-empty {
          height: 100%;
          display: grid;
          place-items: center;
          color: rgba(255,0,190,0.85);
          text-align: center;
          gap: 4px;
        }

        .vision-empty .plus {
          font-size: 28px;
          font-weight: 900;
          line-height: 1;
        }

        .vision-empty .label {
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.18em;
        }

        .vision-hint, .cover-hint {
          margin-top: 12px;
          font-size: 12px;
          color: rgba(0,0,0,0.55);
        }

        .vision-cta-row {
          margin-top: 10px;
          display: flex;
          justify-content: flex-end;
        }

        .tiny-cta {
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255, 0, 190, 0.85);
          text-decoration: underline;
          text-underline-offset: 4px;
          white-space: nowrap;
        }

        /* Identity */
        .identity-row {
          display: grid;
          grid-template-columns: 190px 1fr;
          gap: 16px;
          align-items: center;
        }

        @media (max-width: 720px) {
          .identity-row { grid-template-columns: 1fr; }
        }

        .avatar-shell {
          width: 180px;
          height: 180px;
          border-radius: 999px;
          border: 3px solid rgba(0, 0, 0, 0.12);
          background: rgba(255, 255, 255, 0.55);
          display: grid;
          place-items: center;
          margin: 0 auto;
        }

        .avatar-inner {
          width: 150px;
          height: 150px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.86);
          border: 1px solid rgba(0, 0, 0, 0.08);
          display: grid;
          place-items: center;
          overflow: hidden;
        }

        .avatar-img { width: 100%; height: 100%; object-fit: cover; }
        .avatar-emoji { font-size: 56px; filter: drop-shadow(0 10px 25px rgba(0, 0, 0, 0.12)); }

        .name-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 10px;
        }

        .name {
          font-size: 34px;
          line-height: 1.1;
          font-weight: 750;
          letter-spacing: 0.01em;
          color: rgba(0, 160, 80, 1);
        }

        .aura-badge {
          font-size: 11px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          font-weight: 700;
          padding: 8px 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.70);
          border: 1px solid rgba(0, 0, 0, 0.12);
          color: rgba(0, 0, 0, 0.65);
        }

        .bio { margin-top: 8px; font-size: 14px; color: rgba(0, 0, 0, 0.65); max-width: 58ch; }

        .mini-pills {
          margin-top: 12px;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .micro-row {
          margin-top: 12px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }

        @media (max-width: 720px) {
          .micro-row { grid-template-columns: 1fr; }
        }

        .micro-note {
          border-radius: 18px;
          padding: 12px 12px;
          font-size: 13px;
          border: 1px solid rgba(0, 0, 0, 0.10);
          background: rgba(255, 255, 255, 0.65);
          color: rgba(0, 0, 0, 0.62);
        }

        .micro-note.pink { box-shadow: 0 0 0 1px rgba(255, 0, 190, 0.14), 0 0 26px rgba(255, 0, 190, 0.10); }
        .micro-note.green { box-shadow: 0 0 0 1px rgba(0, 255, 150, 0.14), 0 0 26px rgba(0, 255, 150, 0.10); }
        .micro-note.gold { box-shadow: 0 0 0 1px rgba(255, 214, 74, 0.18), 0 0 26px rgba(255, 214, 74, 0.10); }

        /* Aura */
        .swatch {
          height: 44px;
          width: 44px;
          border-radius: 14px;
          border: 1px solid rgba(0, 0, 0, 0.14);
        }

        .snap-grid {
          margin-top: 14px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .snap-card {
          border-radius: 18px;
          border: 1px solid rgba(0, 0, 0, 0.10);
          background: rgba(255, 255, 255, 0.66);
          padding: 12px;
        }

        .snap-label {
          font-size: 11px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgba(0, 0, 0, 0.50);
        }

        .snap-value {
          margin-top: 6px;
          font-size: 16px;
          font-weight: 750;
          color: rgba(0, 160, 80, 1);
        }

        /* Notes / Bookmarks */
        .open-link {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(255, 0, 190, 0.85);
          text-decoration: underline;
          text-underline-offset: 4px;
          padding-top: 2px;
          white-space: nowrap;
        }

        .note-card {
          margin-top: 14px;
          border-radius: 18px;
          border: 1px dashed rgba(0, 0, 0, 0.18);
          background: rgba(255, 255, 255, 0.62);
          padding: 14px;
        }

        .note-title { font-weight: 750; color: rgba(0, 0, 0, 0.68); }
        .note-text { margin-top: 6px; font-size: 13px; color: rgba(0, 0, 0, 0.58); }

        .bookmark-stack {
          margin-top: 14px;
          display: grid;
          gap: 10px;
        }

        .bookmark {
          display: block;
          text-decoration: none;
          border-radius: 18px;
          border: 1px solid rgba(0, 0, 0, 0.10);
          background: rgba(255, 255, 255, 0.68);
          padding: 12px 14px;
          transition: transform 160ms ease, filter 160ms ease;
        }

        .bookmark:hover { transform: translateY(-1px); filter: brightness(1.01); }
        .bookmark-title { font-weight: 750; color: rgba(0, 160, 80, 1); }
        .bookmark-sub { margin-top: 4px; font-size: 12.5px; color: rgba(0, 0, 0, 0.55); }

        /* Cover poster */
        .cover-shell {
          margin-top: 14px;
          border-radius: 18px;
          border: 1px solid rgba(0,0,0,0.12);
          background: rgba(255,255,255,0.65);
          overflow: hidden;
          height: 420px;
          display: grid;
          place-items: center;
        }

        .cover-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .cover-empty {
          display: grid;
          place-items: center;
          color: rgba(255,0,190,0.85);
          text-align: center;
          gap: 6px;
        }

        .cover-empty .plus { font-size: 32px; font-weight: 900; line-height: 1; }
        .cover-empty .label { font-size: 11px; font-weight: 900; letter-spacing: 0.18em; }

        /* Music tile styling (paper module vibe) */
        .music-form {
          margin-top: 14px;
          display: grid;
          gap: 10px;
        }

        .music-input {
          width: 100%;
          border-radius: 16px;
          border: 1px solid rgba(0,0,0,0.12);
          background: rgba(255,255,255,0.72);
          padding: 12px 14px;
          outline: none;
        }

        .music-add {
          border-radius: 16px;
          padding: 12px 14px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          border: 1px solid rgba(0,0,0,0.16);
          background: rgba(0,0,0,0.86);
          color: rgba(200,255,230,0.95);
          cursor: pointer;
          transition: transform 160ms ease, filter 160ms ease;
        }

        .music-add:hover { transform: translateY(-1px); filter: brightness(1.02); }

        .music-msg {
          margin-top: 10px;
          font-size: 13px;
          color: rgba(0,0,0,0.65);
        }

        .music-list {
          margin-top: 14px;
          display: grid;
          gap: 12px;
        }

        .music-item-embed {
          border-radius: 18px;
          border: 1px solid rgba(0, 0, 0, 0.10);
          background: rgba(255, 255, 255, 0.68);
          padding: 12px 14px;
          display: grid;
          gap: 12px;
        }

        .music-item-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
        }

        .music-title { font-weight: 900; color: rgba(0, 160, 80, 1); }

        .music-sub { margin-top: 4px; display: flex; gap: 10px; align-items: center; }

        .badge {
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(255,255,255,0.72);
          border: 1px solid rgba(0,0,0,0.12);
          color: rgba(0,0,0,0.65);
        }

        .music-link {
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.10em;
          text-transform: uppercase;
          color: rgba(255, 0, 190, 0.85);
          text-decoration: underline;
          text-underline-offset: 4px;
        }

        .music-remove {
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 800;
          border: 1px solid rgba(0,0,0,0.12);
          background: rgba(255,255,255,0.70);
          color: rgba(0,0,0,0.65);
          cursor: pointer;
        }

        .embed-shell {
          border-radius: 18px;
          overflow: hidden;
          border: 1px solid rgba(0, 0, 0, 0.10);
          background: rgba(255, 255, 255, 0.60);
        }

        .embed-shell iframe {
          width: 100%;
          border: 0;
          display: block;
        }

        .embed-shell.youtube iframe { height: 220px; }
        .embed-shell.spotify iframe { height: 152px; }
        .embed-shell.soundcloud iframe { height: 300px; }

        @media (max-width: 640px) {
          .embed-shell.youtube iframe { height: 200px; }
          .embed-shell.soundcloud iframe { height: 260px; }
        }

        .music-note {
          margin-top: 14px;
          font-size: 12px;
          color: rgba(0,0,0,0.55);
        }

        .music-note code {
          background: rgba(255,255,255,0.65);
          border: 1px solid rgba(0,0,0,0.10);
          padding: 2px 6px;
          border-radius: 8px;
        }
      `}</style>
    </main>
  );
}

function MiniPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-full bg-white/70 border border-black/10 px-4 py-2 text-sm shadow-[0_12px_28px_rgba(0,0,0,0.08)]">
      <span className="text-black/55 mr-2">{label}:</span>
      <span className="text-[rgba(0,160,80,1)] font-semibold">{value}</span>
    </div>
  );
}

function SnapCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="snap-card">
      <div className="snap-label">{label}</div>
      <div className="snap-value">{value}</div>
    </div>
  );
}

function Bookmark({ href, title, sub }: { href: string; title: string; sub: string }) {
  return (
    <Link href={href} className="bookmark">
      <div className="bookmark-title">{title}</div>
      <div className="bookmark-sub">{sub}</div>
    </Link>
  );
}

