"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import BoardClientErrorBoundary from "@/app/components/board/BoardClientErrorBoundary";

const EDIT_EVENTS = ["board:drop:edit", "board:drop:studio"];
const NOTEBOOK_EVENTS = ["board:project-notebook"];
const ACTIVITY_EVENTS = ["board:activity:navigate", "board:open-drop-comments"];
const DEFERRED_EVENTS = [...EDIT_EVENTS, ...NOTEBOOK_EVENTS, ...ACTIVITY_EVENTS];

type QueuedEvent = { type: string; detail: unknown };

function replayQueued(queue: QueuedEvent[], types: string[]) {
  const pending: QueuedEvent[] = [];
  const rest: QueuedEvent[] = [];
  for (const event of queue) {
    if (types.includes(event.type)) pending.push(event);
    else rest.push(event);
  }
  queue.length = 0;
  queue.push(...rest);
  for (const event of pending) {
    window.dispatchEvent(new CustomEvent(event.type, { detail: event.detail }));
  }
}

/**
 * Editors, the project notebook, comment navigation, and cloud sync are not
 * part of the first Board paint. Load them after idle, or as soon as an event
 * asks for one, and replay anything that fired while the chunk was in flight.
 */
export default function BoardDeferredChrome() {
  const [EditModal, setEditModal] = useState<ComponentType | null>(null);
  const [Notebook, setNotebook] = useState<ComponentType | null>(null);
  const [ActivityHost, setActivityHost] = useState<ComponentType | null>(null);
  const [CloudSync, setCloudSync] = useState<ComponentType | null>(null);
  const queueRef = useRef<QueuedEvent[]>([]);
  const editMountedRef = useRef(false);
  const notebookMountedRef = useRef(false);
  const activityMountedRef = useRef(false);

  editMountedRef.current = Boolean(EditModal);
  notebookMountedRef.current = Boolean(Notebook);
  activityMountedRef.current = Boolean(ActivityHost);

  useEffect(() => {
    let alive = true;

    const loadEdit = () =>
      import("@/app/components/board/BoardDropEditModal").then((mod) => {
        if (alive) setEditModal(() => mod.default);
      });
    const loadNotebook = () =>
      import("@/app/components/board/ProjectNotebookWindow").then((mod) => {
        if (alive) setNotebook(() => mod.default);
      });
    const loadActivity = () =>
      import("@/app/components/board/activity/ActivityNavigationHost").then((mod) => {
        if (alive) setActivityHost(() => mod.default);
      });
    const loadSync = () =>
      import("@/app/components/board/BoardCloudSync").then((mod) => {
        if (alive) setCloudSync(() => mod.default);
      });

    const onEvent = (event: Event) => {
      const type = event.type;
      const detail = (event as CustomEvent).detail;
      if (EDIT_EVENTS.includes(type)) {
        if (editMountedRef.current) return;
        queueRef.current.push({ type, detail });
        void loadEdit();
        return;
      }
      if (NOTEBOOK_EVENTS.includes(type)) {
        if (notebookMountedRef.current) return;
        queueRef.current.push({ type, detail });
        void loadNotebook();
        return;
      }
      if (ACTIVITY_EVENTS.includes(type)) {
        if (activityMountedRef.current) return;
        queueRef.current.push({ type, detail });
        void loadActivity();
      }
    };

    for (const type of DEFERRED_EVENTS) {
      window.addEventListener(type, onEvent);
    }

    const start = () => {
      void loadEdit();
      void loadNotebook();
      void loadActivity();
      void loadSync();
    };

    const idleWindow = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    let idleId = 0;
    let timer = 0;
    if (typeof idleWindow.requestIdleCallback === "function") {
      idleId = idleWindow.requestIdleCallback(start, { timeout: 1800 });
    } else {
      timer = window.setTimeout(start, 800);
    }

    return () => {
      alive = false;
      for (const type of DEFERRED_EVENTS) {
        window.removeEventListener(type, onEvent);
      }
      if (idleId && idleWindow.cancelIdleCallback) idleWindow.cancelIdleCallback(idleId);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!EditModal) return;
    replayQueued(queueRef.current, EDIT_EVENTS);
  }, [EditModal]);

  useEffect(() => {
    if (!Notebook) return;
    replayQueued(queueRef.current, NOTEBOOK_EVENTS);
  }, [Notebook]);

  useEffect(() => {
    if (!ActivityHost) return;
    replayQueued(queueRef.current, ACTIVITY_EVENTS);
  }, [ActivityHost]);

  return (
    <>
      {EditModal ? (
        <BoardClientErrorBoundary name="board-drop-edit" fallback={null}>
          <EditModal />
        </BoardClientErrorBoundary>
      ) : null}
      {CloudSync ? (
        <BoardClientErrorBoundary name="board-cloud-sync" fallback={null}>
          <CloudSync />
        </BoardClientErrorBoundary>
      ) : null}
      {ActivityHost ? (
        <BoardClientErrorBoundary name="board-activity-nav" fallback={null}>
          <ActivityHost />
        </BoardClientErrorBoundary>
      ) : null}
      {Notebook ? (
        <BoardClientErrorBoundary name="board-project-notebook" fallback={null}>
          <Notebook />
        </BoardClientErrorBoundary>
      ) : null}
    </>
  );
}
