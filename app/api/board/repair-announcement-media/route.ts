import { readFile } from "fs/promises";
import path from "path";

import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOARD_MEDIA_BUCKET = "board-media";

/** Legacy HEIC announcement that browsers cannot paint in feed cards. */
const KNOWN_REPAIRS: Record<
  string,
  { ownerId: string; assetFile: string; storageFileName: string }
> = {
  "af6834ee-2e5f-47c3-b648-e59167f85b81": {
    ownerId: "297c8656-4613-4403-be69-84b45c25e666",
    assetFile: "those-ryderz-clapper-2025.jpg",
    storageFileName: "those-ryderz-clapper-2025-repair.jpg",
  },
};

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return null;
  return createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(req: Request) {
  const sb = supabaseAdmin();
  if (!sb) {
    return Response.json({ error: "Server storage config unavailable." }, { status: 500 });
  }

  let activityId = "";
  try {
    const body = await req.json().catch(() => ({}));
    activityId = String(body?.activityId ?? "").trim();
  } catch {
    activityId = "";
  }

  if (!activityId) activityId = "af6834ee-2e5f-47c3-b648-e59167f85b81";

  const repair = KNOWN_REPAIRS[activityId];
  if (!repair) {
    return Response.json({ error: "No server repair recipe for this activity." }, { status: 404 });
  }

  const jpegPath = path.join(
    process.cwd(),
    "public/assets/board-feed",
    repair.assetFile
  );
  const jpegBuffer = await readFile(jpegPath);

  const storagePath = `uploads/${repair.ownerId}/${repair.storageFileName}`;
  const { error: uploadError } = await sb.storage
    .from(BOARD_MEDIA_BUCKET)
    .upload(storagePath, jpegBuffer, {
      contentType: "image/jpeg",
      cacheControl: "3600",
      upsert: true,
    });
  if (uploadError) {
    return Response.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: pub } = sb.storage.from(BOARD_MEDIA_BUCKET).getPublicUrl(storagePath);
  const jpegUrl = pub.publicUrl;
  if (!jpegUrl) {
    return Response.json({ error: "Could not resolve public JPEG URL." }, { status: 500 });
  }

  const { data: row, error: readError } = await sb
    .from("board_activity")
    .select("*")
    .eq("id", activityId)
    .maybeSingle();
  if (readError || !row) {
    return Response.json({ error: readError?.message || "Activity not found." }, { status: 404 });
  }

  const prevMeta =
    row.meta && typeof row.meta === "object" ? (row.meta as Record<string, unknown>) : {};
  const nextMeta = {
    ...prevMeta,
    announcement_media_url: jpegUrl,
    announcement_media_type: "image",
    mediaKind: "image",
    repairedFromHeic: true,
  };

  const { error: updateError } = await sb
    .from("board_activity")
    .update({
      href: jpegUrl,
      image_url: jpegUrl,
      meta: nextMeta,
    })
    .eq("id", activityId);

  if (updateError) {
    return Response.json({ error: updateError.message }, { status: 500 });
  }

  return Response.json({
    ok: true,
    activityId,
    jpegUrl,
  });
}
