"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CSSProperties } from "react";
import { LogOut } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";

type BoardLogoutButtonProps = {
  compact?: boolean;
  className?: string;
  label?: string;
  style?: CSSProperties;
};

export default function BoardLogoutButton({
  compact = false,
  className = "",
  label = "Log out",
  style,
}: BoardLogoutButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    if (busy) return;
    setBusy(true);

    try {
      const supabase = supabaseBrowser();
      await supabase.auth.signOut();
    } catch {
      // Fall through to redirect even if local signout throws.
    } finally {
      router.replace("/board/login");
      router.refresh();
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleLogout()}
      disabled={busy}
      className={className}
      style={style}
      aria-label={label}
      title={label}
    >
      <LogOut size={compact ? 16 : 18} strokeWidth={2.5} aria-hidden />
      <span>{busy ? "Logging out" : label}</span>
    </button>
  );
}
