"use client";

// File: app/board/admin/lore/LoreLibraryAdmin.tsx
// Deliberately minimal per spec ("do not overdesign"): search/list, create,
// edit, retire lore entries; create/list projects; add relationships. No
// graph visualization, no bulk tooling — just enough for a creator to keep
// the canon database populated.

import { useCallback, useEffect, useState } from "react";
import type { CanonStatus, LoreEntry, LoreProject } from "@/lib/lore/types";

const CANON_STATUSES: CanonStatus[] = ["CANON", "DRAFT", "CONCEPT", "SECRET_CANON", "RETIRED"];

function canonBadgeStyle(status: CanonStatus): React.CSSProperties {
  const colors: Record<CanonStatus, string> = {
    CANON: "#facc15",
    DRAFT: "#38bdf8",
    CONCEPT: "#a78bfa",
    RETIRED: "#6b7280",
    SECRET_CANON: "#f97316",
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

type EntryFormState = {
  id?: string;
  project_id: string;
  title: string;
  slug: string;
  entry_type: string;
  canon_status: CanonStatus;
  summary: string;
  content: string;
};

const EMPTY_FORM: EntryFormState = {
  project_id: "",
  title: "",
  slug: "",
  entry_type: "character",
  canon_status: "DRAFT",
  summary: "",
  content: "",
};

export default function LoreLibraryAdmin() {
  const [projects, setProjects] = useState<LoreProject[]>([]);
  const [entries, setEntries] = useState<LoreEntry[]>([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<EntryFormState>(EMPTY_FORM);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadProjects = useCallback(async () => {
    const res = await fetch("/api/lore/projects").then((r) => r.json()).catch(() => null);
    if (res?.projects) setProjects(res.projects);
  }, []);

  const loadEntries = useCallback(async (q: string) => {
    const url = q ? `/api/lore/entries?q=${encodeURIComponent(q)}` : "/api/lore/entries";
    const res = await fetch(url).then((r) => r.json()).catch(() => null);
    if (res?.entries) setEntries(res.entries);
  }, []);

  useEffect(() => {
    loadProjects();
    loadEntries("");
  }, [loadProjects, loadEntries]);

  async function handleSaveEntry(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    try {
      const payload = {
        ...form,
        project_id: form.project_id || null,
      };
      const url = form.id ? `/api/lore/entries/${form.id}` : "/api/lore/entries";
      const method = form.id ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setStatus(form.id ? "Entry updated." : "Entry created.");
      setForm(EMPTY_FORM);
      loadEntries(query);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save entry.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRetire(id: string) {
    setStatus(null);
    const res = await fetch(`/api/lore/entries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "retire" }),
    }).then((r) => r.json());
    if (res.error) setStatus(res.error);
    else loadEntries(query);
  }

  function handleEdit(entry: LoreEntry) {
    setForm({
      id: entry.id,
      project_id: entry.project_id ?? "",
      title: entry.title,
      slug: entry.slug,
      entry_type: entry.entry_type,
      canon_status: entry.canon_status,
      summary: entry.summary ?? "",
      content: entry.content ?? "",
    });
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 20px", color: "#f5f5f5" }}>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Lore Library</h1>
      <p style={{ opacity: 0.7, marginBottom: 24 }}>
        Canon database powering Visionary AI. Changes here are visible to the AI immediately.
      </p>

      <section style={{ marginBottom: 32 }}>
        <input
          placeholder="Search entries…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            loadEntries(e.target.value);
          }}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #333",
            background: "#111",
            color: "#fff",
          }}
        />
        <ul style={{ listStyle: "none", padding: 0, marginTop: 16 }}>
          {entries.map((entry) => (
            <li
              key={entry.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 12px",
                borderBottom: "1px solid #222",
              }}
            >
              <div>
                <strong>{entry.title}</strong>{" "}
                <span style={{ opacity: 0.6, fontSize: 13 }}>({entry.entry_type})</span>{" "}
                <span style={canonBadgeStyle(entry.canon_status)}>{entry.canon_status}</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => handleEdit(entry)}>Edit</button>
                {entry.canon_status !== "RETIRED" && (
                  <button onClick={() => handleRetire(entry.id)}>Retire</button>
                )}
              </div>
            </li>
          ))}
          {!entries.length && <li style={{ opacity: 0.6, padding: 12 }}>No entries yet.</li>}
        </ul>
      </section>

      <section>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>{form.id ? "Edit entry" : "New entry"}</h2>
        <form onSubmit={handleSaveEntry} style={{ display: "grid", gap: 10 }}>
          <select
            value={form.project_id}
            onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}
          >
            <option value="">Universe-wide (no project)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <input
            required
            placeholder="Title (e.g. Leo Montana)"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <input
            required
            placeholder="Slug (e.g. leo-montana)"
            value={form.slug}
            onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
          />
          <input
            required
            placeholder="Entry type (e.g. character, location, event)"
            value={form.entry_type}
            onChange={(e) => setForm((f) => ({ ...f, entry_type: e.target.value }))}
          />
          <select
            value={form.canon_status}
            onChange={(e) => setForm((f) => ({ ...f, canon_status: e.target.value as CanonStatus }))}
          >
            {CANON_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <textarea
            placeholder="Summary — what Visionary AI will read first"
            value={form.summary}
            onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
            rows={3}
          />
          <textarea
            placeholder="Full content (optional, longer detail)"
            value={form.content}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            rows={6}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={loading}>
              {form.id ? "Save changes" : "Create entry"}
            </button>
            {form.id && (
              <button type="button" onClick={() => setForm(EMPTY_FORM)}>
                Cancel edit
              </button>
            )}
          </div>
          {status && <p style={{ opacity: 0.8 }}>{status}</p>}
        </form>
      </section>
    </div>
  );
}
