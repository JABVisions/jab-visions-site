// File: app/components/board/ReactionRail.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  EVT_UPDATED,
  depositToBrain,
  type BucketFolder,
  type BucketMemoryDrop,
  readBrain,
  withdrawFromBrain,
} from "@/lib/board/bucketBrain";

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const AURA_HEX: Record<string, string> = {
  sloth_pink: "#FF4FD8",
  lust_blue: "#2D7CFF",
  greed_black: "#111111",
  pride_yellow: "#FFD12D",
  envy_red: "#FF2D2D",
  gluttony_orange: "#FF7A1A",
  wrath_purple: "#7A44FF",
  lilly_yellowgreen: "#B7FF2D",
};

const fallbackAuraColor = "#8ee7ff";

function readUserAuraColor() {
  try {
    if (typeof window === "undefined") return fallbackAuraColor;
    const optionsRaw = window.localStorage.getItem("board.options.v1");
    const profileRaw = window.localStorage.getItem("jab_board_profile_v2");
    const options = optionsRaw ? JSON.parse(optionsRaw) : null;
    const profile = profileRaw ? JSON.parse(profileRaw) : null;
    const key =
      typeof options?.auraColor === "string" && options.auraColor.trim()
        ? options.auraColor.trim()
        : "";
    return (
      AURA_HEX[key] ||
      (typeof profile?.glowColor === "string" && profile.glowColor.trim()) ||
      (typeof profile?.avatarGlow === "string" && profile.avatarGlow.trim()) ||
      fallbackAuraColor
    );
  } catch {
    return fallbackAuraColor;
  }
}

type Props = {
  activityId: string;
  size?: "sm" | "md";
  item?: BucketMemoryDrop | null;
  // optional: let parent know something happened (for toast)
  onSignal?: (folder: BucketFolder, action: "deposit" | "withdraw") => void;
};

