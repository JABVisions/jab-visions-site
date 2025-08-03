'use client';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import Form from '@/components/form';

const heavenlyFont = "'Playfair Display', serif";
const steelFont = "'Anton', Impact, Arial Black, sans-serif";

function splitTitle(text: string) {
  return Array.from(text).map((char, i) =>
    char === ' '
      ? <span key={i} style={{ width: '0.45em', display: 'inline-block' }} />
      : <span key={i} className="shine-in-text">{char}</span>
  );
}

export default function JoinUsPage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white flex flex-col items-center px-4 md:px-12 pt-16 pb-24">
      <Navbar />

      {/* Luminous Background */}
      <div className="pointer-events-none absolute left-10 top-40 w-80 h-48 bg-gradient-to-br from-green-200 via-emerald-200/50 to-transparent blur-3xl opacity-70 z-0" />
      <div className="pointer-events-none absolute right-10 top-80 w-96 h-56 bg-gradient-to-tl from-green-100 via-emerald-300/40 to-transparent blur-2xl opacity-60 z-0" />
      <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-1/2 w-[600px] h-44 bg-gradient-to-br from-green-50 via-white/60 to-emerald-200/30 blur-3xl opacity-50 z-0" />

      {/* Title */}
      <h1
        className="mt-4 mb-4 text-5xl md:text-6xl font-extrabold tracking-widest metallic-title text-center z-10 uppercase select-none steel-font"
        style={{
          letterSpacing: '0.13em',
          fontFamily: steelFont,
          display: 'flex',
          justifyContent: 'center',
          gap: '0.05em'
        }}
      >
        {splitTitle('JOIN US')}
      </h1>

      {/* Description */}
      <p className="max-w-xl text-lg text-zinc-300 text-center mb-10">
        Welcome to the official sign-up page for the cast and crew of <strong>Those Ryderz</strong>, a JAB Visions™ production. Use the links below to complete your release and registration forms so we can move forward with production smoothly.
      </p>

      {/* Action Buttons */}
      <div className="flex flex-col md:flex-row gap-6 items-center justify-center mb-14 z-10">
        <Link
          href="https://signnow.com/s/t7rt43y5"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-6 rounded-lg shadow-lg transition-all duration-300 border border-emerald-400"
        >
          Sign General Talent Release
        </Link>

        <a
          href="#register"
          className="bg-transparent hover:bg-emerald-600 text-emerald-300 hover:text-white font-semibold py-3 px-6 rounded-lg border border-emerald-400 transition-all duration-300"
        >
          Register Your Info
        </a>
      </div>

      {/* Registration Form */}
      <div id="register" className="w-full max-w-2xl z-10">
        <Form />
      </div>

      {/* Title FX Styles */}
      <style jsx global>{`
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
      `}</style>
    </main>
  );
}
