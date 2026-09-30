// File: app/api/lore/ingestion/proposals/route.ts
// Admin-only list of proposals awaiting review, filterable by session and/or
// status so the UI can show "Needs Review" separately from the general queue.

import { NextRequest } from "next/server";
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

export async function GET(request: NextRequest) {
  try {
    await requireLoreAdmin();
  } catch (error) {
    return json({ error: error instanceof LoreAdminError ? error.message : "Unauthorized" }, 403);
  }

  const supabase = loreServiceClient();
  if (!supabase) return json({ error: "Lore Library is not configured." }, 500);

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");
  const status = searchParams.get("status");

  let query = supabase.from("lore_ingestion_proposals").select("*").order("created_at", { ascending: true }).limit(500);
  if (sessionId) query = query.eq("session_id", sessionId);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return json({ error: error.message }, 500);
  return json({ proposals: data ?? [] });
}
