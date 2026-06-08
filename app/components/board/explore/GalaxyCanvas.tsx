"use client";

import type { ReactNode } from "react";

type GalaxyCanvasProps = {
  children: ReactNode;
};

export default function GalaxyCanvas({ children }: GalaxyCanvasProps) {
  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#030306] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(212,255,0,0.18),transparent_28%),radial-gradient(circle_at_78%_18%,rgba(255,0,214,0.12),transparent_24%),radial-gradient(circle_at_50%_70%,rgba(0,255,194,0.1),transparent_30%)]" />

      <div className="pointer-events-none absolute inset-0 opacity-50 bg-[radial-gradient(circle,rgba(255,255,255,0.3)_1px,transparent_1px)] [background-size:34px_34px]" />

      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[760px] w-[760px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-lime-300/10" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-fuchsia-400/10" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[310px] w-[310px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/10" />

      <section className="relative z-10 min-h-screen px-5 pb-32 pt-28">{children}</section>

      <style jsx global>{`
        @keyframes galaxyDrift {
          0% {
            transform: translate3d(0, 0, 0) rotate(0deg);
          }
          50% {
            transform: translate3d(10px, -12px, 0) rotate(1deg);
          }
          100% {
            transform: translate3d(0, 0, 0) rotate(0deg);
          }
        }

        @keyframes orbFloat {
          0% {
            transform: translate3d(0, 0, 0);
          }
          50% {
            transform: translate3d(0, -12px, 0);
          }
          100% {
            transform: translate3d(0, 0, 0);
          }
        }

        @keyframes pulseAura {
          0%,
          100% {
            opacity: 0.55;
            scale: 1;
          }
          50% {
            opacity: 0.95;
            scale: 1.08;
          }
        }
      `}</style>
    </main>
  );
}
