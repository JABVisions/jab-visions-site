"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function BoardResetPasswordPage() {
  const router = useRouter();
  const sb = useMemo(() => supabaseBrowser(), []);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);

    if (!password || !confirmPassword) {
      setErr("Please enter and confirm your new password.");
      return;
    }

    if (password.length < 8) {
      setErr("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setErr("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await sb.auth.updateUser({ password });
      if (error) {
        setErr(error.message);
        return;
      }

      setOk("Password updated. Redirecting to login…");
      window.setTimeout(() => {
        router.push("/board/login");
      }, 1200);
    } catch (e: any) {
      setErr(e?.message || "Could not update password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen">
      <header className="mx-auto max-w-6xl px-6 pt-10 pb-6">
        <div className="flex items-center justify-between gap-4">
          <Link href="/board" className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-black/40 ring-1 ring-white/10 shadow-[0_0_40px_rgba(255,0,180,0.25)]" />
            <div>
              <div className="text-sm opacity-70">JAB Visions™</div>
              <div className="text-lg font-semibold tracking-tight">Board</div>
            </div>
          </Link>

          <nav className="flex items-center gap-4 text-sm">
            <Link className="opacity-80 hover:opacity-100" href="/board/login">
              Login
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-xl px-6 pb-14 pt-4">
        <div className="rounded-3xl border border-white/10 bg-black/30 p-8 shadow-[0_0_80px_rgba(0,200,255,0.08)]">
          <h1 className="text-3xl font-semibold tracking-tight">Reset password</h1>
          <p className="mt-2 text-sm opacity-80">
            Choose a new password for your BOARD account.
          </p>

          <form className="mt-6 grid gap-4" onSubmit={onSubmit}>
            <div className="grid gap-2">
              <label className="text-xs opacity-70">New password</label>
              <input
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/20"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-xs opacity-70">Confirm new password</label>
              <input
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/20"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                type="password"
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>

            {err ? (
              <div className="rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-red-200">
                {err}
              </div>
            ) : null}

            {ok ? (
              <div className="rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-green-200">
                {ok}
              </div>
            ) : null}

            <button
              disabled={loading}
              className="mt-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black hover:opacity-95 disabled:opacity-60"
              type="submit"
            >
              {loading ? "Saving…" : "Update password"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
