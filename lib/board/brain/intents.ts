import type { BucketBrainIntent } from "./response";

export type RoutedQuery = {
  intent: BucketBrainIntent;
  searchQuery: string;
  wantsSearch: boolean;
  wantsVisionary: boolean;
};

const STOP = new Set([
  "a",
  "an",
  "the",
  "of",
  "in",
  "on",
  "and",
  "or",
  "for",
  "to",
  "me",
  "please",
  "some",
  "any",
  "that",
  "this",
  "with",
  "from",
  "into",
  "work",
  "board",
  "boards",
  "search",
  "find",
  "show",
  "look",
  "looking",
  "discover",
]);

const ROLE_TERMS =
  /\b(cinematographer|filmmaker|filmmakers|director|directors|writer|writers|editor|editors|producer|producers|vfx|blender|costume|designer|designers|actor|actors|composer|photographer|photographers|musician|musicians|stunt|wardrobe|hmu|dp|camera|sound mixer|production designer|location manager|casting|comics)\b/i;

const WORK_BOARD_TERMS =
  /\b(work board|work boards|portfolio|profession|job title|crew|cast)\b/i;

const CREATOR_TERMS =
  /\b(creator|creators|users?|people|person|who(?:'s| is)?|username|profile)\b/i;

const FIND_TERMS = /\b(find|search|show|look(?:ing)? for|discover)\b/i;

const PERSONAL_TERMS =
  /\b(my|mine|i made|i've|i have|have i|i been|lately)\b/i;

const PERSONAL_OBJECTS =
  /\b(project|projects|drop|drops|dropbook|dropbooks|poster|voice|recording|draft|studio)\b/i;

const VISIONARY_TERMS =
  /\b(how|why|explain|what is|what's|improve|help me|can you|tell me about)\b/i;

const HYBRID_HELP = /\b(who (?:on board )?could help|who can help|need (?:a |an )?(?:crew|team|collaborator))\b/i;

export function normalizeBucketQuery(raw: string) {
  return raw.replace(/\s+/g, " ").trim();
}

/**
 * Lightweight query router. Visionary can later own classification;
 * this first pass only detects obvious retrieval vs conversation intents.
 */
export function routeBucketBrainQuery(
  raw: string,
  forced?: BucketBrainIntent | null
): RoutedQuery {
  const query = normalizeBucketQuery(raw);
  const lower = query.toLowerCase();

  if (forced === "personal_search") {
    return {
      intent: "personal_search",
      searchQuery: query,
      wantsSearch: false,
      wantsVisionary: false,
    };
  }
  if (forced === "visionary_question") {
    return {
      intent: "visionary_question",
      searchQuery: query,
      wantsSearch: false,
      wantsVisionary: true,
    };
  }
  if (forced === "work_board_search") {
    return {
      intent: "work_board_search",
      searchQuery: query,
      wantsSearch: true,
      wantsVisionary: false,
    };
  }
  if (forced === "creator_search") {
    return {
      intent: "creator_search",
      searchQuery: query,
      wantsSearch: true,
      wantsVisionary: false,
    };
  }
  if (forced === "hybrid_query") {
    return {
      intent: "hybrid_query",
      searchQuery: query,
      wantsSearch: true,
      wantsVisionary: true,
    };
  }
  if (forced === "board_content_search") {
    return {
      intent: "board_content_search",
      searchQuery: query,
      wantsSearch: true,
      wantsVisionary: true,
    };
  }

  if (PERSONAL_TERMS.test(lower) && PERSONAL_OBJECTS.test(lower)) {
    return {
      intent: "personal_search",
      searchQuery: query,
      wantsSearch: false,
      wantsVisionary: false,
    };
  }

  if (HYBRID_HELP.test(lower) || (CREATOR_TERMS.test(lower) && ROLE_TERMS.test(lower) && VISIONARY_TERMS.test(lower))) {
    return {
      intent: "hybrid_query",
      searchQuery: query,
      wantsSearch: true,
      wantsVisionary: true,
    };
  }

  if (WORK_BOARD_TERMS.test(lower) || ROLE_TERMS.test(lower)) {
    return {
      intent: "work_board_search",
      searchQuery: query,
      wantsSearch: true,
      wantsVisionary: false,
    };
  }

  if (
    FIND_TERMS.test(lower) &&
    (CREATOR_TERMS.test(lower) || /@[a-z0-9_]+/i.test(lower) || /\bshow me\b.+\bwork board\b/i.test(lower))
  ) {
    return {
      intent: "creator_search",
      searchQuery: query,
      wantsSearch: true,
      wantsVisionary: false,
    };
  }

  if (FIND_TERMS.test(lower) && CREATOR_TERMS.test(lower) === false && !VISIONARY_TERMS.test(lower)) {
    return {
      intent: "work_board_search",
      searchQuery: query,
      wantsSearch: true,
      wantsVisionary: false,
    };
  }

  if (/\b(dropbook|dropbooks|board drop|work drop)\b/i.test(lower) && !PERSONAL_TERMS.test(lower)) {
    return {
      intent: "board_content_search",
      searchQuery: query,
      wantsSearch: true,
      wantsVisionary: true,
    };
  }

  if (VISIONARY_TERMS.test(lower) || query.length > 48) {
    return {
      intent: "visionary_question",
      searchQuery: query,
      wantsSearch: false,
      wantsVisionary: true,
    };
  }

  if (FIND_TERMS.test(lower) || /@[a-z0-9_]+/i.test(lower)) {
    return {
      intent: "creator_search",
      searchQuery: query,
      wantsSearch: true,
      wantsVisionary: false,
    };
  }

  return {
    intent: "visionary_question",
    searchQuery: query,
    wantsSearch: false,
    wantsVisionary: true,
  };
}

export function searchTokens(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9@\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^@+/, ""))
    .filter((token) => token.length > 1 && !STOP.has(token));
}

/** Expand a user query into extra match terms (roles, cities) without inventing people. */
export function expandedSearchTerms(query: string): string[] {
  const lower = query.toLowerCase();
  const extra: string[] = [];
  const aliases: Array<[RegExp, string[]]> = [
    [/\bcinematographers?\b/, ["dp / camera", "dp", "camera", "cinematographer"]],
    [/\bfilmmakers?\b/, ["director", "producer", "dp / camera", "filmmaker"]],
    [/\bvfx\b/, ["vfx artist", "vfx"]],
    [/\bcostume\b/, ["wardrobe stylist", "costume"]],
    [/\bmusic (?:video|videos|producer|producers)\b/, ["composer", "music artist", "producer"]],
    [/\bwriters?\b/, ["writer"]],
    [/\beditors?\b/, ["editor"]],
    [/\bdirectors?\b/, ["director"]],
    [/\bproducers?\b/, ["producer"]],
    [/\bphotographers?\b/, ["photographer"]],
    [/\bblender\b/, ["blender", "vfx artist"]],
    [/\bnyc\b|\bnew york\b/, ["new york", "nyc", "brooklyn"]],
    [/\bhorror\b/, ["horror"]],
    [/\bsound\b/, ["sound mixer"]],
    [/\bdesigners?\b/, ["production designer", "wardrobe stylist", "designer"]],
  ];
  for (const [pattern, terms] of aliases) {
    if (pattern.test(lower)) extra.push(...terms);
  }
  return Array.from(new Set([...searchTokens(query), ...extra]));
}
