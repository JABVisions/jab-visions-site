import { sanitizeAvatar } from "@/lib/anderzone/avatar";
import { createStarterPod, starterInventory, type FurnitureKind, type HomePod } from "@/lib/anderzone/homePod";
import { anderzoneSupabase } from "./supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function offline() {
  return Response.json(
    { ok: false, persistence: "offline", message: "Apply supabase/sql/anderzone.sql and configure Supabase." },
    { status: 503 }
  );
}

function asKind(value: string): FurnitureKind {
  const known = starterInventory().some((item) => item.kind === value);
  return known ? (value as FurnitureKind) : "cushion";
}

export async function GET() {
  const supabase = anderzoneSupabase();
  if (!supabase) return offline();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ ok: false, message: "Unauthorized" }, { status: 401 });

  const profile = await supabase.from("anderzone_profiles").select("display_name, appearance, starter_pod_granted").eq("user_id", user.id).maybeSingle();
  const pod = await supabase.from("anderzone_pods").select("id, version, visitor_access, layout").eq("owner_id", user.id).maybeSingle();
  const inventory = await supabase.from("anderzone_inventory").select("item_id, qty").eq("owner_id", user.id);
  const dooboos = await supabase.from("anderzone_dooboos").select("id, species_id, name, care, pos_x, pos_y").eq("owner_id", user.id);
  if (profile.error || pod.error || inventory.error || dooboos.error) return offline();

  let home: HomePod | null = pod.data
    ? {
        id: pod.data.id,
        ownerId: user.id,
        version: pod.data.version,
        visitorAccess: pod.data.visitor_access === "public" || pod.data.visitor_access === "friends" ? pod.data.visitor_access : "private",
        layout: Array.isArray(pod.data.layout) ? pod.data.layout : [],
        inventory: (inventory.data ?? []).map((item) => ({ kind: asKind(item.item_id), qty: item.qty })),
      }
    : null;

  if (!home && !profile.data?.starter_pod_granted) {
    const created = createStarterPod(user.id);
    const inserted = await supabase.from("anderzone_pods").insert({
      owner_id: user.id,
      version: 1,
      visitor_access: "private",
      layout: [],
    }).select("id").maybeSingle();
    if (inserted.error || !inserted.data) return offline();
    await supabase.from("anderzone_profiles").upsert({
      user_id: user.id,
      display_name: profile.data?.display_name || "Ander",
      appearance: profile.data?.appearance || {},
      starter_pod_granted: true,
    });
    await supabase.from("anderzone_inventory").upsert(starterInventory().map((item) => ({
      owner_id: user.id,
      item_id: item.kind,
      qty: item.qty,
    })));
    home = { ...created, id: inserted.data.id, inventory: starterInventory() };
  }

  return Response.json({
    ok: true,
    persistence: "supabase",
    displayName: profile.data?.display_name || "Ander",
    appearance: sanitizeAvatar(profile.data?.appearance),
    pod: home,
    dooboos: (dooboos.data ?? []).map((row) => ({
      id: row.id,
      speciesId: row.species_id,
      name: row.name,
      x: row.pos_x,
      y: row.pos_y,
      behavior: "follow",
      care: row.care,
      playUntil: 0,
    })),
  });
}

export async function PUT(req: Request) {
  const supabase = anderzoneSupabase();
  if (!supabase) return offline();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { appearance?: unknown; displayName?: unknown };
  const appearance = sanitizeAvatar(body.appearance);
  const { error } = await supabase.from("anderzone_profiles").upsert({
    user_id: user.id,
    display_name: typeof body.displayName === "string" ? body.displayName.slice(0, 24) : "Ander",
    appearance,
    starter_pod_granted: true,
  });
  if (error) return offline();
  return Response.json({ ok: true, appearance });
}
