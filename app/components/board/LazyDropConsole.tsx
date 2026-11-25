"use client";

import { useEffect, useState, type ComponentType } from "react";
import DropConsoleSleepDock from "@/app/components/board/DropConsoleSleepDock";
import { shouldResumePayDrop } from "@/lib/board/banking/resume";

type DropConsoleProps = {
  variant?: "tile" | "bare";
  forceAwake?: boolean;
};

/**
 * The feed console starts asleep. Keep that dock on the first paint and load
 * the editor (uploads, banking, studio) after idle, or immediately on wake.
 */
export default function LazyDropConsole({
  variant = "tile",
}: {
  variant?: "tile" | "bare";
}) {
  const [Console, setConsole] = useState<ComponentType<DropConsoleProps> | null>(null);
  const [awake, setAwake] = useState(false);

  useEffect(() => {
    let alive = true;

    const load = () => {
      void import("@/app/components/board/DropConsole").then((mod) => {
        if (alive) setConsole(() => mod.default);
      });
    };

    const wake = () => {
      setAwake(true);
      load();
    };

    window.addEventListener("board:dropconsole:open", wake);
    if (shouldResumePayDrop()) wake();

    const idleWindow = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    let idleId = 0;
    let timer = 0;
    if (!shouldResumePayDrop()) {
      if (typeof idleWindow.requestIdleCallback === "function") {
        idleId = idleWindow.requestIdleCallback(load, { timeout: 1500 });
      } else {
        timer = window.setTimeout(load, 700);
      }
    }

    return () => {
      alive = false;
      window.removeEventListener("board:dropconsole:open", wake);
      if (idleId && idleWindow.cancelIdleCallback) idleWindow.cancelIdleCallback(idleId);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  if (!Console) {
    const dock = (
      <DropConsoleSleepDock
        onWake={() => {
          setAwake(true);
          void import("@/app/components/board/DropConsole").then((mod) => {
            setConsole(() => mod.default);
          });
        }}
      />
    );
    return variant === "bare" ? dock : <div style={{ width: "100%" }}>{dock}</div>;
  }

  return <Console variant={variant} forceAwake={awake} />;
}
