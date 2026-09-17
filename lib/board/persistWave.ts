import { sendWave } from "@/lib/board/bucketBrain";
import { readCurrentBoardIdentity } from "@/lib/board/currentProfile";

export async function persistWave(from: string, to: string, recipientId?: string) {
  const identity = typeof window !== "undefined" ? readCurrentBoardIdentity() : null;
  const actor =
    !from || from === "me" ? identity?.username || from || "me" : from;
  sendWave(actor, to);
  if (typeof window === "undefined") return { ok: true, local: true };

  try {
    const res = await fetch("/api/board/waves", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to, recipientId: recipientId || null }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload?.ok) {
      return {
        ok: false,
        local: true,
        message: payload?.message || "Wave saved locally.",
      };
    }
    return { ok: true, local: false, mutual: Boolean(payload.mutual) };
  } catch {
    return { ok: false, local: true, message: "Wave saved locally." };
  }
}
