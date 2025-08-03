'use client';

import Link from 'next/link';

export default function Navbar() {
  return (
    <nav className="w-full bg-black text-white py-4 px-6 flex justify-between items-center">
      <div className="text-xl font-bold">
        <Link href="/">JAB Visions</Link>
      </div>
      <div className="space-x-6 text-sm">
        <Link href="/" className="hover:underline">Home</Link>
        <Link href="/about" className="hover:underline">About</Link>
        <Link href="/those-ryderz" className="hover:underline">Those Ryderz</Link>
        <Link href="/register" className="hover:underline text-green-400 font-semibold">Register</Link>
      </div>
    </nav>
  );
}
