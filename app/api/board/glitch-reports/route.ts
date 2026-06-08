import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GLITCH_REPORTS_TABLE = "board_glitch_reports";

const pages = new Set([
  "Home",
  "Feed",
  "Forums",
  "Work",
  "Profile",
  "Options",
  "Explore",
  "Friend Zone",
  "Onboarding",
  "Other",
]);

const severities = new Set([
  "Minor visual issue",
  "Confusing behavior",
  "Broken feature",
  "Page/app crash",
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function isMissingTableError(error: { code?: string; message?: string } | null | undefined) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST205" ||
    error?.code === "42P01" ||
    message.includes(GLITCH_REPORTS_TABLE) ||
    message.includes("schema cache")
  );
}

function storageError(error: { code?: string; message?: string } | null | undefined) {
  if (isMissingTableError(error)) {
    return {
      ok: false,
      setupRequired: true,
      message:
        "Glitch reports are not installed in Supabase yet. Run supabase/sql/board_glitch_reports.sql in the Supabase SQL editor, then refresh Board.",
      hint: `Missing Supabase table "${GLITCH_REPORTS_TABLE}".`,
    };
  }

  return {
    ok: false,
    message: error?.message || "Glitch report could not sync to Supabase.",
    hint: `Check that "${GLITCH_REPORTS_TABLE}" exists and allows anonymous inserts.`,
  };
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;

  try {
    body = await req.json();
  } catch {
    return json({ ok: false, message: "Glitch report payload must be JSON." }, 400);
  }

  const description = cleanText(body.description);
  if (!description) {
    return json({ ok: false, message: "Tell us what happened before sending the report." }, 400);
  }

  const page = pages.has(cleanText(body.page)) ? cleanText(body.page) : "Other";
  const severity = severities.has(cleanText(body.severity))
    ? cleanText(body.severity)
    : "Confusing behavior";

  const createdAt = cleanText(body.createdAt) || new Date().toISOString();
  const id = cleanText(body.id) || `glitch-${Date.now()}`;
  const optionalLink = cleanText(body.optionalLink);
  const userAgent = cleanText(body.userAgent) || req.headers.get("user-agent") || "";
  const currentPath = cleanText(body.currentPath);

  const supabase = supabaseServer();
  let reporterUserId: string | null = null;

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    reporterUserId = user?.id ?? null;
  } catch {
    reporterUserId = null;
  }

  const { error } = await supabase.from(GLITCH_REPORTS_TABLE).insert({
    id,
    created_at: createdAt,
    page,
    severity,
    description,
    optional_link: optionalLink || null,
    user_agent: userAgent || null,
    current_path: currentPath || null,
    reporter_user_id: reporterUserId,
    status: "new",
    source: "board_beta",
    metadata: {
      receivedVia: "board_glitch_report_modal",
    },
  });

  if (error) {
    return json(storageError(error), isMissingTableError(error) ? 503 : 500);
  }

  return json({ ok: true });
}
