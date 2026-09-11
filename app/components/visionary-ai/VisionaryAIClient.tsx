"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import type {
  VisionaryChatError,
  VisionaryChatResponse,
  VisionaryConfidence,
  VisionaryMessage,
  VisionarySource,
} from "@/lib/visionary-ai/types";
import styles from "./visionaryAI.module.css";

type DisplayMessage = VisionaryMessage & {
  id: string;
  sources?: VisionarySource[];
  confidence?: VisionaryConfidence;
};

const STARTERS = [
  "What is JAB Visions?",
  "Explain THOSE RYDERZ.",
  "What can creators do on Board?",
  "How does the JAB ecosystem connect?",
];

const INITIAL_MESSAGE: DisplayMessage = {
  id: "visionary-welcome",
  role: "assistant",
  content:
    "I'm Visionary AI—the conversational guide to JAB Visions. Ask naturally about the company, THOSE RYDERZ, Board, the Store, JAB Lit, or a creative question.",
};

function messageId(role: VisionaryMessage["role"]) {
  return `${role}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export default function VisionaryAIClient() {
  const [messages, setMessages] = useState<DisplayMessage[]>([INITIAL_MESSAGE]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"ready" | "openai" | "knowledge" | "safety">("ready");
  const [error, setError] = useState("");
  const conversationEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function sendMessage(value: string) {
    const content = value.trim();
    if (!content || busy || content.length > 1_500) return;

    const userMessage: DisplayMessage = {
      id: messageId("user"),
      role: "user",
      content,
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setDraft("");
    setError("");
    setBusy(true);

    try {
      const response = await fetch("/api/visionary-ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages
            .slice(-12)
            .map(({ role, content: messageContent }) => ({
              role,
              content: messageContent,
            })),
        }),
      });
      const payload = (await response.json()) as VisionaryChatResponse | VisionaryChatError;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? "The signal could not respond." : payload.error);
      }

      setMode(payload.mode);
      setMessages((current) => [
        ...current,
        {
          id: messageId("assistant"),
          role: "assistant",
          content: payload.answer,
          sources: payload.sources,
          confidence: payload.confidence,
        },
      ]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The signal went quiet. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(draft);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(draft);
    }
  }

  const statusLabel =
    mode === "openai"
      ? "Model online"
      : mode === "knowledge"
        ? "Approved knowledge"
      : mode === "safety"
        ? "Guardrails active"
        : "Knowledge online";

  return (
    <div className={styles.interface}>
      <section className={styles.intro} aria-labelledby="visionary-title">
        <div className={styles.signalMark} aria-hidden>
          <span />
          <span />
          <span />
          <i>V</i>
        </div>
        <p className={styles.eyebrow}>JAB VISIONS / INTELLIGENCE LAYER 001</p>
        <h1 id="visionary-title">Visionary AI</h1>
        <p className={styles.lede}>
          A grounded intelligence for navigating the stories, systems, and creative
          worlds being built by JAB Visions.
        </p>

        <div className={styles.statusPanel}>
          <div>
            <span className={styles.liveDot} />
            <strong>{statusLabel}</strong>
          </div>
          <p>
            Responses are anchored to a curated JAB Visions knowledge base. Private
            Board data is not connected.
          </p>
        </div>

        <div className={styles.starters} aria-label="Suggested questions">
          {STARTERS.map((starter) => (
            <button
              key={starter}
              type="button"
              onClick={() => void sendMessage(starter)}
              disabled={busy}
            >
              {starter}
              <span aria-hidden>↗</span>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.console} aria-label="Visionary AI conversation">
        <header className={styles.consoleHeader}>
          <div>
            <span className={styles.consoleKicker}>VISIONARY SIGNAL</span>
            <strong>Ask the ecosystem</strong>
          </div>
          <div className={styles.telemetry} aria-label={statusLabel}>
            <span />
            {busy ? "Receiving" : "Ready"}
          </div>
        </header>

        <div className={styles.conversation} aria-live="polite">
          {messages.map((message) => (
            <article
              key={message.id}
              className={`${styles.message} ${styles[message.role]}`}
            >
              <div className={styles.messageLabel}>
                {message.role === "assistant"
                  ? `VISIONARY${message.confidence ? ` / ${message.confidence.toUpperCase()}` : ""}`
                  : "YOU"}
              </div>
              <div className={styles.messageBody}>{message.content}</div>
              {message.sources?.length ? (
                <div className={styles.sources} aria-label="Knowledge sources">
                  {message.sources.map((source) => (
                    <a key={source.id} href={source.path}>
                      {source.title}
                    </a>
                  ))}
                </div>
              ) : null}
            </article>
          ))}

          {busy ? (
            <div className={styles.thinking} role="status">
              <span />
              <span />
              <span />
              Reading the signal
            </div>
          ) : null}
          <div ref={conversationEndRef} />
        </div>

        <form className={styles.composer} onSubmit={submit}>
          <label htmlFor="visionary-message">Send a question to Visionary AI</label>
          <div className={styles.composerShell}>
            <textarea
              id="visionary-message"
              value={draft}
              onChange={(event) => setDraft(event.target.value.slice(0, 1_500))}
              onKeyDown={handleComposerKeyDown}
              placeholder="Ask Visionary AI anything about the JAB ecosystem…"
              rows={2}
              disabled={busy}
            />
            <button type="submit" disabled={busy || !draft.trim()}>
              {busy ? "Listening" : "Transmit"}
            </button>
          </div>
          <div className={styles.composerMeta}>
            <span>{error || "Enter to send · Shift + Enter for a new line"}</span>
            <span>{draft.length}/1500</span>
          </div>
        </form>
      </section>
    </div>
  );
}
