'use client';

import Image from 'next/image';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [announcementsOpen, setAnnouncementsOpen] = useState(true);

  const handleEnterSite = () => router.push('/those-ryderz');
  const handleJoin = () => router.push('/board/signup');
  const handleLogin = () => router.push('/board/login');
  const handleStore = () => {
    window.location.href = 'https://store.jabvisions.com';
  };

  /* MATRIX BACKGROUND */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const fontSize = 14;
    const columns = Math.floor(canvas.width / fontSize);
    const drops = Array(columns).fill(0);
    const chars = '0123456789ABCDEFλΔΨ';

    function draw() {
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#00ff9c';
      ctx.font = `${fontSize}px monospace`;

      for (let i = 0; i < drops.length; i++) {
        const text = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(text, i * fontSize, drops[i] * fontSize);
        drops[i]++;
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.98) {
          drops[i] = 0;
        }
      }
      requestAnimationFrame(draw);
    }
    draw();
  }, []);

  return (
    <main className="relative min-h-screen w-full bg-black flex flex-col items-center justify-center overflow-hidden">
      <canvas ref={canvasRef} className="fixed inset-0 z-0" />

      {/* 🟡 ANNOUNCEMENTS – BELOW NAVBAR (LEFT) */}
      <div className="announce-wrap">
        <button
          className="announce-tab"
          onClick={() => setAnnouncementsOpen(v => !v)}
        >
          📣 ANNOUNCEMENTS {announcementsOpen ? '▾' : '▸'}
        </button>

        {announcementsOpen && (
          <div className="announce-panel">
            <div>• JAB Visions™ Board is coming: A social media community</div>
            <div>• Those Ryderz in production</div>
            <div>• Now casting: Zoe Folie (The Blue Ryder)</div>
          </div>
        )}
      </div>

      {/* 🟣 STORE BAG – BELOW NAVBAR (RIGHT) */}
      <div className="store-bag-wrap">
        <button onClick={handleStore} aria-label="JAB Visions Store">
          <div className="store-bag-handle" />
          <div className="store-bag-body">🛍️</div>
        </button>
        <span className="store-bag-label">JAB Visions™ Store</span>
      </div>

      {/* LOGO */}
      <Image
        src="/assets/jab-logo@2x.png"
        alt="JAB Logo"
        width={440}
        height={100}
        priority
        className="z-30 mb-6 drop-shadow-2xl"
      />

      {/* CTA BUTTONS */}
      <div className="z-40 flex flex-col items-center gap-4">
        <button className="enter-site-btn" onClick={handleJoin}>
          [ Join JAB Visions™ Board ]
        </button>
        <button className="enter-site-btn" onClick={handleEnterSite}>
          [ Enter Site ]
        </button>
        <button className="enter-site-btn-secondary" onClick={handleLogin}>
          [ Log In ]
        </button>
      </div>

      {/* STYLES */}
      <style jsx global>{`
        :root {
          /* Navbar is roughly 80px (ptoughly pt-20). Adjust if your navbar changes. */
          --nav-offset: 92px; /* 80px navbar + 12px breathing room */
        }

        /* CTA */
        .enter-site-btn {
          padding: 1rem 2.5rem;
          font-family: monospace;
          border: 2px solid #22ff77;
          background: transparent;
          color: #22ff77;
          border-radius: 1.3rem;
          letter-spacing: 0.12em;
          box-shadow: 0 0 18px #22ff77;
          transition: all 0.2s ease;
        }
        .enter-site-btn:hover {
          background: rgba(0, 255, 160, 0.15);
          box-shadow: 0 0 28px #66ffcc;
        }
        .enter-site-btn-secondary {
          padding: 0.7rem 2rem;
          border: 1.5px solid #22ff77aa;
          background: transparent;
          color: #22ff77aa;
          border-radius: 1rem;
          font-family: monospace;
        }

        /* ANNOUNCEMENTS */
        .announce-wrap {
          position: fixed;
          top: var(--nav-offset);
          left: 20px;
          z-index: 60; /* high, but not absurdly above everything */
        }
        .announce-tab {
          padding: 12px 16px;
          border-radius: 16px;
          border: 2.5px solid #ffd64a;
          background: linear-gradient(145deg, #2a2308, #000);
          color: #ffefb7;
          font-family: monospace;
          letter-spacing: 0.12em;
          box-shadow: 0 0 30px #ffd64a;
          cursor: pointer;
        }
        .announce-panel {
          margin-top: 10px;
          padding: 12px 14px;
          border-radius: 16px;
          border: 2px solid #ffd64a66;
          background: rgba(0, 0, 0, 0.7);
          color: #ffefb7;
          font-family: monospace;
          box-shadow: 0 0 26px #ffd64a55;
        }

        /* STORE BAG */
        .store-bag-wrap {
          position: fixed;
          top: var(--nav-offset);
          right: 20px;
          z-index: 60; /* match announcements */
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
        }
        .store-bag-wrap button {
          position: relative;
          width: 150px;
          height: 180px;
          background: transparent;
          border: none;
          cursor: pointer;
        }
        .store-bag-handle {
          position: absolute;
          top: 8px;
          left: 50%;
          transform: translateX(-50%);
          width: 70px;
          height: 28px;
          border: 4px solid #ff4fd8;
          border-bottom: none;
          border-radius: 20px 20px 0 0;
          box-shadow: 0 0 20px #ff4fd8;
        }
        .store-bag-body {
          position: absolute;
          bottom: 0;
          width: 150px;
          height: 140px;
          border-radius: 22px;
          border: 4px solid #ff4fd8;
          background: linear-gradient(145deg, #2a0f23, #000);
          box-shadow: 0 0 50px #ff4fd8;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 3.2rem;
        }
        .store-bag-label {
          font-family: monospace;
          font-size: 13px;
          letter-spacing: 0.14em;
          color: #ff9de8;
          text-shadow: 0 0 14px #ff5fd9;
        }
      `}</style>
    </main>
  );
}
// touch
