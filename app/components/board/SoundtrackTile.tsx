"use client";

import Link from "next/link";

type MusicLink = {
  id: string;
  title: string;
  url: string;
  embedUrl: string;
  platform: string;
};

export default function SoundtrackTile(props: {
  musicTitle: string;
  setMusicTitle: (v: string) => void;
  musicUrl: string;
  setMusicUrl: (v: string) => void;
  addMusicLink: () => void;
  musicMsg: string | null;
  musicLinks: MusicLink[];
  removeMusicLink: (id: string) => void;
}) {
  const {
    musicTitle,
    setMusicTitle,
    musicUrl,
    setMusicUrl,
    addMusicLink,
    musicMsg,
    musicLinks,
    removeMusicLink,
  } = props;

  return (
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
  );
}