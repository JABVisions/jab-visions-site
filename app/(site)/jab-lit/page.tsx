"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

const AMAZON_URL =
  "https://www.amazon.com/Solomons-Secrets-John-Andy-Books/dp/B0DMN7X84N";

type LibraryStatus = "Published" | "In Development" | "Coming Soon" | "Archive";

type LibraryWork = {
  title: string;
  status: LibraryStatus;
  code: string;
  description: string;
  accent: string;
  image?: string;
};

const filters = ["All", "Published", "In Development", "Coming Soon", "Archive"] as const;

const originTimeline = [
  ["Childhood Archive", "Handmade comics and original characters"],
  ["Just John Andy", "Sitey, Tumblr, early novels, and fictional memoirs"],
  ["John Andy Books", "A formal home for literature and philosophy"],
  ["JAB", "Stories begin connecting to a larger visual identity"],
  ["JAB Visions", "Literature becomes one engine inside a creative universe"],
];

const libraryWorks: LibraryWork[] = [
  {
    title: "Solomon's Secrets: Sunrise",
    status: "Published",
    code: "JAB-LIT / PUBLISHED 001",
    description:
      "A philosophical and meditative work exploring self-discovery, spirituality, identity, fate, free will, and the relationship between the metaphysical and the tangible.",
    accent: "#ffea72",
    image: "/assets/jab-lit/solomons-secrets-sunrise-cover.jpg",
  },
  {
    title: "Fatal Stars",
    status: "Archive",
    code: "JAB-LIT / 001",
    description:
      "Foundational mythology from the John Andy Books era. A supernatural, spiritual coming-of-age universe where ordinary young people encounter divine power, cosmic transformation, and the battle between darkness and light.",
    accent: "#d5ff00",
    image: "/assets/jab-lit/fatal-stars-cover.jpg",
  },
  {
    title: "Hopelessly Infinite",
    status: "In Development",
    code: "JAB-LIT / 002",
    description:
      "A romantic fictional memoir exploring memory, identity, reincarnation, past lives, and the emotional mythology of being seen through another person's reality.",
    accent: "#ff62d7",
    image: "/assets/jab-lit/hopelessly-infinite-cover.jpg",
  },
  {
    title: "SOUL",
    status: "Coming Soon",
    code: "JAB-LIT / 003",
    description:
      "An upcoming JAB literary project exploring the unseen layers of identity, spirit, purpose, and transformation.",
    accent: "#7ce8ff",
  },
];

const readingRoom = [
  {
    title: "Fatal Stars: Chapter Preview",
    type: "Chapter",
    preview: "A sealed transmission from the foundational mythology archive.",
  },
  {
    title: "Hopelessly Infinite",
    type: "Excerpt",
    preview: "A future reading on memory, romance, and the realities we build around one another.",
  },
  {
    title: "SOUL",
    type: "Author Note",
    preview: "Early notes on identity, purpose, spirit, and transformation.",
  },
];

