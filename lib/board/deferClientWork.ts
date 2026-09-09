"use client";

/** Run non-critical client work after first paint to reduce mobile jank/crashes. */
export function deferClientWork(
  task: () => void | Promise<unknown>,
  timeoutMs = 3500
) {
  if (typeof window === "undefined") return () => {};

  const run = () => {
    void Promise.resolve(task()).catch(() => {});
  };

  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(run, { timeout: timeoutMs });
    return () => window.cancelIdleCallback(id);
  }

  const timer = window.setTimeout(run, 1200);
  return () => window.clearTimeout(timer);
}
