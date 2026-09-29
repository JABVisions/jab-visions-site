// File: app/api/lore/relationships/route.ts
// Admin-only create/delete for lore_relationships (the knowledge graph edges).

import { NextRequest } from "next/server";
import {
  requireLoreAdmin,
  createLoreRelationship,
  deleteLoreRelationship,
  LoreAdminError,
} from "@/lib/lore/server/write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: NextRequest) {
  try {
    await requireLoreAdmin();
    const body = await request.json();
    if (!body?.source_entry_id || !body?.target_entry_id || !body?.relationship_type) {
      return json({ error: "source_entry_id, target_entry_id, and relationship_type are required." }, 400);
    }
    const relationship = await createLoreRelationship({
      source_entry_id: body.source_entry_id,
      target_entry_id: body.target_entry_id,
      relationship_type: body.relationship_type,
      description: body.description ?? null,
      canon_status: body.canon_status ?? "CANON",
      metadata: body.metadata ?? {},
    });
    return json({ relationship });
  } catch (error) {
    if (error instanceof LoreAdminError) return json({ error: error.message }, 403);
    return json({ error: "Failed to create relationship." }, 500);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireLoreAdmin();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return json({ error: "id is required." }, 400);
    await deleteLoreRelationship(id);
    return json({ ok: true });
  } catch (error) {
    if (error instanceof LoreAdminError) return json({ error: error.message }, 403);
    return json({ error: "Failed to delete relationship." }, 500);
  }
}
