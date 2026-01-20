"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function BoardSignupPage() {
  const router = useRouter();
  const sb = useMemo(() => supabaseBrowser(), []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [agree, setAgree] = useState(false);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function validatePassword(pw: string) {
    if (pw.length < 8) return "Password must be at least 8 characters.";
    return null;
  }

  async function onSignup(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);

    if (!agree) {
      setErr("Please confirm you agree to the Terms, Privacy Policy, and Guidelines.");
      return;
    }
    if (!email.trim() || !password) {
      setErr("Please enter your email and password.");
      return;
    }
    const pwErr = validatePassword(password);
    if (pwErr) {
      setErr(pwErr);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await sb.auth.signUp({
        email: email.trim(),
        password,
        options: {
          // You can store small metadata here if you want later (like plan="free")
          data: {
            onboarding: "v1",
          },
        },
      });

      if (error) {
        setErr(error.message);
        return;
      }

      // Supabase may require email confirmation depending on your project settings.
      // If confirmation is ON, data.user may be null until email verified.
      setOk(
        data.user
          ? "Account created. Redirecting…"
          : "Account created. Please check your email to confirm, then log in."
      );

      // If user exists immediately, redirect; otherwise take them to login.
      if (data.user) {
        router.push("/board/work"); // change to your real post-signup route
        router.refresh();
      } else {
        router.push("/board/login");
      }
    } catch (e: any) {
      setErr(e?.message || "Signup failed. Please try again.");
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
            <Link className="opacity-80 hover:opacity-100" href="/terms">
              Terms
            </Link>
            <Link className="opacity-80 hover:opacity-100" href="/privacy">
              Privacy
            </Link>
            <Link className="opacity-80 hover:opacity-100" href="/guidelines">
              Guidelines
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-xl px-6 pb-14 pt-4">
        <div className="rounded-3xl border border-white/10 bg-black/30 p-8 shadow-[0_0_80px_rgba(0,200,255,0.08)]">
          <h1 className="text-3xl font-semibold tracking-tight">Create account</h1>
          <p className="mt-2 text-sm opacity-80">
            Join Board. Drop, connect, build.
          </p>

          <form className="mt-6 grid gap-4" onSubmit={onSignup}>
            <div className="grid gap-2">
              <label className="text-xs opacity-70">Email</label>
              <input
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/20"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-xs opacity-70">Password</label>
              <input
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/20"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
              <div className="text-[11px] opacity-60">
                Tip: use 8+ characters. You can upgrade password rules later.
              </div>
            </div>

            <label className="mt-2 flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs leading-5">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-white"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
              />
              <span className="opacity-80">
                I confirm I’m 13+ and I agree to the{" "}
                <Link className="underline" href="/terms" target="_blank">
                  Terms
                </Link>
                ,{" "}
                <Link className="underline" href="/privacy" target="_blank">
                  Privacy Policy
                </Link>
                , and{" "}
                <Link className="underline" href="/guidelines" target="_blank">
                  Community Guidelines
                </Link>
                .
              </span>
            </label>

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
              {loading ? "Creating…" : "Create account"}
            </button>

            <div className="mt-2 text-xs opacity-70">
              Already have an account?{" "}
              <Link className="underline" href="/board/login">
                Log in
              </Link>
              .
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
