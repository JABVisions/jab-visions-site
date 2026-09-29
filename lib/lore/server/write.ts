// File: lib/lore/server/write.ts
// Admin-only create/update/retire operations for the Lore Library. Every
// exported function assumes the caller has ALREADY verified admin access
// (see requireLoreAdmin below) — these do not re-check auth themselves, so
// they must never be reachable from anything except an admin-gated API route.
//
// Writes use the service-role client rather than relying solely on RLS: the
// API route is the first, authoritative gate (isRequestFromLoreAdmin), and
// the service-role client here is what actually performs the mutation.

import { loreServiceClient, isRequestFromLoreAdmin } from "./serviceClient";
import { embedLoreText, loreEntryEmbeddingSource } from "./embeddings";
import type { LoreEntry, LoreEntrySource, LoreProject, LoreRelationship } from "../types";

export class LoreAdminError extends Error {}

/** Throws if the current request isn't from a verified JAB admin. Call this first in every admin route. */
export async function requireLoreAdmin() {
  const isAdmin = await isRequestFromLoreAdmin();
  if (!isAdmin) throw new LoreAdminError("Not authorized to modify the Lore Library.");
}

function requireClient() {
  const supabase = loreServiceClient();
  if (!supabase) throw new LoreAdminError("Lore Library service credentials are not configured.");
  return supabase;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export type LoreProjectInput = Partial<Omit<LoreProject, "id" | "created_at" | "updated_at">> & {
  slug: string;
  title: string;
};

export async function upsertLoreProject(input: LoreProjectInput & { id?: string }): Promise<LoreProject> {
  const supabase = requireClient();
  const { id, ...rest } = input;
  const query = id
    ? supabase.from("lore_projects").update(rest).eq("id", id)
    : supabase.from("lore_projects").insert(rest);
  const { data, error } = await query.select("*").single();
  if (error || !data) throw new LoreAdminError(error?.message || "Failed to save project.");
  return data as LoreProject;
}

// ---------------------------------------------------------------------------
// Entries — writing an entry also (re)computes its embedding, best-effort.
// ---------------------------------------------------------------------------

export type LoreEntryInput = Partial<
  Omit<LoreEntry, "id" | "created_at" | "updated_at" | "search_vector" | "embedding">
> & {
  title: string;
  slug: string;
  entry_type: string;
};

export async function upsertLoreEntry(input: LoreEntryInput & { id?: string }): Promise<LoreEntry> {
  const supabase = requireClient();
  const { id, ...rest } = input;

  const embedding = await embedLoreText(
    loreEntryEmbeddingSource({ title: rest.title, summary: rest.summary, content: rest.content })
  );
  const payload = embedding ? { ...rest, embedding } : rest;

  const query = id
    ? supabase.from("lore_entries").update(payload).eq("id", id)
    : supabase.from("lore_entries").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error || !data) throw new LoreAdminError(error?.message || "Failed to save lore entry.");
  return data as LoreEntry;
}

/** Retiring is just a canon_status change — the row and its history stay intact. */
export async function retireLoreEntry(id: string): Promise<LoreEntry> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from("lore_entries")
    .update({ canon_status: "RETIRED" })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new LoreAdminError(error?.message || "Failed to retire lore entry.");
  return data as LoreEntry;
}

export async function deleteLoreEntry(id: string): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase.from("lore_entries").delete().eq("id", id);
  if (error) throw new LoreAdminError(error.message);
}

// ---------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------

export type LoreRelationshipInput = Omit<LoreRelationship, "id" | "created_at">;

export async function createLoreRelationship(input: LoreRelationshipInput): Promise<LoreRelationship> {
  const supabase = requireClient();
  const { data, error } = await supabase.from("lore_relationships").insert(input).select("*").single();
  if (error || !data) throw new LoreAdminError(error?.message || "Failed to create relationship.");
  return data as LoreRelationship;
}

export async function deleteLoreRelationship(id: string): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase.from("lore_relationships").delete().eq("id", id);
  if (error) throw new LoreAdminError(error.message);
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export type LoreEntrySourceInput = Omit<LoreEntrySource, "id" | "created_at">;

export async function addLoreEntrySource(input: LoreEntrySourceInput): Promise<LoreEntrySource> {
  const supabase = requireClient();
  const { data, error } = await supabase.from("lore_entry_sources").insert(input).select("*").single();
  if (error || !data) throw new LoreAdminError(error?.message || "Failed to add source.");
  return data as LoreEntrySource;
}

export async function deleteLoreEntrySource(id: string): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase.from("lore_entry_sources").delete().eq("id", id);
  if (error) throw new LoreAdminError(error.message);
}
