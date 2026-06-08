"use client";

import type { BoardWhisperEventType, BoardWhisperTone } from "@/lib/board/whispers";

export type BoardVisitWhisper = {
  id: string;
  owner: string;
  visitor: string;
  visitorLabel: string;
  createdAt: string;
  dedupeKey?: string;
  eventType?: BoardWhisperEventType;
  text?: string;
  tone?: BoardWhisperTone;
};

export const BOARD_VISIT_WHISPERS_EVENT = "board:visit-whispers:updated";

const VISIT_WHISPERS_KEY = "jab_board_visit_whispers_v1";

function cleanUser(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
}

function titleUser(value: string) {
  const clean = value.replace(/^@+/, "").trim();
  if (!clean) return "Someone";
  return `@${clean}`;
}

function readAllVisitWhispers(): BoardVisitWhisper[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(VISIT_WHISPERS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item: any): BoardVisitWhisper | null => {
        const owner = cleanUser(item?.owner);
        const visitor = cleanUser(item?.visitor);
        if (!owner || !visitor) return null;
        return {
          id: String(item?.id || `${owner}:${visitor}:${Date.now()}`),
          owner,
          visitor,
          visitorLabel: String(item?.visitorLabel || titleUser(visitor)),
          dedupeKey:
            typeof item?.dedupeKey === "string" ? item.dedupeKey : undefined,
          eventType:
            typeof item?.eventType === "string"
              ? (item.eventType as BoardWhisperEventType)
              : undefined,
          text: typeof item?.text === "string" ? item.text : undefined,
          tone:
            typeof item?.tone === "string"
              ? (item.tone as BoardWhisperTone)
              : undefined,
          createdAt:
            typeof item?.createdAt === "string"
              ? item.createdAt
              : new Date().toISOString(),
        };
      })
      .filter((item): item is BoardVisitWhisper => Boolean(item))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  } catch {
    return [];
  }
}

function writeAllVisitWhispers(items: BoardVisitWhisper[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(VISIT_WHISPERS_KEY, JSON.stringify(items.slice(0, 80)));
  window.dispatchEvent(new CustomEvent(BOARD_VISIT_WHISPERS_EVENT));
}

export function recordBoardVisitWhisper(params: {
  owner: string;
  visitor?: string | null;
  visitorLabel?: string | null;
}) {
  const owner = cleanUser(params.owner);
  const visitor = cleanUser(params.visitor) || "someone";
  if (!owner || owner === visitor) return;

  const now = Date.now();
  const current = readAllVisitWhispers();
  const recentDuplicate = current.find((item) => {
    if (item.owner !== owner || item.visitor !== visitor) return false;
    return now - new Date(item.createdAt).getTime() < 1000 * 60 * 10;
  });

  if (recentDuplicate) return;

  writeAllVisitWhispers([
    {
      id: `visit_${owner}_${visitor}_${now}`,
      owner,
      visitor,
      visitorLabel: params.visitorLabel?.trim() || titleUser(visitor),
      createdAt: new Date(now).toISOString(),
    },
    ...current,
  ]);
}

export function recordBoardActivityWhisper(params: {
  owner: string;
  visitor?: string | null;
  visitorLabel?: string | null;
  text: string;
  tone?: BoardWhisperTone;
  eventType?: BoardWhisperEventType;
  dedupeKey?: string | null;
}) {
  const owner = cleanUser(params.owner);
  const visitor = cleanUser(params.visitor) || "board";
  const text = params.text.trim();
  if (!owner || !text) return;

  const now = Date.now();
  const current = readAllVisitWhispers();
  const dedupeKey = params.dedupeKey?.trim();
  const recentDuplicate = current.find((item) => {
    if (item.owner !== owner) return false;
    if (dedupeKey && item.dedupeKey === dedupeKey) return true;
    if (item.visitor !== visitor || item.text !== text) return false;
    return now - new Date(item.createdAt).getTime() < 1000 * 60 * 10;
  });

  if (recentDuplicate) return;

  writeAllVisitWhispers([
    {
      id: `activity_${owner}_${visitor}_${now}`,
      owner,
      visitor,
      visitorLabel: params.visitorLabel?.trim() || titleUser(visitor),
      dedupeKey,
      eventType: params.eventType,
      text,
      tone: params.tone,
      createdAt: new Date(now).toISOString(),
    },
    ...current,
  ]);
}

export function readBoardVisitWhispers(owner: string) {
  const cleanOwner = cleanUser(owner);
  if (!cleanOwner) return [];
  return readAllVisitWhispers().filter((item) => item.owner === cleanOwner);
}
