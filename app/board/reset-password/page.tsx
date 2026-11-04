import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function BoardResetPasswordPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const email = typeof searchParams?.email === "string" ? searchParams.email : "";
  const requestedStep =
    typeof searchParams?.step === "string" ? searchParams.step : "";
  const sent = typeof searchParams?.sent === "string" ? searchParams.sent : "";
  const updated =
    typeof searchParams?.updated === "string" ? searchParams.updated : "";
  const error = typeof searchParams?.error === "string" ? searchParams.error : "";
  const {
    data: { user },
  } = await supabaseServer().auth.getUser();
  const step =
    requestedStep === "code" && !user
      ? "code"
      : requestedStep === "password" && user
        ? "password"
        : user
          ? "password"
          : "email";
  const accountEmail = user?.email || email;

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
            {step === "email"
              ? "Enter your Board email and we’ll send a verification code."
              : step === "code"
                ? `Enter the code sent to ${email}. Then you can choose a new password.`
                : "Choose a new password for your Board account."}
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
          ) : step === "email" ? (
            <form
              className="mt-6 grid gap-4"
              action="/api/board/auth/reset-password-code"
              method="post"
            >
              <input type="hidden" name="action" value="send" />
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
                  autoComplete="email"
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
                Send verification code
              </button>
            </form>
          ) : step === "code" ? (
            <form
              className="mt-6 grid gap-4"
              action="/api/board/auth/reset-password-code"
              method="post"
            >
              <input type="hidden" name="action" value="verify" />
              <input type="hidden" name="email" value={email} />
              {sent ? (
                <div className="rounded-2xl border border-green-200/20 bg-black/40 p-4 text-sm text-green-200">
                  {sent}
                </div>
              ) : null}
              <div className="grid gap-2">
                <label className="text-xs opacity-70" htmlFor="reset-code">
                  Verification code
                </label>
                <input
                  id="reset-code"
                  name="token"
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm tracking-[0.3em] outline-none focus:border-white/20"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6-digit code"
                  minLength={6}
                  maxLength={6}
                  pattern="[0-9]{6}"
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
                Verify code
              </button>

              <Link
                className="text-center text-xs underline opacity-75"
                href={`/board/reset-password?email=${encodeURIComponent(email)}`}
              >
                Use a different email
              </Link>
            </form>
          ) : (
            <form
              className="mt-6 grid gap-4"
              action="/api/board/auth/update-password"
              method="post"
            >
              <input type="hidden" name="email" value={accountEmail} />
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
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
