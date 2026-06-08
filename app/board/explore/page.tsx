"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Orbit, Radio } from "lucide-react";
import StoreDropMarketplace from "@/app/components/board/StoreDropMarketplace";
import DropPadOS from "@/app/components/board/DropPadOS.v3";
import type { DropPadApp } from "@/app/components/board/DropPadOS";
import { EVT_UPDATED, readBrain, sendWave } from "@/lib/board/bucketBrain";
import { supabaseBrowser } from "@/lib/supabase/browser";

const PROFILE_STORAGE_KEY = "jab_board_profile_v2";
const OPTIONS_STORAGE_KEY = "board.options.v1";

type ProfileDrop = {
  id: string;
  name: string;
  handle: string;
  href: string;
  image?: string;
  aura: "pink" | "red" | "yellow" | "black" | "blue" | "green";
  glowColor: string;
  status: string;
  boardLabel: string;
};

type RemoteBoardStyle = {
  displayName?: string;
  bio?: string;
  glowColor?: string;
  avatarDataUrl?: string | null;
  boardLabel?: string;
  auraColor?: string;
  visibility?: "public" | "private";
};

type RemoteProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url?: string | null;
  board_style?: RemoteBoardStyle | null;
  updated_at?: string | null;
};

const AURA_HEX_MAP: Record<string, string> = {
  sloth_pink: "#FF4FD8",
  lust_blue: "#2D7CFF",
  greed_black: "#111111",
  pride_yellow: "#FFD12D",
  envy_red: "#FF2D2D",
  gluttony_orange: "#FF7A1A",
  wrath_purple: "#7A44FF",
  lilly_yellowgreen: "#B7FF2D",
};

function normalizeNameKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeUserKey(value: string) {
  return value.trim().toLowerCase().replace(/^@+/, "");
}

function resolveBoardGlow(
  boardStyle: RemoteBoardStyle | null | undefined,
  fallbackGlow?: string
) {
  if (typeof boardStyle?.auraColor === "string" && AURA_HEX_MAP[boardStyle.auraColor]) {
    return AURA_HEX_MAP[boardStyle.auraColor];
  }
  if (typeof boardStyle?.glowColor === "string" && boardStyle.glowColor.trim()) {
    return boardStyle.glowColor.trim();
  }
  return fallbackGlow || "#FF4FD8";
}

function glowToAura(glowColor?: string | null): ProfileDrop["aura"] {
  const color = String(glowColor || "").toLowerCase();
  if (color.includes("2d7cff") || color.includes("4da3ff")) return "blue";
  if (color.includes("ff2d2d")) return "red";
  if (color.includes("ffd12d") || color.includes("ffe14d")) return "yellow";
  if (color.includes("111111")) return "black";
  if (color.includes("b7ff2d") || color.includes("7cff6b")) return "green";
  return "pink";
}

const PROFILE_DROPS: ProfileDrop[] = [
  {
    id: "john",
    name: "John Andy",
    handle: "@johnandy",
    href: "/board/profile/johnandy",
    image: "/assets/john_andy_headshot.jpg",
    aura: "pink",
    glowColor: "#FF4FD8",
    status: "Building the JAB Visions universe.",
    boardLabel: "Command Board",
  },
  {
    id: "keven",
    name: "Keven Hart",
    handle: "@kevenhart",
    href: "/board/profile/keven",
    aura: "pink",
    glowColor: "#FF4FD8",
    status: "Pink current in motion.",
    boardLabel: "Lightning Board",
  },
  {
    id: "ruby",
    name: "Ruby Wong",
    handle: "@rubywong",
    href: "/board/profile/ruby",
    aura: "red",
    glowColor: "#FF2D2D",
    status: "Crimson drift and cloned signal.",
    boardLabel: "Crimson Board",
  },
  {
    id: "leo",
    name: "Leo Montana",
    handle: "@leomontana",
    href: "/board/profile/leo",
    aura: "yellow",
    glowColor: "#FFD12D",
    status: "Golden pride on the field.",
    boardLabel: "Heir Board",
  },
  {
    id: "aaron",
    name: "Aaron Addams",
    handle: "@aaronaddams",
    href: "/board/profile/aaron",
    aura: "black",
    glowColor: "#111111",
    status: "Shadow gatekeeper energy.",
    boardLabel: "Gatekeeper Board",
  },
  {
    id: "zoe",
    name: "Zoe Folie",
    handle: "@zoefolie",
    href: "/board/profile/zoe",
    aura: "blue",
    glowColor: "#2D7CFF",
    status: "Blue orbit and reckless spark.",
    boardLabel: "Sky Board",
  },
  {
    id: "lilly",
    name: "Lilly James",
    handle: "@lillyjames",
    href: "/board/profile/lilly",
    aura: "green",
    glowColor: "#B7FF2D",
    status: "Wild famine pulse.",
    boardLabel: "Garden Board",
  },
];

