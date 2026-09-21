import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { persistableMediaUrl, type BoardActivity, type BoardActivityKind } from "@/lib/board/activity";
import {
  applyForumDropNavigation,
  authorFromProfileRow,
  hydrateActivityAuthor,
  pickBoardDisplayName,
} from "@/lib/board/boardAuthor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const SOURCE_TIMEOUT_MS = 3500;

function supabaseServer() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) =>
          cs.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
      },
    }
  );
}

function cleanKind(value: unknown): BoardActivityKind {
  const raw = String(value || "").trim();
  if (
    raw === "board_drop" ||
    raw === "forum_post" ||
    raw === "announcement" ||
    raw === "status" ||
    raw === "system"
  ) {
    return raw;
  }
  return "board_drop";
}

function normalizeActivityRow(row: any): BoardActivity | null {
  if (!row || typeof row !== "object") return null;
  const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
  if (meta.presence === true || meta.source === "board_presence") return null;
  const body = String(row.body ?? row.text ?? row.content ?? "").trim();
  const title = String(row.title ?? "").trim();
  if (!body && !title) return null;

  const created =
    typeof row.created_at === "string" && row.created_at
      ? row.created_at
      : new Date(row.createdAt ?? Date.now()).toISOString();

  return {
    id: String(row.id ?? `activity_${created}_${title || body}`),
    created_at: created,
    user_id: row.user_id ?? null,
    kind: cleanKind(row.kind),
    title: title || null,
    body: body || title || "Board Drop",
    href:
      persistableMediaUrl(row.href ?? row.url ?? row.link_url) ||
      persistableMediaUrl(meta.embedUrl) ||
      persistableMediaUrl(meta?.preview?.embedUrl),
    image_url:
      row.image_url ??
      row.imageUrl ??
      row.preview_image ??
      meta.previewImage ??
      meta?.preview?.image ??
      null,
    meta: Object.keys(meta).length ? meta : null,
  };
}

function normalizeLegacyBoardDrop(row: any): BoardActivity | null {
  if (!row || typeof row !== "object") return null;
  const created =
    typeof row.created_at === "string" && row.created_at
      ? row.created_at
      : new Date(row.createdAt ?? Date.now()).toISOString();
  const style =
    row.style_snapshot && typeof row.style_snapshot === "object"
      ? row.style_snapshot
      : {};
  const text = String(row.text ?? row.body ?? row.description ?? "").trim();
  const title = String(row.title ?? style.title ?? "Board Drop").trim();

  return {
    id: `legacy_board_drop_${String(row.id ?? created)}`,
    created_at: created,
    user_id: row.user_id ?? null,
    kind: "board_drop",
    title,
    body: text || "Board Drop",
    href: persistableMediaUrl(row.href ?? row.url ?? row.link_url),
    image_url:
      row.image_url ??
      row.imageUrl ??
      style.previewImage ??
      style.avatarDataUrl ??
      null,
    meta: {
      source: "board_drops",
      dropType: row.type ?? "board",
      styleSnapshot: style,
    },
  };
}

function normalizePostRow(row: any, source: string): BoardActivity | null {
  if (!row || typeof row !== "object") return null;
  const created =
    typeof row.created_at === "string" && row.created_at
      ? row.created_at
      : new Date(row.createdAt ?? Date.now()).toISOString();
  const body = String(row.content ?? row.body ?? row.text ?? "").trim();
  if (!body && !row.image_url) return null;

  return {
    id: `${source}_${String(row.id ?? created)}`,
    created_at: created,
    user_id: row.user_id ?? null,
    kind: "status",
    title: row.title ? String(row.title) : "Board Post",
    body: body || "New Board post.",
    href: persistableMediaUrl(row.href),
    image_url: row.image_url ?? row.imageUrl ?? null,
    meta: { source },
  };
}

