"use client";

import React, { useMemo } from "react";
import DropPadOSBase, {
  type DropPadApp,
  type DropBubble,
} from "@/app/components/board/DropPadOS";
import type { StoreDrop } from "@/app/components/board/StoreDropTile";

type DropRoute =
  | "board"
  | "assets"
  | "projects"
  | "portfolio"
  | "workcalls"
  | "profiledrops"
  | "storedrops";

function swapApp(app: DropPadApp): DropPadApp {
  // ✅ Swap meaning: assets <-> portfolio
  if (app === "assets") return "portfolio";
  if (app === "portfolio") return "assets";
  return app;
}

function swapRoute(route: DropRoute): DropRoute {
  if (route === "assets") return "portfolio";
  if (route === "portfolio") return "assets";
  return route;
}

export default function DropPadOSv3(props: {
  className?: string;
  drops?: DropBubble[];
  onSelect?: (route: DropRoute) => void;

  osOn: boolean;
  osApp: DropPadApp;

  onPower?: () => void;
  onNavigate?: (app: DropPadApp) => void;
  onHome?: () => void;
  onOff?: () => void;

  title?: string;
  subtitle?: string;
  maxScreenPx?: number;
  storeDrops?: StoreDrop[];
}) {
  const drops = useMemo<DropBubble[]>(
    () =>
      props.drops?.length
        ? // If caller provides drops, swap their routes so UI labels can stay correct
          props.drops.map((d) => ({ ...d, route: swapRoute(d.route as DropRoute) as any }))
        : // ✅ Default bubbles (Portfolio goes to Base Assets screen)
          ([
            { id: "d1", label: "Board Drops", route: "board", emoji: "🫧" },
            { id: "d2", label: "Portfolio", route: "assets", emoji: "🎞️" }, // base assets = portfolio content
            { id: "d3", label: "Projects", route: "projects", emoji: "🧩" },
            { id: "d4", label: "Assets", route: "portfolio", emoji: "🗂️" }, // base portfolio placeholder = pinned assets later
            { id: "d5", label: "Work Calls", route: "workcalls", emoji: "📣" },
            { id: "d6", label: "Profile Drops", route: "profiledrops", emoji: "🪞" },
            { id: "d7", label: "Store Drops", route: "storedrops", emoji: "🛍️" },
          ] as any),
    [props.drops]
  );

  return (
    <DropPadOSBase
      className={props.className}
      drops={drops}
      onSelect={(route: any) => props.onSelect?.(swapRoute(route as DropRoute))}
      osOn={props.osOn}
      osApp={swapApp(props.osApp)} // ✅ parent portfolio -> base assets
      onPower={props.onPower}
      onHome={() => props.onHome?.()}
      onOff={() => props.onOff?.()}
      onNavigate={(app) => props.onNavigate?.(swapApp(app))} // ✅ base assets -> parent portfolio
      title={props.title}
      subtitle={props.subtitle}
      maxScreenPx={props.maxScreenPx}
      storeDrops={props.storeDrops}
    />
  );
}
