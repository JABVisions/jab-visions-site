"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function BoardSignupPage() {
  const router = useRouter();
  const supabase = supabaseBrowser();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleSignup() {
    setMsg(null);

    if (!email.trim() || !password.trim()) {
      setMsg("Please enter an email and password.");
      return;
    }

    if (password.length < 6) {
      setMsg("Password must be at least 6 characters.");
      return;
    }

    setBusy(true);

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    setBusy(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    // Supabase may require email confirmation depending on your settings.
    setMsg("Account created. Now log in.");
    router.push("/board/login");
  }

  return (
    <main className="min-h-screen bg-[#FFF3B0] text-black">
      <div className="mx-auto max-w-xl px-6 pt-14 pb-16">
        <div className="rounded-[28px] bg-[#FFF7C9]/85 p-8 border border-black/10 shadow-[0_0_60px_rgba(0,255,150,0.12),0_0_50px_rgba(255,0,190,0.10)]">
          <h1 className="text-3xl font-semibold tracking-wide text-[rgba(0,170,80,0.98)] drop-shadow-[0_0_10px_rgba(0,255,150,0.45)]">
            Join JAB Visions™ Board
          </h1>

          <p className="mt-2 text-[rgba(255,0,190,0.90)] drop-shadow-[0_0_10px_rgba(255,0,190,0.30)]">
            Build your vision board profile and post to the public dream-feed.
          </p>

          <div className="mt-7 space-y-4">
            <label className="block">
              <span className="text-sm text-[rgba(255,0,190,0.90)] drop-shadow-[0_0_8px_rgba(255,0,190,0.25)]">
                Email
              </span>
              <input
                type="email"
                className="mt-2 w-full rounded-xl bg-white/70 px-4 py-3 outline-none border border-black/10
                           focus:border-[rgba(255,0,190,0.45)] focus:shadow-[0_0_18px_rgba(255,0,190,0.18)]"
                placeholder="you@domain.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </label>

            <label className="block">
              <span className="text-sm text-[rgba(255,0,190,0.90)] drop-shadow-[0_0_8px_rgba(255,0,190,0.25)]">
                Password
              </span>
              <input
                type="password"
                className="mt-2 w-full rounded-xl bg-white/70 px-4 py-3 outline-none border border-black/10
                           focus:border-[rgba(255,0,190,0.45)] focus:shadow-[0_0_18px_rgba(255,0,190,0.18)]"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </label>

            {/* Status message */}
            {msg && (
              <div className="rounded-xl bg-white/60 border border-black/10 px-4 py-3 text-sm text-black/80">
                {msg}
              </div>
            )}

            <button
              type="button"
              onClick={handleSignup}
              disabled={busy}
              className="w-full rounded-2xl bg-[#FFF1A8] px-5 py-3 text-sm font-medium
                         text-[rgba(255,0,190,0.92)]
                         border border-black/10
                         shadow-[0_0_22px_rgba(255,0,190,0.18)]
                         transition hover:translate-y-[-1px] hover:shadow-[0_0_32px_rgba(255,0,190,0.26)]
                         disabled:opacity-60 disabled:hover:translate-y-0"
            >
              {busy ? "Creating..." : "Create Account"}
            </button>

            <div className="pt-2 text-sm">
              <Link
                href="/board"
                className="text-[rgba(255,0,190,0.90)] drop-shadow-[0_0_8px_rgba(255,0,190,0.25)] hover:underline"
              >
                ← Back to Board
              </Link>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-black/60">
          (Now it actually creates an account.)
        </p>
      </div>
    </main>
  );
}
