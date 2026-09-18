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
import { getLocalActivity } from "@/lib/board/activity";
import { readBrain } from "@/lib/board/bucketBrain";
import { readCurrentBoardIdentity } from "@/lib/board/currentProfile";
import { readAllDropComments } from "@/lib/board/dropComments";
import {
  notificationFromActivityRow,
  notificationFromDropComment,
} from "@/lib/board/legacyNotifications";
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

const PAGE = 40;

function localOwnedDrops() {
  const items: Array<{
    id: string;
    title?: string;
    url?: string;
    linkUrl?: string;
    previewImage?: string;
    mediaUrl?: string;
  }> = [];
  const ids = new Set<string>();
  if (typeof window === "undefined") return { items, ids };
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || (key !== "jab_board_drops_v2" && !key.startsWith("jab_board_drops_v2:"))) continue;
      const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
      if (!Array.isArray(parsed)) continue;
      for (const drop of parsed) {
        const id = String(drop?.id || "").trim();
        if (!id || ids.has(id)) continue;
        ids.add(id);
        items.push(drop);
      }
    }
  } catch {
    return { items, ids };
  }
  return { items, ids };
}

function localHistoryNotifications(userId?: string | null): BoardNotification[] {
  if (typeof window === "undefined") return [];
  const me = readCurrentBoardIdentity().username.replace(/^@+/, "").toLowerCase();
  const recipientId = userId || me;
  if (!recipientId) return [];
  const brain = readBrain();
  const waves = (brain.waves ?? []).filter(
    (wave) => String(wave.to || "").replace(/^@+/, "").toLowerCase() === me
  );
  const mutuals = (brain.mutuals ?? []).filter(
    (entry) =>
      String(entry.a || "").replace(/^@+/, "").toLowerCase() === me ||
      String(entry.b || "").replace(/^@+/, "").toLowerCase() === me
  );

  const waveItems = waves.map((wave) => {
    const createdAt = new Date(wave.createdAt).toISOString();
    const from = String(wave.from || "").replace(/^@+/, "");
    return mapNotificationRow({
      id: `legacy-wave:${wave.id}`,
      recipientUserId: recipientId,
      actorUserId: null,
      activityType: "wave",
      entityType: "profile",
      message: `${from || "Someone"} waved at you.`,
      metadata: {
        legacyKey: `wave:${wave.id}`,
        actorName: from || "Someone",
        actorUsername: from,
      },
      priority: "medium",
      actionRequired: false,
      createdAt,
      readAt: createdAt,
      seenAt: createdAt,
    });
  });

  const mutualItems = mutuals.map((entry) => {
    const createdAt = new Date(entry.createdAt).toISOString();
    const other =
      String(entry.a || "").replace(/^@+/, "").toLowerCase() === me
        ? String(entry.b || "").replace(/^@+/, "")
        : String(entry.a || "").replace(/^@+/, "");
    return mapNotificationRow({
      id: `legacy-mutual:${entry.id}`,
      recipientUserId: recipientId,
      actorUserId: null,
      activityType: "friendzone_connected",
      entityType: "profile",
      message: `You and ${other || "a creator"} are now in each other's Friendzone.`,
      metadata: {
        legacyKey: `mutual:${entry.id}`,
        actorName: other || "Someone",
        actorUsername: other,
      },
      priority: "medium",
      actionRequired: false,
      createdAt,
      readAt: createdAt,
      seenAt: createdAt,
    });
  });

  const activityItems = userId
    ? getLocalActivity()
        .map((row) => notificationFromActivityRow(row as Record<string, any>, userId))
        .filter((item): item is BoardNotification => Boolean(item))
    : [];

  const localDrops = localOwnedDrops();
  const commentItems = userId
    ? readAllDropComments()
        .filter((comment) => {
          if (!localDrops.ids.has(comment.dropId)) return false;
          if (comment.userId && comment.userId === userId) return false;
          const username = String(comment.username || "").replace(/^@+/, "").toLowerCase();
          return !me || username !== me;
        })
        .map((comment) => {
          const drop = localDrops.items.find((item) => item.id === comment.dropId);
          return notificationFromDropComment(
            {
              id: comment.remoteId || comment.id,
              drop_id: comment.dropId,
              user_id: comment.userId,
              username: comment.username,
              display_name: comment.displayName,
              avatar_url: comment.avatarUrl,
              body: comment.body,
              created_at: comment.createdAt,
            },
            userId,
            drop
              ? {
                  id: drop.id,
                  title: drop.title || "Drop",
                  href: drop.url || drop.linkUrl || null,
                  imageUrl: drop.previewImage || drop.mediaUrl || null,
                }
              : { id: comment.dropId, title: "Drop" }
          );
        })
        .filter((item): item is BoardNotification => Boolean(item))
    : [];

  return mergeNotificationLists(
    [...waveItems, ...mutualItems].filter((item): item is BoardNotification => Boolean(item)),
    [...activityItems, ...commentItems]
  );
}

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
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const applyPayload = useCallback(
    (payload: any, append: boolean) => {
      const next = Array.isArray(payload?.items)
        ? payload.items
            .map((row: Record<string, unknown>) => mapNotificationRow(row))
            .filter((row: BoardNotification | null): row is BoardNotification => Boolean(row))
        : [];
      setSetupRequired(Boolean(payload?.setupRequired));
      setHasMore(Boolean(payload?.nextCursor));
      setUnreadCount(typeof payload?.unreadCount === "number" ? payload.unreadCount : 0);
      const withLocal = mergeNotificationLists(
        localHistoryNotifications(userIdRef.current).filter((item) =>
          matchesActivityFilter(item, filterRef.current)
        ),
        next
      );
      setItems((current) => (append ? mergeNotificationLists(current, withLocal) : withLocal));
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