export default function JabLitPage() {
  const [activeFilter, setActiveFilter] =
    useState<(typeof filters)[number]>("All");
  const [openReadingCard, setOpenReadingCard] = useState<string | null>(null);

  const filteredWorks = useMemo(
    () =>
      activeFilter === "All"
        ? libraryWorks
        : libraryWorks.filter((work) => work.status === activeFilter),
    [activeFilter]
  );

  const scrollTo = (id: string) => {
    if (typeof window !== "undefined") {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <main className="lit-page">
      <div className="lit-grid" aria-hidden="true" />
      <div className="floating-fragments" aria-hidden="true">
        <span>memory / identity / mythology</span>
        <span>archive signal: active</span>
        <span>stories become worlds</span>
      </div>

      <div className="lit-shell">
        <section className="lit-hero">
          <div className="hero-library">
            <p className="lit-eyebrow">JAB VISIONS / LITERARY ARCHIVE</p>
            <h1>JAB <span>Lit</span></h1>
            <p className="hero-subtitle">
              The literary archive of JAB Visions, chronicling John Andy&apos;s
              journey as an author, scholar, worldbuilder, and creative mind
              behind the company&apos;s expanding universe.
            </p>
            <p className="hero-body">
              Before JAB Visions became a film and media company, it began with
              writing: handmade comics, early novels, philosophical works,
              fictional memoirs, and mythologies that shaped the foundation of
              the brand.
            </p>
            <div className="hero-actions">
              <button type="button" onClick={() => scrollTo("library")}>Browse the Library</button>
              <button type="button" className="ghost" onClick={() => scrollTo("chapters")}>Read Unreleased Chapters</button>
              <a href={AMAZON_URL} target="_blank" rel="noopener noreferrer">View Solomon&apos;s Secrets</a>
            </div>
          </div>

          <div className="archive-terminal" aria-label="JAB Lit archive status">
            <div className="terminal-top">
              <span>Archive Console</span>
              <strong>ONLINE</strong>
            </div>
            <div className="crown-glyph">
              <strong>John Andy<br />Books</strong>
              <span>JAB Lit Archive</span>
            </div>
            <div className="terminal-readout">
              <span>Published artifact</span><strong>01</strong>
              <span>Worlds in development</span><strong>04</strong>
              <span>Reading room</span><strong>SEALED</strong>
            </div>
            <div className="book-spines" aria-hidden="true">
              <i /><i /><i /><i /><i />
            </div>
          </div>
        </section>

        <section className="lit-panel origin-section">
          <header className="section-heading">
            <p>Author Origin</p>
            <h2>From John Andy Books to JAB Visions</h2>
          </header>
          <p className="section-copy">
            John Andy&apos;s creative journey began with stories long before
            the company had an official structure. As a child, he made comic
            books and original characters. As a teenager, he created under Just
            John Andy on Sitey and Tumblr, developing early projects like Fatal
            Stars and Hopelessly Infinite. After high school, the author
            identity evolved into John Andy Books, eventually becoming the
            foundation for JAB Visions.
          </p>
          <ol className="lit-timeline">
            {originTimeline.map(([title, body], index) => (
              <li key={title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="published-artifact" id="published">
          <div className="published-cover">
            <Image
              src="/assets/jab-lit/solomons-secrets-sunrise-cover.jpg"
              alt="Solomon's Secrets: Sunrise book cover"
              width={648}
              height={1000}
              priority
              style={{ objectFit: "contain" }}
            />
            <span>Published / Artifact 001</span>
          </div>
          <div>
            <p className="lit-eyebrow">Published Work / First Official Artifact</p>
            <h2>Solomon&apos;s Secrets: Sunrise</h2>
            <p>
              Solomon&apos;s Secrets: Sunrise is a philosophical and meditative
              work by John Andy Books, exploring self-discovery, spirituality,
              identity, fate, free will, and the relationship between the
              metaphysical and the tangible.
            </p>
            <a href={AMAZON_URL} target="_blank" rel="noopener noreferrer">
              View on Amazon
            </a>
          </div>
        </section>

        <section className="lit-panel" id="library">
          <header className="section-heading">
            <p>Active Shelf</p>
            <h2>The Library in Development</h2>
          </header>
          <p className="section-copy">
            JAB Lit will house the growing library of books, comics, novels,
            essays, and mythologies currently in development under John Andy
            and JAB Visions.
          </p>
          <div className="filter-tabs" role="tablist" aria-label="Filter JAB Lit library">
            {filters.map((filter) => (
              <button
                key={filter}
                type="button"
                role="tab"
                aria-selected={activeFilter === filter}
                className={activeFilter === filter ? "active" : ""}
                onClick={() => setActiveFilter(filter)}
              >
                {filter}
              </button>
            ))}
          </div>
          <div className="library-grid">
            {filteredWorks.map((work) => (
              <article
                className={`book-artifact ${work.image ? "has-cover" : ""}`}
                key={work.title}
                style={{ "--book-accent": work.accent } as React.CSSProperties}
              >
                <div className="book-edge" aria-hidden="true" />
                {work.image && (
                  <div className="book-cover">
                    <Image
                      src={work.image}
                      alt={`${work.title} cover`}
                      width={600}
                      height={860}
                      style={{ objectFit: "contain" }}
                    />
                  </div>
                )}
                <div className="book-meta">
                  <span>{work.code}</span>
                  <strong>{work.status}</strong>
                </div>
                {!work.image && <div className="book-spacer" />}
                <h3>{work.title}</h3>
                <p>{work.description}</p>
                <button type="button" disabled>Preview Coming Soon</button>
              </article>
            ))}
          </div>
        </section>

        <section className="lit-panel" id="chapters">
          <header className="section-heading">
            <p>Restricted Archive</p>
            <h2>The Reading Room</h2>
          </header>
          <p className="section-copy">
            The Reading Room will feature selected unreleased chapters,
            excerpts, essays, and literary previews from John Andy&apos;s books
            before their official release. While JAB Visions focuses on Those
            Ryderz and screen development, readers will be able to browse this
            literary archive as future books continue to develop.
          </p>
          <div className="reading-grid">
            {readingRoom.map((item) => {
              const isOpen = openReadingCard === item.title;
              return (
                <article className={`reading-card ${isOpen ? "open" : ""}`} key={item.title}>
                  <div>
                    <span>{item.type} / Locked</span>
                    <h3>{item.title}</h3>
                  </div>
                  {isOpen && <p>{item.preview}</p>}
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenReadingCard(isOpen ? null : item.title)}
                  >
                    {isOpen ? "Close Preview" : "Coming Soon"}
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        <section className="lit-split">
          <article className="lit-panel scholar-card">
            <p className="lit-eyebrow">Literature as Infrastructure</p>
            <h2>Author. Scholar. Worldbuilder.</h2>
            <p>
              JAB Lit also reflects John Andy&apos;s role as a thinker and
              scholar within the JAB Visions ecosystem. His work moves between
              fiction, philosophy, spirituality, identity, mythology, and
              cultural imagination, positioning literature as one of the core
              engines behind the company&apos;s creative future.
            </p>
            <Link href="/john-andy" aria-disabled="true">Enter the Founder Archive</Link>
          </article>
          <article className="lit-panel next-card">
            <p className="lit-eyebrow">Future Shelf</p>
            <h2>What&apos;s Next for JAB Lit</h2>
            <p>
              As JAB Visions continues developing Those Ryderz, JAB Lit will
              grow gradually into a full digital library. Future updates may
              include unreleased chapters, book previews, author notes,
              concept art, literary timelines, and early access to upcoming
              works.
            </p>
            <strong>
              The books are not abandoned. They are waiting in the archive
              while the universe expands.
            </strong>
          </article>
        </section>
      </div>

      <style jsx global>{`
        html { scroll-behavior: smooth; }
        .lit-page {
          position: relative;
          min-height: 100vh;
          overflow: hidden;
          background:
            radial-gradient(circle at 14% 4%, rgba(213,255,0,.13), transparent 28%),
            radial-gradient(circle at 84% 32%, rgba(255,0,200,.1), transparent 28%),
            radial-gradient(circle at 45% 88%, rgba(0,255,123,.08), transparent 35%),
            #020403;
          color: rgba(244,255,247,.9);
        }
        .lit-grid {
          position: fixed; inset: 0; pointer-events: none; opacity: .18;
          background-image:
            linear-gradient(rgba(117,255,170,.09) 1px, transparent 1px),
            linear-gradient(90deg, rgba(117,255,170,.07) 1px, transparent 1px);
          background-size: 48px 48px;
          mask-image: linear-gradient(to bottom, black, transparent 90%);
        }
        .floating-fragments { position: fixed; inset: 0; pointer-events: none; color: rgba(213,255,0,.13); font: 700 10px monospace; letter-spacing: .2em; text-transform: uppercase; }
        .floating-fragments span { position: absolute; animation: fragmentFloat 10s ease-in-out infinite; }
        .floating-fragments span:nth-child(1) { top: 20%; left: 3%; }
        .floating-fragments span:nth-child(2) { top: 54%; right: 2%; animation-delay: -3s; }
        .floating-fragments span:nth-child(3) { bottom: 10%; left: 8%; animation-delay: -6s; }
        .lit-shell { position: relative; z-index: 2; width: min(1180px, calc(100% - 32px)); margin: 0 auto; padding: 54px 0 100px; }
        .lit-hero, .lit-panel, .published-artifact {
          border: 1px solid rgba(213,255,0,.22); border-radius: 26px;
          background: radial-gradient(circle at 8% 0%, rgba(213,255,0,.08), transparent 34%), linear-gradient(145deg, rgba(8,20,12,.9), rgba(2,7,5,.78));
          box-shadow: 0 24px 70px rgba(0,0,0,.42), inset 0 0 42px rgba(164,255,200,.025);
          backdrop-filter: blur(18px);
        }
        .lit-hero { display: grid; grid-template-columns: 1.25fr .75fr; gap: 38px; align-items: center; min-height: 590px; padding: clamp(28px,5vw,62px); }
        .lit-eyebrow, .section-heading > p { margin: 0; color: #d5ff00; font: 700 11px/1.4 monospace; letter-spacing: .2em; text-transform: uppercase; }
        .hero-library h1 { margin: 16px 0; color: white; font-size: clamp(5rem,12vw,9rem); line-height: .82; text-transform: uppercase; text-shadow: 0 0 36px rgba(213,255,0,.22); }
        .hero-library h1 span { display: block; color: #d5ff00; }
        .hero-subtitle { margin: 0; max-width: 680px; color: rgba(245,255,248,.85); font-size: clamp(1.05rem,2vw,1.3rem); line-height: 1.65; }
        .hero-body, .section-copy, .published-artifact p, .scholar-card > p, .next-card > p { color: rgba(235,255,241,.68); line-height: 1.75; }
        .hero-body { max-width: 650px; margin: 16px 0 0; }
        .hero-actions { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 26px; }
        .hero-actions button, .hero-actions a, .published-artifact a, .scholar-card a {
          appearance: none; cursor: pointer; border: 1px solid rgba(213,255,0,.65); border-radius: 999px; background: #d5ff00;
          padding: 11px 15px; color: #071007; font: 800 10px/1 monospace; letter-spacing: .1em; text-transform: uppercase;
          transition: transform .18s ease, box-shadow .18s ease;
        }
        .hero-actions .ghost { background: rgba(255,255,255,.04); color: white; }
        .hero-actions button:hover, .hero-actions a:hover, .published-artifact a:hover, .scholar-card a:hover { transform: translateY(-2px); box-shadow: 0 0 24px rgba(213,255,0,.38); }
        .archive-terminal { border: 1px solid rgba(255,0,200,.3); border-radius: 24px; background: rgba(0,0,0,.35); padding: 20px; box-shadow: 0 0 38px rgba(255,0,200,.12); }
        .terminal-top, .terminal-readout { display: grid; grid-template-columns: 1fr auto; gap: 10px; font: 700 10px/1.4 monospace; letter-spacing: .12em; text-transform: uppercase; }
        .terminal-top { color: rgba(246,255,248,.55); }
        .terminal-top strong { color: #00ff7b; }
        .crown-glyph { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; aspect-ratio: 1; margin: 18px 0; border: 1px solid rgba(213,255,0,.25); border-radius: 50%; color: #d5ff00; text-align: center; text-shadow: 0 0 28px #d5ff00; box-shadow: inset 0 0 38px rgba(213,255,0,.06); }
        .crown-glyph strong { font-size: clamp(1.55rem,4vw,3.2rem); line-height: .92; letter-spacing: .02em; }
        .crown-glyph span { color: rgba(213,255,0,.72); font: 800 8px/1 monospace; letter-spacing: .18em; text-transform: uppercase; }
        .terminal-readout { color: rgba(236,255,241,.52); }
        .terminal-readout strong { color: white; }
        .book-spines { display: flex; align-items: end; gap: 5px; height: 55px; margin-top: 20px; }
        .book-spines i { flex: 1; height: 80%; border: 1px solid rgba(213,255,0,.3); background: rgba(213,255,0,.08); }
        .book-spines i:nth-child(2) { height: 100%; border-color: rgba(255,0,200,.45); }
        .book-spines i:nth-child(3) { height: 65%; border-color: rgba(124,232,255,.45); }
        .book-spines i:nth-child(4) { height: 90%; }
        .lit-panel { margin-top: 24px; padding: clamp(24px,4vw,46px); }
        .section-heading h2, .published-artifact h2, .lit-split h2 { margin: 7px 0 0; color: white; font-size: clamp(2rem,5vw,4rem); line-height: 1; }
        .section-copy { max-width: 930px; margin: 18px 0 0; }
        .lit-timeline { display: grid; grid-template-columns: repeat(5,minmax(0,1fr)); gap: 10px; margin: 30px 0 0; padding: 0; list-style: none; }
        .lit-timeline li, .book-artifact, .reading-card {
          border: 1px solid rgba(255,255,255,.11); border-radius: 16px; background: rgba(255,255,255,.035); padding: 18px;
          transition: transform .2s ease, border-color .2s ease, box-shadow .2s ease;
        }
        .lit-timeline li:hover, .book-artifact:hover, .reading-card:hover { transform: translateY(-4px); border-color: rgba(213,255,0,.4); box-shadow: 0 12px 30px rgba(0,0,0,.25); }
        .lit-timeline span, .book-meta, .reading-card span { color: #d5ff00; font: 700 9px/1.4 monospace; letter-spacing: .12em; text-transform: uppercase; }
        .lit-timeline h3, .book-artifact h3, .reading-card h3 { margin: 15px 0 8px; color: white; font-size: 1.05rem; }
        .lit-timeline p, .book-artifact p, .reading-card p { margin: 0; color: rgba(235,255,241,.58); font-size: .8rem; line-height: 1.6; }
        .published-artifact { display: grid; grid-template-columns: .4fr 1.6fr; gap: 32px; align-items: center; margin-top: 24px; padding: clamp(26px,5vw,54px); border-color: rgba(255,234,114,.45); background: radial-gradient(circle at 0 50%, rgba(255,234,114,.16), transparent 35%), rgba(6,13,8,.9); }
        .published-cover { position: relative; width: 100%; max-width: 285px; overflow: hidden; border-radius: 18px; box-shadow: 0 0 34px rgba(255,234,114,.18); }
        .published-cover img { display: block; width: 100%; height: auto; object-fit: contain; }
        .published-cover span { position: absolute; inset: auto 10px 10px; border: 1px solid rgba(255,234,114,.45); border-radius: 999px; background: rgba(0,0,0,.72); padding: 7px 10px; color: #ffea72; font: 800 8px/1 monospace; letter-spacing: .14em; text-align: center; text-transform: uppercase; backdrop-filter: blur(10px); }
        .published-artifact p { max-width: 760px; }
        .published-artifact a, .scholar-card a { display: inline-flex; margin-top: 15px; }
        .filter-tabs { display: flex; flex-wrap: wrap; gap: 7px; margin: 26px 0 18px; }
        .filter-tabs button { appearance: none; border: 1px solid rgba(255,255,255,.14); border-radius: 999px; background: rgba(255,255,255,.04); padding: 8px 12px; color: rgba(245,255,248,.64); cursor: pointer; font: 700 9px monospace; letter-spacing: .1em; text-transform: uppercase; }
        .filter-tabs button.active { border-color: #d5ff00; color: #071007; background: #d5ff00; box-shadow: 0 0 18px rgba(213,255,0,.26); }
        .library-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 14px; }
        .book-artifact { position: relative; display: flex; flex-direction: column; min-height: 310px; overflow: hidden; border-color: color-mix(in srgb, var(--book-accent) 32%, transparent); box-shadow: inset 0 0 28px color-mix(in srgb, var(--book-accent) 5%, transparent); }
        .book-artifact.has-cover { padding-top: 16px; }
        .book-edge { position: absolute; inset: 0 auto 0 0; width: 6px; background: var(--book-accent); box-shadow: 0 0 18px var(--book-accent); }
        .book-cover { position: relative; margin: 0 0 16px 4px; overflow: hidden; border-radius: 13px; box-shadow: 0 0 25px color-mix(in srgb, var(--book-accent) 12%, transparent); }
        .book-cover::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(130deg, rgba(255,255,255,.1), transparent 34%); }
        .book-cover img { display: block; width: 100%; height: auto; object-fit: contain; transition: filter .35s ease; }
        .book-artifact:hover .book-cover img { filter: brightness(1.05); }
        .book-meta { display: flex; justify-content: space-between; gap: 10px; color: var(--book-accent); }
        .book-spacer { flex: 1; min-height: 28px; max-height: 45px; }
        .book-artifact h3 { font-size: 1.4rem; }
        .book-artifact button, .reading-card button { margin-top: auto; align-self: flex-start; appearance: none; border: 1px solid rgba(255,255,255,.12); border-radius: 999px; background: rgba(255,255,255,.04); padding: 8px 11px; color: rgba(245,255,248,.52); font: 700 9px monospace; letter-spacing: .1em; text-transform: uppercase; }
        .book-artifact button:disabled { cursor: not-allowed; opacity: 0.5; }
        .reading-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); align-items: start; gap: 14px; margin-top: 28px; }
        .reading-card { display: flex; flex-direction: column; min-height: 180px; cursor: pointer; }
        .reading-card.open { border-color: rgba(255,0,200,.4); box-shadow: inset 0 0 32px rgba(255,0,200,.06); }
        .reading-card button { cursor: pointer; }
        .lit-split { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 24px; }
        .scholar-card, .next-card { display: flex; flex-direction: column; }
        .scholar-card a[aria-disabled="true"] { opacity: 0.5; pointer-events: none; cursor: not-allowed; }
        .next-card strong { display: block; margin-top: auto; border-left: 2px solid #ff00c8; padding: 5px 0 5px 16px; color: rgba(255,214,247,.9); line-height: 1.55; }
        @keyframes fragmentFloat { 50% { transform: translateY(-14px); opacity: .55; } }
        @media (max-width: 920px) {
          .lit-hero, .published-artifact, .lit-split { grid-template-columns: 1fr; }
          .archive-terminal { max-width: 460px; }
          .lit-timeline { grid-template-columns: repeat(2,minmax(0,1fr)); }
          .library-grid, .reading-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
          .published-cover { max-width: 260px; }
        }
        @media (max-width: 650px) {
          .lit-shell { width: min(100% - 20px,1180px); padding: 30px 0 70px; }
          .lit-hero, .lit-panel, .published-artifact { border-radius: 18px; }
          .hero-library h1 { font-size: clamp(4.4rem,24vw,6rem); }
          .hero-actions { flex-direction: column; }
          .hero-actions button, .hero-actions a { width: 100%; }
          .lit-timeline, .library-grid, .reading-grid { grid-template-columns: 1fr; }
          .book-artifact { min-height: 260px; }
        }
      `}</style>
    </main>
  );
}
