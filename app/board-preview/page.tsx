import Image from "next/image";
import Link from "next/link";

const features = [
  {
    title: "Drops",
    text: "Post updates, thoughts, media, project notes, announcements, and creative signals.",
  },
  {
    title: "Work Page",
    text: "A production-facing space for auditions, files, casting calls, crew needs, and collaborator activity.",
  },
  {
    title: "Project Notebook",
    text: "Track productions, gigs, roles, tasks, and creative opportunities in one evolving room.",
  },
  {
    title: "Pass / Pin / Push",
    text: "A reaction system that does more than like: acknowledge, save, or carry a drop forward.",
  },
  {
    title: "Board Glow",
    text: "A presence layer where users personalize aura, identity, profile, and signal across Board.",
  },
  {
    title: "Future Pay Drops",
    text: "A planned creator-commerce layer for paid drops, payouts, and project-supported transactions.",
  },
];

export default function BoardPreviewPage() {
  return (
    <main className="preview-root">
      <div className="preview-bg" />

      <section className="preview-hero">
        <div className="hero-copy">
          <p className="eyebrow">Board beta orientation</p>
          <h1>Board is the creator-production network inside JAB Visions.</h1>
          <p>
            Board is a social workspace where artists, actors, crew, fans, and
            collaborators can share drops, join projects, audition, organize work,
            and build inside the JAB Visions ecosystem.
          </p>
          <div className="actions">
            <Link className="primary" href="/board/signup">
              Enter Board Beta
            </Link>
            <Link className="secondary" href="/board/onboarding">
              Cast & Crew Onboarding
            </Link>
            <Link className="ghost" href="/">
              Back to Ecosystem
            </Link>
          </div>
        </div>

        <div className="hero-mark">
          <Image
            src="/assets/board-welcome-mark.jpg"
            alt="Board welcome mark"
            width={520}
            height={520}
            priority
          />
        </div>
      </section>

      <section className="beta-note">
        <span>Web beta</span>
        <p>
          Board is currently in web beta as JAB Visions builds its first production
          network around THOSE RYDERZ. Early users help shape the system before it
          expands.
        </p>
      </section>

      <section className="feature-grid" aria-label="Board feature preview">
        {features.map((feature) => (
          <article key={feature.title}>
            <span>Board module</span>
            <h2>{feature.title}</h2>
            <p>{feature.text}</p>
          </article>
        ))}
      </section>

      <section className="closing-panel">
        <p className="eyebrow">Not a social media clone</p>
        <h2>The operating layer for productions, collaborators, community, and future creative economy.</h2>
        <div className="actions center">
          <Link className="primary" href="/board/signup">
            Create Your Board
          </Link>
          <Link className="secondary" href="/board/login">
            Log In
          </Link>
        </div>
      </section>

      <style>{`
        .preview-root {
          position: relative;
          min-height: 100vh;
          overflow: hidden;
          background: #060804;
          color: #f7fff2;
          padding: 52px 18px 72px;
        }

        .preview-bg {
          position: fixed;
          inset: 0;
          pointer-events: none;
          background:
            linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px),
            radial-gradient(circle at 20% 4%, rgba(207, 255, 0, 0.22), transparent 34%),
            radial-gradient(circle at 78% 16%, rgba(255, 48, 205, 0.2), transparent 30%),
            radial-gradient(circle at 50% 72%, rgba(52, 255, 190, 0.18), transparent 40%),
            #050806;
          background-size: 100% 4px, 100% 100%, 100% 100%, 100% 100%, 100% 100%;
        }

        .preview-hero,
        .beta-note,
        .feature-grid,
        .closing-panel {
          position: relative;
          z-index: 1;
          max-width: 1160px;
          margin: 0 auto;
        }

        .preview-hero {
          display: grid;
          grid-template-columns: minmax(0, 1.05fr) minmax(300px, 0.72fr);
          gap: 24px;
          align-items: stretch;
          min-height: 72vh;
        }

        .hero-copy,
        .hero-mark,
        .beta-note,
        .feature-grid article,
        .closing-panel {
          border: 1px solid rgba(117, 255, 188, 0.34);
          border-radius: 28px;
          background:
            linear-gradient(140deg, rgba(255,255,255,0.105), rgba(255,255,255,0.035)),
            rgba(0, 0, 0, 0.58);
          box-shadow:
            0 0 36px rgba(78, 255, 162, 0.16),
            inset 0 0 28px rgba(255, 255, 255, 0.04);
          backdrop-filter: blur(16px);
        }

        .hero-copy {
          padding: clamp(26px, 5vw, 58px);
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .eyebrow,
        .feature-grid article span,
        .beta-note span {
          color: #baff6d;
          font-family: monospace;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.2em;
          text-transform: uppercase;
        }

        h1,
        h2,
        p {
          letter-spacing: 0;
        }

        h1 {
          margin: 14px 0 0;
          color: #ffffff;
          font-size: clamp(42px, 7vw, 78px);
          line-height: 0.96;
          font-weight: 950;
        }

        .hero-copy > p,
        .closing-panel > h2 {
          max-width: 780px;
        }

        p {
          color: rgba(241, 255, 238, 0.76);
          line-height: 1.6;
        }

        .hero-copy > p {
          margin-top: 20px;
          font-size: 18px;
        }

        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 26px;
        }

        .actions.center {
          justify-content: center;
        }

        .primary,
        .secondary,
        .ghost {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          padding: 13px 18px;
          font-family: monospace;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          text-decoration: none;
          transition:
            transform 170ms ease,
            box-shadow 170ms ease;
        }

        .primary {
          background: linear-gradient(135deg, #d8ff00, #35ff91);
          color: #061006;
          box-shadow: 0 0 24px rgba(200, 255, 0, 0.44);
        }

        .secondary {
          color: #ff9bec;
          border: 1px solid rgba(255, 56, 207, 0.55);
          background: rgba(255, 56, 207, 0.1);
        }

        .ghost {
          color: rgba(247, 255, 242, 0.82);
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.055);
        }

        .primary:hover,
        .secondary:hover,
        .ghost:hover {
          transform: translateY(-2px);
        }

        .hero-mark {
          padding: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        .hero-mark img {
          width: 100%;
          height: 100%;
          min-height: 420px;
          object-fit: cover;
          border-radius: 22px;
          filter: saturate(1.12) contrast(1.04);
        }

        .beta-note {
          display: grid;
          grid-template-columns: 180px 1fr;
          gap: 18px;
          align-items: center;
          margin-top: 22px;
          padding: 20px 24px;
        }

        .beta-note p {
          margin: 0;
        }

        .feature-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
          margin-top: 22px;
        }

        .feature-grid article {
          padding: 22px;
        }

        .feature-grid h2 {
          margin: 12px 0 8px;
          color: #ffffff;
          font-size: 26px;
        }

        .closing-panel {
          margin-top: 22px;
          padding: clamp(28px, 5vw, 54px);
          text-align: center;
        }

        .closing-panel h2 {
          margin: 12px auto 0;
          color: #ffffff;
          font-size: clamp(30px, 5vw, 56px);
          line-height: 1.03;
        }

        @media (max-width: 900px) {
          .preview-hero,
          .feature-grid,
          .beta-note {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 620px) {
          .preview-root {
            padding: 22px 12px 52px;
          }

          .hero-mark img {
            min-height: 280px;
          }

          .actions {
            flex-direction: column;
          }
        }
      `}</style>
    </main>
  );
}
