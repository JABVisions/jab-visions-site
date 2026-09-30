"use client";

// File: app/board/admin/lore/ingest/LoreIngestionStudio.tsx
// Lore Ingestion Studio V1. Feeds source material (pasted text or a .txt
// upload) through AI-assisted extraction and shows the results as PROPOSED
// candidates — nothing here is canon until a creator explicitly approves it.
// "AI may discover lore. Only JAB Visions may declare lore canon."

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { CanonStatus, LoreProject } from "@/lib/lore/types";
import type {
  ApprovalDecision,
  DuplicateResolution,
  EntryProposalPayload,
  LoreIngestionProposal,
  ProposalStatus,
  RelationshipProposalPayload,
  TimelineFactProposalPayload,
} from "@/lib/lore/ingestion/types";

const SOURCE_TYPES = [
  "screenplay",
  "treatment",
  "character_bible",
  "pitch_deck",
  "creator_notes",
  "production_notes",
  "comic",
  "story",
  "board_drop",
  "dropbook",
  "document",
  "other",
];

const APPROVE_STATUSES: Extract<CanonStatus, "CANON" | "DRAFT" | "CONCEPT" | "SECRET_CANON">[] = [
  "CANON",
  "DRAFT",
  "CONCEPT",
  "SECRET_CANON",
];

type SourceRow = {
  id: string;
  title: string;
  source_type: string;
  created_at: string;
};

type SessionRow = {
  id: string;
  source_id: string;
  status: "running" | "completed" | "failed";
  chunk_count: number;
  extracted_count: number;
  conflict_count: number;
  error: string | null;
  note: string | null;
  created_at: string;
  lore_ingestion_sources?: { title: string; source_type: string } | null;
};

function statusBadgeStyle(status: ProposalStatus): React.CSSProperties {
  const colors: Record<ProposalStatus, string> = {
    PROPOSED: "#38bdf8",
    APPROVED_CANON: "#facc15",
    APPROVED_DRAFT: "#38bdf8",
    APPROVED_CONCEPT: "#a78bfa",
    REJECTED: "#6b7280",
    NEEDS_REVIEW: "#f97316",
  };
  return {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.5,
    color: "#0b0b0b",
    background: colors[status],
  };
}

function proposalHeadline(p: LoreIngestionProposal): string {
  if (p.proposal_type === "entry") return (p.payload as EntryProposalPayload).title;
  if (p.proposal_type === "relationship") {
    const rel = p.payload as RelationshipProposalPayload;
    return `${rel.sourceTitle} → ${rel.relationshipType} → ${rel.targetTitle}`;
  }
  return (p.payload as TimelineFactProposalPayload).description.slice(0, 120);
}

function proposalBody(p: LoreIngestionProposal): string {
  if (p.proposal_type === "entry") {
    const entry = p.payload as EntryProposalPayload;
    return entry.summary + (entry.content ? `\n\n${entry.content}` : "");
  }
  if (p.proposal_type === "relationship") return (p.payload as RelationshipProposalPayload).description || "";
  return (p.payload as TimelineFactProposalPayload).description;
}

