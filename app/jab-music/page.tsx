"use client";

import Navbar from "@/app/components/Navbar";
import Link from "next/link";

export default function JabMusicPage() {
  return (
    <>
      <Navbar />

      <main className="min-h-screen relative overflow-hidden text-white">
        {/* DEEP PURPLE "TOY AISLE" BACKGROUND */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#12002a] via-[#1a0040] to-[#0b001a]" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.9) 1px, transparent 0)",
            backgroundSize: "26px 26px",
          }}
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(800px_420px_at_20%_15%,rgba(255,0,200,0.28),transparent_60%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_520px_at_80%_25%,rgba(255,72,180,0.22),transparent_60%)]" />

        <div className="relative max-w-6xl mx-auto px-4 pt-28 pb-24">
          {/* HEADER */}
          <header className="mb-14">
            <p className="text-sm md:text-base tracking-[0.25em] uppercase text-white/70 mb-4">
              JAB VISIONS • MUSIC
            </p>

            {/* NEW TITLE STYLE */}
            <div className="inline-flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-[#ff00c8] shadow-[0_10px_30px_rgba(255,0,200,0.35)] grid place-items-center">
                <span className="text-2xl font-black">♫</span>
              </div>

              <div>
                <h1 className="text-5xl md:text-6xl font-black tracking-tight leading-none">
                  JAB Music
                </h1>
                <p className="mt-2 text-lg md:text-xl text-white/80 max-w-3xl">
                  Your library for John Andy releases, remasters, and future drops.
                  A place that feels like opening something new.
                </p>
              </div>
            </div>

            {/* YOUTUBE-STYLE TABS */}
            <div className="mt-8 flex flex-wrap gap-3">
              <Tab href="#vault" label="Vault" active />
              <Tab href="#about" label="Artist" />
              <Tab href="#reworks" label="Remasters" />
              <Link href="/join-us" className="tab-magenta">
                Collab
              </Link>
              <Link href="/board/work" className="tab-purple">
                Board / Work
              </Link>
            </div>
          </header>

          {/* VAULT */}
          <section id="vault" className="mb-20">
            <SectionTitle
              title="The Vault"
              subtitle="Everything in one place. No hunting. No scrolling through old links."
            />

            <div className="mt-8 grid gap-8 md:grid-cols-2">
              <MagentaTile
                title="Spidey"
                meta="First recording • with CyBando"
                desc="The origin entry. Built with your brother Cyrus (CyBando). Raw and alive."
              >
                <iframe
                  src="https://open.spotify.com/embed/track/40a973TDkUWWlz0DzvFUkl?utm_source=generator"
                  width="100%"
                  height="170"
                  loading="lazy"
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  className="rounded-xl border border-white/15"
                />
              </MagentaTile>

              <MagentaTile
                title="bAbY"
                meta="Released 2022"
                desc="Melodic and vulnerable. A late-night record with clean edges."
              >
                <iframe
                  src="https://open.spotify.com/embed/track/1Tp7paiXQKYW4HJa8wVF5r?utm_source=generator"
                  width="100%"
                  height="170"
                  loading="lazy"
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  className="rounded-xl border border-white/15"
                />
              </MagentaTile>
            </div>
          </section>

          {/* ABOUT */}
          <section id="about" className="mb-20">
            <SectionTitle
              title="Artist File"
              subtitle="A quick backstory and the sound you can expect from John Andy."
            />

            <div className="mt-8 grid gap-8 md:grid-cols-[1.35fr_0.65fr]">
              <MagentaTile>
                <p className="text-lg leading-relaxed text-white/95">
                  John Andy makes music like a worldbuilder.
                  Each song feels like a scene: emotion first, then design.
                </p>

                <p className="mt-5 text-lg leading-relaxed text-white/90">
                  The first track, <strong>Spidey</strong>, was recorded with his brother
                  Cyrus, who produces under the name <strong>CyBando</strong>.
                  That collaboration set the foundation: family-made sound, experimental
                  energy, and melodies that feel cinematic without needing a huge production budget.
                </p>

                <p className="mt-5 text-lg leading-relaxed text-white/90">
                  Then came <strong>$eN$E</strong> and <strong>bAbY</strong> (2021–2022),
                  sharpening the identity into emotional rap blended with melodic pop and
                  atmospheric textures. It’s intimate, dramatic, and a little rebellious.
                  Not “radio clean,” but clean enough to live forever.
                </p>

                <p className="mt-5 text-lg leading-relaxed text-white/90">
                  This page is the home base, but it’s also a gateway:
                  the next step is letting users upload their own music to their
                  <strong> Board Profiles</strong> so the community becomes a living library.
                </p>

                <div className="mt-7 flex flex-wrap gap-3">
                  <Link href="/join-us" className="tab-magenta">
                    Collab with John Andy
                  </Link>
                  <Link href="/board/profile" className="tab-purple">
                    Go to Board Profile
                  </Link>
                </div>
              </MagentaTile>

              <MagentaTile>
                <h3 className="text-base uppercase tracking-[0.25em] text-white/90">
                  Sound Profile
                </h3>

                <ul className="mt-5 space-y-3 text-lg text-white/95">
                  <li>
                    <strong>Mood:</strong> nocturnal, cinematic, intimate
                  </li>
                  <li>
                    <strong>Energy:</strong> emotional rap + melodic pop
                  </li>
                  <li>
                    <strong>Texture:</strong> glossy hooks over shadowy layers
                  </li>
                  <li>
                    <strong>Best Played:</strong> edits, late nights, headphones
                  </li>
                </ul>
              </MagentaTile>
            </div>
          </section>

          {/* REMASTERS */}
          <section id="reworks" className="mb-8">
            <SectionTitle
              title="Remasters"
              subtitle="Preserving the soul, cleaning the signal."
            />

            <div className="mt-8">
              <MagentaTile
                title="$eN$E (Remaster in Progress)"
                meta="2021 → rebuilding clarity + harmony"
                desc="John is remastering Sense into something more clear and harmonious. Updates land here first."
              >
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link href="/join-us" className="tab-magenta">
                    Submit a collab
                  </Link>
                  <Link href="/board/work" className="tab-purple">
                    Explore Board / Work
                  </Link>
                </div>
              </MagentaTile>
            </div>
          </section>
        </div>
      </main>

      {/* GLOBAL STYLES FOR TABS */}
      <style jsx global>{`
        .tab-magenta {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.7rem 1.2rem;
          border-radius: 999px;
          background: #ff00c8;
          color: white;
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          transition: transform 0.15s ease, filter 0.15s ease;
        }
        .tab-magenta:hover {
          transform: translateY(-1px);
          filter: brightness(1.05);
        }

        .tab-purple {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.7rem 1.2rem;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.12);
          border: 1px solid rgba(255, 255, 255, 0.22);
          color: white;
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          transition: transform 0.15s ease, background 0.15s ease;
        }
        .tab-purple:hover {
          transform: translateY(-1px);
          background: rgba(255, 255, 255, 0.16);
        }
      `}</style>
    </>
  );
}

/* ---------- COMPONENTS ---------- */

function Tab({
  href,
  label,
  active = false,
}: {
  href: string;
  label: string;
  active?: boolean;
}) {
  return (
    <a
      href={href}
      className={
        active
          ? "tab-magenta"
          : "tab-purple"
      }
    >
      {label}
    </a>
  );
}

function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div>
      <h2 className="text-3xl md:text-4xl font-extrabold">{title}</h2>
      {subtitle && (
        <p className="mt-3 text-lg md:text-xl text-white/75 max-w-3xl">
          {subtitle}
        </p>
      )}
    </div>
  );
}

function MagentaTile({
  title,
  meta,
  desc,
  children,
}: {
  title?: string;
  meta?: string;
  desc?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl bg-[#ff00c8] p-7 md:p-8 border border-white/20 shadow-[0_18px_55px_rgba(255,0,200,0.18)]">
      {title && <h3 className="text-2xl md:text-3xl font-black">{title}</h3>}
      {meta && <p className="mt-2 text-base text-white/85">{meta}</p>}
      {desc && <p className="mt-4 text-lg text-white/95">{desc}</p>}
      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}
