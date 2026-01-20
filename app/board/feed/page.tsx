"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

import HomeBoardHeader from "@/app/components/board/HomeBoardHeader";
import DropConsole from "@/app/components/board/DropConsole";
import DropsBucket from "@/app/components/board/DropsBucket";
import ActivityCard from "@/app/components/board/ActivityCard";

import {
  fetchActivity,
  getLocalActivity,
  type BoardActivity,
  type BoardActivityKind,
} from "@/lib/board/activity";

import { installBucketBrainBridge } from "@/lib/board/bucketBrain";

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const PAGE_SIZE = 12;

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

export default function HomeBoardFeedPage() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const [tab, setTab] = useState<"all" | "announcements">("all");
  const [items, setItems] = useState<BoardActivity[]>([]);
  const [loading, setLoading] = useState(true);

  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const kinds = useMemo<BoardActivityKind[] | undefined>(() => {
    return tab === "announcements" ? ["announcement"] : undefined;
  }, [tab]);

  const safeItems = useMemo(
    () => (Array.isArray(items) ? items : []).filter(Boolean),
    [items]
  );

  useEffect(() => {
    installBucketBrainBridge();
  }, []);

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setOffset(0);
      setHasMore(true);

      try {
        const data = await fetchActivity(sb as any, {
          limit: PAGE_SIZE,
          offset: 0,
          kinds,
        });

        if (!alive) return;

        const list = Array.isArray(data)
          ? data
          : Array.isArray((data as any)?.items)
          ? (data as any).items
          : [];

        const cleaned = (list as any[])
          .map(normalizeIncoming)
          .filter(Boolean) as BoardActivity[];

        setItems(cleaned);
        setHasMore(cleaned.length === PAGE_SIZE);
        setOffset(cleaned.length);
      } catch {
        const local = getLocalActivity().slice(0, PAGE_SIZE);
        const cleaned = (local as any[])
          .map(normalizeIncoming)
          .filter(Boolean) as BoardActivity[];

        setItems(cleaned);
        setHasMore(cleaned.length === PAGE_SIZE);
        setOffset(cleaned.length);
      } finally {
        if (alive) setLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [sb, tab, kinds]);

  useEffect(() => {
    const onNew = (e: any) => {
      const a = normalizeIncoming(e?.detail);
      if (!a) return;
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
          const next = await fetchActivity(sb as any, {
            limit: PAGE_SIZE,
            offset,
            kinds,
          });

          const list = Array.isArray(next)
            ? next
            : Array.isArray((next as any)?.items)
            ? (next as any).items
            : [];

          const cleaned = (list as any[])
            .map(normalizeIncoming)
            .filter(Boolean) as BoardActivity[];

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
        <HomeBoardHeader />

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
              {safeItems.map((a) => (
                <ActivityCard key={a.id} item={a} />
              ))}
            </div>

            <div ref={sentinelRef} className="sentinel">
              {loading ? "Loading…" : hasMore ? "" : "End of feed"}
            </div>
          </section>

          <aside className="rightRail">
            <DropConsole />
            <DropsBucket />
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
          font-size: 13px;
          font-weight: 900;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          opacity: 0.6;
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
            grid-template-columns: 1fr;
          }
          .rightRail {
            position: static;
          }
        }
      `}</style>
    </div>
  );
}
