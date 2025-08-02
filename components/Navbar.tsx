'use client';
import Link from 'next/link';

export default function Navbar() {
  return (
    <nav className="bg-gray-900 text-white p-4 flex space-x-6">
      <Link href="/" className="hover:text-green-400">Home</Link>
      <Link href="/those-ryderz" className="hover:text-green-400">Those Ryderz</Link>
    </nav>
  );
}
