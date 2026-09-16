import type { VisionaryChatError, VisionaryChatResponse } from "@/lib/visionary-ai/types";
import type { VisionaryEntity } from "./response";

export async function askVisionary(question: string, signal?: AbortSignal): Promise<VisionaryEntity> {
  const response = await fetch("/api/visionary-ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: question.slice(0, 1500) }],
    }),
    signal,
  });
  const payload = (await response.json()) as VisionaryChatResponse | VisionaryChatError;
  if (!response.ok || !payload.ok) {
    throw new Error(payload.ok ? "Visionary could not respond." : payload.error);
  }
  return {
    kind: "visionary",
    id: `visionary-${Date.now()}`,
    answer: payload.answer,
    mode: payload.mode,
    confidence: payload.confidence,
  };
}

export async function searchBucketBrain(query: string, intent: string, signal?: AbortSignal) {
  const url = `/api/board/bucket-brain/search?q=${encodeURIComponent(query)}&intent=${encodeURIComponent(intent)}`;
  const response = await fetch(url, { method: "GET", signal, headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error("Board search is unavailable right now.");
  }
  return (await response.json()) as {
    ok: boolean;
    items: import("./response").WorkBoardEntity[];
    status?: string;
  };
}
