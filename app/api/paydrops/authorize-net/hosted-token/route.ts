import { NextRequest, NextResponse } from "next/server";

type Body = {
  amountCents?: number;
  title?: string;
  description?: string;
  customerEmail?: string;
  customerProfileId?: string;
  payDropId?: string;
  savePaymentProfile?: boolean;
};

function envOrNull(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(req: NextRequest) {
  const apiLoginId = envOrNull("AUTHNET_API_LOGIN_ID");
  const transactionKey = envOrNull("AUTHNET_TRANSACTION_KEY");
  const environment =
    envOrNull("AUTHNET_ENVIRONMENT") === "production"
      ? "production"
      : "sandbox";
  const appUrl = envOrNull("NEXT_PUBLIC_APP_URL") ?? req.nextUrl.origin;

  if (!apiLoginId || !transactionKey) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Authorize.Net is not configured yet. Add AUTHNET_API_LOGIN_ID and AUTHNET_TRANSACTION_KEY to connect your National Bankcard gateway.",
      },
      { status: 503 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const amountCents = Number(body.amountCents ?? 0);

  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json(
      { ok: false, error: "amountCents must be greater than 0." },
      { status: 400 }
    );
  }

  const amount = (amountCents / 100).toFixed(2);
  const customerProfileId = String(body.customerProfileId ?? "").trim();
  const savePaymentProfile = !!body.savePaymentProfile && !!customerProfileId;
  const endpoint =
    environment === "production"
      ? "https://api.authorize.net/xml/v1/request.api"
      : "https://apitest.authorize.net/xml/v1/request.api";

  const returnUrl = new URL("/board/feed", appUrl).toString();
  const cancelUrl = new URL("/board/feed", appUrl).toString();

  const payload = {
    getHostedPaymentPageRequest: {
      merchantAuthentication: {
        name: apiLoginId,
        transactionKey,
      },
      transactionRequest: {
        transactionType: "authCaptureTransaction",
        amount,
        profile: customerProfileId
          ? {
              customerProfileId,
            }
          : undefined,
        order: {
          invoiceNumber: String(body.payDropId ?? `paydrop_${Date.now()}`).slice(
            0,
            20
          ),
          description: String(body.title ?? "BOARD Pay Drop").slice(0, 255),
        },
        customer: body.customerEmail
          ? {
              email: body.customerEmail,
            }
          : undefined,
      },
      hostedPaymentSettings: {
        setting: [
          {
            settingName: "hostedPaymentReturnOptions",
            settingValue: JSON.stringify({
              showReceipt: false,
              url: returnUrl,
              urlText: "Return to BOARD",
              cancelUrl,
              cancelUrlText: "Cancel",
            }),
          },
          {
            settingName: "hostedPaymentButtonOptions",
            settingValue: JSON.stringify({
              text: "Complete Pay Drop",
            }),
          },
          {
            settingName: "hostedPaymentStyleOptions",
            settingValue: JSON.stringify({
              bgColor: "#111111",
            }),
          },
          {
            settingName: "hostedPaymentPaymentOptions",
            settingValue: JSON.stringify({
              cardCodeRequired: true,
              showCreditCard: true,
              showBankAccount: false,
            }),
          },
          {
            settingName: "hostedPaymentCustomerOptions",
            settingValue: JSON.stringify({
              showEmail: true,
              requiredEmail: false,
              addPaymentProfile: savePaymentProfile,
            }),
          },
          {
            settingName: "hostedPaymentOrderOptions",
            settingValue: JSON.stringify({
              show: true,
              merchantName: "JAB Visions BOARD",
            }),
          },
        ],
      },
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
  const token = data && typeof data.token === "string" ? data.token : null;

  if (!response.ok || !token) {
    return NextResponse.json(
      {
        ok: false,
        error:
          data?.messages?.message?.[0]?.text ??
          "Authorize.Net did not return a hosted payment token.",
        details: data ?? null,
      },
      { status: 502 }
    );
  }

  const hostedPaymentUrl =
    environment === "production"
      ? "https://accept.authorize.net/payment/payment"
      : "https://test.authorize.net/payment/payment";

  return NextResponse.json({
    ok: true,
    token,
    hostedPaymentUrl,
    environment,
  });
}
