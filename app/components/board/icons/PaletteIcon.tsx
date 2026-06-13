"use client";

import { useId } from "react";

/** Board signature — iridescent cyan paintbrush for Drop Studio Palette. */
export function PaletteIcon({
  size = 20,
  active = false,
  className,
}: {
  size?: number;
  active?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const gradId = `palette-grad-${uid}`;
  const glowId = `palette-glow-${uid}`;

  const stops = active
    ? [
        { offset: "0%", color: "#4ade80" },
        { offset: "38%", color: "#86efac" },
        { offset: "68%", color: "#bbf7d0" },
        { offset: "100%", color: "#dcfce7" },
      ]
    : [
        { offset: "0%", color: "#35e6d3" },
        { offset: "38%", color: "#7ee2ff" },
        { offset: "68%", color: "#9dfff3" },
        { offset: "100%", color: "#b8ffe8" },
      ];

  const highlight = active ? "#f0fff4" : "#eafffe";

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="4" y1="20" x2="20" y2="4" gradientUnits="userSpaceOnUse">
          {stops.map((stop) => (
            <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
          ))}
        </linearGradient>
        <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation={active ? "1.8" : "1.1"} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter={`url(#${glowId})`}>
        <path
          d="M14.5 3.5 20.5 9.5 9 21 3 21 3 15 14.5 3.5Z"
          stroke={`url(#${gradId})`}
          strokeWidth="1.85"
          strokeLinejoin="round"
        />
        <path
          d="M12.5 5.5 18.5 11.5"
          stroke={`url(#${gradId})`}
          strokeWidth="1.85"
          strokeLinecap="round"
        />
        <path
          d="M3 21c2.2-1.2 4.4-2.8 6-5.2"
          stroke={`url(#${gradId})`}
          strokeWidth="1.85"
          strokeLinecap="round"
        />
        <path
          d="M6.2 18.8c1.4-.6 2.8-1.5 3.8-2.8"
          stroke={highlight}
          strokeWidth="1.1"
          strokeLinecap="round"
          opacity="0.85"
        />
      </g>
    </svg>
  );
}
