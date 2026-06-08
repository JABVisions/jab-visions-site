import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseServer() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) =>
          cs.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
      },
    }
  );
}

function titleCase(input: string) {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function deriveDisplayName(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}) {
  const metadata = user.user_metadata ?? {};
  const metadataName =
    (typeof metadata.display_name === "string" && metadata.display_name.trim()) ||
    (typeof metadata.full_name === "string" && metadata.full_name.trim()) ||
    (typeof metadata.name === "string" && metadata.name.trim()) ||
    "";

  if (metadataName) return metadataName.slice(0, 60);

  const emailPrefix = String(user.email || "")
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .trim();

  return titleCase(emailPrefix).slice(0, 60) || "Board User";
}

function deriveUsername(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}) {
  const metadata = user.user_metadata ?? {};
  const metadataUsername =
    typeof metadata.username === "string" && metadata.username.trim()
      ? metadata.username.trim()
      : "";

  const raw =
    metadataUsername ||
    String(user.email || "")
      .split("@")[0]
      .trim();

  const username = raw.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);
  return username || null;
}

export async function POST() {
  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const { data: existing, error: existingError } = await supabase
    .from("profiles")
    .select("id, username, display_name, bio, avatar_url, board_style")
    .eq("id", user.id)
    .maybeSingle();

  if (existingError) {
    return new Response(
      JSON.stringify({ ok: false, message: existingError.message }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      }
    );
  }

  const metadata = user.user_metadata ?? {};
  const candidateUsername = deriveUsername(user);
  const candidateAvatar =
    typeof metadata.avatar_url === "string" && metadata.avatar_url.trim()
      ? metadata.avatar_url.trim()
      : null;
  const candidateDisplayName = deriveDisplayName(user);
  const candidateBio =
    typeof metadata.board_goal === "string" && metadata.board_goal.trim()
      ? metadata.board_goal.trim().slice(0, 180)
      : null;
  const metadataAge = Number(metadata.age);
  const metadataBirthMonth = Number(metadata.birth_month);
  const metadataBirthDay = Number(metadata.birth_day);
  const metadataBirthYear = Number(metadata.birth_year);
  const auraColor =
    typeof metadata.board_signal_color === "string" && metadata.board_signal_color.trim()
      ? metadata.board_signal_color.trim().slice(0, 40)
      : "sloth_pink";
  const glowColor =
    typeof metadata.board_signal_hex === "string" && metadata.board_signal_hex.trim()
      ? metadata.board_signal_hex.trim().slice(0, 16)
      : "#FF4FD8";
  const auraMood =
    typeof metadata.board_vibe === "string" && metadata.board_vibe.trim()
      ? metadata.board_vibe.trim().slice(0, 40)
      : "locked_in";
  const onboarding = {
    version: "v1",
    fullName:
      typeof metadata.full_name === "string" && metadata.full_name.trim()
        ? metadata.full_name.trim().slice(0, 80)
        : candidateDisplayName,
    age: Number.isInteger(metadataAge) && metadataAge >= 13 && metadataAge <= 120 ? metadataAge : null,
    birthDate:
      typeof metadata.birth_date === "string" && metadata.birth_date.trim()
        ? metadata.birth_date.trim().slice(0, 10)
        : null,
    birthMonth:
      Number.isInteger(metadataBirthMonth) && metadataBirthMonth >= 1 && metadataBirthMonth <= 12
        ? metadataBirthMonth
        : null,
    birthDay:
      Number.isInteger(metadataBirthDay) && metadataBirthDay >= 1 && metadataBirthDay <= 31
        ? metadataBirthDay
        : null,
    birthYear:
      Number.isInteger(metadataBirthYear) && metadataBirthYear >= 1900 ? metadataBirthYear : null,
    accountType:
      typeof metadata.board_account_type === "string" && metadata.board_account_type.trim()
        ? metadata.board_account_type.trim().slice(0, 40)
        : null,
    goal:
      typeof metadata.board_goal === "string" && metadata.board_goal.trim()
        ? metadata.board_goal.trim().slice(0, 180)
        : null,
    vibe:
      typeof metadata.board_vibe === "string" && metadata.board_vibe.trim()
        ? metadata.board_vibe.trim().slice(0, 180)
        : null,
    vibeLabel:
      typeof metadata.board_vibe_label === "string" && metadata.board_vibe_label.trim()
        ? metadata.board_vibe_label.trim().slice(0, 60)
        : null,
    signalColor: auraColor,
    signalLabel:
      typeof metadata.board_signal_label === "string" && metadata.board_signal_label.trim()
        ? metadata.board_signal_label.trim().slice(0, 60)
        : null,
    signalHex: glowColor,
    completedAt: new Date().toISOString(),
  };

  const payload: Record<string, unknown> = { id: user.id };
  let needsWrite = !existing;
  const existingBoardStyle =
    existing?.board_style && typeof existing.board_style === "object"
      ? (existing.board_style as Record<string, unknown>)
      : {};

  if (!existing?.display_name && candidateDisplayName) {
    payload.display_name = candidateDisplayName;
    needsWrite = true;
  }

  if (!existing?.username && candidateUsername) {
    payload.username = candidateUsername;
    needsWrite = true;
  }

  if (!existing?.bio && candidateBio) {
    payload.bio = candidateBio;
    needsWrite = true;
  }

  if (!existing?.avatar_url && candidateAvatar) {
    payload.avatar_url = candidateAvatar;
    needsWrite = true;
  }

  if (!existingBoardStyle.onboarding) {
    payload.board_style = {
      ...existingBoardStyle,
      displayName: candidateDisplayName,
      bio: candidateBio ?? "",
      auraColor,
      auraMood,
      glowColor,
      onboarding,
    };
    needsWrite = true;
  }

  if (!needsWrite) {
    return new Response(JSON.stringify({ ok: true, ensured: false }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  const { error } = await supabase
    .from("profiles")
    .upsert(payload, { onConflict: "id" });

  if (error) {
    return new Response(JSON.stringify({ ok: false, message: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, ensured: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
