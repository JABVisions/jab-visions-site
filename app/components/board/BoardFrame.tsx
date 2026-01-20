"use client";

import React from "react";

export type BoardStyle = {
  glowColor: string;
  fontColor: string;
  tileColor: string;
};

const DEFAULT_STYLE: BoardStyle = {
  glowColor: "#B8A7FF",
  fontColor: "#2B1B4D",
  tileColor: "#FFFFFF",
};

export function BoardFrame({
  style,
  className = "",
  children,
}: {
  style?: Partial<BoardStyle> | null;
  className?: string;
  children: React.ReactNode;
}) {
  const s: BoardStyle = {
    ...DEFAULT_STYLE,
    ...(style ?? {}),
  };

  const auraShadow = `0 0 18px ${s.glowColor}35, 0 0 70px ${s.glowColor}1f`;
  const frameStyle: React.CSSProperties = {
    color: s.fontColor,
    background: `${s.tileColor}cc`,
    border: `1px solid ${s.glowColor}33`,
    borderRadius: 24,
    boxShadow: `${auraShadow}, 0 16px 40px rgba(20,10,40,0.10)`,
    backdropFilter: "blur(10px)",
  };

  return (
    <div style={frameStyle} className={`p-4 ${className}`}>
      {children}
    </div>
  );
}
