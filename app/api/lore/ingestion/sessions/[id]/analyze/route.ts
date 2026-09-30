// File: app/api/lore/ingestion/sessions/[id]/analyze/route.ts
// Triggers the actual chunk -> extract -> normalize -> duplicate/conflict ->
// PROPOSED pipeline for a session. Kept as its own route so it can carry a
// generous execution budget (see maxDuration) — analyzeIngestionSource itself
// caps how many chunks it processes per pass to stay inside that window.

import { NextRequest } from "next/server";
import { requireLoreAdmin, LoreAdminError } from "@/lib/lore/server/write";
import { loreServiceClient } from "@/lib/lore/server/serviceClient";
import { analyzeIngestionSource } from "@/lib/lore/ingestion/analyze";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireLoreAdmin();
  } catch (error) {
    return json({ error: error instanceof LoreAdminError ? error.message : "Unauthorized" }, 403);
  }

  try {
    await analyzeIngestionSource(params.id);
  } catch (error) {
    // analyzeIngestionSource already persists the failure onto the session
    // row itself — surface it here too so the caller gets an immediate error.
    return json({ error: error instanceof Error ? error.message : "Analysis failed." }, 500);
  }

  const supabase = loreServiceClient();
  const { data } = supabase
    ? await supabase.from("lore_ingestion_sessions").select("*").eq("id", params.id).maybeSingle()
    : { data: null };
  return json({ session: data });
}
