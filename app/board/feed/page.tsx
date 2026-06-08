"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

import DropConsole from "@/app/components/board/DropConsole";
import DropsBucket from "@/app/components/board/DropsBucket";
import ActivityCard from "@/app/components/board/ActivityCard";
import BoardWhispers from "@/app/components/board/BoardWhispers";
import { createBoardWhisper, type BoardWhisperEventType } from "@/lib/board/whispers";

// Ambient whispers woven into the Activity Channel cadence — surfaced quietly
// between drops, never as alerts.
const FEED_WHISPER_CADENCE: BoardWhisperEventType[] = [
  "drop_view",
  "profile_view",
  "drop_pin",
  "quiet_day",
  "work_update",
];
const FEED_WHISPER_EVERY = 5;

import {
  getLocalActivity,
  type BoardActivity,
  type BoardActivityKind,
} from "@/lib/board/activity";
import { mergeActivityWithFeed } from "@/lib/board/feedActivity";
import {
  BOARD_PROJECTS_UPDATED_EVENT,
  syncResolvedProjectsToStorage,
} from "@/lib/board/projects";
import { EVENTS, readFeed, seedForumsIfEmpty } from "@/lib/boardStore";

import { installBucketBrainBridge } from "@/lib/board/bucketBrain";

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const PAGE_SIZE = 80;
const FEED_TIMEOUT_MS = 8000;
const PROJECT_DROPS_UPDATED_EVENT = "board:project-drops:updated";

function demoFeedItems(): BoardActivity[] {
  const now = Date.now();
  return [
    {
      id: "demo_feed_announcement",
      created_at: new Date(now - 1000 * 60 * 6).toISOString(),
      user_id: null,
      kind: "announcement",
      title: "Board is waking back up",
      body:
        "Community Feed is live again. Board Drops, Pay Drops, Project Drops, and announcements all land here as the shared activity stream.",
      href: "/board/feed",
      image_url: "/assets/board-logo-signup.jpg",
      meta: {
        dropType: "announcement",
        preview: {
          image: "/assets/board-logo-signup.jpg",
          title: "Board Feed Restored",
          description: "The shared activity stream is ready for new drops.",
        },
      },
    },
    {
      id: "demo_feed_pay_drop",
      created_at: new Date(now - 1000 * 60 * 18).toISOString(),
      user_id: null,
      kind: "board_drop",
      title: "Welcome Present",
      body: "A Pay Drop preview should show its image, price, checkout button, and reactions in the same universal card style.",
      href: null,
      image_url: "/assets/BoardLogo.png",
      meta: {
        dropType: "pay",
        payProvider: "authorize_net_accept_hosted",
        priceCents: 500,
        preview: {
          image: "/assets/BoardLogo.png",
          title: "Welcome Present",
          description: "Demo Pay Drop card with embedded thumbnail.",
        },
      },
    },
    {
      id: "demo_feed_project_drop",
      created_at: new Date(now - 1000 * 60 * 32).toISOString(),
      user_id: null,
      kind: "board_drop",
      title: "Project Drop: Those Ryderz Casting Call",
      body:
        "A host-ready project drop for casting, crew, BTS media, and collaborator updates.",
      href: "/board/work",
      image_url: "/assets/those-ryderz-logo.jpg",
      meta: {
        dropType: "project",
        cardStyle: "project_drop",
        projectType: "Short Film",
        status: "casting",
        location: "New York City",
        rolesNeeded: "Lead actor, featured extras, stylist, BTS photographer",
        preview: {
          image: "/assets/those-ryderz-logo.jpg",
          title: "Those Ryderz Casting Call",
          description: "Project Notebook activity preview.",
        },
      },
    },
    {
      id: "demo_feed_media_drop",
      created_at: new Date(now - 1000 * 60 * 48).toISOString(),
      user_id: null,
      kind: "board_drop",
      title: "Vision Wall Signal",
      body:
        "Media Drops should show the full image without trapping it inside a tiny fixed crop.",
      href: "/assets/john_andy_headshot.jpg",
      image_url: "/assets/john_andy_headshot.jpg",
      meta: {
        dropType: "media",
        preview: {
          image: "/assets/john_andy_headshot.jpg",
          title: "Vision Wall Signal",
        },
      },
    },
  ];
}

