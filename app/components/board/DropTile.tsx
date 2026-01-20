"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

type DropType = "YouTube" | "Music" | "News" | "Link" | "Media" | "Pay" | "Doc";
type MediaKind = "image" | "video";

export type DropItem = {
  id: string;
  title: string;
  type: DropType;
  createdAt: number;

  // Link/news modes
  url?: string;
  embedUrl?: string | null;
  hostLabel?: string;

  // News-specific (so COVER STORY can use article headline instead of drop title)
  headline?: string;

  // Storage-backed file modes (Media/Pay/Doc)
  bucket?: string;
  storagePath?: string; // path inside bucket
  fileName?: string;
  fileSize?: number;
  mime?: string;
  mediaKind?: MediaKind; // for Media / Pay image

  // Pay metadata
  priceCents?: number; // store as cents
  description?: string;
  linkUrl?: string; // optional (ex: product page / checkout page)
};

const STORAGE_KEY = "jab_board_drops_v2";

/** ✅ Buckets that MUST exist in Supabase Storage */
const BUCKET_MEDIA = "board-media"; // images/videos + pay images
const BUCKET_DOCS = "board-docs"; // pdf/doc/etc

/* -------------------- utils -------------------- */
function safeId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function flash(setter: (v: string | null) => void, text: string, ms = 1600) {
  setter(text);
  window.setTimeout(() => setter(null), ms);
}

function normalizeUrl(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim();
  if (!s) return null;

  try {
    return new URL(s).toString();
  } catch {}

  try {
    return new URL(`https://${s}`).toString();
  } catch {
    return null;
  }
}

function hostLabelFromUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const h = u.hostname.replace(/^www\./, "");
    return h.toUpperCase();
  } catch {
    return "LINK";
  }
}

function faviconUrl(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const d = u.hostname.replace(/^www\./, "");
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=64`;
  } catch {
    return null;
  }
}

function newsCoverUrl(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const target = u.toString();
    return `https://image.thum.io/get/width/1200/crop/800/noanimate/${target}`;
  } catch {
    return null;
  }
}

