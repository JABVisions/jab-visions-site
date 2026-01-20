// File: app/board/layout.tsx
import type { ReactNode } from "react";
import NavbarClient from "@/app/components/NavbarClient";
import BoardDock from "@/app/components/board/BoardDock";
import BucketBrainBridge from "@/app/components/board/BucketBrainBridge";

export default function BoardLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* installs the PASS / PIN / PUSH event listener once for all Board routes */}
      <BucketBrainBridge />

      <NavbarClient />
      <main className="min-h-[100svh] pb-28">{children}</main>
      <BoardDock />
    </>
  );
}