function normalizeProfileBoardDrop(row: any): BoardActivity[] {
  if (!row || typeof row !== "object") return [];
  const boardStyle =
    row.board_style && typeof row.board_style === "object" ? row.board_style : null;
  if (!boardStyle || boardStyle.visibility === "private") return [];

  const drops = Array.isArray(boardStyle.boardDrops) ? boardStyle.boardDrops : [];
  const deletedIds = Array.isArray(boardStyle.boardDropsDeleted)
    ? boardStyle.boardDropsDeleted.map(String)
    : [];
  const ownerLabel =
    pickBoardDisplayName(boardStyle.displayName, row.display_name, row.username) ||
    "Board User";
  const ownerUsername =
    typeof row.username === "string" && row.username.trim()
      ? row.username.trim().toLowerCase()
      : null;

  return drops
    .filter((drop: any) => drop && typeof drop === "object")
    .filter((drop: any) => drop.visibility !== "private")
    .filter((drop: any) => {
      const id = String(drop.id ?? "");
      return id && !deletedIds.includes(id);
    })
    .map((drop: any): BoardActivity | null => {
      const id = String(drop.id ?? "");
      const type = String(drop.type ?? "Link");
      const isProjectDrop = /\bproject(\s+drop)?\b/i.test(type);
      const createdAt = Number(drop.createdAt ?? Date.now());
      const created = new Date(Number.isFinite(createdAt) ? createdAt : Date.now()).toISOString();
      const title = String(drop.title ?? `${ownerLabel}'s Board Drop`).trim();
      const description =
        typeof drop.description === "string" && drop.description.trim()
          ? drop.description.trim()
          : typeof drop.body === "string" && drop.body.trim()
            ? drop.body.trim()
            : `New ${type.toLowerCase()} drop from ${ownerLabel}.`;
      const previewImage =
        (typeof drop.previewImage === "string" && drop.previewImage.trim()) ||
        (drop.mediaKind === "image" &&
        typeof drop.mediaUrl === "string" &&
        drop.mediaUrl.trim()
          ? drop.mediaUrl
          : "") ||
        (typeof drop.imageUrl === "string" && drop.imageUrl.trim()
          ? drop.imageUrl
          : "") ||
        (type === "Media" && drop.mediaKind === "image" && typeof drop.url === "string"
          ? drop.url
          : "") ||
        (typeof drop.meta?.previewImage === "string" ? drop.meta.previewImage : "") ||
        "";
      const dropMeta =
        drop.meta && typeof drop.meta === "object" && !Array.isArray(drop.meta)
          ? drop.meta
          : {};
      const hostName =
        (typeof drop.contactName === "string" && drop.contactName.trim()) ||
        (typeof dropMeta.contactName === "string" && dropMeta.contactName.trim()) ||
        (typeof drop.authorName === "string" && drop.authorName.trim()) ||
        ownerLabel;
      const href =
        (type === "Pay" && typeof drop.linkUrl === "string" && drop.linkUrl.trim()) ||
        (typeof drop.url === "string" && drop.url.trim()) ||
        (typeof drop.embedUrl === "string" && drop.embedUrl.trim()) ||
        (typeof drop.mediaUrl === "string" && drop.mediaUrl.trim()) ||
        null;

      return {
        id: `profile_board_drop_${row.id ?? ownerUsername ?? "user"}_${id}`,
        created_at: created,
        user_id: row.id ?? null,
        kind: "board_drop",
        title: isProjectDrop && !/^Project Drop:\s*/i.test(title)
          ? `Project Drop: ${title}`
          : title,
        body: description,
        href,
        image_url: previewImage || null,
        meta: {
          ...dropMeta,
          source: dropMeta.source || "profiles.board_style.boardDrops",
          kind: isProjectDrop ? "project_drop" : dropMeta.kind ?? null,
          cardStyle: isProjectDrop ? "project_drop" : dropMeta.cardStyle ?? null,
          dropId: id,
          dropType: isProjectDrop ? "project" : type,
          projectId: isProjectDrop ? (dropMeta.projectId || id) : dropMeta.projectId ?? null,
          projectType: drop.projectType ?? dropMeta.projectType ?? (isProjectDrop ? type : null),
          location: drop.location ?? dropMeta.location ?? null,
          startDate: drop.startDate ?? dropMeta.startDate ?? null,
          endDate: drop.endDate ?? dropMeta.endDate ?? null,
          rolesNeeded: drop.rolesNeeded ?? dropMeta.rolesNeeded ?? null,
          contactName: hostName,
          contactEmail: drop.contactEmail ?? dropMeta.contactEmail ?? null,
          unionStatus: drop.unionStatus ?? dropMeta.unionStatus ?? null,
          compensationType: drop.compensationType ?? dropMeta.compensationType ?? null,
          status: drop.projectStatus ?? drop.status ?? dropMeta.status ?? null,
          hostLabel: drop.hostLabel ?? null,
          embedUrl: drop.embedUrl ?? null,
          previewTitle: drop.previewTitle ?? null,
          previewDescription: drop.previewDescription ?? null,
          previewImage: previewImage || null,
          previewImages: Array.isArray(drop.previewImages) ? drop.previewImages.slice(0, 4) : null,
          priceCents: typeof drop.priceCents === "number" ? drop.priceCents : null,
          payProvider: drop.payProvider ?? null,
          mediaKind: drop.mediaKind ?? dropMeta.mediaKind ?? drop.media?.kind ?? null,
          mediaUrl: drop.mediaUrl ?? drop.media?.src ?? null,
          storagePath: drop.storagePath ?? dropMeta.storagePath ?? drop.media?.storagePath ?? null,
          bucket: drop.bucket ?? dropMeta.bucket ?? drop.media?.bucket ?? null,
          fileName: drop.fileName ?? null,
          fromDescript: drop.fromDescript === true ? true : null,
          customizations: drop.customizations ?? null,
          ownerUsername,
          ownerLabel,
          authorName: hostName,
          authorUsername: ownerUsername,
          media: drop.media ?? dropMeta.media ?? null,
          preview: {
            image: previewImage || null,
            images: Array.isArray(drop.previewImages) ? drop.previewImages.slice(0, 4) : null,
            title: drop.previewTitle ?? title,
            description: drop.previewDescription ?? description,
            bucket: drop.bucket ?? null,
            storagePath: drop.storagePath ?? null,
            mediaKind: drop.mediaKind ?? null,
            mediaUrl: drop.mediaUrl ?? null,
            embedUrl: drop.embedUrl ?? dropMeta.embedUrl ?? null,
            customizations: drop.customizations ?? null,
          },
        },
      };
    })
    .filter(Boolean) as BoardActivity[];
}