function sanitizeFileName(name: string) {
  // keep it readable, remove weird path chars
  return name.replace(/[\/\\?%*:|"<>]/g, "-").slice(0, 140);
}

function formatPriceFromCents(cents?: number) {
  if (!cents || cents <= 0) return "";
  const v = (cents / 100).toFixed(2);
  return `$${v}`;
}

function parsePriceToCents(raw: string): number | null {
  const s = raw.trim().replace(/^\$/g, "");
  if (!s) return null;
  // allow "12", "12.3", "12.34"
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/* -------------------- embed builders -------------------- */
function youtubeIdFromUrl(u: URL): string | null {
  const host = u.hostname.toLowerCase();

  if (host.includes("youtu.be")) {
    const id = u.pathname.replace("/", "").trim();
    return id || null;
  }

  const v = u.searchParams.get("v");
  if (v) return v;

  const parts = u.pathname.split("/").filter(Boolean);
  if (parts[0] === "shorts" && parts[1]) return parts[1];
  if (parts[0] === "embed" && parts[1]) return parts[1];

  return null;
}

function toYouTubeEmbed(rawUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  const id = youtubeIdFromUrl(u);
  if (!id) return null;
  return `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1`;
}

function toSpotifyEmbed(rawUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!u.hostname.toLowerCase().includes("spotify.com")) return null;

  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  const type = parts[0];
  const id = parts[1];
  const allowed = new Set(["track", "album", "playlist", "artist", "episode", "show"]);
  if (!allowed.has(type) || !id) return null;

  return `https://open.spotify.com/embed/${type}/${id}`;
}

function toSoundCloudEmbed(rawUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!u.hostname.toLowerCase().includes("soundcloud.com")) return null;

  const encoded = encodeURIComponent(u.toString());
  return `https://w.soundcloud.com/player/?url=${encoded}&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&visual=true`;
}

function makeEmbedByMode(
  mode: DropType,
  rawUrl: string
): { embedUrl: string | null; hostLabel: string } {
  const hostLabel = hostLabelFromUrl(rawUrl);

  if (mode === "YouTube") return { embedUrl: toYouTubeEmbed(rawUrl), hostLabel: "YOUTUBE" };

  if (mode === "Music") {
    const s = toSpotifyEmbed(rawUrl);
    if (s) return { embedUrl: s, hostLabel: "SPOTIFY" };
    const sc = toSoundCloudEmbed(rawUrl);
    if (sc) return { embedUrl: sc, hostLabel: "SOUNDCLOUD" };
    const yt = toYouTubeEmbed(rawUrl);
    if (yt) return { embedUrl: yt, hostLabel: "YOUTUBE" };
    return { embedUrl: null, hostLabel };
  }

  if (mode === "News") return { embedUrl: null, hostLabel };
  if (mode === "Link") return { embedUrl: null, hostLabel };

  return { embedUrl: null, hostLabel };
}

/* -------------------- embed sizing helpers -------------------- */
type EmbedKind = "spotify_track" | "spotify_large" | "soundcloud" | "youtube" | "generic";

function embedKindFromUrl(embedUrl: string): EmbedKind {
  try {
    const u = new URL(embedUrl);
    const host = u.hostname.toLowerCase();

    if (host.includes("open.spotify.com")) {
      const parts = u.pathname.split("/").filter(Boolean);
      const type = parts[1]; // embed/{type}/{id}
      if (type === "track" || type === "episode") return "spotify_track";
      return "spotify_large";
    }

    if (host.includes("w.soundcloud.com")) return "soundcloud";
    if (host.includes("youtube.com")) return "youtube";
    return "generic";
  } catch {
    return "generic";
  }
}

/* -------------------- component -------------------- */
export default function DropTile() {
  const [mode, setMode] = useState<DropType>("YouTube");

  // Shared inputs
  const [title, setTitle] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  // Link inputs
  const [url, setUrl] = useState("");

  // File inputs
  const [file, setFile] = useState<File | null>(null);

  // Pay inputs
  const [payPrice, setPayPrice] = useState(""); // user-facing
  const [payDesc, setPayDesc] = useState("");
  const [payLink, setPayLink] = useState(""); // optional

  // Doc inputs
  const [docDesc, setDocDesc] = useState("");

  const [drops, setDrops] = useState<DropItem[]>([]);

  // Fullscreen viewer (media image/video only)
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);

  // Signed URLs cache (storagePath -> signed URL)
  const signedUrlRef = useRef<Record<string, string>>({});
  const [signedUrlByKey, setSignedUrlByKey] = useState<Record<string, string>>({});

  // cleanup signed URLs (not strictly required, but keeps it tidy)
  useEffect(() => {
    return () => {
      signedUrlRef.current = {};
      setSignedUrlByKey({});
    };
  }, []);

  // load drops from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;

      const safe: DropItem[] = parsed
        .filter((x) => x && typeof x === "object")
        .map((x: any) => ({
          id: String(x.id ?? safeId()),
          title: String(x.title ?? "Untitled"),
          type: (x.type as DropType) ?? "Link",
          createdAt: Number(x.createdAt ?? Date.now()),
          url: typeof x.url === "string" ? x.url : undefined,
          embedUrl: typeof x.embedUrl === "string" ? x.embedUrl : null,
          hostLabel: typeof x.hostLabel === "string" ? x.hostLabel : undefined,
          headline: typeof x.headline === "string" ? x.headline : undefined,
          bucket: typeof x.bucket === "string" ? x.bucket : undefined,
          storagePath: typeof x.storagePath === "string" ? x.storagePath : undefined,
          fileName: typeof x.fileName === "string" ? x.fileName : undefined,
          fileSize: typeof x.fileSize === "number" ? x.fileSize : undefined,
          mime: typeof x.mime === "string" ? x.mime : undefined,
          mediaKind:
            x.mediaKind === "video" ? "video" : x.mediaKind === "image" ? "image" : undefined,
          priceCents: typeof x.priceCents === "number" ? x.priceCents : undefined,
          description: typeof x.description === "string" ? x.description : undefined,
          linkUrl: typeof x.linkUrl === "string" ? x.linkUrl : undefined,
        }))
        .filter((d) => d.id && d.title);

      setDrops(safe);
    } catch {
      // ignore
    }
  }, []);

  function persist(next: DropItem[]) {
    setDrops(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }

  const hint = useMemo(() => {
    if (mode === "Media") return "Upload a photo or video. It becomes a visible tile instantly.";
    if (mode === "Pay") return "Upload a pay image + price. Optional link if you want.";
    if (mode === "Doc")
      return "Upload a script/resume/essay (PDF/DOC). Big files later via resumable upload.";
    if (mode === "YouTube") return "Paste a YouTube link. It embeds instantly.";
    if (mode === "Music") return "Paste Spotify or SoundCloud (or YouTube) and it embeds.";
    if (mode === "News") return "Paste a news/article link. It becomes a magazine cover card.";
    return "Paste any link. It becomes a clean drop card.";
  }, [mode]);

  async function requireSession() {
    const supabase = supabaseBrowser();
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user?.id) return null;
    return { supabase, userId: data.session.user.id };
  }

  async function getSignedUrl(bucket: string, path: string, expiresIn = 60 * 30) {
    const key = `${bucket}:${path}`;
    if (signedUrlRef.current[key]) return signedUrlRef.current[key];

    const supabase = supabaseBrowser();
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);

    if (error || !data?.signedUrl) return null;

    signedUrlRef.current[key] = data.signedUrl;
    setSignedUrlByKey((p) => ({ ...p, [key]: data.signedUrl }));
    return data.signedUrl;
  }

  /* -------------------- Add: Link drops -------------------- */
  function addLinkDrop() {
    const normalized = normalizeUrl(url);
    if (!normalized) return flash(setMsg, "Paste a valid link.", 1600);

    const t = title.trim() || "Untitled";
    const { embedUrl, hostLabel } = makeEmbedByMode(mode, normalized);

    if ((mode === "YouTube" || mode === "Music") && !embedUrl) {
      return flash(setMsg, "That link can’t be embedded. Try a different URL format.", 2000);
    }

    const next: DropItem[] = [
      {
        id: safeId(),
        title: t,
        type:
          mode === "YouTube"
            ? "YouTube"
            : mode === "Music"
              ? "Music"
              : mode === "News"
                ? "News"
                : "Link",
        url: normalized,
        embedUrl: embedUrl ?? null,
        hostLabel,
        // Until you wire headline extraction, default headline to the drop title for News.
        headline: mode === "News" ? t : undefined,
        createdAt: Date.now(),
      },
      ...drops,
    ];

    persist(next);
    setTitle("");
    setUrl("");
    flash(setMsg, "Added ✓", 1200);
  }

  /* -------------------- Add: File drops (Media/Doc/Pay) -------------------- */
  async function uploadFileToStorage(opts: {
    bucket: string;
    file: File;
    dropId: string;
  }): Promise<{ bucket: string; storagePath: string } | null> {
    const sess = await requireSession();
    if (!sess) {
      flash(setMsg, "You must be logged in to upload.", 2000);
      return null;
    }

    const { supabase, userId } = sess;

    // NOTE: 4GB uploads need resumable uploads; this warns but allows selection.
    const sizeMb = opts.file.size / (1024 * 1024);
    if (sizeMb > 800) {
      flash(setMsg, "Huge file. Browser uploads may fail. Resumable upload is next.", 3200);
    }

    const cleanName = sanitizeFileName(opts.file.name);
    const storagePath = `${userId}/${opts.dropId}/${Date.now()}-${cleanName}`;

    const { error } = await supabase.storage.from(opts.bucket).upload(storagePath, opts.file, {
      upsert: true,
      contentType: opts.file.type || "application/octet-stream",
      cacheControl: "3600",
    });

    if (error) {
      console.error("Storage upload error:", error);
      flash(setMsg, `Upload failed: ${error.message}`, 2600);
      return null;
    }

    return { bucket: opts.bucket, storagePath };
  }

  async function addMediaDrop() {
    if (!file) return flash(setMsg, "Choose a photo or video first.", 1600);

    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) return flash(setMsg, "Unsupported file type. Use image/video.", 2000);

    const t = title.trim() || "Untitled";
    const id = safeId();

    const up = await uploadFileToStorage({ bucket: BUCKET_MEDIA, file, dropId: id });
    if (!up) return;

    const next: DropItem[] = [
      {
        id,
        title: t,
        type: "Media",
        createdAt: Date.now(),
        bucket: up.bucket,
        storagePath: up.storagePath,
        fileName: file.name,
        fileSize: file.size,
        mime: file.type,
        mediaKind: isVideo ? "video" : "image",
      },
      ...drops,
    ];

    persist(next);
    setTitle("");
    setFile(null);
    flash(setMsg, "Media added ✓", 1400);
  }

  async function addDocDrop() {
    if (!file) return flash(setMsg, "Choose a document first.", 1600);

    const t = title.trim() || "Untitled";
    const id = safeId();

    const up = await uploadFileToStorage({ bucket: BUCKET_DOCS, file, dropId: id });
    if (!up) return;

    const next: DropItem[] = [
      {
        id,
        title: t,
        type: "Doc",
        createdAt: Date.now(),
        bucket: up.bucket,
        storagePath: up.storagePath,
        fileName: file.name,
        fileSize: file.size,
        mime: file.type,
        description: docDesc.trim() || undefined,
      },
      ...drops,
    ];

    persist(next);
    setTitle("");
    setFile(null);
    setDocDesc("");
    flash(setMsg, "Doc added ✓", 1400);
  }

  async function addPayDrop() {
    if (!file) return flash(setMsg, "Upload an image first.", 1600);
    if (!file.type.startsWith("image/")) return flash(setMsg, "Pay Drop image must be an image.", 2000);

    const cents = parsePriceToCents(payPrice);
    if (cents === null) return flash(setMsg, "Enter a valid price (ex: 19.99).", 2000);
    if (cents <= 0) return flash(setMsg, "Price must be greater than 0.", 2000);

    const t = title.trim() || "Untitled";
    const id = safeId();

    const up = await uploadFileToStorage({ bucket: BUCKET_MEDIA, file, dropId: id });
    if (!up) return;

    const normalizedLinkUrl = payLink.trim() ? normalizeUrl(payLink) : null;
    if (payLink.trim() && !normalizedLinkUrl) {
      return flash(setMsg, "Optional link looks invalid. Fix it or clear it.", 2200);
    }

    const next: DropItem[] = [
      {
        id,
        title: t,
        type: "Pay",
        createdAt: Date.now(),
        bucket: up.bucket,
        storagePath: up.storagePath,
        fileName: file.name,
        fileSize: file.size,
        mime: file.type,
        mediaKind: "image",
        priceCents: cents,
        description: payDesc.trim() || undefined,
        linkUrl: normalizedLinkUrl ?? undefined,
      },
      ...drops,
    ];

    persist(next);

    // NOTE: This file currently stores drops in localStorage.
    // Your next step (per your plan) is to also INSERT into:
    // - board_drops (type='Pay', etc)
    // - board_pay (price_cents, description, link_url, image_path)
    // We can wire that once your tables/policies are confirmed.

    setTitle("");
    setFile(null);
    setPayPrice("");
    setPayDesc("");
    setPayLink("");
    flash(setMsg, "Pay drop added ✓", 1400);
  }

  function addDrop() {
    if (mode === "Media") void addMediaDrop();
    else if (mode === "Doc") void addDocDrop();
    else if (mode === "Pay") void addPayDrop();
    else addLinkDrop();
  }

  /* -------------------- Remove -------------------- */
  async function removeDrop(id: string) {
    const drop = drops.find((d) => d.id === id);

    // If it has a stored file, delete it from Storage
    if (drop?.bucket && drop.storagePath) {
      try {
        const sess = await requireSession();
        if (sess) {
          await sess.supabase.storage.from(drop.bucket).remove([drop.storagePath]);
        }
      } catch (e) {
        console.warn("Remove from storage failed (continuing):", e);
      }
    }

    if (viewerId === id) {
      setViewerOpen(false);
      setViewerId(null);
    }

    const next = drops.filter((d) => d.id !== id);
    persist(next);
  }

  /* -------------------- Viewer -------------------- */
  function openViewer(id: string) {
    setViewerId(id);
    setViewerOpen(true);
  }

  function closeViewer() {
    setViewerOpen(false);
    setViewerId(null);
  }

  useEffect(() => {
    if (!viewerOpen) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeViewer();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewerOpen]);

  const viewerDrop = useMemo(() => {
    if (!viewerOpen || !viewerId) return null;
    return drops.find((d) => d.id === viewerId) ?? null;
  }, [viewerOpen, viewerId, drops]);

  const viewerSignedKey =
    viewerDrop?.bucket && viewerDrop.storagePath ? `${viewerDrop.bucket}:${viewerDrop.storagePath}` : "";
  const viewerSignedUrl = viewerSignedKey ? signedUrlByKey[viewerSignedKey] : undefined;

  // hydrate signed URLs for any file drops (best-effort)
  useEffect(() => {
    let cancelled = false;

    async function hydrateSignedUrls() {
      const fileDrops = drops.filter((d) => d.bucket && d.storagePath);
      for (const d of fileDrops) {
        if (!d.bucket || !d.storagePath) continue;
        const key = `${d.bucket}:${d.storagePath}`;
        if (signedUrlRef.current[key] || signedUrlByKey[key]) continue;

        const url = await getSignedUrl(d.bucket, d.storagePath, 60 * 45);
        if (cancelled) return;
        if (!url) continue;
      }
    }

    hydrateSignedUrls();
    return () => {
      cancelled = true;
    };
  }, [drops, signedUrlByKey]);

  /* -------------------- UI helpers per mode -------------------- */
  const showUrlField = mode === "YouTube" || mode === "Music" || mode === "News" || mode === "Link";
  const showFileField = mode === "Media" || mode === "Doc" || mode === "Pay";

  const fileAccept =
    mode === "Media"
      ? "image/*,video/*"
      : mode === "Pay"
        ? "image/*"
        : // Doc
          ".pdf,.doc,.docx,.txt,.rtf,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown";

  return (
    <div className="inner-tile drop-tile">
      <div className="tile-head">
        <div>
          <div className="tile-title">Board Drop</div>
          <div className="tile-sub">Place media, pay, docs, and links into your space.</div>
          <div className="tile-sub tiny">
            Buckets: <b>{BUCKET_MEDIA}</b> + <b>{BUCKET_DOCS}</b>
          </div>
        </div>
      </div>

      {/* Mode buttons */}
      <div className="mode-row" role="tablist" aria-label="Drop type">
        {(["YouTube", "Music", "News", "Link", "Media", "Pay", "Doc"] as DropType[]).map((m) => (
          <button
            key={m}
            type="button"
            className={`mode-btn ${mode === m ? "on" : ""}`}
            onClick={() => {
              setMode(m);
              setMsg(null);

              // clear irrelevant fields
              if (m === "Media" || m === "Doc" || m === "Pay") setUrl("");
              if (m === "YouTube" || m === "Music" || m === "News" || m === "Link") setFile(null);

              if (m !== "Pay") {
                setPayPrice("");
                setPayDesc("");
                setPayLink("");
              }
              if (m !== "Doc") setDocDesc("");
            }}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="drop-form">
        {/* Title: always just "Title" */}
        <input className="drop-input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />

        {mode === "Pay" ? (
          <>
            <label className="file-line">
              <input
                className="file-input"
                type="file"
                accept={fileAccept}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <span className="file-meta">
                {file ? (
                  <>
                    <span className="file-name">{file.name}</span>
                    <span className="file-size">{Math.round(file.size / 1024)} KB</span>
                  </>
                ) : (
                  <span className="file-name dim">Pay upload (image)</span>
                )}
              </span>
            </label>

            <input
              className="drop-input"
              placeholder="Price (ex: 19.99)"
              value={payPrice}
              onChange={(e) => setPayPrice(e.target.value)}
              inputMode="decimal"
            />

            <textarea
              className="drop-textarea"
              placeholder="Description (optional)"
              value={payDesc}
              onChange={(e) => setPayDesc(e.target.value)}
              rows={3}
            />

            <input
              className="drop-input"
              placeholder="Link (optional)"
              value={payLink}
              onChange={(e) => setPayLink(e.target.value)}
            />
          </>
        ) : mode === "Doc" ? (
          <>
            <label className="file-line">
              <input
                className="file-input"
                type="file"
                accept={fileAccept}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <span className="file-meta">
                {file ? (
                  <>
                    <span className="file-name">{file.name}</span>
                    <span className="file-size">{Math.round(file.size / 1024)} KB</span>
                  </>
                ) : (
                  <span className="file-name dim">Upload doc (PDF/DOC/TXT/MD)</span>
                )}
              </span>
            </label>

            <textarea
              className="drop-textarea"
              placeholder="Notes (optional) – logline, context, etc."
              value={docDesc}
              onChange={(e) => setDocDesc(e.target.value)}
              rows={3}
            />
          </>
        ) : mode === "Media" ? (
          <label className="file-line">
            <input
              className="file-input"
              type="file"
              accept={fileAccept}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <span className="file-meta">
              {file ? (
                <>
                  <span className="file-name">{file.name}</span>
                  <span className="file-size">{Math.round(file.size / 1024)} KB</span>
                </>
              ) : (
                <span className="file-name dim">Choose photo or video</span>
              )}
            </span>
          </label>
        ) : showUrlField ? (
          <input
            className="drop-input"
            placeholder={
              mode === "Link"
                ? "Paste a link"
                : mode === "News"
                  ? "Paste a news/article/magazine link"
                  : mode === "Music"
                    ? "Paste Spotify / SoundCloud / YouTube"
                    : "Paste YouTube link"
            }
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        ) : null}

        <button className="drop-add" onClick={addDrop}>
          ADD A DROP
        </button>

        {msg ? <div className="drop-msg">{msg}</div> : <div className="drop-hint">{hint}</div>}
      </div>

      <div className="drop-list">
        {drops.length === 0 ? (
          <div className="drop-empty">
            <div className="drop-empty-title">No Drops yet</div>
            <div className="drop-empty-sub">Choose a mode, then add a Drop. Embeds and uploads show instantly.</div>
          </div>
        ) : (
          drops.map((d) => {
            const isMedia = d.type === "Media";
            const isDoc = d.type === "Doc";
            const isPay = d.type === "Pay";
            const isNews = d.type === "News";
            const isLinky = d.type === "Link";

            const canEmbed = !!d.embedUrl;
            const kind: EmbedKind = d.embedUrl ? embedKindFromUrl(d.embedUrl) : "generic";

            const fav = d.url ? faviconUrl(d.url) : null;
            const cover = d.url ? newsCoverUrl(d.url) : null;

            const signedKey = d.bucket && d.storagePath ? `${d.bucket}:${d.storagePath}` : "";
            const signedUrl = signedKey ? signedUrlByKey[signedKey] : undefined;

            return (
              <div key={d.id} className="drop-item">
                {/* Title at the top */}
                <div className="drop-titleTop">{d.title}</div>

                <div className="drop-metaRow">
                  <div className="drop-badges">
                    <span className="badge">{d.type.toUpperCase()}</span>
                    {d.hostLabel ? <span className="badge ghost">{d.hostLabel}</span> : null}
                    {isPay && d.priceCents ? (
                      <span className="badge ghost">{formatPriceFromCents(d.priceCents)}</span>
                    ) : null}
                    {d.fileName ? <span className="badge ghost">{d.fileName}</span> : null}
                  </div>

                  <div className="drop-actions">
                    {/* Link open */}
                    {d.url ? (
                      <a className="drop-open" href={d.url} target="_blank" rel="noreferrer">
                        OPEN
                      </a>
                    ) : null}

                    {/* Pay optional link */}
                    {isPay && d.linkUrl ? (
                      <a className="drop-mini" href={d.linkUrl} target="_blank" rel="noreferrer">
                        Link →
                      </a>
                    ) : null}

                    {/* Doc open (signed url) */}
                    {isDoc && signedUrl ? (
                      <a className="drop-mini" href={signedUrl} target="_blank" rel="noreferrer">
                        OPEN DOC →
                      </a>
                    ) : null}

                    {/* Media / Pay expand */}
                    {isMedia || isPay ? (
                      <button className="drop-mini" onClick={() => openViewer(d.id)}>
                        EXPAND
                      </button>
                    ) : null}

                    {!isMedia && !canEmbed && isLinky && d.url ? (
                      <a className="drop-mini" href={d.url} target="_blank" rel="noreferrer">
                        Open →
                      </a>
                    ) : null}

                    <button className="drop-mini" onClick={() => void removeDrop(d.id)}>
                      Remove
                    </button>
                  </div>
                </div>

                {/* Content */}
                {isMedia || isPay ? (
                  <button
                    className="media-thumb"
                    type="button"
                    onClick={() => openViewer(d.id)}
                    aria-label="Expand media drop"
                  >
                    {signedUrl ? (
                      d.mediaKind === "video" ? (
                        <video src={signedUrl} muted playsInline preload="metadata" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={signedUrl} alt={d.title} />
                      )
                    ) : (
                      <div className="media-missing">
                        <div className="media-missing-title">Media not available</div>
                        <div className="media-missing-sub">
                          If this just uploaded, refresh once. If it persists, check Storage policies.
                        </div>
                      </div>
                    )}
                  </button>
                ) : canEmbed ? (
                  <div className={`embed-shell ${kind}`}>
                    <iframe
                      src={d.embedUrl!}
                      title={d.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      loading="lazy"
                      referrerPolicy="strict-origin-when-cross-origin"
                    />
                  </div>
                ) : isNews && d.url ? (
                  <a className="newsCover" href={d.url} target="_blank" rel="noreferrer">
                    <div className="newsTopBar">
                      <span className="newsPill">NEWS DROP</span>
                      <span className="newsSource">
                        {fav ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img className="newsFav" src={fav} alt="" />
                        ) : null}
                        <span className="newsHost">{d.hostLabel ?? "ARTICLE"}</span>
                      </span>
                    </div>

                    <div className="newsArt">
                      {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          className="newsImg"
                          src={cover}
                          alt=""
                          loading="lazy"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : null}

                      <div className="newsOverlay" />
                      <div className="newsHeadline">
                        <div className="newsHeadlineLabel">COVER STORY</div>
                        {/* ✅ headline wins, title fallback */}
                        <div className="newsHeadlineText">{d.headline ?? d.title}</div>
                      </div>
                    </div>

                    <div className="newsFooter">
                      <span className="newsUrl">{d.url}</span>
                      <span className="newsOpen">OPEN →</span>
                    </div>
                  </a>
                ) : isDoc ? (
                  <div className="doc-card">
                    <div className="doc-row">
                      <div className="doc-left">
                        <div className="doc-name">{d.fileName ?? "Document"}</div>
                        <div className="doc-meta">
                          {d.fileSize ? `${Math.round(d.fileSize / 1024)} KB` : null}
                          {d.mime ? ` • ${d.mime}` : null}
                        </div>
                      </div>
                      {signedUrl ? (
                        <a className="doc-open" href={signedUrl} target="_blank" rel="noreferrer">
                          OPEN →
                        </a>
                      ) : (
                        <span className="doc-wait">Preparing…</span>
                      )}
                    </div>

                    {d.description ? <div className="doc-desc">{d.description}</div> : null}
                  </div>
                ) : d.url ? (
                  <div className="link-card">
                    <div className="link-row">
                      <div className="link-host">{d.hostLabel ?? "LINK"}</div>
                      <a className="link-open" href={d.url} target="_blank" rel="noreferrer">
                        OPEN ORIGINAL →
                      </a>
                    </div>
                    <div className="link-url">{d.url}</div>
                  </div>
                ) : null}

                {isPay && d.description ? <div className="pay-desc">{d.description}</div> : null}
              </div>
            );
          })
        )}
      </div>

      {/* Viewer overlay for Media + Pay */}
      {viewerOpen && viewerDrop && (viewerDrop.type === "Media" || viewerDrop.type === "Pay") ? (
        <div
          className="viewerOverlay"
          role="dialog"
          aria-label="Media viewer"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeViewer();
          }}
        >
          <div className="viewerPanel">
            <div className="viewerTop">
              <div className="viewerTitle">
                {viewerDrop.title}
                {viewerDrop.type === "Pay" && viewerDrop.priceCents ? (
                  <span className="viewerPrice">{formatPriceFromCents(viewerDrop.priceCents)}</span>
                ) : null}
              </div>
              <button className="viewerClose" type="button" onClick={closeViewer} aria-label="Close">
                ✕
              </button>
            </div>

            <div className="viewerBody">
              {viewerDrop.bucket && viewerDrop.storagePath ? (
                viewerSignedUrl || signedUrlByKey[viewerSignedKey] ? (
                  viewerDrop.mediaKind === "video" ? (
                    <video src={(viewerSignedUrl || signedUrlByKey[viewerSignedKey])!} controls autoPlay playsInline />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={(viewerSignedUrl || signedUrlByKey[viewerSignedKey])!} alt={viewerDrop.title} />
                  )
                ) : (
                  <div className="media-missing big">
                    <div className="media-missing-title">Preparing preview…</div>
                    <div className="media-missing-sub">If it doesn’t load after a refresh, check Storage policies.</div>
                  </div>
                )
              ) : (
                <div className="media-missing big">
                  <div className="media-missing-title">Media not available</div>
                  <div className="media-missing-sub">Missing storage reference.</div>
                </div>
              )}
            </div>

            <div className="viewerHint">Press ESC to exit.</div>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .mode-row {
          margin-top: 12px;
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .mode-btn {
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: rgba(255, 255, 255, 0.7);
          color: rgba(0, 0, 0, 0.62);
          cursor: pointer;
        }
        .mode-btn.on {
          background: rgba(0, 0, 0, 0.86);
          color: rgba(200, 255, 230, 0.95);
          border-color: rgba(0, 0, 0, 0.18);
        }

        .drop-form {
          margin-top: 12px;
          display: grid;
          gap: 10px;
        }

        .drop-input {
          width: 100%;
          border-radius: 16px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: rgba(255, 255, 255, 0.72);
          padding: 12px 14px;
          outline: none;
        }

        .drop-textarea {
          width: 100%;
          border-radius: 16px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: rgba(255, 255, 255, 0.72);
          padding: 12px 14px;
          outline: none;
          resize: vertical;
        }

        .file-line {
          display: grid;
          gap: 8px;
        }
        .file-input {
          width: 100%;
        }
        .file-meta {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }
        .file-name {
          font-weight: 900;
          color: rgba(0, 0, 0, 0.68);
        }
        .file-name.dim {
          color: rgba(0, 0, 0, 0.45);
        }
        .file-size {
          font-size: 12px;
          color: rgba(0, 0, 0, 0.5);
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .drop-add {
          border-radius: 16px;
          padding: 12px 14px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          border: 1px solid rgba(0, 0, 0, 0.16);
          background: rgba(0, 0, 0, 0.86);
          color: rgba(200, 255, 230, 0.95);
          cursor: pointer;
          transition: transform 160ms ease, filter 160ms ease;
        }
        .drop-add:hover {
          transform: translateY(-1px);
          filter: brightness(1.02);
        }

        .drop-msg {
          margin-top: 2px;
          font-size: 13px;
          color: rgba(0, 0, 0, 0.65);
          font-weight: 700;
        }
        .drop-hint {
          margin-top: 2px;
          font-size: 13px;
          color: rgba(0, 0, 0, 0.52);
        }

        .drop-list {
          margin-top: 14px;
          display: grid;
          gap: 12px;
        }

        .drop-empty {
          border-radius: 18px;
          border: 1px dashed rgba(0, 0, 0, 0.18);
          background: rgba(255, 255, 255, 0.62);
          padding: 14px;
        }
        .drop-empty-title {
          font-weight: 900;
          color: rgba(0, 0, 0, 0.68);
        }
        .drop-empty-sub {
          margin-top: 6px;
          font-size: 13px;
          color: rgba(0, 0, 0, 0.58);
        }

        .drop-item {
          border-radius: 18px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(255, 255, 255, 0.68);
          padding: 12px 14px;
          display: grid;
          gap: 10px;
        }

        .drop-titleTop {
          font-weight: 950;
          color: rgba(0, 160, 80, 1);
          letter-spacing: 0.02em;
        }

        .drop-metaRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }

        .drop-actions {
          display: inline-flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .drop-open {
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(255, 0, 190, 0.85);
          text-decoration: underline;
          text-underline-offset: 4px;
        }

        .drop-mini {
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 800;
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: rgba(255, 255, 255, 0.7);
          color: rgba(0, 0, 0, 0.65);
          cursor: pointer;
          text-decoration: none;
        }

        .drop-badges {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .badge {
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.72);
          border: 1px solid rgba(0, 0, 0, 0.12);
          color: rgba(0, 0, 0, 0.65);
        }
        .badge.ghost {
          background: rgba(255, 255, 255, 0.52);
          color: rgba(0, 0, 0, 0.52);
        }

        /* ✅ Embeds */
        .embed-shell {
          border-radius: 18px;
          overflow: hidden;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(255, 255, 255, 0.6);
        }
        .embed-shell iframe {
          width: 100%;
          border: 0;
          display: block;
        }

        /* ✅ Spotify back to 0.90 scale */
        .embed-shell.spotify_track,
        .embed-shell.spotify_large {
          transform: scale(0.9);
          transform-origin: top left;
          width: calc(100% / 0.9);
        }

        .embed-shell.spotify_track iframe {
          height: 152px;
        }
        .embed-shell.spotify_large iframe {
          height: 352px;
        }
        .embed-shell.soundcloud iframe {
          height: 300px;
        }
        .embed-shell.youtube iframe {
          height: 220px;
        }
        .embed-shell.generic iframe {
          height: 220px;
        }

        @media (max-width: 640px) {
          .embed-shell.spotify_large iframe {
            height: 320px;
          }
          .embed-shell.youtube iframe {
            height: 200px;
          }
          .embed-shell.soundcloud iframe {
            height: 260px;
          }
        }

        /* -------------------- NEWS: Magazine Cover Card -------------------- */
        .newsCover {
          display: block;
          border-radius: 18px;
          overflow: hidden;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(0, 0, 0, 0.82);
          text-decoration: none;
          color: white;
          transition: transform 160ms ease, filter 160ms ease;
        }
        .newsCover:hover {
          transform: translateY(-1px);
          filter: brightness(1.02);
        }

        .newsTopBar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.08);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .newsPill {
          display: inline-flex;
          align-items: center;
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          background: rgba(255, 0, 190, 0.22);
          border: 1px solid rgba(255, 0, 190, 0.3);
          color: rgba(255, 255, 255, 0.92);
          white-space: nowrap;
        }
        .newsSource {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.86);
          white-space: nowrap;
          max-width: 58%;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .newsFav {
          width: 16px;
          height: 16px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.18);
        }
        .newsHost {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .newsArt {
          position: relative;
          aspect-ratio: 16 / 9;
          background: radial-gradient(1200px 420px at 15% 15%, rgba(255, 0, 190, 0.22), transparent 60%),
            radial-gradient(900px 420px at 80% 45%, rgba(0, 255, 150, 0.18), transparent 62%),
            linear-gradient(135deg, rgba(0, 0, 0, 0.92), rgba(0, 0, 0, 0.7));
          overflow: hidden;
        }

        .newsImg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          opacity: 0.88;
        }

        .newsOverlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(0, 0, 0, 0.25), rgba(0, 0, 0, 0.78));
        }

        .newsHeadline {
          position: absolute;
          left: 12px;
          right: 12px;
          bottom: 12px;
          display: grid;
          gap: 6px;
        }
        .newsHeadlineLabel {
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.8);
        }
        .newsHeadlineText {
          font-size: 18px;
          line-height: 1.1;
          font-weight: 950;
          letter-spacing: 0.01em;
          color: rgba(255, 255, 255, 0.95);
          text-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .newsFooter {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.06);
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }
        .newsUrl {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.7);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 72%;
        }
        .newsOpen {
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(200, 255, 230, 0.92);
          white-space: nowrap;
        }

        @media (max-width: 640px) {
          .newsHeadlineText {
            font-size: 16px;
          }
        }

        /* -------------------- Media thumbs + viewer -------------------- */
        .media-thumb {
          border: 0;
          padding: 0;
          background: transparent;
          cursor: pointer;
          border-radius: 18px;
          overflow: hidden;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(255, 255, 255, 0.6);
        }
        .media-thumb img,
        .media-thumb video {
          width: 100%;
          display: block;
          object-fit: cover;
          max-height: 280px;
        }
        .media-thumb video {
          background: #000;
        }

        .media-missing {
          border-radius: 18px;
          border: 1px dashed rgba(0, 0, 0, 0.18);
          background: rgba(255, 255, 255, 0.62);
          padding: 14px;
          text-align: left;
        }
        .media-missing.big {
          width: 100%;
          height: 360px;
          display: grid;
          place-items: center;
          text-align: center;
        }
        .media-missing-title {
          font-weight: 950;
          color: rgba(0, 0, 0, 0.68);
        }
        .media-missing-sub {
          margin-top: 6px;
          font-size: 13px;
          color: rgba(0, 0, 0, 0.56);
        }

        .viewerOverlay {
          position: fixed;
          inset: 0;
          z-index: 80;
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(6px);
          display: grid;
          place-items: center;
          padding: 18px;
        }
        .viewerPanel {
          width: min(980px, 100%);
          border-radius: 24px;
          background: rgba(255, 242, 166, 0.96);
          border: 1px solid rgba(0, 0, 0, 0.18);
          box-shadow: 0 30px 120px rgba(0, 0, 0, 0.35);
          overflow: hidden;
          display: grid;
          grid-template-rows: auto 1fr auto;
        }
        .viewerTop {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 14px;
          background: rgba(255, 255, 255, 0.55);
          border-bottom: 1px solid rgba(0, 0, 0, 0.1);
        }
        .viewerTitle {
          font-weight: 950;
          color: rgba(0, 0, 0, 0.72);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 78%;
          display: inline-flex;
          align-items: center;
          gap: 10px;
        }
        .viewerPrice {
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: rgba(255, 255, 255, 0.65);
          color: rgba(0, 0, 0, 0.62);
        }
        .viewerClose {
          height: 38px;
          width: 38px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.14);
          background: rgba(255, 255, 255, 0.78);
          cursor: pointer;
          font-weight: 900;
        }
        .viewerBody {
          padding: 14px;
          display: grid;
          place-items: center;
          background: rgba(255, 255, 255, 0.32);
        }
        .viewerBody img,
        .viewerBody video {
          width: 100%;
          max-height: 70vh;
          border-radius: 18px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: #000;
          object-fit: contain;
        }
        .viewerHint {
          padding: 10px 14px 14px 14px;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(0, 0, 0, 0.55);
        }

        /* Doc card */
        .doc-card {
          border-radius: 18px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(255, 255, 255, 0.62);
          padding: 12px 14px;
          display: grid;
          gap: 10px;
        }
        .doc-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        .doc-name {
          font-weight: 950;
          color: rgba(0, 0, 0, 0.7);
        }
        .doc-meta {
          margin-top: 4px;
          font-size: 12px;
          color: rgba(0, 0, 0, 0.55);
          font-weight: 800;
          letter-spacing: 0.06em;
        }
        .doc-open {
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255, 0, 190, 0.85);
          text-decoration: underline;
          text-underline-offset: 4px;
        }
        .doc-wait {
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(0, 0, 0, 0.5);
        }
        .doc-desc {
          font-size: 13px;
          color: rgba(0, 0, 0, 0.6);
          line-height: 1.4;
          overflow-wrap: anywhere;
        }

        /* Pay description */
        .pay-desc {
          font-size: 13px;
          color: rgba(0, 0, 0, 0.6);
          line-height: 1.4;
          overflow-wrap: anywhere;
        }

        /* Link fallback */
        .link-card {
          border-radius: 18px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(255, 255, 255, 0.62);
          padding: 12px 14px;
          display: grid;
          gap: 8px;
        }
        .link-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        .link-host {
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(0, 0, 0, 0.62);
        }
        .link-open {
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255, 0, 190, 0.85);
          text-decoration: underline;
          text-underline-offset: 4px;
        }
        .link-url {
          font-size: 13px;
          color: rgba(0, 0, 0, 0.58);
          overflow-wrap: anywhere;
        }

        .tile-sub.tiny {
          margin-top: 6px;
          font-size: 12px;
          opacity: 0.75;
        }
      `}</style>
    </div>
  );
}
