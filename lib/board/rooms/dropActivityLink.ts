import type { SupabaseClient } from "@supabase/supabase-js";
import { forumDropPath } from "@/lib/board/boardAuthor";

/**
 * Point the Feed back at the Forum Room a Drop lives in.
 *
 * Drop Studio already stamps `meta.roomId`/`meta.forumHref` on `board_activity`
 * when a Drop is *created* inside a Room. But most Room Drops are an existing
 * Drop *shared* into a Room (or replied with in a Room conversation) — that
 * path never touched the original activity row, so the Feed never showed an
 * "Open Room" link for it. This patches that row in after the fact.
 *
 * First Room wins: if the Drop already has a `roomId`, leave it alone so a
 * Drop shared into several Rooms keeps pointing at wherever it first landed.
 *
 * Some Drops never got a `board_activity` row at all — they only ever live
 * as a raw entry in `profiles.board_style.boardDrops` (synthesized into the
 * Feed by `normalizeProfileBoardDrop`). When `userId` is provided, also patch
 * that entry's own `.meta` in place so those Drops get the link too.
 */
export async function linkDropActivityToRoom(
  supabase: SupabaseClient,
  input: {
    dropId: string;
    roomId: string;
    roomName?: string | null;
    roomIcon?: string | null;
    conversationId?: string | null;
    conversationTitle?: string | null;
    userId?: string | null;
  }
): Promise<void> {
  const dropId = String(input.dropId || "").trim();
  const roomId = String(input.roomId || "").trim();
  if (!dropId || !roomId) return;

  const conversationId = input.conversationId ? String(input.conversationId).trim() : null;
  const forumHref = forumDropPath({ roomId, conversationId });
  if (!forumHref) return;

  try {
    const { data: rows, error } = await supabase
      .from("board_activity")
      .select("id, meta")
      .eq("kind", "board_drop")
      .filter("meta->>dropId", "eq", dropId)
      .limit(20);
    if (!error && rows?.length) {
      for (const row of rows as Array<{ id: string; meta: Record<string, unknown> | null }>) {
        const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
        if (meta.roomId) continue;
        const nextMeta = {
          ...meta,
          roomId,
          roomName: input.roomName || meta.roomName || null,
          roomIcon: input.roomIcon || meta.roomIcon || null,
          conversationId,
          conversationTitle: input.conversationTitle || null,
          destinationType: conversationId ? "room_conversation" : "room",
          forumHref,
        };
        await supabase.from("board_activity").update({ meta: nextMeta }).eq("id", row.id);
      }
    }
  } catch {
    // Best-effort — a missing/renamed board_activity table must never block the share/reply itself.
  }

  const userId = String(input.userId || "").trim();
  if (!userId) return;

  try {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("board_style")
      .eq("id", userId)
      .maybeSingle();
    if (profileError || !profile) return;

    const boardStyle =
      profile.board_style && typeof profile.board_style === "object"
        ? (profile.board_style as Record<string, unknown>)
        : {};
    const drops = Array.isArray(boardStyle.boardDrops)
      ? (boardStyle.boardDrops as Array<Record<string, unknown>>)
      : [];
    const index = drops.findIndex((drop) => String(drop?.id ?? "") === dropId);
    if (index === -1) return;

    const drop = drops[index];
    const meta =
      drop.meta && typeof drop.meta === "object" && !Array.isArray(drop.meta)
        ? (drop.meta as Record<string, unknown>)
        : {};
    if (meta.roomId) return;

    const nextDrops = [...drops];
    nextDrops[index] = {
      ...drop,
      meta: {
        ...meta,
        roomId,
        roomName: input.roomName || meta.roomName || null,
        roomIcon: input.roomIcon || meta.roomIcon || null,
        conversationId,
        conversationTitle: input.conversationTitle || null,
        destinationType: conversationId ? "room_conversation" : "room",
        forumHref,
      },
    };
    await supabase
      .from("profiles")
      .update({ board_style: { ...boardStyle, boardDrops: nextDrops } })
      .eq("id", userId);
  } catch {
    // Best-effort — a profile update failure must never block the share/reply itself.
  }
}