function normalizeIncoming(x: any): BoardActivity | null {
  if (!x || typeof x !== "object") return null;

  const kind = String((x as any).kind || "") as BoardActivityKind;
  if (!kind) return null;

  const body = typeof (x as any).body === "string" ? (x as any).body : "";
  if (!body) return null;

  return {
    id: String((x as any).id ?? `rt_${Date.now()}`),
    created_at:
      typeof (x as any).created_at === "string" && (x as any).created_at
        ? (x as any).created_at
        : new Date().toISOString(),
    user_id: (x as any).user_id ?? null,
    kind,
    title: (x as any).title ?? null,
    body,
    href: (x as any).href ?? null,
    image_url: (x as any).image_url ?? null,
    meta:
      (x as any).meta && typeof (x as any).meta === "object"
        ? (x as any).meta
        : null,
  };
}

function isPrivateDropActivity(item: BoardActivity) {
  return item.meta?.visibility === "private";
}

async function fetchSupabaseActivity(opts: {
  limit: number;
  offset: number;
  kinds?: BoardActivityKind[];
}) {
  const params = new URLSearchParams({
    limit: String(opts.limit),
    offset: String(opts.offset),
  });

  for (const kind of opts.kinds ?? []) {
    params.append("kind", kind);
  }

  const res = await fetch(`/api/board/activity?${params.toString()}`, {
    cache: "no-store",
  });

  if (!res.ok) throw new Error("Could not load Board activity.");
  const data = await res.json();
  const list = Array.isArray(data?.items) ? data.items : [];
  return list.map(normalizeIncoming).filter(Boolean) as BoardActivity[];
}

