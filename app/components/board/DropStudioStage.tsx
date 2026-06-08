// File: app/components/board/DropStudioStage.tsx
// Drop Studio v2 shell — a full-screen creative environment launched from the
// Drop Console, rather than an inline form. It hosts the existing DropStudio
// editor (Text · Stickers · Button · Effects) on a large canvas inside a
// liquid-glass stage with a header and a Done action. Edits flow back through
// the same `value`/`onChange` customizations, so nothing downstream changes.

"use client";

import { useEffect } from "react";
import DropStudio from "./DropStudio";
import type { DropCustomization } from "@/lib/board/dropCustomizations";

export default function DropStudioStage({
  open,
  mediaUrl,
  mediaKind,
  value,
  onChange,
  onClose,
}: {
  open: boolean;
  mediaUrl: string;
  mediaKind: "image" | "video";
  value: DropCustomization;
  onChange: (next: DropCustomization) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || !mediaUrl) return null;

  return (
    <div
      className="studioStage"
      role="dialog"
      aria-modal="true"
      aria-label="Drop Studio"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="studioPanel">
        <div className="studioBar">
          <div className="studioBrand">
            <span className="studioDot" aria-hidden />
            DROP STUDIO
          </div>
          <button type="button" className="studioDone" onClick={onClose}>
            Done
          </button>
        </div>

        <div className="studioCanvas">
          <DropStudio
            mediaUrl={mediaUrl}
            mediaKind={mediaKind}
            value={value}
            onChange={onChange}
          />
        </div>
      </div>

      <style jsx>{`
        .studioStage {
          position: fixed;
          inset: 0;
          z-index: 90;
          display: grid;
          place-items: center;
          padding: 18px;
          background:
            radial-gradient(circle at 22% 16%, rgba(126, 226, 255, 0.16), transparent 34%),
            radial-gradient(circle at 80% 18%, rgba(255, 0, 190, 0.14), transparent 32%),
            rgba(6, 10, 16, 0.66);
          backdrop-filter: blur(10px);
        }
        .studioPanel {
          width: min(1040px, calc(100vw - 28px));
          height: min(860px, calc(100vh - 28px));
          display: grid;
          grid-template-rows: auto 1fr;
          border-radius: 26px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background:
            linear-gradient(150deg, rgba(255, 255, 255, 0.1), rgba(0, 0, 0, 0.28)),
            rgba(10, 14, 20, 0.82);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.22),
            0 0 44px rgba(126, 226, 255, 0.16),
            0 30px 90px rgba(0, 0, 0, 0.5);
        }
        .studioBar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.05);
        }
        .studioBrand {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 0.22em;
          color: rgba(255, 255, 255, 0.92);
        }
        .studioDot {
          width: 9px;
          height: 9px;
          border-radius: 999px;
          background: radial-gradient(circle at 35% 30%, #fff, #7ee2ff);
          box-shadow: 0 0 12px rgba(126, 226, 255, 0.8);
        }
        .studioDone {
          border-radius: 999px;
          padding: 9px 18px;
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(6, 10, 16, 0.92);
          background: radial-gradient(circle at 30% 20%, #fff, #7ee2ff);
          border: 1px solid rgba(255, 255, 255, 0.5);
          box-shadow: 0 0 18px rgba(126, 226, 255, 0.45);
          cursor: pointer;
        }
        .studioCanvas {
          min-height: 0;
          overflow: auto;
          padding: 18px;
        }
      `}</style>
    </div>
  );
}
