"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import AssetsDock from "@/app/components/board/work/AssetsDock";
import ProjectPanelSection from "@/app/components/board/work/ProjectPanelSection";
import PortfolioPanel from "@/app/components/board/work/PortfolioPanel";

type TabKey = "drops" | "assets" | "projects" | "portfolio";

type Props = {
  open: boolean;
  onOpen?: () => void;
  onClose: () => void;
  /** optional: if you ever want to open directly to Assets/Projects/Portfolio */
  initialTab?: TabKey;
};

const ORDER: TabKey[] = ["drops", "assets", "projects", "portfolio"];

function tabLabel(t: TabKey) {
  if (t === "drops") return "Board Drops";
  if (t === "assets") return "Assets";
  if (t === "projects") return "Projects";
  return "Portfolio";
}

/** Universal Drop categories (minus pay drops) */
const DROP_CATEGORIES = [
  { key: "link", label: "Link Drop" },
  { key: "youtube", label: "YouTube Drop" },
  { key: "music", label: "Music Drop" },
  { key: "media", label: "Vision Drop" }, // photo/video lives here
  { key: "status", label: "Status Drop" },
];

export default function DropPadWindow({ open, onOpen, onClose, initialTab }: Props) {
  const startIndex = useMemo(() => {
    if (!initialTab) return 0;
    const idx = ORDER.indexOf(initialTab);
    return idx === -1 ? 0 : idx;
  }, [initialTab]);

  const [tabIndex, setTabIndex] = useState<number>(startIndex);

  // Reset to Board Drops on every open (unless you want otherwise)
  useEffect(() => {
    if (!open) return;
    setTabIndex(startIndex);
  }, [open, startIndex]);

  const activeTab = ORDER[tabIndex];

  // Swipe handling
  const dragRef = useRef<{ x: number; y: number; active: boolean } | null>(null);

  const goNext = () => setTabIndex((i) => (i + 1) % ORDER.length);
  const goPrev = () => setTabIndex((i) => (i - 1 + ORDER.length) % ORDER.length);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { x: e.clientX, y: e.clientY, active: true };
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag?.active) return;

    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;

    // Ignore mostly-vertical drags
    if (Math.abs(dy) > Math.abs(dx)) return;

    // Threshold
    if (dx <= -60) goNext();
    if (dx >= 60) goPrev();
  };

  // Place drop -> jumps to Assets
  const handlePlaceDrop = (kindKey: string) => {
    // You can persist to storage here later.
    // For now this establishes the UX flow: place => assets.
    setTabIndex(ORDER.indexOf("assets"));
  };

  // COLLAPSED (OFF)
  if (!open) {
    return (
      <div className="rounded-[18px] border border-black/10 bg-white/70 p-3 shadow-[0_10px_25px_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-black/80">Drop Pad</div>
          <div className="flex items-center gap-2">
            <div className="rounded-full border border-black/10 bg-black/5 px-3 py-1 text-xs font-semibold text-black/60">
              OFF
            </div>
            <button
              type="button"
              onClick={onOpen}
              className="rounded-full border border-black/10 bg-black px-3 py-2 text-xs font-semibold text-white hover:bg-black/90"
            >
              Open Drop Pad
            </button>
          </div>
        </div>
      </div>
    );
  }

  // OPEN
  return (
    <div className="rounded-[18px] border border-black/10 bg-white/75 p-4 shadow-[0_10px_25px_rgba(0,0,0,0.08)]">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-black/80">Drop Pad</div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-black/70 hover:bg-black/5"
        >
          Close
        </button>
      </div>

      {/* Tabs (locked order) */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {ORDER.map((t, i) => {
          const active = i === tabIndex;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTabIndex(i)}
              className={[
                "rounded-full px-3 py-2 text-xs font-semibold transition",
                active ? "bg-black text-white" : "bg-white text-black/70 border border-black/10 hover:bg-black/5",
              ].join(" ")}
            >
              {tabLabel(t)}
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            className="rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-black/70 hover:bg-black/5"
            title="Swipe left or use arrows"
          >
            ←
          </button>
          <button
            type="button"
            onClick={goNext}
            className="rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-black/70 hover:bg-black/5"
            title="Swipe right or use arrows"
          >
            →
          </button>
        </div>
      </div>

      {/* Swipe surface */}
      <div
        className="mt-4 rounded-[16px] border border-black/10 bg-white p-4"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        {activeTab === "drops" ? (
          <div>
            <div className="text-sm font-semibold text-black/80">Board Drop Menu</div>
            <div className="mt-1 text-xs text-black/55">
              Place a drop and it will appear in your Assets tab.
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {DROP_CATEGORIES.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => handlePlaceDrop(d.key)}
                  className="rounded-[16px] border border-black/10 bg-white p-4 text-left hover:bg-black/5"
                >
                  <div className="text-sm font-semibold text-black/80">{d.label}</div>
                  <div className="mt-1 text-xs text-black/55">Tap to place</div>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {activeTab === "assets" ? (
          <div>
            <div className="text-sm font-semibold text-black/80">Assets</div>
            <div className="mt-2">
              <AssetsDock />
            </div>
          </div>
        ) : null}

        {activeTab === "projects" ? (
          <div>
            <div className="text-sm font-semibold text-black/80">Projects</div>
            <div className="mt-2">
              <ProjectPanelSection />
            </div>
          </div>
        ) : null}

        {activeTab === "portfolio" ? (
          <div>
            <div className="text-sm font-semibold text-black/80">Portfolio</div>
            <div className="mt-2">
              <PortfolioPanel />
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-3 text-xs text-black/45">
        Swipe left/right to move in order: Board Drops → Assets → Projects → Portfolio
      </div>
    </div>
  );
}
