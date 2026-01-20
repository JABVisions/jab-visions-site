// app/board/BoardShell.tsx
"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

export default function BoardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // Work + Forums = dark. Everything else stays soft.
  const isDark =
    pathname?.startsWith("/board/work") || pathname?.startsWith("/board/forums");

  return (
    <div className={isDark ? "board-theme board-theme--dark" : "board-theme board-theme--soft"}>
      {children}

      <style jsx global>{`
        .board-theme {
          min-height: 100vh;
        }

        /* Soft theme (feed/profile/explore/etc) */
        .board-theme--soft {
          background:
            radial-gradient(1100px 700px at 20% 12%, rgba(0, 255, 150, 0.10), transparent 60%),
            radial-gradient(900px 600px at 85% 28%, rgba(255, 0, 190, 0.10), transparent 55%),
            linear-gradient(180deg, #fff7c9, #fff3b0);
        }

        /* Dark theme (work + forums) */
        .board-theme--dark {
          background:
            radial-gradient(1200px 800px at 18% 20%, rgba(120, 255, 120, 0.10), transparent 62%),
            radial-gradient(900px 650px at 78% 24%, rgba(255, 60, 200, 0.08), transparent 58%),
            radial-gradient(700px 520px at 55% 80%, rgba(80, 200, 255, 0.06), transparent 60%),
            linear-gradient(180deg, #050505, #0b0b0b);
        }
      `}</style>
    </div>
  );
}
