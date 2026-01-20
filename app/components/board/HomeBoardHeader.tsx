// File: app/components/board/HomeBoardHeader.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const PROFILE_STORAGE_KEY = "jab_board_profile_v2";

type ProfilePayload = {
  displayName?: string;
  avatarDataUrl?: string | null;
};

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default function HomeBoardHeader() {
  const [profile, setProfile] = useState<ProfilePayload>({
    displayName: "Board User",
    avatarDataUrl: null,
  });

  useEffect(() => {
    const read = () => {
      const raw =
        typeof window !== "undefined"
          ? localStorage.getItem(PROFILE_STORAGE_KEY)
          : null;
      const parsed = safeParse<ProfilePayload>(raw, {});
      setProfile({
        displayName: parsed.displayName ?? "Board User",
        avatarDataUrl: parsed.avatarDataUrl ?? null,
      });
    };

    read();
    const onStorage = () => read();
    window.addEventListener("storage", onStorage);

    const t = window.setInterval(read, 1200);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.clearInterval(t);
    };
  }, []);

  function openDropConsole() {
    try {
      window.dispatchEvent(new CustomEvent("board:dropconsole:open"));
    } catch {}
  }

  return (
    <div className="hbHeader">
      <div className="hbGlow" aria-hidden />
      <div className="hbInner">
        {/* Left */}
        <div className="left">
          <div className="cornerLabel">JAB VISIONS™ BOARD</div>
          <div className="titleRow">
            <div className="title">Home</div>
          </div>
          <div className="sub">
            Your community feed, live drops, and threaded conversations.
          </div>
        </div>

        {/* Center Avatar (CLICKABLE) */}
        <div className="center">
          <Link className="avatarWrap" href="/board/profile" aria-label="Open your profile board">
            {profile.avatarDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="avatar" src={profile.avatarDataUrl} alt="Profile avatar" />
            ) : (
              <div className="avatarFallback" aria-hidden />
            )}
          </Link>
        </div>

        {/* Right */}
        <div className="right">
          <div className="meText">
            <div className="name">{profile.displayName ?? "Board User"}</div>

            {/* Work Calls button UNDER name */}
            <Link className={clsx("pill", "workcalls")} href="/board/work?open=workcalls">
              Work Calls
            </Link>

            <div className="links">
              <button type="button" className={clsx("pill", "strong")} onClick={openDropConsole}>
                Open Drop Console
              </button>

              <Link className="pill" href="/board/profile">
                Profile
              </Link>
              <Link className="pill" href="/board/forums">
                Forums
              </Link>
              <Link className="pill" href="/board/explore">
                Explore
              </Link>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .hbHeader {
          position: relative;
          width: 100%;
          border-radius: 28px;
          background: rgba(255, 255, 255, 0.92);
          border: 1px solid rgba(0, 0, 0, 0.08);
          box-shadow: 0 18px 60px rgba(0, 0, 0, 0.14);
          overflow: hidden;
        }

        /* LIME / FLUO YELLOW glow layer (navbar vibe) */
        .hbGlow {
          pointer-events: none;
          position: absolute;
          inset: -30px;
          background: radial-gradient(
              circle at 18% 35%,
              rgba(210, 255, 0, 0.46),
              rgba(255, 255, 255, 0) 58%
            ),
            radial-gradient(
              circle at 58% 45%,
              rgba(140, 255, 0, 0.22),
              rgba(255, 255, 255, 0) 62%
            );
          filter: blur(12px);
          opacity: 1;
        }

        .hbInner {
          position: relative;
          display: grid;
          /* HARD FIX: lock center column width so avatar can’t “grow” */
          grid-template-columns: 1fr 96px 1fr;
          align-items: center;
          gap: 16px;
          padding: 16px 18px;
          min-height: 110px;
        }

        .cornerLabel {
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(0, 160, 80, 1);
        }

        .titleRow {
          margin-top: 6px;
          display: flex;
          align-items: baseline;
          gap: 10px;
        }

        .title {
          font-size: 26px;
          font-weight: 950;
          color: rgba(0, 160, 80, 1);
          line-height: 1.05;
        }

        .sub {
          margin-top: 6px;
          font-size: 13px;
          color: rgba(255, 0, 190, 0.78);
          font-weight: 800;
          max-width: 520px;
        }

        .center {
          display: grid;
          place-items: center;
        }

        /* HARD FIX: avatar cannot expand */
        .avatarWrap {
          width: 72px;
          aspect-ratio: 1 / 1;
          flex: 0 0 auto;
          border-radius: 999px;
          padding: 5px;
          display: grid;
          place-items: center;
          text-decoration: none;

          background: radial-gradient(circle, rgba(210, 255, 0, 0.42), rgba(255, 255, 255, 0));
          box-shadow: 0 0 0 2px rgba(180, 255, 0, 0.35), 0 0 30px rgba(180, 255, 0, 0.18);
        }

        .avatar {
          width: 100%;
          height: 100%;
          border-radius: 999px;
          object-fit: cover;
          display: block;
          background: rgba(255, 255, 255, 0.9);
        }

        .avatarFallback {
          width: 100%;
          height: 100%;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.08);
        }

        .right {
          display: flex;
          justify-content: flex-end;
        }

        .meText {
          min-width: 0;
          display: grid;
          gap: 8px;
          justify-items: end;
        }

        .name {
          font-size: 14px;
          font-weight: 950;
          color: rgba(0, 0, 0, 0.7);
          text-align: right;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 240px;
        }

        .links {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          flex-wrap: wrap;
        }

        .pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 9px 12px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(255, 255, 255, 0.78);
          color: rgba(0, 0, 0, 0.6);
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          text-decoration: none;
          cursor: pointer;
          white-space: nowrap;
        }

        .pill.strong {
          background: rgba(0, 0, 0, 0.86);
          border-color: rgba(180, 255, 0, 0.25);
          color: rgba(255, 255, 255, 0.92);
          box-shadow: 0 0 18px rgba(180, 255, 0, 0.14);
        }

        .pill.workcalls {
          background: rgba(0, 0, 0, 0.86);
          border-color: rgba(180, 255, 0, 0.22);
          color: rgba(255, 255, 255, 0.92);
          padding: 9px 14px;
        }

        @media (max-width: 860px) {
          .hbInner {
            grid-template-columns: 1fr;
            justify-items: start;
            min-height: unset;
          }

          .center {
            order: -1;
            justify-self: center;
          }

          .right {
            justify-content: flex-start;
          }

          .meText {
            justify-items: start;
          }

          .name {
            text-align: left;
          }

          .links {
            justify-content: flex-start;
          }
        }
      `}</style>
    </div>
  );
}
