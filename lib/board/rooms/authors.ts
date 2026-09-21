import type { SupabaseClient } from "@supabase/supabase-js";
import {
  authorFromProfileRow,
  pickBoardDisplayName,
  type BoardProfileAuthor,
  type ProfileAuthorRow,
} from "@/lib/board/boardAuthor";
import { hostedOrbAvatarUrl } from "@/lib/board/friendZoneOrbs";
import { applySignedBoardAvatars } from "@/lib/board/signBoardAvatars";

const PROFILE_SELECT = "id, username, display_name, avatar_url, avatar_path, board_style";

export async function loadProfileAuthors(
  supabase: Pick<SupabaseClient, "from">,
  ids: Array<string | null | undefined>
): Promise<Map<string, BoardProfileAuthor>> {
  const unique = Array.from(new Set(ids.map((id) => String(id || "").trim()).filter(Boolean)));
  const authors = new Map<string, BoardProfileAuthor>();
  if (!unique.length) return authors;
  try {
    const { data, error } = await supabase.from("profiles").select(PROFILE_SELECT).in("id", unique);
    if (error || !Array.isArray(data)) return authors;
    for (const row of data as ProfileAuthorRow[]) {
      const author = authorFromProfileRow(row);
      if (author) authors.set(author.id, author);
    }
  } catch {
    return authors;
  }
  return authors;
}

export async function signAuthorAvatars(
  supabase: Pick<SupabaseClient, "storage"> | null,
  authors: Map<string, BoardProfileAuthor>
): Promise<Map<string, BoardProfileAuthor>> {
  const items = [...authors.values()].map((author) => ({
    id: author.id,
    avatarUrl: author.avatarUrl || author.avatarPath || null,
  }));
  const signed = await applySignedBoardAvatars(supabase, items);
  const next = new Map(authors);
  for (const item of signed) {
    const current = next.get(item.id);
    if (!current) continue;
    next.set(item.id, { ...current, avatarUrl: item.avatarUrl || current.avatarUrl });
  }
  return next;
}

export function attachAuthorToRow<T extends Record<string, unknown>>(
  row: T,
  author: BoardProfileAuthor | null | undefined,
  idKey: "author_id" | "shared_by" | "user_id"
): T {
  if (!author) return row;
  const displayName = pickBoardDisplayName(
    author.displayName,
    row.author_name,
    row.display_name,
    row.shared_by_name,
    author.username
  );
  return {
    ...row,
    author_name: displayName || row.author_name,
    display_name: displayName || row.display_name,
    shared_by_name: idKey === "shared_by" ? displayName || row.shared_by_name : row.shared_by_name,
    username: author.username || row.username,
    avatar_url: author.avatarUrl || row.avatar_url,
  };
}

export async function hydratePresenceRows(
  supabase: Pick<SupabaseClient, "from" | "storage">,
  rows: Array<Record<string, unknown>>
): Promise<Array<Record<string, unknown>>> {
  if (!rows.length) return rows;
  const authors = await signAuthorAvatars(
    supabase,
    await loadProfileAuthors(
      supabase,
      rows.map((row) => String(row.user_id || row.userId || ""))
    )
  );
  const mapped = rows.map((row) => {
    const author = authors.get(String(row.user_id || row.userId || ""));
    const avatarUrl =
      hostedOrbAvatarUrl(row.avatar_url, row.avatarUrl, author?.avatarUrl, author?.avatarPath) || null;
    return {
      ...row,
      display_name:
        pickBoardDisplayName(
          row.display_name,
          row.displayName,
          author?.displayName,
          row.username,
          author?.username
        ) || row.display_name,
      username: row.username || author?.username || null,
      avatar_url: avatarUrl,
      avatarUrl,
    };
  });
  return applySignedBoardAvatars(supabase, mapped);
}

export async function hydrateAuthorRows<T extends Record<string, unknown>>(
  supabase: Pick<SupabaseClient, "from" | "storage">,
  rows: T[],
  idKey: "author_id" | "shared_by" | "user_id"
): Promise<T[]> {
  if (!rows.length) return rows;
  const authors = await signAuthorAvatars(
    supabase,
    await loadProfileAuthors(
      supabase,
      rows.map((row) => String(row[idKey] || ""))
    )
  );
  const mapped = rows.map((row) => {
    const attached = attachAuthorToRow(row, authors.get(String(row[idKey] || "")), idKey);
    return {
      ...attached,
      avatarUrl: String(attached.avatar_url || attached.avatarUrl || "") || null,
    };
  });
  const signed = await applySignedBoardAvatars(supabase, mapped);
  return signed.map((row) => ({
    ...row,
    avatar_url: row.avatarUrl || row.avatar_url,
  })) as T[];
}
