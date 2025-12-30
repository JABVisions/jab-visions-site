import Link from "next/link";

export default function BoardSignupPage() {
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
              />
            </label>

            <button
              type="button"
              className="w-full rounded-2xl bg-[#FFF1A8] px-5 py-3 text-sm font-medium
                         text-[rgba(255,0,190,0.92)]
                         border border-black/10
                         shadow-[0_0_22px_rgba(255,0,190,0.18)]
                         transition hover:translate-y-[-1px] hover:shadow-[0_0_32px_rgba(255,0,190,0.26)]"
            >
              Create Account
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
          (This is the visual shell. We’ll wire real signup next.)
        </p>
      </div>
    </main>
  );
}
