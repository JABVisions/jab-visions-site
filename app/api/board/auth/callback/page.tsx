"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export default function BoardAuthCallbackPage() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const supabase = getSupabaseClient();

    async function run() {
      // Supabase automatically parses the hash fragment
      // and hydrates the session when this page loads.
      if (!supabase) {
        router.replace("/board");
        return;
      }

      const { data } = await supabase.auth.getSession();

      // Where to go next (default: profile edit so users build immediately)
      const next =
        params.get("next") && params.get("next")!.startsWith("/board")
          ? params.get("next")!
          : "/board/profile/edit";

      if (data.session) {
        router.replace(next);
      } else {
        // If something went sideways, fallback to login
        router.replace(`/board/login?next=${encodeURIComponent(next)}`);
      }
    }

    run();
  }, [router, params]);

  return (
    <main className="min-h-[100svh] bg-[#FFF2A6] flex items-center justify-center px-4">
      <div className="rounded-[28px] border border-black/15 bg-white/70 backdrop-blur-xl shadow-[0_18px_65px_rgba(0,0,0,0.18)] px-6 py-8 text-center max-w-md w-full">
        <div className="text-[11px] font-black tracking-[0.32em] uppercase text-black/60">
          JAB VISIONS™ BOARD
        </div>

        <h1
          className="
            mt-4 text-3xl font-black tracking-[0.18em] uppercase
            text-[#00D27A]
            drop-shadow-[0_0_16px_rgba(0,210,122,0.55)]
          "
        >
          Confirming
        </h1>

        <p className="mt-3 text-sm font-semibold text-black/60">
          Finishing your sign-in and setting up your Board…
        </p>

        <div className="mt-6 flex justify-center">
          <div className="h-8 w-8 rounded-full border-4 border-black/20 border-t-[#00D27A] animate-spin" />
        </div>
      </div>
    </main>
  );
}
