// File: lib/lore/ingestion/review.ts
// The only path that promotes a proposal into the real Lore Library. Every
// exported function assumes the caller already verified admin access (see
// requireLoreAdmin in ../server/write) — these do not re-check auth.
//
// Enforces the spec's core hierarchy end to end:
//   SOURCE -> AI EXTRACTION -> PROPOSED LORE -> CREATOR REVIEW -> APPROVED LORE
// Nothing here ever silently overwrites existing CANON — duplicate matches
// require an explicit duplicateResolution, and merges append rather than
// replace (spec section 10).

import { loreServiceClient } from "../server/serviceClient";
import { upsertLoreEntry, createLoreRelationship, addLoreEntrySource, LoreAdminError } from "../server/write";
import type { CanonStatus, LoreEntry } from "../types";
import type {
  ApprovalDecision,
  DuplicateResolution,
  EntryProposalPayload,
  LoreIngestionProposal,
  ProposalPayload,
  RelationshipProposalPayload,
  TimelineFactProposalPayload,
} from "./types";
import { resolveProjectHint } from "./duplicates";

function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]+/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .toLowerCase()
    .slice(0, 80);
  return slug || `lore-${Date.now()}`;
}

function requireClient() {
  const supabase = loreServiceClient();
  if (!supabase) throw new LoreAdminError("Lore Library service credentials are not configured.");
  return supabase;
}

async function fetchProposal(proposalId: string): Promise<LoreIngestionProposal> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from("lore_ingestion_proposals")
    .select("*, lore_ingestion_sessions(source_id)")
    .eq("id", proposalId)
    .maybeSingle();
  if (error || !data) throw new LoreAdminError("Proposal not found.");
  return data as LoreIngestionProposal;
}

async function fetchSourceInfo(sourceId: string) {
  const supabase = requireClient();
  const { data } = await supabase.from("lore_ingestion_sources").select("title, source_type").eq("id", sourceId).maybeSingle();
  return data as { title: string; source_type: string } | null;
}

/** Appends new material to an existing entry's content rather than overwriting it (never destroy established canon). */
function mergeEntryContent(existing: Pick<LoreEntry, "content" | "summary">, incoming: EntryProposalPayload) {
  const additions = [incoming.content, incoming.details].filter(Boolean).join("\n\n");
  const stamp = `\n\n[Added via Lore Ingestion Studio, ${new Date().toISOString().slice(0, 10)}]\n${additions || incoming.summary}`;
  return {
    summary: existing.summary, // summary is the creator's curated headline — never silently rewritten
    content: existing.content ? `${existing.content}${stamp}` : (additions || incoming.summary),
  };
}

async function recordProvenance(entryId: string, sourceId: string, proposal: LoreIngestionProposal) {
  const source = await fetchSourceInfo(sourceId);
  if (!source) return;
  await addLoreEntrySource({
    entry_id: entryId,
    source_type: source.source_type,
    source_title: source.title,
    source_ref: `ingestion_session:${proposal.session_id}`,
    notes: "Approved from a Lore Ingestion Studio proposal.",
  });
}

async function markReviewed(proposalId: string, patch: Record<string, unknown>) {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from("lore_ingestion_proposals")
    .update({ ...patch, reviewed_at: new Date().toISOString() })
    .eq("id", proposalId)
    .select("*")
    .single();
  if (error || !data) throw new LoreAdminError(error?.message || "Failed to update proposal.");
  return data as LoreIngestionProposal;
}

async function approveEntryProposal(
  proposal: LoreIngestionProposal,
  canonStatus: CanonStatus,
  duplicateResolution: DuplicateResolution | undefined,
  sourceId: string
) {
  const supabase = requireClient();
  const payload = proposal.payload as EntryProposalPayload;
  const resolution: DuplicateResolution = duplicateResolution ?? (proposal.possible_duplicate_of ? "update_existing" : "create_new");

  if (proposal.possible_duplicate_of && resolution === "ignore_proposal") {
    return markReviewed(proposal.id, { status: "REJECTED" });
  }

  if (proposal.possible_duplicate_of && resolution !== "create_new") {
    const { data: existing } = await supabase
      .from("lore_entries")
      .select("*")
      .eq("id", proposal.possible_duplicate_of)
      .maybeSingle();
    if (!existing) throw new LoreAdminError("The matched existing entry no longer exists.");
    const existingEntry = existing as LoreEntry;

    const merged =
      resolution === "merge_information"
        ? mergeEntryContent(existingEntry, payload)
        : { summary: payload.summary || existingEntry.summary, content: payload.content ?? existingEntry.content };

    const updated = await upsertLoreEntry({
      id: existingEntry.id,
      title: existingEntry.title,
      slug: existingEntry.slug,
      entry_type: existingEntry.entry_type,
      project_id: existingEntry.project_id,
      canon_status: canonStatus,
      spoiler_level: existingEntry.spoiler_level,
      timeline_position: existingEntry.timeline_position,
      metadata: existingEntry.metadata,
      ...merged,
    });

    await recordProvenance(updated.id, sourceId, proposal);
    return markReviewed(proposal.id, {
      status: `APPROVED_${canonStatus === "SECRET_CANON" ? "CANON" : canonStatus}` as LoreIngestionProposal["status"],
      resulting_entry_id: updated.id,
    });
  }

  const project = await resolveProjectHint(supabase, payload.projectHint);
  const created = await upsertLoreEntry({
    title: payload.title,
    slug: slugify(payload.title),
    entry_type: proposal.entry_type ?? "other",
    project_id: project?.id ?? null,
    summary: payload.summary,
    content: payload.content ?? payload.details ?? null,
    canon_status: canonStatus,
    metadata: payload.aliases?.length ? { aliases: payload.aliases } : {},
  });

  await recordProvenance(created.id, sourceId, proposal);
  return markReviewed(proposal.id, {
    status: `APPROVED_${canonStatus === "SECRET_CANON" ? "CANON" : canonStatus}` as LoreIngestionProposal["status"],
    resulting_entry_id: created.id,
  });
}

