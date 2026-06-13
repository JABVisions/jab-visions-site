"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { supabaseBrowser } from "@/lib/supabase/browser";
import WorkCallsList, { type WorkCallItem } from "@/app/components/board/WorkCallsList";
import ProjectCenter from "@/app/components/board/ProjectCenter";
import StoreDropTile, { type StoreDrop } from "@/app/components/board/StoreDropTile";
import LazyDropStudioStage from "@/app/components/board/LazyDropStudioStage";
import type { DropCustomization } from "@/lib/board/dropCustomizations";
import {
  DESCRIPT_SHARE_EVENT,
  descriptPlainText,
  type DescriptDoc,
} from "@/lib/board/descriptDocs";
import { DROP_PAD_ASSETS_UPDATED_EVENT } from "@/lib/board/dropPadAssets";
import { readPayDrops } from "@/lib/board/paydrops";
import { readBoardProjects } from "@/lib/board/projects";
import { BOARD_DROP_SIGNAL_EVENT } from "@/lib/board/dropSignals";
import { deriveBoardSignals, type BoardSignal } from "@/lib/board/boardSignals";
import {
  buildActivityChannelItems,
  fetchActivityChannelItems,
  type ActivityChannelItem,
} from "@/lib/board/activityChannel";
import DropPadActivityChannel from "@/app/components/board/DropPadActivityChannel";
import DropPadBucketBrain from "@/app/components/board/DropPadBucketBrain";

import {
  ASSETS_STORAGE_KEY,
  CROWN_SRC,
  ORBIT_MODE,
  PORTFOLIO_DROPS_STORAGE_KEY,
  PROJECT_DROPS_STORAGE_KEY,
  PROJECT_DROPS_UPDATED_EVENT,
  RouteTitle,
  WORK_CALLS_STORAGE_KEY,
  buildMusicEmbed,
  buildYouTubeEmbed,
  clamp,
  clsx,
  deleteAllAssetsFromSupabase,
  fetchAssetsFromSupabase,
  getAuthedUserId,
  kindEmoji,
  kindLabel,
  normalizeUrl,
  parseAppleMusic,
  parseSoundCloud,
  parseSpotify,
  parseYouTubeId,
  readAssetsFromStorage,
  readDropItemsFromStorage,
  readFileAsDataUrl,
  readWorkCallsFromStorage,
  safeHostname,
  uid,
  upsertAssetToSupabase,
  uploadMediaToSupabaseStorage,
  useReducedMotion,
  withTimeout,
  writeAssetsToStorage,
  writeDropItemsToStorage,
  writeWorkCallsToStorage,
  type AssetItem,
  type AssetKind,
  type DropDestination,
  type DropPadApp,
  type DropBubble,
  type DropRoute,
  type ScreenMode,
  type WorkCallDraft,
  type WorkCallType,
} from "./dropPadShared";

// Re-export so existing `import type { DropPadApp } from ".../DropPadOS"`
// callers (e.g. explore page) keep working unchanged.
export type { DropPadApp, DropBubble } from "./dropPadShared";


import { EmbeddedAssetTile } from "./dropPadTiles";


/* -------------------------------------------------------------------------- */
/* Modal state                                                                 */
/* -------------------------------------------------------------------------- */

type InputModalState =
  | { open: false }
  | {
      open: true;
      kind: AssetKind;
      title: string;
      description: string;
      destination: DropDestination;

      url?: string;
      text?: string;
      providerHint?: string;
      file?: File | null;

      error?: string | null;
      busy?: boolean;
    };

function ScreenShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="w-full p-5 sm:p-6 relative">
      <div className="text-[11px] tracking-[0.35em] text-white/55">DROP PAD</div>
      <h3 className="mt-2 text-2xl font-semibold text-white/90">{title}</h3>
      {description ? <p className="mt-2 text-sm text-white/55 max-w-[64ch]">{description}</p> : null}
      <div className="mt-5">{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Screens                                                                    */
/* -------------------------------------------------------------------------- */

function destinationLabel(destination: DropDestination) {
  if (destination === "portfolio") return "Portfolio";
  if (destination === "projects") return "Projects";
  return "Assets";
}

function BoardDropsScreen({
  destination,
  onDestinationChange,
  onBeginPlace,
}: {
  destination: DropDestination;
  onDestinationChange: (destination: DropDestination) => void;
  onBeginPlace: (kind: AssetKind) => void;
}) {
  // Creation-first order, mirroring lib/board/dropFlavors.ts: native-creation
  // Drops lead (Vision, Note≈Thought), then the link-ingest types.
  const DROP_TYPES: Array<{ kind: AssetKind; title: string; desc: string; hint: string }> = [
    { kind: "media", title: "Vision", desc: "Image embed", hint: "Upload an image" },
    { kind: "note", title: "Note", desc: "Text drop", hint: "Write something short" },
    { kind: "youtube", title: "YouTube", desc: "YouTube video embed", hint: "Paste a YouTube link" },
    { kind: "music", title: "Music", desc: "Spotify / SoundCloud", hint: "Paste a music link" },
    { kind: "link", title: "Link", desc: "Any URL", hint: "Paste a link" },
    { kind: "doc", title: "Doc", desc: "Docs + PDFs + Notion links", hint: "Paste a doc link" },
  ];

  const [selected, setSelected] = useState<AssetKind>("media");
  const active = DROP_TYPES.find((d) => d.kind === selected) ?? DROP_TYPES[0];

  return (
    <ScreenShell title="Board Drops" description="Select a Drop type, then place it into Assets, Portfolio, or Projects.">
      <div className="rounded-3xl border border-white/10 bg-black/25 shadow-[0_18px_60px_rgba(0,0,0,0.45)] overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs tracking-[0.35em] text-white/55">DROP CONSOLE</div>
              <div className="mt-2 text-lg font-semibold text-white/90 truncate">Choose your Drop</div>
              <div className="mt-1 text-sm text-white/55">Universal Drop categories (no Pay Drops).</div>
            </div>

            <div className="shrink-0 rounded-2xl border border-lime-300/20 bg-lime-400/10 px-3 py-2 text-xs text-lime-200/80">
              To {destinationLabel(destination)}
            </div>
          </div>

          <div className="mt-4 rounded-3xl border border-white/10 bg-black/25 p-2">
            <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/42">
              Place Into
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(["assets", "portfolio", "projects"] as DropDestination[]).map((target) => {
                const isActive = target === destination;
                return (
                  <button
                    key={target}
                    type="button"
                    onClick={() => onDestinationChange(target)}
                    className={clsx(
                      "rounded-2xl border px-3 py-2 text-xs font-semibold transition",
                      isActive
                        ? "border-lime-300/35 bg-lime-400/15 text-lime-100"
                        : "border-white/10 bg-white/5 text-white/62 hover:bg-white/10"
                    )}
                  >
                    {destinationLabel(target)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 -mx-1 px-1 overflow-x-auto overflow-y-hidden">
            <div className="flex flex-nowrap gap-2 min-w-max pb-1">
              {DROP_TYPES.map((t) => {
                const isActive = t.kind === selected;
                return (
                  <button
                    key={t.kind}
                    type="button"
                    onClick={() => setSelected(t.kind)}
                    className={clsx(
                      "shrink-0 rounded-2xl px-4 py-2 text-sm transition border whitespace-nowrap",
                      isActive
                        ? "border-lime-300/30 bg-lime-400/15 text-lime-100/90 shadow-[0_0_22px_rgba(163,230,53,0.18)]"
                        : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                    )}
                  >
                    <span className="mr-2">{kindEmoji(t.kind)}</span>
                    {t.title}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-5">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-white/85">
                  {kindEmoji(active.kind)} {kindLabel(active.kind)}
                </div>
                <div className="mt-1 text-xs text-white/55">{active.desc}</div>
              </div>
              <div className="shrink-0 text-xs text-white/45">Embeds into {destinationLabel(destination)}</div>
            </div>

            <div className="mt-3 rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="text-[11px] tracking-[0.30em] text-white/45">INPUT HINT</div>
              <div className="mt-2 text-sm text-white/75">{active.hint}</div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="text-xs text-white/45">Tap Place to open the Input Portal.</div>

            <button
              type="button"
              onClick={() => onBeginPlace(active.kind)}
              className={clsx(
                "rounded-2xl border border-lime-300/25 bg-lime-400/15 px-5 py-3",
                "text-sm text-lime-100/90 hover:bg-lime-400/20 transition",
                "shadow-[0_0_28px_rgba(163,230,53,0.18)]"
              )}
            >
              Place {active.title} Drop in {destinationLabel(destination)} →
            </button>
          </div>
        </div>
      </div>
    </ScreenShell>
  );
}

function AssetsScreen({
  assets,
  onClear,
  syncing,
}: {
  assets: AssetItem[];
  onClear: () => void;
  syncing: boolean;
}) {
  return (
    <ScreenShell title="Assets" description="Your placed Drops live here as embedded tiles.">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-white/70">
          Total: <span className="text-white/90 font-medium">{assets.length}</span>
          {syncing ? <span className="ml-2 text-xs text-white/45">Syncing…</span> : null}
        </div>

        <button
          type="button"
          onClick={onClear}
          className="rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white/70 hover:bg-black/40 transition"
        >
          Clear Assets
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {assets.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm text-white/80">No embedded drops yet.</div>
            <div className="mt-1 text-xs text-white/45">Go to Board Drops and place your first one.</div>
          </div>
        ) : (
          assets
            .slice()
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((a) => <EmbeddedAssetTile key={a.id} a={a} />)
        )}
      </div>
    </ScreenShell>
  );
}

function ProjectsScreen({ drops }: { drops: AssetItem[] }) {
  return (
    <ScreenShell title="Projects" description="Project tiles, WIP boards, collaborations, and builds.">
      <PlacedDropsSection
        title="Board Drops In Projects"
        empty="Place drops here when they are tied to a project, pitch, casting call, or active build."
        drops={drops}
      />
      <ProjectCenter />
    </ScreenShell>
  );
}

function PortfolioScreen({ drops }: { drops: AssetItem[] }) {
  return (
    <ScreenShell title="Portfolio" description="Showcase-ready Board Drops pinned into your portfolio.">
      <PlacedDropsSection
        title="Portfolio Drops"
        empty="Place polished media, links, notes, and embeds here as portfolio pieces."
        drops={drops}
      />
    </ScreenShell>
  );
}

function PlacedDropsSection({
  title,
  empty,
  drops,
}: {
  title: string;
  empty: string;
  drops: AssetItem[];
}) {
  return (
    <div className="mb-5 rounded-3xl border border-white/10 bg-black/25 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-white/84">{title}</div>
        <div className="text-xs text-white/42">{drops.length} drops</div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {drops.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/58">
            {empty}
          </div>
        ) : (
          drops
            .slice()
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((a) => <EmbeddedAssetTile key={a.id} a={a} />)
        )}
      </div>
    </div>
  );
}

function WorkCallsScreen({
  workCalls,
  counts,
  onOpen,
  onCreate,
  onMarkAllRead,
  onClear,
}: {
  workCalls: WorkCallItem[];
  counts: { casting: number; crew: number; gigs: number; collaborations: number };
  onOpen?: (id: string) => void;
  onCreate?: () => void;
  onMarkAllRead?: () => void;
  onClear?: () => void;
}) {
  return (
    <ScreenShell title="Work Calls" description="A clean inbox for casting, crew, gigs, and collaboration asks.">
      <WorkCallsList
        items={workCalls}
        counts={counts}
        onOpen={onOpen}
        onCreate={onCreate}
        onMarkAllRead={onMarkAllRead}
        onClear={onClear}
      />
    </ScreenShell>
  );
}

function ProfileDropsScreen() {
  return (
    <ScreenShell
      title="Profile Drops"
      description="A folder for the drops and moments tied to creator profile boards. This is where profile-linked drops can live inside Drop Pad OS."
    >
      <div className="rounded-[26px] border border-white/10 bg-white/5 p-6">
        <div className="text-white/88 text-lg font-semibold">Profile Drops</div>
        <div className="mt-2 text-sm text-white/55 max-w-[56ch]">
          Use this bubble for profile-specific drops, creator identity snapshots, and board moments
          routed from Explore and Profile.
        </div>
      </div>
    </ScreenShell>
  );
}

function StoreDropsScreen({ items }: { items: StoreDrop[] }) {
  return (
    <ScreenShell
      title="Store Drops"
      description="A folder for commerce-linked drops, product highlights, and future store interactions across BOARD."
    >
      <div className="space-y-4">
        <div className="rounded-[26px] border border-white/10 bg-white/5 p-5">
          <div className="text-white/88 text-lg font-semibold">Store Drop Marketplace</div>
          <div className="mt-2 max-w-[56ch] text-sm text-white/55">
            Browse the full artifact wave from Explore inside Drop Pad OS.
          </div>
        </div>

        <div className="max-h-[520px] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-4">
            {items.map((item) => (
              <StoreDropTile key={item.id} drop={item} />
            ))}
          </div>
        </div>
      </div>
    </ScreenShell>
  );
}

/* -------------------------------------------------------------------------- */
/* DropPadOS                                                                  */
/* -------------------------------------------------------------------------- */

function appToRoute(app: DropPadApp): DropRoute {
  switch (app) {
    case "board_drops":
      return "board";
    case "assets":
      return "assets";
    case "projects":
      return "projects";
    case "portfolio":
      return "portfolio";
    case "work_calls":
      return "workcalls";
    case "profile_drops":
      return "profiledrops";
    case "store_drops":
      return "storedrops";
    case "home":
    default:
      return "board";
  }
}

function routeToApp(route: DropRoute): DropPadApp {
  switch (route) {
    case "assets":
      return "assets";
    case "projects":
      return "projects";
    case "portfolio":
      return "portfolio";
    case "workcalls":
      return "work_calls";
    case "profiledrops":
      return "profile_drops";
    case "storedrops":
      return "store_drops";
    case "board":
    default:
      return "board_drops";
  }
}

export default function DropPadOS({
  className,
  drops,
  onSelect,

  // ✅ CONTROLLED POWER + ROUTE FROM REMOTE / WORKPAGE
  osOn,
  osApp,
  onPower,
  onNavigate,
  onHome,
  onOff,

  title = "DROP PAD OS",
  subtitle = "Work Profile Console",
  maxScreenPx,
  storeDrops = [],
}: {
  className?: string;
  drops?: DropBubble[];
  onSelect?: (route: DropRoute) => void;

  osOn: boolean;
  osApp: DropPadApp;

  onPower?: () => void; // toggles
  onNavigate?: (app: DropPadApp) => void;
  onHome?: () => void;
  onOff?: () => void;

  title?: string;
  subtitle?: string;
  maxScreenPx?: number;
  storeDrops?: StoreDrop[];
}) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const reducedMotion = useReducedMotion();

  // ✅ internal view state (menu vs screen), but power is external
  const [mode, setMode] = useState<ScreenMode>("menu");
  const [bootPhase, setBootPhase] = useState<"off" | "booting" | "ready" | "sleep">("off");

  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [portfolioDrops, setPortfolioDrops] = useState<AssetItem[]>([]);
  const [projectDrops, setProjectDrops] = useState<AssetItem[]>([]);
  const [dropDestination, setDropDestination] = useState<DropDestination>("assets");
  const [syncing, setSyncing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [modal, setModal] = useState<InputModalState>({ open: false });

  // ✅ Drop Pad OS 4 — Drop Studio launches straight from the lock screen.
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioInitialMode, setStudioInitialMode] = useState<
    "photo" | "video" | "audio" | "art" | "descript"
  >("photo");
  const [studioValue, setStudioValue] = useState<DropCustomization>({});

  // ✅ Profile Work Board (the spatial page to the right of the orb home).
  const [profileStats, setProfileStats] = useState<{
    status: "unemployed" | "working" | "on_vacation";
    job: string;
    payDrops: number;
    projects: number;
  }>({ status: "unemployed", job: "", payDrops: 0, projects: 0 });

  // ✅ Activity Channel (signal waterfall) + Bucket Brain signals.
  const [activityItems, setActivityItems] = useState<ActivityChannelItem[]>([]);
  const [signals, setSignals] = useState<BoardSignal[]>([]);

  // Vertical spatial navigation: orb "home" ↔ "activity" (up) ↔ "bucketBrain" (down).
  const [verticalSpace, setVerticalSpace] = useState<"home" | "activity" | "bucketBrain">("home");
  const spaceCooldownRef = useRef(0);
  const menuTouchRef = useRef<{ x: number; y: number } | null>(null);
  const activityScrollRef = useRef<HTMLDivElement | null>(null);

  function navVertical(space: "home" | "activity" | "bucketBrain") {
    const now = Date.now();
    if (now - spaceCooldownRef.current < 480) return;
    spaceCooldownRef.current = now;
    setVerticalSpace(space);
  }

  function activityAtBottom() {
    const el = activityScrollRef.current;
    if (!el) return true;
    return el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
  }
  function activityScrollable() {
    const el = activityScrollRef.current;
    return el ? el.scrollHeight - el.clientHeight > 4 : false;
  }

  function onMenuWheel(e: React.WheelEvent) {
    if (Math.abs(e.deltaY) < 22) return;
    const up = e.deltaY < 0;
    if (verticalSpace === "home") {
      navVertical(up ? "activity" : "bucketBrain"); // up → Activity, down → Bucket Brain
    } else if (verticalSpace === "activity") {
      // The "Activity Channel" gateway sits at the bottom — scroll down there to
      // drop back to Orb Home (or any down when there's nothing to scroll).
      if ((!up && activityAtBottom()) || !activityScrollable()) navVertical("home");
    } else if (verticalSpace === "bucketBrain") {
      if (up) navVertical("home"); // leave the lower layer by scrolling up
    }
  }

  function onMenuTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    menuTouchRef.current = { x: t.clientX, y: t.clientY };
  }

  function onMenuTouchEnd(e: React.TouchEvent) {
    const s = menuTouchRef.current;
    menuTouchRef.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dy) < 50 || Math.abs(dy) <= Math.abs(dx)) return; // need a vertical swipe
    const swipeUp = dy < 0;
    const swipeDown = dy > 0;
    if (verticalSpace === "home") {
      navVertical(swipeUp ? "activity" : "bucketBrain");
    } else if (verticalSpace === "activity") {
      if ((swipeDown && activityAtBottom()) || !activityScrollable()) navVertical("home");
    } else if (verticalSpace === "bucketBrain") {
      if (swipeUp) navVertical("home");
    }
  }

  // ✅ Work Calls
  const [workCalls, setWorkCalls] = useState<WorkCallItem[]>([]);
  const workCallCounts = useMemo(() => {
    const base = { casting: 0, crew: 0, gigs: 0, collaborations: 0 };
    for (const w of workCalls) {
      if (w.type === "casting") base.casting += 1;
      if (w.type === "crew") base.crew += 1;
      if (w.type === "gigs") base.gigs += 1;
      if (w.type === "collaborations") base.collaborations += 1;
    }
    return base;
  }, [workCalls]);

  // ✅ Work Call Composer
  const [wcDraft, setWcDraft] = useState<WorkCallDraft>({
    open: false,
    type: "casting",
    title: "",
    preview: "",
    error: null,
  });

  // ✅ Drop placement indicator
  const [dropPlacedPulse, setDropPlacedPulse] = useState(false);
  const [dropPlacedToast, setDropPlacedToast] = useState<{ show: boolean; text: string }>({
    show: false,
    text: "",
  });

  const pulseTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const triggerDropPlacedIndicator = (text: string) => {
    setDropPlacedPulse(true);
    setDropPlacedToast({ show: true, text });

    if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);

    pulseTimerRef.current = window.setTimeout(() => setDropPlacedPulse(false), 2500);
    toastTimerRef.current = window.setTimeout(() => setDropPlacedToast({ show: false, text: "" }), 2200);
  };

  const openWorkCallComposer = () => {
    setWcDraft({
      open: true,
      type: "casting",
      title: "",
      preview: "",
      error: null,
    });
  };

  const submitWorkCall = () => {
    const titleVal = wcDraft.title.trim();
    if (!titleVal) {
      setWcDraft((p) => ({ ...p, error: "Title is required." }));
      return;
    }

    const previewVal = wcDraft.preview.trim();

    const item: WorkCallItem = {
      id: uid(),
      type: wcDraft.type,
      title: titleVal,
      preview: previewVal || undefined,
      createdAt: Date.now(),
      unread: true,
    };

    setWorkCalls((prev) => [item, ...prev]);
    triggerDropPlacedIndicator("SYSTEM: Work Call posted");
    setWcDraft((p) => ({ ...p, open: false }));
  };

  // iPad-like extendable screen
  const initialScreenPx = 470;
  const [screenPx, setScreenPx] = useState<number>(initialScreenPx);
  const screenMinPx = 420;
  const screenMaxPxRef = useRef<number>(1100);

  const resizeDragRef = useRef<{ dragging: boolean; startY: number; startH: number } | null>(null);

  const DEFAULT_DROPS: DropBubble[] = useMemo(
    () => [
      { id: "d1", label: "Board Drops", route: "board", emoji: "🫧" },
      { id: "d2", label: "Assets", route: "assets", emoji: "🗂️" },
      { id: "d3", label: "Projects", route: "projects", emoji: "🧩" },
      { id: "d4", label: "Portfolio", route: "portfolio", emoji: "🎞️" },
      { id: "d5", label: "Work Calls", route: "workcalls", emoji: "📣" },
      { id: "d6", label: "Profile Drops", route: "profiledrops", emoji: "🪞" },
      { id: "d7", label: "Store Drops", route: "storedrops", emoji: "🛍️" },
    ],
    []
  );

  const menuDrops = drops?.length ? drops : DEFAULT_DROPS;

  // Orbit positions (percent-based, stable with your fixed menu container)
  const getOrbitPos = (i: number, total: number) => {
    const cx = 50;
    const cy = 52;

    // ellipse radii in percent
    const rx = 30;
    const ry = 24;

    if (total <= 1) return { x: cx, y: cy - ry };

    if (ORBIT_MODE === "arch") {
      const start = Math.PI * 1.15;
      const end = Math.PI * -0.15;
      const t = total === 1 ? 0.5 : i / (total - 1);
      const a = start + (end - start) * t;
      return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
    }

    const a = (i / total) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
  };

  // local cache first
  useEffect(() => {
    setAssets(readAssetsFromStorage());
    setPortfolioDrops(readDropItemsFromStorage(PORTFOLIO_DROPS_STORAGE_KEY));
    setProjectDrops(readDropItemsFromStorage(PROJECT_DROPS_STORAGE_KEY));
    setWorkCalls(readWorkCallsFromStorage());
  }, []);

  // Load the Profile Work Board stats (work status/job, pay drop + project counts).
  useEffect(() => {
    if (!osOn) return;
    const load = () => {
      let status: "unemployed" | "working" | "on_vacation" = "unemployed";
      let job = "";
      try {
        const raw = localStorage.getItem("jab_board_work_desk_v1");
        if (raw) {
          const p = JSON.parse(raw);
          if (p?.status === "working" || p?.status === "on_vacation" || p?.status === "unemployed") {
            status = p.status;
          }
          if (typeof p?.job === "string") job = p.job;
        }
      } catch {
        /* noop */
      }
      let payDrops = 0;
      let projects = 0;
      try {
        payDrops = readPayDrops(userId).length;
      } catch {
        /* noop */
      }
      try {
        projects = readBoardProjects().length;
      } catch {
        /* noop */
      }
      setProfileStats({ status, job, payDrops, projects });
    };
    load();
    window.addEventListener("storage", load);
    window.addEventListener("focus", load);
    window.addEventListener("board:projects:updated", load as EventListener);
    return () => {
      window.removeEventListener("storage", load);
      window.removeEventListener("focus", load);
      window.removeEventListener("board:projects:updated", load as EventListener);
    };
  }, [osOn, userId]);

  // Load the Activity Channel waterfall + Bucket Brain signals.
  useEffect(() => {
    if (!osOn) return;
    let cancelled = false;
    const refresh = () => {
      // Fast local fallback, then replace with real Supabase-backed signals.
      setActivityItems(buildActivityChannelItems(userId));
      setSignals(deriveBoardSignals(userId));
      void fetchActivityChannelItems(userId).then((items) => {
        if (!cancelled && items.length) setActivityItems(items);
      });
    };
    refresh();
    const onEvt = () => refresh();
    window.addEventListener("board:activity:new", onEvt as EventListener);
    window.addEventListener("storage", onEvt);
    window.addEventListener(BOARD_DROP_SIGNAL_EVENT, onEvt as EventListener);
    window.addEventListener("board:drop-comments:updated", onEvt as EventListener);
    return () => {
      cancelled = true;
      window.removeEventListener("board:activity:new", onEvt as EventListener);
      window.removeEventListener("storage", onEvt);
      window.removeEventListener(BOARD_DROP_SIGNAL_EVENT, onEvt as EventListener);
      window.removeEventListener("board:drop-comments:updated", onEvt as EventListener);
    };
  }, [osOn, userId]);

  // Refresh the Assets bin whenever a Work Drop is added from another surface
  // (e.g. the Work Drop Station) so it shows up without a reload.
  useEffect(() => {
    const reload = () => setAssets(readAssetsFromStorage());
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === ASSETS_STORAGE_KEY) reload();
    };
    window.addEventListener(DROP_PAD_ASSETS_UPDATED_EVENT, reload as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(DROP_PAD_ASSETS_UPDATED_EVENT, reload as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // persist work calls locally (for now)
  useEffect(() => {
    writeWorkCallsToStorage(workCalls);
  }, [workCalls]);

  // auth + supabase sync
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const uid_ = await getAuthedUserId(sb);
      if (cancelled) return;
      setUserId(uid_);

      if (!uid_) return;

      setSyncing(true);
      const res = await fetchAssetsFromSupabase(sb, uid_);
      if (!cancelled) {
        if (res.ok) {
          setAssets(res.items);
          writeAssetsToStorage(res.items);
        }
        setSyncing(false);
      }
    };

    run();

    const { data: sub } = sb.auth.onAuthStateChange(async () => {
      const uid_ = await getAuthedUserId(sb);
      if (cancelled) return;
      setUserId(uid_);

      if (!uid_) return;

      setSyncing(true);
      const res = await fetchAssetsFromSupabase(sb, uid_);
      if (!cancelled) {
        if (res.ok) {
          setAssets(res.items);
          writeAssetsToStorage(res.items);
        }
        setSyncing(false);
      }
    });

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe?.();
    };
  }, [sb]);

  // compute max based on viewport
  useEffect(() => {
    const compute = () => {
      const viewportMax = Math.max(640, window.innerHeight - 180);
      const max = typeof maxScreenPx === "number" ? Math.min(viewportMax, maxScreenPx) : viewportMax;
      screenMaxPxRef.current = max;
      setScreenPx((prev) => clamp(prev, screenMinPx, max));
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [maxScreenPx]);

  // Esc closes modals
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (modal.open) setModal({ open: false });
        if (wcDraft.open) setWcDraft((p) => ({ ...p, open: false }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal.open, wcDraft.open]);

  const syncAssetsLocal = (next: AssetItem[]) => {
    setAssets(next);
    writeAssetsToStorage(next);
  };

  const syncPortfolioDropsLocal = (next: AssetItem[]) => {
    setPortfolioDrops(next);
    writeDropItemsToStorage(PORTFOLIO_DROPS_STORAGE_KEY, next);
  };

  const syncProjectDropsLocal = (next: AssetItem[]) => {
    setProjectDrops(next);
    writeDropItemsToStorage(PROJECT_DROPS_STORAGE_KEY, next);
  };

  // ✅ Controlled: whenever osOn changes, drive boot phases + cleanup
  useEffect(() => {
    if (osOn) {
      setScreenPx(clamp(initialScreenPx, screenMinPx, screenMaxPxRef.current));
      setBootPhase("booting");
      setMode("menu");
      const t = window.setTimeout(() => setBootPhase("ready"), 550);
      return () => window.clearTimeout(t);
    }

    // turning OFF
    setBootPhase("sleep");
    const t = window.setTimeout(() => {
      setBootPhase("off");
      setMode("menu");
      setModal({ open: false });
      setWcDraft((p) => ({ ...p, open: false }));
    }, 250);
    return () => window.clearTimeout(t);
  }, [osOn]);

  // ✅ Controlled: whenever osApp changes, open correct screen if powered
  const activeRoute = appToRoute(osApp);
  const showProjectHologram =
    osOn && bootPhase === "ready" && mode === "screen" && activeRoute === "projects";

  useEffect(() => {
    if (!osOn) return;
    if (osApp === "home") {
      setMode("menu");
      return;
    }
    setMode("screen");
  }, [osOn, osApp]);

  const openRoute = (route: DropRoute) => {
    // keep backward-compat with any older parent listeners
    onSelect?.(route);

    // ✅ tell the Remote/WorkPage where to go
    onNavigate?.(routeToApp(route));

    // local view update (screen)
    setMode("screen");
  };

  const jumpToAssets = () => {
    onSelect?.("assets");
    onNavigate?.("assets");
    setMode("screen");
  };

  const clearAssets = async () => {
    syncAssetsLocal([]);
    triggerDropPlacedIndicator("SYSTEM: Assets cleared");

    if (!userId) return;

    setSyncing(true);
    await deleteAllAssetsFromSupabase(sb, userId);
    setSyncing(false);
  };

  /* ----------------------------- placing drops ---------------------------- */

  const beginPlace = (kind: AssetKind) => {
    setModal({
      open: true,
      kind,
      destination: dropDestination,
      title: "",
      description: "",
      url: "",
      text: "",
      file: null,
      providerHint:
        kind === "music"
          ? "Spotify or SoundCloud URL"
          : kind === "youtube"
          ? "YouTube URL (watch, shorts, or youtu.be)"
          : kind === "doc"
          ? "Google Doc / Notion / PDF / Drive link"
          : kind === "link"
          ? "Any URL"
          : kind === "note"
          ? "Note body"
          : "Upload image",
      error: null,
      busy: false,
    });
  };

  const jumpToDestination = (destination: DropDestination) => {
    onSelect?.(destination);
    onNavigate?.(destination);
    setMode("screen");
  };

  // Drop Pad OS 4 — a drop captured in Drop Studio is a "Work Drop" and lands
  // straight in the Assets bin (no manual destination picker).
  const addWorkDropToAssets = async (file: File) => {
    setStudioOpen(false);
    setStudioValue({});
    const now = Date.now();
    const isImage = file.type.startsWith("image/");

    let mediaUrl = "";
    if (userId) {
      const uploaded = await uploadMediaToSupabaseStorage(sb, userId, file);
      if (uploaded.ok) mediaUrl = uploaded.publicUrl;
    }
    if (!mediaUrl) {
      mediaUrl = await readFileAsDataUrl(file).catch(() => "");
    }
    if (!mediaUrl) {
      triggerDropPlacedIndicator("SYSTEM: Work Drop couldn’t be saved");
      return;
    }

    const asset: AssetItem = {
      id: uid(),
      kind: "media",
      title: `Work Drop · ${new Date(now).toLocaleDateString()}`,
      createdAt: now,
      payload: isImage ? { mediaType: "image", mediaUrl } : { mediaUrl },
    };

    syncAssetsLocal([asset, ...assets]);
    if (userId) {
      setSyncing(true);
      await withTimeout(upsertAssetToSupabase(sb, userId, asset), 8000).catch(() => ({ ok: false }));
      setSyncing(false);
    }
    triggerDropPlacedIndicator("SYSTEM: Work Drop placed in Assets");
  };

  const addWorkDropFromDescript = async (doc: DescriptDoc) => {
    setStudioOpen(false);
    setStudioValue({});
    const now = Date.now();
    const plain = doc.plainText?.trim() || descriptPlainText(doc.html);
    if (!plain && !doc.title?.trim()) {
      triggerDropPlacedIndicator("SYSTEM: Descript was empty");
      return;
    }

    const asset: AssetItem = {
      id: uid(),
      kind: "note",
      title: doc.title?.trim() || `Work Drop · ${new Date(now).toLocaleDateString()}`,
      description: plain.slice(0, 500) || undefined,
      createdAt: now,
      payload: { text: plain },
    };

    setAssets((prev) => {
      const next = [asset, ...prev];
      syncAssetsLocal(next);
      return next;
    });

    if (userId) {
      setSyncing(true);
      await withTimeout(upsertAssetToSupabase(sb, userId, asset), 8000).catch(() => ({ ok: false }));
      setSyncing(false);
    }
    triggerDropPlacedIndicator("SYSTEM: Descript Work Drop placed in Assets");
  };

  useEffect(() => {
    function onDescriptShare(event: Event) {
      const doc = (event as CustomEvent<DescriptDoc>).detail;
      if (!doc || doc.destination !== "work") return;
      void addWorkDropFromDescript(doc);
    }
    window.addEventListener(DESCRIPT_SHARE_EVENT, onDescriptShare as EventListener);
    return () => window.removeEventListener(DESCRIPT_SHARE_EVENT, onDescriptShare as EventListener);
  }, [userId, sb]);

  const placeAsset = async (asset: AssetItem, destination: DropDestination) => {
    if (destination === "portfolio") {
      syncPortfolioDropsLocal([asset, ...portfolioDrops]);
    } else if (destination === "projects") {
      syncProjectDropsLocal([asset, ...projectDrops]);
      window.dispatchEvent(new CustomEvent(PROJECT_DROPS_UPDATED_EVENT));
    } else {
      const next = [asset, ...assets];
      syncAssetsLocal(next);
    }

    if (userId && destination === "assets") {
      setSyncing(true);
      await withTimeout(upsertAssetToSupabase(sb, userId, asset), 8000).catch(() => ({ ok: false }));
      setSyncing(false);
    }

    triggerDropPlacedIndicator(`SYSTEM: ${kindLabel(asset.kind)} placed in ${destinationLabel(destination)}`);

    setModal({ open: false });
    jumpToDestination(destination);
  };

  const submitModal = async () => {
    if (!modal.open) return;

    const kind = modal.kind;
    const destination = modal.destination;
    const now = Date.now();

    const titleVal = (modal.title ?? "").trim();
    if (!titleVal) {
      setModal({ ...modal, error: "Title is required." });
      return;
    }

    const descVal = (modal.description ?? "").trim();

    if (kind === "media") {
      const f = modal.file ?? null;
      if (!f) {
        setModal({ ...modal, error: "Choose an image first." });
        return;
      }
      if (!f.type.startsWith("image/")) {
        setModal({ ...modal, error: "Vision Drop currently supports images only." });
        return;
      }

      setModal({ ...modal, busy: true, error: null });

      const placeLocalMedia = async () => {
        const dataUrl = await readFileAsDataUrl(f).catch(() => "");
        if (!dataUrl) {
          setModal({ ...modal, busy: false, error: "Couldn’t read that image." });
          return false;
        }

        await placeAsset(
          {
            id: uid(),
            kind,
            title: titleVal,
            description: descVal || undefined,
            createdAt: now,
            payload: { mediaType: "image", mediaUrl: dataUrl },
          },
          destination
        );
        return true;
      };

      if (userId) {
        const uploaded = await uploadMediaToSupabaseStorage(sb, userId, f);
        if (!uploaded.ok) {
          await placeLocalMedia();
          return;
        }

        await placeAsset(
          {
            id: uid(),
            kind,
            title: titleVal,
            description: descVal || undefined,
            createdAt: now,
            payload: { mediaType: "image", mediaUrl: uploaded.publicUrl },
          },
          destination
        );
        return;
      }

      await placeLocalMedia();
      return;
    }

    if (kind === "music") {
      const raw = modal.url?.trim() ?? "";
      const url = normalizeUrl(raw);
      if (!url) {
        setModal({ ...modal, error: "Paste a music link first." });
        return;
      }
      const { embedUrl } = buildMusicEmbed(url);
      if (!embedUrl) {
        setModal({ ...modal, error: "Unsupported music link. Use Spotify or SoundCloud." });
        return;
      }

      await placeAsset(
        {
          id: uid(),
          kind,
          title: titleVal,
          description: descVal || undefined,
          createdAt: now,
          payload: { embedUrl },
        },
        destination
      );
      return;
    }

    if (kind === "youtube") {
      const raw = modal.url?.trim() ?? "";
      const url = normalizeUrl(raw);
      if (!url) {
        setModal({ ...modal, error: "Paste a YouTube link first." });
        return;
      }
      const { embedUrl } = buildYouTubeEmbed(url);
      if (!embedUrl) {
        setModal({ ...modal, error: "That doesn’t look like a valid YouTube link." });
        return;
      }

      await placeAsset(
        {
          id: uid(),
          kind,
          title: titleVal,
          description: descVal || undefined,
          createdAt: now,
          payload: { embedUrl },
        },
        destination
      );
      return;
    }

    if (kind === "doc" || kind === "link") {
      const raw = modal.url?.trim() ?? "";
      const url = normalizeUrl(raw);
      try {
        // eslint-disable-next-line no-new
        new URL(url);
      } catch {
        setModal({ ...modal, error: "That doesn’t look like a valid URL." });
        return;
      }

      await placeAsset(
        {
          id: uid(),
          kind,
          title: titleVal,
          description: descVal || undefined,
          createdAt: now,
          payload: { url },
        },
        destination
      );
      return;
    }

    if (kind === "note") {
      const text = (modal.text ?? "").trim();
      if (!text) {
        setModal({ ...modal, error: "Write your note first." });
        return;
      }

      await placeAsset(
        {
          id: uid(),
          kind,
          title: titleVal,
          description: descVal || undefined,
          createdAt: now,
          payload: { text },
        },
        destination
      );
      return;
    }
  };

  const renderScreen = () => {
    switch (activeRoute) {
      case "board":
        return (
          <BoardDropsScreen
            destination={dropDestination}
            onDestinationChange={setDropDestination}
            onBeginPlace={beginPlace}
          />
        );
      case "assets":
        return <AssetsScreen assets={assets} onClear={clearAssets} syncing={syncing} />;
      case "projects":
        return <ProjectsScreen drops={projectDrops} />;
      case "portfolio":
        return <PortfolioScreen drops={portfolioDrops} />;
      case "workcalls":
        return (
          <WorkCallsScreen
            workCalls={workCalls}
            counts={workCallCounts}
            onCreate={openWorkCallComposer}
            onMarkAllRead={() => {
              setWorkCalls((prev) => prev.map((x) => ({ ...x, unread: false })));
              triggerDropPlacedIndicator("SYSTEM: Work Calls marked read");
            }}
            onClear={() => {
              setWorkCalls([]);
              triggerDropPlacedIndicator("SYSTEM: Work Calls cleared");
            }}
            onOpen={(id) => {
              setWorkCalls((prev) => prev.map((x) => (x.id === id ? { ...x, unread: false } : x)));
            }}
          />
        );
      case "profiledrops":
        return <ProfileDropsScreen />;
      case "storedrops":
        return <StoreDropsScreen items={storeDrops} />;
      default:
        return (
          <BoardDropsScreen
            destination={dropDestination}
            onDestinationChange={setDropDestination}
            onBeginPlace={beginPlace}
          />
        );
    }
  };

  // drag handler for bottom grabber
  const onGrabberDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const max = screenMaxPxRef.current;
    resizeDragRef.current = { dragging: true, startY: e.clientY, startH: screenPx };
    (e.currentTarget as HTMLButtonElement).setPointerCapture?.(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      const ref = resizeDragRef.current;
      if (!ref?.dragging) return;
      const dy = ev.clientY - ref.startY;
      const next = clamp(ref.startH - dy, screenMinPx, max);
      setScreenPx(next);
    };

    const onUp = () => {
      if (resizeDragRef.current) resizeDragRef.current.dragging = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  return (
    <section
      className={clsx(
        "relative w-full h-full rounded-3xl overflow-visible",
        "border border-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]",
        "bg-gradient-to-b from-[#070913] via-[#050612] to-[#03040b]",
        className
      )}
      aria-label="Drop Pad OS"
    >
      {/* internal glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full blur-3xl opacity-20 bg-lime-400" />
        <div className="absolute bottom-[-180px] right-[-160px] h-[520px] w-[520px] rounded-full blur-3xl opacity-15 bg-cyan-300" />
        <div className="absolute top-[35%] left-[-220px] h-[520px] w-[520px] rounded-full blur-3xl opacity-10 bg-fuchsia-400" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-start justify-between p-5 sm:p-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] tracking-[0.38em] text-white/60">{title}</span>
            <span
              className={clsx(
                "text-[10px] px-2 py-1 rounded-full border",
                bootPhase === "ready"
                  ? "border-lime-400/30 text-lime-200/80 bg-lime-400/10"
                  : "border-white/10 text-white/60 bg-white/5"
              )}
            >
              {bootPhase === "off"
                ? "OFF"
                : bootPhase === "booting"
                ? "BOOT"
                : bootPhase === "sleep"
                ? "SLEEP"
                : "ON"}
            </span>

            {userId ? (
              <span className="text-[10px] px-2 py-1 rounded-full border border-white/10 bg-white/5 text-white/55">
                SUPABASE
              </span>
            ) : (
              <span className="text-[10px] px-2 py-1 rounded-full border border-white/10 bg-white/5 text-white/55">
                LOCAL
              </span>
            )}
          </div>

          <h2 className="mt-2 text-xl sm:text-2xl font-semibold text-white/90">{subtitle}</h2>

          <p className="mt-1 text-sm text-white/55 max-w-[62ch]">
            {osOn
              ? mode === "menu"
                ? "Select a bubble to open a screen."
                : "Board Drops places embedded tiles into Assets."
              : "Power on to summon the Drops menu."}
          </p>
        </div>

        {/* Power Button (CONTROLLED) */}
        <button
          type="button"
          onClick={() => (onPower ? onPower() : undefined)}
          className={clsx(
            "relative shrink-0",
            "h-11 w-11 rounded-2xl",
            "border border-lime-300/30",
            "bg-gradient-to-b from-lime-400/30 to-lime-400/10",
            "shadow-[0_0_24px_rgba(163,230,53,0.35)]",
            "active:scale-[0.98] transition"
          )}
          aria-label={osOn ? "Power off Drop Pad" : "Power on Drop Pad"}
          title={osOn ? "Power Off" : "Power On"}
        >
          <span className="absolute inset-0 rounded-2xl bg-lime-400/15 blur-md opacity-70" />
          <span className="relative z-10 grid h-full w-full place-items-center">
            <span className="h-4 w-4 rounded-full bg-lime-300 shadow-[0_0_18px_rgba(163,230,53,0.85)]" />
          </span>
        </button>
      </header>

      {/* Active route hint + placement pulse indicator */}
      <div className="relative z-10 px-5 sm:px-6">
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="text-sm text-white/70 flex items-center gap-2">
            Active: <span className="text-white/90 font-medium">{RouteTitle(activeRoute)}</span>
            {dropPlacedPulse ? (
              <span className="relative inline-flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-300 opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-lime-300" />
              </span>
            ) : null}
          </div>

          <div className="text-xs text-white/45">
            {osOn ? (mode === "menu" ? "Drops Menu" : `Embedded: ${assets.length}`) : "Offline"}
          </div>
        </div>
      </div>

      {/* Scrollable + extendable iPad screen */}
      <div className="relative z-10 mt-4 px-5 sm:px-6 pb-6">
        <div
          className="osScreenViewport relative w-full rounded-3xl border border-white/10 bg-white/[0.03]"
          style={{ height: `${screenPx}px` }}
        >
          {/* scanlines */}
          <div className="absolute inset-0 opacity-[0.08] pointer-events-none">
            <div className="h-full w-full bg-[linear-gradient(to_bottom,rgba(255,255,255,0.10)_1px,transparent_1px)] bg-[length:100%_8px]" />
          </div>

          {/* OFF / STANDBY (crown centered) */}
          {!osOn && (
            <div className="grid place-items-center py-14 sm:py-16">
              <div className="relative grid place-items-center text-center px-8">
                <div className="absolute inset-0 rounded-full blur-3xl opacity-25 bg-lime-400" />

                <div className="relative z-10 grid place-items-center">
                  <Image
                    src={CROWN_SRC}
                    alt="JAB Visions Crown"
                    width={260}
                    height={260}
                    priority
                    className="select-none drop-shadow-[0_0_30px_rgba(163,230,53,0.45)]"
                  />
                </div>

                <div className="relative z-10 mt-6">
                  <div className="text-white/60 text-sm tracking-widest">DROP PAD</div>
                  <div className="mt-2 text-2xl font-semibold text-white/85">Standby</div>
                  <div className="mt-2 text-sm text-white/50 max-w-[46ch] mx-auto">
                    Power on to open the holographic Drops menu.
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
                    <button
                      type="button"
                      onClick={() => {
                        setStudioInitialMode("photo");
                        setStudioOpen(true);
                      }}
                      className="group relative z-10 inline-flex items-center gap-2 rounded-full border border-cyan-200/30 bg-gradient-to-b from-cyan-300/15 to-fuchsia-400/10 px-6 py-3 text-sm font-extrabold uppercase tracking-[0.18em] text-cyan-50/90 shadow-[0_0_24px_rgba(126,226,255,0.28)] backdrop-blur-sm transition hover:from-cyan-300/25 hover:to-fuchsia-400/18 hover:shadow-[0_0_32px_rgba(126,226,255,0.42)]"
                      aria-label="Open Drop Studio"
                    >
                      <span aria-hidden className="text-base leading-none">🎬</span>
                      Drop Studio
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setStudioInitialMode("descript");
                        setStudioOpen(true);
                      }}
                      className="group relative z-10 inline-flex items-center gap-2 rounded-full border border-slate-200/30 bg-gradient-to-b from-slate-200/14 to-slate-400/10 px-6 py-3 text-sm font-extrabold uppercase tracking-[0.18em] text-slate-50/90 shadow-[0_0_24px_rgba(200,210,230,0.22)] backdrop-blur-sm transition hover:from-slate-200/22 hover:to-slate-400/16 hover:shadow-[0_0_32px_rgba(200,210,230,0.34)]"
                      aria-label="Open Descript in Drop Studio"
                    >
                      <span aria-hidden className="text-base leading-none">📝</span>
                      Descript
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {osOn && bootPhase === "booting" && (
            <div className="grid place-items-center py-16">
              <div className="rounded-3xl border border-lime-400/20 bg-black/40 px-6 py-5 backdrop-blur-sm">
                <div className="text-xs tracking-[0.35em] text-lime-200/70">INITIALIZING</div>
                <div className="mt-2 text-white/85 font-medium">Loading Drop Pad OS…</div>
                <div className="mt-3 h-2 w-64 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full w-2/3 bg-lime-300/60 rounded-full animate-pulse" />
                </div>
              </div>
            </div>
          )}

          {osOn && bootPhase === "ready" && (
            <div className="relative">
              <div className="sticky top-0 z-20 px-4 pt-4">
                <div className="flex items-center justify-between gap-3">
                  {mode === "screen" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setMode("menu");
                        onHome?.();
                        onNavigate?.("home");
                      }}
                      className="rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white/80 hover:bg-black/40 transition"
                      aria-label="Back to Drops menu"
                      title="Back to Drops"
                    >
                      ← Back to Drops
                    </button>
                  ) : (
                    <div className="text-sm text-white/65">Drops Menu</div>
                  )}

                  <div className="flex items-center gap-3">
                    <div className="hidden sm:block text-xs text-white/45">Screen</div>
                    <input
                      type="range"
                      min={screenMinPx}
                      max={screenMaxPxRef.current}
                      value={screenPx}
                      onChange={(e) => setScreenPx(Number(e.target.value))}
                      className="w-40 accent-lime-300"
                      aria-label="Drop Pad screen height"
                      title="Extend screen"
                    />
                    <div className="text-xs text-white/45 w-14 text-right">{screenPx}px</div>
                  </div>
                </div>
              </div>

              {/* MENU — spatial nav: orb home ↔ Work Board (→) and Activity Channel (↑) */}
              {mode === "menu" && (
                <div
                  className="osMenuRoot"
                  onWheel={onMenuWheel}
                  onTouchStart={onMenuTouchStart}
                  onTouchEnd={onMenuTouchEnd}
                >
                <div
                  className="osPager"
                  aria-label="Spatial home — swipe between Drops and your Profile Work Board"
                >
                  <section className="osPage">
                    <div className="relative h-[560px] sm:h-[620px]">
                  {/* Crown center */}
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                    <div className="relative grid place-items-center">
                      <div className="absolute inset-0 rounded-full blur-3xl opacity-25 bg-lime-400" />
                      <Image
                        src={CROWN_SRC}
                        alt="JAB Visions Crown"
                        width={190}
                        height={190}
                        priority
                        className="relative z-10 select-none drop-shadow-[0_0_34px_rgba(163,230,53,0.45)]"
                      />
                    </div>
                  </div>

                  {menuDrops.map((drop, i) => {
                    const pos = getOrbitPos(i, menuDrops.length);
                    const size = 112;

                    return (
                      <button
                        key={drop.id}
                        type="button"
                        onClick={() => openRoute(drop.route)}
                        className={clsx(
                          "absolute rounded-full",
                          "border border-white/15",
                          "backdrop-blur-md",
                          "shadow-[0_10px_40px_rgba(0,0,0,0.35)]",
                          "transition active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-lime-300/40",
                          "hover:ring-2 hover:ring-white/10"
                        )}
                        style={{
                          left: `${pos.x}%`,
                          top: `${pos.y}%`,
                          width: `${size}px`,
                          height: `${size}px`,
                          transform: "translate(-50%, -50%)",
                          animation: reducedMotion
                            ? undefined
                            : `floaty ${5.2 + (i % 4) * 0.8}s ease-in-out ${i * 0.12}s infinite`,
                        }}
                        aria-label={`Open ${drop.label}`}
                        title={drop.label}
                      >
                        <span
                          className="absolute inset-0 rounded-full"
                          style={{
                            background:
                              "radial-gradient(circle at 30% 28%, rgba(255,255,255,0.30), rgba(255,255,255,0.07) 42%, rgba(163,230,53,0.10) 64%, rgba(34,211,238,0.08) 78%, rgba(217,70,239,0.06) 100%)",
                          }}
                        />
                        <span className="absolute left-[18%] top-[16%] h-[26%] w-[26%] rounded-full bg-white/20 blur-sm" />
                        <span className="absolute right-[14%] bottom-[12%] h-[18%] w-[18%] rounded-full bg-lime-300/15 blur-md" />

                        <span className="relative z-10 grid h-full w-full place-items-center px-3 text-center">
                          <span className="text-[18px] leading-none">{drop.emoji ?? "🫧"}</span>
                          <span className="mt-2 text-[11px] font-medium text-white/85 leading-tight">
                            {drop.label}
                          </span>
                        </span>
                      </button>
                    );
                  })}

                  <div className="absolute bottom-5 left-6 right-6 text-center text-xs text-white/40">
                    Tap a bubble · swipe&nbsp;↑&nbsp;Activity · swipe&nbsp;→&nbsp;Work Board · swipe&nbsp;↓&nbsp;Bucket Brain
                  </div>
                    </div>
                  </section>

                  <section className="osPage osProfilePage">
                    <div className="pwb">
                      <div className="pwbHead">
                        <div className="pwbEyebrow">Profile</div>
                        <div className="pwbTitle">Work Board</div>
                      </div>

                      <div className="pwbDesk">
                        <div className="pwbStatusRow">
                          <span className={clsx("pwbDot", profileStats.status)} />
                          <div className="min-w-0">
                            <div className="pwbStatusLabel">
                              {profileStats.status === "working"
                                ? "Working"
                                : profileStats.status === "on_vacation"
                                  ? "On Vacation"
                                  : "Open to Work"}
                            </div>
                            <div className="pwbJob">{profileStats.job || "No job set yet"}</div>
                          </div>
                        </div>

                        <div className="pwbStats">
                          <button
                            type="button"
                            className="pwbStat"
                            onClick={() => openRoute("storedrops")}
                          >
                            <div className="pwbStatNum">{profileStats.payDrops}</div>
                            <div className="pwbStatLabel">Pay Drops</div>
                          </button>
                          <button
                            type="button"
                            className="pwbStat"
                            onClick={() => openRoute("projects")}
                          >
                            <div className="pwbStatNum">{profileStats.projects}</div>
                            <div className="pwbStatLabel">Projects</div>
                          </button>
                        </div>
                      </div>

                      <div className="pwbHint">← swipe back to your Drops</div>
                    </div>
                  </section>
                  </div>

                  {/* ACTIVITY CHANNEL — floating upper layer (swipe / scroll up) */}
                  <div
                    className={clsx("osActivityLayer", verticalSpace === "activity" && "open")}
                    aria-hidden={verticalSpace !== "activity"}
                  >
                    <DropPadActivityChannel
                      active={verticalSpace === "activity"}
                      items={activityItems}
                      onReturn={() => navVertical("home")}
                      scrollRef={activityScrollRef}
                    />
                  </div>

                  {/* BUCKET BRAIN — lower layer (swipe / scroll down) */}
                  <div
                    className={clsx("osBucketLayer", verticalSpace === "bucketBrain" && "open")}
                    aria-hidden={verticalSpace !== "bucketBrain"}
                  >
                    <DropPadBucketBrain onReturn={() => navVertical("home")} signals={signals} />
                  </div>
                </div>
              )}

              {mode === "screen" && !showProjectHologram && <div className="pt-2">{renderScreen()}</div>}

              <div className="sticky bottom-0 z-30 px-4 pb-3 pt-2 bg-gradient-to-t from-black/35 to-transparent">
                <div className="flex items-center justify-center">
                  <button
                    type="button"
                    onPointerDown={onGrabberDown}
                    className={clsx(
                      "group w-28 h-7 rounded-full",
                      "border border-white/10 bg-black/25 backdrop-blur",
                      "shadow-[0_10px_30px_rgba(0,0,0,0.35)]",
                      "cursor-ns-resize"
                    )}
                    aria-label="Resize Drop Pad screen"
                    title="Drag to extend screen"
                  >
                    <span className="block mx-auto mt-[10px] h-[5px] w-12 rounded-full bg-white/20 group-hover:bg-lime-200/30 transition" />
                  </button>
                </div>

                <div className="mt-2 text-center text-[11px] text-white/35">Drag handle to extend the screen</div>
              </div>

              {/* INPUT MODAL + WORK CALL MODAL + TOASTS */}
              {/* (unchanged from your version; kept intact) */}
              {/* INPUT MODAL */}
              {modal.open && (
                <div className="fixed inset-0 z-[999]">
                  <button
                    type="button"
                    onClick={() => setModal({ open: false })}
                    className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
                    aria-label="Close modal backdrop"
                  />
                  <div className="absolute left-1/2 top-1/2 w-[min(620px,92%)] -translate-x-1/2 -translate-y-1/2">
                    <div className="rounded-3xl border border-white/10 bg-[#070913]/90 shadow-[0_20px_90px_rgba(0,0,0,0.65)] overflow-hidden">
                      <div className="flex items-start justify-between gap-3 p-5">
                        <div className="min-w-0">
                          <div className="text-[11px] tracking-[0.35em] text-white/55">INPUT PORTAL</div>
                          <div className="mt-2 text-xl font-semibold text-white/90">
                            {kindEmoji(modal.kind)} {kindLabel(modal.kind)}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setModal({ open: false })}
                          className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/70 hover:bg-black/40 transition"
                          aria-label="Close modal"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="px-5 pb-5">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <label className="block">
                            <div className="text-xs text-white/55 mb-2">Title (required)</div>
                            <input
                              value={modal.title}
                              onChange={(e) => setModal({ ...modal, title: e.target.value, error: null })}
                              placeholder="Name your drop…"
                              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-lime-300/40"
                            />
                          </label>

                          <label className="block">
                            <div className="text-xs text-white/55 mb-2">Description (optional)</div>
                            <input
                              value={modal.description}
                              onChange={(e) => setModal({ ...modal, description: e.target.value, error: null })}
                              placeholder="Short description…"
                              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-lime-300/40"
                            />
                          </label>
                        </div>

                        <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3">
                          <div className="mb-2 text-xs text-white/55">Destination</div>
                          <div className="grid grid-cols-3 gap-2">
                            {(["assets", "portfolio", "projects"] as DropDestination[]).map((target) => (
                              <button
                                key={target}
                                type="button"
                                onClick={() => setModal({ ...modal, destination: target, error: null })}
                                className={clsx(
                                  "rounded-xl border px-3 py-2 text-xs font-semibold transition",
                                  modal.destination === target
                                    ? "border-lime-300/35 bg-lime-400/15 text-lime-100"
                                    : "border-white/10 bg-white/5 text-white/62 hover:bg-white/10"
                                )}
                              >
                                {destinationLabel(target)}
                              </button>
                            ))}
                          </div>
                        </div>

                        {(modal.kind === "music" ||
                          modal.kind === "youtube" ||
                          modal.kind === "link" ||
                          modal.kind === "doc") && (
                          <div className="mt-4 space-y-3">
                            <label className="block">
                              <div className="text-xs text-white/55 mb-2">{modal.providerHint ?? "URL"}</div>
                              <input
                                value={modal.url ?? ""}
                                onChange={(e) => setModal({ ...modal, url: e.target.value, error: null })}
                                placeholder="https://example.com"
                                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-lime-300/40"
                              />
                            </label>
                          </div>
                        )}

                        {modal.kind === "note" && (
                          <div className="mt-4 space-y-3">
                            <label className="block">
                              <div className="text-xs text-white/55 mb-2">Note body</div>
                              <textarea
                                value={modal.text ?? ""}
                                onChange={(e) => setModal({ ...modal, text: e.target.value, error: null })}
                                placeholder="Type something…"
                                rows={5}
                                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-lime-300/40"
                              />
                            </label>
                          </div>
                        )}

                        {modal.kind === "media" && (
                          <div className="mt-4 space-y-3">
                            <label className="block">
                              <div className="text-xs text-white/55 mb-2">Upload image</div>
                              <span className="inline-flex w-fit cursor-pointer items-center justify-center rounded-full border border-cyan-200/25 bg-cyan-100/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-cyan-50 shadow-[0_0_18px_rgba(103,232,249,0.10)] transition hover:-translate-y-0.5 hover:bg-cyan-100/15">
                                Upload
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) =>
                                  setModal({
                                    ...modal,
                                    file: e.target.files?.[0] ?? null,
                                    error: null,
                                  })
                                }
                                className="sr-only"
                              />
                              <div className="mt-2 min-h-5 max-w-full truncate text-xs font-semibold text-white/55">
                                {modal.file?.name ?? "Select image from this device."}
                              </div>
                            </label>
                            <div className="text-xs text-white/45">
                              {userId ? "Uploads to Supabase Storage bucket: board-media." : "Not logged in: image will save locally only."}
                            </div>
                          </div>
                        )}

                        {modal.error ? (
                          <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200/90">
                            {modal.error}
                          </div>
                        ) : null}

                        <div className="mt-5 flex items-center justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => setModal({ open: false })}
                            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white/70 hover:bg-black/40 transition"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={submitModal}
                            disabled={!!modal.busy}
                            className={clsx(
                              "rounded-2xl border border-lime-300/25 bg-lime-400/15 px-4 py-2",
                              "text-sm text-lime-100/90 hover:bg-lime-400/20 transition",
                              modal.busy ? "opacity-60 cursor-not-allowed" : ""
                            )}
                          >
                            {modal.busy ? "Saving…" : `Place in ${destinationLabel(modal.destination)}`}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 text-center text-xs text-white/40">Tip: press Esc to close.</div>
                  </div>
                </div>
              )}

              {/* WORK CALL COMPOSER MODAL */}
              {wcDraft.open ? (
                <div className="fixed inset-0 z-[999]">
                  <button
                    type="button"
                    onClick={() => setWcDraft((p) => ({ ...p, open: false }))}
                    className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
                    aria-label="Close Work Call modal backdrop"
                  />
                  <div className="absolute left-1/2 top-1/2 w-[min(700px,92%)] -translate-x-1/2 -translate-y-1/2">
                    <div className="rounded-3xl border border-white/10 bg-[#070913]/90 shadow-[0_20px_90px_rgba(0,0,0,0.65)] overflow-hidden">
                      <div className="flex items-start justify-between gap-3 p-5">
                        <div className="min-w-0">
                          <div className="text-[11px] tracking-[0.35em] text-white/55">WORK CALL</div>
                          <div className="mt-2 text-xl font-semibold text-white/90">Create Work Call</div>
                          <div className="mt-1 text-sm text-white/55">
                            Posts into Work Calls Inbox as a tagged message drop.
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setWcDraft((p) => ({ ...p, open: false }))}
                          className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/70 hover:bg-black/40 transition"
                          aria-label="Close Work Call modal"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="px-5 pb-5">
                        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                          {(["casting", "crew", "gigs", "collaborations"] as WorkCallType[]).map((type) => (
                            <button
                              key={type}
                              type="button"
                              onClick={() => setWcDraft((p) => ({ ...p, type, error: null }))}
                              className={clsx(
                                "rounded-2xl border px-3 py-2 text-xs font-semibold transition",
                                wcDraft.type === type
                                  ? "border-lime-300/35 bg-lime-400/15 text-lime-100"
                                  : "border-white/10 bg-white/5 text-white/62 hover:bg-white/10"
                              )}
                            >
                              {type === "casting"
                                ? "Casting"
                                : type === "crew"
                                  ? "Crew"
                                  : type === "gigs"
                                    ? "Gig"
                                    : "Collab"}
                            </button>
                          ))}
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <label className="block">
                            <div className="text-xs text-white/55 mb-2">Call Type</div>
                            <select
                              value={wcDraft.type}
                              onChange={(e) =>
                                setWcDraft((p) => ({
                                  ...p,
                                  type: e.target.value as WorkCallType,
                                  error: null,
                                }))
                              }
                              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 focus:outline-none focus:ring-2 focus:ring-lime-300/40"
                            >
                              <option value="casting">Casting Call</option>
                              <option value="crew">Crew Call</option>
                              <option value="gigs">Gigs</option>
                              <option value="collaborations">Collaborations</option>
                            </select>
                          </label>

                          <label className="block">
                            <div className="text-xs text-white/55 mb-2">Title (required)</div>
                            <input
                              value={wcDraft.title}
                              onChange={(e) => setWcDraft((p) => ({ ...p, title: e.target.value, error: null }))}
                              placeholder="Ex: Crew: DP needed for Saturday shoot"
                              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-lime-300/40"
                            />
                          </label>
                        </div>

                        <label className="block mt-4">
                          <div className="text-xs text-white/55 mb-2">Details</div>
                          <textarea
                            value={wcDraft.preview}
                            onChange={(e) => setWcDraft((p) => ({ ...p, preview: e.target.value, error: null }))}
                            placeholder="Rates, location, date, contact details, roles, or what kind of collaborator you need..."
                            rows={5}
                            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-lime-300/40"
                          />
                        </label>

                        {wcDraft.error ? (
                          <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200/90">
                            {wcDraft.error}
                          </div>
                        ) : null}

                        <div className="mt-5 flex items-center justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => setWcDraft((p) => ({ ...p, open: false }))}
                            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white/70 hover:bg-black/40 transition"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={submitWorkCall}
                            className="rounded-2xl border border-lime-300/25 bg-lime-400/15 px-4 py-2 text-sm text-lime-100/90 hover:bg-lime-400/20 transition shadow-[0_0_20px_rgba(163,230,53,0.16)]"
                          >
                            Post Work Call
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 text-center text-xs text-white/40">
                      Tip: Posted calls appear as unread messages in the Work Calls inbox.
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Global system toast */}
              {dropPlacedToast.show ? (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[1000]">
                  <div className="rounded-2xl border border-lime-300/25 bg-lime-400/15 px-4 py-3 text-sm text-lime-100/90 shadow-[0_0_28px_rgba(163,230,53,0.18)]">
                    {dropPlacedToast.text}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {showProjectHologram ? (
        <div className="pointer-events-none fixed inset-0 z-[130]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(195,255,244,0.07),transparent_34%),radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_30%),radial-gradient(circle_at_bottom,rgba(96,240,255,0.06),transparent_36%)]" />
          <div className="pointer-events-auto absolute left-1/2 top-[84px] h-[min(80vh,860px)] w-[min(1120px,calc(100vw-28px))] -translate-x-1/2">
            <div className="absolute inset-0 rounded-[34px] bg-[linear-gradient(135deg,rgba(255,255,255,0.22),rgba(150,255,234,0.1),rgba(255,255,255,0.06),rgba(255,184,245,0.12))] blur-2xl opacity-90" />
            <div className="absolute -inset-[2px] rounded-[36px] border border-white/22 opacity-70" />
            <div className="absolute inset-[1px] rounded-[34px] border border-white/28 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(190,245,255,0.1)_18%,rgba(26,34,52,0.26)_46%,rgba(9,14,28,0.34)_100%)] shadow-[0_24px_120px_rgba(0,0,0,0.42),0_0_90px_rgba(160,255,238,0.12),inset_0_1px_0_rgba(255,255,255,0.4)] backdrop-blur-[30px] overflow-hidden">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_14%,rgba(255,255,255,0.34),transparent_18%),radial-gradient(circle_at_78%_12%,rgba(255,255,255,0.2),transparent_16%),linear-gradient(120deg,rgba(255,255,255,0.12),transparent_22%,transparent_72%,rgba(255,255,255,0.08))]" />
              <div className="pointer-events-none absolute inset-x-6 top-0 h-16 rounded-b-[28px] bg-[linear-gradient(180deg,rgba(255,255,255,0.28),transparent)] opacity-80 blur-md" />
              <div className="flex items-center justify-between gap-3 border-b border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.04))] px-5 py-4">
                <div className="min-w-0">
                  <div className="text-[11px] tracking-[0.34em] text-cyan-50/72">LIQUID GLASS PROJECTION</div>
                  <div className="mt-1 text-lg font-semibold text-white/90">Projects Panel</div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setMode("menu");
                    onHome?.();
                    onNavigate?.("home");
                  }}
                  className="rounded-2xl border border-white/18 bg-white/10 px-4 py-2 text-sm text-white/84 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] hover:bg-white/14 transition"
                >
                  Close Projection
                </button>
              </div>

              <div className="h-[calc(100%-74px)] overflow-y-auto overflow-x-visible bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] px-4 py-4">
                <ProjectCenter />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <LazyDropStudioStage
        open={studioOpen}
        initialFile={null}
        initialMode={studioInitialMode}
        allowedModes={["photo", "video", "audio", "art", "descript"]}
        descriptDestination="work"
        value={studioValue}
        onChange={setStudioValue}
        onClose={() => setStudioOpen(false)}
        onComplete={(file) => void addWorkDropToAssets(file)}
      />

      <style jsx>{`
        /* Main monitor — scroll when needed, but no bulky OS scrollbar rail. */
        .osScreenViewport {
          overflow-x: hidden;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .osScreenViewport::-webkit-scrollbar {
          display: none;
          width: 0;
          height: 0;
        }

        .osMenuRoot {
          position: relative;
          overflow: hidden;
        }

        /* Activity Channel — a glowing floating upper layer that slides down over
           the orb home when you swipe/scroll up, and back up to return. */
        .osActivityLayer {
          position: absolute;
          inset: 0;
          z-index: 26;
          transform: translateY(-100%);
          transition: transform 460ms cubic-bezier(0.22, 0.61, 0.36, 1);
          pointer-events: none;
          display: flex;
          flex-direction: column;
          background:
            radial-gradient(circle at 20% 0%, rgba(126, 226, 255, 0.18), transparent 42%),
            radial-gradient(circle at 86% 8%, rgba(217, 70, 239, 0.14), transparent 40%),
            linear-gradient(180deg, rgba(6, 12, 22, 0.92), rgba(4, 8, 16, 0.97));
          backdrop-filter: blur(16px) saturate(1.1);
          -webkit-backdrop-filter: blur(16px) saturate(1.1);
          box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.06);
        }
        .osActivityLayer.open {
          transform: translateY(0);
          pointer-events: auto;
        }

        /* Bucket Brain — lower layer that rises from below on swipe/scroll down. */
        .osBucketLayer {
          position: absolute;
          inset: 0;
          z-index: 26;
          transform: translateY(100%);
          transition: transform 460ms cubic-bezier(0.22, 0.61, 0.36, 1);
          pointer-events: none;
          overflow: hidden;
          background:
            radial-gradient(circle at 20% 100%, rgba(163, 230, 53, 0.16), transparent 44%),
            linear-gradient(180deg, rgba(4, 8, 16, 0.97), rgba(6, 12, 22, 0.94));
          backdrop-filter: blur(16px) saturate(1.1);
          -webkit-backdrop-filter: blur(16px) saturate(1.1);
        }
        .osBucketLayer.open {
          transform: translateY(0);
          pointer-events: auto;
        }
        .osActivityScroll {
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          padding: 20px 16px 30px;
          scrollbar-width: none;
        }
        .osActivityScroll::-webkit-scrollbar {
          display: none;
        }
        .actTitleWrap {
          text-align: center;
          display: grid;
          gap: 4px;
          padding: 6px 0 14px;
        }
        .actEyebrow {
          font-size: 10px;
          letter-spacing: 0.34em;
          text-transform: uppercase;
          color: rgba(126, 226, 255, 0.7);
        }
        .actTitle {
          margin: 2px 0 0;
          font-size: 1.7rem;
          font-weight: 900;
          color: #fff;
          text-shadow:
            0 0 18px rgba(126, 226, 255, 0.5),
            0 0 40px rgba(217, 70, 239, 0.25);
        }
        .actSub {
          margin: 0;
          font-size: 12px;
          color: rgba(236, 255, 251, 0.55);
        }
        .actReturn {
          justify-self: center;
          margin-top: 8px;
          border-radius: 999px;
          padding: 6px 14px;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(232, 255, 248, 0.82);
          background: rgba(255, 255, 255, 0.07);
          border: 1px solid rgba(167, 244, 232, 0.22);
          cursor: pointer;
        }
        .actSignals {
          display: grid;
          gap: 7px;
          margin-bottom: 16px;
        }
        .actSectionLabel {
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.24em;
          text-transform: uppercase;
          color: rgba(126, 226, 255, 0.72);
          padding: 0 2px 2px;
        }
        .actSignal {
          display: flex;
          align-items: center;
          gap: 10px;
          border-radius: 16px;
          padding: 9px 12px;
          font-size: 12px;
          color: rgba(236, 255, 251, 0.86);
          background: rgba(126, 226, 255, 0.08);
          border: 1px solid rgba(126, 226, 255, 0.18);
        }
        .actSignal.interaction {
          background: rgba(217, 70, 239, 0.1);
          border-color: rgba(217, 70, 239, 0.24);
          color: rgba(255, 234, 252, 0.9);
        }
        .actSigIcon {
          flex: 0 0 auto;
          font-size: 14px;
          line-height: 1;
        }
        .actSigText {
          flex: 1 1 auto;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .actSigTime {
          flex: 0 0 auto;
          font-size: 10px;
          color: rgba(255, 255, 255, 0.42);
        }
        .actStream {
          display: grid;
          gap: 12px;
        }
        .actCard {
          border-radius: 20px;
          padding: 14px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background:
            radial-gradient(circle at 14% 0%, rgba(126, 226, 255, 0.08), transparent 50%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.02));
          box-shadow:
            0 10px 30px rgba(0, 0, 0, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.14);
        }
        .actCardTop {
          display: flex;
          align-items: center;
          gap: 11px;
        }
        .actAvatar {
          flex: 0 0 auto;
          width: 36px;
          height: 36px;
          border-radius: 999px;
          object-fit: cover;
          display: grid;
          place-items: center;
          font-weight: 900;
          color: #06121a;
          background: radial-gradient(circle at 30% 20%, #fff, #7ee2ff);
        }
        .actAvatar.fallback {
          font-size: 14px;
        }
        .actCardHead {
          flex: 1 1 auto;
          min-width: 0;
        }
        .actCardKind {
          font-size: 9px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(126, 246, 230, 0.78);
        }
        .actCardTitle {
          margin-top: 1px;
          font-size: 14px;
          font-weight: 800;
          color: #fff;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .actCardTime {
          flex: 0 0 auto;
          font-size: 10px;
          color: rgba(255, 255, 255, 0.4);
        }
        .actCardBody {
          margin-top: 9px;
          font-size: 13px;
          line-height: 1.45;
          color: rgba(236, 255, 251, 0.72);
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .actEmpty {
          border-radius: 18px;
          padding: 18px;
          text-align: center;
          font-size: 13px;
          color: rgba(236, 255, 251, 0.55);
          border: 1px dashed rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.03);
        }

        /* Spatial home pager — swipe/scroll horizontally between the orb home and
           the Profile Work Board for an AR-like depth feel in the web prototype. */
        .osPager {
          display: flex;
          height: 560px;
          overflow-x: auto;
          overflow-y: hidden;
          scroll-snap-type: x mandatory;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .osPager::-webkit-scrollbar {
          display: none;
        }
        @media (min-width: 640px) {
          .osPager {
            height: 620px;
          }
        }
        .osPage {
          position: relative;
          flex: 0 0 100%;
          width: 100%;
          height: 100%;
          scroll-snap-align: start;
        }
        .osProfilePage {
          overflow-y: auto;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .osProfilePage::-webkit-scrollbar {
          display: none;
          width: 0;
          height: 0;
        }
        .pwb {
          display: grid;
          align-content: start;
          gap: 16px;
          padding: 22px 20px 28px;
          height: 100%;
        }
        .pwbEyebrow {
          font-size: 11px;
          letter-spacing: 0.34em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.5);
        }
        .pwbTitle {
          margin-top: 4px;
          font-size: 1.5rem;
          font-weight: 850;
          color: #fff;
        }
        .pwbDesk {
          display: grid;
          gap: 16px;
          border-radius: 26px;
          padding: 18px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background:
            radial-gradient(circle at 16% 0%, rgba(163, 230, 53, 0.12), transparent 44%),
            radial-gradient(circle at 92% 6%, rgba(34, 211, 238, 0.12), transparent 42%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02));
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16);
        }
        .pwbStatusRow {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .pwbDot {
          flex: 0 0 auto;
          width: 13px;
          height: 13px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.4);
        }
        .pwbDot.working {
          background: #a3ff12;
          box-shadow: 0 0 12px rgba(163, 255, 18, 0.6);
        }
        .pwbDot.on_vacation {
          background: #ffcf4d;
          box-shadow: 0 0 12px rgba(255, 207, 77, 0.5);
        }
        .pwbStatusLabel {
          font-size: 1rem;
          font-weight: 850;
          color: #fff;
        }
        .pwbJob {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.6);
        }
        .pwbStats {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .pwbStat {
          text-align: left;
          border-radius: 18px;
          padding: 14px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.04);
          cursor: pointer;
          transition: background 140ms ease, transform 140ms ease;
        }
        .pwbStat:hover {
          background: rgba(255, 255, 255, 0.08);
          transform: translateY(-1px);
        }
        .pwbStatNum {
          font-size: 1.9rem;
          font-weight: 950;
          line-height: 1;
          color: #fff;
        }
        .pwbStatLabel {
          margin-top: 6px;
          font-size: 10px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.5);
        }
        .pwbHint {
          text-align: center;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.4);
        }

        @keyframes floaty {
          0% {
            transform: translate(-50%, -50%) translateY(0px);
          }
          50% {
            transform: translate(-50%, -50%) translateY(-14px);
          }
          100% {
            transform: translate(-50%, -50%) translateY(0px);
          }
        }
      `}</style>
    </section>
  );
}
