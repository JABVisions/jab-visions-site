"use client";

import React from "react";
import { usePathname } from "next/navigation";
import BoardDock from "@/app/components/board/BoardDock";
import BoardUtilityHeader from "@/app/components/board/BoardUtilityHeader";
import BoardDropEditModal from "@/app/components/board/BoardDropEditModal";

export default function BoardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Work + Forums should be dark/focused
  const isDark =
    pathname === "/board/work" ||
    pathname.startsWith("/board/work/") ||
    pathname === "/board/forums" ||
    pathname.startsWith("/board/forums/") ||
    pathname === "/board/explore" ||
    pathname.startsWith("/board/explore/");

  const isAuthRoute =
    pathname === "/board/login" ||
    pathname === "/board/forgot-password" ||
    pathname === "/board/signup" ||
    pathname === "/board/reset-password";

  const isWelcomeRoute = pathname === "/board";

  return (
    <div className={isDark ? "board-root board-root--dark" : "board-root board-root--light"}>
      {!isAuthRoute && !isWelcomeRoute ? <BoardUtilityHeader /> : null}

      {/* Page content */}
      <div className="board-slot">{children}</div>

      {/* ✅ Keep the Board dock available on the Board gate/welcome page too. */}
      {!isAuthRoute ? <BoardDock /> : null}
      {!isAuthRoute ? <BoardDropEditModal /> : null}

      <style>{`
        .board-root {
          min-height: 100vh;
          width: 100%;
        }

        /* Light Board pages (feed/profile/etc) */
        .board-root--light {
          background:
            radial-gradient(1100px 700px at 20% 12%, rgba(0, 255, 150, 0.1), transparent 60%),
            radial-gradient(900px 600px at 85% 28%, rgba(255, 0, 190, 0.1), transparent 55%),
            linear-gradient(180deg, #fff7c9, #fff3b0);
        }

        /* Dark Board pages (work/forums) */
        .board-root--dark {
          background:
            radial-gradient(900px 600px at 18% 18%, rgba(80, 255, 150, 0.12), transparent 55%),
            radial-gradient(900px 700px at 78% 22%, rgba(160, 80, 255, 0.12), transparent 55%),
            radial-gradient(1100px 800px at 55% 80%, rgba(0, 180, 255, 0.08), transparent 60%),
            linear-gradient(180deg, #050506, #0b0b0f 55%, #07070a);
        }

        .board-slot {
          position: relative;
          z-index: 1;
          padding-bottom: 110px; /* space for BoardDock */
        }
      `}</style>
    </div>
  );
}
