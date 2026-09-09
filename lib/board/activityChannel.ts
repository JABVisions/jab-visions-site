"use client";

// Activity Channel model — a conversational "signal waterfall" for Drop Pad OS,
// populated from REAL Board activity:
//   • Signals      → derived from board_activity (your + others' drops) via the
//                    /api/board/activity feed, phrased conversationally.
//   • Interactions → real comments on your drops via /api/board/drop-comments.
//   • Drop notes   → a compact preview attached only to notable drops (visual,
//                    or ones that have drawn interaction).
//   • Whispers     → soft observations derived from your real activity patterns.
// `buildActivityChannelItems` is a synchronous local fallback (no demo data);
// `fetchActivityChannelItems` is the async Supabase-backed source.

import { getLocalActivity, type BoardActivity } from "./activity";

export type CompactDropType =
  | "vision"
  | "video"
  | "voice"
  | "thought"
  | "work"
  | "pay"
  | "store"
  | "announcement";

export type CompactDropPreview = {
  id: string;
  type: CompactDropType;
  title: string;
  description?: string;
  mediaUrl?: string;
};

export type ActivitySignalType =
  | "push"
  | "pin"
  | "wave"
  | "save"
  | "comment"
  | "momentum"
  | "bucket";

export type ActivityChannelItem =
  | {
      id: string;
      kind: "signal";
      message: string;
      signalType?: ActivitySignalType;
      timestamp: string;
      user?: { name: string; avatarUrl?: string };
      relatedDrop?: CompactDropPreview;
    }
  | {
      id: string;
      kind: "whisper";
      message: string;
      timestamp: string;
      intensity?: "soft" | "medium";
    };

function truncate(value: string, max = 44) {
  const v = String(value || "").trim();
  return v.length > max ? `${v.slice(0, max - 1)}…` : v;
}

function hashIndex(seed: string, mod: number) {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return mod > 0 ? h % mod : 0;
}

function compactTypeFromMeta(meta: Record<string, any> | null | undefined): CompactDropType {
  const t = String(meta?.dropType ?? meta?.drop_flavor ?? meta?.kind ?? "").toLowerCase();
  if (t.includes("video")) return "video";
  if (t.includes("voice") || t.includes("audio")) return "voice";
  if (t.includes("thought")) return "thought";
  if (t.includes("project") || t.includes("work")) return "work";
  if (t.includes("pay")) return "pay";
  if (t.includes("store")) return "store";
  if (t.includes("announce")) return "announcement";
  return "vision";
}

function typeLabel(type: CompactDropType) {
  if (type === "work") return "Work Drop";
  if (type === "announcement") return "Announcement";
  return `${type.charAt(0).toUpperCase()}${type.slice(1)} Drop`;
}

function ownerOf(a: BoardActivity): string {
  const m = a.meta ?? {};
  const name =
    (typeof m.authorName === "string" && m.authorName.trim()) ||
    (typeof m.ownerLabel === "string" && m.ownerLabel.trim()) ||
    (typeof m.authorUsername === "string" && m.authorUsername.trim()) ||
    (typeof m.ownerUsername === "string" && m.ownerUsername.trim()) ||
    "Someone";
  return String(name).replace(/^@+/, "");
}

function isMine(a: BoardActivity, userId?: string | null) {
  if (!userId) return false;
  const m = a.meta ?? {};
  return a.user_id === userId || m.authorId === userId;
}

function selfMessage(id: string, title: string, type: CompactDropType) {
  const t = typeLabel(type);
  const lines = [
    `Bucket Brain noticed your ${t} is gaining quiet momentum.`,
    `“${truncate(title, 26)}” keeps pulling people back.`,
    `A signal is forming around your latest ${t}.`,
    `Your ${t} is starting to catch a little orbit.`,
  ];
  return lines[hashIndex(id, lines.length)];
}

function othersMessage(owner: string, id: string, type: CompactDropType, title: string) {
  const t = typeLabel(type);
  const lines = [
    `${owner}’s ${t} is starting to catch a little orbit.`,
    `A signal formed around ${owner}’s latest ${t}.`,
    `${owner} pushed “${truncate(title, 22)}” back into motion.`,
    `${owner}’s ${t} keeps pulling people back.`,
  ];
  return lines[hashIndex(id, lines.length)];
}

function dropIdOf(a: BoardActivity) {
  const m = a.meta ?? {};
  return String(m.dropId ?? m.projectId ?? a.id);
}

function compactFromActivity(a: BoardActivity): CompactDropPreview {
  const type = compactTypeFromMeta(a.meta);
  return {
    id: dropIdOf(a),
    type,
    title: a.title || `${typeLabel(type)}`,
    description: a.body ? truncate(a.body, 80) : undefined,
    mediaUrl: a.image_url || undefined,
  };
}

