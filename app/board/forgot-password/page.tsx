import Link from "next/link";

export default function BoardForgotPasswordPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const email = typeof searchParams?.email === "string" ? searchParams.email : "";
  const success = typeof searchParams?.sent === "string" ? searchParams.sent : "";
  const error = typeof searchParams?.error === "string" ? searchParams.error : "";

  return (
    <main className="min-h-screen">
      <header className="mx-auto max-w-6xl px-6 pb-6 pt-10">
        <Link href="/board" className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-black/40 ring-1 ring-white/10 shadow-[0_0_40px_rgba(255,0,180,0.25)]" />
          <div>
            <div className="text-sm opacity-70">JAB Visions™</div>
            <div className="text-lg font-semibold tracking-tight">Board</div>
          </div>
        </Link>
      </header>

      <section className="mx-auto max-w-xl px-6 pb-14 pt-4">
        <div className="rounded-3xl border border-white/10 bg-black/30 p-8 shadow-[0_0_80px_rgba(0,200,255,0.08)]">
          <h1 className="text-3xl font-semibold tracking-tight">Forgot password</h1>
          <p className="mt-2 text-sm opacity-80">
            Enter your Board email and we’ll send you a password reset link.
          </p>

          <form
            className="mt-6 grid gap-4"
            action="/api/board/auth/reset-password"
            method="post"
          >
            <input type="hidden" name="returnTo" value="/board/forgot-password" />
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
                required
              />
            </div>

            {error ? (
              <div className="rounded-2xl border border-red-200/20 bg-black/40 p-4 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="rounded-2xl border border-green-200/20 bg-black/40 p-4 text-sm text-green-200">
                {success}
              </div>
            ) : null}

            <button
              className="mt-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black hover:opacity-95"
              type="submit"
            >
              Send reset link
            </button>

            <p className="text-center text-xs opacity-60">
              Send once, then check your inbox and spam folder. Repeated requests
              can trigger the email cooldown.
            </p>

            <Link
              className="rounded-2xl border border-white/15 px-5 py-3 text-center text-sm font-semibold hover:bg-white/5"
              href="/board/reset-password"
            >
              Go to reset password
            </Link>

            <Link className="text-center text-xs underline opacity-75" href="/board/login">
              Back to login
            </Link>
          </form>
        </div>
      </section>
    </main>
  );
}
