"use client";

import Image from "next/image";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { sampleBoardWhispers } from "@/app/components/board/BoardWhispers";
import DropsBucket from "@/app/components/board/DropsBucket";
import BucketBrainSpace from "@/app/components/board/bucketBrain/BucketBrainSpace";
import { getLocalActivity, type BoardActivity } from "@/lib/board/activity";
import { mergeActivityWithFeed } from "@/lib/board/feedActivity";
import { EVENTS, readFeed } from "@/lib/boardStore";

export type DropPadSpace = "free" | "home" | "activity" | "work" | "bucket-brain";
export type SpatialLibraryDrop = {
  id: string;
  title: string;
  createdAt: number;
  kind: string;
  mediaUrl?: string;
  mediaType?: "image" | "video" | "audio" | "file";
};

type Direction = "up" | "right" | "down" | "left";
type Point = { x: number; y: number; at: number; target: EventTarget | null };

export const DROP_PAD_SPACE_COORDINATES: Record<DropPadSpace, { x: number; y: number }> = {
  free: { x: -1, y: 0 },
  home: { x: 0, y: 0 },
  activity: { x: 0, y: -1 },
  work: { x: 1, y: 0 },
  "bucket-brain": { x: 0, y: 1 },
};

const SPACE_LABELS: Record<DropPadSpace, string> = {
  free: "Free / Lock Space",
  home: "Home Space",
  activity: "Activity Space",
  work: "Work Space",
  "bucket-brain": "Bucket Brain Space",
};

const MOVES: Record<DropPadSpace, Partial<Record<Direction, DropPadSpace>>> = {
  home: { down: "activity", left: "work", up: "bucket-brain", right: "free" },
  activity: { up: "home" },
  work: { right: "home" },
  "bucket-brain": { down: "home" },
  free: { left: "home" },
};

function directionFromDelta(dx: number, dy: number): Direction | null {
  const horizontal = Math.abs(dx) > Math.abs(dy) * 1.15;
  const vertical = Math.abs(dy) > Math.abs(dx) * 1.15;
  if (!horizontal && !vertical) return null;
  if (horizontal) return dx < 0 ? "left" : "right";
  return dy < 0 ? "up" : "down";
}

function scrollContainerFrom(target: EventTarget | null) {
  return target instanceof Element
    ? (target.closest("[data-space-scroll]") as HTMLElement | null)
    : null;
}

function scrollConsumesGesture(target: EventTarget | null, direction: Direction) {
  const scroller = scrollContainerFrom(target);
  if (!scroller) return false;
  if (direction === "down" || direction === "up") {
    if (scroller.scrollHeight <= scroller.clientHeight + 2) return false;
    if (direction === "down") return scroller.scrollTop > 2;
    return scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 2;
  }
  if (scroller.scrollWidth <= scroller.clientWidth + 2) return false;
  if (direction === "right") return scroller.scrollLeft > 2;
  return scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 2;
}

function isPrivateActivity(item: BoardActivity) {
  const meta = item.meta && typeof item.meta === "object" ? item.meta : null;
  return Boolean((meta as Record<string, unknown> | null)?.private);
}

function activityKindLabel(item: BoardActivity) {
  if (item.kind === "board_drop") return "SIGNAL";
  if (item.kind === "forum_post") return "CONVERSATION";
  if (item.kind === "announcement") return "BROADCAST";
  if (item.kind === "status") return "PRESENCE";
  return "WHISPER";
}

function SpaceFrame({
  space,
  activeSpace,
  children,
  className,
}: {
  space: DropPadSpace;
  activeSpace: DropPadSpace;
  children: React.ReactNode;
  className?: string;
}) {
  const coordinate = DROP_PAD_SPACE_COORDINATES[space];
  const active = activeSpace === space;

  return (
    <section
      className={`dropPadSpace ${className ?? ""}`}
      style={{
        left: `${(coordinate.x + 1) * (100 / 3)}%`,
        top: `${(coordinate.y + 1) * (100 / 3)}%`,
        pointerEvents: active ? "auto" : "none",
      }}
      aria-label={SPACE_LABELS[space]}
      aria-hidden={!active}
      inert={active ? undefined : true}
    >
      {children}
    </section>
  );
}

