// File: /app/board/options/page.tsx
import type { Metadata } from "next";
import OptionsClient from "./OptionsClient";

export const metadata: Metadata = {
  title: "Board Options",
};

export default function BoardOptionsPage() {
  return <OptionsClient />;
}