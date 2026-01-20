// File: app/components/board/DropConsole.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

import { createActivity, type BoardActivityKind } from "@/lib/board/activity";
import { fetchLinkPreview } from "@/lib/board/linkPreview";

import {
  createThread,
  EVENTS,
  readForums,
  seedForumsIfEmpty,
  type BoardUser,
} from "@/lib/boardStore";

/* -------------------------------------------------------------------------- */
/* utils */
/* -------------------------------------------------------------------------- */

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type DropMode = "announcement" | "forum_post" | "board_drop";

const MODE_LABEL: Record<DropMode, string> = {
  announcement: "Announcement",
  forum_post: "Thread Drop",
  board_drop: "Board Drop",
};

const MODE_HINT: Record<DropMode, string> = {
  announcement: "Status updates, but more fun. Broadcast to the whole Board.",
  forum_post: "Start a conversation room in the community.",
  board_drop: "Extensions of your Board with staple attachments.",
};

type DropFlavor = "youtube" | "music" | "news" | "link" | "media" | "pay" | "doc";

const DROP_FLAVOR_LABEL: Record<DropFlavor, string> = {
  youtube: "YouTube",
  music: "Music",
  news: "News",
  link: "Link",
  media: "Media",
  pay: "Pay",
  doc: "Doc",
};

const DROP_FLAVOR_SUB: Record<DropFlavor, string> = {
  youtube: "video",
  music: "track",
  news: "article",
  link: "card",
  media: "upload",
  pay: "monetize",
  doc: "file",
};

type AnnouncementVibe =
  | "hype"
  | "happy"
  | "chill"
  | "bored"
  | "serious"
  | "sad"
  | "creepy"
  | "funny"
  | "nostalgic"
  | "chaos"
  | "victory"
  | "locked_in"
  | "romantic"
  | "plot_twist"
  | "aesthetic"
  | "sleepy"
  | "rage"
  | "mystic"
  | "tea";

const VIBE_OPTIONS: Array<{ value: AnnouncementVibe; label: string }> = [
  { value: "hype", label: "🔥 Hype" },
  { value: "happy", label: "😊 Happy" },
  { value: "chill", label: "🌿 Chill" },
  { value: "bored", label: "😐 Bored" },
  { value: "serious", label: "🧠 Serious" },
  { value: "sad", label: "😔 Sad" },
  { value: "creepy", label: "👁️ Creepy" },
  { value: "funny", label: "😂 Funny" },
  { value: "nostalgic", label: "🕰️ Nostalgic" },
  { value: "chaos", label: "🧨 Chaos" },
  { value: "victory", label: "🏆 Victory" },
  { value: "locked_in", label: "🎧 Locked In" },
  { value: "romantic", label: "💞 Romantic" },
  { value: "plot_twist", label: "🌀 Plot Twist" },
  { value: "aesthetic", label: "🪩 Aesthetic" },
  { value: "sleepy", label: "🛌 Sleepy" },
  { value: "rage", label: "💥 Rage" },
  { value: "mystic", label: "🔮 Mystic" },
  { value: "tea", label: "🍵 Tea" },
];

function modeToKind(m: DropMode): BoardActivityKind {
  if (m === "announcement") return "announcement";
  if (m === "forum_post") return "forum_post";
  return "board_drop";
}

function isExternalHref(href: string) {
  return /^https?:\/\//i.test(href);
}

function attachmentPlaceholder(flavor: DropFlavor) {
  switch (flavor) {
    case "youtube":
      return "Paste YouTube link";
    case "music":
      return "Paste Spotify / SoundCloud / YouTube Music link";
    case "news":
      return "Paste article link";
    case "link":
      return "Paste any link";
    case "doc":
      return "Paste doc link (Drive / PDF / Notion / etc.)";
    case "pay":
      return "Paste payment link (PayPal / Stripe / etc.)";
    case "media":
      return "Paste image/video link (or upload below)";
    default:
      return "Paste link";
  }
}

