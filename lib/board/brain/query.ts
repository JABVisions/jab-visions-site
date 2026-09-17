import type { BucketBrainEntity, BucketBrainIntent, BucketBrainPhase, BucketBrainResponse } from "./response";
import { routeBucketBrainQuery } from "./intents";
import { personalSearchNotice } from "./personal";
import { askVisionary, searchBucketBrain } from "./visionary";

export type QueryProgress = {
  phase: BucketBrainPhase;
  status: string;
};

/**
 * Phase-one Bucket Brain orchestrator.
 * Search hits Board / Work Boards; conversation hits existing Visionary AI.
 * Personal and Dropbook indexes are stubbed until those sources are connected.
 */
export async function executeBucketBrainQuery(
  raw: string,
  forced?: BucketBrainIntent | null,
  options?: {
    signal?: AbortSignal;
    onProgress?: (progress: QueryProgress) => void;
  }
): Promise<BucketBrainResponse> {
  const routed = routeBucketBrainQuery(raw, forced);
  const query = routed.searchQuery;
  const entities: BucketBrainEntity[] = [];
  let status = "";

  if (routed.intent === "personal_search") {
    const notice = personalSearchNotice();
    return {
      query,
      intent: routed.intent,
      status: "",
      entities: [
        {
          kind: "notice",
          id: "personal-soon",
          title: notice.title,
          body: notice.body,
        },
      ],
    };
  }

  if (routed.intent === "board_content_search") {
    entities.push({
      kind: "notice",
      id: "content-soon",
      title: "Board content search is still opening",
      body: "Dropbooks and individual Drops are not indexed yet. Related Work Boards and Visionary notes appear below when available.",
    });
  }

  if (routed.wantsSearch) {
    options?.onProgress?.({
      phase: "searching",
      status:
        routed.intent === "creator_search" ? "Searching Board…" : "Looking through Work Boards…",
    });
    try {
      const found = await searchBucketBrain(query, routed.intent, options?.signal);
      entities.push(...(found.items ?? []));
      if (found.status) status = found.status;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      entities.push({
        kind: "notice",
        id: "search-unavailable",
        title: "Board search is unavailable right now",
        body: "Visionary can still answer while Work Boards reconnect.",
      });
    }
  }

  if (routed.wantsVisionary) {
    options?.onProgress?.({
      phase: "thinking",
      status: "Thinking…",
    });
    const visionary = await askVisionary(query, options?.signal);
    entities.unshift(visionary);
  }

  const boards = entities.filter((entity) => entity.kind === "work_board" || entity.kind === "creator");
  if (boards.length) {
    status = `Found ${boards.length} Work Board${boards.length === 1 ? "" : "s"}.`;
  }

  return {
    query,
    intent: routed.intent,
    status,
    entities,
  };
}
