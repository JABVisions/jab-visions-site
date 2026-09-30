// File: app/api/lore/ingestion/sessions/route.ts
// Admin-only create/list for "Analyze Lore" sessions. Creating a session just
// registers the run (status: running) — the actual analysis pass happens in
// sessions/[id]/analyze, kept as a separate call so the UI can show the
// session the instant it exists and the analyze route can carry its own
// execution-time budget.

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

export async function GET(request: NextRequest) {
  try {
    await requireLoreAdmin();
  } catch (error) {
    return json({ error: error instanceof LoreAdminError ? error.message : "Unauthorized" }, 403);
  }

  const { searchParams } = new URL(request.url);
  const sourceId = searchParams.get("source_id");

  const supabase = requireClient();
  let query = supabase
    .from("lore_ingestion_sessions")
    .select("*, lore_ingestion_sources(title, source_type)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (sourceId) query = query.eq("source_id", sourceId);
  const { data, error } = await query;
  if (error) return json({ error: error.message }, 500);
  return json({ sessions: data ?? [] });
}

export async function POST(request: NextRequest) {
  try {
    await requireLoreAdmin();
  } catch (error) {
    return json({ error: error instanceof LoreAdminError ? error.message : "Unauthorized" }, 403);
  }

  const body = await request.json().catch(() => null);
  const sourceId = body?.source_id;
  if (!sourceId) return json({ error: "source_id is required." }, 400);

  const supabase = requireClient();
  const createdBy = await currentUserId();
  const { data, error } = await supabase
    .from("lore_ingestion_sessions")
    .insert({ source_id: sourceId, status: "running", created_by: createdBy })
    .select("*")
    .single();
  if (error || !data) return json({ error: error?.message || "Failed to create session." }, 500);
  return json({ session: data });
}
