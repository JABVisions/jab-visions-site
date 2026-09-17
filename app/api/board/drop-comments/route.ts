import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { createBoardNotification } from "@/lib/board/createNotification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COMMENTS_TABLE = "board_drop_comments";

type DropCommentRow = {
  id: string;
  drop_id: string;
  user_id: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  body: string;
  created_at: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function isMissingTableError(error: { code?: string; message?: string } | null | undefined) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST205" ||
    error?.code === "42P01" ||
    message.includes(COMMENTS_TABLE) ||
    message.includes("schema cache")
  );
}

function commentStorageError(error: { code?: string; message?: string } | null | undefined) {
  if (isMissingTableError(error)) {
    return {
      ok: false,
      setupRequired: true,
      message:
        "Drop comments are not installed in Supabase yet. Run supabase/sql/board_drop_comments.sql in the Supabase SQL editor, then refresh Board.",
      hint: `Missing Supabase table "${COMMENTS_TABLE}".`,
    };
  }

  return {
    ok: false,
    message: error?.message || "Drop comments could not sync.",
    hint: `Check that the Supabase table "${COMMENTS_TABLE}" exists and has RLS policies for authenticated users.`,
  };
}

function cleanDropId(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 240) : "";
}

function cleanDropIds(value: unknown) {
  if (typeof value !== "string") return [];
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => cleanDropId(item))
        .filter(Boolean)
    )
  ).slice(0, 80);
}

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function cleanUserId(value: unknown) {
  const id = cleanText(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id
    : "";
}

async function resolveDropOwner(
  supabase: ReturnType<typeof supabaseServer>,
  threadDropId: string,
  canonicalDropId: string,
  providedOwnerId: string
) {
  const lookupId = canonicalDropId || threadDropId;
  let activity:
    | {
        user_id?: string | null;
        title?: string | null;
        href?: string | null;
        image_url?: string | null;
        meta?: Record<string, unknown> | null;
      }
    | null = null;

  if (lookupId) {
    const { data } = await supabase
      .from("board_activity")
      .select("user_id, title, href, image_url, meta")
      .eq("meta->>dropId", lookupId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    activity = data;
  }

  if (!activity && /^[0-9a-f-]{36}$/i.test(threadDropId)) {
    const { data } = await supabase
      .from("board_activity")
      .select("user_id, title, href, image_url, meta")
      .eq("id", threadDropId)
      .maybeSingle();
    activity = data;
  }

  if (activity?.user_id) {
    return { ownerId: activity.user_id, activity };
  }

  if (!providedOwnerId) return { ownerId: "", activity: null };

  // A client-provided owner is accepted only when that profile actually owns
  // the canonical drop in its persisted Board collection.
  const { data: ownerProfile } = await supabase
    .from("profiles")
    .select("id, board_style")
    .eq("id", providedOwnerId)
    .maybeSingle();
  const boardStyle =
    ownerProfile?.board_style && typeof ownerProfile.board_style === "object"
      ? ownerProfile.board_style
      : null;
  const ownsDrop =
    lookupId &&
    Array.isArray((boardStyle as any)?.boardDrops) &&
    (boardStyle as any).boardDrops.some(
      (drop: any) => String(drop?.id ?? "") === lookupId
    );

  return {
    ownerId: ownsDrop ? providedOwnerId : "",
    activity: null,
  };
}

function mapComment(row: DropCommentRow) {
  return {
    id: row.id,
    remoteId: row.id,
    dropId: row.drop_id,
    userId: row.user_id ?? undefined,
    username: row.username || "board",
    displayName: row.display_name || undefined,
    avatarUrl: row.avatar_url || undefined,
    body: row.body,
    createdAt: row.created_at,
  };
}

function countByDrop(rows: DropCommentRow[]) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.drop_id] = (acc[row.drop_id] ?? 0) + 1;
    return acc;
  }, {});
}

export async function GET(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return json({ ok: false, message: "Log in to load drop comments." }, 401);
  }

  const { searchParams } = new URL(req.url);
  const dropId = cleanDropId(searchParams.get("dropId"));
  const dropIds = cleanDropIds(searchParams.get("dropIds"));
  const ids = dropId ? [dropId] : dropIds;

  if (!ids.length) {
    return json({ ok: false, message: "Missing dropId." }, 400);
  }

  let query = supabase
    .from(COMMENTS_TABLE)
    .select("id, drop_id, user_id, username, display_name, avatar_url, body, created_at")
    .order("created_at", { ascending: true })
    .limit(600);

  query = ids.length === 1 ? query.eq("drop_id", ids[0]) : query.in("drop_id", ids);

  const { data, error } = await query;

  if (error) {
    return json(commentStorageError(error), 500);
  }

  const rows = (data || []) as DropCommentRow[];

  return json({
    ok: true,
    comments: rows.map(mapComment),
    counts: countByDrop(rows),
  });
}

