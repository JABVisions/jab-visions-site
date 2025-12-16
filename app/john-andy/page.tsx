"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import Navbar from "@/components/Navbar";

const STORE_URL = "https://store.jabvisions.com";

export default function JohnAndyPage() {
  return (
    <>
      <Navbar />

      <main className="min-h-screen bg-black text-emerald-50 relative overflow-hidden">
        {/* MATRIX BACKGROUND */}
        <div
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, #22c55e 1px, transparent 0)",
            backgroundSize: "26px 26px",
          }}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-black via-emerald-950/40 to-cyan-900/40" />

        <div className="relative max-w-6xl mx-auto px-4 pt-24 pb-20">
          {/* HERO */}
          <section className="grid gap-10 md:grid-cols-[1.4fr,1fr] items-center mb-14">
            <div>
              <p className="text-xs tracking-[0.35em] uppercase text-emerald-400 mb-3">
                John Andy // Creator Profile
              </p>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight mb-3">
                John Andy
                <span className="block text-lg md:text-xl text-emerald-300/80 mt-1">
                  Writer / Director / Lead Actor
                </span>
              </h1>
              <p className="text-sm md:text-base text-emerald-100/80 max-w-xl mb-5">
                Founder of{" "}
                <span className="font-semibold text-emerald-300">
                  JAB Visions
                </span>{" "}
                and creator of the{" "}
                <span className="font-semibold text-cyan-300">
                  Those Ryderz
                </span>{" "}
                universe — blending supernatural teen drama, spiritual themes,
                and grounded, indie filmmaking based in NYC.
              </p>

              <div className="flex flex-wrap gap-3 mb-6">
                <Link
                  href="/those-ryderz"
                  className="inline-flex items-center rounded-full bg-emerald-400 px-4 py-2 text-xs md:text-sm font-semibold text-black shadow-[0_0_25px_rgba(52,211,153,0.7)] hover:bg-emerald-300 transition"
                >
                  // Explore Those Ryderz
                </Link>
                <a
                  href="mailto:JohnAndyBooks@gmail.com"
                  className="inline-flex items-center rounded-full border border-cyan-400/70 px-4 py-2 text-xs md:text-sm text-cyan-200 hover:bg-cyan-500/15 hover:text-cyan-50 transition shadow-[0_0_18px_rgba(34,211,238,0.4)]"
                >
                  // Contact John
                </a>
              </div>

              <div className="grid grid-cols-3 gap-4 max-w-md text-[11px] md:text-xs">
                <div className="rounded-xl border border-emerald-500/50 bg-black/60 px-3 py-2.5">
                  <p className="text-emerald-400/90 uppercase tracking-[0.18em] mb-1">
                    Base
                  </p>
                  <p className="text-emerald-100">New York City</p>
                </div>
                <div className="rounded-xl border border-cyan-400/50 bg-black/60 px-3 py-2.5">
                  <p className="text-cyan-300/90 uppercase tracking-[0.18em] mb-1">
                    Focus
                  </p>
                  <p className="text-emerald-100">
                    Indie film, genre worlds, casting
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-500/50 bg-black/60 px-3 py-2.5">
                  <p className="text-emerald-300/90 uppercase tracking-[0.18em] mb-1">
                    Current
                  </p>
                  <p className="text-emerald-100">Those Ryderz (feature)</p>
                </div>
              </div>
            </div>

            {/* HEADSHOT / VISUAL */}
            <div className="flex justify-center md:justify-end">
              <div className="relative">
                <div className="absolute -inset-1 rounded-3xl bg-gradient-to-tr from-emerald-500 via-cyan-400 to-emerald-300 blur-xl opacity-70" />
                <div className="relative rounded-3xl overflow-hidden border border-emerald-500/60 bg-black/70 shadow-[0_0_40px_rgba(16,185,129,0.6)] w-64 h-80 md:w-72 md:h-96 flex items-center justify-center">
                  <Image
                    src="/assets/john-andy-headshot.jpeg"
                    alt="John Andy Headshot"
                    width={480}
                    height={640}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-300">
                      The Pink Ryder // Keven Hart
                    </p>
                    <p className="text-xs text-emerald-100/90">
                      Lead in{" "}
                      <span className="font-semibold text-cyan-300">
                        Those Ryderz
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ABOUT + VISION */}
          <section className="grid gap-8 md:grid-cols-[1.5fr,1.2fr] mb-14">
            <div className="bg-zinc-950/80 rounded-2xl border border-emerald-600/50 p-5 md:p-6 backdrop-blur shadow-[0_0_30px_rgba(16,185,129,0.5)]">
              <h2 className="text-sm md:text-base font-semibold mb-3">
                Creator Statement<span className="text-emerald-400">_</span>
              </h2>
              <p className="text-xs md:text-sm text-emerald-100/85 mb-3">
                I grew up on{" "}
                <span className="font-semibold text-emerald-300">
                  Power Rangers, Teen Titans, Kingdom Hearts, Star Wars,
                </span>
                , intense teen dramas, and big spiritual questions.{" "}
                <span className="font-semibold text-cyan-300">
                  Those Ryderz
                </span>{" "}
                is my way of merging all of that—taking the spectacle of
                superheroes and dropping it into the emotional chaos of real
                teenagers facing something as big as the end of the world.
              </p>
              <p className="text-xs md:text-sm text-emerald-100/80 mb-3">
                As a filmmaker, my goal is to build{" "}
                <span className="font-semibold text-emerald-300">
                  grounded, character-first stories
                </span>{" "}
                inside heightened worlds. I care about messy friendships,
                flawed heroes, and the kind of visuals that make you pause the
                screen.
              </p>
              <p className="text-xs md:text-sm text-emerald-100/80">
                JAB Visions is more than a film label—it&apos;s a hub for{" "}
                <span className="font-semibold text-cyan-300">
                  actors, crew, and creators
                </span>{" "}
                to grow together while we build something weird, specific, and
                unforgettable.
              </p>
            </div>

            <div className="space-y-4">
              <div className="bg-zinc-950/80 rounded-2xl border border-cyan-400/60 p-5 backdrop-blur shadow-[0_0_28px_rgba(34,211,238,0.55)]">
                <h3 className="text-sm font-semibold mb-2">
                  Current Focus <span className="text-cyan-300">/ /</span>
                </h3>
                <ul className="text-[11px] md:text-xs text-emerald-100/85 space-y-1.5">
                  <li>• Finalizing principal casting for Those Ryderz</li>
                  <li>• Building the JAB Visions online portal &amp; store</li>
                  <li>• Developing long-term Ryderz universe story arcs</li>
                  <li>• Expanding network of recurring cast and crew</li>
                </ul>
              </div>

              <div className="bg-zinc-950/70 rounded-2xl border border-emerald-700/60 p-5 backdrop-blur">
                <h3 className="text-sm font-semibold mb-2">
                  Looking to Collaborate With
                </h3>
                <ul className="text-[11px] md:text-xs text-emerald-100/85 space-y-1.5">
                  <li>• Actors who love genre and character work</li>
                  <li>• DPs, ACs, and G&amp;E crew who enjoy stylized visuals</li>
                  <li>• HMU and costume artists excited by aura-driven looks</li>
                  <li>• Producers and partners interested in indie franchises</li>
                </ul>
                <Link
                  href="/join-us"
                  className="mt-3 inline-flex text-[11px] font-semibold text-cyan-300 underline underline-offset-4 hover:text-cyan-100 transition"
                >
                  // Join the JAB Visions database
                </Link>
              </div>
            </div>
          </section>

          {/* FEATURED PROJECTS */}
          <section className="mb-14">
            <div className="flex items-center justify-between gap-4 mb-4">
              <h2 className="text-sm md:text-base font-semibold">
                Featured Work<span className="text-emerald-400">_</span>
              </h2>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="bg-zinc-950/80 rounded-2xl border border-emerald-600/60 p-5 backdrop-blur shadow-[0_0_26px_rgba(16,185,129,0.5)]">
                <p className="text-[11px] uppercase tracking-[0.22em] text-emerald-300 mb-1">
                  Feature Film
                </p>
                <h3 className="text-base md:text-lg font-semibold mb-1">
                  Those Ryderz
                </h3>
                <p className="text-[11px] md:text-xs text-emerald-100/85 mb-3">
                  Writer / Director / Lead Actor (Keven Hart &amp; Bhrist)
                </p>
                <p className="text-xs md:text-sm text-emerald-100/80 mb-3">
                  A supernatural teen drama about color-coded &quot;Ryderz&quot;
                  chosen by extra-dimensional auras in a world on the brink of
                  Armageddon. Equal parts{" "}
                  <span className="text-emerald-300">
                    spiritual sci-fi, teen chaos,
                  </span>{" "}
                  and emotional coming-of-age.
                </p>
                <Link
                  href="/those-ryderz"
                  className="inline-flex text-[11px] md:text-xs font-semibold text-cyan-300 underline underline-offset-4 hover:text-cyan-100 transition"
                >
                  // View project page
                </Link>
              </div>

              <div className="bg-zinc-950/80 rounded-2xl border border-cyan-500/60 p-5 backdrop-blur shadow-[0_0_26px_rgba(34,211,238,0.55)]">
                <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-300 mb-1">
                  Brand &amp; Store
                </p>
                <h3 className="text-base md:text-lg font-semibold mb-1">
                  JAB Visions™ Store
                </h3>
                <p className="text-[11px] md:text-xs text-emerald-100/85 mb-3">
                  Creative Direction / Product Curation
                </p>
                <p className="text-xs md:text-sm text-emerald-100/80 mb-3">
                  An online space for gadgets, fashion, statement pieces, and
                  home decor curated around the{" "}
                  <span className="text-cyan-300">JAB Visions</span> visual
                  language—glitchy, neon, and cinematic.
                </p>
                <a
                  href={STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex text-[11px] md:text-xs font-semibold text-cyan-300 underline underline-offset-4 hover:text-cyan-100 transition"
                >
                  // Visit store
                </a>
              </div>
            </div>
          </section>

          {/* CONTACT FOOTER */}
          <section className="border-t border-emerald-800/60 pt-6 mt-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 text-[11px] md:text-xs text-emerald-100/80">
              <div>
                <p className="font-semibold text-emerald-200">
                  Connect with John
                </p>
                <p>
                  Email:{" "}
                  <a
                    href="mailto:JohnAndyBooks@gmail.com"
                    className="underline underline-offset-4 text-cyan-300 hover:text-cyan-100"
                  >
                    JohnAndyBooks@gmail.com
                  </a>
                </p>
              </div>
              <div className="space-y-1">
                <p>
                  JAB Visions • NYC • Those Ryderz Universe in active
                  development
                </p>
                <p className="text-emerald-400/80">
                  &copy; {new Date().getFullYear()} JAB Visions. All rights
                  reserved.
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
