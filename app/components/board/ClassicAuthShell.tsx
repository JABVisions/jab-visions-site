import Link from "next/link";

export default function ClassicAuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen board-classic-bg">
      {/* Top bar */}
      <header className="mx-auto max-w-6xl px-6 pt-8 pb-6">
        <div className="flex items-center justify-between gap-4">
          <Link href="/board" className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-black/10 shadow-[0_0_0_2px_rgba(255,255,255,0.7)_inset]" />
            <div className="leading-tight">
              <div className="text-xs tracking-[0.22em] text-black/60">JAB VISIONS</div>
              <div className="text-sm font-semibold text-black/80">Board</div>
            </div>
          </Link>

          <nav className="flex items-center gap-3 text-xs text-black/60">
            <Link className="hover:text-black/80" href="/terms">Terms</Link>
            <Link className="hover:text-black/80" href="/privacy">Privacy</Link>
            <Link className="hover:text-black/80" href="/guidelines">Guidelines</Link>
          </nav>
        </div>
      </header>

      {/* Center tile */}
      <section className="mx-auto max-w-xl px-6 pb-14">
        <div className="board-rim">
          <div className="board-tile p-8">
            <div className="flex items-center gap-2">
              <span className="board-chip">Classic</span>
              <span className="board-chip">Web Beta</span>
            </div>

            <h1 className="mt-4 text-3xl font-semibold board-h">{title}</h1>
            {subtitle ? <p className="mt-2 text-sm board-sub">{subtitle}</p> : null}

            <div className="mt-6">{children}</div>

            <p className="mt-6 text-[12px] text-black/55">
              13+ only. By continuing you agree to our{" "}
              <Link className="underline hover:text-black/75" href="/terms" target="_blank">Terms</Link>,{" "}
              <Link className="underline hover:text-black/75" href="/privacy" target="_blank">Privacy Policy</Link>, and{" "}
              <Link className="underline hover:text-black/75" href="/guidelines" target="_blank">Community Guidelines</Link>.
            </p>
          </div>
        </div>
      </section>

      {/* Bottom links */}
      <footer className="mx-auto max-w-6xl px-6 pb-10 text-xs text-black/55">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>© {new Date().getFullYear()} JAB Visions LLC</div>
          <div className="flex flex-wrap gap-4">
            <Link className="underline hover:text-black/75" href="/terms">Terms</Link>
            <Link className="underline hover:text-black/75" href="/privacy">Privacy</Link>
            <Link className="underline hover:text-black/75" href="/guidelines">Guidelines</Link>
            <Link className="underline hover:text-black/75" href="/support">Support</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
