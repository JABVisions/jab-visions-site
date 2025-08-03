'use client';

import Link from 'next/link';
import Image from 'next/image';

export default function Navbar() {
  return (
    <nav className="w-full bg-black py-4 px-6 flex justify-between items-center shadow-md z-50 border-b border-neutral-800">
      {/* Logo and Text */}
      <Link href="/" className="flex items-center space-x-3 group">
        <Image
          src="/assets/jab-logo@2x.png"
          alt="JAB Visions Logo"
          width={40}
          height={40}
          className="hover:scale-105 transition-transform"
        />
        <span className="text-[#00ff88] text-lg font-bold tracking-widest uppercase font-mono animate-pulse-slow">
          JAB Visions
        </span>
      </Link>

      {/* Navigation Links */}
      <div className="flex space-x-6 text-sm md:text-base uppercase font-mono tracking-widest">
        <NavItem href="/" text="Home" />
        <NavItem href="/those-ryderz" text="Those Ryderz" />
        <NavItem href="/register" text="Join Us" />
      </div>
    </nav>
  );
}

function NavItem({ href, text }: { href: string; text: string }) {
  return (
    <Link href={href}>
      <span className="nav-glow cursor-pointer font-semibold tracking-wide group">
        {text}
      </span>
    </Link>
  );
}
