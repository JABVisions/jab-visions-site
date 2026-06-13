"use client";

import { useId } from "react";
import styles from "./frameRotateIcon.module.css";

/** Board signature — circular rotate arrow (portrait ↔ landscape frame toggle). */
export function FrameRotateIcon({
  size = 20,
  landscape = false,
  spinning = false,
  spinFromDeg = 0,
  className,
}: {
  size?: number;
  landscape?: boolean;
  spinning?: boolean;
  /** Starting angle for the click spin (0 portrait, 90 landscape). */
  spinFromDeg?: number;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const gradId = `frame-rotate-grad-${uid}`;
  const glowId = `frame-rotate-glow-${uid}`;
  const spinToDeg = spinFromDeg + 90;

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${styles.icon} ${spinning ? styles.spinning : ""} ${className ?? ""}`.trim()}
      aria-hidden
      style={{
        ["--rest-rotate" as string]: `${landscape ? 90 : 0}deg`,
        ["--spin-from" as string]: `${spinFromDeg}deg`,
        ["--spin-to" as string]: `${spinToDeg}deg`,
      }}
    >
      <defs>
        <linearGradient id={gradId} x1="5" y1="19" x2="19" y2="5" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#35e6d3" />
          <stop offset="38%" stopColor="#7ee2ff" />
          <stop offset="68%" stopColor="#9dfff3" />
          <stop offset="100%" stopColor="#b8ffe8" />
        </linearGradient>
        <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="1.1" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter={`url(#${glowId})`}>
        {/* Circular arc — ~270° sweep; gap at top for the arrowhead */}
        <path
          d="M 19.25 12
             A 7.25 7.25 0 1 1 12 4.75"
          stroke={`url(#${gradId})`}
          strokeWidth="2.1"
          strokeLinecap="round"
          fill="none"
        />
        {/* Bold filled arrowhead — locked to the arc opening */}
        <path
          d="M 12 4.75
             L 7.15 4.75
             L 9.55 2.05
             L 9.55 7.45
             Z"
          fill={`url(#${gradId})`}
          stroke="#eafffe"
          strokeWidth="0.55"
          strokeLinejoin="round"
        />
        {/* Arrow tip accent */}
        <path
          d="M 7.15 4.75 L 9.55 4.75"
          stroke="#eafffe"
          strokeWidth="1.1"
          strokeLinecap="round"
          opacity="0.75"
        />
        {/* Soft highlight tracing the arc */}
        <path
          d="M 18.6 12
             A 6.6 6.6 0 1 1 12 5.4"
          stroke="#eafffe"
          strokeWidth="0.9"
          strokeLinecap="round"
          fill="none"
          opacity="0.42"
        />
      </g>
    </svg>
  );
}
