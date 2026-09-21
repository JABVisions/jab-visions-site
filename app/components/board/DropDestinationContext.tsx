"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { StudioCaptureMode } from "@/lib/board/dropItem";
import type { DropDestination } from "@/lib/board/dropDestination";
import { suggestedStudioModeForRoom } from "@/lib/board/dropDestination";

type OpenStudioOpts = {
  destination?: DropDestination;
  initialMode?: StudioCaptureMode;
};

type DropDestinationContextValue = {
  destination: DropDestination;
  initialMode: StudioCaptureMode;
  studioOpen: boolean;
  openStudio: (opts?: OpenStudioOpts) => void;
  closeStudio: () => void;
};

const DropDestinationContext = createContext<DropDestinationContextValue | null>(null);

export function DropDestinationProvider({
  children,
  defaultDestination,
}: {
  children: React.ReactNode;
  defaultDestination: DropDestination;
}) {
  const [studioOpen, setStudioOpen] = useState(false);
  const [destination, setDestination] = useState<DropDestination>(defaultDestination);
  const [initialMode, setInitialMode] = useState<StudioCaptureMode>(() =>
    defaultDestination.type === "room" || defaultDestination.type === "room_conversation"
      ? suggestedStudioModeForRoom(defaultDestination.roomId)
      : "photo"
  );

  const openStudio = useCallback(
    (opts?: OpenStudioOpts) => {
      const next = opts?.destination || defaultDestination;
      setDestination(next);
      const roomId = next.type === "room" || next.type === "room_conversation" ? next.roomId : "";
      setInitialMode(opts?.initialMode || (roomId ? suggestedStudioModeForRoom(roomId) : "photo"));
      setStudioOpen(true);
    },
    [defaultDestination]
  );

  const closeStudio = useCallback(() => setStudioOpen(false), []);

  const value = useMemo(
    () => ({ destination, initialMode, studioOpen, openStudio, closeStudio }),
    [destination, initialMode, studioOpen, openStudio, closeStudio]
  );

  return <DropDestinationContext.Provider value={value}>{children}</DropDestinationContext.Provider>;
}

export function useDropDestination() {
  const ctx = useContext(DropDestinationContext);
  if (!ctx) {
    throw new Error("useDropDestination must be used inside DropDestinationProvider");
  }
  return ctx;
}

export function useDropDestinationOptional() {
  return useContext(DropDestinationContext);
}
