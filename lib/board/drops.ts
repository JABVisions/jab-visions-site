import { supabaseBrowser } from "@/lib/supabase/browser";

export async function createBoardDrop(text: string) {
  const supabase = supabaseBrowser();

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;
  if (!auth?.user) throw new Error("Not logged in.");

  // read current style
  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("board_style")
    .eq("id", auth.user.id)
    .single();

  if (pErr) throw pErr;

  // insert drop with snapshot
  const { error: dErr } = await supabase.from("board_drops").insert({
    user_id: auth.user.id,
    text,
    style_snapshot: profile?.board_style ?? null,
    created_at: new Date().toISOString(),
  });

  if (dErr) throw dErr;
}
