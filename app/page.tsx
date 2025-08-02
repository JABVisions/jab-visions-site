'use client';
import Image from 'next/image';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const HORSEMAN_CODES = [
  '[TARGET]',
  'Keven_Hart',
  '[ID: 017]',
  'STATUS: ACTIVE',
  'AURA: PINK',
  'Patient Redeemer',
  'POWER_LEVEL: 92.3%',
  'FAULTS:',
  'overconfidence',
  'absent-minded',
  'INFLUENCE: HIGH',
  'team morale',
  'DATA LINK:',
  'Ryderz_Team_v5.7',

  '[TARGET]',
  'Ruby_Wong',
  '[ID: 031]',
  'STATUS: ACTIVE',
  'AURA: RED',
  'Emerald of Envy',
  'POWER_LEVEL: 88.1%',
  'TRAITS:',
  'multiplicity',
  'emotional volatility',
  'RISKS:',
  'fragmentation',
  'jealousy spikes',

  '[TARGET]',
  'Leo_Montana',
  '[ID: 026]',
  'STATUS: ACTIVE',
  'AURA: YELLOW',
  'Heir of Pride',
  'POWER_LEVEL: 79.6%',
  'DOMINANT:',
  'pride',
  'leadership',
  'WEAKNESS:',
  'impulsive',
  'recklessness',

  '[TARGET]',
  'Aaron_Addams',
  '[ID: 042]',
  'STATUS: ACTIVE',
  'AURA: BLACK',
  'Greedy Gatekeeper',
  'POWER_LEVEL: 85.7%',
  'ABILITIES:',
  'teleportation',
  'axe mastery',
  'VULNERABILITIES:',
  'trust issues',
  'isolation',

  '[TARGET]',
  'Zoe_Folie',
  '[ID: 053]',
  'STATUS: ACTIVE',
  'AURA: BLUE',
  'Liberating Lust',
  'POWER_LEVEL: 91.4%',
  'CHARACTER:',
  'reckless',
  'bubbly',
  'INFLUENCE:',
  'high on Aaron_Addams',

  '[ANALYSIS]',
  'Team Dynamics:',
  'COHESION: 74%',
  'TACTICAL EFFECTIVENESS: 81%',
  'VULNERABILITY:',
  'emotional fractures detected',
  'RECOMMENDATION:',
  'Target fractures for disruption',

  '[ENVIRONMENT]',
  'Current Battlefield:',
  'LOCATION:',
  'Van Cortlandt Park',
  'WEATHER:',
  'overcast',
  'slight haze',
  'OBSTACLES:',
  'dense urban foliage',
  'enemy patrols',

  '[THREAT]',
  'Lilly_James',
  '[Horseman of Famine]',
  'STATUS:',
  'ESCALATING',
  'POWER_LEVEL: 95.2%',
  'ABILITIES:',
  'absorption',
  'animal uprising',
  'TARGET:',
  'Ryderz team',
  'RECOMMENDATION:',
  'Neutralize ASAP',

  '[PROTOCOL]',
  'Seven_Bowls Activation:',
  'BOWL 1:',
  'SPLILLED',
  'BOWL 2:',
  'SPLILLED',
  'BOWL 3:',
  'ACTIVE',
  'BOWL 4:',
  'PENDING',
  'BOWL 5:',
  'LOCKED',
  'BOWL 6:',
  'LOCKED',
  'BOWL 7:',
  'LOCKED',

  '[SYSTEM]',
  'Update:',
  'new host detected',
  'TARGET:',
  'Lilly_James',
  'SYMBOISES:',
  'lust',
  'famine',
  'faith',
  'WARNING:',
  'unpredictable fusion state',

  'END OF TRANSMISSION',
];

const PERSISTENT_COUNT = 8;
const TRANSIENT_MAX = 20;
const GRID_COLS = 12;
const GRID_ROWS = 8;
const CELL_WIDTH_VW = 92 / GRID_COLS;
const CELL_HEIGHT_VH = 88 / GRID_ROWS;

function generateGridCells() {
  const cells = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      cells.push({ col, row });
    }
  }
  return cells;
}

function pickRandomCells(n, excludeCells = []) {
  const cells = generateGridCells().filter(
    (c) => !excludeCells.some((ec) => ec.col === c.col && ec.row === c.row)
  );
  const picked = [];
  while (picked.length < n && cells.length > 0) {
    const idx = Math.floor(Math.random() * cells.length);
    picked.push(cells.splice(idx, 1)[0]);
  }
  return picked;
}

