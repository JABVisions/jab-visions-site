// File: app/api/lore/entries/route.ts
// Admin-only list/search + create for lore_entries. GET supports a `q` search
// param (reuses the retrieval engine so admins can sanity-check what
// Visionary AI would find) and an optional `project_id` filter.

import { NextRequest } from "next/server";
import { loreServiceClient } from "@/lib/lore/server/serviceClient";
import { requireLoreAdmin, upsertLoreEntry, LoreAdminError } from "@/lib/lore/server/write";
import { retrieveLoreContext } from "@/lib/lore/server/retrieval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(request: NextRequest) {
  try {
    await requireLoreAdmin();
  } catch (error) {
    return json({ error: error instanceof LoreAdminError ? error.message : "Unauthorized" }, 403);
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const projectId = searchParams.get("project_id");

  if (q) {
    // Admins can see SECRET_CANON while searching, so they can verify it exists.
    const retrieval = await retrieveLoreContext(q, { limit: 20, includeSecretCanon: true });
    return json({ entries: retrieval.entries.map((b) => b.entry) });
  }

  const supabase = loreServiceClient();
  if (!supabase) return json({ error: "Lore Library is not configured." }, 500);

  let query = supabase.from("lore_entries").select("*").order("updated_at", { ascending: false }).limit(200);
  if (projectId) query = query.eq("project_id", projectId);
  const { data, error } = await query;
  if (error) return json({ error: error.message }, 500);
  return json({ entries: data ?? [] });
}

export async function POST(request: NextRequest) {
  try {
    await requireLoreAdmin();
    const body = await request.json();
    if (!body?.title || !body?.slug || !body?.entry_type) {
      return json({ error: "title, slug, and entry_type are required." }, 400);
    }
    const entry = await upsertLoreEntry(body);
    return json({ entry });
  } catch (error) {
    if (error instanceof LoreAdminError) return json({ error: error.message }, 403);
    return json({ error: "Failed to save lore entry." }, 500);
  }
}
