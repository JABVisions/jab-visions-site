// components/Navbar.tsx
import React from 'react';
import Link from 'next/link';

export default function Navbar() {
  return (
    <nav className="fixed top-0 left-0 w-full bg-black border-b-2 border-green-500 z-50">
      <div className="relative max-w-6xl mx-auto h-16">
        {/* Business Title centered */}
        <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-40">
          <span className="text-green-400 font-semibold text-2xl uppercase">
            JAB Visions™
          </span>
        </div>

        {/* Navigation Links aligned right */}
        <div className="absolute right-4 top-1/2 transform -translate-y-1/2 flex items-center space-x-4 text-green-400 font-medium">
          <Link href="/" className="hover:text-green-300 transition">
            Home
          </Link>
          <span className="text-green-600">|</span>
          <Link href="/those-ryderz" className="hover:text-green-300 transition">
            Those Ryderz
          </Link>
          <span className="text-green-600">|</span>
          <Link href="/join-us" className="hover:text-green-300 transition">
            Join Us
          </Link>
        </div>
      </div>

      {/* Circuit-style top & bottom borders */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-500 via-transparent to-green-500" />
      <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-green-500 via-transparent to-green-500" />
    </nav>
  );
}