/** Tags: allow "#music #nyc", "music, nyc", "music nyc" */
function parseTags(raw: string): string[] {
  const cleaned = raw.replace(/\n/g, " ").replace(/,/g, " ").trim();
  if (!cleaned) return [];
  const parts = cleaned
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => t.replace(/^#/, "").toLowerCase())
    .filter((t) => /^[a-z0-9_-]{1,32}$/.test(t));
  return Array.from(new Set(parts)).slice(0, 12);
}

/** Broadcast to CommunityFeed so it can prepend immediately (no refresh). */
function emitNewActivity(payload: any) {
  try {
    window.dispatchEvent(
      new CustomEvent("board:activity:new", { detail: payload })
    );
  } catch {
    // no-op
  }
}

function inferMediaType(url: string) {
  const u = url.toLowerCase();
  if (/\.(png|jpg|jpeg|gif|webp|avif)(\?|$)/i.test(u)) return "image";
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(u)) return "video";
  return "link";
}

/* -------------------------------------------------------------------------- */
/* component */
/* -------------------------------------------------------------------------- */

type DropConsoleVariant = "tile" | "bare";

export default function DropConsole({
  variant = "tile",
}: {
  variant?: DropConsoleVariant;
}) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [meId, setMeId] = useState<string | null>(null);

  // IMPORTANT: start asleep by default
  const [sleeping, setSleeping] = useState(true);

  const [mode, setMode] = useState<DropMode>("board_drop");
  const [dropFlavor, setDropFlavor] = useState<DropFlavor>("youtube");

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [attachUrl, setAttachUrl] = useState("");

  const [tagsInput, setTagsInput] = useState("");

  // Forum Post mode
  const [forumId, setForumId] = useState<string>("general");
  const [forumOptions, setForumOptions] = useState<
    Array<{ id: string; title: string }>
  >([]);

  // Announcement mode
  const [vibe, setVibe] = useState<AnnouncementVibe>("hype");
  const [announceMediaUrl, setAnnounceMediaUrl] = useState("");

  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  const [posting, setPosting] = useState(false);
  const [postMsg, setPostMsg] = useState<string | null>(null);
  const [postErr, setPostErr] = useState<string | null>(null);

  /* auth */
  useEffect(() => {
    sb.auth.getUser().then(({ data }) => {
      setMeId(data.user?.id ?? null);
    });
  }, [sb]);

  /* wake event */
  useEffect(() => {
    const onOpen = () => setSleeping(false);
    window.addEventListener("board:dropconsole:open", onOpen as EventListener);
    return () =>
      window.removeEventListener(
        "board:dropconsole:open",
        onOpen as EventListener
      );
  }, []);

  /* forums */
  useEffect(() => {
    seedForumsIfEmpty();
    const db = readForums();
    const nextOptions = db.forums.map((f) => ({ id: f.id, title: f.title }));
    setForumOptions(nextOptions);

    const hasGeneral = nextOptions.some((f) => f.id === "general");
    if (hasGeneral) setForumId("general");
    else if (nextOptions.length > 0) setForumId(nextOptions[0].id);

    const onForums = () => {
      const next = readForums();
      const opts = next.forums.map((f) => ({ id: f.id, title: f.title }));
      setForumOptions(opts);

      const stillExists = opts.some((f) => f.id === forumId);
      if (!stillExists) {
        const hasGen = opts.some((f) => f.id === "general");
        setForumId(hasGen ? "general" : opts[0]?.id ?? "general");
      }
    };

    window.addEventListener(EVENTS.forumsUpdated, onForums as EventListener);
    return () =>
      window.removeEventListener(
        EVENTS.forumsUpdated,
        onForums as EventListener
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bodyPlaceholder =
    mode === "announcement"
      ? "What’s the announcement?"
      : mode === "forum_post"
      ? "Start a conversation… ask a question, share a thought, or invite opinions."
      : "Describe the drop. Make it feel like a cutout on your Board.";

  async function uploadToBoardMedia(file: File) {
    setUploadErr(null);
    setUploading(true);

    try {
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const path = `uploads/${meId ?? "demo"}/${Date.now()}_${Math.random()
        .toString(16)
        .slice(2)}.${ext}`;

      const { error } = await sb.storage
        .from("board-media")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || undefined,
        });

      if (error) throw error;

      const pub = sb.storage.from("board-media").getPublicUrl(path);
      const url = pub.data.publicUrl;

      if (mode === "announcement") setAnnounceMediaUrl(url);
      if (mode === "board_drop" && dropFlavor === "media") setAttachUrl(url);

      setPostMsg("Media attached ✓");
      window.setTimeout(() => setPostMsg(null), 1500);
    } catch (e: any) {
      setUploadErr(
        e?.message || "Upload failed. Check board-media bucket + policies."
      );
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPosting(true);
    setPostErr(null);
    setPostMsg(null);

    try {
      const kind = modeToKind(mode);

      const cleanTitle = title.trim() || null;
      const cleanBody = body.trim();
      const cleanAttach = attachUrl.trim() || null;
      const tags = parseTags(tagsInput);

      if (!cleanBody) throw new Error("Add a description.");

      // Forum Post: auto-create thread + href to thread
      let autoHref: string | null = null;
      if (mode === "forum_post") {
        const me: BoardUser = { id: meId ?? "demo", displayName: "Board User" };

        const threadTitle =
          cleanTitle ??
          (cleanBody.length > 72
            ? `${cleanBody.slice(0, 72).trim()}…`
            : cleanBody);

        const t = createThread({
          forumId,
          title: threadTitle,
          body: cleanBody,
          author: me,
        });

        autoHref = `/board/forums?forum=${encodeURIComponent(
          forumId
        )}&thread=${encodeURIComponent(t.id)}`;
      }

      // Board Drop: preview if external attachment
      let preview: any = null;
      if (mode === "board_drop" && cleanAttach && isExternalHref(cleanAttach)) {
        preview = await fetchLinkPreview(cleanAttach);
      }

      // Announcement media: store as href so ActivityCard can embed
      const cleanAnnMedia = announceMediaUrl.trim() || null;
      const annMediaType = cleanAnnMedia ? inferMediaType(cleanAnnMedia) : null;

      const resolvedHref =
        mode === "forum_post"
          ? autoHref
          : mode === "board_drop"
          ? cleanAttach
          : mode === "announcement"
          ? cleanAnnMedia
          : null;

      const res = await createActivity(sb, {
        user_id: meId,
        kind,
        title: cleanTitle,
        body: cleanBody,
        href: resolvedHref,
        image_url:
          mode === "board_drop"
            ? (preview?.image ?? null)
            : mode === "announcement" && annMediaType === "image"
            ? cleanAnnMedia
            : null,
        meta: {
          source: "drop_console",
          tags,

          ...(mode === "board_drop"
            ? {
                drop_flavor: dropFlavor,
                preview: preview
                  ? {
                      url: preview.url ?? cleanAttach,
                      provider: preview.provider ?? null,
                      title: preview.title ?? null,
                      description: preview.description ?? null,
                      image: preview.image ?? null,
                      embedUrl: preview.embedUrl ?? null,
                      type: preview.type ?? "link",
                    }
                  : null,
              }
            : {}),

          ...(mode === "forum_post" ? { forum_id: forumId } : {}),
          ...(mode === "announcement"
            ? {
                announcement_vibe: vibe,
                announcement_media_url: cleanAnnMedia,
                announcement_media_type: annMediaType,
              }
            : {}),
        },
      });

      emitNewActivity({
        id: res.activity.id,
        created_at: res.activity.created_at,
        user_id: res.activity.user_id,
        kind,
        title: cleanTitle,
        body: cleanBody,
        href: resolvedHref,
        image_url:
          mode === "board_drop"
            ? (preview?.image ?? null)
            : mode === "announcement" && annMediaType === "image"
            ? cleanAnnMedia
            : null,
        meta: {
          source: "drop_console",
          tags,
          ...(mode === "board_drop" ? { drop_flavor: dropFlavor, preview } : {}),
          ...(mode === "forum_post" ? { forum_id: forumId } : {}),
          ...(mode === "announcement"
            ? {
                announcement_vibe: vibe,
                announcement_media_url: cleanAnnMedia,
                announcement_media_type: annMediaType,
              }
            : {}),
        },
      });

      setTitle("");
      setBody("");
      setAttachUrl("");
      setTagsInput("");
      setAnnounceMediaUrl("");

      setPostMsg("Dropped ✓");
      window.setTimeout(() => setPostMsg(null), 1500);
    } catch (err: any) {
      setPostErr(err?.message || "Drop failed.");
    } finally {
      setPosting(false);
    }
  }

  const showMediaUploadForBoardDrop =
    mode === "board_drop" && dropFlavor === "media";

  // -------------------------
  // SLEEP DOCK (does NOT overlay your buckets)
  // -------------------------
  if (sleeping) {
    const dock = (
      <div className="dock">
        <div className="dockLeft">
          <div className="dockTitle">DROP CONSOLE</div>
          <div className="dockSub">Sleeping…</div>
        </div>
        <button type="button" className="dockWake" onClick={() => setSleeping(false)}>
          WAKE
        </button>

        <style jsx>{`
          .dock {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            border-radius: 20px;
            padding: 12px 14px;
            background: rgba(255, 255, 255, 0.92);
            border: 1px solid rgba(0, 0, 0, 0.08);
            box-shadow: 0 12px 30px rgba(0, 0, 0, 0.12);
          }
          .dockTitle {
            font-size: 11px;
            font-weight: 950;
            letter-spacing: 0.22em;
            text-transform: uppercase;
            color: rgba(0, 170, 160, 1);
          }
          .dockSub {
            margin-top: 6px;
            font-size: 12px;
            font-weight: 800;
            color: rgba(0, 0, 0, 0.48);
          }
          .dockWake {
            border-radius: 999px;
            padding: 10px 14px;
            font-size: 10px;
            font-weight: 950;
            letter-spacing: 0.18em;
            text-transform: uppercase;
            border: 1px solid rgba(0, 0, 0, 0.10);
            background: rgba(0, 0, 0, 0.84);
            color: rgba(255, 255, 255, 0.92);
            cursor: pointer;
          }
        `}</style>
      </div>
    );

    if (variant === "bare") return dock;
    return <div style={{ width: "100%" }}>{dock}</div>;
  }

  const content = (
    <div className="dc">
      <div className="dcInner">
        <div className="dcTop">
          <div>
            <div className="dcTitleRow">
              <h3 className="dcTitle">Drop Console</h3>
              <button
                type="button"
                className="dcSleep"
                onClick={() => setSleeping(true)}
                title="Put console to sleep"
              >
                SLEEP
              </button>
            </div>
            <p className="dcHint">{MODE_HINT[mode]}</p>
          </div>
        </div>

        {/* MODE PILLS */}
        <div className="dcModePills">
          {(["board_drop", "forum_post", "announcement"] as DropMode[]).map(
            (m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={clsx("dcModePill", mode === m && "on")}
              >
                {MODE_LABEL[m].toUpperCase()}
              </button>
            )
          )}
        </div>

        {/* Drop type pills (board_drop only) */}
        {mode === "board_drop" && (
          <div className="dcSection">
            <div className="dcSectionHead">
              <div className="dcSectionLabel">Drop Type</div>
              <div className="dcSectionNote">Staple attachments (embed-first).</div>
            </div>

            <div className="dcPills">
              {(["youtube", "music", "news"] as DropFlavor[]).map((t) => (
                <Pill
                  key={t}
                  on={dropFlavor === t}
                  label={DROP_FLAVOR_LABEL[t].toUpperCase()}
                  sub={DROP_FLAVOR_SUB[t]}
                  onClick={() => setDropFlavor(t)}
                  strong
                />
              ))}
            </div>

            <div className="dcPills">
              {(["link", "media", "pay", "doc"] as DropFlavor[]).map((t) => (
                <Pill
                  key={t}
                  on={dropFlavor === t}
                  label={DROP_FLAVOR_LABEL[t].toUpperCase()}
                  sub={DROP_FLAVOR_SUB[t]}
                  onClick={() => setDropFlavor(t)}
                />
              ))}
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} className="dcForm">
          {mode === "forum_post" && (
            <div className="dcField">
              <div className="dcFieldLabel">Forum</div>
              <select
                value={forumId}
                onChange={(e) => setForumId(e.target.value)}
                className="dcInput"
              >
                {!forumOptions.some((f) => f.id === "general") && (
                  <option value="general">General</option>
                )}
                {forumOptions.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title}
                  </option>
                ))}
              </select>
              <div className="dcFieldHelp">Pick where this conversation lives.</div>
            </div>
          )}

          {mode === "announcement" && (
            <div className="dcField">
              <div className="dcFieldLabel">Vibe Check</div>
              <select
                value={vibe}
                onChange={(e) => setVibe(e.target.value as AnnouncementVibe)}
                className="dcInput"
              >
                {VIBE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <div className="dcFieldHelp">Mood helps people read the room.</div>
            </div>
          )}

          {/* Announcement media */}
          {mode === "announcement" && (
            <div className="dcField">
              <div className="dcFieldLabel">Announcement Media</div>

              <div className="mediaRow">
                <input
                  value={announceMediaUrl}
                  onChange={(e) => setAnnounceMediaUrl(e.target.value)}
                  placeholder="Paste image/video link (optional)"
                  className="dcInput"
                />

                <label className={clsx("uploadBtn", uploading && "busy")}>
                  {uploading ? "Uploading…" : "Upload"}
                  <input
                    type="file"
                    accept="image/*,video/*"
                    onChange={(e) => {
                      const f = e.currentTarget.files?.[0];
                      if (f) uploadToBoardMedia(f);
                      e.currentTarget.value = "";
                    }}
                    style={{ display: "none" }}
                  />
                </label>
              </div>

              {uploadErr && <div className="dcErr">{uploadErr}</div>}
              <div className="dcFieldHelp">
                Uploads to <b>board-media</b>. Link is saved into the announcement.
              </div>
            </div>
          )}

          {/* Title */}
          <div className="dcField">
            <div className="dcFieldLabel">Title</div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={mode === "forum_post" ? "Thread title (optional)" : "Title"}
              className="dcInput"
            />
          </div>

          {/* Attachment (board_drop only) */}
          {mode === "board_drop" && (
            <div className="dcField">
              <div className="dcFieldLabel">Attachment</div>
              <input
                value={attachUrl}
                onChange={(e) => setAttachUrl(e.target.value)}
                placeholder={attachmentPlaceholder(dropFlavor)}
                className="dcInput"
              />

              {showMediaUploadForBoardDrop && (
                <>
                  <div style={{ height: 10 }} />
                  <div className="mediaRow">
                    <div className="dcFieldHelp" style={{ margin: 0 }}>
                      Upload a photo/video to instantly attach it.
                    </div>

                    <label className={clsx("uploadBtn", uploading && "busy")}>
                      {uploading ? "Uploading…" : "Upload"}
                      <input
                        type="file"
                        accept="image/*,video/*"
                        onChange={(e) => {
                          const f = e.currentTarget.files?.[0];
                          if (f) uploadToBoardMedia(f);
                          e.currentTarget.value = "";
                        }}
                        style={{ display: "none" }}
                      />
                    </label>
                  </div>

                  {uploadErr && <div className="dcErr">{uploadErr}</div>}
                  <div className="dcFieldHelp">
                    Stored in <b>board-media</b>. Your uploaded URL auto-fills Attachment.
                  </div>
                </>
              )}
            </div>
          )}

          {/* Tags */}
          <div className="dcField">
            <div className="dcFieldLabel">Tags</div>
            <input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g. #music #nyc  or  music, nyc, filmmaking"
              className="dcInput"
            />
            <div className="dcFieldHelp">Used later for Explore matching + search.</div>

            {parseTags(tagsInput).length > 0 && (
              <div className="dcTagsPreview">
                {parseTags(tagsInput).map((t) => (
                  <span key={t} className="dcTagChip">
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Body */}
          <div className="dcField">
            <div className="dcFieldLabel">
              {mode === "forum_post" ? "Thread starter" : "Message"}
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder={bodyPlaceholder}
              className="dcTextarea"
            />
          </div>

          {postErr && <div className="dcErr">{postErr}</div>}
          {postMsg && <div className="dcOk">{postMsg}</div>}

          <div className="dcBottom">
            <div className="dcFoot">
              Appears in <b>Community Feed</b> + your <b>Profile</b>.
              <div className="dcFootLink">
                <Link href="/board/profile">Open Profile</Link>
              </div>
            </div>

            <button type="submit" disabled={posting} className="dcSubmit">
              {posting ? "Dropping…" : "Add a Drop"}
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        .dc { width: 100%; }
        .dcInner { padding: 16px; }

        .dcTitleRow { display: flex; align-items: center; gap: 10px; }
        .dcTitle { margin: 0; font-size: 16px; font-weight: 950; color: rgba(0,170,160,1); }
        .dcHint { margin: 6px 0 0; font-size: 12px; color: rgba(0,0,0,0.52); }

        .dcSleep {
          border-radius: 999px; padding: 8px 10px; font-size: 10px;
          font-weight: 950; letter-spacing: 0.18em; text-transform: uppercase;
          border: 1px solid rgba(0,0,0,0.12);
          background: rgba(0,0,0,0.84); color: rgba(255,255,255,0.92);
          cursor: pointer;
        }

        .dcModePills { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 10px; }
        .dcModePill {
          border-radius: 999px; padding: 9px 12px;
          border: 1px solid rgba(0,0,0,0.12);
          background: rgba(255,255,255,0.86);
          color: rgba(0,0,0,0.58);
          font-size: 11px; font-weight: 950; letter-spacing: 0.16em;
          text-transform: uppercase; cursor: pointer;
        }
        .dcModePill.on { background: rgba(0,0,0,0.86); color: rgba(255,255,255,0.92); }

        .dcSection { margin-top: 12px; }
        .dcSectionHead { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
        .dcSectionLabel { font-size: 11px; font-weight: 950; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(0,0,0,0.52); }
        .dcSectionNote { font-size: 12px; color: rgba(0,0,0,0.46); font-weight: 800; }

        .dcPills { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 10px; }

        .dcForm { margin-top: 12px; display: grid; gap: 12px; }

        .dcFieldLabel { font-size: 11px; font-weight: 950; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(0,0,0,0.52); margin-bottom: 6px; }
        .dcInput {
          width: 100%; border-radius: 14px; border: 1px solid rgba(0,0,0,0.12);
          background: rgba(255,255,255,0.78); padding: 10px 12px; outline: none;
        }
        .dcTextarea {
          width: 100%; border-radius: 14px; border: 1px solid rgba(0,0,0,0.12);
          background: rgba(255,255,255,0.78); padding: 10px 12px; outline: none; resize: vertical;
        }
        .dcInput:focus, .dcTextarea:focus {
          box-shadow: 0 0 0 2px rgba(160,220,255,0.95);
          border-color: rgba(160,220,255,0.75);
        }

        .dcFieldHelp { margin-top: 6px; font-size: 12px; color: rgba(0,0,0,0.46); font-weight: 800; }

        .dcTagsPreview { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 8px; }
        .dcTagChip {
          border-radius: 999px; padding: 6px 10px; font-size: 11px;
          font-weight: 900; letter-spacing: 0.08em;
          border: 1px solid rgba(0,0,0,0.10);
          background: rgba(255,255,255,0.78);
          color: rgba(0,0,0,0.60);
        }

        .mediaRow { display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center; }

        .uploadBtn {
          border-radius: 999px; padding: 10px 14px; font-size: 11px;
          font-weight: 950; letter-spacing: 0.14em; text-transform: uppercase;
          border: 1px solid rgba(0,0,0,0.12);
          background: rgba(0,0,0,0.86);
          color: rgba(255,255,255,0.92);
          cursor: pointer; white-space: nowrap;
        }
        .uploadBtn.busy { opacity: 0.7; cursor: not-allowed; }

        .dcErr { font-size: 13px; font-weight: 800; color: rgba(190,0,0,0.75); }
        .dcOk { font-size: 13px; font-weight: 800; color: rgba(0,120,90,0.85); }

        .dcBottom { margin-top: 2px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .dcFoot { font-size: 12px; color: rgba(0,0,0,0.52); }
        .dcFootLink :global(a) {
          display: inline-block; margin-top: 6px; font-size: 12px; font-weight: 900;
          letter-spacing: 0.08em; text-transform: uppercase;
          color: rgba(255,0,190,0.85); text-decoration: underline; text-underline-offset: 4px;
        }

        .dcSubmit {
          border-radius: 999px; padding: 12px 16px; font-weight: 950;
          letter-spacing: 0.12em; text-transform: uppercase;
          border: 1px solid rgba(0,0,0,0.12);
          background: rgba(0,0,0,0.86);
          color: rgba(255,255,255,0.92);
          cursor: pointer;
          transition: transform 140ms ease, filter 140ms ease;
        }
        .dcSubmit:hover { transform: translateY(-1px); filter: brightness(1.02); }
        .dcSubmit:disabled { opacity: 0.65; cursor: not-allowed; transform: none; }

        @media (max-width: 520px) {
          .mediaRow { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );

  if (variant === "bare") return content;

  return (
    <div className="dcTileWrap">
      <div className="dcTileRim" aria-hidden />
      {content}

      <style jsx>{`
        .dcTileWrap {
          position: relative;
          border-radius: 28px;
          background: rgba(255, 255, 255, 0.92);
          border: 1px solid rgba(0, 0, 0, 0.08);
          box-shadow: 0 14px 40px rgba(0, 0, 0, 0.12);
          overflow: hidden;
        }
        .dcTileRim {
          pointer-events: none;
          position: absolute;
          inset: 0;
          border-radius: 28px;
          box-shadow: inset 0 2px 0 rgba(160, 220, 255, 0.65),
            inset 0 0 0 1px rgba(160, 220, 255, 0.7),
            inset 0 0 0 2px rgba(255, 255, 255, 0.7);
          z-index: 0;
        }
        :global(.dc) { position: relative; z-index: 1; }
      `}</style>
    </div>
  );
}

function Pill({
  on,
  label,
  sub,
  onClick,
  strong,
}: {
  on: boolean;
  label: string;
  sub: string;
  onClick: () => void;
  strong?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx("pill", on && "on", strong && "strong")}
    >
      <div className="pillTop">{label}</div>
      <div className={clsx("pillSub", on ? "on" : "")}>{sub}</div>

      <style jsx>{`
        .pill {
          min-width: 112px;
          border-radius: 18px;
          padding: 10px 12px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: rgba(255, 255, 255, 0.78);
          text-align: left;
          cursor: pointer;
          transition: transform 140ms ease, filter 140ms ease,
            background 140ms ease;
        }
        .pill:hover { transform: translateY(-1px); filter: brightness(1.01); }
        .pill.on { background: rgba(0, 0, 0, 0.86); border-color: rgba(0, 0, 0, 0.14); }
        .pillTop {
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(0, 0, 0, 0.62);
        }
        .pill.on .pillTop { color: rgba(255, 255, 255, 0.92); }
        .pillSub { margin-top: 6px; font-size: 12px; color: rgba(0, 0, 0, 0.48); }
        .pillSub.on { color: rgba(255, 255, 255, 0.7); }
      `}</style>
    </button>
  );
}
