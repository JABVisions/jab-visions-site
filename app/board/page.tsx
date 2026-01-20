import Link from "next/link";

export const metadata = {
  title: "Board | JAB Visions™",
  description: "JAB Visions™ Board. Drops, connections, and creation in one place.",
};

export default function BoardWelcomePage() {
  return (
    <main className="min-h-screen">
      {/* Top glow header */}
      <header className="mx-auto max-w-6xl px-6 pt-10 pb-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-black/40 ring-1 ring-white/10 shadow-[0_0_40px_rgba(255,0,180,0.25)]" />
            <div>
              <div className="text-sm opacity-70">JAB Visions™</div>
              <div className="text-lg font-semibold tracking-tight">Board</div>
            </div>
          </div>

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

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-14 pt-4">
        <div className="rounded-3xl border border-white/10 bg-black/30 p-8 shadow-[0_0_80px_rgba(0,200,255,0.08)]">
          <div className="grid gap-8 md:grid-cols-2 md:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs opacity-90">
                <span className="h-2 w-2 rounded-full bg-white/70" />
                Web Beta
              </div>

              <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
                Drop anything.
                <span className="block opacity-80">Build your world.</span>
              </h1>

              <p className="mt-4 max-w-xl text-sm leading-6 opacity-80">
                Board is a living workspace for people, projects, and culture.
                Create Drops, message privately, and support creators with Pay Drops.
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link
                  href="/board/signup"
                  className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black hover:opacity-95"
                >
                  Create account
                </Link>
                <Link
                  href="/board/login"
                  className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold hover:bg-white/10"
                >
                  Log in
                </Link>
              </div>

              <p className="mt-4 text-xs opacity-70">
                13+ only. By continuing you agree to our{" "}
                <Link className="underline" href="/terms">
                  Terms
                </Link>{" "}
                and{" "}
                <Link className="underline" href="/privacy">
                  Privacy Policy
                </Link>
                .
              </p>
            </div>

            {/* Feature tiles */}
            <div className="grid gap-3">
              <FeatureCard
                title="Drops"
                desc="Post text, images, video, audio, docs, and links."
                glow="shadow-[0_0_60px_rgba(255,0,180,0.18)]"
              />
              <FeatureCard
                title="DMs"
                desc="Private messages and sharing for real connection."
                glow="shadow-[0_0_60px_rgba(0,200,255,0.14)]"
              />
              <FeatureCard
                title="Pay Drops"
                desc="Tip creators. Support the people you vibe with."
                glow="shadow-[0_0_60px_rgba(0,255,170,0.12)]"
              />
              <FeatureCard
                title="Store Drops"
                desc="Link out to products and merch without selling platform features."
                glow="shadow-[0_0_60px_rgba(255,240,0,0.10)]"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mx-auto max-w-6xl px-6 pb-10">
        <div className="flex flex-col gap-3 border-t border-white/10 pt-6 text-xs opacity-70 md:flex-row md:items-center md:justify-between">
          <div>© {new Date().getFullYear()} JAB Visions LLC. All rights reserved.</div>
          <div className="flex flex-wrap gap-4">
            <Link className="hover:opacity-100" href="/terms">
              Terms
            </Link>
            <Link className="hover:opacity-100" href="/privacy">
              Privacy
            </Link>
            <Link className="hover:opacity-100" href="/guidelines">
              Guidelines
            </Link>
            <Link className="hover:opacity-100" href="/support">
              Support
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({
  title,
  desc,
  glow,
}: {
  title: string;
  desc: string;
  glow?: string;
}) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-black/30 p-5 ${glow ?? ""}`}>
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1 text-xs leading-5 opacity-75">{desc}</div>
    </div>
  );
}
