"use client";

import React from "react";

export function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-lg md:text-xl font-semibold">{title}</h2>
        {subtitle ? (
          <p className="mt-1 text-sm text-white/60 max-w-3xl">{subtitle}</p>
        ) : null}
      </div>
    </div>
  );
}
