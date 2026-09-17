import { BOARD_NOTIFICATIONS_UPDATED_EVENT } from "@/lib/board/notifications";

export async function persistReaction(input: {
  activityId: string;
  reaction: "pass" | "pin" | "push";
  ownerUserId?: string | null;
  dropId?: string | null;
  dropTitle?: string | null;
  dropHref?: string | null;
  dropImageUrl?: string | null;
  dropType?: string | null;
}) {
  if (typeof window === "undefined") return { ok: false };

  try {
    const res = await fetch("/api/board/reactions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload?.ok) {
      return { ok: false, message: payload?.message || "Signal stayed local." };
    }
    window.dispatchEvent(new CustomEvent(BOARD_NOTIFICATIONS_UPDATED_EVENT));
    return { ok: true, skipped: Boolean(payload.skipped) };
  } catch {
    return { ok: false, message: "Signal stayed local." };
  }
}
