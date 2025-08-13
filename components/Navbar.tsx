'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const SIGNNOW_URL = 'https://signnow.com/s/M1MdKxRK';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/those-ryderz', label: 'Those Ryderz' },
  { href: '/join-us', label: 'Join Us' },
];

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close on ESC and on route changes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    // When path changes, close menu
    setOpen(false);
  }, [pathname]);

  // Prevent body scroll when mobile menu open
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
  }, [open]);

  const isActive = (href: string) =>
    href === '/'
      ? pathname === '/'
      : pathname?.startsWith(href);

  return (
    <header className="fixed top-0 inset-x-0 z-50 bg-neutral-950/80 backdrop-blur-md border-b border-emerald-500/20">
      <div className="mx-auto max-w-6xl px-4">
        <div className="h-16 flex items-center justify-between">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-2">
            <span className="text-lg font-extrabold tracking-wide text-emerald-200 drop-shadow-[0_0_8px_rgba(16,185,129,0.6)]">
              JAB Visions
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6">
            {LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  'text-sm transition',
                  'hover:text-emerald-200 text-emerald-200/80',
                  isActive(item.href) ? 'text-emerald-200 drop-shadow-[0_0_6px_rgba(16,185,129,0.35)]' : '',
                ].join(' ')}
              >
                {item.label}
              </Link>
            ))}

            <a
              href={SIGNNOW_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-xl px-3 py-2 text-sm font-semibold
                         ring-1 ring-emerald-400/40 hover:ring-emerald-300/60
                         bg-emerald-400/10 hover:bg-emerald-400/15
                         text-emerald-200 transition shadow-[0_0_12px_rgba(16,185,129,0.25)]"
            >
              Sign Release
            </a>
          </nav>

          {/* Mobile toggle */}
          <button
            aria-label="Toggle menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="md:hidden inline-flex items-center justify-center rounded-xl p-2
                       ring-1 ring-emerald-500/30 text-emerald-200 hover:bg-emerald-400/10"
          >
            {open ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu (slides under header) */}
      {open && (
        <div className="md:hidden border-t border-emerald-500/20 bg-neutral-950/95">
          <div className="mx-auto max-w-6xl px-4 py-4">
            <div className="grid gap-2">
              {LINKS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    'block rounded-xl px-3 py-2 transition',
                    'hover:bg-emerald-400/10',
                    isActive(item.href) ? 'text-emerald-200' : 'text-emerald-200/90',
                  ].join(' ')}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
              <a
                href={SIGNNOW_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-semibold
                           ring-1 ring-emerald-400/40 hover:ring-emerald-300/60
                           bg-emerald-400/10 hover:bg-emerald-400/15
                           text-emerald-200 transition"
                onClick={() => setOpen(false)}
              >
                Sign Release
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
