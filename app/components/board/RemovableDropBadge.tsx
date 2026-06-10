// File: app/components/board/RemovableDropBadge.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";

export type RemovableDropBadgeProps = {
  /** The drop-type label to show in the normal state, e.g. "VISION DROP" */
  label: string;
  /** True only when the current viewer owns this drop */
  canRemove: boolean;
  /** Reuses the existing remove handler (confirm + cleanup happens upstream) */
  onRemove: () => void | Promise<void>;
  /** Optional busy flag while the remove is in flight */
  isRemoving?: boolean;
};

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const LONG_PRESS_MS = 480;
const AUTO_HIDE_MS = 2800;

/**
 * Renders the existing pill-shaped drop-type badge ("THOUGHT DROP", "VISION DROP", ...).
 * When the viewer owns the drop, hovering (desktop), long-pressing (touch), or
 * focusing (keyboard) the badge slides it up to reveal a red "REMOVE" pill in
 * its place. Tapping/clicking the revealed pill triggers the existing
 * ownership-gated remove handler (which owns the confirm dialog + cleanup).
 */
export default function RemovableDropBadge({
  label,
  canRemove,
  onRemove,
  isRemoving = false,
}: RemovableDropBadgeProps) {
  const [revealed, setRevealed] = useState(false);
  const longPressTimer = useRef<number | null>(null);
  const autoHideTimer = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const rootRef = useRef<HTMLButtonElement | null>(null);

  function clearLongPressTimer() {
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function clearAutoHideTimer() {
    if (autoHideTimer.current != null) {
      window.clearTimeout(autoHideTimer.current);
      autoHideTimer.current = null;
    }
  }

  function reveal() {
    setRevealed(true);
    clearAutoHideTimer();
    autoHideTimer.current = window.setTimeout(() => {
      setRevealed(false);
    }, AUTO_HIDE_MS);
  }

  function hide() {
    setRevealed(false);
    clearAutoHideTimer();
    clearLongPressTimer();
  }

  useEffect(() => {
    return () => {
      clearLongPressTimer();
      clearAutoHideTimer();
    };
  }, []);

  // Tapping/clicking outside the badge while revealed returns it to normal.
  useEffect(() => {
    if (!revealed) return;
    function onPointerDown(event: PointerEvent) {
      const node = rootRef.current;
      if (node && event.target instanceof Node && !node.contains(event.target)) {
        hide();
      }
    }
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [revealed]);

  if (!canRemove) {
    return (
      <span className="kind">
        {label}
        <style jsx>{`
          .kind {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            height: 24px;
            flex: 0 0 auto;
            box-sizing: border-box;
            border-radius: 999px;
            border: 1px solid rgba(0, 0, 0, 0.1);
            background: rgba(255, 255, 255, 0.74);
            padding: 0 10px;
            font-size: 10px;
            font-weight: 950;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            line-height: 1;
            color: rgba(0, 140, 135, 0.95);
            vertical-align: middle;
          }
        `}</style>
      </span>
    );
  }

  async function commitRemove(event: React.SyntheticEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (isRemoving) return;
    await onRemove();
    hide();
  }

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (revealed) {
      void commitRemove(event);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
      if (revealed) {
        void commitRemove(event);
      } else {
        event.preventDefault();
        reveal();
      }
    } else if (event.key === "Escape") {
      hide();
    }
  }

  function handleTouchStart() {
    clearLongPressTimer();
    longPressTimer.current = window.setTimeout(() => {
      reveal();
      suppressClickRef.current = true;
    }, LONG_PRESS_MS);
  }

  function handleTouchEnd() {
    clearLongPressTimer();
  }

  return (
    <button
      ref={rootRef}
      type="button"
      className={clsx("kindRemovable", revealed && "revealed", isRemoving && "removing")}
      onMouseEnter={reveal}
      onMouseLeave={hide}
      onFocus={reveal}
      onBlur={hide}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onContextMenu={(event) => {
        // Prevent the long-press context menu from interrupting the reveal on touch devices.
        if (revealed || longPressTimer.current != null) event.preventDefault();
      }}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      disabled={isRemoving}
      aria-label={revealed ? `Remove this ${label.toLowerCase()} from your Board` : label}
      title={revealed ? "Remove this Drop from your Board" : label}
    >
      <span className="kindStack" aria-hidden={false}>
        <span className="kindFace label">{label}</span>
        <span className="kindFace remove">{isRemoving ? "REMOVING…" : "REMOVE"}</span>
      </span>

      <style jsx>{`
        .kindRemovable {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 24px;
          flex: 0 0 auto;
          overflow: hidden;
          vertical-align: middle;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(255, 255, 255, 0.74);
          padding: 0;
          margin: 0;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          font: inherit;
          transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
        }

        .kindRemovable:hover,
        .kindRemovable:focus-visible,
        .kindRemovable.revealed {
          border-color: rgba(255, 45, 109, 0.45);
          box-shadow: 0 0 0 4px rgba(255, 45, 109, 0.08);
          background: rgba(255, 255, 255, 0.92);
        }

        .kindRemovable:focus-visible {
          outline: none;
        }

        .kindRemovable:disabled {
          cursor: progress;
          opacity: 0.85;
        }

        .kindStack {
          display: flex;
          flex-direction: column;
          width: 100%;
          /* Pin to exactly two stacked faces (2 x 24px). Without an explicit
             height the parent's align-items:stretch squeezes this to 24px, so a
             percentage translate only moved half a face and the REMOVE label got
             stuck halfway. */
          height: 48px;
          flex: 0 0 48px;
          /* Top-anchor inside the 24px overflow-hidden pill. The button centers
             its children (align-items:center); without this the 48px stack is
             vertically centered and the rest state shows the SEAM between the two
             faces — the label looks pushed halfway out of the pill. */
          align-self: flex-start;
          transform: translateY(0);
          transition: transform 240ms cubic-bezier(0.22, 0.85, 0.32, 1);
        }

        .kindRemovable:hover .kindStack,
        .kindRemovable:focus-visible .kindStack,
        .kindRemovable.revealed .kindStack {
          transform: translateY(-24px);
        }

        .kindFace {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 24px;
          flex: 0 0 24px;
          padding: 0 10px;
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          white-space: nowrap;
          line-height: 1;
        }
        .kindFace.label {
          color: rgba(0, 140, 135, 0.95);
          /* Uppercase glyphs have no descenders, so optically nudge up a hair to
             sit truly centered in the pill (no extra top padding pushing down). */
          padding-bottom: 1px;
        }

        .kindFace.remove {
          color: #ff2d6d;
          background: rgba(255, 45, 109, 0.12);
        }
      `}</style>
    </button>
  );
}
