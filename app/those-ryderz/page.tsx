// app/those-ryderz/page.tsx
'use client';
import Image from 'next/image';
import Navbar from '../../components/Navbar';

const heavenlyFont = "'Playfair Display', serif";
const steelFont = "'Anton', Impact, Arial Black, sans-serif";

function splitTitle(text: string) {
  return Array.from(text).map((char, i) =>
    char === ' '
      ? <span key={i} style={{ width: '0.45em', display: 'inline-block' }} />
      : <span key={i} className="shine-in-text">{char}</span>
  );
}

const RYDERZ = [
  {
    name: 'Ruby Wong',
    title: 'The Red Ryder',
    img: '/assets/simran-k-headshot3.jpg',
    aura: 'red',
  },
  {
    name: 'Leo Montana',
    title: 'The Yellow Ryder',
    img: '/assets/haylee-brown-headshot.jpeg',
    aura: 'yellow',
  },
  {
    name: 'Aaron Addams',
    title: 'The Black Ryder',
    img: '/assets/hadi-taloustan-headshot.jpg',
    aura: 'black',
  },
  {
    name: 'Zoe Folie',
    title: 'The Blue Ryder',
    img: '/assets/aria-patterson-headshot.jpg',
    aura: 'blue',
  },
  {
    name: 'Keven Hart',
    title: 'The Pink Ryder',
    img: '/assets/john_andy_headshot.jpg',
    aura: 'pink',
  },
];

const auraGlow: Record<string, string> = {
  pink: 'shadow-[0_0_32px_8px_rgba(255,85,204,0.7)] ring-4 ring-pink-400',
  black: 'shadow-[0_0_32px_8px_rgba(40,40,40,0.7)] ring-4 ring-neutral-800',
  yellow: 'shadow-[0_0_32px_8px_rgba(255,230,0,0.7)] ring-4 ring-yellow-300',
  red: 'shadow-[0_0_32px_8px_rgba(255,48,48,0.7)] ring-4 ring-red-400',
  blue: 'shadow-[0_0_32px_8px_rgba(40,180,255,0.7)] ring-4 ring-sky-400',
};

