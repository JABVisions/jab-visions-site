import type { SupabaseClient } from "@supabase/supabase-js";

const DOC_BUCKET = "board-docs";
const MAX_SCAN_DEPTH = 2;

type StoredObject = {
  id?: string | null;
  name: string;
  created_at?: string | null;
  updated_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

type StoredFile = StoredObject & { path: string };

async function listHtmlFiles(
  sb: SupabaseClient,
  prefix: string,
  depth = 0
): Promise<StoredFile[]> {
  const { data, error } = await sb.storage.from(DOC_BUCKET).list(prefix, {
    limit: 100,
    offset: 0,
    sortBy: { column: "created_at", order: "desc" },
  });
  if (error) {
    console.error("[DescriptRecovery] storage list failed", { prefix, error });
    return [];
  }

  const files: StoredFile[] = [];
  for (const item of (data ?? []) as StoredObject[]) {
    const path = `${prefix}/${item.name}`;
    const isFolder = !item.id && !item.metadata;
    if (isFolder && depth < MAX_SCAN_DEPTH) {
      files.push(...(await listHtmlFiles(sb, path, depth + 1)));
    } else if (/\.html?$/i.test(item.name)) {
      files.push({ ...item, path });
    }
  }
  return files;
}

function stableRecoveredId(path: string) {
  let hash = 2166136261;
  for (let index = 0; index < path.length; index += 1) {
    hash ^= path.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `recovered_descript_${(hash >>> 0).toString(36)}`;
}

function originalDropId(path: string, userId: string) {
  const parts = path.split("/").filter(Boolean);
  return parts[0] === userId && parts.length >= 3 ? parts[1] : null;
}

function parseDocument(raw: string, fallbackName: string) {
  const document = new DOMParser().parseFromString(raw, "text/html");
  const fallbackTitle = fallbackName
    .replace(/\.html?$/i, "")
    .replace(/^\d+-/, "")
    .replace(/[-_]+/g, " ")
    .trim();
  const title = document.title.trim() || fallbackTitle || "Recovered Descript";
  const text = (document.body.textContent ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title, preview: text.slice(0, 1200) };
}

export async function recoverOrphanedDescriptDrops(
  sb: SupabaseClient,
  userId: string
): Promise<number> {
  const { data: profile, error: profileError } = await sb
    .from("profiles")
    .select("board_style")
    .eq("id", userId)
    .maybeSingle();
  if (profileError || !profile) return 0;

  const boardStyle =
    profile.board_style && typeof profile.board_style === "object"
      ? profile.board_style as Record<string, unknown>
      : {};
  const currentDrops = Array.isArray(boardStyle.boardDrops)
    ? boardStyle.boardDrops as Array<Record<string, unknown>>
    : [];
  const deletedIds = new Set(
    Array.isArray(boardStyle.boardDropsDeleted)
      ? boardStyle.boardDropsDeleted.map(String)
      : []
  );
  const knownPaths = new Set(
    currentDrops
      .map((drop) => typeof drop.storagePath === "string" ? drop.storagePath : "")
      .filter(Boolean)
  );

  const [structured, consoleUploads] = await Promise.all([
    listHtmlFiles(sb, userId),
    listHtmlFiles(sb, `uploads/${userId}`),
  ]);
  const candidates = [...structured, ...consoleUploads].filter((file, index, all) =>
    !knownPaths.has(file.path) && all.findIndex((entry) => entry.path === file.path) === index
  );
  if (!candidates.length) return 0;

  const recovered: Array<Record<string, unknown>> = [];
  for (const file of candidates) {
    const dropId = originalDropId(file.path, userId) ?? stableRecoveredId(file.path);
    if (deletedIds.has(dropId)) continue;

    const { data: blob, error: downloadError } = await sb.storage
      .from(DOC_BUCKET)
      .download(file.path);
    if (downloadError || !blob) continue;
    const { title, preview } = parseDocument(await blob.text(), file.name);
    const createdAt = Date.parse(file.created_at || file.updated_at || "") || Date.now();
    recovered.push({
      id: dropId,
      title,
      type: "Doc",
      createdAt,
      bucket: DOC_BUCKET,
      storagePath: file.path,
      fileName: file.name,
      fileSize: typeof file.metadata?.size === "number" ? file.metadata.size : blob.size,
      mime: "text/html",
      description: preview || undefined,
      fromDescript: true,
      mediaSource: "capture",
      visibility: "public",
      recoveredFromStorage: true,
    });
  }
  if (!recovered.length) return 0;

  const mergedDrops = [
    ...recovered,
    ...currentDrops.filter((drop) =>
      !recovered.some((item) => String(item.id) === String(drop.id))
    ),
  ];
  const { data: updatedProfile, error: updateError } = await sb
    .from("profiles")
    .update({ board_style: { ...boardStyle, boardDrops: mergedDrops } })
    .eq("id", userId)
    .select("id")
    .maybeSingle();
  if (updateError || !updatedProfile?.id) {
    console.error("[DescriptRecovery] profile recovery failed", updateError);
    return 0;
  }

  for (const drop of recovered) {
    const { error } = await sb.from("board_activity").insert({
      scope: "global",
      user_id: userId,
      kind: "board_drop",
      title: drop.title,
      body: drop.description || "Recovered Descript Drop.",
      href: null,
      image_url: null,
      meta: {
        source: "descript_storage_recovery",
        dropId: drop.id,
        dropType: "Doc",
        bucket: DOC_BUCKET,
        storagePath: drop.storagePath,
        fileName: drop.fileName,
        fromDescript: true,
        visibility: "public",
        description: drop.description ?? null,
      },
    });
    if (error) {
      console.error("[DescriptRecovery] activity recovery failed", {
        dropId: drop.id,
        error,
      });
    }
  }

  return recovered.length;
}