export default function ReactionRail({
  activityId,
  size = "md",
  item,
  onSignal,
}: Props) {
  const id = String(activityId || "").trim();
  const disabled = !id;

  const [pulse, setPulse] = useState<BucketFolder | null>(null);
  const [selected, setSelected] = useState({
    pass: false,
    pin: false,
    push: false,
  });
  const [userAuraColor, setUserAuraColor] = useState(fallbackAuraColor);

  useEffect(() => {
    const sync = () => {
      setUserAuraColor(readUserAuraColor());
      if (!id) {
        setSelected({ pass: false, pin: false, push: false });
        return;
      }
      const brain = readBrain();
      setSelected({
        pass: (brain.pass ?? []).some((entry) => String(entry.activityId) === id),
        pin: (brain.pin ?? []).some((entry) => String(entry.activityId) === id),
        push: (brain.push ?? []).some((entry) => String(entry.activityId) === id),
      });
    };

    sync();
    window.addEventListener(EVT_UPDATED, sync as EventListener);
    window.addEventListener("storage", sync as EventListener);
    return () => {
      window.removeEventListener(EVT_UPDATED, sync as EventListener);
      window.removeEventListener("storage", sync as EventListener);
    };
  }, [id]);

  const toggleReaction = (folder: BucketFolder) => {
    if (!id) return;

    const exists = (readBrain()[folder] ?? []).some(
      (entry) => String(entry.activityId) === id
    );

    if (exists) {
      withdrawFromBrain(folder, id);
      setSelected((prev) => ({ ...prev, [folder]: false }));
      setPulse(folder);
      window.setTimeout(() => setPulse(null), 220);
      onSignal?.(folder, "withdraw");
      return;
    }

    depositToBrain(folder, id, item ?? null);
    setSelected((prev) => ({ ...prev, [folder]: true }));

    setPulse(folder);
    window.setTimeout(() => setPulse(null), 220);

    onSignal?.(folder, "deposit");
  };

  const btnSize = size === "sm" ? "btn sm" : "btn";

  return (
    <div
      className={clsx("rail", size === "sm" && "railSm")}
      style={{ "--reaction-aura": userAuraColor } as React.CSSProperties}
    >
      <button
        type="button"
        className={clsx(btnSize, selected.pass && "selected", pulse === "pass" && "pulse")}
        onClick={() => toggleReaction("pass")}
        disabled={disabled}
        title="PASS (acknowledge)"
      >
        <span className="ico" aria-hidden>
          <Hand />
        </span>
        <span className="lbl">PASS</span>
      </button>

      <button
        type="button"
        className={clsx(btnSize, selected.pin && "selected", pulse === "pin" && "pulse")}
        onClick={() => toggleReaction("pin")}
        disabled={disabled}
        title="PIN (save)"
      >
        <span className="ico" aria-hidden>
          <Star />
        </span>
        <span className="lbl">PIN</span>
      </button>

      <button
        type="button"
        className={clsx(btnSize, selected.push && "selected", pulse === "push" && "pulse")}
        onClick={() => toggleReaction("push")}
        disabled={disabled}
        title="PUSH (boost)"
      >
        <span className="ico" aria-hidden>
          <ArrowUp />
        </span>
        <span className="lbl">PUSH</span>
      </button>

      <style jsx>{`
        .rail {
          display: inline-flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }

        .railSm {
          gap: 8px;
        }

        .btn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          border-radius: 999px;
          padding: 9px 12px;
          border: 1px solid rgba(0,0,0,0.10);
          background: rgba(255,255,255,0.78);
          cursor: pointer;
          color: rgba(0,0,0,0.62);
          transition: transform 140ms ease, filter 140ms ease, background 140ms ease, border-color 280ms ease, box-shadow 280ms ease, color 280ms ease, text-shadow 280ms ease;
          user-select: none;
        }

        .btn:hover {
          transform: translateY(-1px);
          filter: brightness(1.02);
        }

        .btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          transform: none;
        }

        .btn.sm {
          padding: 8px 10px;
          gap: 8px;
        }

        .ico {
          width: 18px;
          height: 18px;
          display: grid;
          place-items: center;
        }

        .lbl {
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(0,0,0,0.62);
        }

        .selected {
          color: var(--reaction-aura, ${fallbackAuraColor});
          border-color: var(--reaction-aura, ${fallbackAuraColor});
          box-shadow: 0 0 18px color-mix(in srgb, var(--reaction-aura, ${fallbackAuraColor}) 27%, transparent);
          text-shadow: 0 0 12px var(--reaction-aura, ${fallbackAuraColor});
        }

        .selected .lbl,
        .selected .ico {
          color: var(--reaction-aura, ${fallbackAuraColor});
          text-shadow: 0 0 12px var(--reaction-aura, ${fallbackAuraColor});
        }

        .selected .ico svg {
          filter: drop-shadow(0 0 8px var(--reaction-aura, ${fallbackAuraColor}));
        }

        .pulse {
          background: rgba(0, 0, 0, 0.84);
          border-color: rgba(0, 0, 0, 0.14);
        }

        .pulse .lbl {
          color: rgba(255,255,255,0.92);
        }
      `}</style>
    </div>
  );
}

/* --------------------------- icons --------------------------- */

function Hand() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.4 11.2V5.6c0-.9.7-1.6 1.6-1.6s1.6.7 1.6 1.6v4.4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M11.6 10V4.8c0-.9.7-1.6 1.6-1.6s1.6.7 1.6 1.6V10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M14.8 10.4V5.5c0-.85.7-1.55 1.55-1.55.86 0 1.55.7 1.55 1.55V13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M7.1 12.2l-.2-2.2c-.08-.9-.83-1.55-1.7-1.45-.88.1-1.52.9-1.42 1.78l.38 3.4c.2 1.8 1.2 3.45 2.7 4.4l1.05.66c1.2.76 2.6 1.17 4.02 1.17h1.55c2.9 0 5.25-2.35 5.25-5.25V13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Star() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.8l2.9 6.1 6.7.9-4.9 4.7 1.2 6.6L12 18l-5.9 3.1 1.2-6.6L2.4 9.8l6.7-.9L12 2.8z" fill="transparent" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowUp() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4l7 7-1.7 1.7L13.2 8.6V20h-2.4V8.6L6.7 12.7 5 11l7-7z" fill="transparent" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
