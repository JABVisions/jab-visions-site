"use client";

import { useEffect } from "react";

import { migrateHeicAnnouncementMedia } from "@/lib/board/announcementMediaRepair";

/** Repairs legacy HEIC announcement attachments once per browser session. */
export default function AnnouncementMediaRepair() {
  useEffect(() => {
    void migrateHeicAnnouncementMedia();
  }, []);

  return null;
}
