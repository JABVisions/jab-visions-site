"use client";

import { useEffect, useRef, useState } from "react";
import * as SupabaseBrowser from "@/lib/supabase/browser";
import { trackEvent } from "@/lib/supabase/ga";

type PostType = "status" | "announcement";

type BoardPost = {
  id: string;
  user_id: string;
  type: PostType;
  content: string;
  created_at: string;
};

const PAGE_SIZE = 10;

function getSupabaseClient() {
  const anyMod = SupabaseBrowser as any;

  // Try the most common export patterns
  return (
    anyMod.supabase || // export const supabase = createClient(...)
    anyMod.client || // export const client = ...
    anyMod.browserClient || // export const browserClient = ...
    anyMod.default // export default ...
  );
}

export default function BoardNewsFeed() {
  const supabase = getSupabaseClient();

  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const [type, setType] = useState<PostType>("status");
  const [content, setContent] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const oldestRef = useRef<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadInitial = async () => {
    if (!supabase) {
      setError("Supabase client not found. Check lib/supabase/browser.ts exports.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("board_posts")
      .select("id,user_id,type,content,created_at")
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    const list = (data || []) as BoardPost[];
    setPosts(list);
    oldestRef.current = list.at(-1)?.created_at ?? null;
    setHasMore(list.length === PAGE_SIZE);
    setLoading(false);
  };

  const loadMore = async () => {
    if (!supabase || !hasMore || loadingMore || !oldestRef.current) return;

    setLoadingMore(true);

    const { data, error } = await supabase
      .from("board_posts")
      .select("id,user_id,type,content,created_at")
      .order("created_at", { ascending: false })
      .lt("created_at", oldestRef.current)
      .limit(PAGE_SIZE);

    if (!error && data?.length) {
      setPosts((prev) => [...prev, ...(data as BoardPost[])]);
      oldestRef.current = data.at(-1)?.created_at ?? null;
      setHasMore(data.length === PAGE_SIZE);
    }

    setLoadingMore(false);
  };

  useEffect(() => {
    loadInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime inserts
  useEffect(() => {
    if (!supabase?.channel) return;

    const channel = supabase
      .channel("board_posts_feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "board_posts" },
        (payload: any) => {
          const post = payload.new as BoardPost;
          setPosts((prev) =>
            prev.some((p) => p.id === post.id) ? prev : [post, ...prev]
          );
          trackEvent("board_feed_realtime_insert");
        }
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {
        // ignore
      }
    };
  }, [supabase]);

  // Infinite scroll observer
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && loadMore(),
      { threshold: 0.2 }
    );

    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loadingMore, supabase]);

  const submitPost = async () => {
    if (!supabase) {
      setError("Supabase client not found. Check lib/supabase/browser.ts exports.");
      return;
    }

    if (!content.trim()) return;

    setPosting(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("You must be logged in to post.");
      setPosting(false);
      return;
    }

    const { error } = await supabase.from("board_posts").insert({
      user_id: user.id,
      type,
      content: content.trim(),
    });

    if (error) {
      setError(error.message);
    } else {
      trackEvent("board_post_create", { type });
      setContent("");
    }

    setPosting(false);
  };

  return (
    <section className="mt-12">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-sm font-semibold uppercase tracking-[0.25em] text-[#d5ff00]">
          Board Feed
        </h2>

        {/* Composer */}
        <div className="mt-4 rounded-2xl bg-black/40 border border-white/10 backdrop-blur-xl p-4">
          <div className="flex items-center gap-2">
            {(["status", "announcement"] as PostType[]).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`rounded-full px-4 py-1.5 text-[10px] uppercase tracking-[0.2em] transition ${
                  type === t
                    ? "bg-[#d5ff00]/20 text-[#d5ff00]"
                    : "bg-black/30 text-gray-300 hover:text-[#ff00c8]"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Post an update to the Board..."
            className="mt-3 w-full rounded-xl bg-black/40 border border-white/10 p-3 text-sm text-white outline-none focus:border-[#d5ff00]/40"
          />

          <div className="mt-3 flex justify-end">
            <button
              onClick={submitPost}
              disabled={posting}
              className="rounded-full bg-[#ff00c8]/20 border border-[#ff00c8]/40 px-5 py-2 text-[10px] uppercase tracking-[0.2em] text-[#ff00c8] hover:bg-[#ff00c8]/30 disabled:opacity-50"
            >
              {posting ? "Posting…" : "Post"}
            </button>
          </div>

          {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
        </div>

        {/* Feed */}
        <div className="mt-6 space-y-4">
          {loading && (
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white/70">
              Loading feed...
            </div>
          )}

          {!loading && posts.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white/70">
              No posts yet. Be the first to post.
            </div>
          )}

          {posts.map((p) => (
            <article
              key={p.id}
              className={`rounded-2xl p-4 border backdrop-blur-xl ${
                p.type === "announcement"
                  ? "bg-[#00ff7b]/10 border-[#00ff7b]/30"
                  : "bg-black/30 border-white/10"
              }`}
            >
              <div className="flex justify-between text-[10px] uppercase tracking-[0.2em]">
                <span
                  className={
                    p.type === "announcement"
                      ? "text-[#00ff7b]"
                      : "text-[#d5ff00]"
                  }
                >
                  {p.type}
                </span>
                <time className="text-white/40">
                  {new Date(p.created_at).toLocaleString()}
                </time>
              </div>

              <p className="mt-2 whitespace-pre-wrap text-sm text-white/85">
                {p.content}
              </p>
            </article>
          ))}

          <div ref={sentinelRef} className="h-12" />

          {loadingMore && (
            <p className="text-center text-xs text-white/50">
              Loading more…
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
