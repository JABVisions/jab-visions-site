// File: app/api/lore/ingestion/sources/route.ts
// Admin-only create/list for ingestion source material. POST accepts either a
// JSON body (pasted text) or multipart/form-data with a `file` field
// (currently .txt only — other formats are a documented future extension).

import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { loreServiceClient } from "@/lib/lore/server/serviceClient";
import { requireLoreAdmin, LoreAdminError } from "@/lib/lore/server/write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requireClient() {
  const supabase = loreServiceClient();
  if (!supabase) throw new LoreAdminError("Lore Library service credentials are not configured.");
  return supabase;
}

async function currentUserId(): Promise<string | null> {
  try {
    const supabase = supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    await requireLoreAdmin();
  } catch (error) {
    return json({ error: error instanceof LoreAdminError ? error.message : "Unauthorized" }, 403);
  }

  const supabase = requireClient();
  const { data, error } = await supabase
    .from("lore_ingestion_sources")
    .select("*, lore_ingestion_source_projects(project_id, lore_projects(title))")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return json({ error: error.message }, 500);
  return json({ sources: data ?? [] });
}

export async function POST(request: NextRequest) {
  try {
    await requireLoreAdmin();
  } catch (error) {
    return json({ error: error instanceof LoreAdminError ? error.message : "Unauthorized" }, 403);
  }

  const contentType = request.headers.get("content-type") || "";
  let title = "";
  let sourceType = "other";
  let rawText = "";
  let originalFilename: string | null = null;
  let projectIds: string[] = [];

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      title = String(form.get("title") || "").trim();
      sourceType = String(form.get("source_type") || "other").trim();
      projectIds = String(form.get("project_ids") || "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      const file = form.get("file");
      if (file instanceof File) {
        if (!file.name.toLowerCase().endsWith(".txt")) {
          return json({ error: "Only plain-text (.txt) uploads are supported right now." }, 400);
        }
        rawText = await file.text();
        originalFilename = file.name;
      } else {
        rawText = String(form.get("raw_text") || "");
      }
    } else {
      const body = await request.json();
      title = String(body?.title || "").trim();
      sourceType = String(body?.source_type || "other").trim();
      rawText = String(body?.raw_text || "");
      projectIds = Array.isArray(body?.project_ids) ? body.project_ids.filter((x: unknown) => typeof x === "string") : [];
    }
  } catch {
    return json({ error: "Could not read the request body." }, 400);
  }

  if (!title) return json({ error: "A title is required." }, 400);
  if (!rawText.trim()) return json({ error: "Paste some text or upload a .txt file." }, 400);

  const supabase = requireClient();
  const createdBy = await currentUserId();

  const { data: source, error: sourceError } = await supabase
    .from("lore_ingestion_sources")
    .insert({
      title,
      source_type: sourceType,
      raw_text: rawText,
      original_filename: originalFilename,
      created_by: createdBy,
    })
    .select("*")
    .single();
  if (sourceError || !source) return json({ error: sourceError?.message || "Failed to save source." }, 500);

  if (projectIds.length) {
    const rows = projectIds.map((project_id) => ({ source_id: source.id, project_id }));
    await supabase.from("lore_ingestion_source_projects").insert(rows);
  }

  return json({ source });
}
