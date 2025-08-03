'use client';
import Link from 'next/link';
import Image from 'next/image';

export default function Navbar() {
  return (
    <nav className="w-full flex justify-between items-center px-6 py-4 bg-transparent z-50 relative">
      {/* Logo and Brand */}
      <div className="flex items-center gap-3">
        <Image
          src="/assets/jab-logo@2x.png"
          alt="JAB Visions Logo"
          width={40}
          height={40}
        />
        <span className="text-green-300 font-bold text-xl glowing-text">
          JAB Visions
        </span>
      </div>

      {/* Navigation Links */}
      <div className="flex space-x-6">
        <Link href="/those-ryderz">
          <span className="glowing-link text-green-300">Those Ryderz</span>
        </Link>
        <Link href="/join-us">
          <span className="glowing-link text-green-300">Join Us</span>
        </Link>
      </div>

      {/* Glow effect */}
      <style jsx global>{`
        .glowing-link {
          cursor: pointer;
          transition: all 0.3s ease;
          text-shadow: 0 0 6px #00ffcc;
        }
        .glowing-link:hover {
          color: #a2f7ff;
          text-shadow: 0 0 12px #00ffe7, 0 0 20px #00ffe7;
        }
      `}</style>
    </nav>
  );
}
