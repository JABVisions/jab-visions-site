// File: /app/board/page.tsx
import Link from "next/link";
import GlitchReportButton from "@/app/components/board/GlitchReportButton";

export const metadata = {
  title: "Board | JAB Visions™",
  description: "JAB Visions™ Board. Drops, connections, and creation in one place.",
};

export default function BoardWelcomePage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const locked = String(searchParams?.locked ?? "") === "1";

  return (
    <main className="min-h-screen">
      <header className="mx-auto max-w-6xl px-6 pt-10 pb-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-[18px] border border-black/10 bg-white/70 shadow-[0_0_40px_rgba(255,0,180,0.10)] ring-1 ring-white/60">
              <img
                src="/assets/board-welcome-mark.jpg"
                alt="Board logo"
                className="h-full w-full object-cover object-center scale-[1.08]"
              />
            </div>
            <div>
              <div className="text-sm opacity-70 text-black/70">JAB Visions™</div>
              <div className="text-lg font-semibold tracking-tight text-black/80">
                Board
              </div>
            </div>
          </div>

          <nav className="flex items-center gap-4 text-sm">
            <Link className="opacity-80 hover:opacity-100 text-black/70" href="/terms">
              Terms
            </Link>
            <Link className="opacity-80 hover:opacity-100 text-black/70" href="/privacy">
              Privacy
            </Link>
            <Link
              className="opacity-80 hover:opacity-100 text-black/70"
              href="/guidelines"
            >
              Guidelines
            </Link>
            <GlitchReportButton compact />
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-14 pt-4">
        <div className="board-rim">
          <div className="board-tile p-8">
            <div className="grid gap-8 md:grid-cols-2 md:items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/50 px-3 py-1 text-xs text-black/70">
                  <span className="h-2 w-2 rounded-full bg-black/40" />
                  Web Beta
                </div>

                <h1 className="mt-4 text-4xl font-semibold tracking-tight text-black/85 md:text-5xl">
                  Drop anything.
                  <span className="block opacity-80">Build your world.</span>
                </h1>

                <p className="mt-4 max-w-xl text-sm leading-6 text-black/70">
                  Board is a living workspace for people, projects, and culture.
                  Create Drops, message privately, and support creators with Pay Drops.
                </p>

                {locked && (
                  <div className="mt-6 rounded-2xl border border-black/10 bg-white/60 p-4">
                    <div className="text-sm font-semibold text-black/80">
                      Board is currently closed to the public.
                    </div>
                    <div className="mt-1 text-xs text-black/65">
                      This build is deployed for internal testing. If you’re invited to playtest,
                      you’ll receive access instructions.
                    </div>
                  </div>
                )}

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Link href="/board/signup" className="board-btn-primary">
                    Create account
                  </Link>
                  <Link href="/board/login" className="board-btn-ghost">
                    Log in
                  </Link>
                </div>

                <div className="mt-5 rounded-2xl border border-black/10 bg-white/60 p-4 shadow-[0_0_24px_rgba(204,255,64,0.12)]">
                  <div className="text-sm font-semibold text-black/80">New to Board?</div>
                  <p className="mt-1 text-xs leading-5 text-black/65">
                    Start here for the JAB Visions cast & crew onboarding guide.
                  </p>
                  <Link
                    href="/board/onboarding"
                    className="mt-3 inline-flex rounded-full border border-black/10 bg-white/75 px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-[#ff28c9] shadow-[0_0_18px_rgba(255,40,201,0.10)]"
                  >
                    Open Onboarding
                  </Link>
                </div>

                <p className="mt-4 text-xs text-black/60">
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

              <div className="grid gap-3">
                <FeatureCard title="Drops" desc="Post text, images, video, audio, docs, and links." />
                <FeatureCard title="DMs" desc="Private messages and sharing for real connection." />
                <FeatureCard title="Pay Drops" desc="Tip creators. Support the people you vibe with." />
                <FeatureCard title="Store Drops" desc="Link out to products and merch without selling platform features." />
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 pb-10">
        <div className="flex flex-col gap-3 border-t border-black/10 pt-6 text-xs text-black/60 md:flex-row md:items-center md:justify-between">
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

function FeatureCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white/60 p-5">
      <div className="text-sm font-semibold text-black/80">{title}</div>
      <div className="mt-1 text-xs leading-5 text-black/65">{desc}</div>
    </div>
  );
}