export default function ThoseRyderz() {
  return (
    <main className="min-h-screen bg-neutral-900 flex flex-col items-center justify-start px-0 relative overflow-hidden">
      <Navbar />

      {/* Hero video - full width, top */}
      <div className="w-full relative z-10">
        <video
          src="/assets/ryderz-hero.mov"
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-[280px] md:h-[360px] lg:h-[420px] object-cover object-top"
          style={{ borderRadius: 0, margin: 0, background: '#101010' }}
        />
      </div>

      {/* Luminous Clouds */}
      <div className="pointer-events-none absolute left-10 top-40 w-80 h-48 bg-gradient-to-br from-blue-200 via-sky-200/50 to-transparent blur-3xl opacity-70 z-0" />
      <div className="pointer-events-none absolute right-10 top-80 w-96 h-56 bg-gradient-to-tl from-blue-100 via-sky-300/40 to-transparent blur-2xl opacity-60 z-0" />
      <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-1/2 w-[600px] h-44 bg-gradient-to-br from-blue-50 via-white/60 to-sky-200/30 blur-3xl opacity-50 z-0" />

      {/* Tagline */}
      <div className="w-full flex justify-center z-10 mt-12">
        <span
          className="block text-2xl md:text-3xl font-bold heavenly-tagline text-center mb-6"
          style={{ fontFamily: heavenlyFont, color: '#f4f4ff' }}
        >
          The Spirit Never Left. It Found New Hosts.
        </span>
      </div>

      {/* Description */}
      <p className="max-w-xl text-base md:text-lg text-zinc-400 mb-7 text-center mx-auto z-10">
        In a world unraveling at the seams, five unlikely heroes inherit powers from beyond—their destinies forever linked by forces older than time.
      </p>

      {/* Chrome Title - subtle chromatic aberration, animated */}
      <h1
        className="mt-4 mb-8 text-6xl font-extrabold tracking-widest metallic-title text-center z-10 uppercase select-none steel-font"
        style={{
          letterSpacing: '0.13em',
          fontFamily: steelFont,
          display: 'flex',
          justifyContent: 'center',
          gap: '0.05em'
        }}
      >
        {splitTitle('THOSE RYDERZ')}
      </h1>

      {/* Ryderz Headshots */}
      <div className="flex flex-row flex-wrap justify-center items-end gap-8 md:gap-12 w-full max-w-6xl mb-16 z-10">
        {RYDERZ.map((r) => (
          <div key={r.name} className="flex flex-col items-center group transition-transform">
            <div
              className={`relative flex items-center justify-center rounded-full overflow-hidden
                ${auraGlow[r.aura as keyof typeof auraGlow]}
                group-hover:scale-110 transition-transform duration-300 ease-in-out`}
              style={{
                width: 128,
                height: 128,
              }}
            >
              <Image
                src={r.img}
                alt={r.name}
                width={128}
                height={128}
                className="rounded-full object-cover w-full h-full"
                priority
              />
              {/* Extra feathered glow */}
              <div
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{
                  boxShadow: `0 0 40px 24px ${
                    r.aura === 'pink'
                      ? 'rgba(255,85,204,0.45)'
                      : r.aura === 'black'
                      ? 'rgba(40,40,40,0.45)'
                      : r.aura === 'yellow'
                      ? 'rgba(255,230,0,0.28)'
                      : r.aura === 'red'
                      ? 'rgba(255,48,48,0.36)'
                      : 'rgba(40,180,255,0.38)'
                  }`,
                  zIndex: 2,
                  opacity: 0.7,
                }}
              />
            </div>
            <span className="mt-4 text-base md:text-lg text-white font-semibold tracking-wide text-center drop-shadow">
              {r.name}
            </span>
            <span
              className={`text-sm md:text-base font-medium mt-1 ${
                r.aura === 'pink'
                  ? 'text-pink-400'
                  : r.aura === 'black'
                  ? 'text-neutral-400'
                  : r.aura === 'yellow'
                  ? 'text-yellow-300'
                  : r.aura === 'red'
                  ? 'text-red-400'
                  : 'text-sky-300'
              } drop-shadow`}
              style={{ letterSpacing: '0.05em' }}
            >
              {r.title}
            </span>
          </div>
        ))}
      </div>

      <style jsx global>{`
        .heavenly-tagline {
          text-shadow:
            0 0 16px #e0f4ff,
            0 0 28px #f4f4ff,
            0 0 38px #b2e6ff,
            0 1px 2px #8ecae6;
          letter-spacing: 0.06em;
          filter: brightness(1.19) blur(0.02em);
          animation: heavenFade 3.2s ease-in-out infinite alternate;
        }
        @keyframes heavenFade {
          0% { opacity: 0.91; filter: brightness(1.08);}
          50% { opacity: 1; filter: brightness(1.27);}
          100% { opacity: 0.91; filter: brightness(1.08);}
        }
        .steel-font {
          font-family: 'Anton', Impact, Arial Black, sans-serif !important;
        }
        .metallic-title {
          background: none !important;
          color: transparent;
        }
        .shine-in-text {
          display: inline-block;
          position: relative;
          background:
            linear-gradient(
              112deg,
              #fdfdfd 0%,
              #c7cbd1 16%,
              #b1b3b6 29%,
              #ededed 36%,
              #f8f8fc 49%,
              #c9dbfe 56%,
              #f9f4ff 60%,
              #c1f8ff 68%,
              #dadada 76%,
              #f4cadf 85%,
              #ffffff 100%
            ),
            linear-gradient(
              112deg,
              transparent 72%,
              #fff 85%,
              transparent 100%
            );
          background-size: 160% 100%, 220% 100%;
          background-position: 80% 0, -120% 0;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          color: transparent;
          animation: shine-in-text 2.5s cubic-bezier(.63,0,.17,1) infinite;
          animation-delay: calc(0.12s * var(--i, 0));
          transition: background 0.5s;
          filter: drop-shadow(0 1.5px 1px #e9e9f7aa);
        }
        .shine-in-text:nth-child(1) { --i: 0; }
        .shine-in-text:nth-child(2) { --i: 1; }
        .shine-in-text:nth-child(3) { --i: 2; }
        .shine-in-text:nth-child(4) { --i: 3; }
        .shine-in-text:nth-child(5) { --i: 4; }
        .shine-in-text:nth-child(6) { --i: 5; }
        .shine-in-text:nth-child(7) { --i: 6; }
        .shine-in-text:nth-child(8) { --i: 7; }
        .shine-in-text:nth-child(9) { --i: 8; }
        .shine-in-text:nth-child(10) { --i: 9; }
        .shine-in-text:nth-child(11) { --i: 10; }
        .shine-in-text:nth-child(12) { --i: 11; }
        .shine-in-text:nth-child(13) { --i: 12; }
        @keyframes shine-in-text {
          0% {
            background-position: 80% 0, -120% 0;
          }
          30% {
            background-position: 30% 0, 50% 0;
          }
          60% {
            background-position: 0% 0, 120% 0;
          }
          100% {
            background-position: 80% 0, -120% 0;
          }
        }
      `}</style>
    </main>
  );
}
