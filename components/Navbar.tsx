"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const STORE_URL = "https://store.jabvisions.com";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/those-ryderz", label: "Those Ryderz" },
  { href: "/join-us", label: "Join Us" },
  { href: "/john-andy", label: "JAB Founder" },
  { href: "/jab-lit", label: "JAB Lit" },
  { href: "/jab-comics", label: "JAB Comics" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isBoardActive =
    pathname === "/board" || pathname?.startsWith("/board/");
  const isLinkActive = (href: string) => pathname === href;

  return (
    <header
      className="
        fixed top-0 left-0 right-0 z-50
        backdrop-blur-md
        bg-black/30
        shadow-[0_0_45px_rgba(234,255,0,0.55)]
        border-b border-white/5
      "
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 py-3 sm:py-4">
        {/* BRAND */}
        <Link
          href="/"
          className="
            text-lg sm:text-xl font-extrabold tracking-[0.25em]
            text-[#d5ff00]
            drop-shadow-[0_0_10px_rgba(234,255,0,0.9)]
            hover:drop-shadow-[0_0_20px_rgba(234,255,0,1)]
            transition
            whitespace-nowrap
          "
        >
          JAB VISIONS
        </Link>

        {/* DESKTOP NAV */}
        <nav className="hidden md:flex items-center gap-8 lg:gap-10">
          {/* BOARD (now first) */}
          <Link
            href="/board"
            className={`
              rounded-full
              px-4 py-2
              text-[10px] lg:text-xs font-semibold uppercase tracking-[0.2em]
              border border-[#ff00c8]/45
              bg-[#ff00c8]/10
              text-[#ff00c8]
              transition
              hover:bg-[#ff00c8]/18
              hover:shadow-[0_0_25px_rgba(255,0,200,0.65)]
              hover:drop-shadow-[0_0_14px_rgba(255,0,200,0.9)]
              whitespace-nowrap
              ${isBoardActive ? "shadow-[0_0_28px_rgba(255,0,200,0.85)]" : ""}
            `}
          >
            Board
          </Link>

          {/* HOME (now second) */}
          <Link
            href="/"
            className={`
              uppercase text-[10px] lg:text-xs tracking-[0.2em]
              transition
              ${
                isLinkActive("/")
                  ? "text-[#d5ff00]"
                  : "text-gray-300 hover:text-[#ff00c8]"
              }
              hover:drop-shadow-[0_0_14px_rgba(255,0,200,0.9)]
              whitespace-nowrap
            `}
          >
            Home
          </Link>

          {/* REST OF LINKS */}
          {LINKS.filter((l) => l.href !== "/").map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`
                uppercase text-[10px] lg:text-xs tracking-[0.2em]
                transition
                ${
                  isLinkActive(link.href)
                    ? "text-[#d5ff00]"
                    : "text-gray-300 hover:text-[#ff00c8]"
                }
                hover:drop-shadow-[0_0_14px_rgba(255,0,200,0.9)]
                whitespace-nowrap
              `}
            >
              {link.label}
            </Link>
          ))}

          {/* STORE */}
          <a
            href={STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="
              rounded-full
              bg-[#00ff7b]/20
              border border-[#00ff7b]/40
              px-5 py-2
              text-[10px] lg:text-xs font-semibold uppercase tracking-[0.2em]
              text-[#00ff7b]
              transition
              hover:bg-[#00ff7b]/40
              hover:shadow-[0_0_25px_rgba(0,255,123,0.65)]
              whitespace-nowrap
            "
          >
            JAB Visions™ Store
          </a>
        </nav>

        {/* MOBILE TOGGLE */}
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="
            md:hidden
            inline-flex items-center justify-center
            rounded-full border border-[#d5ff00]/60
            px-3 py-1.5
            text-[10px] font-semibold uppercase tracking-[0.2em]
            text-[#d5ff00]
            hover:bg-[#d5ff00]/10
            hover:shadow-[0_0_18px_rgba(213,255,0,0.8)]
            transition
          "
          aria-label="Toggle navigation menu"
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>

      {/* MOBILE DROPDOWN */}
      {open && (
        <div
          className="
            md:hidden
            border-t border-white/10
            bg-black/90
            backdrop-blur-xl
          "
        >
          <nav className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3">
            {/* BOARD (mobile first) */}
            <Link
              href="/board"
              className={`
                mt-1
                inline-flex items-center justify-center
                rounded-full
                bg-[#ff00c8]/10
                border border-[#ff00c8]/45
                px-4 py-2
                text-[10px] font-semibold uppercase tracking-[0.2em]
                text-[#ff00c8]
                transition
                hover:bg-[#ff00c8]/18
                hover:shadow-[0_0_22px_rgba(255,0,200,0.6)]
                ${isBoardActive ? "shadow-[0_0_26px_rgba(255,0,200,0.85)]" : ""}
              `}
            >
              Board
            </Link>

            {/* HOME */}
            <Link
              href="/"
              className={`
                py-2
                uppercase text-[10px] tracking-[0.2em]
                transition
                ${
                  isLinkActive("/")
                    ? "text-[#d5ff00]"
                    : "text-gray-200 hover:text-[#ff00c8]"
                }
              `}
            >
              Home
            </Link>

            {/* REST */}
            {LINKS.filter((l) => l.href !== "/").map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`
                  py-2
                  uppercase text-[10px] tracking-[0.2em]
                  transition
                  ${
                    isLinkActive(link.href)
                      ? "text-[#d5ff00]"
                      : "text-gray-200 hover:text-[#ff00c8]"
                  }
                `}
              >
                {link.label}
              </Link>
            ))}

            {/* STORE */}
            <a
              href={STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="
                mt-2
                inline-flex items-center justify-center
                rounded-full
                bg-[#00ff7b]/20
                border border-[#00ff7b]/40
                px-4 py-2
                text-[10px] font-semibold uppercase tracking-[0.2em]
                text-[#00ff7b]
                transition
                hover:bg-[#00ff7b]/40
                hover:shadow-[0_0_22px_rgba(0,255,123,0.6)]
              "
            >
              JAB Visions™ Store
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}
