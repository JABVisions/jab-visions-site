import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import RecoveryLinkHandler from "./RecoveryLinkHandler";

export default async function BoardResetPasswordPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const success =
    typeof searchParams?.updated === "string" ? searchParams.updated : "";
  const sent = typeof searchParams?.sent === "string" ? searchParams.sent : "";
  const error = typeof searchParams?.error === "string" ? searchParams.error : "";
  const requestedEmail =
    typeof searchParams?.email === "string" ? searchParams.email : "";
  const {
    data: { user },
  } = await supabaseServer().auth.getUser();
  const email = user?.email || requestedEmail;

  return (
    <main className="min-h-screen">
      <header className="mx-auto max-w-6xl px-6 pb-6 pt-10">
        <div className="flex items-center justify-between gap-4">
          <Link href="/board" className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-black/40 ring-1 ring-white/10 shadow-[0_0_40px_rgba(255,0,180,0.25)]" />
            <div>
              <div className="text-sm opacity-70">JAB Visions™</div>
              <div className="text-lg font-semibold tracking-tight">Board</div>
            </div>
          </Link>

          <Link className="text-sm opacity-80 hover:opacity-100" href="/board/login">
            Login
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-xl px-6 pb-14 pt-4">
        <div className="rounded-3xl border border-white/10 bg-black/30 p-8 shadow-[0_0_80px_rgba(0,200,255,0.08)]">
          <RecoveryLinkHandler />
          <h1 className="text-3xl font-semibold tracking-tight">Reset password</h1>
          <p className="mt-2 text-sm opacity-80">
            {user
              ? "Choose and confirm a new password for your Board account."
              : "Enter your Board email to receive the secure link that unlocks password reset."}
          </p>

          {success ? (
            <div className="mt-6 grid gap-4">
              <div className="rounded-2xl border border-green-200/20 bg-black/40 p-4 text-sm text-green-200">
                {success}
              </div>
              <Link
                className="rounded-2xl bg-white px-5 py-3 text-center text-sm font-semibold text-black hover:opacity-95"
                href="/board/login"
              >
                Return to login
              </Link>
            </div>
          ) : !user ? (
            <form
              className="mt-6 grid gap-4"
              action="/api/board/auth/reset-password"
              method="post"
            >
              <input type="hidden" name="returnTo" value="/board/reset-password" />
              <div className="grid gap-2">
                <label className="text-xs opacity-70" htmlFor="recovery-email">
                  Email
                </label>
                <input
                  id="recovery-email"
                  name="email"
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/20"
                  type="email"
                  defaultValue={email}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>

              {error ? (
                <div className="rounded-2xl border border-red-200/20 bg-black/40 p-4 text-sm text-red-200">
                  {error}
                </div>
              ) : null}

              {sent ? (
                <div className="rounded-2xl border border-green-200/20 bg-black/40 p-4 text-sm text-green-200">
                  {sent}
                </div>
              ) : null}

              <button
                className="mt-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black hover:opacity-95"
                type="submit"
              >
                Send reset link
              </button>

              <p className="text-center text-xs opacity-60">
                Open the link in the email on this browser, then this page will
                let you choose the new password.
              </p>
            </form>
          ) : (
            <form
              className="mt-6 grid gap-4"
              action="/api/board/auth/update-password"
              method="post"
            >
              <div className="grid gap-2">
                <label className="text-xs opacity-70" htmlFor="reset-email">
                  Email
                </label>
                <input
                  id="reset-email"
                  name="email"
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/20"
                  type="email"
                  defaultValue={email}
                  placeholder="you@example.com"
                  autoComplete="email"
                  readOnly
                  required
                />
              </div>

              <div className="grid gap-2">
                <label className="text-xs opacity-70" htmlFor="new-password">
                  New password
                </label>
                <input
                  id="new-password"
                  name="password"
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/20"
                  type="password"
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>

              <div className="grid gap-2">
                <label className="text-xs opacity-70" htmlFor="confirm-password">
                  Confirm new password
                </label>
                <input
                  id="confirm-password"
                  name="confirmPassword"
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/20"
                  type="password"
                  placeholder="Enter the same password again"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>

              {error ? (
                <div className="rounded-2xl border border-red-200/20 bg-black/40 p-4 text-sm text-red-200">
                  {error}
                </div>
              ) : null}

              <button
                className="mt-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black hover:opacity-95"
                type="submit"
              >
                Update password
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
