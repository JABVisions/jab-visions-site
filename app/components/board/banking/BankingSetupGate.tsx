"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { markResumePayDrop } from "@/lib/board/banking/resume";

export default function BankingSetupGate({
  message,
  onClose,
}: {
  message?: string;
  onClose?: () => void;
}) {
  const router = useRouter();
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4">
      <div className="w-full max-w-md rounded-[28px] border border-emerald-300/30 bg-[#07140f] p-6 text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
        <div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200/80">Banking</div>
        <h2 className="mt-2 text-2xl font-black">Set up Banking first</h2>
        <p className="mt-3 text-sm leading-relaxed text-white/70">
          {message || "Finish Banking setup before receiving Pay Drop payments."}
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-full bg-emerald-300 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-950"
            onClick={() => {
              markResumePayDrop();
              router.push("/board/options?tab=banking&pay=continue");
            }}
          >
            Set Up Banking
          </button>
          {onClose ? (
            <button
              type="button"
              className="rounded-full border border-white/20 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white/70"
              onClick={onClose}
            >
              Not now
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
