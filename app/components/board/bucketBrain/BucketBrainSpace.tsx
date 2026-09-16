"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { openBucket } from "@/lib/board/bucketBrain";
import type {
  BucketBrainEntity,
  BucketBrainIntent,
  BucketBrainPhase,
} from "@/lib/board/bucketBrain/response";
import { routeBucketBrainQuery } from "@/lib/board/bucketBrain/intents";
import { personalSearchNotice } from "@/lib/board/bucketBrain/personal";
import { askVisionary, searchBucketBrain } from "@/lib/board/bucketBrain/visionary";
import BucketBrainInput from "./BucketBrainInput";
import BucketBrainOrb from "./BucketBrainOrb";
import BucketBrainQuickActions from "./BucketBrainQuickActions";
import BucketBrainResults from "./BucketBrainResults";
import styles from "./bucketBrainSpace.module.css";

const STATUS: Record<BucketBrainPhase, string> = {
  idle: "Ready",
  listening: "Listening…",
  searching: "Looking through Work Boards…",
  thinking: "Thinking…",
  results: "",
};

export default function BucketBrainSpace({
  isActive = true,
  reducedMotion = false,
}: {
  isActive?: boolean;
  reducedMotion?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [forcedIntent, setForcedIntent] = useState<BucketBrainIntent | null>(null);
  const [phase, setPhase] = useState<BucketBrainPhase>("idle");
  const [echo, setEcho] = useState("");
  const [status, setStatus] = useState(STATUS.idle);
  const [entities, setEntities] = useState<BucketBrainEntity[] | null>(null);
  const [error, setError] = useState("");
  const requestRef = useRef(0);

  useEffect(() => {
    if (!isActive) setPhase((current) => (current === "listening" ? "idle" : current));
  }, [isActive]);

  const emptyCopy = useMemo(() => {
    if (forcedIntent === "personal_search") {
      return personalSearchNotice();
    }
    return {
      title: "No Work Boards found yet.",
      body: "Try searching by role, skill, creator, or project.",
    };
  }, [forcedIntent]);

  async function runQuery(raw: string, intentOverride?: BucketBrainIntent | null) {
    const query = raw.trim();
    if (!query) return;
    const routed = routeBucketBrainQuery(query, intentOverride);
    const ticket = ++requestRef.current;
    setEcho(query);
    setError("");
    setEntities(null);

    if (routed.intent === "personal_search") {
      const notice = personalSearchNotice();
      setPhase("results");
      setStatus("");
      setEntities([
        {
          kind: "notice",
          id: "personal-soon",
          title: notice.title,
          body: notice.body,
        },
      ]);
      return;
    }

    const next: BucketBrainEntity[] = [];
    try {
      if (routed.intent === "board_content_search") {
        next.push({
          kind: "notice",
          id: "content-soon",
          title: "Board content search is still opening",
          body: "Dropbooks and individual Drops are not indexed yet. Related Work Boards and Visionary notes appear below when available.",
        });
      }
      if (routed.wantsSearch) {
        setPhase("searching");
        setStatus(
          routed.intent === "creator_search" ? "Searching Board…" : "Looking through Work Boards…"
        );
        const found = await searchBucketBrain(routed.searchQuery, routed.intent);
        if (ticket !== requestRef.current) return;
        next.push(...(found.items ?? []));
        if (found.status) setStatus(found.status);
      }

      if (routed.wantsVisionary) {
        setPhase("thinking");
        setStatus("Thinking…");
        const visionary = await askVisionary(routed.searchQuery);
        if (ticket !== requestRef.current) return;
        next.unshift(visionary);
      }

      if (ticket !== requestRef.current) return;
      const boards = next.filter((entity) => entity.kind === "work_board" || entity.kind === "creator");
      setEntities(next);
      setPhase("results");
      setStatus(boards.length ? `Found ${boards.length} Work Board${boards.length === 1 ? "" : "s"}.` : "");
    } catch (err) {
      if (ticket !== requestRef.current) return;
      setPhase("results");
      setError(err instanceof Error ? err.message : "Bucket Brain could not complete that.");
      setEntities(next.length ? next : null);
    }
  }

  function handleQuick(intent: BucketBrainIntent, prompt: string) {
    setForcedIntent(intent);
    if (intent === "visionary_question" && !prompt) {
      setDraft("");
      setPhase("listening");
      setStatus("Ask Visionary…");
      return;
    }
    setDraft(prompt);
    void runQuery(prompt, intent);
  }

  return (
    <div className={styles.space}>
      <div className={styles.eyebrow}>BELOW HOME</div>
      <h3 className={styles.title}>Bucket Brain</h3>
      <p className={styles.lede}>
        Search Work Boards, find creators, and think with Visionary — inside Drop Pad OS.
      </p>

      <BucketBrainOrb phase={phase} reducedMotion={reducedMotion} />
      <div className={styles.status} aria-live="polite">
        {error || status || STATUS[phase]}
      </div>

      <BucketBrainInput
        value={draft}
        disabled={phase === "searching" || phase === "thinking"}
        onChange={(value) => {
          setDraft(value);
          setForcedIntent(null);
          if (phase === "idle" || phase === "results") setPhase("listening");
        }}
        onFocus={() => setPhase((current) => (current === "idle" ? "listening" : current))}
        onSubmit={() => void runQuery(draft)}
      />
      <BucketBrainQuickActions active={forcedIntent} onSelect={handleQuick} />

      {echo ? <p className={styles.echo}>{echo}</p> : null}

      {entities ? (
        <BucketBrainResults
          entities={entities}
          emptyTitle={emptyCopy.title}
          emptyBody={emptyCopy.body}
        />
      ) : null}

      <button className={styles.memory} type="button" onClick={() => openBucket("pin")}>
        Open memory bucket
      </button>
    </div>
  );
}
