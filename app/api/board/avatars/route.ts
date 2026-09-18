import { NextRequest } from "next/server";
import { applySignedBoardAvatars, boardAvatarStoragePath, supabaseAvatarSigner } from "@/lib/board/signBoardAvatars";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  const client = supabaseAvatarSigner();
  if (!client) return json({ ok: false, urls: {} }, 200);

  try {
    const body = await req.json();
    const paths = Array.isArray(body?.paths)
      ? body.paths
          .map((path: unknown) => boardAvatarStoragePath(path) || (typeof path === "string" ? path.trim() : ""))
          .filter(Boolean)
          .slice(0, 80)
      : [];
    if (!paths.length) return json({ ok: true, urls: {} });

    const signed = await applySignedBoardAvatars(
      client,
      paths.map((path: string) => ({ avatarUrl: path }))
    );
    const urls: Record<string, string> = {};
    signed.forEach((item, index) => {
      if (item.avatarUrl && item.avatarUrl !== paths[index]) urls[paths[index]] = item.avatarUrl;
    });
    return json({ ok: true, urls });
  } catch {
    return json({ ok: false, urls: {} }, 200);
  }
}
