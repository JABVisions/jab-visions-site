"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import {
  BOARD_NOTIFICATIONS_UPDATED_EVENT,
  groupNotifications,
  mapNotificationRow,
  matchesActivityFilter,
  mergeNotificationLists,
  unreadCount as countUnread,
  type ActivityFilter,
  type BoardNotification,
  type GroupedActivity,
} from "@/lib/board/notifications";

type ActivityContextValue = {
  items: BoardNotification[];
  grouped: GroupedActivity[];
  filter: ActivityFilter;
  setFilter: (filter: ActivityFilter) => void;
  unreadCount: number;
  loading: boolean;
  loadingMore: boolean;
  setupRequired: boolean;
  hasMore: boolean;
  ready: boolean;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  markRead: (ids: string[]) => Promise<void>;
  markSeen: (ids?: string[]) => Promise<void>;
};

const ActivityContext = createContext<ActivityContextValue | null>(null);

const PAGE = 24;

async function fetchPage(filter: ActivityFilter, before?: string | null) {
  const params = new URLSearchParams({
    filter,
    limit: String(PAGE),
  });
  if (before) params.set("before", before);
  const res = await fetch(`/api/board/notifications?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
  const payload = await res.json().catch(() => null);
  return { res, payload };
}

export function ActivityProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<BoardNotification[]>([]);
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const applyPayload = useCallback(
    (payload: any, append: boolean) => {
      const next = Array.isArray(payload?.items)
        ? payload.items
            .map((row: Record<string, unknown>) => mapNotificationRow(row))
            .filter((row: BoardNotification | null): row is BoardNotification => Boolean(row))
        : [];
      setSetupRequired(Boolean(payload?.setupRequired));
      setHasMore(Boolean(payload?.nextCursor));
      if (typeof payload?.unreadCount === "number") setUnreadCount(payload.unreadCount);
      setItems((current) => (append ? mergeNotificationLists(current, next) : next));
    },
    []
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { payload } = await fetchPage(filterRef.current);
      if (payload?.ok) applyPayload(payload, false);
      else if (payload?.setupRequired) {
        setSetupRequired(true);
        setItems([]);
      }
    } catch {
      // Keep the last known inbox rather than flashing empty.
    } finally {
      setLoading(false);
      setReady(true);
    }
  }, [applyPayload]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    const before = items[items.length - 1]?.createdAt;
    if (!before) return;
    setLoadingMore(true);
    try {
      const { payload } = await fetchPage(filterRef.current, before);
      if (payload?.ok) applyPayload(payload, true);
    } finally {
      setLoadingMore(false);
    }
  }, [applyPayload, hasMore, items, loadingMore]);

  const patchStatus = useCallback(async (action: "read" | "seen", ids?: string[], all?: boolean) => {
    const body = all ? { action, all: true } : { action, ids };
    const now = new Date().toISOString();
    setItems((current) => {
      if (action === "read") {
        const newlyRead = current.filter(
          (item) => (all || ids?.includes(item.id)) && !item.readAt
        ).length;
        if (newlyRead) setUnreadCount((count) => Math.max(0, all ? 0 : count - newlyRead));
      }
      return current.map((item) => {
        if (!all && ids && !ids.includes(item.id)) return item;
        if (action === "seen") return { ...item, seenAt: item.seenAt || now };
        return { ...item, readAt: item.readAt || now, seenAt: item.seenAt || now };
      });
    });
    try {
      await fetch("/api/board/notifications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      // Local state already updated; next refresh reconciles.
    }
  }, []);

  const markRead = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;
      await patchStatus("read", ids);
    },
    [patchStatus]
  );

  const markSeen = useCallback(
    async (ids?: string[]) => {
      await patchStatus("seen", ids, !ids?.length);
    },
    [patchStatus]
  );

  useEffect(() => {
    let alive = true;
    const supabase = supabaseBrowser();
    supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      setUserId(data.user?.id ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      setUnreadCount(0);
      setLoading(false);
      setReady(true);
      return;
    }
    void refresh();
  }, [userId, filter, refresh]);

  useEffect(() => {
    if (!userId) return;
    const supabase = supabaseBrowser();
    const channel = supabase
      .channel(`board-notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "board_notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          const row = mapNotificationRow(
            (payload.new || payload.old || {}) as Record<string, unknown>
          );
          if (!row) {
            void refresh();
            return;
          }
        if (payload.eventType === "DELETE") {
            setItems((current) => current.filter((item) => item.id !== row.id));
            return;
          }
          if (!matchesActivityFilter(row, filterRef.current) && filterRef.current !== "all") {
            return;
          }
          setItems((current) => {
            const existed = current.some((item) => item.id === row.id);
            if (payload.eventType === "INSERT" && !row.readAt && !existed) {
              setUnreadCount((count) => count + 1);
            }
            return mergeNotificationLists(current, [row]);
          });
        }
      )
      .subscribe();

    const onLocal = () => {
      void refresh();
    };
    window.addEventListener(BOARD_NOTIFICATIONS_UPDATED_EVENT, onLocal as EventListener);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener(BOARD_NOTIFICATIONS_UPDATED_EVENT, onLocal as EventListener);
    };
  }, [refresh, userId]);

  const grouped = useMemo(() => groupNotifications(items), [items]);
  const derivedUnread = useMemo(() => countUnread(items), [items]);

  const value = useMemo<ActivityContextValue>(
    () => ({
      items,
      grouped,
      filter,
      setFilter,
      unreadCount: Math.max(unreadCount, derivedUnread),
      loading,
      loadingMore,
      setupRequired,
      hasMore,
      ready,
      refresh,
      loadMore,
      markRead,
      markSeen,
    }),
    [
      derivedUnread,
      filter,
      grouped,
      hasMore,
      items,
      loadMore,
      loading,
      loadingMore,
      markRead,
      markSeen,
      ready,
      refresh,
      setupRequired,
      unreadCount,
    ]
  );

  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>;
}

export function useActivityChannel() {
  const value = useContext(ActivityContext);
  if (!value) {
    throw new Error("useActivityChannel must be used within ActivityProvider");
  }
  return value;
}

export function useActivityChannelOptional() {
  return useContext(ActivityContext);
}
