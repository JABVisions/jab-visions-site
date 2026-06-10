"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CSSProperties, useEffect, useMemo, useState } from "react";
import BoardLogoutButton from "@/app/components/board/BoardLogoutButton";
import GlitchReportButton from "@/app/components/board/GlitchReportButton";
import {
  AURA_HEX,
  DEFAULT_BOARD_OPTIONS_SETTINGS,
  loadBoardOptionsSettings,
  type BoardOptionsSettings,
} from "@/lib/board/optionsSettings";
import { supabaseBrowser } from "@/lib/supabase/browser";

const PROFILE_STORAGE_KEY = "jab_board_profile_v2";

type ProfilePayload = {
  displayName?: string;
  username?: string | null;
  avatarDataUrl?: string | null;
  avatarUrl?: string | null;
  avatarPath?: string | null;
  avatar_path?: string | null;
  glowColor?: string;
  auraColor?: keyof typeof AURA_HEX;
};

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function scopedStorageKey(base: string, userId: string | null) {
  return userId ? `${base}:${userId}` : null;
}

function pageLabelFor(pathname: string) {
  if (pathname.startsWith("/board/feed")) return "Feed";
  if (pathname.startsWith("/board/profile")) return "Profile";
  if (pathname.startsWith("/board/forums")) return "Forums";
  if (pathname.startsWith("/board/work")) return "Work";
  if (pathname.startsWith("/board/explore")) return "Explore";
  if (pathname.startsWith("/board/options")) return "Options";
  if (pathname.startsWith("/board/friend-zone")) return "Friend Zone";
  return "Board";
}

