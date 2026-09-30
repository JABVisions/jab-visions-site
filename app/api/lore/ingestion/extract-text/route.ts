// File: app/api/lore/ingestion/extract-text/route.ts
// Admin-only helper for the Lore Ingestion Studio's file picker. The studio's
// upload input previously only accepted .txt, so any Word doc / PDF
// screenplay a creator tried to pick showed as greyed-out/unselectable in
// the OS file dialog. This route lets the client accept .docx and .pdf too
// by extracting plain text server-side (mammoth for .docx, pdf-parse for
// .pdf) and handing raw_text back to the existing paste-text flow — no
// changes needed to how sources are saved.

import { NextRequest } from "next/server";
import { requireLoreAdmin, LoreAdminError } from "@/lib/lore/server/write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: NextRequest) {
  try {
    await requireLoreAdmin();
  } catch (error) {
    return json({ error: error instanceof LoreAdminError ? error.message : "Unauthorized" }, 403);
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return json({ error: "No file provided." }, 400);

  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    if (name.endsWith(".docx")) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return json({ text: result.value, filename: file.name });
    }

    if (name.endsWith(".pdf")) {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      return json({ text: result.text, filename: file.name });
    }

    if (name.endsWith(".doc")) {
      return json(
        { error: "Legacy .doc files aren't supported — please re-save as .docx (Word) or export as .txt/.pdf and try again." },
        400
      );
    }

    return json({ error: "Unsupported file type. Use .txt, .md, .docx, or .pdf." }, 400);
  } catch (err) {
    return json(
      { error: err instanceof Error ? `Could not read that file: ${err.message}` : "Could not read that file." },
      400
    );
  }
}
