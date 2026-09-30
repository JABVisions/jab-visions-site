// File: app/board/admin/lore/ingest/page.tsx
// Admin gate for the Lore Ingestion Studio, mirroring
// app/board/admin/lore/page.tsx exactly.

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import LoreIngestionStudio from "./LoreIngestionStudio";

export const dynamic = "force-dynamic";

export default async function LoreIngestionStudioPage() {
  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/board/login?next=/board/admin/lore/ingest");

  const { data: isAdmin } = await supabase.rpc("is_jab_admin");
  if (!isAdmin) redirect("/board/feed");

  return <LoreIngestionStudio />;
}
