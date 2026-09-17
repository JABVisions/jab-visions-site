import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  createBoardNotification,
  isMissingNotificationsError,
} from "@/lib/board/createNotification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function cleanText(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanUuid(value: unknown) {
  const id = cleanText(value, 80);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id
    : "";
}

function reactionCopy(reaction: string, actorName: string, dropTitle: string) {
  if (reaction === "pin") return `${actorName} pinned ${dropTitle}.`;
  if (reaction === "push") return `${actorName} pushed ${dropTitle}.`;
  return `${actorName} signaled ${dropTitle}.`;
}

async function resolveDropOwner(
  supabase: ReturnType<typeof supabaseServer>,
  dropId: string,
  providedOwnerId: string
) {
  let activity:
    | {
        user_id?: string | null;
        title?: string | null;
        href?: string | null;
        image_url?: string | null;
        meta?: Record<string, unknown> | null;
      }
    | null = null;

  if (dropId) {
    const { data } = await supabase
      .from("board_activity")
      .select("user_id, title, href, image_url, meta")
      .eq("meta->>dropId", dropId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    activity = data;
  }

  if (!activity && /^[0-9a-f-]{36}$/i.test(dropId)) {
    const { data } = await supabase
      .from("board_activity")
      .select("user_id, title, href, image_url, meta")
      .eq("id", dropId)
      .maybeSingle();
    activity = data;
  }

  if (activity?.user_id) return { ownerId: String(activity.user_id), activity };

  if (!providedOwnerId) return { ownerId: "", activity };

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
    dropId &&
    Array.isArray((boardStyle as any)?.boardDrops) &&
    (boardStyle as any).boardDrops.some((drop: any) => String(drop?.id ?? "") === dropId);

  return { ownerId: ownsDrop ? providedOwnerId : "", activity };
}

export async function POST(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return json({ ok: false, message: "Log in to send a Reaction Rail signal." }, 401);
  }

  try {
    const body = await req.json();
    const reactionRaw = cleanText(body?.reaction || body?.folder, 12).toLowerCase();
    const reaction =
      reactionRaw === "pin" || reactionRaw === "push" || reactionRaw === "pass"
        ? reactionRaw
        : "pass";
    const activityId = cleanText(body?.activityId, 240);
    const dropId = cleanText(body?.dropId || body?.canonicalDropId || activityId, 240);
    const providedOwnerId = cleanUuid(body?.ownerUserId || body?.dropOwnerUserId);
    const dropTitle = cleanText(body?.dropTitle, 240) || "Drop";
    const dropHref = cleanText(body?.dropHref, 2000);
    const dropImageUrl = cleanText(body?.dropImageUrl, 2000);
    const dropType = cleanText(body?.dropType, 80);

    const { ownerId, activity } = await resolveDropOwner(supabase, dropId, providedOwnerId);
    if (!ownerId) {
      return json({ ok: true, skipped: true, reason: "owner_unresolved" });
    }
    if (ownerId === user.id) {
      return json({ ok: true, skipped: true, reason: "self" });
    }

    const { data: actorRow } = await supabase
      .from("profiles")
      .select("username, display_name, avatar_url, board_style")
      .eq("id", user.id)
      .maybeSingle();
    const style =
      actorRow?.board_style && typeof actorRow.board_style === "object"
        ? actorRow.board_style
        : {};
    const actorName =
      String(actorRow?.display_name || (style as any)?.displayName || "").trim() || "Someone";
    const actorUsername = String(actorRow?.username || "").replace(/^@+/, "").toLowerCase();
    const actorAvatar = String(actorRow?.avatar_url || (style as any)?.avatarUrl || "");
    const title = String(activity?.title || dropTitle);
    const sourceMeta =
      activity?.meta && typeof activity.meta === "object" ? activity.meta : {};

    const activityType = reaction === "pass" ? "signal" : "reaction";
    const result = await createBoardNotification(supabase, {
      recipientId: ownerId,
      actorId: user.id,
      activityType,
      entityType: "drop",
      entityId: dropId || activityId,
      dropId: dropId || activityId,
      signalId: `${reaction}:${dropId || activityId}`,
      message: reactionCopy(reaction, actorName, title),
      href: activity?.href || dropHref || null,
      imageUrl: activity?.image_url || dropImageUrl || null,
      metadata: {
        actorName,
        actorUsername,
        actorAvatar,
        dropTitle: title,
        dropType: dropType || sourceMeta.dropType || sourceMeta.mediaKind || null,
        reaction,
        activityId,
        mediaKind: sourceMeta.mediaKind ?? null,
      },
      priority: reaction === "push" ? "medium" : "normal",
      actionRequired: false,
      groupKey: `${reaction}:${dropId || activityId}`,
    });

    if (result.error && isMissingNotificationsError(result.error)) {
      return json(
        {
          ok: false,
          setupRequired: true,
          message:
            "Activity Channel is not installed in Supabase yet. Run supabase/sql/board_notifications.sql, then refresh Board.",
        },
        500
      );
    }

    if (result.error) {
      return json({ ok: false, message: result.error.message || "Could not record signal." }, 500);
    }

    return json({ ok: true, skipped: result.skipped, notificationId: result.id });
  } catch (err) {
    return json(
      {
        ok: false,
        message: err instanceof Error ? err.message : "Could not record Reaction Rail signal.",
      },
      500
    );
  }
}
