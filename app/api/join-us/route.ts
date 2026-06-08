import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALLBACK_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyr9K7yloQCmIxodtPtGt2TqY2eA_6ghjr4sg1m4xR-2YVsLS33Xv0HEP76yfF69CnE/exec";
const JOIN_US_SCRIPT_TOKEN = process.env.JOIN_US_SCRIPT_TOKEN || "";

const LOG_PREFIX = "[JoinUs API]";

const FIELD_ORDER = [
  "FullName",
  "Email",
  "Phone",
  "DateOfBirth",
  "Location",
  "CastOrCrew",
  "Role",
  "EmergencyContactName",
  "EmergencyContactPhone",
  "Availability",
  "Links",
] as const;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function firstValue(body: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = clean(body[key]);
    if (value) return value;
  }
  return "";
}

function hasBotTrapValue(body: Record<string, unknown>) {
  return Boolean(
    firstValue(
      body,
      "BoardCompany",
      "boardCompany"
    )
  );
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function phoneDigitCount(value: string) {
  return value.replace(/\D/g, "").length;
}

function looksLikePersonName(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < 3 || normalized.length > 80) return false;
  if (/https?:|www\.|@|\d/.test(normalized)) return false;

  const nameParts = normalized
    .split(" ")
    .filter((part) => /^[\p{L}'-]+$/u.test(part) && part.length >= 2);

  return nameParts.length >= 2;
}

function isValidDateOfBirth(value: string) {
  if (!value) return true;

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;

  const now = new Date();
  return date < now;
}

function isAllowedCastOrCrew(value: string) {
  return ["cast", "crew", "either"].includes(value.trim().toLowerCase());
}

function validationMessage(rawBody: Record<string, unknown>, body: ReturnType<typeof normalizeSubmission>) {
  if (hasBotTrapValue(rawBody)) {
    return "Submission could not be verified.";
  }

  if (!looksLikePersonName(body.FullName)) {
    return "Please enter your real first and last name.";
  }

  if (!isValidEmail(body.Email)) {
    return "Please enter a valid email address.";
  }

  const phoneDigits = phoneDigitCount(body.Phone);
  if (phoneDigits < 10 || phoneDigits > 15) {
    return "Please enter a valid phone number.";
  }

  if (!isValidDateOfBirth(body.DateOfBirth)) {
    return "Please enter a valid date of birth.";
  }

  if (!isAllowedCastOrCrew(body.CastOrCrew)) {
    return "Please choose Cast, Crew, or Either.";
  }

  if (body.Role.length < 2 || body.Role.length > 80) {
    return "Please enter the role or position you want.";
  }

  if (!looksLikePersonName(body.EmergencyContactName)) {
    return "Please enter a real emergency contact name.";
  }

  const emergencyPhoneDigits = phoneDigitCount(body.EmergencyContactPhone);
  if (emergencyPhoneDigits < 10 || emergencyPhoneDigits > 15) {
    return "Please enter a valid emergency contact phone number.";
  }

  return "";
}

async function readBody(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const json = await req.json();
    return json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  }

  const form = await req.formData();
  return Object.fromEntries(
    Array.from(form.entries()).map(([key, value]) => [
      key,
      typeof value === "string" ? value : value.name,
    ])
  );
}

function normalizeSubmission(body: Record<string, unknown>) {
  return {
    FullName: firstValue(body, "FullName", "Full Name", "fullName", "Name", "name"),
    Email: firstValue(body, "Email", "email"),
    Phone: firstValue(body, "Phone", "phone"),
    DateOfBirth: firstValue(body, "DateOfBirth", "Date of Birth", "dateOfBirth"),
    Location: firstValue(body, "Location", "City / State", "location"),
    CastOrCrew: firstValue(body, "CastOrCrew", "Cast or Crew?", "castOrCrew"),
    Role: firstValue(body, "Role", "Desired Role / Position", "role"),
    EmergencyContactName: firstValue(
      body,
      "EmergencyContactName",
      "Emergency Contact Name",
      "emergencyContactName"
    ),
    EmergencyContactPhone: firstValue(
      body,
      "EmergencyContactPhone",
      "Emergency Contact Phone",
      "emergencyContactPhone"
    ),
    Availability: firstValue(body, "Availability", "Additional Notes", "availability"),
    Links: firstValue(body, "Links", "Website / Reel", "links"),
  };
}

export async function POST(req: NextRequest) {
  const scriptUrl = FALLBACK_SCRIPT_URL;
  const requestContentType = req.headers.get("content-type") || "";

  try {
    const rawBody = await readBody(req);
    const body = normalizeSubmission(rawBody);

    console.log(LOG_PREFIX, "received submission", {
      method: req.method,
      contentType: requestContentType,
      scriptUrl,
      rawBody,
      normalizedBody: body,
    });

    const invalidMessage = validationMessage(rawBody, body);

    if (invalidMessage) {
      console.warn(LOG_PREFIX, "rejected invalid submission", {
        message: invalidMessage,
        rawBody,
        normalizedBody: body,
      });

      return new Response(
        JSON.stringify({
          ok: false,
          message: invalidMessage,
        }),
        {
          status: 400,
          headers: { "content-type": "application/json" },
        }
      );
    }

    const payload = new URLSearchParams();

    FIELD_ORDER.forEach((key) => {
      payload.set(key, body[key]);
    });

    if (JOIN_US_SCRIPT_TOKEN) {
      payload.set("SourceToken", JOIN_US_SCRIPT_TOKEN);
    }

    console.log(LOG_PREFIX, "posting to Apps Script", {
      method: "POST",
      contentType: "application/x-www-form-urlencoded;charset=UTF-8",
      scriptUrl,
      payload: payload.toString(),
    });

    const gasRes = await fetch(scriptUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: payload.toString(),
      cache: "no-store",
      redirect: "follow",
    });

    const text = await gasRes.text();

    console.log(LOG_PREFIX, "Apps Script response", {
      ok: gasRes.ok,
      status: gasRes.status,
      body: text,
    });

    return new Response(
      JSON.stringify({
        ok: gasRes.ok,
        status: gasRes.status,
        upstream: text.slice(0, 500),
      }),
      {
        status: gasRes.ok ? 200 : 502,
        headers: { "content-type": "application/json" },
      }
    );
  } catch (error) {
    console.error(LOG_PREFIX, "submission failed", error);

    return new Response(
      JSON.stringify({
        ok: false,
        message: error instanceof Error ? error.message : "Join Us submission failed.",
      }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      }
    );
  }
}
