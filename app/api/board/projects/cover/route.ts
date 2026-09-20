import { NextRequest, NextResponse } from "next/server";
import { BOARD_PROJECT_MEDIA_BUCKET } from "@/lib/board/projectCover";
import { checkUploadSize, resolveUploadContentType } from "@/lib/board/uploadLimits";
import { createSupabaseRouteClient } from "@/lib/supabase/routeClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function jsonError(status: number, message: string) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(request: NextRequest) {
  const { supabase, applyCookies } = createSupabaseRouteClient(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return applyCookies(jsonError(401, "Sign in to upload a project cover."));
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof Blob) || file.size <= 0) {
    return applyCookies(jsonError(400, "Missing file"));
  }

  const fileName = "name" in file && typeof file.name === "string" ? file.name : "cover.jpg";
  const contentType = resolveUploadContentType({
    type: file.type,
    name: fileName,
  });
  if (!contentType.startsWith("image/")) {
    return applyCookies(jsonError(400, "Only images allowed"));
  }

  const sizeError = checkUploadSize(
    { size: file.size, type: contentType, name: fileName },
    "image"
  );
  if (sizeError) {
    return applyCookies(jsonError(413, sizeError));
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext =
    contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const storagePath = `${user.id}/project-cover/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from(BOARD_PROJECT_MEDIA_BUCKET)
    .upload(storagePath, bytes, {
      contentType,
      upsert: true,
      cacheControl: "3600",
    });

  if (uploadErr) {
    return applyCookies(jsonError(500, uploadErr.message || "Cover upload failed."));
  }

  const { data: signed } = await supabase.storage
    .from(BOARD_PROJECT_MEDIA_BUCKET)
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365);

  return applyCookies(
    NextResponse.json({
      ok: true,
      bucket: BOARD_PROJECT_MEDIA_BUCKET,
      storagePath,
      image_url: signed?.signedUrl || "",
    })
  );
}
