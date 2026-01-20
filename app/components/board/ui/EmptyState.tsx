"use client";

import React from "react";

export function EmptyState({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl bg-black/20 ring-1 ring-white/10 p-6 text-center">
      <div className="text-sm font-semibold">{title}</div>
      {hint && (
        <div className="mt-1 text-xs text-white/60">{hint}</div>
      )}
    </div>
  );
}
