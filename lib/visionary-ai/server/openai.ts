import type { VisionaryMessage } from "../types";

type OpenAIResponsePayload = {
  error?: { message?: string };
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  output_text?: string;
};

export function isVisionaryModelConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function extractOutputText(payload: OpenAIResponsePayload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  return (payload.output ?? [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((content) => content.type === "output_text" && content.text)
    .map((content) => content.text!.trim())
    .filter(Boolean)
    .join("\n\n");
}

export async function createVisionaryModelResponse({
  instructions,
  messages,
  safetyIdentifier,
}: {
  instructions: string;
  messages: VisionaryMessage[];
  safetyIdentifier: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("Visionary AI model is not configured.");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL?.trim() || "gpt-5-mini",
      instructions,
      input: messages,
      max_output_tokens: 700,
      store: false,
      safety_identifier: safetyIdentifier,
      tools: [],
    }),
    signal: AbortSignal.timeout(25_000),
  });

  const payload = (await response.json().catch(() => ({}))) as OpenAIResponsePayload;
  if (!response.ok) {
    throw new Error(payload.error?.message || "Visionary AI could not reach its model.");
  }

  const answer = extractOutputText(payload);
  if (!answer) throw new Error("Visionary AI returned an empty response.");
  return answer;
}