export default function DropPadSpatialWorld({
  activeSpace,
  onSpaceChange,
  home,
  crownSrc,
  reducedMotion,
  onLock,
  onOpenDropStudio,
  workAssets,
  workPortfolio,
  onOpenWorkDrop,
  onDeleteWorkDrop,
}: {
  activeSpace: DropPadSpace;
  onSpaceChange: (space: DropPadSpace) => void;
  home: React.ReactNode;
  crownSrc: string;
  reducedMotion: boolean;
  onLock?: () => void;
  onOpenDropStudio?: () => void;
  workAssets: SpatialLibraryDrop[];
  workPortfolio: SpatialLibraryDrop[];
  onOpenWorkDrop?: (id: string, library: "assets" | "portfolio") => void;
  onDeleteWorkDrop?: (id: string, library: "assets" | "portfolio") => void;
}) {
  const pointerStartRef = useRef<Point | null>(null);
  const touchStartRef = useRef<Point | null>(null);
  const [activity, setActivity] = useState<BoardActivity[]>([]);
  const [workLibrary, setWorkLibrary] = useState<"assets" | "portfolio">("assets");
  const visibleWorkDrops = workLibrary === "assets" ? workAssets : workPortfolio;

  useEffect(() => {
    const refresh = () => {
      const items = mergeActivityWithFeed(getLocalActivity(), readFeed())
        .filter((item) => item && !isPrivateActivity(item))
        .slice(0, 5);
      setActivity(items);
    };

    refresh();
    window.addEventListener(EVENTS.feedUpdated, refresh as EventListener);
    window.addEventListener("board:activity:new", refresh as EventListener);
    window.addEventListener("board:bucketBrain:updated", refresh as EventListener);
    return () => {
      window.removeEventListener(EVENTS.feedUpdated, refresh as EventListener);
      window.removeEventListener("board:activity:new", refresh as EventListener);
      window.removeEventListener("board:bucketBrain:updated", refresh as EventListener);
    };
  }, []);

  const move = useCallback(
    (direction: Direction, target?: EventTarget | null) => {
      const next = MOVES[activeSpace][direction];
      if (!next || scrollConsumesGesture(target ?? null, direction)) return false;
      onSpaceChange(next);
      return true;
    },
    [activeSpace, onSpaceChange]
  );

  const finishGesture = useCallback(
    (start: Point | null, x: number, y: number, target: EventTarget | null) => {
      if (!start) return;
      const dx = x - start.x;
      const dy = y - start.y;
      const elapsed = Math.max(1, Date.now() - start.at);
      const distance = Math.hypot(dx, dy);
      const velocity = distance / elapsed;
      if (distance < 58 && !(distance >= 36 && velocity > 0.55)) return;
      const direction = directionFromDelta(dx, dy);
      if (direction) move(direction, start.target ?? target);
    },
    [move]
  );

  const coordinate = DROP_PAD_SPACE_COORDINATES[activeSpace];
  const transform = `translate3d(${-((coordinate.x + 1) * (100 / 3))}%, ${-((coordinate.y + 1) * (100 / 3))}%, 0)`;

  return (
    <div
      className="dropPadSpatialViewport"
      tabIndex={0}
      aria-label={`Drop Pad OS spatial navigation. Current location: ${SPACE_LABELS[activeSpace]}`}
      onKeyDown={(event) => {
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
        const direction =
          event.key === "ArrowUp"
            ? "up"
            : event.key === "ArrowRight"
              ? "right"
              : event.key === "ArrowDown"
                ? "down"
                : event.key === "ArrowLeft"
                  ? "left"
                  : null;
        if (direction && move(direction, event.target)) event.preventDefault();
      }}
      onPointerDown={(event) => {
        if (event.pointerType === "touch" || event.button !== 0) return;
        pointerStartRef.current = { x: event.clientX, y: event.clientY, at: Date.now(), target: event.target };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={(event) => {
        if (event.pointerType === "touch") return;
        finishGesture(pointerStartRef.current, event.clientX, event.clientY, event.target);
        pointerStartRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onPointerCancel={() => {
        pointerStartRef.current = null;
      }}
      onTouchStart={(event) => {
        const touch = event.touches[0];
        if (!touch) return;
        touchStartRef.current = { x: touch.clientX, y: touch.clientY, at: Date.now(), target: event.target };
      }}
      onTouchEnd={(event) => {
        const touch = event.changedTouches[0];
        if (!touch) return;
        finishGesture(touchStartRef.current, touch.clientX, touch.clientY, event.target);
        touchStartRef.current = null;
      }}
    >
      <div
        className="dropPadSpatialWorld"
        style={{
          transform,
          transitionDuration: reducedMotion ? "1ms" : "430ms",
        }}
      >
        <SpaceFrame space="activity" activeSpace={activeSpace} className="activitySpace">
          <div className="spaceScroll activityScroll" data-space-scroll>
            <div className="activityMist" aria-hidden />
            <div className="spaceEyebrow">SIGNALS ABOVE HOME</div>
            <div className="activityStream">
              {activity.length ? (
                activity.map((item, index) => (
                  <article key={item.id} className={`signalNode signalNode${index % 5}`}>
                    <span>{activityKindLabel(item)}</span>
                    <strong>{item.title || item.body}</strong>
                    {item.title && item.body ? <p>{item.body}</p> : null}
                  </article>
                ))
              ) : (
                sampleBoardWhispers.slice(0, 4).map((whisper, index) => (
                  <p key={whisper.id} className={`whisperNode whisperNode${index % 4}`}>{whisper.text}</p>
                ))
              )}
            </div>
            <div className="activityIdentity">
              <span>ACTIVITY CHANNEL</span>
              <strong>Signals move through here.</strong>
            </div>
          </div>
        </SpaceFrame>

        <SpaceFrame space="free" activeSpace={activeSpace} className="freeSpace">
          <div className="freeField">
            <div className="freeHalo" aria-hidden />
            <Image src={crownSrc} alt="JAB Visions crown" width={170} height={170} className="freeCrown" />
            <div className="spaceEyebrow">WEST EDGE</div>
            <h3>Free Space</h3>
            <p>A quiet threshold between the active Board and lock.</p>
            <button type="button" onClick={onLock} className="lockButton">Lock Drop Pad</button>
          </div>
        </SpaceFrame>

        <SpaceFrame space="home" activeSpace={activeSpace} className="homeSpace">
          {home}
        </SpaceFrame>

        <SpaceFrame space="work" activeSpace={activeSpace} className="workSpace">
          <div className="workField">
            <div className="workWord">WORK</div>
            <div className="workOrbit" aria-hidden>
              <span />
              <span />
            </div>
            <div className="workDropRail" data-space-scroll aria-live="polite">
              {visibleWorkDrops.length ? (
                visibleWorkDrops.slice(0, 10).map((drop) => (
                  <article className="workDropChip" key={drop.id} title={drop.title}>
                    <button
                      type="button"
                      className="workDropPreview"
                      onClick={() => onOpenWorkDrop?.(drop.id, workLibrary)}
                      aria-label={`Enlarge ${drop.title}`}
                    >
                      {drop.mediaUrl && drop.mediaType === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={drop.mediaUrl} alt="" loading="lazy" />
                      ) : drop.mediaType === "audio" ? (
                        <span aria-hidden>〰</span>
                      ) : drop.mediaType === "video" ? (
                        <span aria-hidden>▶</span>
                      ) : (
                        <span aria-hidden>◇</span>
                      )}
                    </button>
                    <strong>{drop.title}</strong>
                    <div className="workDropActions">
                      <button type="button" onClick={() => onOpenWorkDrop?.(drop.id, workLibrary)} aria-label={`View ${drop.title} as a Drop`}>Expand</button>
                      <button type="button" className="delete" onClick={() => onDeleteWorkDrop?.(drop.id, workLibrary)} aria-label={`Delete ${drop.title} from ${workLibrary}`}>Delete</button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="workEmpty">No {workLibrary} yet</div>
              )}
            </div>
            <div className="workStudio">
              <label htmlFor="work-library-select">Show Drop line</label>
              <select
                id="work-library-select"
                value={workLibrary}
                onChange={(event) => setWorkLibrary(event.target.value as "assets" | "portfolio")}
              >
                <option value="assets">Assets</option>
                <option value="portfolio">Portfolio</option>
              </select>
              <button type="button" onClick={() => onOpenDropStudio?.()}>
                Drop Studio Editor
              </button>
            </div>
          </div>
        </SpaceFrame>

        <SpaceFrame space="bucket-brain" activeSpace={activeSpace} className="brainSpace">
          <div className="spaceScroll brainScroll" data-space-scroll>
            <div className="brainGlow" aria-hidden />
            <BucketBrainSpace
              isActive={activeSpace === "bucket-brain"}
              reducedMotion={reducedMotion}
            />
            <div className="brainMemory">
              <DropsBucket
                title="Bucket Brain Memory"
                subtitle="PASS, PIN, and PUSH stay here — the living memory layer of Drop Pad OS."
                isActive={activeSpace === "bucket-brain"}
              />
            </div>
          </div>
        </SpaceFrame>
      </div>

      <div className="spaceStatus" aria-live="polite">{SPACE_LABELS[activeSpace]}</div>

      <style jsx>{`
        .dropPadSpatialViewport {
          position: relative;
          width: 100%;
          height: 100%;
          min-height: 0;
          overflow: hidden;
          overscroll-behavior: contain;
          outline: none;
          isolation: isolate;
        }
        .dropPadSpatialViewport:focus-visible {
          box-shadow: inset 0 0 0 2px rgba(190, 255, 92, 0.42);
        }
        .dropPadSpatialWorld {
          position: absolute;
          left: 0;
          top: 0;
          width: 300%;
          height: 300%;
          transition-property: transform;
          transition-timing-function: cubic-bezier(0.22, 0.78, 0.24, 1);
          will-change: transform;
        }
        :global(.dropPadSpace) {
          position: absolute;
          width: 33.333333%;
          height: 33.333333%;
          overflow: hidden;
          color: rgba(255, 255, 255, 0.9);
          contain: layout paint;
          background: transparent;
        }
        :global(.spaceScroll) {
          position: relative;
          width: 100%;
          height: 100%;
          overflow-x: hidden;
          overflow-y: auto;
          overscroll-behavior: contain;
          touch-action: pan-y;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,.18) transparent;
        }
        :global(.homeSpace) {
          touch-action: none;
        }
        :global(.activityScroll) { padding: 22px 18px 70px; }
        .activityMist {
          position: absolute; left: 8%; top: 8%; width: 210px; height: 210px; border-radius: 999px; pointer-events: none;
          background: rgba(112,225,255,.08); filter: blur(64px);
        }
        .spaceEyebrow { position: relative; font-size: 10px; letter-spacing: .3em; color: rgba(220,245,255,.5); }
        .activityStream { position: relative; display: grid; gap: 36px; margin-top: 38px; padding: 4px 10px 10px; }
        .signalNode { width: min(78%, 330px); color: rgba(242,251,255,.82); text-shadow: 0 0 18px rgba(135,225,255,.16); }
        .signalNode span { display: block; font-size: 8px; letter-spacing: .28em; color: rgba(156,231,255,.46); }
        .signalNode strong { display: block; margin-top: 7px; font-size: 14px; line-height: 1.42; font-weight: 520; }
        .signalNode p { margin: 6px 0 0; display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; font-size: 11px; line-height: 1.5; color: rgba(230,242,250,.44); }
        .signalNode0 { justify-self: start; transform: translateX(4%); }
        .signalNode1 { justify-self: end; transform: translateX(-3%); }
        .signalNode2 { justify-self: center; width: min(64%, 280px); }
        .signalNode3 { justify-self: start; transform: translateX(16%); }
        .signalNode4 { justify-self: end; transform: translateX(-10%); }
        .whisperNode { width: min(72%, 300px); margin: 0; font-size: 12px; line-height: 1.55; color: rgba(230,244,252,.54); text-shadow: 0 0 20px rgba(140,225,255,.2); }
        .whisperNode0 { justify-self: start; }
        .whisperNode1 { justify-self: end; }
        .whisperNode2 { justify-self: center; transform: translateX(-8%); }
        .whisperNode3 { justify-self: end; transform: translateX(-12%); }
        .activityIdentity { position: relative; margin-top: 48px; padding: 20px 4px 6px; border-top: 1px solid rgba(255,255,255,.1); }
        .activityIdentity span { display: block; font-size: 11px; letter-spacing: .32em; color: rgba(145,230,255,.62); }
        .activityIdentity strong { display: block; margin-top: 8px; font-size: 20px; font-weight: 550; }
        :global(.freeSpace) { touch-action: none; }
        .freeField { position: relative; display: grid; height: 100%; place-content: center; justify-items: center; padding: 28px; text-align: center; }
        .freeHalo { position: absolute; width: 260px; height: 260px; border-radius: 999px; background: rgba(170,255,70,.1); filter: blur(52px); }
        .freeCrown { position: relative; width: min(42%,170px); height: auto; opacity: .82; filter: drop-shadow(0 0 28px rgba(170,255,70,.2)); }
        .freeField h3, .brainHeading h3 { margin: 12px 0 0; font-size: clamp(22px, 7vw, 34px); font-weight: 600; }
        .freeField p, .brainHeading p { max-width: 42ch; margin: 8px auto 0; font-size: 13px; line-height: 1.55; color: rgba(255,255,255,.55); }
        .lockButton { position: relative; margin-top: 24px; border: 1px solid rgba(190,255,100,.26); border-radius: 999px; background: rgba(190,255,100,.1); padding: 10px 18px; color: rgba(240,255,220,.86); font-size: 12px; }
        :global(.workSpace) { touch-action: none; }
        .workField { display: grid; width: 100%; height: 100%; min-width: 0; align-content: center; justify-items: center; padding: 20px 18px 26px; text-align: center; }
        .workWord { font-size: 11px; letter-spacing: .48em; color: rgba(235,246,255,.55); text-shadow: 0 0 22px rgba(155,220,255,.2); }
        .workOrbit { display: flex; gap: 68px; margin-top: 34px; }
        .workOrbit span { width: 5px; height: 5px; border-radius: 999px; background: rgba(190,240,255,.5); box-shadow: 0 0 16px rgba(150,230,255,.48); }
        .workDropRail { display: flex; width: min(100%, 620px); min-height: 112px; gap: 12px; margin-top: 26px; padding: 8px 4px 13px; overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain; scroll-snap-type: x proximity; touch-action: pan-x; scrollbar-width: thin; scrollbar-color: rgba(145,230,255,.24) transparent; }
        .workDropChip { flex: 0 0 92px; min-width: 0; scroll-snap-align: start; text-align: left; }
        .workDropPreview { display: grid; width: 92px; height: 72px; padding: 0; place-items: center; overflow: hidden; border: 1px solid rgba(165,231,255,.2); border-radius: 17px; background: linear-gradient(145deg,rgba(155,230,255,.1),rgba(4,13,23,.5)); color: rgba(210,246,255,.72); font-size: 25px; box-shadow: inset 0 1px 0 rgba(255,255,255,.12),0 0 24px rgba(100,220,255,.06); }
        .workDropPreview:hover, .workDropPreview:focus-visible { border-color: rgba(175,240,255,.46); outline: 2px solid rgba(175,240,255,.2); outline-offset: 2px; }
        .workDropPreview img { display: block; width: 100%; height: 100%; object-fit: contain; }
        .workDropChip strong { display: block; margin-top: 7px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: rgba(236,248,255,.7); font-size: 9px; font-weight: 560; letter-spacing: .03em; }
        .workDropActions { display: flex; gap: 7px; margin-top: 5px; }
        .workDropActions button { border: 0; background: transparent; padding: 0; color: rgba(154,230,255,.62); font-size: 8px; letter-spacing: .04em; }
        .workDropActions button:hover, .workDropActions button:focus-visible { color: rgba(226,250,255,.95); outline: none; text-decoration: underline; text-underline-offset: 2px; }
        .workDropActions .delete { color: rgba(255,160,176,.62); }
        .workEmpty { display: grid; width: 100%; min-height: 84px; place-items: center; font-size: 9px; letter-spacing: .22em; text-transform: uppercase; color: rgba(235,246,255,.24); }
        .workStudio { display: grid; grid-template-columns: auto auto; align-items: center; justify-content: center; gap: 10px 12px; margin-top: 15px; }
        .workStudio label { font-size: 9px; letter-spacing: .17em; text-transform: uppercase; color: rgba(225,244,255,.42); }
        .workStudio select { min-width: 134px; border: 1px solid rgba(190,235,255,.2); border-radius: 999px; background: rgba(3,10,18,.72); padding: 9px 32px 9px 13px; color: rgba(236,249,255,.84); font: inherit; font-size: 10px; }
        .workStudio button { border: 1px solid rgba(145,230,255,.32); border-radius: 999px; background: rgba(105,220,255,.11); padding: 11px 18px; color: rgba(240,252,255,.9); font-size: 11px; font-weight: 650; letter-spacing: .08em; box-shadow: 0 0 24px rgba(110,220,255,.09); }
        .workStudio button { grid-column: 1 / -1; }
        .workStudio button:hover, .workStudio button:focus-visible { background: rgba(105,220,255,.18); outline: 2px solid rgba(175,240,255,.28); outline-offset: 2px; }
        @media (max-width: 520px) {
          .workField { padding-inline: 12px; }
          .workDropRail { width: 100%; min-height: 104px; }
          .workDropChip { flex-basis: 82px; }
          .workDropPreview { width: 82px; height: 66px; }
        }
        :global(.brainScroll) { padding: 22px 14px 72px; }
        .brainGlow { position: absolute; left: 50%; top: 6%; width: 220px; height: 220px; transform: translateX(-50%); border-radius: 999px; pointer-events: none; background: rgba(70,235,255,.07); filter: blur(70px); }
        .brainHeading { position: relative; margin: 0 4px 20px; }
        .brainMemory {
          position: relative;
          width: min(100%, 560px);
          margin: 18px auto 0;
          padding-top: 18px;
          opacity: 0.92;
        }
        .spaceStatus { position: absolute; z-index: 19; right: 12px; top: 12px; max-width: 44%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 9px; letter-spacing: .18em; text-transform: uppercase; color: rgba(255,255,255,.34); pointer-events: none; }
        @media (prefers-reduced-motion: reduce) {
          .dropPadSpatialWorld { transition-duration: 1ms !important; }
        }
      `}</style>
    </div>
  );
}