function rgbaFromHex(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((char) => char + char).join("") : value;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function BoardUtilityHeader() {
  const pathname = usePathname();
  const [profile, setProfile] = useState<ProfilePayload>({
    displayName: "Board User",
    avatarDataUrl: null,
  });
  const [options, setOptions] = useState<BoardOptionsSettings>(DEFAULT_BOARD_OPTIONS_SETTINGS);
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    const read = () => {
      const legacyRaw =
        typeof window !== "undefined" ? localStorage.getItem(PROFILE_STORAGE_KEY) : null;
      const scopedKey = scopedStorageKey(PROFILE_STORAGE_KEY, userId);
      const scopedRaw =
        typeof window !== "undefined" && scopedKey ? localStorage.getItem(scopedKey) : null;
      const legacyProfile = safeParse<ProfilePayload>(legacyRaw, {});
      const scopedProfile = safeParse<ProfilePayload>(scopedRaw, {});
      const parsedProfile = {
        ...legacyProfile,
        ...scopedProfile,
      };
      const parsedOptions = loadBoardOptionsSettings();
      const lastUsername =
        typeof window !== "undefined"
          ? window.localStorage.getItem("jab_board_last_username")?.trim().replace(/^@+/, "").toLowerCase()
          : "";
      const resolvedDisplayName =
        parsedOptions.displayName?.trim() ||
        parsedProfile.displayName?.trim() ||
        (lastUsername === "johnandy" ? "John Andy" : "") ||
        "Board User";
      const parsedOptionsUsername = (parsedOptions as unknown as { username?: string }).username;
      const displayNameRouteKey = resolvedDisplayName.toLowerCase().replace(/[^a-z0-9]/g, "");
      const resolvedUsername =
        displayNameRouteKey === "johnandy"
          ? "johnandy"
          : typeof parsedOptionsUsername === "string" && parsedOptionsUsername.trim()
          ? parsedOptionsUsername.trim().replace(/^@+/, "").toLowerCase()
          : typeof parsedProfile.username === "string" && parsedProfile.username.trim()
            ? parsedProfile.username.trim().replace(/^@+/, "").toLowerCase()
            : lastUsername || "";

      setProfile((current) => ({
        displayName: resolvedDisplayName,
        username: resolvedUsername || current.username || null,
        avatarDataUrl:
          parsedProfile.avatarDataUrl ??
          parsedProfile.avatarUrl ??
          current.avatarDataUrl ??
          null,
        avatarUrl: parsedProfile.avatarUrl ?? current.avatarUrl ?? null,
        avatarPath:
          parsedProfile.avatarPath ??
          parsedProfile.avatar_path ??
          current.avatarPath ??
          null,
        glowColor: parsedProfile.glowColor ?? current.glowColor,
      }));
      if (resolvedUsername) setUsername(resolvedUsername);
      setOptions(parsedOptions);
    };

    read();
    const onStorage = () => read();
    window.addEventListener("storage", onStorage);

    const t = window.setInterval(read, 1200);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.clearInterval(t);
    };
  }, [userId]);

  useEffect(() => {
    let alive = true;

    async function readRemoteProfile(nextUserId: string) {
      try {
        const supabase = supabaseBrowser();
        const { data: remoteProfile } = await supabase
          .from("profiles")
          .select("username, display_name, avatar_url, avatar_path, board_style")
          .eq("id", nextUserId)
          .maybeSingle();

        if (!alive || !remoteProfile) return;

        const boardStyle =
          remoteProfile.board_style && typeof remoteProfile.board_style === "object"
            ? (remoteProfile.board_style as ProfilePayload)
            : {};
        const remoteAuraHex =
          boardStyle.auraColor && AURA_HEX[boardStyle.auraColor]
            ? AURA_HEX[boardStyle.auraColor]
            : "";
        let signedAvatar = "";
        const avatarPath =
          typeof remoteProfile.avatar_path === "string" && remoteProfile.avatar_path.trim()
            ? remoteProfile.avatar_path.trim()
            : typeof boardStyle.avatarPath === "string" && boardStyle.avatarPath.trim()
              ? boardStyle.avatarPath.trim()
              : typeof boardStyle.avatar_path === "string" && boardStyle.avatar_path.trim()
                ? boardStyle.avatar_path.trim()
              : "";

        if (avatarPath) {
          const { data: signed } = await supabase.storage
            .from("board-avatars")
            .createSignedUrl(avatarPath, 60 * 45);
          signedAvatar = signed?.signedUrl ?? "";
        }

        if (!alive) return;

        setProfile((current) => ({
          displayName:
            (typeof remoteProfile.display_name === "string" && remoteProfile.display_name.trim()) ||
            boardStyle.displayName?.trim() ||
            current.displayName ||
            "Board User",
          username:
            (typeof remoteProfile.username === "string" && remoteProfile.username.trim()
              ? remoteProfile.username.trim().replace(/^@+/, "").toLowerCase()
              : "") ||
            current.username ||
            null,
          avatarDataUrl:
            signedAvatar ||
            (typeof boardStyle.avatarDataUrl === "string" && boardStyle.avatarDataUrl.trim()) ||
            (typeof remoteProfile.avatar_url === "string" && remoteProfile.avatar_url.trim()) ||
            current.avatarDataUrl ||
            null,
          avatarUrl:
            (typeof remoteProfile.avatar_url === "string" && remoteProfile.avatar_url.trim()) ||
            current.avatarUrl ||
            null,
          avatarPath: avatarPath || current.avatarPath || null,
          glowColor: remoteAuraHex || boardStyle.glowColor || current.glowColor,
        }));
        setUsername(
          (typeof remoteProfile.username === "string" && remoteProfile.username.trim()
            ? remoteProfile.username.trim().replace(/^@+/, "").toLowerCase()
            : "") || null
        );
      } catch {
        if (!alive) return;
        setIsAuthed(false);
      }
    }

    async function readAuth() {
      try {
        const supabase = supabaseBrowser();
        const { data: sessionData } = await supabase.auth.getSession();
        const sessionUser = sessionData.session?.user ?? null;
        if (!alive) return;
        if (sessionUser) {
          setIsAuthed(true);
          setUserId(sessionUser.id);
          await fetch("/api/board/profile/ensure", { method: "POST" }).catch(() => undefined);
          await readRemoteProfile(sessionUser.id);
          return;
        }

        const { data } = await supabase.auth.getUser();
        if (!alive) return;
        const user = data.user;
        setIsAuthed(!!user);
        setUserId(user?.id ?? null);
        if (user?.id) {
          await fetch("/api/board/profile/ensure", { method: "POST" }).catch(() => undefined);
          await readRemoteProfile(user.id);
        }
      } catch {
        if (!alive) return;
        setIsAuthed(false);
        setUserId(null);
        setUsername(null);
      }
    }

    void readAuth();

    const supabase = supabaseBrowser();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user?.id ?? null;
      setIsAuthed(!!nextUserId);
      setUserId(nextUserId);
      if (!nextUserId) setUsername(null);
      if (nextUserId) {
        void fetch("/api/board/profile/ensure", { method: "POST" })
          .catch(() => undefined)
          .finally(() => readRemoteProfile(nextUserId));
      }
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isAuthed) return;
    void fetch("/api/board/profile/ensure", { method: "POST" }).catch(() => undefined);
  }, [isAuthed]);

  const pageLabel = pageLabelFor(pathname);
  const onFeed = pathname.startsWith("/board/feed");
  const profileHref = username ? `/board/profile/${username}` : "/board/profile";
  const loginHref = `/board/login?next=${encodeURIComponent(pathname || "/board/profile")}`;
  const avatarSrc = profile.avatarDataUrl?.trim() || profile.avatarUrl?.trim() || "";
  const showAvatarImage = Boolean(avatarSrc);

  const auraHex = useMemo(() => {
    return AURA_HEX[options.auraColor] || profile.glowColor || AURA_HEX.sloth_pink;
  }, [options.auraColor, profile.glowColor]);

  const auraStrength = Math.max(0, Math.min(100, options.auraIntensity ?? 70));
  const auraGlow = 0.18 + auraStrength / 190;
  const auraGlowWide = 0.1 + auraStrength / 260;
  const auraMain = rgbaFromHex(auraHex, 0.18 + auraStrength / 260);
  const auraSoft = rgbaFromHex(auraHex, 0.1 + auraStrength / 360);
  const auraBorder = rgbaFromHex(auraHex, 0.3 + auraStrength / 420);
  const pinkActionStyle = useMemo(
    () => ({
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "8px",
      padding: "10px 14px",
      borderRadius: "999px",
      fontSize: "11px",
      fontWeight: 950,
      letterSpacing: "0.16em",
      textTransform: "uppercase" as const,
      textDecoration: "none",
      whiteSpace: "nowrap" as const,
      background: "#ff4fd8",
      border: "1px solid rgba(212, 17, 154, 0.95)",
      color: "rgba(255,255,255,0.98)",
      boxShadow:
        "0 0 0 1px rgba(212, 17, 154, 0.24), 0 10px 22px rgba(255, 79, 216, 0.24), 0 0 22px rgba(255, 79, 216, 0.18)",
    }),
    []
  );
  const avatarFaceStyle = useMemo<CSSProperties | undefined>(() => {
    if (!showAvatarImage) return undefined;
    return {
      backgroundImage: `url("${avatarSrc.replace(/"/g, '\\"')}")`,
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      backgroundSize: "cover",
    };
  }, [avatarSrc, showAvatarImage]);

  return (
    <div
      className="buWrap"
      style={
        {
          "--bu-aura": auraHex,
          "--bu-aura-main": auraMain,
          "--bu-aura-soft": auraSoft,
          "--bu-aura-border": auraBorder,
        } as CSSProperties
      }
    >
      <header className="buHeader">
        <div className="buFx" aria-hidden />

        <div className="buSide buLeft">
          <p className="buEyebrow">JAB VISIONS™ BOARD</p>
          <h1 className="buTitle">{pageLabel}</h1>
          <p className="buSub">Quick account controls across your Board pages.</p>
        </div>

        <div className="buCenter">
          <Link href={profileHref} aria-label="Open your profile board" className="avatarCore">
            <div
              className="avatarRing"
              style={{
                boxShadow: `
                  0 0 18px ${rgbaFromHex(auraHex, auraGlow)},
                  0 0 42px ${rgbaFromHex(auraHex, auraGlowWide)},
                  0 0 0 2px rgba(255,255,255,0.42)
                `,
              }}
            >
              <div className="avatarInner">
                {showAvatarImage ? (
                  <div
                    className="avatarFace"
                    aria-label="Board profile avatar"
                    style={avatarFaceStyle}
                  />
                ) : (
                  <div className="avatarFallback" aria-hidden>
                    ♛
                  </div>
                )}
              </div>
            </div>
          </Link>
        </div>

        <div className="buSide buRight">
          <p className="buName">{profile.displayName?.trim() || "Board User"}</p>
          <div className="buLinks">
            {!onFeed ? (
              <Link href="/board/feed" className="buAction" style={pinkActionStyle}>
                Feed
              </Link>
            ) : null}
            {isAuthed ? (
              <BoardLogoutButton
                compact
                className="buAction logoutAction"
                style={pinkActionStyle}
              />
            ) : (
              <Link href={loginHref} className="buAction" style={pinkActionStyle}>
                Log in
              </Link>
            )}
            <GlitchReportButton compact />
          </div>
        </div>
      </header>

      <style>{`
        .buWrap {
          position: relative;
          z-index: 30;
          width: min(1250px, 78vw);
          max-width: calc(100% - 32px);
          margin: 0 auto;
          padding-top: 18px;
          pointer-events: auto;
        }

        .buHeader {
          position: relative;
          z-index: 2;
          min-height: 112px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
          align-items: center;
          gap: 24px;
          overflow: hidden;
          border-radius: 28px;
          border: 1px solid rgba(255, 255, 255, 0.88);
          background: linear-gradient(
            90deg,
            rgba(240, 249, 198, 0.99),
            rgba(248, 251, 224, 0.985) 44%,
            rgba(255, 255, 255, 0.965)
          );
          padding: 22px 30px;
          box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.32),
            0 0 52px rgba(204, 255, 64, 0.2),
            0 18px 50px rgba(0, 0, 0, 0.14);
          isolation: isolate;
          pointer-events: auto;
        }

        .buFx {
          pointer-events: none;
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at center, rgba(255, 255, 255, 0.54), transparent 36%),
            linear-gradient(120deg, rgba(255, 255, 255, 0.16), transparent 62%),
            radial-gradient(circle at 20% 30%, rgba(210, 255, 0, 0.16), transparent 28%);
          opacity: 0.62;
        }

        .buSide {
          position: relative;
          z-index: 2;
          flex: 1 1 0;
          min-width: 0;
        }

        .buLeft {
          padding-right: 52px;
        }

        .buRight {
          padding-left: 52px;
          text-align: right;
        }

        .buEyebrow {
          margin: 0;
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(31, 145, 86, 0.98);
          text-shadow: 0 1px 0 rgba(255, 255, 255, 0.72);
        }

        .buTitle {
          margin: 6px 0 0;
          font-size: clamp(2rem, 2vw + 1rem, 3rem);
          line-height: 1.02;
          font-weight: 950;
          letter-spacing: -0.03em;
          color: rgba(43, 146, 74, 0.98);
          text-shadow: 0 1px 0 rgba(255, 255, 255, 0.7);
        }

        .buSub {
          margin: 6px 0 0;
          font-size: 13px;
          font-weight: 800;
          color: rgba(255, 0, 190, 0.92);
          text-shadow: 0 1px 0 rgba(255, 255, 255, 0.45);
        }

        .buCenter {
          z-index: 3;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 84px;
        }

        .avatarCore {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 72px;
          width: 72px;
          height: 72px;
          text-decoration: none;
          transition: transform 180ms ease, filter 180ms ease;
        }

        .avatarCore:hover {
          transform: scale(1.03);
          filter: brightness(1.03);
        }

        .avatarRing {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 72px;
          height: 72px;
          min-width: 72px;
          min-height: 72px;
          border-radius: 50%;
          padding: 4px;
          box-sizing: border-box;
          background: rgba(20, 20, 20, 0.88);
          overflow: hidden;
        }

        .avatarInner {
          position: relative;
          width: 100%;
          height: 100%;
          min-width: 0;
          min-height: 0;
          border-radius: 50%;
          overflow: hidden;
          background: rgba(20, 20, 20, 0.94);
        }

        .avatarHalo {
          display: none;
        }

        .avatarFace {
          position: absolute;
          inset: 0;
          border-radius: 50%;
        }

        .avatarFallback {
          display: flex;
          height: 100%;
          width: 100%;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.8);
          color: rgba(214, 255, 173, 0.95);
          font-size: 38px;
          font-weight: 950;
        }

        .buName {
          margin: 0;
          font-size: 16px;
          font-weight: 950;
          color: rgba(20, 20, 20, 0.98);
          text-shadow: 0 1px 0 rgba(255, 255, 255, 0.7);
        }

        .buLinks {
          margin-top: 10px;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          flex-wrap: wrap;
        }

        .buAction {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 10px 14px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          text-decoration: none;
          border: 1px solid transparent;
          white-space: nowrap;
        }

        .buAction:hover {
          filter: brightness(1.05);
          box-shadow:
            0 0 0 1px rgba(212, 17, 154, 0.28),
            0 12px 24px rgba(255, 79, 216, 0.28),
            0 0 24px rgba(255, 79, 216, 0.22);
        }

        .logoutAction svg {
          color: rgba(255, 255, 255, 0.92);
        }

        @media (max-width: 980px) {
          .buWrap {
            width: calc(100% - 20px);
            max-width: none;
          }

          .buHeader {
            min-height: unset;
            padding: 22px 20px 20px;
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            align-items: start;
            gap: 16px;
          }

          .buLeft {
            grid-column: 1;
            grid-row: 1;
            padding: 0 12px 0 0;
            text-align: left;
          }

          .buRight {
            grid-column: 1 / -1;
            grid-row: 2;
            padding: 0;
            text-align: left;
          }

          .buCenter {
            position: relative;
            display: flex;
            justify-content: flex-end;
            grid-column: 2;
            grid-row: 1;
            align-self: start;
            min-width: 72px;
          }

          .avatarCore {
            flex-basis: 64px;
            width: 64px;
            height: 64px;
          }

          .avatarRing {
            width: 64px;
            height: 64px;
            min-width: 64px;
            min-height: 64px;
          }

          .avatarFallback {
            font-size: 24px;
          }

          .buLinks {
            justify-content: flex-start;
          }
        }
      `}</style>
    </div>
  );
}
