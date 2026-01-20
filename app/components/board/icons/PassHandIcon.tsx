"use client";

import React from "react";

export default function PassHandIcon({ size = 20 }: { size?: number }) {
  // Neutral “acknowledgement” hand: open palm, clean stencil.
  // Solid white fill + bold outline via currentColor.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label="Pass"
    >
      <path
        d="M7.2 11.2V6.9c0-.9.7-1.6 1.6-1.6s1.6.7 1.6 1.6v3.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.4 10.2V5.7c0-.9.7-1.6 1.6-1.6s1.6.7 1.6 1.6v4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13.6 10.5V6.2c0-.9.7-1.6 1.6-1.6s1.6.7 1.6 1.6v6.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.2 11.1c0-.9.7-1.6 1.6-1.6.9 0 1.6.7 1.6 1.6v4.6l.9.8c1.1 1 2.2 1.6 3.6 1.6h1.5c2.6 0 4.8-2.2 4.8-4.8v-1.8"
        fill="white"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.2 11.1v4.8c0 .6.2 1.1.7 1.5l1.8 1.7c1.3 1.2 2.9 1.9 4.7 1.9h1.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
