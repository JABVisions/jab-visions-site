import Link from "next/link";

export default function BoardResetPasswordPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const email = typeof searchParams?.email === "string" ? searchParams.email : "";
  const updated =
    typeof searchParams?.updated === "string" ? searchParams.updated : "";
  const error = typeof searchParams?.error === "string" ? searchParams.error : "";

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
          <h1 className="text-3xl font-semibold tracking-tight">Reset password</h1>
          <p className="mt-2 text-sm opacity-80">
            Verify your current password, then choose a new one. No email link is
            needed.
          </p>

          {updated ? (
            <div className="mt-6 grid gap-4">
              <div className="rounded-2xl border border-green-200/20 bg-black/40 p-4 text-sm text-green-200">
                {updated}
              </div>
              <Link
                className="rounded-2xl bg-white px-5 py-3 text-center text-sm font-semibold text-black hover:opacity-95"
                href="/board/login"
              >
                Return to login
              </Link>
            </div>
          ) : (
            <form
              className="mt-6 grid gap-4"
              action="/api/board/auth/reset-password-direct"
              method="post"
            >
              <div className="grid gap-2">
                <label className="text-xs opacity-70" htmlFor="reset-email">
                  Board email
                </label>
                <input
                  id="reset-email"
                  name="email"
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/20"
                  type="email"
                  defaultValue={email}
                  placeholder="you@example.com"
                  autoComplete="username"
                  required
                />
              </div>

              <div className="grid gap-2">
                <label className="text-xs opacity-70" htmlFor="current-password">
                  Current password
                </label>
                <input
                  id="current-password"
                  name="currentPassword"
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/20"
                  type="password"
                  autoComplete="current-password"
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
                <div className="rounded-2xl border border-red-200/20 bg-black/40 p-4 text-sm text-red-200" role="alert">
                  {error}
                </div>
              ) : null}

              <button
                className="mt-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black hover:opacity-95"
                type="submit"
              >
                Update password
              </button>

              <p className="text-center text-xs opacity-60">
                You need your current password to verify this change. If you
                can’t sign in, contact Board support for help.
              </p>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