function mergeActivityRecords(
  preferred: BoardActivity,
  fallback: BoardActivity
): BoardActivity {
  const preferredMeta =
    preferred.meta && typeof preferred.meta === "object" ? preferred.meta : {};
  const fallbackMeta =
    fallback.meta && typeof fallback.meta === "object" ? fallback.meta : {};
  const preferredPreview =
    preferredMeta.preview && typeof preferredMeta.preview === "object"
      ? preferredMeta.preview
      : {};
  const fallbackPreview =
    fallbackMeta.preview && typeof fallbackMeta.preview === "object"
      ? fallbackMeta.preview
      : {};

  return {
    ...fallback,
    ...preferred,
    title: preferred.title || fallback.title,
    body: preferred.body || fallback.body,
    href: persistableMediaUrl(preferred.href) || persistableMediaUrl(fallback.href),
    image_url: preferred.image_url || fallback.image_url,
    meta: {
      ...fallbackMeta,
      ...preferredMeta,
      embedUrl: persistableMediaUrl(preferredMeta.embedUrl) || persistableMediaUrl(fallbackMeta.embedUrl),
      preview: {
        ...fallbackPreview,
        ...preferredPreview,
        embedUrl:
          persistableMediaUrl(preferredPreview.embedUrl) ||
          persistableMediaUrl(fallbackPreview.embedUrl) ||
          persistableMediaUrl(preferredMeta.embedUrl) ||
          persistableMediaUrl(fallbackMeta.embedUrl),
      },
    },
  };
}