export default function LoreIngestionStudio() {
  const [projects, setProjects] = useState<LoreProject[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [proposals, setProposals] = useState<LoreIngestionProposal[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ summary?: string; content?: string; description?: string }>({});
  const [duplicateChoices, setDuplicateChoices] = useState<Record<string, DuplicateResolution>>({});

  const [form, setForm] = useState({
    title: "",
    source_type: "screenplay",
    project_ids: new Set<string>(),
    raw_text: "",
  });

  const loadProjects = useCallback(async () => {
    const res = await fetch("/api/lore/projects").then((r) => r.json()).catch(() => null);
    if (res?.projects) setProjects(res.projects);
  }, []);

  const loadSources = useCallback(async () => {
    const res = await fetch("/api/lore/ingestion/sources").then((r) => r.json()).catch(() => null);
    if (res?.sources) setSources(res.sources);
  }, []);

  const loadSessions = useCallback(async () => {
    const res = await fetch("/api/lore/ingestion/sessions").then((r) => r.json()).catch(() => null);
    if (res?.sessions) setSessions(res.sessions);
  }, []);

  const loadProposals = useCallback(async (sessionId: string) => {
    const res = await fetch(`/api/lore/ingestion/proposals?session_id=${sessionId}`).then((r) => r.json()).catch(() => null);
    if (res?.proposals) setProposals(res.proposals);
  }, []);

  useEffect(() => {
    loadProjects();
    loadSources();
    loadSessions();
  }, [loadProjects, loadSources, loadSessions]);

  useEffect(() => {
    if (selectedSessionId) loadProposals(selectedSessionId);
  }, [selectedSessionId, loadProposals]);

  async function runAnalysis(sessionId: string) {
    setAnalyzing(true);
    setStatus("Analyzing lore… this can take a little while for long documents.");
    try {
      const res = await fetch(`/api/lore/ingestion/sessions/${sessionId}/analyze`, { method: "POST" }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setStatus(
        res.session?.note ? res.session.note : `Analysis complete — ${res.session?.extracted_count ?? 0} candidates found.`
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setAnalyzing(false);
      await loadSessions();
      setSelectedSessionId(sessionId);
    }
  }

  async function handleCreateSource(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.raw_text.trim()) {
      setStatus("A title and some source text are required.");
      return;
    }
    setStatus("Saving source…");
    try {
      const sourceRes = await fetch("/api/lore/ingestion/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          source_type: form.source_type,
          raw_text: form.raw_text,
          project_ids: Array.from(form.project_ids),
        }),
      }).then((r) => r.json());
      if (sourceRes.error) throw new Error(sourceRes.error);

      const sessionRes = await fetch("/api/lore/ingestion/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_id: sourceRes.source.id }),
      }).then((r) => r.json());
      if (sessionRes.error) throw new Error(sessionRes.error);

      setForm({ title: "", source_type: "screenplay", project_ids: new Set(), raw_text: "" });
      await loadSources();
      await runAnalysis(sessionRes.session.id);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to create source.");
    }
  }

  async function handleFileUpload(file: File) {
    const name = file.name.toLowerCase();
    const bareTitle = file.name.replace(/\.[^.]+$/, "");

    // Plain text formats can be read directly in the browser.
    if (name.endsWith(".txt") || name.endsWith(".md")) {
      const text = await file.text();
      setForm((f) => ({ ...f, raw_text: text, title: f.title || bareTitle }));
      return;
    }

    // Word (.docx) and PDF need server-side extraction — send the raw file
    // to the extract-text route and drop the resulting text into the same
    // textarea a paste would use.
    setStatus(`Reading ${file.name}…`);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/lore/ingestion/extract-text", { method: "POST", body }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setForm((f) => ({ ...f, raw_text: res.text, title: f.title || bareTitle }));
      setStatus(null);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not read that file.");
    }
  }

  async function applyDecision(proposalId: string, decision: ApprovalDecision) {
    setStatus(null);
    try {
      const res = await fetch(`/api/lore/ingestion/proposals/${proposalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "review", decision }),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setProposals((prev) => prev.map((p) => (p.id === proposalId ? res.proposal : p)));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to update proposal.");
    }
  }

  async function saveEdit(proposal: LoreIngestionProposal) {
    const res = await fetch(`/api/lore/ingestion/proposals/${proposal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "edit", payload: editDraft }),
    }).then((r) => r.json());
    if (res.error) setStatus(res.error);
    else {
      setProposals((prev) => prev.map((p) => (p.id === proposal.id ? res.proposal : p)));
      setEditingId(null);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkApply(decision: ApprovalDecision) {
    if (!selectedIds.size) return;
    if (decision.action === "approve" && (decision.canonStatus === "CANON" || decision.canonStatus === "SECRET_CANON")) {
      const confirmed = window.confirm(
        `Approve ${selectedIds.size} proposal(s) as ${decision.canonStatus} canon? This cannot be automatically undone.`
      );
      if (!confirmed) return;
    }
    setStatus("Applying to selected proposals…");
    const res = await fetch("/api/lore/ingestion/proposals/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposal_ids: Array.from(selectedIds), decision }),
    }).then((r) => r.json());
    setStatus(`Updated ${res.succeeded?.length ?? 0}, failed ${res.failed?.length ?? 0}.`);
    setSelectedIds(new Set());
    if (selectedSessionId) loadProposals(selectedSessionId);
  }

  const selectedSession = useMemo(() => sessions.find((s) => s.id === selectedSessionId) ?? null, [sessions, selectedSessionId]);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 20px", color: "#f5f5f5" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ fontSize: 24, marginBottom: 4 }}>Lore Ingestion Studio</h1>
        <Link href="/board/admin/lore" style={{ fontSize: 13, opacity: 0.8 }}>
          ← Lore Library
        </Link>
      </div>
      <p style={{ opacity: 0.7, marginBottom: 24, maxWidth: 720 }}>
        Feed screenplays, treatments, character bibles, and notes through AI extraction. Nothing becomes canon
        automatically — every result lands here as a proposal for you to approve, edit, or reject.
      </p>

      <section style={{ marginBottom: 32, border: "1px solid #222", borderRadius: 10, padding: 20 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>New source</h2>
        <form onSubmit={handleCreateSource} style={{ display: "grid", gap: 10 }}>
          <input
            required
            placeholder="Source title (e.g. Those Ryderz — Episode 3 Treatment)"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <select value={form.source_type} onChange={(e) => setForm((f) => ({ ...f, source_type: e.target.value }))}>
            {SOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {projects.map((p) => (
              <label key={p.id} style={{ fontSize: 13, opacity: 0.85 }}>
                <input
                  type="checkbox"
                  checked={form.project_ids.has(p.id)}
                  onChange={(e) =>
                    setForm((f) => {
                      const next = new Set(f.project_ids);
                      if (e.target.checked) next.add(p.id);
                      else next.delete(p.id);
                      return { ...f, project_ids: next };
                    })
                  }
                />{" "}
                {p.title}
              </label>
            ))}
          </div>
          <input
            type="file"
            accept=".txt,.md,.docx,.pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
            }}
          />
          <p style={{ fontSize: 12, opacity: 0.6, margin: 0 }}>
            Accepts .txt, .md, .docx (Word), or .pdf. Legacy .doc files: re-save as .docx first.
          </p>
          <textarea
            required
            placeholder="Or paste text here…"
            value={form.raw_text}
            onChange={(e) => setForm((f) => ({ ...f, raw_text: e.target.value }))}
            rows={8}
          />
          <button type="submit" disabled={analyzing}>
            {analyzing ? "Analyzing…" : "Save & Analyze"}
          </button>
        </form>
        {status && <p style={{ opacity: 0.85, marginTop: 10 }}>{status}</p>}
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Sessions</h2>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {sessions.map((session) => (
            <li
              key={session.id}
              onClick={() => setSelectedSessionId(session.id)}
              style={{
                cursor: "pointer",
                padding: "10px 12px",
                borderBottom: "1px solid #222",
                background: selectedSessionId === session.id ? "#1a1a1a" : "transparent",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>
                <strong>{session.lore_ingestion_sources?.title ?? "Untitled source"}</strong>{" "}
                <span style={{ opacity: 0.6, fontSize: 13 }}>
                  ({session.status}, {session.extracted_count} candidates
                  {session.conflict_count ? `, ${session.conflict_count} conflicts` : ""})
                </span>
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  runAnalysis(session.id);
                }}
                disabled={analyzing}
              >
                Re-analyze
              </button>
            </li>
          ))}
          {!sessions.length && <li style={{ opacity: 0.6, padding: 12 }}>No ingestion sessions yet.</li>}
        </ul>
        {selectedSession?.error && (
          <p style={{ color: "#f87171", marginTop: 8 }}>Error: {selectedSession.error}</p>
        )}
        {selectedSession?.note && <p style={{ color: "#facc15", marginTop: 8 }}>{selectedSession.note}</p>}
      </section>

      {sources.length === 0 && null}

      {selectedSessionId && (
        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ fontSize: 18 }}>Proposals ({proposals.length})</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => bulkApply({ action: "reject" })} disabled={!selectedIds.size}>
                Reject selected
              </button>
              <button onClick={() => bulkApply({ action: "approve", canonStatus: "DRAFT" })} disabled={!selectedIds.size}>
                Save selected as draft
              </button>
              <button onClick={() => bulkApply({ action: "approve", canonStatus: "CANON" })} disabled={!selectedIds.size}>
                Approve selected as canon
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gap: 14 }}>
            {proposals.map((p) => (
              <div key={p.id} style={{ border: "1px solid #222", borderRadius: 10, padding: 16 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelected(p.id)} style={{ marginTop: 4 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <strong>{proposalHeadline(p)}</strong>
                      <span style={{ opacity: 0.6, fontSize: 12 }}>[{p.proposal_type}{p.entry_type ? `: ${p.entry_type}` : ""}]</span>
                      <span style={statusBadgeStyle(p.status)}>{p.status}</span>
                    </div>

                    {editingId === p.id ? (
                      <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                        <textarea
                          rows={5}
                          defaultValue={proposalBody(p)}
                          onChange={(e) =>
                            setEditDraft(
                              p.proposal_type === "timeline_fact" ? { description: e.target.value } : { summary: e.target.value }
                            )
                          }
                        />
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => saveEdit(p)}>Save edit</button>
                          <button onClick={() => setEditingId(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <p style={{ opacity: 0.85, marginTop: 8, whiteSpace: "pre-wrap" }}>{proposalBody(p)}</p>
                    )}

                    {p.possible_duplicate_of && (
                      <div style={{ background: "#1f2937", borderRadius: 8, padding: 10, marginTop: 8 }}>
                        <strong style={{ fontSize: 13 }}>Possible existing entity</strong>
                        <p style={{ fontSize: 13, opacity: 0.85 }}>{p.duplicate_match_reason}</p>
                      </div>
                    )}

                    {p.conflict_detected && (
                      <div style={{ background: "#3f1d1d", borderRadius: 8, padding: 10, marginTop: 8 }}>
                        <strong style={{ fontSize: 13, color: "#f87171" }}>⚠ Possible canon conflict</strong>
                        <p style={{ fontSize: 13, opacity: 0.9 }}>{p.conflict_notes}</p>
                      </div>
                    )}

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                      {APPROVE_STATUSES.map((canonStatus) => (
                        <button
                          key={canonStatus}
                          onClick={() =>
                            applyDecision(p.id, {
                              action: "approve",
                              canonStatus,
                              duplicateResolution: p.possible_duplicate_of
                                ? duplicateChoices[p.id] ?? "update_existing"
                                : undefined,
                            })
                          }
                        >
                          Approve → {canonStatus}
                        </button>
                      ))}
                      {p.possible_duplicate_of && p.proposal_type === "entry" && (
                        <select
                          value={duplicateChoices[p.id] ?? "update_existing"}
                          onChange={(e) =>
                            setDuplicateChoices((prev) => ({ ...prev, [p.id]: e.target.value as DuplicateResolution }))
                          }
                        >
                          <option value="update_existing">Update existing on approve</option>
                          <option value="merge_information">Merge into existing on approve</option>
                          <option value="create_new">Create new entry anyway</option>
                          <option value="ignore_proposal">Ignore (treat as reject)</option>
                        </select>
                      )}
                      <button onClick={() => setEditingId(p.id)}>Edit</button>
                      <button onClick={() => applyDecision(p.id, { action: "needs_review" })}>Needs review</button>
                      <button onClick={() => applyDecision(p.id, { action: "reject" })}>Reject</button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {!proposals.length && <p style={{ opacity: 0.6 }}>No proposals in this session yet.</p>}
          </div>
        </section>
      )}
    </div>
  );
}
