"use client";

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import WorkCallsList, { type WorkCallItem } from "@/app/components/board/WorkCallsList";

type DropRoute = "board" | "assets" | "projects" | "portfolio" | "workcalls";
type ScreenMode = "menu" | "screen";

export type DropBubble = {
  id: string;
  label: string;
  route: DropRoute;
  emoji?: string;
};

type AssetKind = "media" | "music" | "youtube" | "link" | "doc" | "note";

type AssetItem = {
  id: string;
  kind: AssetKind;
  title: string;
  description?: string;
  createdAt: number;

  payload?: {
    mediaUrl?: string;
    mediaType?: "image";

    embedUrl?: string;

    url?: string;

    text?: string;
  };
};

type WorkCallType = "casting" | "crew" | "gigs" | "collaborations";

type WorkCallDraft = {
  open: boolean;
  type: WorkCallType;
  title: string;
  preview: string;
  error?: string | null;
};

const ASSETS_STORAGE_KEY = "jab_drop_pad_assets_v4";
const WORK_CALLS_STORAGE_KEY = "jab_work_calls_v1";

/* -------------------------------------------------------------------------- */
/* helpers                                                                    */
/* -------------------------------------------------------------------------- */

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type BubbleLayout = {
  id: string;
  x: number;
  y: number;
  size: number;
  delay: number;
  dur: number;
};

