export type VisionaryRole = "user" | "assistant";

export type VisionaryMessage = {
  role: VisionaryRole;
  content: string;
};

export type VisionaryVisibility = "public" | "teaser" | "private";

export type VisionaryConfidence =
  | "grounded"
  | "partial"
  | "general"
  | "unknown"
  | "restricted";

export type VisionaryKnowledgeSource = {
  title: string;
  path: string;
};

export type VisionaryKnowledgeDocument = {
  id: string;
  title: string;
  category: string;
  visibility: VisionaryVisibility;
  summary: string;
  facts: string[];
  keywords: string[];
  sources: VisionaryKnowledgeSource[];
};

export type VisionarySource = VisionaryKnowledgeSource & { id: string };

export type VisionaryChatResponse = {
  ok: true;
  answer: string;
  mode: "openai" | "knowledge" | "safety";
  confidence: VisionaryConfidence;
  sources: VisionarySource[];
};

export type VisionaryChatError = {
  ok: false;
  error: string;
};
