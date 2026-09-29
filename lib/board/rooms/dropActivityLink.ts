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
  }
): Promise<void> {
  const dropId = String(input.dropId || "").trim();
  const roomId = String(input.roomId || "").trim();
  if (!dropId || !roomId) return;

  try {
    const { data: rows, error } = await supabase
      .from("board_activity")
      .select("id, meta")
      .eq("kind", "board_drop")
      .filter("meta->>dropId", "eq", dropId)
      .limit(20);
    if (error || !rows?.length) return;

    const conversationId = input.conversationId ? String(input.conversationId).trim() : null;
    const forumHref = forumDropPath({ roomId, conversationId });
    if (!forumHref) return;

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
  } catch {
    // Best-effort — a missing/renamed board_activity table must never block the share/reply itself.
  }
}
