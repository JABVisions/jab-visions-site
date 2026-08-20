"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Navbar from "./Navbar";

export default function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isBoardExperience =
    pathname === "/board" ||
    pathname.startsWith("/board/") ||
    pathname.startsWith("/api/board/auth/");

  return (
    <>
      {!isBoardExperience ? <Navbar /> : null}
      <div
        className={
          isBoardExperience
            ? "site-content site-content--board"
            : "site-content"
        }
      >
        {children}
      </div>
    </>
  );
}