function cellToPosition(cell) {
  return {
    left: 4 + cell.col * CELL_WIDTH_VW + CELL_WIDTH_VW / 2,
    top: 6 + cell.row * CELL_HEIGHT_VH + CELL_HEIGHT_VH / 2,
  };
}

export default function Home() {
  const router = useRouter();
  const canvasRef = useRef(null);

  // Matrix background effect canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    const fontSize = 14;
    const columns = Math.floor(width / fontSize);
    const drops = new Array(columns).fill(0).map(() => Math.random() * height);

    const chars = '0123456789ABCDEFλΔΨ⌬▢▣▤▥▦▧';

    function draw() {
      ctx.fillStyle = 'rgba(0, 10, 0, 0.1)';
      ctx.fillRect(0, 0, width, height);
      ctx.font = `${fontSize}px monospace`;

      for (let i = 0; i < columns; i++) {
        const text = chars.charAt(Math.floor(Math.random() * chars.length));
        const x = i * fontSize;
        const y = drops[i] * 1;

        const brightness = 50 + Math.min(205, 15 * (i % 8));
        ctx.fillStyle = `rgba(50, ${brightness}, 50, 0.9)`;
        ctx.shadowColor = `rgba(0, 255, 150, 0.7)`;
        ctx.shadowBlur = 4;
        ctx.fillText(text, x, y);

        drops[i] += 0.8 + 0.2 * Math.sin(i + Date.now() / 500);

        if (drops[i] * fontSize > height && Math.random() > 0.975) {
          drops[i] = 0;
        }
      }

      animationFrameId = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  const [persistentCodes, setPersistentCodes] = useState(
    HORSEMAN_CODES.slice(0, PERSISTENT_COUNT).map(() => '')
  );
  const [persistentPositions, setPersistentPositions] = useState([]);
  const [persistentIndices, setPersistentIndices] = useState(
    Array(PERSISTENT_COUNT).fill(0)
  );
  const [transientCodes, setTransientCodes] = useState([]);
  const [transientPositions, setTransientPositions] = useState([]);

  useEffect(() => {
    const persistentCells = pickRandomCells(PERSISTENT_COUNT);
    setPersistentPositions(persistentCells.map(cellToPosition));
  }, []);

  useEffect(() => {
    let running = true;
    const intervals = [];

    for (let i = 0; i < PERSISTENT_COUNT; i++) {
      intervals.push(
        setInterval(() => {
          if (!running) return;

          setPersistentIndices((prevIndices) => {
            const newIndices = [...prevIndices];
            const fullCode = HORSEMAN_CODES[i];
            const shouldType = i % 2 === 0;
            if (shouldType) {
              let nextIndex = newIndices[i] + 1;
              if (nextIndex > fullCode.length) {
                nextIndex = 0;
              }
              newIndices[i] = nextIndex;
            } else {
              newIndices[i] = fullCode.length;
            }
            return newIndices;
          });

          setPersistentCodes((prev) => {
            const newArr = [...prev];
            const fullCode = HORSEMAN_CODES[i];
            const currIdx = persistentIndices[i];
            const sliceLength = currIdx || (i % 2 === 0 ? 0 : fullCode.length);
            newArr[i] = fullCode.slice(0, sliceLength);
            return newArr;
          });
        }, 150 + Math.random() * 150)
      );
    }

    return () => {
      running = false;
      intervals.forEach(clearInterval);
    };
  }, [persistentIndices]);

  useEffect(() => {
    let running = true;

    function addTransient() {
      if (!running) return;

      setTransientCodes((prev) => {
        let next = prev;
        if (prev.length >= TRANSIENT_MAX) {
          const idxToRemove = prev.findIndex(c => c.hasBurst);
          if (idxToRemove >= 0) {
            next = [...prev.slice(0, idxToRemove), ...prev.slice(idxToRemove + 1)];
          } else {
            next = prev.slice(1);
          }
        }

        const randomIdx =
          PERSISTENT_COUNT + Math.floor(Math.random() * (HORSEMAN_CODES.length - PERSISTENT_COUNT));
        const newCode = HORSEMAN_CODES[randomIdx];
        const hasBurst = Math.random() < 0.07;

        const fontSize = [0.6, 0.8, 1][Math.floor(Math.random() * 3)];

        return [...next, { id: Date.now() + Math.random(), text: newCode, hasBurst, fontSize }];
      });

      setTransientPositions((prev) => {
        let next = prev;
        if (next.length >= TRANSIENT_MAX) next = next.slice(1);

        const excludeCells = persistentPositions.map(({ left, top }) => {
          const col = Math.floor((left - 4) / CELL_WIDTH_VW);
          const row = Math.floor((top - 6) / CELL_HEIGHT_VH);
          return { col, row };
        });

        const [cell] = pickRandomCells(1, excludeCells);
        if (cell) {
          next.push(cellToPosition(cell));
        } else {
          next.push({ left: 50, top: 50 });
        }
        return next;
      });
    }

    const interval = setInterval(() => {
      addTransient();
    }, 160 + Math.random() * 320);

    return () => {
      running = false;
      clearInterval(interval);
    };
  }, [persistentPositions]);

  useEffect(() => {
    if (transientCodes.length === 0) return;
    const burstCodes = transientCodes.filter((c) => c.hasBurst);
    if (burstCodes.length === 0) return;

    const lastBurst = burstCodes[burstCodes.length - 1];
    const timer = setTimeout(() => {
      setTransientCodes((prev) =>
        prev.filter((c) => c.id !== lastBurst.id)
      );
      setTransientPositions((prev) => prev.slice(1));
    }, 900);

    return () => clearTimeout(timer);
  }, [transientCodes]);

  const handleEnterSite = () => router.push('/those-ryderz');

  return (
    <main className="relative min-h-screen w-full bg-black flex flex-col items-center justify-center overflow-hidden">
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 0,
          backgroundColor: '#000',
        }}
      />

      <div className="absolute inset-0 z-10 pointer-events-none">
        {persistentCodes.map((code, idx) => (
          <span
            key={'persistent-' + idx}
            className="block text-green-400 font-mono select-none"
            style={{
              position: 'absolute',
              left: `${persistentPositions[idx]?.left || 50}vw`,
              top: `${persistentPositions[idx]?.top || 30}vh`,
              filter: 'drop-shadow(0 0 10px #0ff) blur(0.7px)',
              letterSpacing: '0.05em',
              whiteSpace: 'nowrap',
              userSelect: 'none',
              fontSize: '1rem',
              maxWidth: '20vw',
              overflowWrap: 'break-word',
            }}
          >
            {code || <span className="text-green-700">.</span>}
          </span>
        ))}
      </div>

      <div className="absolute inset-0 z-20 pointer-events-none">
        {transientCodes.map((codeObj, idx) => {
          const pos = transientPositions[idx] || { left: 50, top: 30 };
          return (
            <span
              key={'transient-' + codeObj.id}
              style={{
                position: 'absolute',
                left: `${pos.left}vw`,
                top: `${pos.top}vh`,
                userSelect: 'none',
                pointerEvents: 'none',
                fontSize: `${codeObj.fontSize}rem`,
                maxWidth: '18vw',
                whiteSpace: 'nowrap',
                filter: 'drop-shadow(0 0 10px #0ff) blur(0.7px)',
                letterSpacing: '0.04em',
                overflowWrap: 'break-word',
              }}
            >
              <span
                className={`block text-green-400 font-mono select-none ${
                  codeObj.hasBurst ? 'transition-opacity duration-700 ease-in-out' : ''
                }`}
                style={{
                  animation: codeObj.hasBurst ? 'fadeOut 0.9s forwards' : 'none',
                  animationDelay: codeObj.hasBurst ? `${(idx / transientCodes.length) * 0.5}s` : '0s',
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                {codeObj.text}
              </span>

              {codeObj.hasBurst && (
                <span
                  className="absolute inset-0 block pointer-events-none pixel-burst-haze"
                  aria-hidden="true"
                  style={{ zIndex: 2 }}
                >
                  {[...Array(12)].map((_, i) => {
                    const leftPx = Math.random() * 94;
                    const topPx = Math.random() * 94;
                    const widthPx = 1 + Math.random() * 3;
                    const heightPx = 10 + Math.random() * 25;
                    const opacityVal = Math.random() * 0.3 + 0.25;
                    return (
                      <span
                        key={`thin-pixel-${codeObj.id}-${i}`}
                        className={`pixel-tv-static pixel-flicker-thin-${(i % 3) + 1}`}
                        style={{
                          position: 'absolute',
                          left: `${leftPx}%`,
                          top: `${topPx}%`,
                          width: `${widthPx}px`,
                          height: `${heightPx}px`,
                          opacity: opacityVal,
                          borderRadius: '2.5px',
                          background: 'linear-gradient(90deg, #6bf1ffcc, #00d9ff99, #6bf1ffcc)',
                          boxShadow: `
                            0 0 10px #00eaffcc,
                            1.5px 0 5px #ff88aaff,
                            -1.5px 0 5px #44ffccbb,
                            0 1.5px 6px #44aaffcc
                          `,
                          filter: 'drop-shadow(0 0 7px #00ffffc0)',
                          willChange: 'transform, opacity',
                          animation: 'pixel-jitter 0.6s infinite ease-in-out alternate',
                        }}
                      />
                    );
                  })}
                </span>
              )}
            </span>
          );
        })}
      </div>

      <div className="z-30 flex justify-center mt-8 mb-1 w-full">
        <Image
          src="/assets/jab-logo@2x.png"
          alt="JAB Logo"
          width={440}
          height={100}
          priority
          className="mx-auto mb-4 drop-shadow-2xl"
          style={{
            width: '440px',
            height: 'auto',
            maxWidth: '680px',
            objectFit: 'contain',
            filter: 'brightness(1.22) drop-shadow(0 0 44px #0fffc3de)',
          }}
        />
      </div>

      <div className="z-40 mb-4">
        <span
          className="block text-center font-mono text-[1.1rem] md:text-xl text-green-300/90 tracking-widest
          bg-black/70 px-5 py-2 rounded-lg shadow-lg border border-green-400/30
          animate-pulse"
        >
          [production in progress.]
        </span>
      </div>

      <div className="mt-10 z-50 flex justify-center">
        <button
          className="
            px-10 py-4 bg-transparent border-2 border-green-400 text-green-300
            rounded-xl font-mono text-xl tracking-wide shadow-lg
            backdrop-blur-[2.5px] opacity-80 hover:opacity-100
            flex items-center
            relative enter-site-btn
          "
          style={{
            borderRadius: '1.28rem',
            border: '2.7px solid #22ff77',
            letterSpacing: '0.11em',
            boxShadow: '0 0 20px #00fd96c7, 0 0 1.8px #0f0',
            textShadow: '0 0 12px #3fefbe90',
            fontWeight: 700,
            background: 'linear-gradient(92deg, #132e13e8 32%, #000 80%)',
            color: '#38fd92',
            filter: 'blur(0.01px)',
          }}
          onClick={handleEnterSite}
        >
          [ <span className="mx-1">Enter Site</span> ]
        </button>
      </div>

      <style jsx global>{`
        @keyframes fadeOut {
          0% {
            opacity: 1;
          }
          80% {
            opacity: 0.1;
          }
          100% {
            opacity: 0;
          }
        }
        @keyframes pixel-jitter {
          0% {
            transform: translateY(0);
            opacity: 0.7;
          }
          50% {
            transform: translateY(-1.5px);
            opacity: 1;
          }
          100% {
            transform: translateY(0);
            opacity: 0.7;
          }
        }
        .pixel-tv-static {
          position: absolute;
          will-change: transform, opacity;
          pointer-events: none;
          transition: box-shadow 0.3s ease;
        }
        .pixel-flicker-thin-1 {
          animation: pixel-thin-flicker-a 1.1s linear infinite;
        }
        .pixel-flicker-thin-2 {
          animation: pixel-thin-flicker-b 0.9s linear infinite;
        }
        .pixel-flicker-thin-3 {
          animation: pixel-thin-flicker-c 1.05s linear infinite;
        }
        @keyframes pixel-thin-flicker-a {
          0%, 100% {
            opacity: 0.45;
          }
          50% {
            opacity: 0.7;
          }
        }
        @keyframes pixel-thin-flicker-b {
          0%, 100% {
            opacity: 0.5;
          }
          40%, 80% {
            opacity: 0.75;
          }
        }
        @keyframes pixel-thin-flicker-c {
          0%, 100% {
            opacity: 0.48;
          }
          30%, 70% {
            opacity: 0.72;
          }
        }
        .enter-site-btn {
          box-shadow: 0 0 15px #08e97355, 0 0 2.5px #0f0;
          transition: box-shadow 0.21s, background 0.22s, border-color 0.13s;
        }
        .enter-site-btn:hover {
          background: rgba(10, 32, 15, 0.44);
          border-color: #46ffbc;
          color: #79ffe3;
          box-shadow: 0 0 28px #48fddb, 0 0 7.5px #22ff99;
        }
      `}</style>
    </main>
  );
}

