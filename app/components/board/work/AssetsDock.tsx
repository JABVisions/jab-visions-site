"use client";

import { useMemo, useState } from "react";

type DockItem = {
  key: string;
  label: string;
  icon?: React.ReactNode;
};

export default function AssetsDock({
  items,
  defaultActiveKey,
  onSelect,
}: {
  items?: DockItem[];
  defaultActiveKey?: string;
  onSelect?: (key: string) => void;
}) {
  /**
   * SAFETY NET:
   * If items is undefined (which is what caused your crash),
   * we fall back to a sensible default set.
   */
  const safeItems = useMemo<DockItem[]>(
    () =>
      items ?? [
        { key: "assets", label: "Assets" },
        { key: "portfolio", label: "Portfolio" },
        { key: "projects", label: "Projects" },
        { key: "calls", label: "Work Calls" },
      ],
    [items]
  );

  const [activeKey, setActiveKey] = useState<string>(
    defaultActiveKey ?? safeItems[0]?.key ?? "assets"
  );

  function handleSelect(key: string) {
    setActiveKey(key);
    onSelect?.(key);
  }

  return (
    <div className="rounded-[20px] border border-black/10 bg-white/75 p-3 shadow-[0_8px_20px_rgba(0,0,0,0.15)]">
      <div className="flex flex-wrap gap-2">
        {safeItems.map((it) => {
          const active = it.key === activeKey;

          return (
            <button
              key={it.key}
              onClick={() => handleSelect(it.key)}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                active
                  ? "bg-black text-white shadow-sm"
                  : "bg-white/80 text-black/70 hover:bg-white hover:text-black"
              }`}
            >
              <span className="flex items-center gap-2">
                {it.icon}
                {it.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
