import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import {
  creatorFromProfile,
  defaultWorkBoardSection,
  splitWorkBoardLibraries,
  type WorkBoardSection,
} from "@/lib/board/brain/workBoardPreview";

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

async function selectMaybe<T>(query: PromiseLike<{ data: T | null; error: unknown }>) {
  try {
    return await query;
  } catch (error) {
    return { data: null as T | null, error };
  }
}

async function selectRows<T>(query: PromiseLike<{ data: T[] | null; error: unknown }>) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ data: T[]; error: Error }>((resolve) => {
    timeoutId = setTimeout(
      () => resolve({ data: [], error: new Error("work-board preview timed out") }),
      SOURCE_TIMEOUT_MS
    );
  });
  try {
    const result = await Promise.race([query, timeout]);
    return {
      data: Array.isArray(result.data) ? result.data : [],
      error: "error" in result ? result.error : null,
    };
  } catch (error) {
    return { data: [] as T[], error };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function cleanSection(value: string | null): WorkBoardSection | null {
  return value === "assets" || value === "portfolio" ? value : null;
}

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  board_style: unknown;
};

export async function GET(
  req: Request,
  context: { params: { username: string } }
) {
  const supabase = supabaseFromRequest();
  const username = decodeURIComponent(context.params.username || "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "");
  const url = new URL(req.url);
  const creatorId = (url.searchParams.get("creatorId") || "").trim();
  const requestedSection = cleanSection(url.searchParams.get("section"));

  if (!supabase || !username) {
    return Response.json({ ok: false, error: "Work Board preview is offline." }, { status: 200 });
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

  const profileQuery = creatorId
    ? supabase
        .from("profiles")
        .select("id, username, display_name, bio, avatar_url, board_style")
        .eq("id", creatorId)
        .maybeSingle()
    : supabase
        .from("profiles")
        .select("id, username, display_name, bio, avatar_url, board_style")
        .eq("username", username)
        .maybeSingle();

  const { data: profile } = await selectMaybe<ProfileRow>(profileQuery);
  const creator = profile ? creatorFromProfile(profile, viewerId) : null;
  if (!creator) {
    return Response.json({ ok: false, error: "That Work Board is not available." }, { status: 200 });
  }

  const style = profile?.board_style && typeof profile.board_style === "object"
    ? (profile.board_style as Record<string, unknown>)
    : {};
  const boardDrops = Array.isArray(style.boardDrops) ? style.boardDrops : [];

  const { data: assetRows } = await selectRows<{
    id: string;
    kind: string | null;
    title: string | null;
    description: string | null;
    payload: unknown;
    created_at: string | null;
  }>(
    supabase
      .from("board_assets")
      .select("id, kind, title, description, payload, created_at")
      .eq("user_id", creator.id)
      .order("created_at", { ascending: false })
      .limit(80)
  );

  const { assets, portfolio } = splitWorkBoardLibraries(assetRows, boardDrops);
  const defaultSection = defaultWorkBoardSection(portfolio, assets, requestedSection);

  return Response.json({
    ok: true,
    creator,
    assets,
    portfolio,
    defaultSection,
  });
}
