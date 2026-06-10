'use client';

import Image from 'next/image';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const ecosystemCards = [
  {
    label: 'IP Engine',
    title: 'THOSE RYDERZ',
    description:
      'Flagship cinematic IP. A supernatural superhero story-world about power, faith, identity, and the final resistance.',
    cta: 'Enter the Universe',
    href: '/those-ryderz',
    image: '/assets/those-ryderz-logo.jpg',
    tone: 'ryderz',
  },
  {
    label: 'Commerce Engine',
    title: 'JAB Visions Store',
    description:
      'Creator commerce for the JAB Visions brand, supporting original productions, audience growth, and future artifacts.',
    cta: 'Visit the Store',
    href: 'https://store.jabvisions.com',
    image: '/store-drops/artifact-015-signal-crown-headphones.png',
    tone: 'store',
  },
  {
    label: 'Infrastructure Engine',
    title: 'Board',
    description:
      'A creator-production network for auditions, cast, crew, project drops, work pages, and community infrastructure.',
    cta: 'Preview Board',
    href: '/board-preview',
    image: '/assets/board-welcome-mark.jpg',
    tone: 'board',
  },
];

const focusItems = [
  ['THOSE RYDERZ', 'Active development / production'],
  ['Board', 'Web beta now live'],
  ['JAB Visions Store', 'Open and evolving'],
];

const boardFeatures = [
  'Drops',
  'Work Page',
  'Project Notebook',
  'Pass / Pin / Push',
  'Board Glow',
  'Future Pay Drops',
];

