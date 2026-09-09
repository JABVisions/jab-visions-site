"use client";

import Image from "next/image";
import Link from "next/link";

const STORE_URL = "https://store.jabvisions.com";

const timeline = [
  {
    date: "Age 7",
    title: "The first worlds",
    body: "Handmade comics, original characters, and the first sparks of a universe shared with classmates.",
  },
  {
    date: "Teen years",
    title: "Just John Andy",
    body: "The vision moved online through Sitey and Tumblr, becoming an early home for stories, identity, and experimentation.",
  },
  {
    date: "2015",
    title: "John Andy Books",
    body: "Fatal Stars and Hopelessly Infinite gave the growing mythology a literary home and a name.",
  },
  {
    date: "2021–2022",
    title: "The universe takes shape",
    body: "Fatal Stars expanded, screen ideas grew, and JAB's geometric crown and color score began forming a visual language.",
  },
  {
    date: "Year One",
    title: "JAB Visions LLC",
    body: "The lifelong creative universe became an official company built to hold films, comics, artifacts, digital spaces, and community.",
  },
];

const origins = [
  {
    label: "Foundational Mythology",
    title: "Fatal Stars",
    body: "Foundational literary and comic mythology from the John Andy Books era, carrying some of the earliest major worlds in the JAB archive.",
    accent: "#d5ff00",
  },
  {
    label: "Fictional Memoir",
    title: "Hopelessly Infinite",
    body: "A personal, romantic exploration of memory, identity, past lives, and reincarnation.",
    accent: "#ff63d8",
  },
  {
    label: "Flagship Film",
    title: "Those Ryderz",
    body: "The cinematic project now leading JAB Visions into its next era of spiritual mythology, chosen youth, resistance, and transformation.",
    accent: "#7ce8ff",
  },
];

const pillars = [
  {
    signal: "01 / SCREEN",
    title: "Those Ryderz",
    body: "The flagship film and pitch-deck project introducing a new cinematic mythology of chosen youth, divine power, sin, resistance, and transformation.",
    href: "/those-ryderz",
    cta: "Enter the film",
  },
  {
    signal: "02 / ARCHIVE",
    title: "Fatal Stars",
    body: "A foundational mythology from the John Andy Books archive and one of the earliest major worlds in the JAB creative universe.",
  },
  {
    signal: "03 / INFRASTRUCTURE",
    title: "Board",
    body: "A developing digital community and workspace for creatives, actors, crew, collaborators, drops, and future production opportunities.",
    href: "/board/preview",
    cta: "Preview Board",
  },
  {
    signal: "04 / ARTIFACTS",
    title: "JAB Visions Store",
    body: "The merchandise and artifact branch turning the visual identity and worlds of JAB Visions into wearable and collectible pieces.",
    href: STORE_URL,
    cta: "Visit the store",
    external: true,
  },
];