export async function POST(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return json({ ok: false, message: "Log in to comment on drops." }, 401);
  }

  try {
    const body = await req.json();
    const dropId = cleanDropId(body?.dropId);
    const text = cleanText(body?.body);
    const username = cleanText(body?.username, "board").replace(/^@+/, "").toLowerCase();
    const displayName = cleanText(body?.displayName, "Board User");
    const avatarUrl = cleanText(body?.avatarUrl);
    const canonicalDropId = cleanDropId(body?.canonicalDropId);
    const providedOwnerId = cleanUserId(body?.dropOwnerUserId);
    const dropTitle = cleanText(body?.dropTitle, "Drop").slice(0, 240);
    const dropHref = cleanText(body?.dropHref).slice(0, 2000);
    const dropImageUrl = cleanText(body?.dropImageUrl).slice(0, 2000);

    if (!dropId) {
      return json({ ok: false, message: "Missing dropId." }, 400);
    }

    if (!text) {
      return json({ ok: false, message: "Comment cannot be blank." }, 400);
    }

    const { data, error } = await supabase
      .from(COMMENTS_TABLE)
      .insert({
        drop_id: dropId,
        user_id: user.id,
        username,
        display_name: displayName,
        avatar_url: avatarUrl || null,
        body: text,
      })
      .select("id, drop_id, user_id, username, display_name, avatar_url, body, created_at")
      .single();

    if (error) {
      return json(commentStorageError(error), 500);
    }

    const comment = mapComment(data as DropCommentRow);
    const { ownerId, activity } = await resolveDropOwner(
      supabase,
      dropId,
      canonicalDropId,
      providedOwnerId
    );

    // Store a private recipient activity owned by the commenter at the row
    // level (so normal RLS insert rules still hold). Profile filtering uses
    // recipientUserId to deliver it only to the drop owner.
    if (ownerId && ownerId !== user.id) {
      const sourceMeta =
        activity?.meta && typeof activity.meta === "object" ? activity.meta : {};
      await createBoardNotification(supabase, {
        recipientId: ownerId,
        actorId: user.id,
        activityType: "comment",
        entityType: "drop",
        entityId: canonicalDropId || dropId,
        dropId: canonicalDropId || dropId,
        commentId: comment.remoteId || comment.id,
        message: `${displayName || `@${username}`} commented on ${activity?.title || dropTitle}.`,
        preview: text,
        href: activity?.href || dropHref || null,
        imageUrl: activity?.image_url || dropImageUrl || null,
        metadata: {
          actorName: displayName,
          actorUsername: username,
          actorAvatar: avatarUrl || null,
          dropTitle: activity?.title || dropTitle,
          commentId: comment.remoteId || comment.id,
          commentDropId: dropId,
          referencedDropId: canonicalDropId || sourceMeta.dropId || dropId,
          mediaKind: sourceMeta.mediaKind ?? null,
        },
        priority: "medium",
        actionRequired: false,
      });
      await supabase.from("board_activity").insert({
        scope: "global",
        user_id: user.id,
        kind: "status",
        title: `${displayName || `@${username}`} commented on ${activity?.title || dropTitle}`,
        body: text,
        href: activity?.href || dropHref || null,
        image_url: activity?.image_url || dropImageUrl || null,
        meta: {
          activityType: "drop_comment_received",
          activityAudience: "recipient",
          visibility: "private",
          recipientUserId: ownerId,
          commenterUserId: user.id,
          authorId: user.id,
          authorUsername: username,
          authorName: displayName,
          authorAvatar: avatarUrl || null,
          commentId: comment.remoteId || comment.id,
          commentDropId: dropId,
          referencedDropId: canonicalDropId || sourceMeta.dropId || dropId,
          dropTitle: activity?.title || dropTitle,
          mediaKind: sourceMeta.mediaKind ?? null,
          bucket: sourceMeta.bucket ?? null,
          storagePath: sourceMeta.storagePath ?? null,
          fileName: sourceMeta.fileName ?? null,
          preview: sourceMeta.preview ?? null,
        },
      });
    }

    return json({ ok: true, comment });
  } catch (err) {
    return json(
      {
        ok: false,
        message: err instanceof Error ? err.message : "Could not save drop comment.",
      },
      500
    );
  }
}
