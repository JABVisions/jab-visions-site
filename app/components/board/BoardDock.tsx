// app/components/board/BoardDock.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Newspaper,
  MessageSquareText,
  LayoutGrid,
  Sparkles,
  Users,
  X,
  Send,
  Search,
  ChevronUp,
  BriefcaseBusiness,
} from "lucide-react";

type Friend = {
  id: string;
  name: string;
  avatar?: string | null;
  addedAt: number;
};

type ChatMsg = {
  id: string;
  threadId: string;
  from: "me" | "them";
  text: string;
  at: number;
};

const FRIENDS_KEY = "jab_board_friends_v1";
const FRIENDS_EVENT = "jab:friends_updated";
const CHAT_KEY = "jab_board_chat_v1";

function safeId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/**
 * ✅ Active rules:
 * - Hub: /board exact
 * - Feed: /board/feed exact
 * - Nested active for others
 */
function isActive(pathname: string, href: string) {
  if (href === "/board") return pathname === "/board";
  if (href === "/board/feed") return pathname === "/board/feed";
  return pathname === href || pathname.startsWith(href + "/");
}

function readFriends(): Friend[] {
  try {
    const raw = localStorage.getItem(FRIENDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((f: any) => ({
        id: String(f.id ?? ""),
        name: String(f.name ?? "Unknown"),
        avatar: typeof f.avatar === "string" ? f.avatar : null,
        addedAt: Number(f.addedAt ?? Date.now()),
      }))
      .filter((f) => f.id && f.name)
      .sort((a, b) => b.addedAt - a.addedAt);
  } catch {
    return [];
  }
}

function readChat(): ChatMsg[] {
  try {
    const raw = localStorage.getItem(CHAT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((m: any) => ({
        id: String(m.id ?? ""),
        threadId: String(m.threadId ?? ""),
        from: m.from === "them" ? "them" : "me",
        text: String(m.text ?? ""),
        at: Number(m.at ?? Date.now()),
      }))
      .filter((m) => m.id && m.threadId && m.text)
      .sort((a, b) => a.at - b.at);
  } catch {
    return [];
  }
}

function writeChat(next: ChatMsg[]) {
  localStorage.setItem(CHAT_KEY, JSON.stringify(next));
}

function threadIdForFriend(friendId: string) {
  return `friend:${friendId}`;
}

/** ✅ White magnifying glass icon (SVG) */
function ExploreIcon({
  size = 18,
  strokeWidth = 2.4,
  className = "",
}: {
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
        stroke="white"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16.2 16.2 21 21"
        stroke="white"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function BoardDock() {
  const pathname = usePathname();

  const [friends, setFriends] = useState<Friend[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [activeFriendId, setActiveFriendId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [allMsgs, setAllMsgs] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState("");

  const drawerRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFriends(readFriends());
    setAllMsgs(readChat());
  }, []);

  useEffect(() => {
    const refresh = () => setFriends(readFriends());

    const onCustom = () => refresh();
    const onStorage = (e: StorageEvent) => {
      if (e.key === FRIENDS_KEY) refresh();
      if (e.key === CHAT_KEY) setAllMsgs(readChat());
    };

    window.addEventListener(FRIENDS_EVENT, onCustom as EventListener);
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener(FRIENDS_EVENT, onCustom as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // Click outside to close
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!drawerOpen) return;
      if (!drawerRef.current) return;
      if (!drawerRef.current.contains(e.target as Node)) setDrawerOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [drawerOpen]);

  // When opening, ensure a valid active friend
  useEffect(() => {
    if (!drawerOpen) return;
    if (activeFriendId && friends.some((f) => f.id === activeFriendId)) return;
    setActiveFriendId(friends[0]?.id ?? null);
  }, [drawerOpen, friends, activeFriendId]);

  // Scroll chat to bottom when thread changes
  useEffect(() => {
    if (!drawerOpen) return;
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [drawerOpen, activeFriendId, allMsgs]);

  // ✅ Spacer: extend the page while the bottom drawer is open (your original behavior)
  useEffect(() => {
    const DOCK_H = 110; // dock + safe area
    const DRAWER_H = 360; // friend zone sheet height
    if (drawerOpen) {
      document.body.style.paddingBottom = `${DOCK_H + DRAWER_H}px`;
    } else {
      document.body.style.paddingBottom = "";
    }
    return () => {
      document.body.style.paddingBottom = "";
    };
  }, [drawerOpen]);

  const friendCount = friends.length;

  const filteredFriends = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter((f) => f.name.toLowerCase().includes(q));
  }, [friends, query]);

  const activeFriend = useMemo(() => {
    if (!activeFriendId) return null;
    return friends.find((f) => f.id === activeFriendId) ?? null;
  }, [friends, activeFriendId]);

  const activeThreadId = activeFriend ? threadIdForFriend(activeFriend.id) : null;

  const threadMsgs = useMemo(() => {
    if (!activeThreadId) return [];
    return allMsgs.filter((m) => m.threadId === activeThreadId);
  }, [allMsgs, activeThreadId]);

  function sendMsg() {
    if (!activeThreadId) return;
    const text = draft.trim();
    if (!text) return;

    const msg: ChatMsg = {
      id: safeId(),
      threadId: activeThreadId,
      from: "me",
      text,
      at: Date.now(),
    };

    const next = [...allMsgs, msg];
    setAllMsgs(next);
    writeChat(next);
    setDraft("");

    window.setTimeout(() => {
      const reply: ChatMsg = {
        id: safeId(),
        threadId: activeThreadId,
        from: "them",
        text: "👀 seen. keep cooking.",
        at: Date.now(),
      };
      const after = [...next, reply];
      setAllMsgs(after);
      writeChat(after);
    }, 650);
  }

  return (
    <>
      <div className="bd_wrap" aria-hidden={false}>
        <div className="bd_shell">
          {/* Brand routes to Hub */}
          <Link
            href="/board"
            className="bd_brand"
            aria-label="JAB Visions™ Board Hub"
            title="Board Hub"
          >
            <span className="bd_brandWord">JAB Visions™</span>
            <span className="bd_brandWord pink">Board</span>
          </Link>

          <nav className="bd_nav" aria-label="Board Dock">
            <DockPill
              href="/board/feed"
              label="Feed"
              active={isActive(pathname, "/board/feed")}
              Icon={Newspaper}
              iconColor="rgba(255,0,190,0.95)"
            />

            <DockPill
              href="/board/forums"
              label="Forums"
              active={isActive(pathname, "/board/forums")}
              Icon={MessageSquareText}
              iconColor="rgba(139,92,255,0.95)"
            />

            <DockPill
              href="/board/work"
              label="Work"
              active={isActive(pathname, "/board/work")}
              Icon={BriefcaseBusiness}
              iconColor="rgba(255,214,74,1)"
            />

            <DockPill
              href="/board/profile"
              label="Profile"
              active={isActive(pathname, "/board/profile")}
              Icon={LayoutGrid}
              iconColor="rgba(0,160,80,1)"
            />

            {/* ✅ Keep your dock look; just correct routing + active check */}
            <DockPill
              href="/board/options"
              label="Options"
              active={isActive(pathname, "/board/profile/options")}
              Icon={Sparkles}
              iconColor="rgba(37,246,255,0.95)"
            />
          </nav>

          <DockPill
            href="/board/explore"
            label="Explore"
            active={isActive(pathname, "/board/explore")}
            Icon={ExploreIcon as any}
            iconColor="white"
            variant="explore"
          />

          <button
            type="button"
            className={`bd_zoneBtn ${drawerOpen ? "open" : ""}`}
            onClick={() => setDrawerOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
          >
            <Users size={18} strokeWidth={2.4} className="bd_zoneIcon" aria-hidden />
            <span className="bd_zoneLabel">Friend Zone</span>
            <span className="bd_zoneCount" aria-label={`${friendCount} friends`}>
              {friendCount}
            </span>
            <ChevronUp size={16} strokeWidth={2.6} className="bd_zoneChev" aria-hidden />
          </button>
        </div>
      </div>

      {/* ✅ Friend Zone overlay lives here (dock unchanged) */}
      {drawerOpen && (
        <div className="fz_overlay">
          <div
            className="fz_sheet"
            ref={drawerRef}
            role="dialog"
            aria-label="Friend Zone Messages"
          >
            <div className="fz_top">
              <div className="fz_title">
                <span className="fz_titleWord green">Friend</span>{" "}
                <span className="fz_titleWord pink">Zone</span>
                <span className="fz_badge">{friendCount}</span>
              </div>

              <div className="fz_actions">
                <Link
                  href="/board/friends"
                  className="fz_link"
                  onClick={() => setDrawerOpen(false)}
                >
                  Manage Friends →
                </Link>
                <button
                  type="button"
                  className="fz_close"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close"
                >
                  <X size={18} strokeWidth={2.6} />
                </button>
              </div>
            </div>

            <div className="fz_controls">
              <div className="fz_search">
                <Search size={16} strokeWidth={2.4} className="fz_searchIcon" aria-hidden />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="fz_searchInput"
                  placeholder="Search friends…"
                />
              </div>
              <div className="fz_hintMini">Tap an orb to open a thread.</div>
            </div>

            {/* Orbs row */}
            {friends.length === 0 ? (
              <div className="fz_emptyRow">
                <div className="fz_empty">
                  <div className="fz_emptyTitle">No friends yet.</div>
                  <div className="fz_emptySub">Add demo friends on the Friends page.</div>
                  <Link
                    href="/board/friends"
                    className="fz_cta"
                    onClick={() => setDrawerOpen(false)}
                  >
                    Go to Friends
                  </Link>
                </div>
              </div>
            ) : (
              <div className="fz_orbRow" aria-label="Friends">
                {filteredFriends.map((f, index) => {
                  const selected = f.id === activeFriendId;
                  const delay = `${(index % 9) * 0.12}s`;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      className={`fz_orbCell ${selected ? "on" : ""}`}
                      onClick={() => setActiveFriendId(f.id)}
                      title={`Message ${f.name}`}
                    >
                      <div className="fz_orb" style={{ animationDelay: delay }} aria-hidden>
                        <div className="fz_orbInner" aria-hidden>
                          {f.avatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={f.avatar} alt="" className="fz_orbImg" />
                          ) : (
                            <span className="fz_orbEmoji">🙂</span>
                          )}
                        </div>
                      </div>
                      <div className="fz_orbName">{f.name}</div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* DM area */}
            <div className="fz_dm">
              {!activeFriend ? (
                <div className="fz_chatEmpty">
                  <div className="fz_chatEmptyTitle">Pick a friend.</div>
                  <div className="fz_chatEmptySub">
                    Your messages live here like a little backstage hallway.
                  </div>
                </div>
              ) : (
                <>
                  <div className="fz_chatHead">
                    <div className="fz_chatPerson">
                      <div className="fz_avatar big" aria-hidden>
                        🙂
                      </div>
                      <div>
                        <div className="fz_chatName">{activeFriend.name}</div>
                        <div className="fz_chatSub">Direct messages (demo)</div>
                      </div>
                    </div>
                  </div>

                  <div className="fz_chat">
                    {threadMsgs.length === 0 ? (
                      <div className="fz_hint">
                        Say something first. This is where the community starts.
                      </div>
                    ) : (
                      threadMsgs.map((m) => (
                        <div
                          key={m.id}
                          className={`fz_bubbleRow ${m.from === "me" ? "me" : "them"}`}
                        >
                          <div className={`fz_bubble ${m.from === "me" ? "me" : "them"}`}>
                            {m.text}
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  <div className="fz_inputRow">
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      className="fz_input"
                      placeholder={`Message ${activeFriend.name}…`}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") sendMsg();
                      }}
                    />
                    <button
                      type="button"
                      className="fz_send"
                      onClick={sendMsg}
                      aria-label="Send"
                    >
                      <Send size={18} strokeWidth={2.6} />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        /* ----------------------------- Dock styles (unchanged) ----------------------------- */
        .bd_wrap { position: fixed; left: 0; right: 0; bottom: 0; z-index: 40; pointer-events: none; }
        .bd_shell {
          pointer-events: auto;
          width: min(1120px, calc(100% - 24px));
          margin: 0 auto;
          margin-bottom: calc(12px + env(safe-area-inset-bottom));
          padding: 10px 12px;
          border-radius: 999px;
          display: flex;
          align-items: center;
          gap: 10px;
          border: 1px solid rgba(0,0,0,0.12);
          background: rgba(255,242,166,0.92);
          backdrop-filter: blur(12px);
          box-shadow: 0 18px 55px rgba(0,0,0,0.14);
        }
        .bd_brand {
          display: inline-flex; align-items: baseline; gap: 6px;
          padding: 10px 14px; border-radius: 999px;
          background: rgba(255,255,255,0.55);
          border: 1px solid rgba(0,0,0,0.10);
          white-space: nowrap;
          text-decoration: none;
          transition: transform 160ms ease, filter 160ms ease, box-shadow 160ms ease;
        }
        .bd_brand:hover { transform: translateY(-1px); filter: brightness(1.02); }
        .bd_brandWord {
          font-weight: 950; letter-spacing: 0.10em; text-transform: uppercase;
          font-size: 12px; color: rgba(0,160,80,1);
          text-shadow: 0 0 12px rgba(0,255,150,0.16);
        }
        .bd_brandWord.pink {
          color: rgba(255,0,190,0.92);
          text-shadow: 0 0 12px rgba(255,0,190,0.14);
        }
        .bd_nav { display: flex; align-items: center; gap: 8px; flex: 1; flex-wrap: wrap; }

        .bd_zoneBtn {
          border: 1px solid rgba(0,0,0,0.12);
          background: rgba(255,255,255,0.60);
          border-radius: 999px;
          padding: 10px 12px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: transform 160ms ease, filter 160ms ease, box-shadow 160ms ease;
          white-space: nowrap;
        }
        .bd_zoneBtn:hover { transform: translateY(-1px); filter: brightness(1.02); }
        .bd_zoneBtn.open { box-shadow: 0 0 0 1px rgba(255,0,190,0.18), 0 0 24px rgba(255,0,190,0.10); }
        .bd_zoneIcon { color: rgba(255,214,74,1); filter: drop-shadow(0 0 10px rgba(255,214,74,0.18)); }
        .bd_zoneLabel { font-size: 12px; font-weight: 950; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(0,0,0,0.68); }
        .bd_zoneCount {
          font-size: 11px; font-weight: 950; letter-spacing: 0.08em;
          padding: 4px 8px; border-radius: 999px;
          background: rgba(255,214,74,0.28);
          border: 1px solid rgba(255,214,74,0.35);
          color: rgba(0,0,0,0.70);
          min-width: 28px; text-align: center;
        }
        .bd_zoneChev { color: rgba(0,0,0,0.55); transform: translateY(-1px); }

        @media (max-width: 760px) {
          .bd_shell {
            width: calc(100% - 16px);
            border-radius: 28px;
            flex-wrap: wrap;
            justify-content: center;
          }
          .bd_nav { justify-content: center; flex: 0 0 auto; }
        }

        /* --------------------------- Friend Zone: bottom sheet --------------------------- */
        .fz_overlay{
          position: fixed;
          inset: 0;
          z-index: 55;
          pointer-events: auto;
          background: radial-gradient(circle at 50% 100%, rgba(0,0,0,0.22), rgba(0,0,0,0.10) 40%, rgba(0,0,0,0.0) 70%);
        }

        @keyframes fz_in {
          from { transform: translateX(-50%) translateY(18px); opacity: 0; }
          to { transform: translateX(-50%) translateY(0px); opacity: 1; }
        }

        .fz_sheet{
          position: fixed;
          left: 50%;
          transform: translateX(-50%);
          bottom: calc(92px + env(safe-area-inset-bottom));
          width: min(1120px, calc(100% - 24px));
          border-radius: 26px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.34);
          backdrop-filter: blur(18px);
          box-shadow: 0 22px 75px rgba(0,0,0,0.42);
          padding: 14px 14px 12px;
          animation: fz_in 170ms ease-out both;
        }

        .fz_top{
          display:flex;
          align-items:center;
          justify-content: space-between;
          gap: 12px;
        }

        .fz_title{
          display:flex;
          align-items:center;
          gap: 6px;
          font-weight: 950;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-size: 12px;
          color: rgba(255,255,255,0.84);
        }
        .fz_titleWord.green{
          color: rgba(0,255,150,0.85);
          text-shadow: 0 0 14px rgba(0,255,150,0.18);
        }
        .fz_titleWord.pink{
          color: rgba(255,0,190,0.85);
          text-shadow: 0 0 14px rgba(255,0,190,0.14);
        }
        .fz_badge{
          margin-left: 6px;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.08em;
          padding: 3px 8px;
          border-radius: 999px;
          background: rgba(255,255,255,0.10);
          border: 1px solid rgba(255,255,255,0.12);
          color: rgba(255,255,255,0.76);
        }

        .fz_actions{ display:flex; align-items:center; gap: 10px; }
        .fz_link{
          text-decoration:none;
          font-size: 12px;
          font-weight: 800;
          color: rgba(255,255,255,0.72);
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.06);
          transition: filter 160ms ease, transform 160ms ease, background 160ms ease;
        }
        .fz_link:hover{ filter: brightness(1.08); transform: translateY(-1px); background: rgba(255,255,255,0.09); }

        .fz_close{
          width: 34px; height: 34px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.78);
          display:grid;
          place-items:center;
          cursor:pointer;
          transition: transform 160ms ease, filter 160ms ease, background 160ms ease;
        }
        .fz_close:hover{ transform: translateY(-1px); filter: brightness(1.06); background: rgba(255,255,255,0.09); }

        .fz_controls{
          margin-top: 10px;
          display:flex;
          align-items:center;
          justify-content: space-between;
          gap: 10px;
        }

        .fz_search{
          position: relative;
          flex: 1;
          max-width: 520px;
        }
        .fz_searchIcon{
          position:absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: rgba(255,255,255,0.50);
        }
        .fz_searchInput{
          width: 100%;
          padding: 10px 12px 10px 36px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.86);
          outline: none;
          font-size: 13px;
          transition: border-color 160ms ease, background 160ms ease;
        }
        .fz_searchInput::placeholder{ color: rgba(255,255,255,0.45); }
        .fz_searchInput:focus{
          border-color: rgba(0,255,150,0.22);
          background: rgba(255,255,255,0.08);
        }

        .fz_hintMini{
          font-size: 12px;
          color: rgba(255,255,255,0.52);
          white-space: nowrap;
        }

        /* ------------------------------ Orb row cells ------------------------------ */
        @keyframes fz_float {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
          100% { transform: translateY(0px); }
        }
        @keyframes fz_pulse {
          0% { box-shadow: 0 0 0 rgba(255,255,255,0.0); }
          50% { box-shadow: 0 0 18px rgba(255,255,255,0.14); }
          100% { box-shadow: 0 0 0 rgba(255,255,255,0.0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .fz_orb { animation: none !important; }
          .fz_orbInner { animation: none !important; }
        }

        .fz_orbRow{
          margin-top: 12px;
          display:flex;
          align-items:flex-start;
          gap: 12px;
          overflow-x: auto;
          padding: 6px 2px 8px;
        }

        .fz_orbCell{
          border: none;
          background: transparent;
          padding: 0;
          cursor: pointer;
          min-width: 84px;
          text-align: center;
        }

        .fz_orb{
          width: 58px;
          height: 58px;
          margin: 0 auto;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.18);
          background: rgba(255,255,255,0.06);
          display:grid;
          place-items:center;
          animation: fz_pulse 3.8s ease-in-out infinite;
          transition: transform 160ms ease, filter 160ms ease, background 160ms ease, border-color 160ms ease;
        }

        .fz_orbCell:hover .fz_orb{
          transform: translateY(-1px);
          filter: brightness(1.05);
          background: rgba(255,255,255,0.08);
          border-color: rgba(255,255,255,0.26);
        }

        .fz_orbCell.on .fz_orb{
          background: rgba(255,255,255,0.10);
          border-color: rgba(255,255,255,0.34);
          box-shadow: 0 0 0 1px rgba(0,255,150,0.10), 0 0 22px rgba(255,0,190,0.06);
        }

        .fz_orbInner{
          width: 46px;
          height: 46px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(0,0,0,0.25);
          display:grid;
          place-items:center;
          overflow:hidden;
          animation: fz_float 2.6s ease-in-out infinite;
        }

        .fz_orbImg{
          width: 100%;
          height: 100%;
          object-fit: cover;
          display:block;
        }

        .fz_orbEmoji{
          font-size: 16px;
          opacity: 0.90;
        }

        .fz_orbName{
          margin-top: 8px;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.02em;
          color: rgba(255,255,255,0.80);
          width: 84px;
          overflow:hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* ------------------------------ DM block ------------------------------ */
        .fz_dm{
          margin-top: 10px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.05);
          overflow:hidden;
        }

        .fz_chatEmpty{
          padding: 18px 14px;
          text-align:center;
        }
        .fz_chatEmptyTitle{
          font-size: 14px;
          font-weight: 950;
          color: rgba(255,255,255,0.84);
        }
        .fz_chatEmptySub{
          margin-top: 6px;
          font-size: 12px;
          color: rgba(255,255,255,0.55);
        }

        .fz_chatHead{
          padding: 10px 12px;
          border-bottom: 1px solid rgba(255,255,255,0.10);
        }
        .fz_chatPerson{
          display:flex;
          align-items:center;
          gap: 10px;
        }
        .fz_avatar{
          width: 30px;
          height: 30px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(0,0,0,0.20);
          display:grid;
          place-items:center;
          color: rgba(255,255,255,0.84);
        }
        .fz_avatar.big{ width: 36px; height: 36px; }
        .fz_chatName{
          font-size: 13px;
          font-weight: 950;
          color: rgba(255,255,255,0.88);
        }
        .fz_chatSub{
          font-size: 11px;
          color: rgba(255,255,255,0.55);
        }

        .fz_chat{
          height: 140px;
          overflow-y: auto;
          padding: 10px 12px;
        }
        .fz_hint{
          text-align:center;
          font-size: 12px;
          color: rgba(255,255,255,0.55);
          padding: 16px 8px;
        }

        .fz_bubbleRow{ display:flex; margin: 8px 0; }
        .fz_bubbleRow.me{ justify-content:flex-end; }
        .fz_bubbleRow.them{ justify-content:flex-start; }

        .fz_bubble{
          max-width: min(520px, 78%);
          padding: 10px 12px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.10);
          font-size: 13px;
          line-height: 1.3;
        }
        .fz_bubble.me{
          background: rgba(255,255,255,0.10);
          color: rgba(255,255,255,0.92);
        }
        .fz_bubble.them{
          background: rgba(0,0,0,0.22);
          color: rgba(255,255,255,0.86);
        }

        .fz_inputRow{
          padding: 10px 12px;
          border-top: 1px solid rgba(255,255,255,0.10);
          display:flex;
          align-items:center;
          gap: 10px;
        }
        .fz_input{
          flex: 1;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.18);
          padding: 10px 12px;
          color: rgba(255,255,255,0.90);
          outline:none;
          font-size: 13px;
        }
        .fz_input::placeholder{ color: rgba(255,255,255,0.45); }
        .fz_input:focus{ border-color: rgba(255,255,255,0.18); background: rgba(0,0,0,0.22); }

        .fz_send{
          width: 40px;
          height: 40px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.88);
          display:grid;
          place-items:center;
          cursor:pointer;
          transition: transform 160ms ease, filter 160ms ease, background 160ms ease;
        }
        .fz_send:hover{ transform: translateY(-1px); filter: brightness(1.06); background: rgba(255,255,255,0.10); }

        /* empty row wrapper */
        .fz_emptyRow{ margin-top: 12px; }
        .fz_empty{
          border-radius: 18px;
          border: 1px dashed rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.04);
          padding: 14px;
          text-align:center;
        }
        .fz_emptyTitle{ font-size: 14px; font-weight: 950; color: rgba(255,255,255,0.84); }
        .fz_emptySub{ margin-top: 6px; font-size: 12px; color: rgba(255,255,255,0.55); }
        .fz_cta{
          display:inline-block;
          margin-top: 10px;
          text-decoration:none;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          padding: 8px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.85);
          transition: transform 160ms ease, filter 160ms ease, background 160ms ease;
        }
        .fz_cta:hover{ transform: translateY(-1px); filter: brightness(1.08); background: rgba(255,255,255,0.10); }
      `}</style>
    </>
  );
}

function DockPill({
  href,
  label,
  active,
  Icon,
  iconColor,
  variant = "default",
}: {
  href: string;
  label: string;
  active: boolean;
  Icon: any;
  iconColor: string;
  variant?: "default" | "explore";
}) {
  return (
    <Link
      href={href}
      className={`bd_pill ${active ? "active" : ""} ${variant === "explore" ? "explore" : ""}`}
    >
      <Icon size={18} strokeWidth={2.4} className="bd_pillIcon" style={{ color: iconColor }} aria-hidden />
      <span className="bd_pillLabel">{label}</span>

      <style jsx global>{`
        .bd_pill {
          text-decoration: none;
          border-radius: 999px;
          padding: 10px 12px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: 1px solid rgba(0,0,0,0.12);
          background: rgba(255,255,255,0.60);
          color: rgba(0,0,0,0.68);
          transition: transform 160ms ease, filter 160ms ease, box-shadow 160ms ease;
          white-space: nowrap;
        }
        .bd_pill:hover { transform: translateY(-1px); filter: brightness(1.02); }
        .bd_pill.active {
          box-shadow: 0 0 0 1px rgba(0,255,150,0.16), 0 0 22px rgba(0,255,150,0.10), 0 0 18px rgba(255,0,190,0.08);
          background: rgba(255,255,255,0.74);
        }
        .bd_pill.explore {
          background: rgba(0,0,0,0.62);
          border-color: rgba(0,0,0,0.22);
          box-shadow: 0 0 18px rgba(0,0,0,0.12);
          color: rgba(255,255,255,0.90);
        }
        .bd_pill.explore:hover { filter: brightness(1.06); }
        .bd_pill.explore.active { box-shadow: 0 0 0 1px rgba(255,255,255,0.20), 0 0 22px rgba(0,0,0,0.14); }
        .bd_pillLabel { font-size: 12px; font-weight: 950; letter-spacing: 0.08em; text-transform: uppercase; }
        .bd_pillIcon { filter: drop-shadow(0 0 10px rgba(0,0,0,0.05)); }
        .bd_pill.explore .bd_pillIcon { filter: drop-shadow(0 0 10px rgba(255,255,255,0.10)); }
      `}</style>
    </Link>
  );
}
