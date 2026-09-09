"use client";

// Board Signals + Whispers — the notification layer for Drop Pad OS. Signals are
// concrete moments ("You dropped a Vision", "Maya commented on your drop"),
// derived from local activity, drop comments, and bucket waves. Whispers are
// soft, ambient system observations. Both are structured so a real Supabase
// feed can replace the local derivation later without changing the UI.

import { getLocalActivity } from "./activity";
import { readAllDropComments } from "./dropComments";
import { readBrain } from "./bucketBrain";
import type { BoardWhisper } from "./whispers";

export type BoardSignalKind = "self" | "interaction";

export type BoardSignal = {
  id: string;
  kind: BoardSignalKind;
  icon: string;
  text: string;
  createdAt: string;
};

function truncate(value: string, max = 48) {
  const v = String(value || "").trim();
  return v.length > max ? `${v.slice(0, max - 1)}…` : v;
}

function dropTypeOf(meta: Record<string, any> | null | undefined) {
  const m = meta ?? {};
  return String(m.dropType ?? m.drop_flavor ?? m.kind ?? "drop")
    .replace(/_/g, " ")
    .trim();
}

function selfIcon(type: string) {
  const t = type.toLowerCase();
  if (t.includes("vision") || t.includes("media") || t.includes("image")) return "👁️";
  if (t.includes("video")) return "🎬";
  if (t.includes("voice") || t.includes("audio")) return "🎙️";
  if (t.includes("thought")) return "💭";
  if (t.includes("project")) return "🧩";
  if (t.includes("pay")) return "💸";
  if (t.includes("art")) return "🎨";
  return "🫧";
}

function selfVerb(type: string) {
  const t = type.toLowerCase();
  if (t.includes("thought")) return "caught a thought";
  if (t.includes("project")) return "opened a project";
  if (t.includes("pay")) return "set up a Pay Drop";
  return `dropped a ${type}`;
}

/** Build the signal stream: what you've been doing + how others interacted. */
export function deriveBoardSignals(userId?: string | null, limit = 14): BoardSignal[] {
  const out: BoardSignal[] = [];

  // What you've been doing — from your drops/activity.
  try {
    const acts = getLocalActivity()
      .filter((a) => !userId || !a.user_id || a.user_id === userId)
      .slice(0, 24);
    for (const a of acts) {
      const type = dropTypeOf(a.meta);
      out.push({
        id: `self_${a.id}`,
        kind: "self",
        icon: selfIcon(type),
        text: `You ${selfVerb(type)}${a.title ? ` · ${truncate(a.title, 34)}` : ""}`,
        createdAt: a.created_at,
      });
    }
  } catch {
    /* noop */
  }

  // How others interacted — comments on drops.
  try {
    const comments = readAllDropComments().slice(-16);
    for (const c of comments) {
      const who = c.displayName || (c.username ? `@${c.username}` : "Someone");
      out.push({
        id: `cmt_${c.id}`,
        kind: "interaction",
        icon: "💬",
        text: `${who} commented: “${truncate(c.body, 44)}”`,
        createdAt: c.createdAt,
      });
    }
  } catch {
    /* noop */
  }

  // How others interacted — waves moving through your Bucket.
  try {
    const waves = readBrain().waves ?? [];
    for (const w of waves.slice(-8)) {
      out.push({
        id: `wave_${w.id}`,
        kind: "interaction",
        icon: "🌊",
        text: `A wave moved through your Board signal`,
        createdAt: new Date(w.createdAt).toISOString(),
      });
    }
  } catch {
    /* noop */
  }

  out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  // De-dupe by id, keep most recent.
  const seen = new Set<string>();
  return out.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true))).slice(0, limit);
}

const EVERGREEN_WHISPERS: BoardWhisper[] = [
  { id: "w-warm", type: "whisper", tone: "quiet", text: "Board is keeping your signal warm." },
  { id: "w-move", type: "whisper", tone: "profile", text: "A fresh drop would carry your momentum forward." },
  { id: "w-listen", type: "whisper", tone: "signal", text: "Your last signal is still echoing softly." },
];

/** Soft, ambient observations — contextual to your recent activity. */
export function deriveBoardWhispers(userId?: string | null): BoardWhisper[] {
  const whispers: BoardWhisper[] = [];

  let dropCount = 0;
  let ideaCount = 0;
  try {
    dropCount = getLocalActivity().filter(
      (a) => !userId || !a.user_id || a.user_id === userId
    ).length;
  } catch {
    /* noop */
  }
  try {
    ideaCount = readBrain().pin?.length ?? 0;
  } catch {
    /* noop */
  }

  if (dropCount > 0) {
    whispers.push({
      id: "w-drops",
      type: "whisper",
      tone: "signal",
      text: `You've sent ${dropCount} drop${dropCount > 1 ? "s" : ""} into Board lately.`,
    });
  }
  if (ideaCount > 0) {
    whispers.push({
      id: "w-bucket",
      type: "whisper",
      tone: "memory",
      text: `Your Bucket is holding ${ideaCount} idea${ideaCount > 1 ? "s" : ""} for later.`,
    });
  }

  return [...whispers, ...EVERGREEN_WHISPERS];
}
