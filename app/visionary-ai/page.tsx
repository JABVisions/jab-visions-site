import type { Metadata } from "next";
import VisionaryAIClient from "@/app/components/visionary-ai/VisionaryAIClient";
import styles from "@/app/components/visionary-ai/visionaryAI.module.css";

export const metadata: Metadata = {
  title: "Visionary AI | JAB Visions™",
  description:
    "Explore the stories, systems, and creative worlds of JAB Visions with Visionary AI.",
};

export default function VisionaryAIPage() {
  return (
    <main className={styles.page}>
      <div className={styles.grid} aria-hidden />
      <div className={styles.glowOne} aria-hidden />
      <div className={styles.glowTwo} aria-hidden />
      <VisionaryAIClient />
    </main>
  );
}
