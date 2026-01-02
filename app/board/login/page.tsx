'use client';

import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-emerald-500/40 bg-black/70 p-6 shadow-[0_0_30px_rgba(34,255,119,0.25)]">
        <h1 className="text-xl font-semibold tracking-wide mb-2">
          Board Login
        </h1>
        <p className="text-sm text-white/70 mb-6">
          Login page placeholder (hook up your auth/UI here).
        </p>

        <button
          className="w-full rounded-xl border border-emerald-400/70 px-4 py-3 font-mono text-emerald-200 hover:bg-emerald-400/10 transition"
          onClick={() => router.push('/')}
        >
          Back to Home
        </button>
      </div>
    </main>
  );
}
