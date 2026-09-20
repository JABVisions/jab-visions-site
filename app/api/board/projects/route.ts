import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { BoardActivity } from "@/lib/board/activity";
import { isExplicitProjectDropRecord } from "@/lib/board/isProjectNotebookDrop";
import {
  pickProjectHostName,
  persistableImageUrl,
} from "@/lib/board/projectCover";
import { getSupabaseAnonKey, getSupabasePublicUrl } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function supabaseServer() {
  const cookieStore = cookies();
  return createServerClient(getSupabasePublicUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cs) => {
        try {
          cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // GET handlers may not persist refreshed auth cookies.
        }
      },
    },
  });
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function isProjectActivity(item: BoardActivity): boolean {
  return isExplicitProjectDropRecord({
    ...item,
    type: item.kind,
    title: item.title,
    meta: item.meta,
  });
}

function normalizeActivityRow(row: any): BoardActivity | null {
  if (!row || typeof row !== "object") return null;
  const meta = asRecord(row.meta);
  if (meta.presence === true || meta.source === "board_presence") return null;
  const body = String(row.body ?? "").trim();
  const title = String(row.title ?? "").trim();
  if (!body && !title) return null;
  return {
    id: String(row.id ?? ""),
    created_at:
      typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
    user_id: row.user_id ?? null,
    kind: (row.kind || "board_drop") as BoardActivity["kind"],
    title: title || null,
    body: body || title || "Project Drop",
    href: row.href ?? "/board/work",
    image_url: persistableImageUrl(row.image_url) || persistableImageUrl(meta.previewImage),
    meta: Object.keys(meta).length ? meta : null,
  };
}

function activityFromProfileDrop(
  profile: any,
  drop: any,
  viewerId: string | null
): BoardActivity | null {
  if (!drop || typeof drop !== "object") return null;
  const id = String(drop.id ?? "").trim();
  if (!id) return null;
  if (drop.visibility === "private" && String(profile?.id ?? "") !== String(viewerId ?? "")) {
    return null;
  }
  const type = String(drop.type ?? drop.dropType ?? "");
  const meta = asRecord(drop.meta);
  const title = String(drop.title ?? "").trim();
  const looksProject =
    isExplicitProjectDropRecord({ ...drop, type, meta, title }) ||
    /\bproject(\s+drop)?\b/i.test(type);
  if (!looksProject) return null;

  const ownerLabel = pickProjectHostName(
    drop.contactName,
    drop.authorName,
    meta.contactName,
    meta.authorName,
    profile?.display_name,
    profile?.username,
    asRecord(profile?.board_style).displayName
  );
  const cover =
    persistableImageUrl(drop.previewImage) ||
    persistableImageUrl(drop.imageUrl) ||
    persistableImageUrl(drop.mediaUrl) ||
    persistableImageUrl(drop.media?.src);

  return {
    id: `profile_project_${profile?.id ?? "user"}_${id}`,
    created_at: new Date(Number(drop.createdAt ?? Date.now()) || Date.now()).toISOString(),
    user_id: profile?.id ?? null,
    kind: "board_drop",
    title: /^Project Drop:/i.test(title) ? title : `Project Drop: ${title}`,
    body: String(drop.description ?? drop.logline ?? meta.description ?? title),
    href: "/board/work",
    image_url: cover,
    meta: {
      ...meta,
      source: meta.source || "work_board",
      origin: "project_notebook",
      kind: "project_drop",
      cardStyle: "project_drop",
      dropType: "project",
      projectId: meta.projectId || id.replace(/^project_drop_/, ""),
      projectType: drop.projectType ?? meta.projectType ?? type,
      location: drop.location ?? meta.location ?? null,
      startDate: drop.startDate ?? meta.startDate ?? null,
      endDate: drop.endDate ?? meta.endDate ?? null,
      rolesNeeded: drop.rolesNeeded ?? meta.rolesNeeded ?? null,
      contactName: drop.contactName ?? meta.contactName ?? ownerLabel,
      contactEmail: drop.contactEmail ?? meta.contactEmail ?? null,
      status: drop.projectStatus ?? drop.status ?? meta.status ?? null,
      media: drop.media ?? meta.media ?? null,
      bucket: drop.bucket ?? meta.bucket ?? drop.media?.bucket ?? null,
      storagePath: drop.storagePath ?? meta.storagePath ?? drop.media?.storagePath ?? null,
      previewImage: cover,
      authorName: ownerLabel,
      authorUsername: profile?.username ?? null,
      ownerLabel,
      ownerUsername: profile?.username ?? null,
    },
  };
}

