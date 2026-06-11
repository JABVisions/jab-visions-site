"use client";

import { useEffect } from "react";
import { migrateLegacyDropTaxonomy } from "@/lib/board/dropTaxonomyMigration";

/** Repairs miscategorized drop types and stale mediaKind values once per browser. */
export default function DropTaxonomyMigration() {
  useEffect(() => {
    void migrateLegacyDropTaxonomy();
  }, []);

  return null;
}
