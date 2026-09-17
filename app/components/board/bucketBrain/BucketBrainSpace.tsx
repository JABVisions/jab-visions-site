"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { openBucket } from "@/lib/board/bucketBrain";
import type {
  BucketBrainEntity,
  BucketBrainIntent,
  BucketBrainPhase,
} from "@/lib/board/brain/response";
import { personalSearchNotice } from "@/lib/board/brain/personal";
import { executeBucketBrainQuery } from "@/lib/board/brain/query";
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
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isActive) setPhase((current) => (current === "listening" ? "idle" : current));
  }, [isActive]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

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
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const ticket = ++requestRef.current;
    setEcho(query);
    setError("");
    setEntities(null);
    setPhase("listening");
    setStatus("Listening…");

    try {
      const result = await executeBucketBrainQuery(query, intentOverride, {
        signal: controller.signal,
        onProgress: ({ phase: nextPhase, status: nextStatus }) => {
          if (ticket !== requestRef.current) return;
          setPhase(nextPhase);
          setStatus(nextStatus);
        },
      });
      if (ticket !== requestRef.current) return;
      setEntities(result.entities);
      setPhase("results");
      setStatus(result.status);
    } catch (err) {
      if (ticket !== requestRef.current) return;
      if (err instanceof DOMException && err.name === "AbortError") return;
      setPhase("results");
      setError(err instanceof Error ? err.message : "Bucket Brain could not complete that.");
      setEntities([]);
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
        onSubmit={() => void runQuery(draft, forcedIntent)}
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
