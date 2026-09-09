"use client";

import { useEffect } from "react";
import { migrateHeicAnnouncementMedia } from "@/lib/board/announcementMediaRepair";
import { deferClientWork } from "@/lib/board/deferClientWork";

/** Repairs legacy HEIC announcement attachments once per browser session. */
export default function AnnouncementMediaRepair() {
  useEffect(() => deferClientWork(() => migrateHeicAnnouncementMedia()), []);

  return null;
}
