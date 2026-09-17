import type { PersonalContextSource } from "./response";

/**
 * Future personal Board intelligence. These sources exist in the product but
 * are not queried by Bucket Brain yet — do not fabricate answers from them.
 */
export function listPersonalContextSources(): PersonalContextSource[] {
  return [
    {
      id: "work-drops",
      label: "Work Drops",
      connected: false,
      notes: "Drop Pad assets and portfolio libraries.",
    },
    {
      id: "portfolio",
      label: "Portfolio drops",
      connected: false,
      notes: "Profile and Work Space portfolio.",
    },
    {
      id: "dropbooks",
      label: "Dropbooks",
      connected: false,
      notes: "Drop Studio Dropbook slides.",
    },
    {
      id: "assets",
      label: "Assets",
      connected: false,
      notes: "Work Space asset library.",
    },
    {
      id: "signals",
      label: "Signals",
      connected: false,
      notes: "PASS / PIN / PUSH Bucket memory.",
    },
    {
      id: "whispers",
      label: "Whispers",
      connected: false,
      notes: "Activity-space whispers.",
    },
    {
      id: "studio",
      label: "Drop Studio",
      connected: false,
      notes: "Drafts and studio creations.",
    },
  ];
}

export function personalSearchNotice() {
  return {
    title: "Personal Board intelligence is still coming online",
    body: "Bucket Brain cannot yet read your private drafts, Dropbooks, or studio history. Search Work Boards or ask Visionary in the meantime.",
  };
}
