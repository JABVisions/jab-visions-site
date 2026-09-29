// File: lib/lore/server/embeddings.ts
// Thin OpenAI embeddings wrapper for the Lore Library's semantic search leg.
// Mirrors lib/visionary-ai/server/openai.ts's style (raw fetch, no SDK). Always
// degrades to null on any failure — embeddings are an enhancement, not a
// requirement, since retrieval also has keyword + relationship legs.

const EMBEDDING_MODEL = "text-embedding-3-small";
export const LORE_EMBEDDING_DIMENSIONS = 1536;

type EmbeddingsPayload = {
  data?: Array<{ embedding?: number[] }>;
  error?: { message?: string };
};

export function isLoreEmbeddingConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

/** Embed one piece of text. Returns null if unconfigured, empty, or the call fails. */
export async function embedLoreText(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const input = text.trim().slice(0, 8000);
  if (!apiKey || !input) return null;

  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input }),
      signal: AbortSignal.timeout(10_000),
    });
    const payload = (await response.json().catch(() => ({}))) as EmbeddingsPayload;
    if (!response.ok) return null;
    const embedding = payload.data?.[0]?.embedding;
    return Array.isArray(embedding) && embedding.length === LORE_EMBEDDING_DIMENSIONS
      ? embedding
      : null;
  } catch {
    return null;
  }
}

/** Build the text an entry's embedding should represent — title carries the most weight. */
export function loreEntryEmbeddingSource(entry: {
  title: string;
  summary?: string | null;
  content?: string | null;
}) {
  return [entry.title, entry.summary, entry.content].filter(Boolean).join("\n\n");
}
