// File: app/api/lore/entries/[id]/route.ts
// Admin-only update/retire/delete for a single lore entry.

import { NextRequest } from "next/server";
import {
  requireLoreAdmin,
  upsertLoreEntry,
  retireLoreEntry,
  deleteLoreEntry,
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

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireLoreAdmin();
    const body = await request.json();

    if (body?.action === "retire") {
      const entry = await retireLoreEntry(params.id);
      return json({ entry });
    }

    if (!body?.title || !body?.slug || !body?.entry_type) {
      return json({ error: "title, slug, and entry_type are required." }, 400);
    }
    const entry = await upsertLoreEntry({ ...body, id: params.id });
    return json({ entry });
  } catch (error) {
    if (error instanceof LoreAdminError) return json({ error: error.message }, 403);
    return json({ error: "Failed to update lore entry." }, 500);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireLoreAdmin();
    await deleteLoreEntry(params.id);
    return json({ ok: true });
  } catch (error) {
    if (error instanceof LoreAdminError) return json({ error: error.message }, 403);
    return json({ error: "Failed to delete lore entry." }, 500);
  }
}
