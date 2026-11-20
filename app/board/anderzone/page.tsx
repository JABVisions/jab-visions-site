"use client";

import dynamic from "next/dynamic";

const AnderzoneClient = dynamic(() => import("@/app/components/board/anderzone/AnderzoneClient"), {
  ssr: false,
  loading: () => (
    <p style={{ color: "#b7ffe0", letterSpacing: "0.14em", textTransform: "uppercase", padding: 24 }}>
      Opening ANDERZONE CENTRAL…
    </p>
  ),
});

export default function AnderzonePage() {
  return (
    <main>
      <AnderzoneClient />
    </main>
  );
}
