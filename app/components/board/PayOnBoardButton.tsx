"use client";

type PayOnBoardButtonProps = {
  busy?: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
  /** Smaller gem CTA for profile Board Drop collection tiles. */
  variant?: "default" | "collection";
};

/** Large gem-style CTA for Pay Drops — green facets + refracted light sweep. */
export function PayOnBoardButton({
  busy = false,
  disabled = false,
  onClick,
  className,
  variant = "default",
}: PayOnBoardButtonProps) {
  return (
    <div
      className={["payGemSlot", variant === "collection" && "collection", className]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        type="button"
        className="payGemBtn"
        onClick={onClick}
        disabled={disabled || busy}
        aria-busy={busy}
      >
        <span className="payGemFacet payGemFacetA" aria-hidden />
        <span className="payGemFacet payGemFacetB" aria-hidden />
        <span className="payGemPrism" aria-hidden />
        <span className="payGemShine" aria-hidden />
        <span className="payGemLabel">{busy ? "Opening…" : "Pay on Board"}</span>
      </button>

      <style jsx>{`
        .payGemSlot {
          width: 100%;
          margin-top: 14px;
        }

        .payGemBtn {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          aspect-ratio: 3 / 1;
          min-height: clamp(112px, 33vw, 196px);
          max-height: 220px;
          padding: 20px 28px;
          border: none;
          border-radius: 24px;
          cursor: pointer;
          overflow: hidden;
          isolation: isolate;
          background:
            radial-gradient(circle at 18% 22%, rgba(196, 255, 228, 0.92), transparent 42%),
            radial-gradient(circle at 82% 78%, rgba(52, 211, 153, 0.55), transparent 48%),
            linear-gradient(
              142deg,
              rgba(134, 239, 172, 0.98) 0%,
              rgba(34, 197, 94, 0.96) 34%,
              rgba(5, 150, 105, 0.98) 68%,
              rgba(110, 231, 183, 0.94) 100%
            );
          color: rgba(255, 255, 255, 0.98);
          font-size: clamp(15px, 2.5vw, 19px);
          font-weight: 950;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          text-shadow: 0 1px 3px rgba(0, 72, 48, 0.38);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.62),
            inset 0 -2px 8px rgba(0, 100, 64, 0.22),
            0 0 0 1px rgba(167, 243, 208, 0.55),
            0 16px 42px rgba(16, 120, 80, 0.28),
            0 6px 18px rgba(74, 222, 168, 0.2);
          transition: transform 160ms ease, filter 160ms ease, box-shadow 160ms ease;
        }

        .payGemBtn:hover:not(:disabled) {
          transform: translateY(-2px);
          filter: brightness(1.04) saturate(1.06);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.72),
            inset 0 -2px 8px rgba(0, 100, 64, 0.24),
            0 0 0 1px rgba(196, 255, 228, 0.72),
            0 22px 50px rgba(16, 120, 80, 0.34),
            0 10px 24px rgba(110, 231, 183, 0.28);
        }

        .payGemBtn:disabled {
          cursor: wait;
          opacity: 0.72;
          filter: saturate(0.88);
        }

        .payGemFacet,
        .payGemPrism,
        .payGemShine {
          position: absolute;
          pointer-events: none;
        }

        .payGemFacet {
          inset: 0;
          mix-blend-mode: screen;
        }

        .payGemFacetA {
          background: linear-gradient(
            128deg,
            transparent 28%,
            rgba(255, 255, 255, 0.78) 44%,
            transparent 52%,
            rgba(187, 247, 208, 0.45) 64%,
            transparent 78%
          );
          opacity: 0.7;
        }

        .payGemFacetB {
          background: linear-gradient(
            302deg,
            transparent 18%,
            rgba(255, 255, 255, 0.42) 38%,
            transparent 54%,
            rgba(240, 253, 244, 0.28) 72%,
            transparent 88%
          );
          opacity: 0.55;
        }

        .payGemPrism {
          inset: -8%;
          background: conic-gradient(
            from 210deg at 50% 50%,
            transparent 0deg,
            rgba(255, 255, 255, 0.16) 38deg,
            transparent 74deg,
            rgba(167, 243, 208, 0.22) 128deg,
            transparent 168deg,
            rgba(255, 255, 255, 0.12) 228deg,
            transparent 300deg,
            rgba(110, 231, 183, 0.18) 330deg,
            transparent 360deg
          );
          opacity: 0.85;
          animation: payGemPrismSpin 9s linear infinite;
        }

        .payGemShine {
          inset: -50% -25%;
          background: linear-gradient(
            108deg,
            transparent 42%,
            rgba(255, 255, 255, 0.72) 50%,
            transparent 58%
          );
          animation: payGemSweep 3.6s ease-in-out infinite;
          opacity: 0.65;
        }

        .payGemLabel {
          position: relative;
          z-index: 2;
        }

        @keyframes payGemSweep {
          0%,
          100% {
            transform: translateX(-36%) rotate(14deg);
            opacity: 0.28;
          }
          50% {
            transform: translateX(36%) rotate(14deg);
            opacity: 0.92;
          }
        }

        @keyframes payGemPrismSpin {
          to {
            transform: rotate(360deg);
          }
        }

        .payGemSlot.collection {
          margin-top: 10px;
        }

        .payGemSlot.collection .payGemBtn {
          min-height: 0;
          max-height: none;
          height: auto;
          aspect-ratio: 3 / 1;
          min-height: 64px;
          max-height: 92px;
          padding: 12px 18px;
          border-radius: 18px;
          font-size: clamp(11px, 2.2vw, 13px);
          letter-spacing: 0.14em;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.58),
            inset 0 -2px 6px rgba(0, 100, 64, 0.2),
            0 0 0 1px rgba(167, 243, 208, 0.48),
            0 10px 28px rgba(16, 120, 80, 0.22),
            0 4px 12px rgba(74, 222, 168, 0.16);
        }

        .payGemSlot.collection .payGemBtn:hover:not(:disabled) {
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.68),
            inset 0 -2px 6px rgba(0, 100, 64, 0.22),
            0 0 0 1px rgba(196, 255, 228, 0.62),
            0 14px 32px rgba(16, 120, 80, 0.28),
            0 6px 16px rgba(110, 231, 183, 0.22);
        }

        @media (prefers-reduced-motion: reduce) {
          .payGemPrism,
          .payGemShine {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
