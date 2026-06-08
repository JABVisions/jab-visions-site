import Link from "next/link";

export const metadata = {
  title: "Cast & Crew Onboarding | Board",
  description: "Welcome to Board for JAB Visions cast and crew.",
};

const onboardingCards = [
  {
    title: "Create Your Profile",
    body: "Set up your Board identity so cast and crew can recognize you.",
  },
  {
    title: "Share Drops",
    body: "Post photos, creative updates, music, thoughts, or project-related materials.",
  },
  {
    title: "Use the Work Page",
    body: "Upload audition materials, creative files, reels, references, and production-related content.",
  },
  {
    title: "Stay Connected",
    body: "Board will become a central space for JAB Visions collaborators, updates, and future production activity.",
  },
];

export default function BoardOnboardingPage() {
  return (
    <main className="board-onboarding">
      <section className="onboarding-shell">
        <div className="onboarding-hero">
          <div>
            <p className="onboarding-kicker">JAB VISIONS™ CAST & CREW</p>
            <h1>Welcome to Board for JAB Visions Cast & Crew</h1>
            <p className="onboarding-intro">
              Board is where JAB Visions collaborators can create a profile, share Drops,
              stay connected, and eventually access production and casting updates.
            </p>
          </div>

          <div className="onboarding-actions">
            <Link href="/board/signup" className="onboarding-primary">
              Create Your Board Profile
            </Link>
            <p className="onboarding-action-note">
              Start by creating your Board account, then build your profile.
            </p>
            <Link href="/board/work" className="onboarding-secondary">
              Go to Work Page
            </Link>
          </div>
        </div>

        <div className="onboarding-grid">
          {onboardingCards.map((card, index) => (
            <article className="onboarding-card" key={card.title}>
              <div className="onboarding-count">{String(index + 1).padStart(2, "0")}</div>
              <h2>{card.title}</h2>
              <p>{card.body}</p>
            </article>
          ))}
        </div>

        <div className="onboarding-note">
          Board is still in beta, so some features may shift as the experience grows.
        </div>
      </section>

      <style>{`
        .board-onboarding {
          min-height: 100vh;
          padding: 76px 20px 160px;
          color: rgba(24, 24, 18, 0.92);
        }

        .onboarding-shell {
          width: min(1080px, 100%);
          margin: 0 auto;
        }

        .onboarding-hero {
          position: relative;
          overflow: hidden;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 28px;
          align-items: end;
          border-radius: 32px;
          border: 1px solid rgba(255, 255, 255, 0.78);
          background:
            radial-gradient(circle at 18% 10%, rgba(210, 255, 0, 0.25), transparent 38%),
            radial-gradient(circle at 88% 12%, rgba(255, 79, 216, 0.16), transparent 34%),
            linear-gradient(135deg, rgba(255, 255, 255, 0.94), rgba(248, 255, 221, 0.9));
          box-shadow:
            0 20px 70px rgba(0, 0, 0, 0.12),
            0 0 46px rgba(204, 255, 64, 0.18);
          padding: clamp(24px, 4vw, 42px);
        }

        .onboarding-kicker {
          margin: 0 0 12px;
          color: rgba(31, 145, 86, 0.98);
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }

        .onboarding-hero h1 {
          margin: 0;
          max-width: 780px;
          color: rgba(43, 146, 74, 0.98);
          font-size: clamp(2.35rem, 5vw, 4.8rem);
          line-height: 0.98;
          font-weight: 950;
          letter-spacing: -0.045em;
        }

        .onboarding-intro {
          margin: 18px 0 0;
          max-width: 720px;
          color: rgba(34, 34, 28, 0.68);
          font-size: 15px;
          line-height: 1.7;
          font-weight: 760;
        }

        .onboarding-actions {
          display: flex;
          flex-direction: column;
          gap: 10px;
          align-items: stretch;
          min-width: 230px;
        }

        .onboarding-primary,
        .onboarding-secondary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 46px;
          border-radius: 999px;
          padding: 12px 18px;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          text-decoration: none;
          white-space: nowrap;
        }

        .onboarding-primary {
          border: 1px solid rgba(35, 35, 28, 0.9);
          background: rgba(35, 35, 28, 0.96);
          color: rgba(211, 255, 224, 0.98);
          box-shadow: 0 14px 28px rgba(0, 0, 0, 0.16);
        }

        .onboarding-action-note {
          margin: -2px 4px 2px;
          color: rgba(34, 34, 28, 0.58);
          font-size: 12px;
          line-height: 1.45;
          font-weight: 780;
          text-align: center;
        }

        .onboarding-secondary {
          border: 1px solid rgba(255, 79, 216, 0.42);
          background: rgba(255, 255, 255, 0.75);
          color: rgba(255, 40, 201, 0.96);
          box-shadow: 0 0 18px rgba(255, 79, 216, 0.12);
        }

        .onboarding-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
          margin-top: 18px;
        }

        .onboarding-card {
          min-height: 188px;
          border-radius: 24px;
          border: 1px solid rgba(0, 0, 0, 0.09);
          background: rgba(255, 255, 255, 0.74);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.7),
            0 14px 34px rgba(0, 0, 0, 0.06);
          padding: 20px;
        }

        .onboarding-count {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 42px;
          height: 28px;
          border-radius: 999px;
          border: 1px solid rgba(31, 145, 86, 0.18);
          background: rgba(210, 255, 208, 0.42);
          color: rgba(31, 145, 86, 0.94);
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.12em;
        }

        .onboarding-card h2 {
          margin: 18px 0 8px;
          color: rgba(43, 146, 74, 0.98);
          font-size: 20px;
          line-height: 1.08;
          font-weight: 950;
          letter-spacing: -0.02em;
        }

        .onboarding-card p {
          margin: 0;
          color: rgba(34, 34, 28, 0.62);
          font-size: 13px;
          line-height: 1.55;
          font-weight: 730;
        }

        .onboarding-note {
          margin-top: 18px;
          border-radius: 22px;
          border: 1px solid rgba(255, 221, 87, 0.34);
          background: rgba(255, 248, 205, 0.74);
          color: rgba(92, 75, 20, 0.88);
          padding: 14px 18px;
          font-size: 13px;
          font-weight: 850;
          box-shadow: 0 0 24px rgba(255, 221, 87, 0.13);
        }

        @media (max-width: 960px) {
          .onboarding-hero {
            grid-template-columns: 1fr;
            align-items: start;
          }

          .onboarding-actions {
            min-width: 0;
            flex-direction: row;
            flex-wrap: wrap;
          }

          .onboarding-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 620px) {
          .board-onboarding {
            padding-top: 46px;
            padding-bottom: 150px;
          }

          .onboarding-grid {
            grid-template-columns: 1fr;
          }

          .onboarding-actions {
            flex-direction: column;
          }
        }
      `}</style>
    </main>
  );
}
