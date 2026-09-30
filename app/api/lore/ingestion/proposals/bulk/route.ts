// File: app/api/lore/ingestion/proposals/bulk/route.ts
// Admin-only bulk review. There is deliberately no "select all + approve as
// canon" shortcut baked in here — the client is expected to require an
// explicit confirmation step before calling this with a canon-approval
// decision on more than a couple of ids (spec: never a dangerous one-click
// "make everything canon" operation).

import { NextRequest } from "next/server";
import { requireLoreAdmin, LoreAdminError } from "@/lib/lore/server/write";
import { bulkReviewProposals } from "@/lib/lore/ingestion/review";
import type { ApprovalDecision } from "@/lib/lore/ingestion/types";

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
  } catch (error) {
    return json({ error: error instanceof LoreAdminError ? error.message : "Unauthorized" }, 403);
  }

  const body = await request.json().catch(() => null);
  const ids: unknown = body?.proposal_ids;
  const decision = body?.decision as ApprovalDecision | undefined;
  if (!Array.isArray(ids) || !ids.length || ids.some((id) => typeof id !== "string")) {
    return json({ error: "proposal_ids must be a non-empty array of strings." }, 400);
  }
  if (!decision?.action) return json({ error: "A review decision is required." }, 400);

  const result = await bulkReviewProposals(ids as string[], decision);
  return json(result);
}