export default function HomeBoardFeedPage() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const [tab, setTab] = useState<"all" | "announcements">("all");
  const [items, setItems] = useState<BoardActivity[]>(() =>
    demoFeedItems().slice(0, PAGE_SIZE)
  );
  const [loading, setLoading] = useState(false);

  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const kinds = useMemo<BoardActivityKind[] | undefined>(() => {
    return tab === "announcements" ? ["announcement"] : undefined;
  }, [tab]);

  const visibleFallbackItems = useMemo(() => {
    const demos = demoFeedItems();
    return kinds?.length
      ? demos.filter((item) => kinds.includes(item.kind))
      : demos;
  }, [kinds]);

  const safeItems = useMemo(
    () => (Array.isArray(items) ? items : []).filter(Boolean),
    [items]
  );

  function removeItemFromFeed(removedId: string) {
    setItems((current) =>
      current.filter((item) => {
        const meta = item.meta && typeof item.meta === "object" ? item.meta : null;
        return (
          item.id !== removedId &&
          String(meta?.dropId || "") !== removedId &&
          String(meta?.originalDropId || "") !== removedId
        );
      })
    );
  }

  useEffect(() => {
    installBucketBrainBridge();
    seedForumsIfEmpty();
    syncResolvedProjectsToStorage();
  }, []);

  useEffect(() => {
    let alive = true;

    function syncFromLocal() {
      try {
        const localActivity = getLocalActivity();
        const sharedFeed = readFeed();
        if (!alive) return;
        const merged = mergeActivityWithFeed(localActivity, sharedFeed);
        const scoped = (kinds?.length
          ? merged.filter((item) => kinds.includes(item.kind))
          : merged
        ).filter((item) => !isPrivateDropActivity(item));
        setItems(
          (scoped.length ? scoped : visibleFallbackItems).slice(0, PAGE_SIZE)
        );
        setHasMore(false);
        setOffset(PAGE_SIZE);
      } catch {
        if (alive) {
          setItems(visibleFallbackItems.slice(0, PAGE_SIZE));
          setHasMore(false);
          setOffset(PAGE_SIZE);
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    async function run() {
      setLoading(false);
      setOffset(0);
      setHasMore(true);
      syncFromLocal();

      try {
        const data = await Promise.race([
          fetchSupabaseActivity({ limit: PAGE_SIZE, offset: 0, kinds }),
          new Promise<BoardActivity[]>((_, reject) =>
            window.setTimeout(() => reject(new Error("Feed request timed out")), FEED_TIMEOUT_MS)
          ),
        ]);

        if (!alive) return;

        const cleaned = Array.isArray(data) ? data : [];
        const localActivity = getLocalActivity();
        const sharedFeed = readFeed();
        const merged = mergeActivityWithFeed([...cleaned, ...localActivity], sharedFeed);
        const nextItems = (merged.length ? merged : visibleFallbackItems).filter(
          (item) => !isPrivateDropActivity(item)
        );

        setItems(nextItems);
        setHasMore(cleaned.length === PAGE_SIZE);
        setOffset(cleaned.length);
      } catch {
        syncFromLocal();
      } finally {
        if (alive) setLoading(false);
      }
    }

    run();
    const onFeedUpdated = () => syncFromLocal();
    window.addEventListener(EVENTS.feedUpdated, onFeedUpdated as EventListener);
    window.addEventListener(BOARD_PROJECTS_UPDATED_EVENT, onFeedUpdated as EventListener);
    window.addEventListener(PROJECT_DROPS_UPDATED_EVENT, onFeedUpdated as EventListener);
    return () => {
      alive = false;
      window.removeEventListener(EVENTS.feedUpdated, onFeedUpdated as EventListener);
      window.removeEventListener(
        BOARD_PROJECTS_UPDATED_EVENT,
        onFeedUpdated as EventListener
      );
      window.removeEventListener(
        PROJECT_DROPS_UPDATED_EVENT,
        onFeedUpdated as EventListener
      );
    };
  }, [sb, tab, kinds]);

  useEffect(() => {
    const onNew = (e: any) => {
      const a = normalizeIncoming(e?.detail);
      if (!a) return;
      if (isPrivateDropActivity(a)) return;
      if (tab === "announcements" && a.kind !== "announcement") return;

      setItems((prev) => {
        if (prev.some((p) => p.id === a.id)) return prev;
        return [a, ...prev];
      });
    };

    window.addEventListener("board:activity:new", onNew as EventListener);
    return () =>
      window.removeEventListener("board:activity:new", onNew as EventListener);
  }, [tab]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const io = new IntersectionObserver(
      async (entries) => {
        if (!entries.some((x) => x.isIntersecting)) return;
        if (loading || !hasMore) return;

        setLoading(true);
        try {
          const next = await fetchSupabaseActivity({
            limit: PAGE_SIZE,
            offset,
            kinds,
          });

          const cleaned = Array.isArray(next) ? next : [];

          setItems((prev) => [...prev, ...cleaned]);
          setHasMore(cleaned.length === PAGE_SIZE);
          setOffset((p) => p + cleaned.length);
        } finally {
          setLoading(false);
        }
      },
      { threshold: 0.2 }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [sb, offset, hasMore, loading, tab, kinds]);

  return (
    <div className="page">
      <div className="bg" />

      <div className="shell">
        <div className="controls">
          <div className="leftControls">
            <div className="sectionTitle">Community Feed</div>

            <div className="tabs">
              <button
                className={clsx("tab", tab === "all" && "on")}
                onClick={() => setTab("all")}
              >
                All Drops
              </button>
              <button
                className={clsx("tab", tab === "announcements" && "on")}
                onClick={() => setTab("announcements")}
              >
                Announcements
              </button>
            </div>
          </div>

          <div className="miniNote">
            {loading ? "Loading…" : "Live feed"}
          </div>
        </div>

        <div className="layout">
          <section className="feed">
            <div className="cards">
              {safeItems.flatMap((a, i) => {
                const nodes = [
                  <ActivityCard key={a.id} item={a} onRemove={removeItemFromFeed} />,
                ];
                if ((i + 1) % FEED_WHISPER_EVERY === 0) {
                  const eventType =
                    FEED_WHISPER_CADENCE[
                      Math.floor(i / FEED_WHISPER_EVERY) % FEED_WHISPER_CADENCE.length
                    ];
                  nodes.push(
                    <BoardWhispers
                      key={`feed-whisper-${i}`}
                      whisper={createBoardWhisper({ id: `feed-whisper-${a.id}`, eventType })}
                    />
                  );
                }
                return nodes;
              })}
            </div>

            <div ref={sentinelRef} className="sentinel">
              {loading ? "Loading…" : hasMore ? "" : "End of feed"}
            </div>
          </section>

          <aside className="rightRail">
            <div className="dropConsoleSlot">
              <DropConsole />
            </div>
            <div className="bucketSlot">
              <DropsBucket />
            </div>
          </aside>
        </div>
      </div>

      <style jsx>{`
        .page {
          position: relative;
          min-height: 100vh;
          padding-bottom: 120px;
        }

        .bg {
          position: fixed;
          inset: 0;
          background: linear-gradient(
              180deg,
              rgba(255, 250, 210, 0.95),
              rgba(255, 244, 180, 0.85)
            ),
            radial-gradient(
              circle at 30% 0%,
              rgba(255, 235, 190, 0.55),
              transparent 60%
            );
          z-index: -1;
        }

        .shell {
          max-width: 1200px;
          margin: 0 auto;
          padding: 16px;
          display: grid;
          gap: 14px;
        }

        .controls {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
        }

        .leftControls {
          display: grid;
          gap: 10px;
        }

        .sectionTitle {
          font-family: Georgia, "Times New Roman", serif;
          font-size: 18px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.92);
          -webkit-text-stroke: 1.1px rgba(0, 0, 0, 0.95);
          text-shadow:
            1px 1px 0 rgba(0, 0, 0, 0.95),
            -1px 1px 0 rgba(0, 0, 0, 0.95),
            1px -1px 0 rgba(0, 0, 0, 0.95),
            -1px -1px 0 rgba(0, 0, 0, 0.95);
        }

        .tabs {
          display: flex;
          gap: 10px;
        }

        .tab {
          padding: 10px 16px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.9);
          border: 1px solid rgba(0, 0, 0, 0.1);
          color: rgba(35, 30, 18, 0.88);
          font-weight: 900;
          text-transform: uppercase;
          font-size: 12px;
          cursor: pointer;
        }

        .tab.on {
          color: rgb(0, 160, 80);
          box-shadow: 0 0 0 2px rgba(0, 160, 80, 0.15);
        }

        .miniNote {
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.16em;
          opacity: 0.5;
          text-transform: uppercase;
        }

        .layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 420px;
          gap: 16px;
          align-items: start;
        }

        .feed {
          min-width: 0;
        }

        .cards {
          display: grid;
          gap: 14px;
        }

        .rightRail {
          position: sticky;
          top: 16px;
          display: grid;
          gap: 14px;
        }

        .sentinel {
          padding: 16px;
          text-align: center;
          font-size: 11px;
          font-weight: 900;
          opacity: 0.4;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        @media (max-width: 980px) {
          .layout {
            display: flex;
            flex-direction: column;
          }
          .dropConsoleSlot {
            order: 1;
          }
          .feed {
            order: 2;
          }
          .rightRail {
            display: contents;
            position: static;
          }
          .bucketSlot {
            order: 3;
          }
        }
      `}</style>
    </div>
  );
}
