// File: app/board/admin/lore/page.tsx
// Minimal admin gate for the Lore Library. Server component: verifies the
// signed-in user is a JAB admin (public.is_jab_admin via RPC) before ever
// rendering the client UI. middleware.ts already requires login for
// /board/*; this is the second, authoritative check.

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import LoreLibraryAdmin from "./LoreLibraryAdmin";

export const dynamic = "force-dynamic";

export default async function LoreLibraryAdminPage() {
  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/board/login?next=/board/admin/lore");

  const { data: isAdmin } = await supabase.rpc("is_jab_admin");
  if (!isAdmin) redirect("/board/feed");

  return <LoreLibraryAdmin />;
}
