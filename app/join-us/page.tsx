'use client';

import Navbar from '@/components/Navbar';
import RegisterForm from '@/components/RegisterForm';
import React from 'react';

const steelFont = "'Anton', Impact, Arial Black, sans-serif";

// Splits text into spans for metallic shine effect
function splitTitle(text: string) {
  return Array.from(text).map((char, i) =>
    char === ' '
      ? <span key={i} style={{ width: '0.45em', display: 'inline-block' }} />
      : <span
          key={i}
          className="shine-in-text"
          style={{ ['--i' as any]: i } as React.CSSProperties}
        >
          {char}
        </span>
  );
}

export default function JoinUs() {
  return (
    <main className="bg-neutral-900 text-white flex flex-col items-center px-4 py-8">
      {/* Navbar */}
      <Navbar />

      {/* Hero Video */}
      <div className="w-full relative z-10 mb-4">
        <video
          src="/assets/ryderz-hero.mov"
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-[200px] md:h-[280px] lg:h-[340px] object-cover object-center"
        />
      </div>

      {/* Metallic JOIN US Title with Wing Images */}
      <div className="flex items-center gap-4 mt-8 mb-6">
        {/* Left Wing Image */}
        <img
          src="/assets/Left_Wing.png"
          alt="Left Wing"
          className="wing-left w-36 h-36 object-contain"
        />

        <h1
          className="flex text-6xl md:text-7xl font-extrabold uppercase metallic-title"
          style={{ fontFamily: steelFont, letterSpacing: '0.12em' }}
        >
          {splitTitle('JOIN US')}
        </h1>

        {/* Right Wing Image */}
        <img
          src="/assets/Right_Wing.png"
          alt="Right Wing"
          className="wing-right w-36 h-36 object-contain transform scale-x-[-1]"
        />
      </div>

      {/* Registration Features Description */}
      <p className="text-center text-zinc-300 max-w-2xl text-base md:text-lg mb-4 px-4">
        Welcome to the <span className="text-green-400">Those Ryderz</span> registration portal! Please complete the form below to join our production team.
      </p>
      <ul className="list-disc list-inside text-green-400 max-w-2xl mb-12 px-4">
        <li>Secure and instant data submission</li>
        <li>Interactive glitch-style input highlights</li>
        <li>Real-time confirmation and feedback</li>
      </ul>

      {/* SignNow Release Link */}
      <p className="text-center text-zinc-300 max-w-2xl text-base md:text-lg mb-10 px-4">
        You can also{' '}
        <a
          href="https://signnow.com/s/t7rt43y5"
          target="_blank"
          className="text-sky-400 hover:underline"
        >
          sign our General Talent Release Form
        </a>{' '}
        before or after registering.
      </p>

      {/* Bracketed & Animated Registration Board */}
      <div className="relative w-full max-w-3xl mb-16 registration-board">
        <RegisterForm />
      </div>

      {/* Global Styles */}
      <style jsx global>{`
        .metallic-title {
          background: none !important;
          color: transparent;
        }
        .shine-in-text {
          display: inline-block;
          position: relative;
          background:
            linear-gradient(112deg,
              #fdfdfd 0%,
              #c7cbd1 16%,
              #b1b3b6 29%,
              #ededed 36%,
              #f4f4fc 49%,
              #c9dbfe 56%,
              #f9f4ff 60%,
              #c1f8ff 68%,
              #dadada 76%,
              #f4cadf 85%,
              #ffffff 100%
            ),
            linear-gradient(112deg,
              transparent 72%,
              #fff 85%,
              transparent 100%
            );
          background-size:160% 100%,220% 100%;
          background-position:80% 0,-120% 0;
          -webkit-background-clip:text;
          -webkit-text-fill-color:transparent;
          background-clip:text;
          animation:shine-in-text 2.5s cubic-bezier(.63,0,.17,1) infinite;
          animation-delay:calc(0.12s * var(--i));
          transition:background .5s;
          filter:drop-shadow(0 1.5px 1px #e9e9f7aa);
        }
        @keyframes shine-in-text {
          0%{background-position:80% 0,-120% 0}
          30%{background-position:30% 0,50% 0}
          60%{background-position:0 0,120% 0}
          100%{background-position:80% 0,-120% 0}
        }
        .wing-left {
          animation: flap-left 2s ease-in-out infinite;
          transform-origin: center bottom;
        }
        .wing-right {
          animation: flap-right 2s ease-in-out infinite;
          transform-origin: center bottom;
        }
        @keyframes flap-left {
          0%,100% { transform: rotate(5deg); }
          50% { transform: rotate(-15deg); }
        }
        @keyframes flap-right {
          0%,100% { transform: rotate(-5deg); }
          50% { transform: rotate(15deg); }
        }
        .registration-board {
          background-color:#000;
          border:2px solid #00FF00;
          border-radius:1rem;
          box-shadow:0 0 16px 6px rgba(0,255,0,0.5);
          padding:2.5rem;
          margin:0 auto;
          animation: board-glow 3s ease-in-out infinite;
        }
        @keyframes board-glow {
          0%,100% { box-shadow: 0 0 16px 6px rgba(0,255,0,0.5); }
          50% { box-shadow: 0 0 24px 10px rgba(0,255,0,0.8); }
        }
      `}</style>
    </main>
  );
}