const auraStyles: Record<ProfileDrop["aura"], string> = {
  pink: "border-pink-300/55 shadow-[0_0_34px_rgba(244,114,182,0.34)]",
  red: "border-red-400/55 shadow-[0_0_34px_rgba(248,113,113,0.34)]",
  yellow:
    "border-yellow-300/55 shadow-[0_0_34px_rgba(253,224,71,0.34)]",
  black: "border-white/35 shadow-[0_0_30px_rgba(255,255,255,0.22)]",
  blue: "border-blue-300/55 shadow-[0_0_34px_rgba(96,165,250,0.34)]",
  green:
    "border-lime-300/55 shadow-[0_0_34px_rgba(190,242,100,0.34)]",
};

const accentStyles: Record<ProfileDrop["aura"], string> = {
  pink: "bg-pink-300/20 text-pink-200 border-pink-300/35",
  red: "bg-red-300/20 text-red-200 border-red-300/35",
  yellow: "bg-yellow-300/20 text-yellow-100 border-yellow-200/40",
  black: "bg-white/10 text-white border-white/25",
  blue: "bg-blue-300/20 text-blue-100 border-blue-200/35",
  green: "bg-lime-300/20 text-lime-100 border-lime-200/35",
};

export default function ExplorePage() {
  const [osOn, setOsOn] = useState(true);
  const [osApp, setOsApp] = useState<DropPadApp>("store_drops");
  const [profileDrops, setProfileDrops] = useState(PROFILE_DROPS);
  const [selfUser, setSelfUser] = useState("");
  const [wavedTo, setWavedTo] = useState<Set<string>>(() => new Set());
  const [waveToast, setWaveToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProfileGalaxy() {
      try {
        const supabase = supabaseBrowser();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { data, error } = await supabase
          .from("profiles")
          .select("id, username, display_name, bio, avatar_url, board_style, updated_at")
          .order("updated_at", { ascending: false });

        if (error) throw error;
        if (cancelled || !Array.isArray(data) || data.length === 0) return;

        const localProfileRaw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
        const localOptionsRaw = window.localStorage.getItem(OPTIONS_STORAGE_KEY);
        const localProfile = localProfileRaw ? JSON.parse(localProfileRaw) : null;
        const localOptions = localOptionsRaw ? JSON.parse(localOptionsRaw) : null;
        const currentRow = user?.id
          ? (data as RemoteProfileRow[]).find((row) => row.id === user.id)
          : null;
        const nextSelfUser = normalizeUserKey(
          String(
            currentRow?.username ||
              localOptions?.username ||
              localProfile?.username ||
              user?.email?.split("@")[0] ||
              ""
          )
        );
        if (!cancelled) setSelfUser(nextSelfUser);

        const fallbackByKey = new Map(
          PROFILE_DROPS.map((profile) => [
            profile.handle.replace(/^@/, "").toLowerCase(),
            profile,
          ])
        );
        const fallbackByName = new Map(
          PROFILE_DROPS.map((profile) => [normalizeNameKey(profile.name), profile])
        );

        const remoteDrops = (data as RemoteProfileRow[])
          .filter((row) => {
            const boardStyle =
              row.board_style && typeof row.board_style === "object" ? row.board_style : null;
            return boardStyle?.visibility !== "private";
          })
          .map((row): ProfileDrop | null => {
            const username = String(row.username || "")
              .trim()
              .toLowerCase();
            const profileKey = username || String(row.id || "").trim();
            if (!profileKey) return null;

            const boardStyle =
              row.board_style && typeof row.board_style === "object" ? row.board_style : null;
            const displayNameFromRow =
              typeof row.display_name === "string" ? row.display_name.trim() : "";
            const fallback =
              fallbackByKey.get(profileKey) ||
              (displayNameFromRow
                ? fallbackByName.get(normalizeNameKey(displayNameFromRow))
                : undefined);
            const currentUserId = user?.id ?? null;
            const isCurrentUser = Boolean(currentUserId) && row.id === currentUserId;
            const rowNameMatchesUsername =
              displayNameFromRow &&
              username &&
              normalizeNameKey(displayNameFromRow) === normalizeNameKey(username);
            const resolvedName =
              (isCurrentUser &&
                typeof localOptions?.displayName === "string" &&
                localOptions.displayName.trim()) ||
              (isCurrentUser &&
                typeof localProfile?.displayName === "string" &&
                localProfile.displayName.trim()) ||
              (typeof boardStyle?.displayName === "string" && boardStyle.displayName.trim()) ||
              (rowNameMatchesUsername ? "" : displayNameFromRow) ||
              fallback?.name ||
              "Board User";
            const resolvedStatus =
              (isCurrentUser &&
                typeof localProfile?.bio === "string" &&
                localProfile.bio.trim()) ||
              (typeof boardStyle?.bio === "string" && boardStyle.bio.trim()) ||
              (typeof row.bio === "string" && row.bio.trim()) ||
              fallback?.status ||
              "Public Board signal active.";
            const currentGlow =
              isCurrentUser && typeof localOptions?.auraColor === "string"
                ? AURA_HEX_MAP[localOptions.auraColor]
                : null;
            const localGlow =
              isCurrentUser && typeof localProfile?.glowColor === "string"
                ? localProfile.glowColor
                : null;
            const resolvedGlow =
              currentGlow || localGlow || resolveBoardGlow(boardStyle, fallback?.glowColor);
            const resolvedImage =
              (isCurrentUser &&
                typeof localProfile?.avatarDataUrl === "string" &&
                localProfile.avatarDataUrl.trim()) ||
              (typeof boardStyle?.avatarDataUrl === "string" && boardStyle.avatarDataUrl.trim()) ||
              (typeof row.avatar_url === "string" && row.avatar_url.trim()) ||
              fallback?.image;
            const resolvedBoardLabel =
              (typeof boardStyle?.boardLabel === "string" && boardStyle.boardLabel.trim()) ||
              fallback?.boardLabel ||
              "Profile Board";
            const routeKey = username || profileKey;
            const handleLabel = username ? `@${username}` : "@board-user";
            const aura = fallback?.aura ?? glowToAura(resolvedGlow);

            return {
              id: row.id || profileKey,
              name: resolvedName,
              handle: handleLabel,
              href: `/board/profile/${routeKey}`,
              image: resolvedImage || undefined,
              aura,
              glowColor: resolvedGlow,
              status: resolvedStatus,
              boardLabel: resolvedBoardLabel,
            };
          })
          .filter((profile): profile is ProfileDrop => !!profile);

        if (!cancelled && remoteDrops.length > 0) {
          const seenKeys = new Set(
            remoteDrops.flatMap((profile) => [
              profile.href.split("/").pop()?.toLowerCase() || profile.id,
              profile.handle.replace(/^@/, "").toLowerCase(),
              normalizeNameKey(profile.name),
            ])
          );
          const merged = [
            ...remoteDrops,
            ...PROFILE_DROPS.filter((profile) => {
              const handleKey = profile.handle.replace(/^@/, "").toLowerCase();
              const nameKey = normalizeNameKey(profile.name);
              return !seenKeys.has(handleKey) && !seenKeys.has(nameKey);
            }),
          ];
          setProfileDrops(merged);
        }
      } catch {
        try {
          const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
          const optionsRaw = window.localStorage.getItem(OPTIONS_STORAGE_KEY);
          const profileDraft = raw ? JSON.parse(raw) : null;
          const options = optionsRaw ? JSON.parse(optionsRaw) : null;

          const auraHexMap: Record<string, string> = {
            sloth_pink: "#FF4FD8",
            lust_blue: "#2D7CFF",
            greed_black: "#111111",
            pride_yellow: "#FFD12D",
            envy_red: "#FF2D2D",
            gluttony_orange: "#FF7A1A",
            wrath_purple: "#7A44FF",
            lilly_yellowgreen: "#B7FF2D",
          };

          const resolvedGlow =
            (typeof options?.auraColor === "string" ? auraHexMap[options.auraColor] : null) ||
            (typeof profileDraft?.glowColor === "string" ? profileDraft.glowColor : null);

          if (!resolvedGlow || cancelled) return;

          setProfileDrops((current) =>
            current.map((profile) =>
              profile.id === "john" ? { ...profile, glowColor: resolvedGlow } : profile
            )
          );
        } catch {
          // keep fallback tiles
        }
      }
    }

    void loadProfileGalaxy();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function refreshWaves() {
      if (!selfUser) {
        setWavedTo(new Set());
        return;
      }

      const brain = readBrain();
      setWavedTo(
        new Set(
          brain.waves
            .filter((wave) => wave.from === selfUser)
            .map((wave) => wave.to)
        )
      );
    }

    refreshWaves();
    window.addEventListener(EVT_UPDATED, refreshWaves);
    return () => window.removeEventListener(EVT_UPDATED, refreshWaves);
  }, [selfUser]);

  function waveToProfile(profile: ProfileDrop) {
    const target = normalizeUserKey(profile.handle);

    if (!selfUser) {
      setWaveToast("Log in to wave at profile boards.");
      window.setTimeout(() => setWaveToast(null), 1600);
      return;
    }

    if (!target || target === selfUser) {
      setWaveToast("That is your own board.");
      window.setTimeout(() => setWaveToast(null), 1600);
      return;
    }

    sendWave(selfUser, target);
    setWavedTo((current) => new Set([...current, target]));
    setWaveToast(`Wave sent to @${target}.`);
    window.setTimeout(() => setWaveToast(null), 1600);
  }

  const tileStyleFor = useMemo(
    () => (profile: ProfileDrop) => ({
      borderColor: `${profile.glowColor}88`,
      boxShadow: `0 0 0 1px ${profile.glowColor}26, 0 0 24px ${profile.glowColor}35, 0 0 52px ${profile.glowColor}18`,
    }),
    []
  );

  return (
    <main className="min-h-screen bg-[#050509] text-white">
      <div className="mx-auto max-w-7xl px-5 py-8 md:px-8">
        <section className="relative mb-8 overflow-hidden rounded-[34px] border border-white/10 bg-white/[0.035] p-5 shadow-2xl backdrop-blur-xl">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(212,255,0,0.12),transparent_24%),radial-gradient(circle_at_80%_22%,rgba(255,0,214,0.08),transparent_22%),radial-gradient(circle_at_55%_85%,rgba(0,255,194,0.08),transparent_26%)]" />

          <div className="relative z-10 mb-5">
            <p className="text-xs uppercase tracking-[0.35em] text-lime-300/70">
              Explore Hub
            </p>
            <h1 className="mt-2 flex items-center gap-3 text-3xl font-black md:text-5xl">
              <Orbit className="h-7 w-7 text-lime-300 md:h-9 md:w-9" />
              Profile Galaxy
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-white/50">
              Profile Board drops appear in a horizontal constellation across
              the top of Explore.
            </p>
          </div>

          <div className="relative z-10 flex gap-4 overflow-x-auto pb-3">
            {profileDrops.map((profile) => (
              <Link
                key={profile.id}
                href={profile.href}
                className={[
                  "group h-[342px] w-[300px] min-w-[300px] shrink-0 overflow-hidden rounded-[30px] border bg-[#f4edbd] p-3 text-[#262117] transition duration-300 hover:-translate-y-1",
                  auraStyles[profile.aura],
                ].join(" ")}
                style={tileStyleFor(profile)}
              >
                <div className="flex h-full flex-col rounded-[24px] border border-black/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.55),rgba(242,232,180,0.94))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                  <div className="mb-3 flex shrink-0 items-center justify-between">
                    <div className="text-[10px] font-black uppercase tracking-[0.28em] text-lime-700/80">
                      Profile Board
                    </div>
                    <div
                      className={[
                        "rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.18em]",
                        accentStyles[profile.aura],
                      ].join(" ")}
                    >
                      Live
                    </div>
                  </div>

                  <div className="shrink-0 rounded-[22px] border border-black/10 bg-[#d6e3c7]/70 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]">
                    <div className="flex min-h-[76px] items-start gap-3">
                      <div
                        className={[
                          "relative grid h-16 w-16 shrink-0 place-items-center rounded-full border bg-black/5 transition duration-300 group-hover:scale-105",
                          auraStyles[profile.aura],
                        ].join(" ")}
                      >
                        <div className="absolute inset-[-5px] rounded-full border border-white/35 opacity-60" />
                        {profile.image ? (
                          <img
                            src={profile.image}
                            alt={profile.name}
                            className="h-12 w-12 rounded-full border border-white/35 object-cover"
                          />
                        ) : (
                          <span className="text-xl font-black text-[#262117]">
                            {profile.name.slice(0, 1)}
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1 pt-0.5">
                        <h2 className="line-clamp-2 text-[15px] font-black leading-[1.08] text-[#201a10]">
                          {profile.name}
                        </h2>
                        <p className="mt-1 break-all text-xs leading-tight text-[#5b523a]">
                          {profile.handle}
                        </p>
                        <p className="mt-1 line-clamp-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-lime-700/70">
                          {profile.boardLabel}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 min-h-0 flex-1 overflow-hidden rounded-[18px] border border-black/10 bg-[#f6efca] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
                    <p className="line-clamp-4 break-words text-xs leading-5 text-[#4f4732]">
                      {profile.status}
                    </p>
                  </div>

                  <div className="mt-3 flex shrink-0 items-center justify-between rounded-[16px] border border-black/10 bg-black/5 px-3 py-2">
                    <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#5d563b]">
                      <Radio className="h-3 w-3" />
                      Open Board
                    </div>

                    <button
                      type="button"
                      className={[
                        "rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] transition hover:scale-[1.03]",
                        accentStyles[profile.aura],
                      ].join(" ")}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        waveToProfile(profile);
                      }}
                    >
                      {wavedTo.has(normalizeUserKey(profile.handle)) ? "Waved" : "Wave"}
                    </button>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {waveToast ? (
            <div className="relative z-10 mt-3 inline-flex rounded-full border border-lime-300/25 bg-black/45 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-lime-100">
              {waveToast}
            </div>
          ) : null}
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="min-w-0">
            <StoreDropMarketplace />
          </div>

          <aside className="xl:sticky xl:top-6 xl:self-start">
            <div className="overflow-hidden rounded-[30px] border border-white/10 bg-black/40 p-4 shadow-2xl backdrop-blur-xl">
              <div className="mb-4">
                <p className="text-[11px] uppercase tracking-[0.3em] text-lime-300/70">
                  Drop Pad OS
                </p>
                <h2 className="mt-1 text-xl font-black">Explore Command Device</h2>
                <p className="mt-2 text-sm text-white/45">
                  Keep Drop Pad docked beside the market while you explore
                  artifacts and signals.
                </p>
              </div>

              <div className="origin-top scale-[0.88]">
                <DropPadOS
                  osOn={osOn}
                  osApp={osApp}
                  onPower={() => setOsOn((value) => !value)}
                  onNavigate={setOsApp}
                  onHome={() => setOsApp("home")}
                  onOff={() => setOsOn(false)}
                  title="DROP PAD OS"
                  subtitle="Explore Command Device"
                  maxScreenPx={520}
                />
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
