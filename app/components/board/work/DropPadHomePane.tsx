"use client";

export default function DropPadHomePane() {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-[18px] border border-white/10 bg-black">
      {/* Screen glow */}
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_40px_rgba(0,255,120,0.08)]" />

      {/* Scanlines */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[length:100%_4px] opacity-20" />

      {/* Power button */}
      <div className="absolute inset-0 flex items-center justify-center">
        <button
          className="
            h-16 w-16 rounded-full
            border-2 border-lime-400
            bg-black
            shadow-[0_0_25px_rgba(0,255,120,0.6)]
            transition-all duration-300
            hover:scale-110 hover:shadow-[0_0_40px_rgba(0,255,120,0.9)]
          "
          aria-label="Power On Drop Pad"
        >
          <div className="mx-auto h-6 w-1 rounded-full bg-lime-400" />
        </button>
      </div>

      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] tracking-[0.3em] text-lime-400/60">
        DROP PAD — STANDBY
      </div>
    </div>
  );
}
