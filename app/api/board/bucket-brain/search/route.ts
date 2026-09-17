import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  matchWorkBoards,
  mergePublicWorkBoardRows,
  previewsFromActivity,
  type ActivityPreviewRow,
  type PublicWorkBoardRow,
} from "@/lib/board/brain/searchWorkBoards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCE_TIMEOUT_MS = 4000;

function supabaseFromRequest() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anon) return null;

  const cookieStore = cookies();
  return createServerClient(url, anon, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (entries) => {
        try {
          entries.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // GET handlers may not persist refreshed auth cookies.
        }
      },
    },
  });
}

async function selectRows<T>(query: PromiseLike<{ data: T[] | null; error: unknown }>) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ data: T[]; error: Error }>((resolve) => {
    timeoutId = setTimeout(
      () => resolve({ data: [], error: new Error("bucket-brain search timed out") }),
      SOURCE_TIMEOUT_MS
    );
  });
  try {
    const result = await Promise.race([query, timeout]);
    return {
      data: Array.isArray(result.data) ? result.data : [],
      error: result.error,
    };
  } catch (error) {
    return { data: [] as T[], error };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function cleanIntent(
  value: string | null
): "work_board_search" | "creator_search" | "hybrid_query" | "board_content_search" {
  if (
    value === "work_board_search" ||
    value === "creator_search" ||
    value === "hybrid_query" ||
    value === "board_content_search"
  ) {
    return value;
  }
  return "work_board_search";
}

async function loadProfiles(client: { from: SupabaseClient["from"] } | null) {
  if (!client) return [] as PublicWorkBoardRow[];
  const { data } = await selectRows<PublicWorkBoardRow>(
    client
      .from("profiles")
      .select("id, username, display_name, bio, avatar_url, board_style")
      .order("updated_at", { ascending: false })
      .limit(80)
  );
  return data;
}

async function loadDirectoryRpc(client: { rpc?: (fn: string, args?: Record<string, never>) => PromiseLike<{ data: unknown; error: unknown }> } | null) {
  if (!client?.rpc) return [] as PublicWorkBoardRow[];
  try {
    const { data, error } = await selectRows<PublicWorkBoardRow>(
      client.rpc("list_friend_zone_profiles") as PromiseLike<{
        data: PublicWorkBoardRow[] | null;
        error: unknown;
      }>
    );
    if (error) return [];
    return data;
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  const supabase = supabaseFromRequest();
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim().slice(0, 180);
  const intent = cleanIntent(url.searchParams.get("intent"));

  if (!supabase) {
    return Response.json({ ok: true, items: [], status: "Board search is offline in this environment." });
  }

  let viewerId: string | null = null;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    viewerId = user?.id ?? null;
  } catch {
    viewerId = null;
  }

  const [{ data: activityRows }, tableProfiles, rpcProfiles] = await Promise.all([
    selectRows<ActivityPreviewRow>(
      supabase
        .from("board_activity")
        .select("id, user_id, kind, title, body, created_at, meta")
        .order("created_at", { ascending: false })
        .limit(120)
    ),
    loadProfiles(supabase),
    loadDirectoryRpc(supabase),
  ]);

  const profiles = mergePublicWorkBoardRows([rpcProfiles, tableProfiles]);
  const items = matchWorkBoards(profiles, q || "search work boards", {
    intent,
    previewsByUser: previewsFromActivity(activityRows),
    limit: 12,
    viewerId,
  });

  return Response.json({
    ok: true,
    items,
    status:
      items.length > 0
        ? `Found ${items.length} Work Board${items.length === 1 ? "" : "s"}.`
        : "No Work Boards found yet.",
  });
}
