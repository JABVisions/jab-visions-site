"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const SIGNNOW_URL = "https://signnow.com/s/M1MdKxRK";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/those-ryderz", label: "Those Ryderz" },
  { href: "/join-us", label: "Join Us" },
  { href: "/john-andy", label: "John Andy" },
  { href: "/jab-comics", label: "JAB Comics" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        {/* BRAND TITLE */}
        <Link
          href="/"
          className="
            text-xl font-extrabold tracking-[0.25em]
            text-[#d5ff00]
            drop-shadow-[0_0_10px_rgba(234,255,0,0.9)]
            hover:drop-shadow-[0_0_20px_rgba(234,255,0,1)]
            transition
          "
        >
          JAB VISIONS
        </Link>

        {/* NAV LINKS */}
        <nav className="hidden md:flex items-center gap-10">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`
                uppercase text-xs tracking-[0.2em]
                transition
                ${
                  pathname === link.href
                    ? "text-[#d5ff00]"
                    : "text-gray-300 hover:text-[#ff00c8]"
                }
                hover:drop-shadow-[0_0_14px_rgba(255,0,200,0.9)]
              `}
            >
              {link.label}
            </Link>
          ))}

          {/* SIGN RELEASE BUTTON */}
          <a
            href={SIGNNOW_URL}
            target="_blank"
            className="
              rounded-full
              bg-[#00ff7b]/20
              border border-[#00ff7b]/40
              px-5 py-2
              text-xs font-semibold uppercase tracking-[0.2em]
              text-[#00ff7b]
              transition
              hover:bg-[#00ff7b]/40
              hover:shadow-[0_0_25px_rgba(0,255,123,0.65)]
            "
          >
            Sign Release
          </a>
        </nav>
      </div>
    </header>
  );
}
