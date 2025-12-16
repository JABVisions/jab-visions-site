"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import Navbar from "@/components/Navbar";

export default function JabComicsPage() {
  return (
    <>
      <Navbar />

      <main className="min-h-screen bg-black text-emerald-50 relative overflow-hidden">
        {/* URBAN / DRAWING-BOARD BACKGROUND */}
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(148,163,184,0.4) 1px, transparent 0)",
            backgroundSize: "18px 18px",
          }}
        />
        {/* Spray / paint streaks */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(248,250,252,0.12),transparent_55%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.12),transparent_55%),radial-gradient(circle_at_top_right,rgba(244,63,94,0.18),transparent_60%)]" />

        {/* MAIN CONTENT */}
        <div className="relative max-w-6xl mx-auto px-4 pt-24 pb-20">
          {/* HERO */}
          <section className="grid gap-10 md:grid-cols-[1.6fr,1.1fr] items-start mb-14">
            <div>
              <p className="text-[10px] md:text-xs tracking-[0.3em] uppercase text-lime-300 mb-3">
                JAB COMICS // URBAN IMPRINT
              </p>
              <div className="inline-flex flex-col gap-1 mb-3">
                <span className="inline-block px-3 py-1 rounded-full bg-lime-300 text-black text-[10px] font-semibold tracking-[0.18em] uppercase shadow-[0_0_18px_rgba(190,242,100,0.7)]">
                  New Label
                </span>
              </div>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight mb-3">
                JAB Comics
                <span className="block text-lg md:text-xl text-slate-200/80 mt-1">
                  Sketchbook worlds. Street-level mythology.
                </span>
              </h1>
              <p className="text-sm md:text-base text-slate-100/80 max-w-xl mb-5">
                An urban, art-driven branch of{" "}
                <span className="font-semibold text-emerald-300">
                  JAB Visions
                </span>{" "}
                dedicated to graphic stories, character sketchbooks, and
                90&apos;s–2000&apos;s inspired visual zines. Ink, marker, and
                aura all on the same page.
              </p>

              <div className="flex flex-wrap gap-3 mb-6">
                <Link
                  href="/those-ryderz"
                  className="inline-flex items-center rounded-full bg-lime-300 px-4 py-2 text-xs md:text-sm font-semibold text-black shadow-[0_0_22px_rgba(190,242,100,0.8)] hover:bg-lime-200 transition"
                >
                  // View Those Ryderz Universe
                </Link>
                <Link
                  href="/join-us"
                  className="inline-flex items-center rounded-full border border-pink-400/80 px-4 py-2 text-xs md:text-sm text-pink-200 hover:bg-pink-500/15 hover:text-pink-50 transition shadow-[0_0_18px_rgba(244,114,182,0.5)]"
                >
                  // Creators: Join the Roster
                </Link>
              </div>

              {/* Sticky-note style highlights */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-lg text-[11px] md:text-xs">
                <div className="rounded-xl border border-yellow-300/70 bg-yellow-200/90 text-black px-3 py-2.5 shadow-[4px_4px_0_rgba(15,23,42,0.85)] rotate-[-1.5deg]">
                  <p className="font-semibold mb-1">Vibes</p>
                  <p className="leading-snug">
                    Pencil margins, notebook doodles, subway posters,
                    photocopied zines.
                  </p>
                </div>
                <div className="rounded-xl border border-cyan-400/70 bg-cyan-100/95 text-slate-900 px-3 py-2.5 shadow-[4px_4px_0_rgba(15,23,42,0.85)] rotate-[1.5deg]">
                  <p className="font-semibold mb-1">Era</p>
                  <p className="leading-snug">
                    Late 90&apos;s / early 2000&apos;s sketchbook nostalgia,
                    with modern storytelling.
                  </p>
                </div>
                <div className="rounded-xl border border-lime-300/70 bg-lime-100/95 text-slate-900 px-3 py-2.5 shadow-[4px_4px_0_rgba(15,23,42,0.85)] md:block hidden">
                  <p className="font-semibold mb-1">Focus</p>
                  <p className="leading-snug">
                    Character-driven mini comics, concept art, and graphic
                    spin-offs.
                  </p>
                </div>
              </div>
            </div>

            {/* FAUX SKETCHBOARD PANEL */}
            <div className="relative">
              <div className="absolute -inset-1 rounded-3xl bg-[conic-gradient(from_140deg,rgba(190,242,100,0.7),rgba(56,189,248,0.6),rgba(244,114,182,0.7),rgba(190,242,100,0.7))] blur-xl opacity-70" />
              <div className="relative rounded-3xl border border-slate-300/40 bg-slate-950/90 shadow-[0_0_40px_rgba(15,23,42,0.9)] px-4 py-4 md:px-5 md:py-5">
                {/* Tape corners */}
                <div className="absolute -top-2 left-6 w-10 h-3 bg-yellow-200/90 rotate-[-7deg] shadow-[2px_2px_0_rgba(15,23,42,0.9)]" />
                <div className="absolute -top-1 right-7 w-7 h-3 bg-cyan-200/90 rotate-[9deg] shadow-[2px_2px_0_rgba(15,23,42,0.9)]" />
                <div className="absolute -bottom-2 left-10 w-8 h-3 bg-pink-200/90 rotate-[6deg] shadow-[2px_2px_0_rgba(15,23,42,0.9)]" />

                <div className="border-2 border-slate-400/70 border-dashed rounded-2xl p-3 md:p-4 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-slate-300 mb-2">
                    Concept Board // Panel Layout
                  </p>
                  <div className="grid grid-rows-3 gap-2 h-64 md:h-72">
                    <div className="border border-lime-300/80 rounded-lg bg-slate-900/80 flex items-center justify-center text-[10px] text-lime-200/90">
                      Future cover art &amp; splash pages live here.
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="border border-cyan-300/70 rounded-lg bg-slate-900/75 flex items-center justify-center text-[10px] text-cyan-100/90">
                        Character sheets
                      </div>
                      <div className="border border-pink-400/70 rounded-lg bg-slate-900/75 flex items-center justify-center text-[10px] text-pink-100/90">
                        Expression studies
                      </div>
                    </div>
                    <div className="border border-yellow-300/80 rounded-lg bg-slate-900/80 flex items-center justify-center text-[10px] text-yellow-100/90">
                      Ryderz universe graphic adaptations &amp; original
                      one-shots.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* WHAT IS JAB COMICS */}
          <section className="grid gap-8 md:grid-cols-[1.6fr,1.2fr] mb-14">
            <div className="bg-slate-950/85 rounded-2xl border border-slate-600/60 p-5 md:p-6 backdrop-blur shadow-[0_0_28px_rgba(15,23,42,0.9)]">
              <h2 className="text-sm md:text-base font-semibold mb-3">
                What is JAB Comics?
                <span className="text-lime-300">_</span>
              </h2>
              <p className="text-xs md:text-sm text-slate-100/85 mb-3">
                <span className="font-semibold text-lime-300">JAB Comics</span>{" "}
                is the ink-and-paper cousin of{" "}
                <span className="font-semibold text-emerald-300">
                  JAB Visions
                </span>
                . It&apos;s where ideas start as doodles on looseleaf, marker
                thumbnails on the train, or storyboard frames that turned into
                entire character arcs.
              </p>
              <p className="text-xs md:text-sm text-slate-100/80 mb-3">
                The imprint leans heavily into{" "}
                <span className="font-semibold text-pink-300">
                  90s–2000s drawing-board nostalgia
                </span>{" "}
                – think sticker-bombed sketchbooks, photocopied zines from a
                bodega copier, and taped-up character sheets on a bedroom wall.
              </p>
              <p className="text-xs md:text-sm text-slate-100/80">
                Expect{" "}
                <span className="font-semibold text-cyan-300">
                  graphic novellas, mini comics, sketch collections,
                </span>{" "}
                and visual lore books that expand the{" "}
                <span className="font-semibold text-emerald-300">
                  Those Ryderz
                </span>{" "}
                universe and future narratives under the JAB Visions umbrella.
              </p>
            </div>

            {/* UPCOMING PANELS */}
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 mb-1">
                <h3 className="text-sm font-semibold">
                  Upcoming Titles <span className="text-lime-300">/ /</span>
                </h3>
                <span className="text-[10px] px-2 py-1 rounded-full border border-lime-300/70 text-lime-200 bg-lime-300/10">
                  In development
                </span>
              </div>

              <div className="grid gap-3">
                <div className="rounded-2xl border border-lime-300/70 bg-slate-950/90 p-4 shadow-[4px_4px_0_rgba(190,242,100,0.8)]">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-lime-300 mb-1">
                    Graphic One-Shot
                  </p>
                  <h4 className="text-sm md:text-base font-semibold mb-1">
                    Those Ryderz: Origin Sketchbook
                  </h4>
                  <p className="text-[11px] md:text-xs text-slate-100/85">
                    Character designs, aura studies, and storyboard slices from
                    the early days of developing the Ryderz universe.
                  </p>
                </div>

                <div className="rounded-2xl border border-cyan-300/70 bg-slate-950/90 p-4 shadow-[4px_4px_0_rgba(56,189,248,0.7)]">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-300 mb-1">
                    Mini Series // Concept
                  </p>
                  <h4 className="text-sm md:text-base font-semibold mb-1">
                    Pink Ryder: Keven Hart Pages
                  </h4>
                  <p className="text-[11px] md:text-xs text-slate-100/85">
                    A more intimate, panel-by-panel look at Keven&apos;s life
                    before and during his awakening as the Pink Ryder.
                  </p>
                </div>

                <div className="rounded-2xl border border-pink-400/70 bg-slate-950/90 p-4 shadow-[4px_4px_0_rgba(244,114,182,0.7)]">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-pink-300 mb-1">
                    Anthology // Future
                  </p>
                  <h4 className="text-sm md:text-base font-semibold mb-1">
                    JAB Comics Sampler Vol. 1
                  </h4>
                  <p className="text-[11px] md:text-xs text-slate-100/85">
                    Short comics and visual experiments from the JAB Visions
                    world — Ryderz-adjacent stories and original stand-alone
                    pieces.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* ARTWORK GALLERY / SKETCH WALL */}
          <section className="mb-14">
            <div className="flex items-center justify-between gap-4 mb-3">
              <h2 className="text-sm md:text-base font-semibold">
                Sketch Wall / Gallery<span className="text-lime-300">_</span>
              </h2>
              <span className="text-[10px] px-2 py-1 rounded-full border border-slate-500/70 text-slate-300 bg-slate-900/60">
                Original artwork by John Andy
              </span>
            </div>

            <p className="text-xs md:text-sm text-slate-100/80 mb-4 max-w-xl">
              Selected pieces from the{" "}
              <span className="font-semibold text-lime-300">JAB Comics</span>{" "}
              sketch archive — Procreate studies, cover explorations, and aura
              experiments that live between storyboards and finished frames.
            </p>

            <div className="grid gap-4 md:gap-6 md:grid-cols-3">
              {/* Artwork 1 */}
              <div className="relative group">
                <div className="absolute -inset-1 rounded-2xl bg-[conic-gradient(from_160deg,rgba(190,242,100,0.6),rgba(56,189,248,0.6),rgba(244,114,182,0.6),rgba(190,242,100,0.6))] blur-xl opacity-40 group-hover:opacity-80 transition" />
                <div className="relative rounded-2xl overflow-hidden border border-slate-400/70 bg-slate-950 shadow-[4px_4px_0_rgba(15,23,42,0.9)]">
                  <div className="aspect-[3/4]">
                    <Image
                      src="/assets/mercy_jonas.jpg"
                      alt="JAB Comics artwork of a hero on the beach at neon sunset"
                      width={600}
                      height={800}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="border-t border-slate-700/70 bg-slate-950/90 px-3 py-2">
                    <p className="text-[11px] text-slate-100/90">
                      Beach-run concept — anatomy, motion, and JAB insignia
                      glowing against a surreal shoreline.
                    </p>
                  </div>
                </div>
              </div>

              {/* Artwork 2 */}
              <div className="relative group">
                <div className="absolute -inset-1 rounded-2xl bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.7),transparent_60%),radial-gradient(circle_at_bottom,rgba(244,114,182,0.7),transparent_60%)] blur-xl opacity-35 group-hover:opacity-80 transition" />
                <div className="relative rounded-2xl overflow-hidden border border-slate-400/70 bg-slate-950 shadow-[4px_4px_0_rgba(15,23,42,0.9)]">
                  <div className="aspect-[3/4]">
                    <Image
                      src="/assets/kidparanormal1.JPG"
                      alt="JAB Comics artwork of a glowing paranormal kid in a school hallway"
                      width={600}
                      height={800}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="border-t border-slate-700/70 bg-slate-950/90 px-3 py-2">
                    <p className="text-[11px] text-slate-100/90">
                      Kid Paranormal — The Star of JAB Comic Visions, he holds
                      the universe together like glue as his schizophrenia turns
                      into tanglible illusions and fourth dimensional tools.
                    </p>
                  </div>
                </div>
              </div>

              {/* Artwork 3 */}
              <div className="relative group">
                <div className="absolute -inset-1 rounded-2xl bg-[radial-gradient(circle_at_center,rgba(190,242,100,0.7),transparent_60%)] blur-xl opacity-35 group-hover:opacity-80 transition" />
                <div className="relative rounded-2xl overflow-hidden border border-slate-400/70 bg-slate-950 shadow-[4px_4px_0_rgba(15,23,42,0.9)]">
                  <div className="aspect-[3/4]">
                    <Image
                      src="/assets/marywantis:jonas.JPG"
                      alt="JAB Comics artwork of a glowing water spirit and boy on a dock"
                      width={600}
                      height={800}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="border-t border-slate-700/70 bg-slate-950/90 px-3 py-2">
                    <p className="text-[11px] text-slate-100/90">
                      Mary Wantis &amp; Mercy Jonas — storm-dock sequence with
                      water spirit design, glow nets, and JAB Studios
                      iconography.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* SUBMISSIONS / COLLABS */}
          <section className="mb-14">
            <div className="grid gap-8 md:grid-cols-[1.5fr,1.1fr]">
              <div className="bg-slate-950/90 rounded-2xl border border-lime-300/60 p-5 md:p-6 backdrop-blur shadow-[0_0_30px_rgba(190,242,100,0.45)]">
                <h2 className="text-sm md:text-base font-semibold mb-3">
                  Artists, Writers, &amp; Visual Storytellers Wanted
                </h2>
                <p className="text-xs md:text-sm text-slate-100/85 mb-3">
                  JAB Comics is built for people who live in sketchbooks, draw
                  in the margins, and see stories when they&apos;re staring at a
                  blank page on the train.
                </p>
                <p className="text-xs md:text-sm text-slate-100/80 mb-3">
                  If you&apos;re a{" "}
                  <span className="font-semibold text-lime-300">
                    comic artist, storyboarder, illustrator, letterer, or writer
                  </span>{" "}
                  who wants to play in stylized worlds, you&apos;re invited to
                  plug into the JAB Visions ecosystem.
                </p>
                <p className="text-xs md:text-sm text-slate-100/80 mb-4">
                  Start by joining the main{" "}
                  <span className="font-semibold text-emerald-300">
                    JAB Visions database
                  </span>{" "}
                  and note your interest in comics or visual development.
                </p>

                <Link
                  href="/join-us"
                  className="inline-flex items-center rounded-full bg-lime-300 px-4 py-2 text-xs md:text-sm font-semibold text-black shadow-[0_0_24px_rgba(190,242,100,0.9)] hover:bg-lime-200 transition"
                >
                  // Join JAB Visions &amp; JAB Comics Roster
                </Link>
              </div>

              <div className="bg-slate-950/85 rounded-2xl border border-slate-600/60 p-5 md:p-6 backdrop-blur">
                <h3 className="text-sm font-semibold mb-2">
                  Contact &amp; Inquiries
                </h3>
                <p className="text-[11px] md:text-xs text-slate-100/85 mb-2">
                  For questions specifically about{" "}
                  <span className="font-semibold text-lime-300">JAB Comics</span>{" "}
                  and graphic projects:
                </p>
                <p className="text-[11px] md:text-xs text-slate-100/85 mb-4">
                  Email:{" "}
                  <a
                    href="mailto:JohnAndyBooks@gmail.com"
                    className="underline underline-offset-4 text-cyan-300 hover:text-cyan-100"
                  >
                    JohnAndyBooks@gmail.com
                  </a>
                  <br />
                  Subject line:{" "}
                  <span className="italic text-lime-300">
                    &quot;JAB Comics Inquiry&quot;
                  </span>
                </p>
                <p className="text-[11px] md:text-xs text-slate-400/90">
                  Please include links to your portfolio, socials, or sample
                  pages if you have them. Rough sketches are welcome — this is a
                  drawing-board space first.
                </p>
              </div>
            </div>
          </section>

          {/* FOOTER TAGLINE */}
          <section className="border-t border-slate-700/70 pt-6 mt-6">
            <p className="text-[11px] md:text-xs text-slate-400/90">
              JAB Comics is an imprint of JAB Visions — building a{" "}
              <span className="text-lime-300">visual universe</span> that lives
              across film, pages, and everything in between.
            </p>
          </section>
        </div>
      </main>
    </>
  );
}
