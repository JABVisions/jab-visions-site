"use client";

import React, { useEffect } from "react";

export function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-xl rounded-2xl bg-[#16001f] ring-1 ring-white/10 shadow-xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <div className="text-sm font-semibold">{title}</div>
            <button
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-xs text-white/70 hover:text-white hover:bg-white/10"
            >
              Close
            </button>
          </div>
          <div className="p-5">{children}</div>
        </div>
      </div>
    </div>
  );
}
