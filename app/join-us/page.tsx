'use client';

import Navbar from '@/components/Navbar';
import Form from '@/components/Form';

const heavenlyFont = "'Playfair Display', serif";
const steelFont = "'Anton', Impact, Arial Black, sans-serif";

export default function JoinUs() {
  return (
    <main className="min-h-screen bg-neutral-900 text-white flex flex-col items-center px-4 pt-6">
      <Navbar />

      {/* Metallic JOIN US Title */}
      <h1
        className="text-5xl md:text-6xl font-extrabold metallic-title uppercase mt-10 mb-4"
        style={{ fontFamily: steelFont, letterSpacing: '0.12em' }}
      >
        JOIN US
      </h1>

      {/* Description */}
      <p className="text-center text-zinc-300 max-w-2xl text-base md:text-lg mb-10 px-2">
        Thank you for your interest in being part of <span className="text-green-400">JAB Visions™</span>.
        Whether you're a cast member, crew technician, or volunteer, please register below so we can keep track of everyone involved in the filming of <i>Those Ryderz</i>.
        You can also <a href="https://signnow.com/s/t7rt43y5" target="_blank" className="text-sky-400 hover:underline">sign our General Talent Release Form</a> after registering.
      </p>

      {/* Registration Form */}
      <Form />

      {/* Metallic Title Styles */}
      <style jsx global>{`
        .metallic-title {
          background: none !important;
          color: transparent;
          display: inline-block;
          background-clip: text;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-image: linear-gradient(
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
          );
          animation: metallicPulse 3s ease-in-out infinite;
        }

        @keyframes metallicPulse {
          0%, 100% {
            filter: brightness(1.1);
          }
          50% {
            filter: brightness(1.35);
          }
        }
      `}</style>
    </main>
  );
}

/* Restart your dev server or push to GitHub → let Vercel auto-deploy. */
