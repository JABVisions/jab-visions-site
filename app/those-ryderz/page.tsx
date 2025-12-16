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
  { name: 'Rubi Wong',    title: 'The Red Ryder',    img: '/assets/chaeyeon-kim-headshot.jpeg', aura: 'red'    },
  { name: 'Leo Montana',  title: 'The Yellow Ryder', img: '/assets/haylee-brown-headshot.jpeg', aura: 'yellow' },
  { name: 'Aaron Addams', title: 'The Black Ryder',  img: '/assets/hadi-taloustan-headshot.jpg', aura: 'black'  },
  { name: 'Zoe Folie',    title: 'The Blue Ryder',   img: '/assets/nowcasting-blue.jpg',        aura: 'blue'   },
  { name: 'Keven Hart',   title: 'The Pink Ryder',   img: '/assets/john_andy_headshot.jpg',     aura: 'pink'   },
] as const;

/* EDIT #1: Darkened black aura ring + outer glow */
const auraGlow = {
  pink:   'shadow-[0_0_32px_8px_rgba(255,85,204,0.7)] ring-4 ring-pink-400',
  black:  'shadow-[0_0_40px_10px_rgba(0,0,0,0.95)] ring-4 ring-black',
  yellow: 'shadow-[0_0_32px_8px_rgba(255,230,0,0.7)] ring-4 ring-yellow-300',
  red:    'shadow-[0_0_32px_8px_rgba(255,48,48,0.7)] ring-4 ring-red-400',
  blue:   'shadow-[0_0_32px_8px_rgba(40,180,255,0.7)] ring-4 ring-sky-400',
} as const;

function BannerHero() {
  return (
    <div className="relative w-full z-10" style={{ background: '#0b0b0b' }}>
      <div className="relative w-full h-[380px] md:h-[520px] lg:h-[720px]">
        <Image
          src="/assets/those-ryderz-logo.jpg"
          alt="Those Ryderz — logo banner"
          fill
          className="object-cover"
          style={{ objectPosition: '50% 38%' }}
          priority
          unoptimized
        />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/30" />
    </div>
  );
}

export default function ThoseRyderz() {
  return (
    <main className="min-h-screen bg-neutral-900 flex flex-col items-center justify-start px-0 relative overflow-hidden">
      <Navbar />

      <BannerHero />

      <div className="pointer-events-none absolute left-10 top-40 w-80 h-48 bg-gradient-to-br from-blue-200 via-sky-200/50 to-transparent blur-3xl opacity-70 z-0" />
      <div className="pointer-events-none absolute right-10 top-80 w-96 h-56 bg-gradient-to-tl from-blue-100 via-sky-300/40 to-transparent blur-2xl opacity-60 z-0" />
      <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-1/2 w-[600px] h-44 bg-gradient-to-br from-blue-50 via-white/60 to-sky-200/30 blur-3xl opacity-50 z-0" />

      <div className="w-full flex justify-center z-10 mt-12">
        <span
          className="block text-2xl md:text-3xl font-bold heavenly-tagline text-center mb-6"
          style={{ fontFamily: heavenlyFont, color: '#f4f4ff' }}
        >
          The Spirit Never Left. It Found New Hosts.
        </span>
      </div>

      <p className="max-w-xl text-base md:text-lg text-zinc-400 mb-7 text-center mx-auto z-10">
        In a world unraveling at the seams, five unlikely heroes inherit powers
        from beyond—their destinies forever linked by forces older than time.
      </p>

      <h1
        className="mt-4 mb-8 text-6xl font-extrabold tracking-widest metallic-title text-center z-10 uppercase select-none steel-font"
        style={{
          letterSpacing: '0.13em',
          fontFamily: steelFont,
          display: 'flex',
          justifyContent: 'center',
          gap: '0.05em',
        }}
      >
        {splitTitle('THOSE RYDERZ')}
      </h1>

      <div className="flex flex-row flex-wrap justify-center items-end gap-8 md:gap-12 w-full max-w-6xl mb-16 z-10">
        {RYDERZ.map((r) => (
          <div key={r.name} className="flex flex-col items-center group transition-transform">
            <div
              className={`relative flex items-center justify-center rounded-full overflow-hidden
                ${auraGlow[r.aura]}
                group-hover:scale-110 transition-transform duration-300 ease-in-out`}
              style={{ width: 128, height: 128 }}
            >
              <Image
                src={r.img}
                alt={r.name}
                width={128}
                height={128}
                className="rounded-full object-cover w-full h-full"
                priority
                unoptimized
              />

              {/* EDIT #2: Darkened inner indent glow for Aaron */}
              <div
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{
                  boxShadow: `0 0 40px 24px ${
                    r.aura === 'pink'   ? 'rgba(255,85,204,0.45)' :
                    r.aura === 'black'  ? 'rgba(0,0,0,0.85)'     :
                    r.aura === 'yellow' ? 'rgba(255,230,0,0.28)' :
                    r.aura === 'red'    ? 'rgba(255,48,48,0.36)' :
                                           'rgba(40,180,255,0.38)'
                  }`,
                  zIndex: 2,
                  opacity: r.aura === 'black' ? 0.9 : 0.7,
                }}
              />
            </div>

            <span className="mt-4 text-base md:text-lg text-white font-semibold tracking-wide text-center drop-shadow">
              {r.name}
            </span>
            <span
              className={`text-sm md:text-base font-medium mt-1 ${
                r.aura === 'pink'   ? 'text-pink-400'   :
                r.aura === 'black'  ? 'text-neutral-400':
                r.aura === 'yellow' ? 'text-yellow-300' :
                r.aura === 'red'    ? 'text-red-400'    :
                                      'text-sky-300'
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
          animation: heavenFade 3.2s ease-in-out infinite alternate;
        }
        @keyframes heavenFade {
          0% { opacity: 0.91; }
          50% { opacity: 1; }
          100% { opacity: 0.91; }
        }
        .steel-font { font-family: 'Anton', Impact, 'Arial Black', sans-serif !important; }
        .metallic-title { background: none !important; color: transparent; }
        .shine-in-text {
          display: inline-block;
          background:
            linear-gradient(112deg,#fdfdfd,#c7cbd1,#ededed,#f8f8fc,#c1f8ff,#ffffff);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: shine-in-text 2.5s infinite;
        }
      `}</style>
    </main>
  );
}
