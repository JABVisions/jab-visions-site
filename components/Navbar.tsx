// components/Navbar.tsx
import Image from 'next/image';

export default function Navbar() {
  return (
    <>
      {/* Banner sits above the navbar on every page */}
      <div className="w-full bg-[#F4ED00]">
        <Image
          src="/assets/jab-logo-extended.JPG" // must exist at public/assets/jab-logo-extended.JPG (case-sensitive)
          alt="JAB Visions banner"
          width={2048}
          height={621}
          priority
          className="w-full h-auto mx-auto block select-none"
        />
      </div>

      {/* Sticky navbar (unchanged behavior) */}
      <header className="sticky top-0 z-50 bg-black/75 backdrop-blur border-b border-emerald-500/15">
        <div className="mx-auto max-w-6xl px-4">
          <div className="h-14 flex items-center justify-between">
            <a href="/" className="font-semibold tracking-wide text-emerald-200 hover:text-emerald-100">
              JAB Visions
            </a>
            <nav className="hidden sm:flex items-center gap-6 text-emerald-300/80">
              <a href="/" className="hover:text-emerald-100">Home</a>
              <a href="/those-ryderz" className="hover:text-emerald-100">Those Ryderz</a>
              <a href="/join-us" className="hover:text-emerald-100">Join Us</a>
              <a
                href="https://signnow.com/s/t7rt43y5"
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1 text-emerald-100 hover:bg-emerald-500/25 transition"
              >
                Sign Release
              </a>
            </nav>
          </div>
        </div>
      </header>
    </>
  );
}
