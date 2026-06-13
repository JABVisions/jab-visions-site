"use client";

import { useEffect } from "react";
import { migrateLegacyDropTaxonomy } from "@/lib/board/dropTaxonomyMigration";
import { deferClientWork } from "@/lib/board/deferClientWork";

/** Repairs miscategorized drop types and stale mediaKind values once per browser. */
export default function DropTaxonomyMigration() {
  useEffect(() => deferClientWork(() => migrateLegacyDropTaxonomy()), []);

  return null;
}
