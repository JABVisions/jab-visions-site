"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

type MusicLink = {
  id: string;
  user_id: string;
  title: string | null;
  platform: string | null;
  url: string;
  created_at: string;
};

function detectPlatform(url: string): string {
  const u = url.toLowerCase();

  if (u.includes("open.spotify.com") || u.includes("spotify.com")) return "spotify";
  if (u.includes("soundcloud.com")) return "soundcloud";
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";

  return "other";
}

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function platformLabel(p?: string | null) {
  if (!p) return "Link";
  const v = p.toLowerCase();
  if (v === "spotify") return "Spotify";
  if (v === "soundcloud") return "SoundCloud";
  if (v === "youtube") return "YouTube";
  return "Link";
}

export default function MyMusicModule() {
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [links, setLinks] = useState<MusicLink[]>([]);
  const [loading, setLoading] = useState(true);

  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function fetchLinks() {
    setLoading(true);
    setError(null);

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr) {
      setError(userErr.message);
      setLoading(false);
      return;
    }

    if (!user) {
      setError("You must be logged in to manage My Music links.");
      setLoading(false);
      return;
    }

    const { data, error: selErr } = await supabase
      .from("music_links")
      .select("*")
      .order("created_at", { ascending: false });

    if (selErr) {
      setError(selErr.message);
      setLoading(false);
      return;
    }

    setLinks((data as MusicLink[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    fetchLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const cleanUrl = url.trim();
    const cleanTitle = title.trim();

    if (!cleanUrl) {
      setError("Paste a link first.");
      return;
    }
    if (!isValidUrl(cleanUrl)) {
      setError("That doesn’t look like a valid URL. Make sure it starts with https://");
      return;
    }

    setSaving(true);

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr) {
      setError(userErr.message);
      setSaving(false);
      return;
    }

    if (!user) {
      setError("You must be logged in to add links.");
      setSaving(false);
      return;
    }

    const platform = detectPlatform(cleanUrl);

    const { error: insErr } = await supabase.from("music_links").insert({
      user_id: user.id,
      url: cleanUrl,
      platform,
      title: cleanTitle ? cleanTitle : null,
    });

    if (insErr) {
      setError(insErr.message);
      setSaving(false);
      return;
    }

    setUrl("");
    setTitle("");
    setNotice("Saved ✅");
    await fetchLinks();
    setSaving(false);
  }

  async function handleDelete(id: string) {
    setError(null);
    setNotice(null);

    const ok = window.confirm("Delete this link?");
    if (!ok) return;

    const { error: delErr } = await supabase.from("music_links").delete().eq("id", id);

    if (delErr) {
      setError(delErr.message);
      return;
    }

    setNotice("Deleted ✅");
    setLinks((prev) => prev.filter((x) => x.id !== id));
  }

  return (
    <section className="w-full rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl p-4 md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base md:text-lg font-semibold tracking-wide text-white">
            My Music
          </h2>
          <p className="mt-1 text-xs md:text-sm text-white/60">
            Add Spotify, SoundCloud, or YouTube links now. Audio file upload comes later.
          </p>
        </div>

        <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] md:text-xs text-white/70">
          Links Only (v1)
        </span>
      </div>

      <form onSubmit={handleAdd} className="mt-4 grid gap-3">
        <div className="grid gap-2 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="block text-[11px] text-white/60 mb-1">Link URL</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://open.spotify.com/track/... (or SoundCloud / YouTube)"
              className="w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/20"
            />
          </div>

          <div>
            <label className="block text-[11px] text-white/60 mb-1">Title (optional)</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Track name"
              className="w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/20"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            disabled={saving}
            type="submit"
            className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/15 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Add link"}
          </button>

          {error ? (
            <div className="text-xs text-red-300">{error}</div>
          ) : notice ? (
            <div className="text-xs text-emerald-200">{notice}</div>
          ) : (
            <div className="text-xs text-white/40">Tip: paste a Spotify track/album/artist link.</div>
          )}
        </div>
      </form>

      <div className="mt-5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs uppercase tracking-[0.25em] text-white/50">
            Saved Links
          </h3>
          <button
            onClick={fetchLinks}
            className="text-xs text-white/60 hover:text-white"
            type="button"
          >
            Refresh
          </button>
        </div>

        <div className="mt-3 grid gap-2">
          {loading ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/60">
              Loading…
            </div>
          ) : links.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/60">
              No links yet. Add one above.
            </div>
          ) : (
            links.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-white/10 bg-black/30 px-2 py-0.5 text-[10px] text-white/70">
                      {platformLabel(item.platform)}
                    </span>
                    <div className="truncate text-sm text-white">
                      {item.title ? item.title : item.url}
                    </div>
                  </div>

                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block truncate text-xs text-white/60 hover:text-white"
                  >
                    {item.url}
                  </a>
                </div>

                <button
                  onClick={() => handleDelete(item.id)}
                  className="shrink-0 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-white/70 hover:bg-black/40 hover:text-white"
                  type="button"
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
