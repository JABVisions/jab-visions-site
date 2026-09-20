import { NextRequest, NextResponse } from "next/server";
import { ensureBoardMediaFileSizeLimit } from "@/lib/board/ensureBoardMediaLimits";
import { checkUploadSize, ownerScopedUploadFolder, resolveUploadContentType } from "@/lib/board/uploadLimits";
import { createSupabaseRouteClient } from "@/lib/supabase/routeClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
// Incoming bodies over ~4.5MB never reach this route on Vercel. The client
// skips FormData and uses tus / direct storage for audition-length videos.

function jsonError(status: number, message: string) {
  return NextResponse.json({ ok: false, message }, { status });
}

function safeFolder(value: unknown) {
  const raw = String(value || "uploads").trim();
  const cleaned = raw
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, ""))
    .filter((part) => part && part !== "." && part !== "..")
    .slice(0, 6)
    .join("/");
  return cleaned || "uploads";
}

export async function POST(request: NextRequest) {
  const { supabase, applyCookies } = createSupabaseRouteClient(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return applyCookies(jsonError(401, "Sign in to upload Board media."));
  }

  await Promise.race([
    ensureBoardMediaFileSizeLimit(),
    new Promise<void>((resolve) => setTimeout(resolve, 4_000)),
  ]).catch(() => undefined);

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof Blob) || file.size <= 0) {
    return applyCookies(jsonError(400, "Missing file"));
  }

  const fileName = "name" in file && typeof file.name === "string" ? file.name : "board-media";
  const contentType = resolveUploadContentType({
    type: file.type,
    name: fileName,
  });
  const sizeError = checkUploadSize({ size: file.size, type: contentType, name: fileName });
  if (sizeError) {
    return applyCookies(jsonError(413, sizeError));
  }

  const requestedBucket = String(form.get("bucket") || "board-media");
  const bucket = requestedBucket === "board-docs" ? "board-docs" : "board-media";
  const folder = ownerScopedUploadFolder(
    safeFolder(form.get("folder") || `uploads/${user.id}`),
    user.id
  );
  const ext = (fileName.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]+/g, "") || "bin";
  const storagePath = `${folder}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: uploadErr } = await supabase.storage.from(bucket).upload(storagePath, bytes, {
    contentType,
    upsert: true,
    cacheControl: "3600",
  });

  if (uploadErr) {
    return applyCookies(jsonError(500, uploadErr.message || "Media upload failed."));
  }

  const publicUrl = supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl || "";
  const { data: signed } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365);

  return applyCookies(
    NextResponse.json({
      ok: true,
      bucket,
      storagePath,
      publicUrl,
      signedUrl: signed?.signedUrl || "",
    })
  );
}
