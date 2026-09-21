"use client";

import React, { useState } from "react";
import LazyDropStudioStage from "@/app/components/board/LazyDropStudioStage";
import type { DropCustomization } from "@/lib/board/dropCustomizations";
import { descriptDocToFile } from "@/lib/board/descriptDocs";
import type { DropDestination } from "@/lib/board/dropDestination";
import { ALL_FORUM_STUDIO_MODES } from "@/lib/board/dropDestination";
import type { StudioCaptureMode } from "@/lib/board/dropItem";
import type { DropItem } from "@/lib/board/dropItem";
import { publishStudioFileDrop, publishStudioLinkDrop } from "@/lib/board/publishStudioDrop";

export default function DropStudioLauncher({
  open,
  destination,
  initialMode = "photo",
  onClose,
  onPublished,
}: {
  open: boolean;
  destination: DropDestination;
  initialMode?: StudioCaptureMode;
  onClose: () => void;
  onPublished: (drop: DropItem) => void | Promise<void>;
}) {
  const [customizations, setCustomizations] = useState<DropCustomization>({});

  return (
    <LazyDropStudioStage
      key={open ? `${destination.type}-${initialMode}` : "closed"}
      open={open}
      initialFile={null}
      initialMode={initialMode}
      allowedModes={ALL_FORUM_STUDIO_MODES}
      descriptDestination="doc"
      destination={destination}
      value={customizations}
      onChange={setCustomizations}
      onComplete={async (file, source, onProgress) => {
        const drop = await publishStudioFileDrop({
          file,
          source,
          customizations,
          destination,
          onProgress,
        });
        await onPublished(drop);
        setCustomizations({});
      }}
      onDescriptComplete={async (doc) => {
        const drop = await publishStudioFileDrop({
          file: descriptDocToFile(doc),
          source: "capture",
          destination,
          title: doc.title,
        });
        await onPublished(drop);
        setCustomizations({});
      }}
      onLinkComplete={async (link) => {
        const drop = await publishStudioLinkDrop({ link, destination });
        await onPublished(drop);
        setCustomizations({});
      }}
      onClose={() => {
        setCustomizations({});
        onClose();
      }}
    />
  );
}
