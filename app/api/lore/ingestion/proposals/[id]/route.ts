// File: app/api/lore/ingestion/proposals/[id]/route.ts
// Admin-only single-proposal review actions: approve (into CANON / DRAFT /
// CONCEPT / SECRET_CANON, with a duplicate resolution when applicable),
// reject, mark needs-review, or edit the extracted payload before deciding.

import { NextRequest } from "next/server";
import { requireLoreAdmin, LoreAdminError } from "@/lib/lore/server/write";
import { reviewProposal, editProposalPayload } from "@/lib/lore/ingestion/review";
import type { ApprovalDecision, ProposalPayload } from "@/lib/lore/ingestion/types";

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
  } catch (error) {
    return json({ error: error instanceof LoreAdminError ? error.message : "Unauthorized" }, 403);
  }

  const body = await request.json().catch(() => null);
  if (!body?.action) return json({ error: "An action is required." }, 400);

  try {
    if (body.action === "edit") {
      const proposal = await editProposalPayload(params.id, body.payload as Partial<ProposalPayload>);
      return json({ proposal });
    }

    const decision = body.decision as ApprovalDecision | undefined;
    if (!decision?.action) return json({ error: "A review decision is required." }, 400);
    const proposal = await reviewProposal(params.id, decision);
    return json({ proposal });
  } catch (error) {
    if (error instanceof LoreAdminError) return json({ error: error.message }, 403);
    return json({ error: error instanceof Error ? error.message : "Failed to update proposal." }, 500);
  }
}
