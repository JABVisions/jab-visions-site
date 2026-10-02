import { supabaseServer } from "@/lib/supabase/server";
import { isMissingRoomsTable } from "@/lib/board/rooms/server";
import { normalizeDropVisibility } from "@/lib/board/rooms/livePrivacy";
import {
  forumRoomContextFromCatalog,
  type ForumContextConversation,
  type ForumContextShare,
  type ForumRoomContext,
} from "./forumContext";

export async function loadForumRoomContext(roomId: string | null | undefined): Promise<ForumRoomContext | null> {
  const base = forumRoomContextFromCatalog(roomId);
  if (!base) return null;

  try {
    const supabase = supabaseServer();
    const { data: posts, error: postsError } = await supabase
      .from("room_posts")
      .select("id, kind, title, body, parent_id, drop_id, metadata, created_at")
      .eq("room_id", base.roomId)
      .order("created_at", { ascending: false })
      .limit(40);
    const { data: shares, error: sharesError } = await supabase
      .from("room_drop_shares")
      .select("drop_id, snapshot, origin")
      .eq("room_id", base.roomId)
      .order("created_at", { ascending: false })
      .limit(20);

    const conversations: ForumContextConversation[] = [];
    const replies = new Map<string, string[]>();
    if (!postsError || !isMissingRoomsTable(postsError)) {
      for (const row of posts || []) {
        const kind = String((row as { kind?: string }).kind || "conversation");
        const parentId = String((row as { parent_id?: string }).parent_id || "");
        const body = String((row as { body?: string }).body || "").trim();
        if (kind === "reply" && parentId && body) {
          const list = replies.get(parentId) || [];
          if (list.length < 3) list.push(body);
          replies.set(parentId, list);
          continue;
        }
        if (kind === "conversation" || kind === "text_post" || kind === "announcement") {
          conversations.push({
            title: String((row as { title?: string }).title || "Conversation"),
            body,
          });
        }
      }
      for (const item of conversations) {
        const id = posts?.find((row) => String((row as { title?: string }).title || "") === item.title);
        if (id) item.replies = (replies.get(String((id as { id?: string }).id || "")) || []).map((body) => ({ body }));
      }
    }

    const publicShares: ForumContextShare[] = [];
    if (!sharesError || !isMissingRoomsTable(sharesError)) {
      for (const row of shares || []) {
        const snapshot =
          (row as { snapshot?: Record<string, unknown> }).snapshot &&
          typeof (row as { snapshot?: Record<string, unknown> }).snapshot === "object"
            ? ((row as { snapshot: Record<string, unknown> }).snapshot || {})
            : {};
        const visibility = normalizeDropVisibility(snapshot.visibility) || "public";
        if (visibility === "private") continue;
        publicShares.push({
          title: typeof snapshot.title === "string" ? snapshot.title : null,
          body:
            typeof snapshot.description === "string"
              ? snapshot.description
              : typeof snapshot.thoughtText === "string"
                ? snapshot.thoughtText
                : typeof snapshot.previewDescription === "string"
                  ? snapshot.previewDescription
                  : null,
          type: typeof snapshot.type === "string" ? snapshot.type : null,
          visibility,
          fromDescript: snapshot.fromDescript === true,
          fromDropbook: snapshot.fromDropbook === true,
        });
      }
    }

    return forumRoomContextFromCatalog(base.roomId, {
      conversations: conversations.length ? conversations : undefined,
      shares: publicShares,
    });
  } catch {
    return base;
  }
}
