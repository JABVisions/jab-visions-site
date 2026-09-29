// File: app/api/lore/projects/route.ts
// Admin-only CRUD for lore_projects. Every handler re-verifies admin status
// server-side — the future /board/admin/lore page gate is not trusted alone.

import { NextRequest } from "next/server";
import { loreServiceClient } from "@/lib/lore/server/serviceClient";
import { requireLoreAdmin, upsertLoreProject, LoreAdminError } from "@/lib/lore/server/write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET() {
  try {
    await requireLoreAdmin();
  } catch (error) {
    return json({ error: error instanceof LoreAdminError ? error.message : "Unauthorized" }, 403);
  }

  const supabase = loreServiceClient();
  if (!supabase) return json({ error: "Lore Library is not configured." }, 500);

  const { data, error } = await supabase
    .from("lore_projects")
    .select("*")
    .order("title", { ascending: true });
  if (error) return json({ error: error.message }, 500);
  return json({ projects: data ?? [] });
}

export async function POST(request: NextRequest) {
  try {
    await requireLoreAdmin();
    const body = await request.json();
    if (!body?.slug || !body?.title) return json({ error: "slug and title are required." }, 400);
    const project = await upsertLoreProject(body);
    return json({ project });
  } catch (error) {
    if (error instanceof LoreAdminError) return json({ error: error.message }, 403);
    return json({ error: "Failed to save project." }, 500);
  }
}
