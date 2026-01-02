'use client';

import { useRouter } from 'next/navigation';

export default function WelcomePage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="w-full max-w-2xl rounded-2xl border border-emerald-500/40 bg-black/70 p-8 shadow-[0_0_30px_rgba(34,255,119,0.25)]">
        <h1 className="text-2xl font-semibold tracking-wide mb-3">
          Welcome to the JAB Visions™ Board
        </h1>
        <p className="text-white/75 mb-6">
          This is your welcome hub. (Placeholder page so Vercel can build.)
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            className="rounded-xl border border-emerald-400/70 px-4 py-3 font-mono text-emerald-200 hover:bg-emerald-400/10 transition"
            onClick={() => router.push('/board')}
          >
            Go to Board
          </button>

          <button
            className="rounded-xl border border-emerald-400/40 px-4 py-3 font-mono text-emerald-100/80 hover:bg-emerald-400/10 transition"
            onClick={() => router.push('/')}
          >
            Back Home
          </button>
        </div>
      </div>
    </main>
  );
}
