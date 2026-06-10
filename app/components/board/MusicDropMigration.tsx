"use client";

import { useEffect } from "react";
import { migrateLegacyMusicDrops } from "@/lib/board/musicMigration";

/** Runs once per browser to patch existing Music Drops for full-song playback. */
export default function MusicDropMigration() {
  useEffect(() => {
    void migrateLegacyMusicDrops();
  }, []);

  return null;
}
