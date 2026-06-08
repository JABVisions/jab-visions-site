import { NextRequest, NextResponse } from "next/server";

type Body = {
  customerId?: string;
  email?: string;
  description?: string;
};

function envOrNull(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function profileIdFromDuplicateMessage(text: string | undefined) {
  if (!text) return null;
  const match = text.match(/(?:profile ID|ID)\s+(\d+)/i);
  return match?.[1] ?? null;
}

export async function POST(req: NextRequest) {
  const apiLoginId = envOrNull("AUTHNET_API_LOGIN_ID");
  const transactionKey = envOrNull("AUTHNET_TRANSACTION_KEY");
  const environment =
    envOrNull("AUTHNET_ENVIRONMENT") === "production"
      ? "production"
      : "sandbox";

  if (!apiLoginId || !transactionKey) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Authorize.Net is not configured yet. Add AUTHNET_API_LOGIN_ID and AUTHNET_TRANSACTION_KEY.",
      },
      { status: 503 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const customerId = String(body.customerId ?? "").trim().slice(0, 20);
  const email = String(body.email ?? "").trim().slice(0, 255);

  if (!customerId && !email) {
    return NextResponse.json(
      { ok: false, error: "A customer id or email is required." },
      { status: 400 }
    );
  }

  const endpoint =
    environment === "production"
      ? "https://api.authorize.net/xml/v1/request.api"
      : "https://apitest.authorize.net/xml/v1/request.api";

  const payload = {
    createCustomerProfileRequest: {
      merchantAuthentication: {
        name: apiLoginId,
        transactionKey,
      },
      profile: {
        merchantCustomerId: customerId || undefined,
        description:
          String(body.description ?? "BOARD Pay Drop customer").slice(0, 255),
        email: email || undefined,
      },
      validationMode: "none",
    },
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const data = await response.json().catch(() => null);
  const customerProfileId =
    data && typeof data.customerProfileId === "string"
      ? data.customerProfileId
      : null;
  const message = data?.messages?.message?.[0];
  const duplicateProfileId =
    message?.code === "E00039"
      ? profileIdFromDuplicateMessage(message?.text)
      : null;

  if (customerProfileId || duplicateProfileId) {
    return NextResponse.json({
      ok: true,
      customerProfileId: customerProfileId ?? duplicateProfileId,
      environment,
      reused: !!duplicateProfileId,
    });
  }

  return NextResponse.json(
    {
      ok: false,
      error:
        message?.text ??
        "Authorize.Net did not return a customer profile id.",
      details: data ?? null,
    },
    { status: response.ok ? 502 : response.status }
  );
}
