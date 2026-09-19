"use client";

import { EyeToggle } from "./icons/EyeToggle";

export type DropVisibility = "public" | "private";

/** Circular eye toggle used next to Open Drop Studio on every composer. */
export function DropPrivacyButton({
  visibility,
  onChange,
}: {
  visibility: DropVisibility;
  onChange: (next: DropVisibility) => void;
}) {
  const isPrivate = visibility === "private";
  return (
    <>
      <button
        type="button"
        className={`drop-privacy-btn ${isPrivate ? "is-private" : ""}`}
        onClick={() => onChange(isPrivate ? "public" : "private")}
        aria-label={
          isPrivate ? "Private — tap to set Public" : "Public — tap to set Private"
        }
        title={isPrivate ? "Private" : "Public"}
      >
        <EyeToggle open={!isPrivate} size={16} />
      </button>
      <style>{`
        .drop-privacy-btn {
          flex: 0 0 auto;
          width: 38px;
          height: 38px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          border-radius: 999px;
          cursor: pointer;
          border: 1px solid rgba(0, 140, 135, 0.4);
          background: rgba(220, 252, 240, 0.85);
          color: rgba(0, 140, 135, 0.95);
          transition: background 140ms ease, border-color 140ms ease,
            color 140ms ease, transform 120ms ease;
        }
        .drop-privacy-btn:hover {
          transform: translateY(-1px);
          border-color: rgba(0, 140, 135, 0.7);
        }
        .drop-privacy-btn.is-private {
          color: rgba(120, 60, 160, 0.95);
          background: rgba(238, 230, 255, 0.85);
          border-color: rgba(120, 60, 160, 0.4);
        }
      `}</style>
    </>
  );
}