function deriveWhispersFromActivity(
  acts: BoardActivity[],
  userId: string | null | undefined,
  interactionCount: number
): ActivityChannelItem[] {
  const mine = acts.filter((a) => isMine(a, userId));
  const byType = new Map<CompactDropType, number>();
  for (const a of mine) {
    const t = compactTypeFromMeta(a.meta);
    byType.set(t, (byType.get(t) ?? 0) + 1);
  }
  const top = [...byType.entries()].sort((a, b) => b[1] - a[1])[0];
  const now = Date.now();
  const out: ActivityChannelItem[] = [];

  if (top && top[1] >= 2) {
    out.push({
      id: "wsp_pattern",
      kind: "whisper",
      message: `A pattern is forming around your ${typeLabel(top[0])}s.`,
      timestamp: new Date(now - 3 * 60000).toISOString(),
      intensity: "soft",
    });
  }
  if (mine.length >= 3) {
    out.push({
      id: "wsp_louder",
      kind: "whisper",
      message: "Your Board is getting louder in one direction.",
      timestamp: new Date(now - 9 * 60000).toISOString(),
      intensity: "medium",
    });
  }
  if (interactionCount > 0) {
    out.push({
      id: "wsp_connected",
      kind: "whisper",
      message: "This signal feels connected to something you started earlier.",
      timestamp: new Date(now - 15 * 60000).toISOString(),
      intensity: "soft",
    });
  }
  return out;
}

function buildSignalsFromActivities(
  acts: BoardActivity[],
  userId: string | null | undefined,
  commentedDropIds: Set<string>
): ActivityChannelItem[] {
  const items: ActivityChannelItem[] = [];
  let othersCount = 0;

  for (const a of acts) {
    const type = compactTypeFromMeta(a.meta);
    const title = a.title || typeLabel(type);
    const mine = isMine(a, userId);
    const dropId = dropIdOf(a);
    // A drop only gets a preview when it's notable: it's visual, or it has drawn
    // interaction — keeps the channel mostly signals, few drops.
    const notable = Boolean(a.image_url) || commentedDropIds.has(dropId);

    if (!mine) {
      othersCount += 1;
      if (othersCount > 5) continue; // a handful of others' drop notes, not a feed
    }

    items.push({
      id: `act_${a.id}`,
      kind: "signal",
      signalType: mine ? "momentum" : "wave",
      message: mine
        ? selfMessage(a.id, title, type)
        : othersMessage(ownerOf(a), a.id, type, title),
      timestamp: a.created_at,
      user: mine
        ? undefined
        : {
            name: ownerOf(a),
            avatarUrl:
              typeof a.meta?.authorAvatar === "string" ? a.meta.authorAvatar : undefined,
          },
      relatedDrop: notable ? compactFromActivity(a) : undefined,
    });
  }
  return items;
}

/** Synchronous local fallback (no demo data) — used before the fetch resolves. */
export function buildActivityChannelItems(userId?: string | null): ActivityChannelItem[] {
  let acts: BoardActivity[] = [];
  try {
    acts = getLocalActivity()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 24);
  } catch {
    acts = [];
  }
  const items = buildSignalsFromActivities(acts, userId, new Set());
  items.push(...deriveWhispersFromActivity(acts, userId, 0));
  items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return items;
}

/** Real Supabase-backed source: board_activity feed + drop comments + whispers. */
export async function fetchActivityChannelItems(
  userId?: string | null
): Promise<ActivityChannelItem[]> {
  if (typeof window === "undefined") return [];

  let acts: BoardActivity[] = [];
  try {
    const res = await fetch(`/api/board/activity?limit=40`, { cache: "no-store" });
    const payload = await res.json().catch(() => null);
    if (res.ok && Array.isArray(payload?.items)) {
      acts = (payload.items as BoardActivity[]).filter(
        (a) => a && a.kind === "board_drop"
      );
    }
  } catch {
    acts = [];
  }

  acts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  acts = acts.slice(0, 30);

  // Real interactions: comments on YOUR drops, by others.
  const myDropIds = Array.from(
    new Set(acts.filter((a) => isMine(a, userId)).map((a) => dropIdOf(a)))
  ).slice(0, 60);

  const commentedDropIds = new Set<string>();
  const commentItems: ActivityChannelItem[] = [];

  if (myDropIds.length) {
    try {
      const params = new URLSearchParams({ dropIds: myDropIds.join(",") });
      const res = await fetch(`/api/board/drop-comments?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await res.json().catch(() => null);
      if (res.ok && payload?.ok && Array.isArray(payload.comments)) {
        const comments = (payload.comments as any[])
          .filter((c) => !userId || c.userId !== userId) // others only
          .slice(-12);
        for (const c of comments) {
          commentedDropIds.add(String(c.dropId));
          const who = c.displayName || (c.username ? `@${c.username}` : "Someone");
          commentItems.push({
            id: `cmt_${c.remoteId || c.id}`,
            kind: "signal",
            signalType: "comment",
            message: `${String(who).replace(/^@+/, "")} commented: “${truncate(
              c.body,
              40
            )}” — it keeps pulling people back.`,
            timestamp: c.createdAt,
            user: { name: String(who).replace(/^@+/, "") },
          });
        }
      }
    } catch {
      /* noop */
    }
  }

  const items: ActivityChannelItem[] = [
    ...buildSignalsFromActivities(acts, userId, commentedDropIds),
    ...commentItems,
    ...deriveWhispersFromActivity(acts, userId, commentItems.length),
  ];

  items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return items;
}
