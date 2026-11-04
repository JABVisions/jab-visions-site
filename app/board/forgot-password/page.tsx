import Link from "next/link";

export default function BoardForgotPasswordPage() {
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
          <h1 className="text-3xl font-semibold tracking-tight">Password help</h1>
          <p className="mt-2 text-sm opacity-80">
            Email reset links aren’t available right now. If you know your
            current password, you can verify it and choose a new one here.
          </p>

          <div className="mt-6 grid gap-4">
            <Link
              className="rounded-2xl bg-white px-5 py-3 text-center text-sm font-semibold text-black hover:opacity-95"
              href="/board/reset-password"
            >
              Reset password
            </Link>
            <p className="text-center text-xs opacity-60">
              If you can’t sign in with your current password, contact Board
              support for help.
            </p>
            <Link className="text-center text-xs underline opacity-75" href="/board/login">
              Back to login
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
