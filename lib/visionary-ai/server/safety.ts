import type { VisionaryMessage } from "../types";

export type VisionaryRestriction =
  | "private-production"
  | "spoiler"
  | "credentials"
  | "private-contact"
  | "private-account";

const META_BOUNDARY_QUESTION = /\b(?:(?:what|which) (?:information|topics?|details?) (?:is|are) (?:private|off limits)|what (?:are )?(?:your )?boundaries|explain (?:your )?(?:privacy|safety) boundaries)\b/i;

export function assessVisionaryRequest(messages: VisionaryMessage[]): VisionaryRestriction | null {
  const latest = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  if (META_BOUNDARY_QUESTION.test(latest)) return null;

  if (/\b(?:password|passcode|api key|secret key|access token|login credentials?)\b/i.test(latest)) {
    return "credentials";
  }
  if (/\b(?:private|personal)\s+(?:email|phone|address|contact|number)\b|\b(?:john andy|cast member|crew member)'?s\s+(?:email|phone|address)\b/i.test(latest)) {
    return "private-contact";
  }
  if (/\b(?:private (?:message|file|account|board|drop)|someone else's (?:message|file|account|board|drop)|dm history)\b/i.test(latest)) {
    return "private-account";
  }

  const requestsNoSpoilers = /\b(?:no spoilers?|without spoilers?|spoiler[- ]free)\b/i.test(latest);
  if (!requestsNoSpoilers && /\b(?:full screenplay|full script|leaked script|ending|plot twist|sequel plot|major spoilers?|who dies|final scene)\b/i.test(latest)) {
    return "spoiler";
  }
  if (/\b(?:production budget|internal budget|salary|cast negotiation|crew negotiation|contract terms?|internal dispute|unreleased business strategy|private roadmap|private production notes?)\b/i.test(latest)) {
    return "private-production";
  }
  return null;
}

export function restrictedVisionaryAnswer(reason: VisionaryRestriction) {
  if (reason === "spoiler") {
    return "I can discuss the public premise, characters, powers, and themes of THOSE RYDERZ, but I can't provide screenplay twists, endings, sequel material, or unreleased production lore. Those parts of the signal are intentionally sealed.";
  }
  if (reason === "credentials") {
    return "I can't provide passwords, API keys, access tokens, or other credentials. Visionary AI does not have access to them.";
  }
  if (reason === "private-contact") {
    return "I can't provide private contact information. I can point you to the public Join Us page or another approved JAB Visions destination instead.";
  }
  if (reason === "private-account") {
    return "I can't access or reveal private Board accounts, messages, files, or Drops. Private Board data is not connected to Visionary AI.";
  }
  return "I can't provide private production information such as budgets, negotiations, contracts, disputes, internal strategy, or unreleased production notes. I can share the approved public status and public-facing plans.";
}

export function unknownVisionaryAnswer() {
  return "I don't have enough approved public JAB Visions knowledge to answer that reliably. I can tell you what is publicly confirmed, but I won't invent a detail or turn an unconfirmed idea into canon.";
}

export function finalizeVisionaryAnswer(answer: string, approvedLinks: Set<string>) {
  if (/\bI am John Andy\b/i.test(answer)) {
    return "I'm Visionary AI, not John Andy. I can help explain the approved public JAB Visions knowledge available to me.";
  }
  if (/\bI(?:'ve| have)\s+(?:sent|submitted|booked|scheduled|hired|cast|paid|refunded|purchased|uploaded|deleted|changed|updated|contacted|emailed)\b/i.test(answer)) {
    return "I can explain options and point to approved pages, but I haven't completed an action on your behalf.";
  }

  return answer.replace(/https?:\/\/[^\s)\]}>,]+/g, (url) => {
    const cleanUrl = url.replace(/[.,;:!?]+$/, "");
    return approvedLinks.has(cleanUrl) ? url : "[unapproved link removed]";
  });
}
