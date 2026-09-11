import boardDocument from "@/content/visionary-ai/board.json";
import boardSystemsDocument from "@/content/visionary-ai/board-systems.json";
import boundariesDocument from "@/content/visionary-ai/boundaries.json";
import brandVoiceDocument from "@/content/visionary-ai/brand-voice.json";
import ecosystemDocument from "@/content/visionary-ai/ecosystem.json";
import internalExclusionDocument from "@/content/visionary-ai/internal-exclusion.json";
import jabVisionsDocument from "@/content/visionary-ai/jab-visions.json";
import joinDocument from "@/content/visionary-ai/join.json";
import linksDocument from "@/content/visionary-ai/links.json";
import literatureDocument from "@/content/visionary-ai/literature.json";
import storeDocument from "@/content/visionary-ai/store.json";
import thoseRyderzDocument from "@/content/visionary-ai/those-ryderz.json";
import type {
  VisionaryConfidence,
  VisionaryKnowledgeDocument,
  VisionaryMessage,
  VisionarySource,
} from "./types";

function asKnowledgeDocument(value: unknown) {
  return value as VisionaryKnowledgeDocument;
}

const ALL_KNOWLEDGE_DOCUMENTS = [
  jabVisionsDocument,
  ecosystemDocument,
  thoseRyderzDocument,
  boardDocument,
  boardSystemsDocument,
  storeDocument,
  literatureDocument,
  joinDocument,
  linksDocument,
  boundariesDocument,
  brandVoiceDocument,
  internalExclusionDocument,
].map(asKnowledgeDocument);

const PUBLIC_KNOWLEDGE_DOCUMENTS = ALL_KNOWLEDGE_DOCUMENTS.filter(
  (document) => document.visibility !== "private"
);

const STOP_WORDS = new Set([
  "about", "after", "again", "also", "because", "could", "does", "from",
  "have", "into", "just", "more", "that", "their", "there", "these",
  "they", "this", "what", "when", "where", "which", "with", "would",
  "your", "tell", "please", "explain",
]);

const JAB_LANGUAGE = /\b(?:jab|visionary|ryderz?|board|drop(?:s|book|books| pad| studio)?|bucket brain|friend\s*zone|whispers?|signals?|john andy|solomon'?s secrets)\b/i;

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").replace(/\s+/g, " ").trim();
}

function terms(value: string) {
  return normalize(value)
    .split(/\s+/)
    .filter((term) => term.length > 2 && !STOP_WORDS.has(term));
}

function scoreDocument(
  latestQuery: string,
  contextQuery: string,
  document: VisionaryKnowledgeDocument
) {
  const title = normalize(document.title);
  const category = normalize(document.category);
  const keywords = normalize(document.keywords.join(" "));
  const body = normalize(`${document.summary} ${document.facts.join(" ")}`);
  const latest = normalize(latestQuery);
  const context = normalize(contextQuery);
  let score = 0;

  for (const keyword of document.keywords) {
    const phrase = normalize(keyword);
    if (phrase.length > 2 && latest.includes(phrase)) score += phrase.includes(" ") ? 14 : 9;
    else if (phrase.length > 2 && context.includes(phrase)) score += phrase.includes(" ") ? 5 : 3;
  }
  for (const term of terms(latestQuery)) {
    if (title.includes(term)) score += 6;
    if (category.includes(term)) score += 4;
    if (keywords.includes(term)) score += 4;
    if (body.includes(term)) score += 1;
  }
  for (const term of terms(contextQuery)) {
    if (title.includes(term)) score += 2;
    if (keywords.includes(term)) score += 1;
    if (body.includes(term)) score += 0.25;
  }
  return score;
}

export type VisionaryRetrieval = {
  documents: VisionaryKnowledgeDocument[];
  confidence: VisionaryConfidence;
  latestQuery: string;
  contextQuery: string;
};

export function retrieveVisionaryKnowledge(
  messages: VisionaryMessage[],
  limit = 4
): VisionaryRetrieval {
  const userMessages = messages.filter((message) => message.role === "user");
  const latestQuery = userMessages.at(-1)?.content ?? "";
  const contextQuery = userMessages.slice(-3, -1).map((message) => message.content).join(" ");
  const ranked = PUBLIC_KNOWLEDGE_DOCUMENTS.map((document, index) => ({
    document,
    index,
    score: scoreDocument(latestQuery, contextQuery, document),
  })).sort((a, b) => b.score - a.score || a.index - b.index);
  const matches = ranked.filter((entry) => entry.score >= 2).slice(0, limit);

  if (!matches.length) {
    const jabSpecific = JAB_LANGUAGE.test(`${latestQuery} ${contextQuery}`);
    return {
      documents: jabSpecific ? [] : [asKnowledgeDocument(brandVoiceDocument)],
      confidence: jabSpecific ? "unknown" : "general",
      latestQuery,
      contextQuery,
    };
  }

  return {
    documents: matches.map((entry) => entry.document),
    confidence: matches[0].score >= 10 ? "grounded" : "partial",
    latestQuery,
    contextQuery,
  };
}

export function formatKnowledgeContext(retrieval: VisionaryRetrieval) {
  if (!retrieval.documents.length) return "No approved JAB-specific records matched this question.";
  return retrieval.documents
    .map(
      (document) =>
        `RECORD: ${document.title}\nCATEGORY: ${document.category}\nVISIBILITY: ${document.visibility}\nSUMMARY: ${document.summary}\nFACTS:\n${document.facts
          .map((fact) => `- ${fact}`)
          .join("\n")}\nAPPROVED SOURCES:\n${document.sources
          .map((source) => `- ${source.title}: ${source.path}`)
          .join("\n")}`
    )
    .join("\n\n");
}

export function toVisionarySources(documents: VisionaryKnowledgeDocument[]): VisionarySource[] {
  const seen = new Set<string>();
  return documents.flatMap((document) =>
    document.sources.flatMap((source) => {
      const key = `${source.title}|${source.path}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ id: `${document.id}:${seen.size}`, ...source }];
    })
  );
}

export function approvedVisionaryLinks() {
  return new Set(
    PUBLIC_KNOWLEDGE_DOCUMENTS.flatMap((document) =>
      document.sources.map((source) => source.path)
    )
  );
}

export function getBoundaryDocument() {
  return asKnowledgeDocument(boundariesDocument);
}

function scoreFact(query: string, fact: string) {
  const normalizedQuery = normalize(query);
  const normalizedFact = normalize(fact);
  return terms(query).reduce((score, term) => {
    if (!normalizedFact.includes(term)) return score;
    return score + (normalizedQuery.includes(term) ? 2 : 1);
  }, 0);
}

export function buildGroundedKnowledgeAnswer(retrieval: VisionaryRetrieval) {
  const rankedFacts = retrieval.documents
    .flatMap((document, documentIndex) =>
      document.facts.map((fact, factIndex) => ({
        fact,
        documentIndex,
        factIndex,
        score: scoreFact(retrieval.latestQuery, fact),
      }))
    )
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.documentIndex - b.documentIndex ||
        a.factIndex - b.factIndex
    );

  const directFacts = rankedFacts.filter((entry) => entry.score > 0).slice(0, 2);
  if (directFacts.length) return directFacts.map((entry) => entry.fact).join("\n\n");

  const primary = retrieval.documents[0];
  if (!primary) return unknownVisionaryKnowledgeAnswer();
  return [primary.summary, ...primary.facts.slice(0, 2)].join("\n\n");
}

function unknownVisionaryKnowledgeAnswer() {
  return "I don't have enough approved public JAB Visions knowledge to answer that reliably.";
}
