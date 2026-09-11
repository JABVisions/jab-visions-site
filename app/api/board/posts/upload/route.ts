import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import {
  supabaseCredentials,
  supabaseNotConfiguredResponse,
} from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Null when no Supabase project is linked yet, so each handler can degrade
// instead of throwing an unhandled error at the edge of the request.
function supabaseServer() {
  const credentials = supabaseCredentials();
  if (!credentials) return null;

  const cookieStore = cookies();
  return createServerClient(
    credentials.url,
    credentials.key,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  );
}

export async function POST(req: NextRequest) {
  const supabase = supabaseServer();
  if (!supabase) return supabaseNotConfiguredResponse();


  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;

  if (!file) {
    return Response.json({ ok: false, message: "Missing file" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return Response.json({ ok: false, message: "Only images allowed" }, { status: 400 });
  }

  // Basic guardrails (keeps things snappy + prevents abuse)
  const MAX_MB = 8;
  if (file.size > MAX_MB * 1024 * 1024) {
    return Response.json({ ok: false, message: `Image too large (max ${MAX_MB}MB)` }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from("board-images")
    .upload(path, bytes, { contentType: file.type, upsert: false });

  if (uploadErr) {
    return Response.json({ ok: false, message: uploadErr.message }, { status: 500 });
  }

  // Private bucket → signed URL for display
  const { data: signed, error: signErr } = await supabase.storage
    .from("board-images")
    .createSignedUrl(path, 60 * 60 * 24 * 365); // 1 year

  if (signErr || !signed?.signedUrl) {
    return Response.json({ ok: false, message: signErr?.message || "Could not sign URL" }, { status: 500 });
  }

  return Response.json({
    ok: true,
    image_path: path,
    image_url: signed.signedUrl,
  });
}
