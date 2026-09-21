"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export default function DropPadPopup({
  open,
  title,
  eyebrow = "DROP PAD WINDOW",
  label,
  onClose,
  extraChrome,
  children,
}: {
  open: boolean;
  title: string;
  eyebrow?: string;
  label: string;
  onClose: () => void;
  extraChrome?: ReactNode;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="dropPadPopup" role="dialog" aria-modal="true" aria-label={label}>
      <button
        type="button"
        className="dropPadPopupBackdrop"
        aria-label={`Close ${label}`}
        onClick={onClose}
      />
      <div className="dropPadPopupFrame">
        <div className="dropPadPopupChrome">
          <div className="min-w-0">
            <div className="text-[11px] tracking-[0.34em] text-cyan-50/72">{eyebrow}</div>
            <div className="mt-1 truncate text-lg font-semibold text-white/90">{title}</div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {extraChrome}
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-white/18 bg-white/10 px-4 py-2 text-sm text-white/84 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition hover:bg-white/14"
            >
              Close
            </button>
          </div>
        </div>
        <div className="dropPadPopupBody" data-space-scroll>
          {children}
        </div>
      </div>
      <style jsx>{`
        .dropPadPopup {
          position: fixed;
          inset: 0;
          z-index: 140;
          display: grid;
          place-items: center;
          padding: 18px 14px 120px;
        }
        .dropPadPopupBackdrop {
          position: absolute;
          inset: 0;
          border: 0;
          background:
            radial-gradient(circle at center, rgba(195, 255, 244, 0.08), transparent 34%),
            rgba(4, 6, 14, 0.62);
          backdrop-filter: blur(8px);
        }
        .dropPadPopupFrame {
          position: relative;
          z-index: 1;
          width: min(920px, calc(100vw - 24px));
          height: min(82vh, 860px);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border-radius: 34px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.16), rgba(190, 245, 255, 0.08) 18%, rgba(26, 34, 52, 0.72) 46%, rgba(9, 14, 28, 0.86) 100%);
          box-shadow:
            0 24px 120px rgba(0, 0, 0, 0.42),
            0 0 90px rgba(160, 255, 238, 0.12),
            inset 0 1px 0 rgba(255, 255, 255, 0.4);
          backdrop-filter: blur(30px);
        }
        .dropPadPopupChrome {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.14);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.04));
        }
        .dropPadPopupBody {
          min-height: 0;
          flex: 1;
          overflow: auto;
          padding: 16px;
        }
        @media (max-width: 720px) {
          .dropPadPopup {
            padding: 0;
            place-items: stretch;
          }
          .dropPadPopupFrame {
            width: 100vw;
            height: 100dvh;
            border-radius: 0;
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
