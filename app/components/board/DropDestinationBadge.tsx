"use client";

import React from "react";
import type { DropDestination } from "@/lib/board/dropDestination";
import { dropDestinationBadge } from "@/lib/board/dropDestination";

export default function DropDestinationBadge({
  destination,
}: {
  destination?: DropDestination | null;
}) {
  const badge = dropDestinationBadge(destination);
  if (!badge) return null;

  return (
    <span className="studioDestinationBadge" title={`${badge.prefix} ${badge.label}`}>
      <span className="studioDestinationPrefix">{badge.prefix}</span>
      <span className="studioDestinationLabel">{badge.label}</span>
    </span>
  );
}