export default function Home() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const openStore = () => {
    window.location.href = 'https://store.jabvisions.com';
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const fontSize = 14;
    const chars = '0123456789ABCDEFJABλΔΨRYDRZ';
    let drops: number[] = [];
    let rafId = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      drops = Array(Math.floor(canvas.width / fontSize)).fill(0);
    };

    const draw = () => {
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#31ff96';
      ctx.font = `${fontSize}px monospace`;

      for (let i = 0; i < drops.length; i += 1) {
        const text = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(text, i * fontSize, drops[i] * fontSize);
        drops[i] += 1;

        if (drops[i] * fontSize > canvas.height && Math.random() > 0.982) {
          drops[i] = 0;
        }
      }

      rafId = requestAnimationFrame(draw);
    };

    resize();
    draw();
    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <main className="home-root">
      <canvas ref={canvasRef} className="matrix-canvas" />
      <div className="scanlines" />
      <div className="aurora" />

      <section className="hero-shell">
        <div className="hero-terminal">
          <div className="terminal-topline">
            <span>JAB VISIONS ECOSYSTEM TERMINAL</span>
            <span>THOSE RYDERZ ERA</span>
          </div>

          <div className="hero-grid">
            <div className="hero-copy">
              <Image
                src="/assets/jab-logo@2x.png"
                alt="JAB Visions"
                width={460}
                height={105}
                priority
                className="hero-logo"
              />

              <p className="eyebrow">Entertainment-tech / cinematic IP / creator infrastructure</p>
              <h1>Original stories. Living worlds. Creator-built infrastructure.</h1>
              <p className="subhead">
                JAB Visions is an entertainment-tech company developing cinematic IP,
                creator commerce, and production/community tools through one connected
                ecosystem.
              </p>

              <div className="hero-actions">
                <button className="primary-action" onClick={() => router.push('/those-ryderz')}>
                  Enter THOSE RYDERZ
                </button>
                <button className="secondary-action" onClick={() => router.push('/board-preview')}>
                  Explore Board
                </button>
                <button className="ghost-action" onClick={openStore}>
                  Visit Store
                </button>
              </div>
            </div>

            <div className="signal-panel" aria-label="JAB Visions current signal">
              <div className="signal-card">
                <div className="signal-label">Now transmitting</div>
                <div className="signal-title">Stories become worlds.</div>
                <div className="signal-line">Worlds become communities.</div>
                <div className="signal-line">Communities become companies.</div>
              </div>
              <div className="mini-status-grid">
                {focusItems.map(([title, status]) => (
                  <div className="mini-status" key={title}>
                    <span>{title}</span>
                    <strong>{status}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-block ecosystem-block">
        <div className="section-heading">
          <p>The JAB Visions Ecosystem</p>
          <h2>Three engines. One creative universe.</h2>
        </div>

        <div className="ecosystem-grid">
          {ecosystemCards.map((card) => (
            <article className={`ecosystem-card ${card.tone}`} key={card.title}>
              <div className={`card-image card-image-${card.tone}`}>
                <Image src={card.image} alt="" width={540} height={360} />
              </div>
              <div className="card-copy">
                <span>{card.label}</span>
                <h3>{card.title}</h3>
                <p>{card.description}</p>
                <button
                  onClick={() =>
                    card.href.startsWith('http')
                      ? (window.location.href = card.href)
                      : router.push(card.href)
                  }
                >
                  {card.cta}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="spine-section">
        <p>IP creates culture. Commerce sustains it. Infrastructure connects it.</p>
      </section>

      <section className="section-block board-preview-block">
        <div className="board-preview-copy">
          <p className="eyebrow">Board beta preview</p>
          <h2>The production network behind the glow.</h2>
          <p>
            Board began as a private production tool for JAB Visions cast and crew.
            It is now evolving into a creator-production network where users can post
            drops, organize work, join projects, audition, and build inside the JAB
            Visions ecosystem.
          </p>
          <div className="feature-pills">
            {boardFeatures.map((feature) => (
              <span key={feature}>{feature}</span>
            ))}
          </div>
          <div className="board-actions">
            <button className="secondary-action" onClick={() => router.push('/board-preview')}>
              Preview Board
            </button>
            <button className="ghost-action" onClick={() => router.push('/board/signup')}>
              Enter Board Beta
            </button>
          </div>
        </div>

        <div className="board-terminal-card">
          <div className="board-terminal-header">
            <span>BOARD OS</span>
            <strong>Creator-production infrastructure</strong>
          </div>
          <div className="board-terminal-list">
            <div><b>Drop Console</b><span>Post signals, media, project notes, and announcements.</span></div>
            <div><b>Work Page</b><span>Organize auditions, casting calls, crew needs, and files.</span></div>
            <div><b>Project Notebook</b><span>Track productions as living work rooms.</span></div>
          </div>
        </div>
      </section>

      <section className="focus-strip" aria-label="Current JAB Visions focus">
        <span>Now Building</span>
        {focusItems.map(([title, status]) => (
          <div key={title}>
            <strong>{title}</strong>
            <p>{status}</p>
          </div>
        ))}
      </section>

      <style jsx global>{`
        .home-root {
          position: relative;
          min-height: 100vh;
          overflow-x: hidden;
          background: #020403;
          color: #f4fff3;
          padding: 56px 18px 64px;
        }

        .matrix-canvas {
          position: fixed;
          inset: 0;
          z-index: 0;
          opacity: 0.52;
        }

        .scanlines,
        .aurora {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 1;
        }

        .scanlines {
          background:
            linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
            radial-gradient(circle at 30% 5%, rgba(255, 47, 205, 0.25), transparent 32%),
            radial-gradient(circle at 78% 20%, rgba(255, 220, 70, 0.2), transparent 34%);
          background-size: 100% 4px, 100% 100%, 100% 100%;
          mix-blend-mode: screen;
          opacity: 0.65;
        }

        .aurora {
          background:
            radial-gradient(circle at 50% 25%, rgba(32, 255, 134, 0.18), transparent 36%),
            linear-gradient(180deg, rgba(0,0,0,0.1), rgba(0,0,0,0.86));
        }

        .hero-shell,
        .section-block,
        .spine-section,
        .focus-strip {
          position: relative;
          z-index: 2;
          max-width: 1180px;
          margin: 0 auto;
        }

        .hero-shell {
          min-height: calc(100vh - 80px);
          display: flex;
          align-items: center;
          padding: 28px 0;
        }

        .hero-terminal,
        .section-block,
        .focus-strip {
          width: 100%;
          border: 1px solid rgba(74, 255, 164, 0.38);
          background:
            linear-gradient(135deg, rgba(2, 12, 8, 0.9), rgba(7, 6, 14, 0.88)),
            rgba(0, 0, 0, 0.7);
          box-shadow:
            0 0 42px rgba(27, 255, 139, 0.18),
            inset 0 0 34px rgba(255, 255, 255, 0.035);
          backdrop-filter: blur(14px);
        }

        .hero-terminal {
          border-radius: 28px;
          overflow: hidden;
        }

        .terminal-topline {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          padding: 14px 18px;
          border-bottom: 1px solid rgba(74, 255, 164, 0.26);
          color: rgba(176, 255, 211, 0.86);
          font-family: monospace;
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }

        .hero-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.14fr) minmax(320px, 0.86fr);
          gap: 32px;
          padding: clamp(28px, 5vw, 58px);
          align-items: center;
        }

        .hero-logo {
          width: min(440px, 100%);
          height: auto;
          filter: drop-shadow(0 0 22px rgba(195, 255, 0, 0.72));
          margin-bottom: 22px;
        }

        .eyebrow,
        .section-heading p {
          margin: 0 0 12px;
          color: #baff6d;
          font-family: monospace;
          font-size: 12px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
        }

        h1,
        h2,
        h3,
        p {
          letter-spacing: 0;
        }

        h1 {
          max-width: 820px;
          margin: 0;
          font-size: clamp(42px, 7.2vw, 86px);
          line-height: 0.92;
          font-weight: 950;
          color: #ffffff;
          text-shadow:
            0 0 24px rgba(255, 255, 255, 0.18),
            0 0 38px rgba(255, 58, 205, 0.26);
        }

        .subhead {
          max-width: 700px;
          margin: 22px 0 0;
          color: rgba(232, 255, 239, 0.82);
          font-size: clamp(16px, 2vw, 20px);
          line-height: 1.6;
        }

        .hero-actions,
        .board-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 28px;
        }

        .primary-action,
        .secondary-action,
        .ghost-action,
        .ecosystem-card button {
          border-radius: 999px;
          padding: 13px 18px;
          border: 1px solid rgba(255, 255, 255, 0.25);
          font-family: monospace;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          cursor: pointer;
          transition:
            transform 170ms ease,
            box-shadow 170ms ease,
            border-color 170ms ease;
        }

        .primary-action {
          background: linear-gradient(135deg, #d7ff00, #35ff8c);
          color: #071007;
          box-shadow: 0 0 26px rgba(190, 255, 0, 0.54);
        }

        .secondary-action {
          background: rgba(255, 47, 205, 0.12);
          color: #ff9cec;
          border-color: rgba(255, 47, 205, 0.62);
          box-shadow: 0 0 22px rgba(255, 47, 205, 0.22);
        }

        .ghost-action {
          background: rgba(255, 255, 255, 0.055);
          color: rgba(245, 255, 239, 0.88);
          border-color: rgba(255, 255, 255, 0.22);
        }

        .primary-action:hover,
        .secondary-action:hover,
        .ghost-action:hover,
        .ecosystem-card button:hover {
          transform: translateY(-2px);
        }

        .signal-panel {
          display: grid;
          gap: 14px;
        }

        .signal-card,
        .mini-status,
        .board-terminal-card {
          border-radius: 22px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.07);
          box-shadow: inset 0 0 24px rgba(255, 255, 255, 0.04);
        }

        .signal-card {
          padding: 28px;
          min-height: 260px;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          background:
            linear-gradient(150deg, rgba(255, 47, 205, 0.16), transparent 45%),
            radial-gradient(circle at 50% 18%, rgba(190, 255, 0, 0.22), transparent 34%),
            rgba(255, 255, 255, 0.06);
        }

        .signal-label,
        .mini-status span,
        .board-terminal-header span {
          color: #6ffff0;
          font-family: monospace;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.22em;
          text-transform: uppercase;
        }

        .signal-title {
          margin-top: 18px;
          font-size: clamp(28px, 4vw, 46px);
          line-height: 1;
          font-weight: 950;
        }

        .signal-line {
          margin-top: 10px;
          color: rgba(244, 255, 241, 0.76);
          font-size: 15px;
        }

        .mini-status-grid {
          display: grid;
          gap: 10px;
        }

        .mini-status {
          padding: 14px 16px;
        }

        .mini-status strong {
          display: block;
          margin-top: 6px;
          color: #fffbd6;
          font-size: 14px;
        }

        .section-block {
          margin-top: 28px;
          border-radius: 28px;
          padding: clamp(24px, 4vw, 42px);
        }

        .section-heading {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          align-items: end;
          margin-bottom: 22px;
        }

        .section-heading h2,
        .board-preview-copy h2 {
          margin: 0;
          color: #ffffff;
          font-size: clamp(30px, 4.4vw, 54px);
          line-height: 1;
        }

        .ecosystem-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
        }

        .ecosystem-card {
          overflow: hidden;
          border-radius: 22px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.075);
        }

        .ecosystem-card.ryderz {
          box-shadow: 0 0 24px rgba(255, 55, 68, 0.22);
        }

        .ecosystem-card.store {
          box-shadow: 0 0 24px rgba(255, 220, 72, 0.2);
        }

        .ecosystem-card.board {
          box-shadow: 0 0 24px rgba(72, 255, 184, 0.22);
        }

        .card-image {
          height: 210px;
          background: rgba(0, 0, 0, 0.42);
          overflow: hidden;
        }

        .card-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          opacity: 0.88;
        }

        .card-image-board img {
          object-position: 50% 18%;
          transform: scale(1.08);
        }

        .card-copy {
          padding: 20px;
        }

        .card-copy span {
          color: #baff6d;
          font-family: monospace;
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }

        .card-copy h3 {
          margin: 10px 0 8px;
          color: #ffffff;
          font-size: 24px;
        }

        .card-copy p,
        .board-preview-copy p {
          color: rgba(238, 255, 238, 0.76);
          line-height: 1.6;
        }

        .ecosystem-card button {
          margin-top: 14px;
          background: rgba(0, 0, 0, 0.5);
          color: #dfffe8;
        }

        .spine-section {
          margin-top: 28px;
          padding: clamp(34px, 6vw, 70px) 20px;
          text-align: center;
          border-top: 1px solid rgba(186, 255, 109, 0.34);
          border-bottom: 1px solid rgba(255, 47, 205, 0.3);
        }

        .spine-section p {
          max-width: 980px;
          margin: 0 auto;
          color: #fff;
          font-size: clamp(28px, 5vw, 58px);
          line-height: 1.05;
          font-weight: 950;
          text-shadow:
            0 0 22px rgba(186, 255, 109, 0.24),
            0 0 28px rgba(255, 47, 205, 0.18);
        }

        .board-preview-block {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(320px, 0.78fr);
          gap: 24px;
          align-items: stretch;
        }

        .feature-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 20px;
        }

        .feature-pills span {
          border-radius: 999px;
          padding: 9px 12px;
          border: 1px solid rgba(111, 255, 240, 0.38);
          color: #cffffb;
          background: rgba(111, 255, 240, 0.08);
          font-family: monospace;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .board-terminal-card {
          padding: 22px;
          background:
            radial-gradient(circle at 80% 0%, rgba(255, 47, 205, 0.2), transparent 38%),
            rgba(255, 255, 255, 0.075);
        }

        .board-terminal-header strong {
          display: block;
          margin-top: 10px;
          color: #ffffff;
          font-size: 24px;
        }

        .board-terminal-list {
          display: grid;
          gap: 12px;
          margin-top: 22px;
        }

        .board-terminal-list div {
          border-radius: 16px;
          padding: 14px;
          background: rgba(0, 0, 0, 0.35);
          border: 1px solid rgba(255, 255, 255, 0.12);
        }

        .board-terminal-list b,
        .board-terminal-list span {
          display: block;
        }

        .board-terminal-list b {
          color: #baff6d;
        }

        .board-terminal-list span {
          margin-top: 5px;
          color: rgba(238, 255, 238, 0.7);
          font-size: 13px;
          line-height: 1.45;
        }

        .focus-strip {
          display: grid;
          grid-template-columns: 0.8fr repeat(3, 1fr);
          gap: 12px;
          align-items: center;
          margin-top: 28px;
          padding: 16px;
          border-radius: 22px;
        }

        .focus-strip > span {
          color: #ff9cec;
          font-family: monospace;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.2em;
          text-transform: uppercase;
        }

        .focus-strip div {
          border-left: 1px solid rgba(255, 255, 255, 0.14);
          padding-left: 14px;
        }

        .focus-strip strong {
          display: block;
          color: #ffffff;
        }

        .focus-strip p {
          margin: 5px 0 0;
          color: rgba(238, 255, 238, 0.68);
          font-size: 13px;
        }

        @media (max-width: 920px) {
          .hero-grid,
          .ecosystem-grid,
          .board-preview-block,
          .focus-strip {
            grid-template-columns: 1fr;
          }

          .hero-shell {
            align-items: flex-start;
          }

          .terminal-topline,
          .section-heading {
            flex-direction: column;
            align-items: flex-start;
          }
        }

        @media (max-width: 640px) {
          .home-root {
            padding: 18px 12px 44px;
          }

          .hero-grid,
          .section-block {
            padding: 22px;
          }

          .terminal-topline {
            font-size: 9px;
          }

          .hero-actions,
          .board-actions {
            flex-direction: column;
          }

          .primary-action,
          .secondary-action,
          .ghost-action {
            width: 100%;
          }
        }
      `}</style>
    </main>
  );
}
