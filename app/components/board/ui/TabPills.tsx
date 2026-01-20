"use client";

import React from "react";

export type TabKey = "assets" | "calls" | "projects";

export function TabPills({
  value,
  onChange,
}: {
  value: TabKey;
  onChange: (v: TabKey) => void;
}) {
  const tabs: { key: TabKey; label: string }[] = [
    { key: "assets", label: "Assets" },
    { key: "calls", label: "Work Calls" },
    { key: "projects", label: "Project Panel" },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((t) => {
        const active = value === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={[
              "rounded-full px-4 py-2 text-xs font-semibold transition ring-1",
              active
                ? "bg-pink-100 text-pink-700 ring-pink-200"
                : "bg-white/70 text-emerald-700 ring-emerald-200 hover:bg-white",
            ].join(" ")}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