async function findEntryIdByTitle(title: string): Promise<string | null> {
  const supabase = requireClient();
  const { data } = await supabase.from("lore_entries").select("id").ilike("title", title.trim()).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

async function approveRelationshipProposal(proposal: LoreIngestionProposal, canonStatus: CanonStatus) {
  const payload = proposal.payload as RelationshipProposalPayload;
  const [sourceId, targetId] = await Promise.all([
    findEntryIdByTitle(payload.sourceTitle),
    findEntryIdByTitle(payload.targetTitle),
  ]);

  if (!sourceId || !targetId) {
    return markReviewed(proposal.id, {
      status: "NEEDS_REVIEW",
      conflict_notes: `Cannot link yet — approve the entry for "${!sourceId ? payload.sourceTitle : payload.targetTitle}" first.`,
    });
  }

  const relationship = await createLoreRelationship({
    source_entry_id: sourceId,
    target_entry_id: targetId,
    relationship_type: payload.relationshipType,
    description: payload.description ?? null,
    canon_status: canonStatus,
    metadata: {},
  });

  return markReviewed(proposal.id, {
    status: `APPROVED_${canonStatus === "SECRET_CANON" ? "CANON" : canonStatus}` as LoreIngestionProposal["status"],
    resulting_relationship_id: relationship.id,
  });
}

async function approveTimelineFactProposal(proposal: LoreIngestionProposal, canonStatus: CanonStatus, sourceId: string) {
  const payload = proposal.payload as TimelineFactProposalPayload;
  const created = await upsertLoreEntry({
    title: payload.description.slice(0, 120),
    slug: slugify(payload.description.slice(0, 60)),
    entry_type: "timeline",
    project_id: null,
    summary: payload.description,
    content: payload.description,
    canon_status: canonStatus,
    metadata: payload.relatedTitles?.length ? { relatedTitles: payload.relatedTitles } : {},
  });
  await recordProvenance(created.id, sourceId, proposal);
  return markReviewed(proposal.id, {
    status: `APPROVED_${canonStatus === "SECRET_CANON" ? "CANON" : canonStatus}` as LoreIngestionProposal["status"],
    resulting_entry_id: created.id,
  });
}

type ProposalWithSession = LoreIngestionProposal & { lore_ingestion_sessions?: { source_id: string } };

/** Applies a single review decision (approve/reject/needs_review) to one proposal. */
export async function reviewProposal(proposalId: string, decision: ApprovalDecision): Promise<LoreIngestionProposal> {
  const proposal = (await fetchProposal(proposalId)) as ProposalWithSession;

  if (decision.action === "reject") return markReviewed(proposal.id, { status: "REJECTED" });
  if (decision.action === "needs_review") return markReviewed(proposal.id, { status: "NEEDS_REVIEW" });

  const sourceId = proposal.lore_ingestion_sessions?.source_id;
  if (!sourceId) throw new LoreAdminError("Could not resolve the originating source for this proposal.");

  if (proposal.proposal_type === "entry") {
    return approveEntryProposal(proposal, decision.canonStatus, decision.duplicateResolution, sourceId);
  }
  if (proposal.proposal_type === "relationship") {
    return approveRelationshipProposal(proposal, decision.canonStatus);
  }
  return approveTimelineFactProposal(proposal, decision.canonStatus, sourceId);
}

/** Lets a creator edit the extracted content before approving (spec section 7). */
export async function editProposalPayload(proposalId: string, payload: Partial<ProposalPayload>): Promise<LoreIngestionProposal> {
  const supabase = requireClient();
  const existing = await fetchProposal(proposalId);
  const merged = { ...existing.payload, ...payload };
  const { data, error } = await supabase
    .from("lore_ingestion_proposals")
    .update({
      payload: merged,
      title: "title" in merged ? (merged as { title?: string }).title ?? existing.title : existing.title,
    })
    .eq("id", proposalId)
    .select("*")
    .single();
  if (error || !data) throw new LoreAdminError(error?.message || "Failed to update proposal.");
  return data as LoreIngestionProposal;
}

/** Bulk review — same per-item logic as reviewProposal, run over a list of ids. Errors on one item never abort the rest. */
export async function bulkReviewProposals(
  proposalIds: string[],
  decision: ApprovalDecision
): Promise<{ succeeded: string[]; failed: Array<{ id: string; error: string }> }> {
  const succeeded: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];
  for (const id of proposalIds) {
    try {
      await reviewProposal(id, decision);
      succeeded.push(id);
    } catch (error) {
      failed.push({ id, error: error instanceof Error ? error.message : "Unknown error." });
    }
  }
  return { succeeded, failed };
}
