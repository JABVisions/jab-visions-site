import { adoptFirstDooboo, type Dooboo } from "@/lib/anderzone/dooboo/pet";
import { anderzoneSupabase } from "../supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = anderzoneSupabase();
  if (!supabase) return Response.json({ ok: false, persistence: "offline" }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const existing = await supabase.from("anderzone_dooboos").select("id, species_id, name").eq("owner_id", user.id);
  if (existing.error) return Response.json({ ok: false, persistence: "offline" }, { status: 503 });
  const owned = (existing.data ?? []).map((row) => ({
    id: row.id,
    speciesId: row.species_id,
    name: row.name,
    x: 0,
    y: 0,
    behavior: "follow" as const,
    care: { fullness: 80, energy: 80, bond: 1 },
    playUntil: 0,
  }));
  const adopted = adoptFirstDooboo(owned as Dooboo[], String(body.speciesId || ""), String(body.name || ""), { x: 0, y: 0 });
  if (!adopted.ok) return Response.json(adopted, { status: 400 });
  const { data, error } = await supabase.from("anderzone_dooboos").insert({
    owner_id: user.id,
    species_id: adopted.pet.speciesId,
    name: adopted.pet.name,
    care: adopted.pet.care,
    region_id: "anderzone-central",
  }).select("id").maybeSingle();
  if (error) return Response.json({ ok: false, persistence: "offline" }, { status: 503 });
  return Response.json({ ok: true, cost: 0, id: data?.id ?? null });
}
