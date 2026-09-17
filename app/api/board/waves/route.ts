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

function cleanUsername(value: unknown) {
  return typeof value === "string"
    ? value.trim().replace(/^@+/, "").toLowerCase()
    : "";
}

function looksLikeUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

async function actorProfile(
  supabase: ReturnType<typeof supabaseServer>,
  userId: string
) {
  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, board_style")
    .eq("id", userId)
    .maybeSingle();
  const style =
    data?.board_style && typeof data.board_style === "object" ? data.board_style : {};
  return {
    id: userId,
    username: String(data?.username || (style as any)?.username || "")
      .replace(/^@+/, "")
      .toLowerCase(),
    displayName:
      String(data?.display_name || (style as any)?.displayName || "").trim() ||
      "Board User",
    avatarUrl: String(data?.avatar_url || (style as any)?.avatarUrl || "").trim(),
  };
}

export async function POST(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return json({ ok: false, message: "Log in to send a Wave." }, 401);
  }

  try {
    const body = await req.json();
    const username = cleanUsername(body?.to || body?.username || body?.recipientUsername);
    const recipientHint = typeof body?.recipientId === "string" ? body.recipientId.trim() : "";

    let recipientId = "";
    if (looksLikeUuid(recipientHint)) {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", recipientHint)
        .maybeSingle();
      recipientId = data?.id ? String(data.id) : "";
    }
    if (!recipientId && username) {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username)
        .maybeSingle();
      recipientId = data?.id ? String(data.id) : "";
    }

    if (!recipientId) {
      return json({ ok: false, message: "Could not find that Board to Wave at." }, 404);
    }
    if (recipientId === user.id) {
      return json({ ok: false, message: "You cannot Wave at your own Board." }, 400);
    }

    const actor = await actorProfile(supabase, user.id);
    const other = await actorProfile(supabase, recipientId);
    const { data: reverse, error: reverseError } = await supabase
      .from("board_notifications")
      .select("id")
      .eq("recipient_id", user.id)
      .eq("actor_id", recipientId)
      .in("activity_type", ["wave", "friendzone_request"])
      .limit(1);

    const mutual = !reverseError && Boolean(reverse?.length);
    const activityType = mutual ? "friendzone_connected" : "friendzone_request";
    const recipientMessage = mutual
      ? `You and ${actor.displayName} are now in each other's Friendzone.`
      : `${actor.displayName} wants to enter your Friendzone.`;

    const result = await createBoardNotification(supabase, {
      recipientId,
      actorId: user.id,
      activityType,
      entityType: "profile",
      entityId: user.id,
      friendzoneRequestId: `wave:${user.id}:${recipientId}`,
      message: recipientMessage,
      href: actor.username ? `/board/profile/${actor.username}` : "/board/profile",
      imageUrl: actor.avatarUrl || null,
      metadata: {
        actorName: actor.displayName,
        actorUsername: actor.username,
        actorAvatar: actor.avatarUrl,
        wave: true,
        mutual,
      },
      priority: mutual ? "medium" : "high",
      actionRequired: !mutual,
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

    if (mutual) {
      await createBoardNotification(supabase, {
        recipientId: user.id,
        actorId: user.id,
        activityType: "friendzone_connected",
        entityType: "profile",
        entityId: recipientId,
        message: `You and ${other.displayName} are now in each other's Friendzone.`,
        href: other.username ? `/board/profile/${other.username}` : "/board/profile",
        imageUrl: other.avatarUrl || null,
        metadata: {
          actorName: other.displayName,
          actorUsername: other.username,
          actorAvatar: other.avatarUrl,
          otherUserId: recipientId,
          mutual: true,
        },
        priority: "medium",
        actionRequired: false,
      });
    }

    return json({ ok: true, mutual, notificationId: result.id });
  } catch (err) {
    return json(
      {
        ok: false,
        message: err instanceof Error ? err.message : "Could not send Wave.",
      },
      500
    );
  }
}
