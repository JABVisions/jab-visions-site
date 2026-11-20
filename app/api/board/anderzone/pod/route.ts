import { saveEdit, starterInventory, type HomePod, type PlacedFurniture, type VisitorAccess } from "@/lib/anderzone/homePod";
import { anderzoneSupabase } from "../supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  const supabase = anderzoneSupabase();
  if (!supabase) return Response.json({ ok: false, persistence: "offline" }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const current = await supabase.from("anderzone_pods").select("id, version, visitor_access, layout").eq("owner_id", user.id).maybeSingle();
  if (current.error || !current.data) return Response.json({ ok: false, persistence: "offline" }, { status: 503 });
  const access: VisitorAccess = body.visitorAccess === "public" || body.visitorAccess === "friends" ? body.visitorAccess : "private";
  const pod: HomePod = {
    id: current.data.id,
    ownerId: user.id,
    version: current.data.version,
    visitorAccess: access,
    layout: Array.isArray(current.data.layout) ? current.data.layout : [],
    inventory: starterInventory(),
  };
  const draft = Array.isArray(body.layout) ? (body.layout as PlacedFurniture[]) : pod.layout;
  const saved = saveEdit(pod, { saved: pod.layout, draft, past: [], future: [], selectedId: null }, Number(body.version));
  if (!saved.ok) return Response.json({ ok: false, reason: saved.reason }, { status: 409 });
  const { data, error } = await supabase
    .from("anderzone_pods")
    .update({ layout: saved.pod.layout, version: saved.pod.version, visitor_access: saved.pod.visitorAccess })
    .eq("owner_id", user.id)
    .eq("version", pod.version)
    .select("version")
    .maybeSingle();
  if (error || !data) return Response.json({ ok: false, reason: "version" }, { status: 409 });
  return Response.json({ ok: true, version: data.version });
}
