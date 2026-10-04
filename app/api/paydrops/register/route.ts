import { NextRequest, NextResponse } from "next/server";
import { loadBankingSnapshot, registerBoardPayDrop, requireBankingUser } from "@/lib/board/banking/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { user, configured } = await requireBankingUser();
  if (!configured) {
    return NextResponse.json({ ok: false, error: "Banking is not connected on this server yet." }, { status: 503 });
  }
  if (!user) {
    return NextResponse.json({ ok: false, error: "Sign in to save a Pay Drop." }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    title?: string;
    description?: string;
    amountCents?: number;
    provider?: "stripe_connect" | "payment_link";
    status?: string;
  };
  const id = String(body.id ?? "").trim();
  const title = String(body.title ?? "").trim();
  const amountCents = Number(body.amountCents ?? 0);
  if (!id || !title || !Number.isFinite(amountCents) || amountCents <= 0 || amountCents !== Math.round(amountCents)) {
    return NextResponse.json({ ok: false, error: "A Pay Drop id, title, and whole-cent amount are required." }, { status: 400 });
  }
  const provider = body.provider === "payment_link" ? "payment_link" : "stripe_connect";
  const snapshot = await loadBankingSnapshot(user.id);
  if (provider === "stripe_connect" && !snapshot.readyForPayDrops) {
    return NextResponse.json(
      { ok: false, error: snapshot.message || "Finish Banking setup before receiving Pay Drop payments." },
      { status: 409 }
    );
  }
  await registerBoardPayDrop({
    id,
    ownerId: user.id,
    title,
    description: body.description,
    amountCents,
    provider,
    recipientStripeAccountId: snapshot.stripeAccountId,
    status: body.status,
  });
  return NextResponse.json({ ok: true, id });
}