function activityFromAsset(row: any): BoardActivity | null {
  const payload = asRecord(row?.payload);
  const destination = String(payload.destination ?? payload.library?.destination ?? "");
  const looksProject =
    destination === "projects" ||
    isExplicitProjectDropRecord({ ...row, payload, meta: payload });
  if (!looksProject) return null;
  const title = String(row.title ?? "").trim();
  if (!title) return null;
  const cover =
    persistableImageUrl(payload.mediaUrl) ||
    persistableImageUrl(payload.coverUrl) ||
    persistableImageUrl(payload.embedUrl);
  return {
    id: `asset_project_${row.id}`,
    created_at: row.created_at || new Date().toISOString(),
    user_id: row.user_id ?? null,
    kind: "board_drop",
    title: /^Project Drop:/i.test(title) ? title : `Project Drop: ${title}`,
    body: String(row.description ?? payload.text ?? title),
    href: "/board/work",
    image_url: cover,
    meta: {
      source: "drop_pad_projects",
      origin: "project_notebook",
      kind: "project_drop",
      cardStyle: "project_drop",
      dropType: "project",
      projectId: String(row.id),
      location: payload.location ?? null,
      startDate: payload.startDate ?? null,
      endDate: payload.endDate ?? null,
      media: {
        kind: payload.mediaType === "video" ? "video" : "image",
        src: cover || "",
        bucket: payload.bucket,
        storagePath: payload.storagePath,
      },
      bucket: payload.bucket ?? null,
      storagePath: payload.storagePath ?? null,
    },
  };
}

export async function GET() {
  try {
    const supabase = supabaseServer();
    const { data: authData } = await supabase.auth.getUser();
    const viewerId = authData?.user?.id ?? null;

    const [activityRes, profileRes, assetRes] = await Promise.all([
    supabase
      .from("board_activity")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(400),
    supabase
      .from("profiles")
      .select("id, username, display_name, board_style")
      .limit(500),
    supabase
      .from("board_assets")
      .select("id, user_id, kind, title, description, payload, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const activityRows = Array.isArray(activityRes.data) ? activityRes.data : [];
  const profileRows = Array.isArray(profileRes.data) ? profileRes.data : [];
  const assetRows = Array.isArray(assetRes.data) ? assetRes.data : [];

  const profileById = new Map(
    profileRows.map((profile) => [String(profile.id), profile])
  );

  const fromActivity = activityRows
    .map(normalizeActivityRow)
    .filter((item): item is BoardActivity => Boolean(item && isProjectActivity(item)))
    .map((item) => {
      const profile = item.user_id ? profileById.get(String(item.user_id)) : null;
      const host = pickProjectHostName(
        item.meta?.contactName,
        item.meta?.authorName,
        item.meta?.ownerLabel,
        profile?.display_name,
        profile?.username
      );
      return {
        ...item,
        image_url: persistableImageUrl(item.image_url),
        meta: {
          ...(item.meta ?? {}),
          source: item.meta?.source || "work_board",
          origin: item.meta?.origin || "project_notebook",
          authorName: host || item.meta?.authorName,
          contactName: pickProjectHostName(item.meta?.contactName, host),
          ownerLabel: host || item.meta?.ownerLabel,
          authorUsername: item.meta?.authorUsername || profile?.username || null,
        },
      };
    });

  const fromProfiles = profileRows.flatMap((profile) => {
    const style = asRecord(profile.board_style);
    const drops = Array.isArray(style.boardDrops) ? style.boardDrops : [];
    const deleted = new Set(
      (Array.isArray(style.boardDropsDeleted) ? style.boardDropsDeleted : []).map(String)
    );
    return drops
      .filter((drop: any) => drop && !deleted.has(String(drop.id ?? "")))
      .map((drop: any) => activityFromProfileDrop(profile, drop, viewerId))
      .filter(Boolean) as BoardActivity[];
  });

  const fromAssets = assetRows
    .map(activityFromAsset)
    .filter((item): item is BoardActivity => Boolean(item));

  const merged = new Map<string, BoardActivity>();
  for (const item of [...fromActivity, ...fromProfiles, ...fromAssets]) {
    const meta = asRecord(item.meta);
    const key =
      String(meta.projectId || "") ||
      String(meta.dropId || "") ||
      item.title?.replace(/^Project Drop:\s*/i, "").trim().toLowerCase() ||
      item.id;
    const previous = merged.get(key);
    if (!previous) {
      merged.set(key, item);
      continue;
    }
    const previousMeta = asRecord(previous.meta);
    const nextMeta = asRecord(item.meta);
    const previousScore =
      (previous.image_url ? 2 : 0) +
      (previousMeta.location ? 2 : 0) +
      (previousMeta.startDate ? 1 : 0);
    const nextScore =
      (item.image_url ? 2 : 0) +
      (nextMeta.location ? 2 : 0) +
      (nextMeta.startDate ? 1 : 0);
    merged.set(
      key,
      nextScore >= previousScore
        ? { ...previous, ...item, meta: { ...previousMeta, ...nextMeta } }
        : { ...item, ...previous, meta: { ...nextMeta, ...previousMeta } }
    );
  }

  const activities = Array.from(merged.values()).sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1
  );

  return Response.json({ ok: true, activities });
  } catch (error) {
    console.error("[board/projects] failed to load project notebook", error);
    return Response.json({ ok: false, activities: [], message: "Could not load projects." }, { status: 200 });
  }
}
