import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  approvedVisionaryLinks,
  buildGroundedKnowledgeAnswer,
  formatKnowledgeContext,
  getBoundaryDocument,
  retrieveVisionaryKnowledge,
  toVisionarySources,
} from "@/lib/visionary-ai/knowledge";
import {
  createVisionaryModelResponse,
  isVisionaryModelConfigured,
} from "@/lib/visionary-ai/server/openai";
import {
  assessVisionaryRequest,
  finalizeVisionaryAnswer,
  restrictedVisionaryAnswer,
  unknownVisionaryAnswer,
} from "@/lib/visionary-ai/server/safety";
import { buildVisionarySystemPrompt } from "@/lib/visionary-ai/server/systemPrompt";
import type {
  VisionaryChatError,
  VisionaryChatResponse,
  VisionaryMessage,
} from "@/lib/visionary-ai/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGES = 12;
const MAX_MESSAGE_LENGTH = 1_500;
const MAX_TRANSCRIPT_LENGTH = 9_000;
const MAX_BODY_LENGTH = 14_000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 12;
const MAX_RATE_BUCKETS = 5_000;
const requestLog = new Map<string, number[]>();

function clientAddress(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "anonymous"
  );
}

function isRateLimited(address: string) {
  const now = Date.now();
  for (const [key, timestamps] of requestLog) {
    const recent = timestamps.filter((timestamp) => now - timestamp < RATE_WINDOW_MS);
    if (recent.length) requestLog.set(key, recent);
    else requestLog.delete(key);
  }
  if (requestLog.size >= MAX_RATE_BUCKETS && !requestLog.has(address)) return true;

  const recent = requestLog.get(address) ?? [];
  recent.push(now);
  requestLog.set(address, recent);
  return recent.length > RATE_LIMIT;
}

function cleanMessages(value: unknown): VisionaryMessage[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const messages = value.slice(-MAX_MESSAGES).map((entry) => {
    if (!entry || typeof entry !== "object") return null;
    const role = "role" in entry ? entry.role : null;
    const content = "content" in entry ? entry.content : null;
    if (role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string") return null;
    const cleaned = content.trim();
    if (!cleaned || cleaned.length > MAX_MESSAGE_LENGTH) return null;
    return { role, content: cleaned } satisfies VisionaryMessage;
  });

  if (!messages.every(Boolean)) return null;
  const validMessages = messages as VisionaryMessage[];
  const totalLength = validMessages.reduce((total, message) => total + message.content.length, 0);
  if (totalLength > MAX_TRANSCRIPT_LENGTH || validMessages.at(-1)?.role !== "user") return null;
  return validMessages;
}

function safetyIdentifier(address: string) {
  return createHash("sha256").update(`visionary-ai:${address}`).digest("hex");
}

function errorResponse(error: string, status: number) {
  return NextResponse.json<VisionaryChatError>({ ok: false, error }, { status });
}

export async function POST(request: NextRequest) {
  const address = clientAddress(request);
  if (isRateLimited(address)) {
    return errorResponse("The signal is moving too quickly. Please wait a minute.", 429);
  }

  const rawBody = await request.text().catch(() => "");
  if (!rawBody || rawBody.length > MAX_BODY_LENGTH) {
    return errorResponse("The conversation payload is too large.", 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return errorResponse("The conversation payload is not valid JSON.", 400);
  }

  const messages = cleanMessages(
    body && typeof body === "object" && "messages" in body
      ? (body as { messages?: unknown }).messages
      : null
  );
  if (!messages) {
    return errorResponse(
      "Send a valid conversation with messages between 1 and 1,500 characters.",
      400
    );
  }

  const restriction = assessVisionaryRequest(messages);
  if (restriction) {
    const boundaryDocument = getBoundaryDocument();
    return NextResponse.json<VisionaryChatResponse>({
      ok: true,
      answer: restrictedVisionaryAnswer(restriction),
      mode: "safety",
      confidence: "restricted",
      sources: toVisionarySources([boundaryDocument]),
    });
  }

  const retrieval = retrieveVisionaryKnowledge(messages);
  if (retrieval.confidence === "unknown") {
    return NextResponse.json<VisionaryChatResponse>({
      ok: true,
      answer: unknownVisionaryAnswer(),
      mode: "safety",
      confidence: "unknown",
      sources: [],
    });
  }

  if (!isVisionaryModelConfigured()) {
    return NextResponse.json<VisionaryChatResponse>({
      ok: true,
      answer: buildGroundedKnowledgeAnswer(retrieval),
      mode: "knowledge",
      confidence: retrieval.confidence,
      sources: toVisionarySources(retrieval.documents),
    });
  }

  try {
    const instructions = `${buildVisionarySystemPrompt(retrieval)}\n\nRETRIEVED KNOWLEDGE\n${formatKnowledgeContext(retrieval)}`;
    const modelAnswer = await createVisionaryModelResponse({
      instructions,
      messages,
      safetyIdentifier: safetyIdentifier(address),
    });
    const answer = finalizeVisionaryAnswer(modelAnswer, approvedVisionaryLinks());

    return NextResponse.json<VisionaryChatResponse>({
      ok: true,
      answer,
      mode: "openai",
      confidence: retrieval.confidence,
      sources: toVisionarySources(retrieval.documents),
    });
  } catch (error) {
    console.error("Visionary AI response error", error);
    return NextResponse.json<VisionaryChatResponse>({
      ok: true,
      answer: buildGroundedKnowledgeAnswer(retrieval),
      mode: "knowledge",
      confidence: retrieval.confidence,
      sources: toVisionarySources(retrieval.documents),
    });
  }
}