function dedupe(items: BoardActivity[]) {
  const map = new Map<string, BoardActivity>();
  const aliases = new Map<string, string>();
  for (const item of items) {
    if (!item?.id) continue;
    const meta = item.meta && typeof item.meta === "object" ? item.meta : null;
    const isRecipientActivity = meta?.activityAudience === "recipient";
    const ownerKey =
      typeof meta?.ownerUsername === "string" && meta.ownerUsername
        ? meta.ownerUsername
        : typeof meta?.authorUsername === "string" && meta.authorUsername
          ? meta.authorUsername
        : item.user_id
          ? String(item.user_id)
          : "";
    const dropId =
      typeof meta?.dropId === "string" && meta.dropId
        ? `drop:${ownerKey}:${meta.dropId}`
        : typeof meta?.projectId === "string" && meta.projectId
          ? `project:${ownerKey}:${meta.projectId}`
          : "";
    const isProjectDrop =
      String(meta?.kind ?? "").includes("project") ||
      String(meta?.cardStyle ?? "").includes("project") ||
      /^Project Drop:\s*/i.test(item.title ?? "");
    const title = item.title ? `title:${item.kind}:${ownerKey}:${item.title.trim().toLowerCase()}` : "";
    const href = item.href ? `href:${item.href}` : "";
    const body = item.body ? `body:${item.kind}:${ownerKey}:${item.body.trim().toLowerCase()}` : "";
    const image = item.image_url ? `image:${item.image_url}` : "";
    const titleBody = title && body ? `${title}:${body}` : title || body;
    const generatedCaption =
      title && /^New .+ drop (added to Board|from .+)\.?$/i.test(item.body ?? "")
        ? `generated:${item.kind}:${item.title?.trim().toLowerCase()}`
        : "";
    const isRecoveredMirror = /^New .+ drop from .+/i.test(item.body ?? "");
    const hasStrongIdentity = Boolean(dropId || href || image);
    const itemAliases = isRecipientActivity
      ? [`recipient:${item.id}`]
      : [
          dropId,
          href,
          image,
          isProjectDrop ? titleBody : "",
          !dropId && !href && !image ? titleBody : "",
        ].filter(Boolean);
    const weakAliases = [generatedCaption].filter(Boolean);
    const matchableAliases =
      isRecipientActivity
        ? itemAliases
        : hasStrongIdentity && !isRecoveredMirror
        ? itemAliases
        : [...itemAliases, ...weakAliases];
    const matchedAlias = matchableAliases.find((alias) => aliases.has(alias));
    const key = matchedAlias
      ? aliases.get(matchedAlias)!
      : isRecipientActivity
        ? itemAliases[0]
        : dropId || href || image || item.id || titleBody;
    const previous = map.get(key);
    if (!previous) {
      map.set(key, item);
      for (const alias of itemAliases) aliases.set(alias, key);
      for (const alias of weakAliases) {
        if (!aliases.has(alias)) aliases.set(alias, key);
      }
      continue;
    }

    const previousScore =
      (previous.image_url ? 3 : 0) + (previous.href ? 1 : 0) + (previous.meta ? 1 : 0);
    const nextScore = (item.image_url ? 3 : 0) + (item.href ? 1 : 0) + (item.meta ? 1 : 0);
    const preferNext =
      nextScore > previousScore ||
      (nextScore === previousScore && item.created_at > previous.created_at);
    map.set(
      key,
      preferNext
        ? mergeActivityRecords(item, previous)
        : mergeActivityRecords(previous, item)
    );
    for (const alias of itemAliases) aliases.set(alias, key);
    for (const alias of weakAliases) {
      if (!aliases.has(alias)) aliases.set(alias, key);
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1
  );
}

function filterProfileDeletedActivity(items: BoardActivity[], profileRows: any[]) {
  const deletedByUser = new Map<string, Set<string>>();
  for (const profile of profileRows) {
    const userId = String(profile?.id ?? "");
    const deleted = profile?.board_style?.boardDropsDeleted;
    if (!userId || !Array.isArray(deleted)) continue;
    deletedByUser.set(userId, new Set(deleted.map(String)));
  }

  return items.filter((item) => {
    const deleted = item.user_id ? deletedByUser.get(String(item.user_id)) : null;
    if (!deleted?.size) return true;
    const meta = item.meta && typeof item.meta === "object" ? item.meta : null;
    const dropId = String(meta?.dropId ?? meta?.originalDropId ?? "");
    return !dropId || !deleted.has(dropId);
  });
}

async function selectRows<T>(
  query: PromiseLike<{ data: T[] | null; error: any }>,
  label = "unknown"
) {
  try {
    const { data, error } = await Promise.race([
      query,
      new Promise<{ data: T[] | null; error: any }>((resolve) =>
        setTimeout(
          () => resolve({ data: [], error: new Error(`${label} timed out`) }),
          SOURCE_TIMEOUT_MS
        )
      ),
    ]);
    if (error) return [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  const supabase = supabaseServer();
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();
  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || 80)));
  const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
  const kinds = url.searchParams
    .getAll("kind")
    .map((kind) => cleanKind(kind))
    .filter(Boolean);

  let activityQuery = supabase
    .from("board_activity")
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (kinds.length) {
    activityQuery = activityQuery.in("kind", kinds);
  }

  const [activityRows, legacyDropRows, boardPostRows, postRows, profileRows] =
    await Promise.all([
      selectRows<any>(activityQuery, "board_activity"),
      selectRows<any>(
        supabase
          .from("board_drops")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(limit),
        "board_drops"
      ),
      selectRows<any>(
        supabase
          .from("board_posts")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(limit),
        "board_posts"
      ),
      selectRows<any>(
        supabase
          .from("posts")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(limit),
        "posts"
      ),
      selectRows<any>(
        supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url, avatar_path, board_style")
          .limit(500),
        "profiles"
      ),
    ]);

  const items = dedupe(filterProfileDeletedActivity([
    ...activityRows.map(normalizeActivityRow).filter(Boolean),
    ...legacyDropRows.map(normalizeLegacyBoardDrop).filter(Boolean),
    ...boardPostRows.map((row) => normalizePostRow(row, "board_posts")).filter(Boolean),
    ...postRows.map((row) => normalizePostRow(row, "posts")).filter(Boolean),
    ...profileRows.flatMap(normalizeProfileBoardDrop),
  ] as BoardActivity[], profileRows));

  const authors = new Map(
    profileRows
      .map((row) => authorFromProfileRow(row))
      .filter((row): row is NonNullable<ReturnType<typeof authorFromProfileRow>> => Boolean(row))
      .map((author) => [author.id, author])
  );
  const named = items.map((item) => {
    const author = item.user_id ? authors.get(String(item.user_id)) : null;
    return applyForumDropNavigation(hydrateActivityAuthor(item, author || null));
  });

  const scoped = kinds.length
    ? named.filter((item) => kinds.includes(item.kind))
    : named;
  const visible = scoped.filter((item) => {
    const meta = item.meta && typeof item.meta === "object" ? item.meta : null;
    if (meta?.visibility !== "private") return true;
    if (!viewer?.id) return false;
    return (
      String(item.user_id || "") === viewer.id ||
      String(meta?.recipientUserId || "") === viewer.id
    );
  });

  return new Response(JSON.stringify({ ok: true, items: visible.slice(0, limit) }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