export default function JohnAndyPage() {
  return (
    <main className="founder-page">
      <div className="founder-grid" aria-hidden="true" />
      <div className="founder-scanlines" aria-hidden="true" />

      <div className="founder-shell">
        <section className="founder-hero">
          <div className="hero-copy">
            <p className="eyebrow">JAB VISIONS / ORIGIN SIGNAL</p>
            <h1>
              JAB <span>Founder</span>
            </h1>
            <p className="hero-subtitle">
              John Andy is the founder, writer, director, and worldbuilder
              behind JAB Visions: a creative universe company built from
              childhood comics, faith, film, digital worlds, and original
              mythology.
            </p>

            <div className="hero-actions">
              <Link href="/those-ryderz">Explore Those Ryderz</Link>
              <Link href="/board/preview" className="secondary">
                Enter Board
              </Link>
              <a href={STORE_URL} target="_blank" rel="noopener noreferrer" className="secondary">
                Visit Store
              </a>
              <Link href="/jab-lit" className="secondary">
                Explore JAB Lit
              </Link>
            </div>

            <div className="hero-readout" aria-label="Founder roles">
              <span>Founder</span>
              <span>Writer</span>
              <span>Director</span>
              <span>Worldbuilder</span>
            </div>
          </div>

          <div className="founder-portrait-wrap">
            <div className="portrait-signal">FOUNDER PROFILE / ACTIVE</div>
            <div className="founder-portrait">
              <Image
                src="/assets/john-andy-headshot.jpeg"
                alt="John Andy, founder of JAB Visions"
                width={720}
                height={960}
                priority
              />
              <div className="portrait-overlay">
                <strong>John Andy</strong>
                <span>Founder / Writer / Director</span>
                <span>JAB Visions LLC</span>
              </div>
            </div>
          </div>
        </section>

        <section className="founder-panel archive-panel">
          <header className="section-heading">
            <p>Archive 001</p>
            <h2>The Vision Before the Company</h2>
          </header>
          <div className="archive-intro">
            <p>
              JAB Visions began long before it became an LLC. It began with a
              child making comic books, creating characters, and showing
              classmates the first sparks of a universe that would keep
              expanding for years.
            </p>
            <p>
              Before the company had a formal structure, the vision moved
              through different names and forms: Just John Andy, John Andy
              Books, JAB, JAB Merch, and finally JAB Visions.
            </p>
          </div>
          <ol className="timeline">
            {timeline.map((item) => (
              <li key={item.date}>
                <span className="timeline-dot" />
                <small>{item.date}</small>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="founder-panel">
          <header className="section-heading">
            <p>Archive 002</p>
            <h2>From Stories to Worlds</h2>
          </header>
          <p className="section-lead">
            Early projects like Fatal Stars and Hopelessly Infinite helped
            shape the emotional, spiritual, and mythological foundation of JAB
            Visions. What began as books, drawings, characters, and
            animated-show ideas eventually grew into a larger creative universe
            spanning film, comics, digital platforms, merchandise, and
            community.
          </p>
          <div className="origin-grid">
            {origins.map((project) => (
              <article
                className="origin-card"
                key={project.title}
                style={{ "--origin-accent": project.accent } as React.CSSProperties}
              >
                <span>{project.label}</span>
                <h3>{project.title}</h3>
                <p>{project.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="split-section">
          <article className="founder-panel spiritual-panel">
            <header className="section-heading">
              <p>Core Signal</p>
              <h2>The Spiritual Core</h2>
            </header>
            <p>
              JAB Visions is rooted in imagination, survival, faith, and
              transformation. After a difficult season, John Andy&apos;s
              creative mission became deeply connected to God, purpose, and
              the belief that stories can help people encounter identity,
              meaning, and divine presence in new ways.
            </p>
            <blockquote>
              Stories can become places where people recognize themselves,
              their purpose, and the possibility of transformation.
            </blockquote>
          </article>

          <article className="founder-panel era-panel">
            <header className="section-heading">
              <p>Visual Language</p>
              <h2>The JAB Visions Era</h2>
            </header>
            <p>
              What began as John Andy Books eventually evolved into JAB, then
              JAB Merch, and finally JAB Visions. At one point, the brand
              seemed like it might become a T-shirt company built around
              original characters. But the vision was always larger than
              merchandise.
            </p>
            <p>
              JAB Visions became the structure for a full creative universe:
              films, comics, digital spaces, brand artifacts, and original
              mythology.
            </p>
            <div className="color-score" aria-label="JAB Visions color score">
              <span className="yellow" />
              <span className="green" />
              <span className="fuchsia" />
              <strong>Yellow / Green / Fuchsia / Crown Signal</strong>
            </div>
          </article>
        </section>

        <section className="founder-panel">
          <header className="section-heading">
            <p>Company Map</p>
            <h2>The Current Universe</h2>
          </header>
          <div className="pillar-grid">
            {pillars.map((pillar) => (
              <article className="pillar-card" key={pillar.title}>
                <span>{pillar.signal}</span>
                <h3>{pillar.title}</h3>
                <p>{pillar.body}</p>
                {pillar.href &&
                  (pillar.external ? (
                    <a href={pillar.href} target="_blank" rel="noopener noreferrer">
                      {pillar.cta}
                    </a>
                  ) : (
                    <Link href={pillar.href}>{pillar.cta}</Link>
                  ))}
              </article>
            ))}
          </div>
        </section>

        <section className="year-one">
          <div>
            <p>Milestone Signal / 001</p>
            <h2>JAB Visions: Year One</h2>
            <span>
              The first year of JAB Visions LLC was not perfect, but it was
              proof. Proof that the vision could leave the imagination and
              become a real company, a real platform, a real production path,
              and a growing creative universe.
            </span>
          </div>
          <strong>The vision became real. Now the universe begins to move.</strong>
        </section>

        <section className="founder-note">
          <p className="eyebrow">A Note from the Founder</p>
          <blockquote>
            JAB Visions is more than a business to me. It is the structure
            around a lifelong creative universe. It carries the child who made
            comic books, the teenager who wrote under Just John Andy, the
            author behind John Andy Books, and the filmmaker building Those
            Ryderz today.
            <br />
            <br />
            The first year of owning this company has been imperfect,
            emotional, and transformative. But it has also been proof that the
            vision is alive, growing, and ready for its next chapter.
          </blockquote>
          <div className="signature">
            <strong>John Andy</strong>
            <span>Founder / Writer / Director</span>
            <span>JAB Visions LLC</span>
          </div>
        </section>
      </div>

      <style jsx global>{`
        .founder-page {
          position: relative;
          min-height: 100vh;
          overflow: hidden;
          background:
            radial-gradient(circle at 12% 12%, rgba(213, 255, 0, 0.12), transparent 30%),
            radial-gradient(circle at 88% 28%, rgba(255, 0, 200, 0.1), transparent 28%),
            radial-gradient(circle at 52% 86%, rgba(0, 255, 123, 0.08), transparent 36%),
            #020403;
          color: rgba(244, 255, 247, 0.9);
        }

        .founder-grid,
        .founder-scanlines {
          position: fixed;
          inset: 0;
          pointer-events: none;
        }

        .founder-grid {
          opacity: 0.2;
          background-image:
            linear-gradient(rgba(117, 255, 170, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(117, 255, 170, 0.08) 1px, transparent 1px);
          background-size: 52px 52px;
          mask-image: linear-gradient(to bottom, black, transparent 88%);
        }

        .founder-scanlines {
          z-index: 2;
          opacity: 0.12;
          background: repeating-linear-gradient(
            to bottom,
            transparent 0,
            transparent 3px,
            rgba(213, 255, 0, 0.12) 4px
          );
        }

        .founder-shell {
          position: relative;
          z-index: 3;
          width: min(1180px, calc(100% - 32px));
          max-width: 100%;
          margin: 0 auto;
          padding: 54px 0 100px;
          box-sizing: border-box;
        }

        .founder-hero,
        .founder-panel,
        .year-one,
        .founder-note {
          min-width: 0;
          max-width: 100%;
          box-sizing: border-box;
          border: 1px solid rgba(213, 255, 0, 0.22);
          background:
            radial-gradient(circle at 8% 0%, rgba(213, 255, 0, 0.09), transparent 35%),
            linear-gradient(145deg, rgba(8, 20, 12, 0.88), rgba(2, 7, 5, 0.76));
          box-shadow:
            0 24px 70px rgba(0, 0, 0, 0.42),
            inset 0 0 42px rgba(164, 255, 200, 0.025);
          backdrop-filter: blur(18px);
        }

        .founder-hero {
          display: grid;
          grid-template-columns: minmax(0, 1.25fr) minmax(240px, 0.75fr);
          gap: 46px;
          align-items: center;
          padding: clamp(28px, 5vw, 62px);
          border-radius: 28px;
          min-height: 610px;
        }

        .hero-copy,
        .founder-portrait-wrap,
        .archive-intro > *,
        .split-section > *,
        .origin-grid > *,
        .pillar-grid > *,
        .year-one > * {
          min-width: 0;
        }

        .eyebrow,
        .section-heading p,
        .year-one p,
        .portrait-signal {
          margin: 0;
          color: #d5ff00;
          font: 700 11px/1.4 monospace;
          letter-spacing: 0.2em;
          text-transform: uppercase;
        }

        .hero-copy h1 {
          max-width: 100%;
          margin: 18px 0;
          color: white;
          font-size: clamp(3.6rem, 8vw, 7rem);
          line-height: 0.84;
          letter-spacing: 0;
          overflow-wrap: normal;
          text-transform: uppercase;
          text-shadow: 0 0 35px rgba(213, 255, 0, 0.2);
        }

        .hero-copy h1 span {
          display: block;
          color: #d5ff00;
          white-space: nowrap;
        }

        .hero-subtitle {
          max-width: 670px;
          margin: 0;
          color: rgba(240, 255, 245, 0.78);
          font-size: clamp(1rem, 1.8vw, 1.22rem);
          line-height: 1.75;
        }

        .hero-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin: 28px 0;
        }

        .hero-actions a,
        .pillar-card a {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          border: 1px solid rgba(213, 255, 0, 0.65);
          background: #d5ff00;
          padding: 11px 17px;
          color: #071007;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          transition: transform 160ms ease, box-shadow 160ms ease;
        }

        .hero-actions a:hover,
        .pillar-card a:hover {
          transform: translateY(-2px);
          box-shadow: 0 0 24px rgba(213, 255, 0, 0.42);
        }

        .hero-actions a.secondary {
          background: rgba(255, 255, 255, 0.04);
          color: rgba(245, 255, 247, 0.9);
        }

        .hero-readout {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .hero-readout span,
        .color-score {
          border: 1px solid rgba(255, 255, 255, 0.13);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.04);
          padding: 8px 11px;
          color: rgba(235, 255, 241, 0.66);
          font: 700 10px/1 monospace;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .founder-portrait-wrap {
          position: relative;
          width: 100%;
          max-width: 100%;
          padding: 12px;
          border: 1px solid rgba(255, 0, 200, 0.32);
          border-radius: 26px;
          background: rgba(0, 0, 0, 0.3);
          box-shadow: 0 0 42px rgba(255, 0, 200, 0.15);
        }

        .portrait-signal {
          position: absolute;
          z-index: 2;
          top: 23px;
          left: 23px;
          color: #ff74de;
        }

        .founder-portrait {
          position: relative;
          overflow: hidden;
          border-radius: 18px;
          aspect-ratio: 3 / 4;
          background: #050805;
        }

        .founder-portrait img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .portrait-overlay {
          position: absolute;
          inset: auto 0 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 58px 18px 18px;
          background: linear-gradient(transparent, rgba(0, 0, 0, 0.92));
        }

        .portrait-overlay strong {
          color: white;
          font-size: 1.25rem;
        }

        .portrait-overlay span {
          color: rgba(232, 255, 238, 0.68);
          font: 700 10px/1.3 monospace;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .founder-panel {
          margin-top: 24px;
          padding: clamp(24px, 4vw, 46px);
          border-radius: 24px;
        }

        .section-heading {
          margin-bottom: 20px;
        }

        .section-heading h2,
        .year-one h2 {
          margin: 7px 0 0;
          color: white;
          font-size: clamp(2rem, 5vw, 4rem);
          line-height: 1;
          letter-spacing: 0;
        }

        .archive-intro,
        .split-section {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 24px;
        }

        .archive-intro p,
        .section-lead,
        .spiritual-panel > p,
        .era-panel > p,
        .year-one span,
        .founder-note blockquote {
          margin: 0;
          color: rgba(235, 255, 241, 0.72);
          font-size: 0.98rem;
          line-height: 1.75;
        }

        .timeline {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 12px;
          margin: 34px 0 0;
          padding: 0;
          list-style: none;
        }

        .timeline li,
        .origin-card,
        .pillar-card {
          position: relative;
          border: 1px solid rgba(255, 255, 255, 0.11);
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.035);
          padding: 18px;
          transition:
            transform 180ms ease,
            border-color 180ms ease,
            box-shadow 180ms ease;
        }

        .timeline li:hover,
        .origin-card:hover,
        .pillar-card:hover {
          transform: translateY(-4px);
          border-color: rgba(213, 255, 0, 0.34);
          box-shadow: 0 14px 34px rgba(0, 0, 0, 0.3);
        }

        .timeline-dot {
          display: block;
          width: 9px;
          height: 9px;
          margin-bottom: 24px;
          border-radius: 50%;
          background: #d5ff00;
          box-shadow: 0 0 16px #d5ff00;
        }

        .timeline small,
        .origin-card span,
        .pillar-card span {
          color: #d5ff00;
          font: 700 10px/1.4 monospace;
          letter-spacing: 0.13em;
          text-transform: uppercase;
        }

        .timeline h3,
        .origin-card h3,
        .pillar-card h3 {
          margin: 8px 0;
          color: white;
          font-size: 1.08rem;
        }

        .timeline p,
        .origin-card p,
        .pillar-card p {
          margin: 0;
          color: rgba(234, 255, 240, 0.62);
          font-size: 0.82rem;
          line-height: 1.65;
        }

        .origin-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
          margin-top: 26px;
        }

        .origin-card {
          border-color: color-mix(in srgb, var(--origin-accent) 35%, transparent);
          box-shadow: inset 0 0 30px color-mix(in srgb, var(--origin-accent) 5%, transparent);
        }

        .origin-card span {
          color: var(--origin-accent);
        }

        .split-section {
          gap: 24px;
        }

        .spiritual-panel blockquote {
          margin: 24px 0 0;
          border-left: 2px solid #d5ff00;
          padding: 4px 0 4px 18px;
          color: rgba(236, 255, 191, 0.88);
          font-size: 1.1rem;
          line-height: 1.6;
        }

        .era-panel p + p {
          margin-top: 12px;
        }

        .color-score {
          display: flex;
          align-items: center;
          gap: 8px;
          width: fit-content;
          margin-top: 24px;
          border-radius: 14px;
        }

        .color-score span {
          width: 13px;
          height: 13px;
          border-radius: 4px;
        }

        .color-score .yellow { background: #d5ff00; box-shadow: 0 0 12px #d5ff00; }
        .color-score .green { background: #00ff7b; box-shadow: 0 0 12px #00ff7b; }
        .color-score .fuchsia { background: #ff00c8; box-shadow: 0 0 12px #ff00c8; }

        .color-score strong {
          margin-left: 5px;
          color: rgba(242, 255, 245, 0.7);
          font-size: 9px;
        }

        .pillar-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        .pillar-card {
          display: flex;
          flex-direction: column;
          min-height: 225px;
          padding: 22px;
        }

        .pillar-card h3 {
          font-size: 1.35rem;
        }

        .pillar-card a {
          align-self: flex-start;
          margin-top: auto;
          padding: 8px 12px;
          font-size: 9px;
        }

        .year-one {
          display: grid;
          grid-template-columns: 1.4fr 0.8fr;
          gap: 36px;
          align-items: center;
          margin-top: 24px;
          padding: clamp(26px, 5vw, 58px);
          border-color: rgba(255, 0, 200, 0.35);
          border-radius: 24px;
          background:
            radial-gradient(circle at 100% 0%, rgba(255, 0, 200, 0.16), transparent 38%),
            radial-gradient(circle at 0% 100%, rgba(213, 255, 0, 0.13), transparent 40%),
            rgba(6, 13, 8, 0.88);
          animation: yearOnePulse 5s ease-in-out infinite;
        }

        .year-one strong {
          color: white;
          font-size: clamp(1.5rem, 3vw, 2.7rem);
          line-height: 1.18;
          text-shadow: 0 0 28px rgba(255, 0, 200, 0.24);
        }

        .year-one span {
          display: block;
          margin-top: 18px;
        }

        .founder-note {
          margin-top: 24px;
          padding: clamp(28px, 6vw, 72px);
          border-radius: 24px;
          text-align: center;
        }

        @keyframes yearOnePulse {
          50% {
            border-color: rgba(255, 0, 200, 0.55);
            box-shadow:
              0 24px 70px rgba(0, 0, 0, 0.42),
              0 0 34px rgba(255, 0, 200, 0.12),
              inset 0 0 42px rgba(213, 255, 0, 0.035);
          }
        }

        .founder-note blockquote {
          max-width: 820px;
          margin: 26px auto;
          color: rgba(245, 255, 248, 0.82);
          font-size: clamp(1.05rem, 2vw, 1.3rem);
        }

        .signature {
          display: flex;
          flex-direction: column;
          gap: 4px;
          color: rgba(235, 255, 240, 0.6);
          font: 700 10px/1.4 monospace;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .signature strong {
          color: #d5ff00;
          font-size: 1.15rem;
        }

        @media (max-width: 980px) {
          .founder-hero,
          .year-one,
          .archive-intro,
          .split-section {
            grid-template-columns: 1fr;
          }

          .founder-portrait-wrap {
            justify-self: center;
            width: min(100%, 430px);
            max-width: 430px;
          }

          .timeline {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 680px) {
          .founder-shell {
            width: min(100% - 20px, 1180px);
            padding: 30px 0 70px;
          }

          .founder-hero,
          .founder-panel,
          .year-one,
          .founder-note {
            border-radius: 18px;
          }

          .hero-copy h1 {
            font-size: clamp(2.8rem, 15.5vw, 4.35rem);
          }

          .hero-actions {
            flex-direction: column;
          }

          .hero-actions a {
            width: 100%;
          }

          .origin-grid,
          .pillar-grid,
          .timeline {
            grid-template-columns: 1fr;
          }

          .timeline-dot {
            margin-bottom: 12px;
          }

          .color-score {
            align-items: flex-start;
            flex-wrap: wrap;
          }
        }
      `}</style>
    </main>
  );
}