function buildNonOverlappingLayout(opts: {
  ids: string[];
  seed: number;
  count: number;

  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;

  sizeMin: number;
  sizeMax: number;

  approxW: number;
  approxH: number;

  paddingPx: number;
  attemptsPer: number;
}): BubbleLayout[] {
  const rng = mulberry32(opts.seed);
  const placed: BubbleLayout[] = [];

  for (let i = 0; i < opts.count; i++) {
    const id = opts.ids[i];
    const size = opts.sizeMin + rng() * (opts.sizeMax - opts.sizeMin);
    const r = size / 2;

    let best: BubbleLayout | null = null;
    let bestScore = -Infinity;

    for (let a = 0; a < opts.attemptsPer; a++) {
      const x = opts.xMin + rng() * (opts.xMax - opts.xMin);
      const y = opts.yMin + rng() * (opts.yMax - opts.yMin);

      const cx = (x / 100) * opts.approxW;
      const cy = (y / 100) * opts.approxH;

      let ok = true;
      for (const p of placed) {
        const pr = p.size / 2;
        const px = (p.x / 100) * opts.approxW;
        const py = (p.y / 100) * opts.approxH;
        const dist = Math.hypot(cx - px, cy - py);
        if (dist < r + pr + opts.paddingPx) {
          ok = false;
          break;
        }
      }

      let score = 0;
      for (const p of placed) {
        const pr = p.size / 2;
        const px = (p.x / 100) * opts.approxW;
        const py = (p.y / 100) * opts.approxH;
        const dist = Math.hypot(cx - px, cy - py);
        score += dist - (r + pr);
      }

      const candidate: BubbleLayout = {
        id,
        x: clamp(x, opts.xMin, opts.xMax),
        y: clamp(y, opts.yMin, opts.yMax),
        size,
        delay: rng() * 2.0,
        dur: 4.6 + rng() * 4.8,
      };

      if (ok) {
        best = candidate;
        break;
      }
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    if (best) placed.push(best);
  }

  return placed;
}

function useReducedMotion() {
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

function RouteTitle(route: DropRoute) {
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
    default:
      return "Drop Pad";
  }
}

function kindLabel(kind: AssetKind) {
  switch (kind) {
    case "media":
      return "Media Drop";
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

function kindEmoji(kind: AssetKind) {
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

function safeHostname(url?: string) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function readAssetsFromStorage(): AssetItem[] {
  try {
    const raw = localStorage.getItem(ASSETS_STORAGE_KEY);
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

function writeAssetsToStorage(items: AssetItem[]) {
  try {
    localStorage.setItem(ASSETS_STORAGE_KEY, JSON.stringify(items));
  } catch {}
}

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function readWorkCallsFromStorage(): WorkCallItem[] {
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

function writeWorkCallsToStorage(items: WorkCallItem[]) {
  try {
    localStorage.setItem(WORK_CALLS_STORAGE_KEY, JSON.stringify(items));
  } catch {}
}

/* -------------------------------------------------------------------------- */
/* URL + embed helpers                                                         */
/* -------------------------------------------------------------------------- */

function normalizeUrl(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

function parseYouTubeId(url: string) {
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

function buildYouTubeEmbed(rawUrl: string) {
  const url = normalizeUrl(rawUrl);
  if (!url) return { embedUrl: "" };
  const id = parseYouTubeId(url);
  if (!id) return { embedUrl: "" };
  return { embedUrl: `https://www.youtube.com/embed/${id}` };
}

function parseSpotify(url: string) {
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

function parseSoundCloud(url: string) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("soundcloud.com") && !u.hostname.includes("snd.sc")) return null;
    const embedUrl = `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}`;
    return { embedUrl, label: "SoundCloud" };
  } catch {
    return null;
  }
}

function buildMusicEmbed(rawUrl: string) {
  const url = normalizeUrl(rawUrl);
  if (!url) return { embedUrl: "", provider: "" };

  const sp = parseSpotify(url);
  if (sp) return { embedUrl: sp.embedUrl, provider: sp.label };

  const sc = parseSoundCloud(url);
  if (sc) return { embedUrl: sc.embedUrl, provider: sc.label };

  return { embedUrl: "", provider: "" };
}

/* -------------------------------------------------------------------------- */
/* Supabase wiring                                                             */
/* -------------------------------------------------------------------------- */

async function getAuthedUserId(sb: ReturnType<typeof supabaseBrowser>): Promise<string | null> {
  const { data, error } = await sb.auth.getUser();
  if (error) return null;
  return data?.user?.id ?? null;
}

async function fetchAssetsFromSupabase(sb: ReturnType<typeof supabaseBrowser>, userId: string) {
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

async function upsertAssetToSupabase(
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

async function deleteAllAssetsFromSupabase(sb: ReturnType<typeof supabaseBrowser>, userId: string) {
  const { error } = await sb.from("board_assets").delete().eq("user_id", userId);
  return { ok: !error };
}

async function uploadMediaToSupabaseStorage(
  sb: ReturnType<typeof supabaseBrowser>,
  userId: string,
  file: File
): Promise<{ ok: true; publicUrl: string } | { ok: false }> {
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${userId}/${Date.now()}_${safeName}`;

  const { error: upErr } = await sb.storage.from("board-media").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });

  if (upErr) return { ok: false };

  const { data } = sb.storage.from("board-media").getPublicUrl(path);
  const publicUrl = data?.publicUrl ?? "";
  if (!publicUrl) return { ok: false };

  return { ok: true, publicUrl };
}

/* -------------------------------------------------------------------------- */
/* UI tiles                                                                    */
/* -------------------------------------------------------------------------- */

function TileFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        "rounded-3xl border border-white/10 bg-black/20 overflow-hidden",
        "shadow-[0_12px_44px_rgba(0,0,0,0.35)]",
        className
      )}
    >
      {children}
    </div>
  );
}

function DropHeader({
  emoji,
  title,
  meta,
  description,
}: {
  emoji: string;
  title: string;
  meta?: string;
  description?: string;
}) {
  return (
    <div className="px-4 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-white/90 truncate">{title}</div>
          {meta ? <div className="mt-1 text-xs text-white/50 truncate">{meta}</div> : null}
        </div>
        <div className="text-xl shrink-0">{emoji}</div>
      </div>

      {description ? (
        <div className="mt-2 text-xs text-white/55 line-clamp-2">{description}</div>
      ) : null}
    </div>
  );
}

function MediaDropTile({ a }: { a: AssetItem }) {
  const url = a.payload?.mediaUrl;

  return (
    <TileFrame>
      <DropHeader
        emoji={kindEmoji("media")}
        title={a.title}
        meta="Image embed"
        description={a.description}
      />
      <div className="mt-3 px-4 pb-4">
        <div className="rounded-2xl overflow-hidden border border-white/10 bg-white/5">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={a.title} className="w-full h-44 object-cover" loading="lazy" />
          ) : (
            <div className="h-44 grid place-items-center text-sm text-white/50">No image</div>
          )}
        </div>
      </div>
    </TileFrame>
  );
}

function MusicDropTile({ a }: { a: AssetItem }) {
  const embedUrl = a.payload?.embedUrl;
  return (
    <TileFrame>
      <DropHeader
        emoji={kindEmoji("music")}
        title={a.title}
        meta={embedUrl ? "Embedded player" : "No embed"}
        description={a.description}
      />
      <div className="mt-3 px-4 pb-4">
        <div className="rounded-2xl overflow-hidden border border-white/10 bg-black/30">
          {embedUrl ? (
            <iframe
              title={a.title}
              src={embedUrl}
              className="w-full h-44"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
            />
          ) : (
            <div className="h-44 grid place-items-center text-sm text-white/50">
              Unsupported music link
            </div>
          )}
        </div>
      </div>
    </TileFrame>
  );
}

function YouTubeDropTile({ a }: { a: AssetItem }) {
  const embedUrl = a.payload?.embedUrl;
  return (
    <TileFrame>
      <DropHeader
        emoji={kindEmoji("youtube")}
        title={a.title}
        meta={embedUrl ? "YouTube embed" : "No embed"}
        description={a.description}
      />
      <div className="mt-3 px-4 pb-4">
        <div className="rounded-2xl overflow-hidden border border-white/10 bg-black/30">
          {embedUrl ? (
            <iframe
              title={a.title}
              src={embedUrl}
              className="w-full h-44"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              loading="lazy"
            />
          ) : (
            <div className="h-44 grid place-items-center text-sm text-white/50">
              Invalid YouTube link
            </div>
          )}
        </div>
      </div>
    </TileFrame>
  );
}

function LinkDropTile({ a }: { a: AssetItem }) {
  const url = a.payload?.url;
  const host = safeHostname(url);
  return (
    <TileFrame>
      <DropHeader
        emoji={kindEmoji("link")}
        title={a.title}
        meta={host ? host : "Link"}
        description={a.description}
      />
      <div className="mt-3 px-4 pb-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs tracking-[0.25em] text-white/45">LINK PREVIEW</div>
          <div className="mt-2 text-sm text-white/80 break-words">{url ?? "No URL"}</div>
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex mt-3 text-sm text-lime-200/80 hover:text-lime-200 transition"
            >
              Open →
            </a>
          ) : null}
        </div>
      </div>
    </TileFrame>
  );
}

function DocDropTile({ a }: { a: AssetItem }) {
  const url = a.payload?.url;
  const host = safeHostname(url);

  return (
    <TileFrame>
      <DropHeader
        emoji={kindEmoji("doc")}
        title={a.title}
        meta={host ? `Doc link • ${host}` : "Doc link"}
        description={a.description}
      />
      <div className="mt-3 px-4 pb-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs tracking-[0.25em] text-white/45">DOC DROP</div>
          <div className="mt-2 text-sm text-white/80 break-words">{url ?? "No URL"}</div>
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex mt-3 text-sm text-lime-200/80 hover:text-lime-200 transition"
            >
              Open Doc →
            </a>
          ) : null}
          <div className="mt-3 text-xs text-white/45">(Next: embed previews + PDF thumbs.)</div>
        </div>
      </div>
    </TileFrame>
  );
}

function NoteDropTile({ a }: { a: AssetItem }) {
  const text = a.payload?.text ?? "";
  return (
    <TileFrame>
      <DropHeader
        emoji={kindEmoji("note")}
        title={a.title}
        meta="Text note"
        description={a.description}
      />
      <div className="mt-3 px-4 pb-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-white/80 whitespace-pre-wrap">{text || "No note"}</div>
        </div>
      </div>
    </TileFrame>
  );
}

function EmbeddedAssetTile({ a }: { a: AssetItem }) {
  switch (a.kind) {
    case "media":
      return <MediaDropTile a={a} />;
    case "music":
      return <MusicDropTile a={a} />;
    case "youtube":
      return <YouTubeDropTile a={a} />;
    case "link":
      return <LinkDropTile a={a} />;
    case "doc":
      return <DocDropTile a={a} />;
    case "note":
      return <NoteDropTile a={a} />;
    default:
      return <NoteDropTile a={a} />;
  }
}

/* -------------------------------------------------------------------------- */
/* Modal state                                                                 */
/* -------------------------------------------------------------------------- */

type InputModalState =
  | { open: false }
  | {
      open: true;
      kind: AssetKind;
      title: string;
      description: string;

      url?: string;
      text?: string;
      providerHint?: string;
      file?: File | null;

      error?: string | null;
      busy?: boolean;
    };

function ScreenShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="w-full p-5 sm:p-6 relative">
      <div className="text-[11px] tracking-[0.35em] text-white/55">DROP PAD</div>
      <h3 className="mt-2 text-2xl font-semibold text-white/90">{title}</h3>
      {description ? <p className="mt-2 text-sm text-white/55 max-w-[64ch]">{description}</p> : null}
      <div className="mt-5">{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Screens                                                                    */
/* -------------------------------------------------------------------------- */

function BoardDropsScreen({ onBeginPlace }: { onBeginPlace: (kind: AssetKind) => void }) {
  const DROP_TYPES: Array<{ kind: AssetKind; title: string; desc: string; hint: string }> = [
    { kind: "media", title: "Media", desc: "Image embed", hint: "Upload an image" },
    { kind: "music", title: "Music", desc: "Spotify / SoundCloud", hint: "Paste a music link" },
    { kind: "youtube", title: "YouTube", desc: "YouTube video embed", hint: "Paste a YouTube link" },
    { kind: "doc", title: "Doc", desc: "Docs + PDFs + Notion links", hint: "Paste a doc link" },
    { kind: "link", title: "Link", desc: "Any URL", hint: "Paste a link" },
    { kind: "note", title: "Note", desc: "Text drop", hint: "Write something short" },
  ];

  const [selected, setSelected] = useState<AssetKind>("media");
  const active = DROP_TYPES.find((d) => d.kind === selected) ?? DROP_TYPES[0];

  return (
    <ScreenShell
      title="Board Drops"
      description="Select a Drop type, then place it into Assets as an embedded tile."
    >
      <div className="rounded-3xl border border-white/10 bg-black/25 shadow-[0_18px_60px_rgba(0,0,0,0.45)] overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs tracking-[0.35em] text-white/55">DROP CONSOLE</div>
              <div className="mt-2 text-lg font-semibold text-white/90 truncate">Choose your Drop</div>
              <div className="mt-1 text-sm text-white/55">Universal Drop categories (no Pay Drops).</div>
            </div>

            <div className="shrink-0 rounded-2xl border border-lime-300/20 bg-lime-400/10 px-3 py-2 text-xs text-lime-200/80">
              Live Menu
            </div>
          </div>

          <div className="mt-4 -mx-1 px-1 overflow-x-auto overflow-y-hidden">
            <div className="flex flex-nowrap gap-2 min-w-max pb-1">
              {DROP_TYPES.map((t) => {
                const isActive = t.kind === selected;
                return (
                  <button
                    key={t.kind}
                    type="button"
                    onClick={() => setSelected(t.kind)}
                    className={clsx(
                      "shrink-0 rounded-2xl px-4 py-2 text-sm transition border whitespace-nowrap",
                      isActive
                        ? "border-lime-300/30 bg-lime-400/15 text-lime-100/90 shadow-[0_0_22px_rgba(163,230,53,0.18)]"
                        : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                    )}
                  >
                    <span className="mr-2">{kindEmoji(t.kind)}</span>
                    {t.title}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-5">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-white/85">
                  {kindEmoji(active.kind)} {kindLabel(active.kind)}
                </div>
                <div className="mt-1 text-xs text-white/55">{active.desc}</div>
              </div>
              <div className="shrink-0 text-xs text-white/45">Embeds into Assets</div>
            </div>

            <div className="mt-3 rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="text-[11px] tracking-[0.30em] text-white/45">INPUT HINT</div>
              <div className="mt-2 text-sm text-white/75">{active.hint}</div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="text-xs text-white/45">Tap Place to open the Input Portal.</div>

            <button
              type="button"
              onClick={() => onBeginPlace(active.kind)}
              className={clsx(
                "rounded-2xl border border-lime-300/25 bg-lime-400/15 px-5 py-3",
                "text-sm text-lime-100/90 hover:bg-lime-400/20 transition",
                "shadow-[0_0_28px_rgba(163,230,53,0.18)]"
              )}
            >
              Place {active.title} Drop →
            </button>
          </div>
        </div>
      </div>
    </ScreenShell>
  );
}

function AssetsScreen({
  assets,
  onClear,
  syncing,
}: {
  assets: AssetItem[];
  onClear: () => void;
  syncing: boolean;
}) {
  return (
    <ScreenShell title="Assets" description="Your placed Drops live here as embedded tiles.">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-white/70">
          Total: <span className="text-white/90 font-medium">{assets.length}</span>
          {syncing ? <span className="ml-2 text-xs text-white/45">Syncing…</span> : null}
        </div>

        <button
          type="button"
          onClick={onClear}
          className="rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white/70 hover:bg-black/40 transition"
        >
          Clear Assets
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {assets.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm text-white/80">No embedded drops yet.</div>
            <div className="mt-1 text-xs text-white/45">Go to Board Drops and place your first one.</div>
          </div>
        ) : (
          assets
            .slice()
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((a) => <EmbeddedAssetTile key={a.id} a={a} />)
        )}
      </div>
    </ScreenShell>
  );
}

function ProjectsScreen() {
  return (
    <ScreenShell title="Projects" description="Project tiles, WIP boards, collaborations, and builds.">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="text-sm text-white/75">Placeholder. Next: project list with create button.</div>
      </div>
    </ScreenShell>
  );
}

function PortfolioScreen() {
  return (
    <ScreenShell title="Portfolio" description="Later you’ll pin Assets into Portfolio.">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="text-sm text-white/75">Placeholder. Next: portfolio sections + pinned drops.</div>
      </div>
    </ScreenShell>
  );
}

function WorkCallsScreen({
  workCalls,
  counts,
  onOpen,
  onCreate,
}: {
  workCalls: WorkCallItem[];
  counts: { casting: number; crew: number; gigs: number; collaborations: number };
  onOpen?: (id: string) => void;
  onCreate?: () => void;
}) {
  return (
    <ScreenShell
      title="Work Calls"
      description="Work Call Drops show up like an inbox. Each message is tagged by type."
    >
      <WorkCallsList items={workCalls} counts={counts} onOpen={onOpen} onCreate={onCreate} />
    </ScreenShell>
  );
}

/* -------------------------------------------------------------------------- */
/* V2 HANDLE                                                                   */
/* -------------------------------------------------------------------------- */

export type DropPadOSHandle = {
  powerOn: () => void;
  powerOff: () => void;
  togglePower: () => void;
  openRoute: (route: DropRoute) => void;
};

type DropPadOSProps = {
  className?: string;
  drops?: DropBubble[];
  onSelect?: (route: DropRoute) => void;
  initialOn?: boolean;
  title?: string;
  subtitle?: string;
};

/* -------------------------------------------------------------------------- */
/* DropPadOS V2                                                                */
/* -------------------------------------------------------------------------- */

const DropPadOSV2 = forwardRef<DropPadOSHandle, DropPadOSProps>(function DropPadOSV2(
  {
    className,
    drops,
    onSelect,
    initialOn = false,
    title = "DROP PAD OS",
    subtitle = "Work Desk",
  },
  ref
) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const reducedMotion = useReducedMotion();

  const [isOn, setIsOn] = useState(initialOn);
  const [activeRoute, setActiveRoute] = useState<DropRoute>("board");
  const [mode, setMode] = useState<ScreenMode>("menu");
  const [bootPhase, setBootPhase] = useState<"off" | "booting" | "ready" | "sleep">(
    initialOn ? "ready" : "off"
  );

  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [modal, setModal] = useState<InputModalState>({ open: false });

  // ✅ Work Calls
  const [workCalls, setWorkCalls] = useState<WorkCallItem[]>([]);
  const workCallCounts = useMemo(() => {
    const base = { casting: 0, crew: 0, gigs: 0, collaborations: 0 };
    for (const w of workCalls) {
      if (w.type === "casting") base.casting += 1;
      if (w.type === "crew") base.crew += 1;
      if (w.type === "gigs") base.gigs += 1;
      if (w.type === "collaborations") base.collaborations += 1;
    }
    return base;
  }, [workCalls]);

  // ✅ Work Call Composer
  const [wcDraft, setWcDraft] = useState<WorkCallDraft>({
    open: false,
    type: "casting",
    title: "",
    preview: "",
    error: null,
  });

  // ✅ Drop placement indicator
  const [dropPlacedPulse, setDropPlacedPulse] = useState(false);
  const [dropPlacedToast, setDropPlacedToast] = useState<{ show: boolean; text: string }>({
    show: false,
    text: "",
  });

  const pulseTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const triggerDropPlacedIndicator = (text: string) => {
    setDropPlacedPulse(true);
    setDropPlacedToast({ show: true, text });

    if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);

    pulseTimerRef.current = window.setTimeout(() => setDropPlacedPulse(false), 2500);
    toastTimerRef.current = window.setTimeout(() => setDropPlacedToast({ show: false, text: "" }), 2200);
  };

  const openWorkCallComposer = () => {
    setWcDraft({
      open: true,
      type: "casting",
      title: "",
      preview: "",
      error: null,
    });
  };

  const submitWorkCall = () => {
    const titleVal = wcDraft.title.trim();
    if (!titleVal) {
      setWcDraft((p) => ({ ...p, error: "Title is required." }));
      return;
    }

    const previewVal = wcDraft.preview.trim();

    const item: WorkCallItem = {
      id: uid(),
      type: wcDraft.type,
      title: titleVal,
      preview: previewVal || undefined,
      createdAt: Date.now(),
      unread: true,
    };

    setWorkCalls((prev) => [item, ...prev]);
    triggerDropPlacedIndicator("SYSTEM: Work Call posted");
    setWcDraft((p) => ({ ...p, open: false }));
  };

  // iPad-like extendable screen
  const [screenPx, setScreenPx] = useState<number>(680);
  const screenMinPx = 420;
  const screenMaxPxRef = useRef<number>(1100);

  const resizeDragRef = useRef<{ dragging: boolean; startY: number; startH: number } | null>(null);

  const DEFAULT_DROPS: DropBubble[] = useMemo(
    () => [
      { id: "d1", label: "Board Drops", route: "board", emoji: "🫧" },
      { id: "d2", label: "Assets", route: "assets", emoji: "🗂️" },
      { id: "d3", label: "Projects", route: "projects", emoji: "🧩" },
      { id: "d4", label: "Portfolio", route: "portfolio", emoji: "🎞️" },
      { id: "d5", label: "Work Calls", route: "workcalls", emoji: "📣" },
    ],
    []
  );

  const menuDrops = drops?.length ? drops : DEFAULT_DROPS;

  const bubbleLayout = useMemo(() => {
    const approxW = 900;
    const approxH = 520;
    const ids = menuDrops.map((d) => d.id);

    return buildNonOverlappingLayout({
      ids,
      seed: 1337,
      count: ids.length,
      xMin: 14,
      xMax: 86,
      yMin: 30,
      yMax: 86,
      sizeMin: 82,
      sizeMax: 132,
      approxW,
      approxH,
      paddingPx: 14,
      attemptsPer: 200,
    });
  }, [menuDrops]);

  // local cache first
  useEffect(() => {
    setAssets(readAssetsFromStorage());
    setWorkCalls(readWorkCallsFromStorage());
  }, []);

  // persist work calls locally (for now)
  useEffect(() => {
    writeWorkCallsToStorage(workCalls);
  }, [workCalls]);

  // auth + supabase sync
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const uid_ = await getAuthedUserId(sb);
      if (cancelled) return;
      setUserId(uid_);

      if (!uid_) return;

      setSyncing(true);
      const res = await fetchAssetsFromSupabase(sb, uid_);
      if (!cancelled) {
        if (res.ok) {
          setAssets(res.items);
          writeAssetsToStorage(res.items);
        }
        setSyncing(false);
      }
    };

    run();

    const { data: sub } = sb.auth.onAuthStateChange(async () => {
      const uid_ = await getAuthedUserId(sb);
      if (cancelled) return;
      setUserId(uid_);

      if (!uid_) return;

      setSyncing(true);
      const res = await fetchAssetsFromSupabase(sb, uid_);
      if (!cancelled) {
        if (res.ok) {
          setAssets(res.items);
          writeAssetsToStorage(res.items);
        }
        setSyncing(false);
      }
    });

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe?.();
    };
  }, [sb]);

  // compute max based on viewport
  useEffect(() => {
    const compute = () => {
      const max = Math.max(640, window.innerHeight - 180);
      screenMaxPxRef.current = max;
      setScreenPx((prev) => clamp(prev, screenMinPx, max));
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  // Esc closes modals
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (modal.open) setModal({ open: false });
        if (wcDraft.open) setWcDraft((p) => ({ ...p, open: false }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal.open, wcDraft.open]);

  const syncAssetsLocal = (next: AssetItem[]) => {
    setAssets(next);
    writeAssetsToStorage(next);
  };

  const powerOn = () => {
    if (isOn) return;
    setIsOn(true);
    setBootPhase("booting");
    setMode("menu");
    window.setTimeout(() => setBootPhase("ready"), 550);
  };

  const powerOff = () => {
    if (!isOn) return;
    setBootPhase("sleep");
    window.setTimeout(() => {
      setIsOn(false);
      setBootPhase("off");
      setMode("menu");
      setModal({ open: false });
      setWcDraft((p) => ({ ...p, open: false }));
    }, 250);
  };

  const togglePower = () => {
    if (!isOn) powerOn();
    else powerOff();
  };

  const openRoute = (route: DropRoute) => {
    setActiveRoute(route);
    setMode("screen");
    onSelect?.(route);
  };

  // ✅ expose handle to parent (WorkDesk can control DropPad)
  useImperativeHandle(
    ref,
    () => ({
      powerOn,
      powerOff,
      togglePower,
      openRoute: (route: DropRoute) => {
        // if device is off, power on first then open route after boot
        if (!isOn) {
          powerOn();
          window.setTimeout(() => openRoute(route), 620);
          return;
        }
        // if booting, wait a beat
        if (bootPhase === "booting") {
          window.setTimeout(() => openRoute(route), 520);
          return;
        }
        openRoute(route);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOn, bootPhase]
  );

  const jumpToAssets = () => {
    openRoute("assets");
  };

  const clearAssets = async () => {
    syncAssetsLocal([]);
    triggerDropPlacedIndicator("SYSTEM: Assets cleared");

    if (!userId) return;

    setSyncing(true);
    await deleteAllAssetsFromSupabase(sb, userId);
    setSyncing(false);
  };

  /* ----------------------------- placing drops ---------------------------- */

  const beginPlace = (kind: AssetKind) => {
    setModal({
      open: true,
      kind,
      title: "",
      description: "",
      url: "",
      text: "",
      file: null,
      providerHint:
        kind === "music"
          ? "Spotify or SoundCloud URL"
          : kind === "youtube"
          ? "YouTube URL (watch, shorts, or youtu.be)"
          : kind === "doc"
          ? "Google Doc / Notion / PDF / Drive link"
          : kind === "link"
          ? "Any URL"
          : kind === "note"
          ? "Note body"
          : "Upload image",
      error: null,
      busy: false,
    });
  };

  const placeAsset = async (asset: AssetItem) => {
    const next = [asset, ...assets];
    syncAssetsLocal(next);

    if (userId) {
      setSyncing(true);
      await upsertAssetToSupabase(sb, userId, asset);
      setSyncing(false);
    }

    triggerDropPlacedIndicator(`SYSTEM: ${kindLabel(asset.kind)} placed`);

    setModal({ open: false });
    jumpToAssets();
  };

  const submitModal = async () => {
    if (!modal.open) return;

    const kind = modal.kind;
    const now = Date.now();

    const titleVal = (modal.title ?? "").trim();
    if (!titleVal) {
      setModal({ ...modal, error: "Title is required." });
      return;
    }

    const descVal = (modal.description ?? "").trim();

    if (kind === "media") {
      const f = modal.file ?? null;
      if (!f) {
        setModal({ ...modal, error: "Choose an image first." });
        return;
      }
      if (!f.type.startsWith("image/")) {
        setModal({ ...modal, error: "Media Drop currently supports images only." });
        return;
      }

      setModal({ ...modal, busy: true, error: null });

      if (userId) {
        const uploaded = await uploadMediaToSupabaseStorage(sb, userId, f);
        if (!uploaded.ok) {
          setModal({
            ...modal,
            busy: false,
            error: "Upload failed. Check bucket + policies for board-media.",
          });
          return;
        }

        await placeAsset({
          id: uid(),
          kind,
          title: titleVal,
          description: descVal || undefined,
          createdAt: now,
          payload: { mediaType: "image", mediaUrl: uploaded.publicUrl },
        });
        return;
      }

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("read_error"));
        reader.readAsDataURL(f);
      }).catch(() => "");

      if (!dataUrl) {
        setModal({ ...modal, busy: false, error: "Couldn’t read that image." });
        return;
      }

      await placeAsset({
        id: uid(),
        kind,
        title: titleVal,
        description: descVal || undefined,
        createdAt: now,
        payload: { mediaType: "image", mediaUrl: dataUrl },
      });
      return;
    }

    if (kind === "music") {
      const raw = modal.url?.trim() ?? "";
      const url = normalizeUrl(raw);
      if (!url) {
        setModal({ ...modal, error: "Paste a music link first." });
        return;
      }
      const { embedUrl } = buildMusicEmbed(url);
      if (!embedUrl) {
        setModal({ ...modal, error: "Unsupported music link. Use Spotify or SoundCloud." });
        return;
      }

      await placeAsset({
        id: uid(),
        kind,
        title: titleVal,
        description: descVal || undefined,
        createdAt: now,
        payload: { embedUrl },
      });
      return;
    }

    if (kind === "youtube") {
      const raw = modal.url?.trim() ?? "";
      const url = normalizeUrl(raw);
      if (!url) {
        setModal({ ...modal, error: "Paste a YouTube link first." });
        return;
      }
      const { embedUrl } = buildYouTubeEmbed(url);
      if (!embedUrl) {
        setModal({ ...modal, error: "That doesn’t look like a valid YouTube link." });
        return;
      }

      await placeAsset({
        id: uid(),
        kind,
        title: titleVal,
        description: descVal || undefined,
        createdAt: now,
        payload: { embedUrl },
      });
      return;
    }

    if (kind === "doc" || kind === "link") {
      const raw = modal.url?.trim() ?? "";
      const url = normalizeUrl(raw);
      try {
        // eslint-disable-next-line no-new
        new URL(url);
      } catch {
        setModal({ ...modal, error: "That doesn’t look like a valid URL." });
        return;
      }

      await placeAsset({
        id: uid(),
        kind,
        title: titleVal,
        description: descVal || undefined,
        createdAt: now,
        payload: { url },
      });
      return;
    }

    if (kind === "note") {
      const text = (modal.text ?? "").trim();
      if (!text) {
        setModal({ ...modal, error: "Write your note first." });
        return;
      }

      await placeAsset({
        id: uid(),
        kind,
        title: titleVal,
        description: descVal || undefined,
        createdAt: now,
        payload: { text },
      });
      return;
    }
  };

  const renderScreen = () => {
    switch (activeRoute) {
      case "board":
        return <BoardDropsScreen onBeginPlace={beginPlace} />;
      case "assets":
        return <AssetsScreen assets={assets} onClear={clearAssets} syncing={syncing} />;
      case "projects":
        return <ProjectsScreen />;
      case "portfolio":
        return <PortfolioScreen />;
      case "workcalls":
        return (
          <WorkCallsScreen
            workCalls={workCalls}
            counts={workCallCounts}
            onCreate={openWorkCallComposer}
            onOpen={(id) => {
              setWorkCalls((prev) => prev.map((x) => (x.id === id ? { ...x, unread: false } : x)));
            }}
          />
        );
      default:
        return <BoardDropsScreen onBeginPlace={beginPlace} />;
    }
  };

  const onGrabberDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const max = screenMaxPxRef.current;
    resizeDragRef.current = { dragging: true, startY: e.clientY, startH: screenPx };
    (e.currentTarget as HTMLButtonElement).setPointerCapture?.(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      const ref2 = resizeDragRef.current;
      if (!ref2?.dragging) return;
      const dy = ev.clientY - ref2.startY;
      const next = clamp(ref2.startH - dy, screenMinPx, max);
      setScreenPx(next);
    };

    const onUp = () => {
      if (resizeDragRef.current) resizeDragRef.current.dragging = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  return (
    <section
      className={clsx(
        "relative w-full h-full rounded-3xl overflow-hidden",
        "border border-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]",
        "bg-gradient-to-b from-[#070913] via-[#050612] to-[#03040b]",
        className
      )}
      aria-label="Drop Pad OS"
    >
      {/* internal glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full blur-3xl opacity-20 bg-lime-400" />
        <div className="absolute bottom-[-180px] right-[-160px] h-[520px] w-[520px] rounded-full blur-3xl opacity-15 bg-cyan-300" />
        <div className="absolute top-[35%] left-[-220px] h-[520px] w-[520px] rounded-full blur-3xl opacity-10 bg-fuchsia-400" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-start justify-between p-5 sm:p-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] tracking-[0.38em] text-white/60">{title}</span>
            <span
              className={clsx(
                "text-[10px] px-2 py-1 rounded-full border",
                bootPhase === "ready"
                  ? "border-lime-400/30 text-lime-200/80 bg-lime-400/10"
                  : "border-white/10 text-white/60 bg-white/5"
              )}
            >
              {bootPhase === "off"
                ? "OFF"
                : bootPhase === "booting"
                ? "BOOT"
                : bootPhase === "sleep"
                ? "SLEEP"
                : "ON"}
            </span>

            {userId ? (
              <span className="text-[10px] px-2 py-1 rounded-full border border-white/10 bg-white/5 text-white/55">
                SUPABASE
              </span>
            ) : (
              <span className="text-[10px] px-2 py-1 rounded-full border border-white/10 bg-white/5 text-white/55">
                LOCAL
              </span>
            )}
          </div>

          <h2 className="mt-2 text-xl sm:text-2xl font-semibold text-white/90">{subtitle}</h2>

          <p className="mt-1 text-sm text-white/55 max-w-[62ch]">
            {isOn
              ? mode === "menu"
                ? "Select a bubble to open a screen."
                : "Board Drops places embedded tiles into Assets."
              : "Power on to summon the Drops menu."}
          </p>
        </div>

        {/* Power Button */}
        <button
          type="button"
          onClick={togglePower}
          className={clsx(
            "relative shrink-0",
            "h-11 w-11 rounded-2xl",
            "border border-lime-300/30",
            "bg-gradient-to-b from-lime-400/30 to-lime-400/10",
            "shadow-[0_0_24px_rgba(163,230,53,0.35)]",
            "active:scale-[0.98] transition"
          )}
          aria-label={isOn ? "Power off Drop Pad" : "Power on Drop Pad"}
          title={isOn ? "Power Off" : "Power On"}
        >
          <span className="absolute inset-0 rounded-2xl bg-lime-400/15 blur-md opacity-70" />
          <span className="relative z-10 grid h-full w-full place-items-center">
            <span className="h-4 w-4 rounded-full bg-lime-300 shadow-[0_0_18px_rgba(163,230,53,0.85)]" />
          </span>
        </button>
      </header>

      {/* Active route hint + placement pulse indicator */}
      <div className="relative z-10 px-5 sm:px-6">
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="text-sm text-white/70 flex items-center gap-2">
            Active: <span className="text-white/90 font-medium">{RouteTitle(activeRoute)}</span>
            {dropPlacedPulse ? (
              <span className="relative inline-flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-300 opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-lime-300" />
              </span>
            ) : null}
          </div>

          <div className="text-xs text-white/45">
            {isOn ? (mode === "menu" ? "Drops Menu" : `Embedded: ${assets.length}`) : "Offline"}
          </div>
        </div>
      </div>

      {/* Scrollable + extendable iPad screen */}
      <div className="relative z-10 mt-4 px-5 sm:px-6 pb-6">
        <div
          className={clsx(
            "relative w-full rounded-3xl border border-white/10 bg-white/[0.03]",
            "overflow-y-auto overflow-x-hidden"
          )}
          style={{ height: `${screenPx}px` }}
        >
          {/* scanlines */}
          <div className="absolute inset-0 opacity-[0.08] pointer-events-none">
            <div className="h-full w-full bg-[linear-gradient(to_bottom,rgba(255,255,255,0.10)_1px,transparent_1px)] bg-[length:100%_8px]" />
          </div>

          {!isOn && (
            <div className="grid place-items-center py-16">
              <div className="text-center px-8">
                <div className="text-white/60 text-sm tracking-widest">DROP PAD</div>
                <div className="mt-2 text-2xl font-semibold text-white/85">Standby</div>
                <div className="mt-2 text-sm text-white/50 max-w-[46ch] mx-auto">
                  Power on to open the holographic Drops menu.
                </div>
              </div>
            </div>
          )}

          {isOn && bootPhase === "booting" && (
            <div className="grid place-items-center py-16">
              <div className="rounded-3xl border border-lime-400/20 bg-black/40 px-6 py-5 backdrop-blur-sm">
                <div className="text-xs tracking-[0.35em] text-lime-200/70">INITIALIZING</div>
                <div className="mt-2 text-white/85 font-medium">Loading Drop Pad OS…</div>
                <div className="mt-3 h-2 w-64 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full w-2/3 bg-lime-300/60 rounded-full animate-pulse" />
                </div>
              </div>
            </div>
          )}

          {isOn && bootPhase === "ready" && (
            <div className="relative">
              <div className="sticky top-0 z-20 px-4 pt-4">
                <div className="flex items-center justify-between gap-3">
                  {mode === "screen" ? (
                    <button
                      type="button"
                      onClick={() => setMode("menu")}
                      className="rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white/80 hover:bg-black/40 transition"
                      aria-label="Back to Drops menu"
                      title="Back to Drops"
                    >
                      ← Back to Drops
                    </button>
                  ) : (
                    <div className="text-sm text-white/65">
                      Drops Menu <span className="text-white/40">(water-bubble UI)</span>
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <div className="hidden sm:block text-xs text-white/45">Screen</div>
                    <input
                      type="range"
                      min={screenMinPx}
                      max={screenMaxPxRef.current}
                      value={screenPx}
                      onChange={(e) => setScreenPx(Number(e.target.value))}
                      className="w-40 accent-lime-300"
                      aria-label="Drop Pad screen height"
                      title="Extend screen"
                    />
                    <div className="text-xs text-white/45 w-14 text-right">{screenPx}px</div>
                  </div>
                </div>
              </div>

              {mode === "menu" && (
                <div className="relative h-[560px] sm:h-[620px]">
                  {menuDrops.map((drop) => {
                    const l = bubbleLayout.find((b) => b.id === drop.id);
                    if (!l) return null;

                    return (
                      <button
                        key={drop.id}
                        type="button"
                        onClick={() => openRoute(drop.route)}
                        className={clsx(
                          "absolute rounded-full",
                          "border border-white/15",
                          "backdrop-blur-md",
                          "shadow-[0_10px_40px_rgba(0,0,0,0.35)]",
                          "transition active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-lime-300/40",
                          "hover:ring-2 hover:ring-white/10"
                        )}
                        style={{
                          left: `${l.x}%`,
                          top: `${l.y}%`,
                          width: `${l.size}px`,
                          height: `${l.size}px`,
                          transform: "translate(-50%, -50%)",
                          animation: reducedMotion
                            ? undefined
                            : `floaty ${l.dur}s ease-in-out ${l.delay}s infinite`,
                        }}
                        aria-label={`Open ${drop.label}`}
                        title={drop.label}
                      >
                        <span
                          className="absolute inset-0 rounded-full"
                          style={{
                            background:
                              "radial-gradient(circle at 30% 28%, rgba(255,255,255,0.30), rgba(255,255,255,0.07) 42%, rgba(163,230,53,0.10) 64%, rgba(34,211,238,0.08) 78%, rgba(217,70,239,0.06) 100%)",
                          }}
                        />
                        <span className="absolute left-[18%] top-[16%] h-[26%] w-[26%] rounded-full bg-white/20 blur-sm" />
                        <span className="absolute right-[14%] bottom-[12%] h-[18%] w-[18%] rounded-full bg-lime-300/15 blur-md" />

                        <span className="relative z-10 grid h-full w-full place-items-center px-3 text-center">
                          <span className="text-[18px] leading-none">{drop.emoji ?? "🫧"}</span>
                          <span className="mt-2 text-[11px] font-medium text-white/85 leading-tight">
                            {drop.label}
                          </span>
                        </span>
                      </button>
                    );
                  })}

                  <div className="absolute bottom-5 left-6 right-6 text-center text-xs text-white/40">
                    Tap a bubble to open a screen inside Drop Pad.
                  </div>
                </div>
              )}

              {mode === "screen" && <div className="pt-2">{renderScreen()}</div>}

              <div className="sticky bottom-0 z-30 px-4 pb-3 pt-2 bg-gradient-to-t from-black/35 to-transparent">
                <div className="flex items-center justify-center">
                  <button
                    type="button"
                    onPointerDown={onGrabberDown}
                    className={clsx(
                      "group w-28 h-7 rounded-full",
                      "border border-white/10 bg-black/25 backdrop-blur",
                      "shadow-[0_10px_30px_rgba(0,0,0,0.35)]",
                      "cursor-ns-resize"
                    )}
                    aria-label="Resize Drop Pad screen"
                    title="Drag to extend screen"
                  >
                    <span className="block mx-auto mt-[10px] h-[5px] w-12 rounded-full bg-white/20 group-hover:bg-lime-200/30 transition" />
                  </button>
                </div>

                <div className="mt-2 text-center text-[11px] text-white/35">
                  Drag handle to extend the screen
                </div>
              </div>

              {/* INPUT MODAL + WORK CALL MODAL + TOAST (unchanged from V1) */}
              {/* --- keep your exact modal code here --- */}
              {/* NOTE: For brevity, this V2 file expects you to keep the modals exactly as in your V1. */}
              {/* Paste your modal blocks below from V1 (modal.open, wcDraft.open, dropPlacedToast.show). */}

              {modal.open && (
                <div className="fixed inset-0 z-[999]">
                  <button
                    type="button"
                    onClick={() => setModal({ open: false })}
                    className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
                    aria-label="Close modal backdrop"
                  />
                  <div className="absolute left-1/2 top-1/2 w-[min(620px,92%)] -translate-x-1/2 -translate-y-1/2">
                    <div className="rounded-3xl border border-white/10 bg-[#070913]/90 shadow-[0_20px_90px_rgba(0,0,0,0.65)] overflow-hidden">
                      <div className="flex items-start justify-between gap-3 p-5">
                        <div className="min-w-0">
                          <div className="text-[11px] tracking-[0.35em] text-white/55">
                            INPUT PORTAL
                          </div>
                          <div className="mt-2 text-xl font-semibold text-white/90">
                            {kindEmoji(modal.kind)} {kindLabel(modal.kind)}
                          </div>
                          <div className="mt-1 text-sm text-white/55">
                            {modal.kind === "media" &&
                              "Upload an image to embed (Supabase storage)."}
                            {modal.kind === "music" && "Paste a Spotify or SoundCloud link."}
                            {modal.kind === "youtube" &&
                              "Paste a YouTube link (watch, shorts, or youtu.be)."}
                            {modal.kind === "doc" &&
                              "Paste a Google Doc, Notion, PDF, or Drive link."}
                            {modal.kind === "link" && "Paste any URL."}
                            {modal.kind === "note" && "Write your note."}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setModal({ open: false })}
                          className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/70 hover:bg-black/40 transition"
                          aria-label="Close modal"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="px-5 pb-5">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <label className="block">
                            <div className="text-xs text-white/55 mb-2">Title (required)</div>
                            <input
                              value={modal.title}
                              onChange={(e) =>
                                setModal({ ...modal, title: e.target.value, error: null })
                              }
                              placeholder="Name your drop…"
                              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-lime-300/40"
                            />
                          </label>

                          <label className="block">
                            <div className="text-xs text-white/55 mb-2">
                              Description (optional)
                            </div>
                            <input
                              value={modal.description}
                              onChange={(e) =>
                                setModal({ ...modal, description: e.target.value, error: null })
                              }
                              placeholder="Short description…"
                              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-lime-300/40"
                            />
                          </label>
                        </div>

                        {(modal.kind === "music" ||
                          modal.kind === "youtube" ||
                          modal.kind === "link" ||
                          modal.kind === "doc") && (
                          <div className="mt-4 space-y-3">
                            <label className="block">
                              <div className="text-xs text-white/55 mb-2">
                                {modal.providerHint ?? "URL"}
                              </div>
                              <input
                                value={modal.url ?? ""}
                                onChange={(e) =>
                                  setModal({ ...modal, url: e.target.value, error: null })
                                }
                                placeholder="https://example.com"
                                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-lime-300/40"
                              />
                            </label>
                          </div>
                        )}

                        {modal.kind === "note" && (
                          <div className="mt-4 space-y-3">
                            <label className="block">
                              <div className="text-xs text-white/55 mb-2">Note body</div>
                              <textarea
                                value={modal.text ?? ""}
                                onChange={(e) =>
                                  setModal({ ...modal, text: e.target.value, error: null })
                                }
                                placeholder="Type something…"
                                rows={5}
                                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-lime-300/40"
                              />
                            </label>
                          </div>
                        )}

                        {modal.kind === "media" && (
                          <div className="mt-4 space-y-3">
                            <label className="block">
                              <div className="text-xs text-white/55 mb-2">Choose image</div>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) =>
                                  setModal({
                                    ...modal,
                                    file: e.target.files?.[0] ?? null,
                                    error: null,
                                  })
                                }
                                className="block w-full text-sm text-white/75 file:mr-4 file:rounded-xl file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:text-white/80 hover:file:bg-white/15"
                              />
                            </label>
                          </div>
                        )}

                        {modal.error ? (
                          <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200/90">
                            {modal.error}
                          </div>
                        ) : null}

                        <div className="mt-5 flex items-center justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => setModal({ open: false })}
                            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white/70 hover:bg-black/40 transition"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={submitModal}
                            disabled={!!modal.busy}
                            className={clsx(
                              "rounded-2xl border border-lime-300/25 bg-lime-400/15 px-4 py-2",
                              "text-sm text-lime-100/90 hover:bg-lime-400/20 transition",
                              modal.busy ? "opacity-60 cursor-not-allowed" : ""
                            )}
                          >
                            {modal.busy ? "Saving…" : "Place in Assets"}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 text-center text-xs text-white/40">Tip: press Esc to close.</div>
                  </div>
                </div>
              )}

              {wcDraft.open ? (
                <div className="fixed inset-0 z-[999]">
                  <button
                    type="button"
                    onClick={() => setWcDraft((p) => ({ ...p, open: false }))}
                    className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
                    aria-label="Close Work Call modal backdrop"
                  />
                  <div className="absolute left-1/2 top-1/2 w-[min(700px,92%)] -translate-x-1/2 -translate-y-1/2">
                    <div className="rounded-3xl border border-white/10 bg-[#070913]/90 shadow-[0_20px_90px_rgba(0,0,0,0.65)] overflow-hidden">
                      <div className="flex items-start justify-between gap-3 p-5">
                        <div className="min-w-0">
                          <div className="text-[11px] tracking-[0.35em] text-white/55">WORK CALL</div>
                          <div className="mt-2 text-xl font-semibold text-white/90">
                            Create Work Call
                          </div>
                          <div className="mt-1 text-sm text-white/55">
                            Posts into Work Calls Inbox as a tagged message drop.
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setWcDraft((p) => ({ ...p, open: false }))}
                          className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/70 hover:bg-black/40 transition"
                          aria-label="Close Work Call modal"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="px-5 pb-5">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <label className="block">
                            <div className="text-xs text-white/55 mb-2">Type</div>
                            <select
                              value={wcDraft.type}
                              onChange={(e) =>
                                setWcDraft((p) => ({
                                  ...p,
                                  type: e.target.value as WorkCallType,
                                  error: null,
                                }))
                              }
                              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 focus:outline-none focus:ring-2 focus:ring-lime-300/40"
                            >
                              <option value="casting">Casting Call</option>
                              <option value="crew">Crew Call</option>
                              <option value="gigs">Gigs</option>
                              <option value="collaborations">Collaborations</option>
                            </select>
                          </label>

                          <label className="block">
                            <div className="text-xs text-white/55 mb-2">Title (required)</div>
                            <input
                              value={wcDraft.title}
                              onChange={(e) =>
                                setWcDraft((p) => ({ ...p, title: e.target.value, error: null }))
                              }
                              placeholder="Ex: Crew: DP needed for Saturday shoot"
                              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-lime-300/40"
                            />
                          </label>
                        </div>

                        <label className="block mt-4">
                          <div className="text-xs text-white/55 mb-2">Message preview (optional)</div>
                          <textarea
                            value={wcDraft.preview}
                            onChange={(e) =>
                              setWcDraft((p) => ({ ...p, preview: e.target.value, error: null }))
                            }
                            placeholder="Short description… rates, location, dates, what you need…"
                            rows={5}
                            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-lime-300/40"
                          />
                        </label>

                        {wcDraft.error ? (
                          <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200/90">
                            {wcDraft.error}
                          </div>
                        ) : null}

                        <div className="mt-5 flex items-center justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => setWcDraft((p) => ({ ...p, open: false }))}
                            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white/70 hover:bg-black/40 transition"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={submitWorkCall}
                            className="rounded-2xl border border-lime-300/25 bg-lime-400/15 px-4 py-2 text-sm text-lime-100/90 hover:bg-lime-400/20 transition shadow-[0_0_20px_rgba(163,230,53,0.16)]"
                          >
                            Post Work Call
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 text-center text-xs text-white/40">
                      Tip: Posted calls appear as unread messages in the Work Calls inbox.
                    </div>
                  </div>
                </div>
              ) : null}

              {dropPlacedToast.show ? (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[1000]">
                  <div className="rounded-2xl border border-lime-300/25 bg-lime-400/15 px-4 py-3 text-sm text-lime-100/90 shadow-[0_0_28px_rgba(163,230,53,0.18)]">
                    {dropPlacedToast.text}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes floaty {
          0% {
            transform: translate(-50%, -50%) translateY(0px);
          }
          50% {
            transform: translate(-50%, -50%) translateY(-14px);
          }
          100% {
            transform: translate(-50%, -50%) translateY(0px);
          }
        }
      `}</style>
    </section>
  );
});

export default DropPadOSV2;
