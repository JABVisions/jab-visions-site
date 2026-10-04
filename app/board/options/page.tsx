import type { Metadata } from "next";
import { Suspense } from "react";
import OptionsClient from "./OptionsClient";

export const metadata: Metadata = {
  title: "Board Options",
};

export default function BoardOptionsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm opacity-70">Loading Options…</div>}>
      <OptionsClient />
    </Suspense>
  );
}
