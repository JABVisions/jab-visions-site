"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import Navbar from "@/app/components/Navbar";

const artwork = [
  {
    src: "/assets/mercy_jonas.jpg",
    alt: "JAB Comics artwork of a hero on the beach at neon sunset",
    label: "Concept Art",
    title: "Mercy Jonas // Shoreline Signal",
    description:
      "A beach-run concept exploring anatomy, motion, JAB insignia energy, and a surreal shoreline glow.",
  },
  {
    src: "/assets/kidparanormal1.JPG",
    alt: "JAB Comics artwork of a glowing paranormal kid in a school hallway",
    label: "Character Study",
    title: "Kid Paranormal // Reality Glue",
    description:
      "The star of JAB Comic Visions. His unipolar energy bends into tangible illusions, fourth-dimensional tools, and impossible problem-solving.",
  },
  {
    src: "/assets/joan-of-arc.jpg",
    alt: "JAB Comics artwork of Joan of Arc holding a glowing blue sword near castle ruins",
    label: "Heroic Study",
    title: "Joan of Arc // Neon Standard",
    description:
      "A saint-warrior concept frame with castle ruins, dusk light, armor sketch lines, and a charged blue blade.",
  },
  {
    src: "/assets/marywantis:jonas.JPG",
    alt: "JAB Comics artwork of a glowing water spirit and boy on a dock",
    label: "Myth Frame",
    title: "Mary Wantis & Mercy Jonas",
    description:
      "A storm-dock sequence with water-spirit design, glow nets, spiritual tension, and early JAB Studios iconography.",
    wide: true,
  },
  {
    src: "/assets/persephone.JPG",
    alt: "JAB Comics artwork of Persephone swinging with glowing orange hair",
    label: "Character Vision",
    title: "Persephone // Flame Swing",
    description:
      "A mythic character frame with ember hair, swing-line motion, red dress energy, and handwritten neon title work.",
  },
];

const developmentVault = [
  "Original character artwork",
  "Comic-style cover concepts",
  "Those Ryderz graphic adaptation ideas",
  "Paranormal Activity Division visual lore",
  "Anderzone / Board-connected mythology",
  "Future one-shots and visual experiments",
];

export default function JabComicsPage() {
  return (
    <>
      <Navbar />

      <main className="min-h-screen bg-black text-emerald-50 relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(148,163,184,0.4) 1px, transparent 0)",
            backgroundSize: "18px 18px",
          }}
        />

        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(248,250,252,0.12),transparent_55%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.12),transparent_55%),radial-gradient(circle_at_top_right,rgba(244,63,94,0.18),transparent_60%)]" />

        <div className="relative max-w-6xl mx-auto px-4 pt-24 pb-20">
          <section className="grid gap-10 md:grid-cols-[1.6fr,1.1fr] items-start mb-14">
            <div>
              <p className="text-[10px] md:text-xs tracking-[0.3em] uppercase text-lime-300 mb-3">
                JAB COMICS // VISUAL MYTHOLOGY IMPRINT
              </p>

              <div className="inline-flex flex-col gap-1 mb-3">
                <span className="inline-block px-3 py-1 rounded-full bg-lime-300 text-black text-[10px] font-semibold tracking-[0.18em] uppercase shadow-[0_0_18px_rgba(190,242,100,0.7)]">
                  Artwork Expanding
                </span>
              </div>

              <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight mb-3">
                JAB Comics
                <span className="block text-lg md:text-xl text-slate-200/80 mt-1">
                  Sketchbook worlds. Street-level mythology. Visual portals.
                </span>
              </h1>

              <p className="text-sm md:text-base text-slate-100/80 max-w-xl mb-5">
                <span className="font-semibold text-lime-300">JAB Comics</span>{" "}
                is the illustrated branch of{" "}
                <span className="font-semibold text-emerald-300">
                  JAB Visions™
                </span>
                , where characters, symbols, powers, and cinematic worlds expand
                into graphic storytelling. This is the drawing-board layer of
                the company: concept art, comic experiments, character studies,
                visual lore, and future graphic releases.
              </p>

              <p className="text-sm md:text-base text-slate-100/75 max-w-xl mb-6">
                Expect supernatural teen mythology, heroic weirdness, spiritual
                energy systems, urban fantasy, notebook-born characters, and the
                kind of artwork that feels like it escaped from a bedroom wall,
                a school hallway, and a cosmic scanner at the same time.
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

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-lg text-[11px] md:text-xs">
                <div className="rounded-xl border border-yellow-300/70 bg-yellow-200/90 text-black px-3 py-2.5 shadow-[4px_4px_0_rgba(15,23,42,0.85)] rotate-[-1.5deg]">
                  <p className="font-semibold mb-1">Artwork</p>
                  <p className="leading-snug">
                    Character studies, covers, visual experiments, and comic
                    development frames.
                  </p>
                </div>

                <div className="rounded-xl border border-cyan-400/70 bg-cyan-100/95 text-slate-900 px-3 py-2.5 shadow-[4px_4px_0_rgba(15,23,42,0.85)] rotate-[1.5deg]">
                  <p className="font-semibold mb-1">Tone</p>
                  <p className="leading-snug">
                    Late 90&apos;s / early 2000&apos;s sketchbook nostalgia
                    charged with modern myth.
                  </p>
                </div>

                <div className="rounded-xl border border-lime-300/70 bg-lime-100/95 text-slate-900 px-3 py-2.5 shadow-[4px_4px_0_rgba(15,23,42,0.85)] md:block hidden">
                  <p className="font-semibold mb-1">Universe</p>
                  <p className="leading-snug">
                    Ryderz, Board, Anderzone, Paranormal Activity Division, and
                    future graphic branches.
                  </p>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-1 rounded-3xl bg-[conic-gradient(from_140deg,rgba(190,242,100,0.7),rgba(56,189,248,0.6),rgba(244,114,182,0.7),rgba(190,242,100,0.7))] blur-xl opacity-70" />

              <div className="relative rounded-3xl border border-slate-300/40 bg-slate-950/90 shadow-[0_0_40px_rgba(15,23,42,0.9)] px-4 py-4 md:px-5 md:py-5">
                <div className="absolute -top-2 left-6 w-10 h-3 bg-yellow-200/90 rotate-[-7deg] shadow-[2px_2px_0_rgba(15,23,42,0.9)]" />
                <div className="absolute -top-1 right-7 w-7 h-3 bg-cyan-200/90 rotate-[9deg] shadow-[2px_2px_0_rgba(15,23,42,0.9)]" />
                <div className="absolute -bottom-2 left-10 w-8 h-3 bg-pink-200/90 rotate-[6deg] shadow-[2px_2px_0_rgba(15,23,42,0.9)]" />

                <div className="border-2 border-slate-400/70 border-dashed rounded-2xl p-3 md:p-4 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-slate-300 mb-2">
                    Development Board // Comic Lab
                  </p>

                  <div className="grid grid-rows-3 gap-2 h-64 md:h-72">
                    <div className="border border-lime-300/80 rounded-lg bg-slate-900/80 flex items-center justify-center text-center px-3 text-[10px] text-lime-200/90">
                      Cover art, splash pages, and visual mythology live here.
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="border border-cyan-300/70 rounded-lg bg-slate-900/75 flex items-center justify-center text-center px-3 text-[10px] text-cyan-100/90">
                        Character sheets
                      </div>

                      <div className="border border-pink-400/70 rounded-lg bg-slate-900/75 flex items-center justify-center text-center px-3 text-[10px] text-pink-100/90">
                        Expression studies
                      </div>
                    </div>

                    <div className="border border-yellow-300/80 rounded-lg bg-slate-900/80 flex items-center justify-center text-center px-3 text-[10px] text-yellow-100/90">
                      Ryderz adaptations, paranormal one-shots, and JAB visual
                      universe previews.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

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
                  JAB Visions™
                </span>
                . It&apos;s where ideas start as doodles on looseleaf, marker
                thumbnails on the train, or storyboard frames that turn into
                entire character arcs.
              </p>

              <p className="text-xs md:text-sm text-slate-100/80 mb-3">
                The imprint leans into{" "}
                <span className="font-semibold text-pink-300">
                  drawing-board nostalgia
                </span>
                : sticker-bombed sketchbooks, photocopied zines, taped-up
                character sheets, supernatural school drama, street-level
                fantasy, and glowing visual lore.
              </p>

              <p className="text-xs md:text-sm text-slate-100/80">
                This page will continue expanding with{" "}
                <span className="font-semibold text-cyan-300">
                  comic artwork, graphic novellas, mini comics, sketch
                  collections, character studies,
                </span>{" "}
                and future visual releases connected to the wider JAB Visions™
                ecosystem.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 mb-1">
                <h3 className="text-sm font-semibold">
                  Development Vault <span className="text-lime-300">/ /</span>
                </h3>

                <span className="text-[10px] px-2 py-1 rounded-full border border-lime-300/70 text-lime-200 bg-lime-300/10">
                  Updating
                </span>
              </div>

              <div className="grid gap-2">
                {developmentVault.map((item) => (
                  <div
                    key={item}
                    className="rounded-xl border border-slate-600/60 bg-slate-950/90 px-4 py-3 text-[11px] md:text-xs text-slate-100/85 shadow-[3px_3px_0_rgba(15,23,42,0.9)]"
                  >
                    <span className="text-lime-300">✦</span> {item}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mb-14">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="text-sm md:text-base font-semibold">
                Upcoming Comic Concepts
                <span className="text-lime-300">_</span>
              </h2>

              <span className="text-[10px] px-2 py-1 rounded-full border border-lime-300/70 text-lime-200 bg-lime-300/10">
                In development
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-lime-300/70 bg-slate-950/90 p-4 shadow-[4px_4px_0_rgba(190,242,100,0.8)]">
                <p className="text-[10px] uppercase tracking-[0.22em] text-lime-300 mb-1">
                  Graphic One-Shot
                </p>

                <h4 className="text-sm md:text-base font-semibold mb-1">
                  Those Ryderz: Origin Sketchbook
                </h4>

                <p className="text-[11px] md:text-xs text-slate-100/85">
                  Character designs, aura studies, power visuals, and storyboard
                  slices from the early development of the Ryderz universe.
                </p>
              </div>

              <div className="rounded-2xl border border-cyan-300/70 bg-slate-950/90 p-4 shadow-[4px_4px_0_rgba(56,189,248,0.7)]">
                <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-300 mb-1">
                  Mini Series // Concept
                </p>

                <h4 className="text-sm md:text-base font-semibold mb-1">
                  Kid Paranormal &amp; Paranormal.Activity.Division
                </h4>

                <p className="text-[11px] md:text-xs text-slate-100/85">
                  A visual story concept following reality-bending tools,
                  strange school corridors, and paranormal logic that keeps the
                  universe taped together.
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
                  Short comics and visual experiments from the JAB Visions™
                  world: Ryderz-adjacent stories, paranormal mythology, and
                  original stand-alone pieces.
                </p>
              </div>
            </div>
          </section>

          <section className="mb-14">
            <div className="flex items-center justify-between gap-4 mb-3">
              <h2 className="text-sm md:text-base font-semibold">
                Featured Artwork / Sketch Wall
                <span className="text-lime-300">_</span>
              </h2>

              <span className="text-[10px] px-2 py-1 rounded-full border border-slate-500/70 text-slate-300 bg-slate-900/60">
                Original artwork by John Andy
              </span>
            </div>

            <p className="text-xs md:text-sm text-slate-100/80 mb-4 max-w-2xl">
              Selected pieces from the{" "}
              <span className="font-semibold text-lime-300">JAB Comics</span>{" "}
              sketch archive: Procreate studies, cover explorations, character
              experiments, and visual mythology frames that live between
              storyboards and finished comic pages.
            </p>

            <div className="grid gap-4 md:gap-6 md:grid-cols-3">
              {artwork.map((piece) => (
                <div
                  className={`relative group ${piece.wide ? "md:col-span-2" : ""}`}
                  key={piece.src}
                >
                  <div className="absolute -inset-1 rounded-2xl bg-[conic-gradient(from_160deg,rgba(190,242,100,0.6),rgba(56,189,248,0.6),rgba(244,114,182,0.6),rgba(190,242,100,0.6))] blur-xl opacity-40 group-hover:opacity-80 transition" />

                  <div className="relative rounded-2xl overflow-hidden border border-slate-400/70 bg-slate-950 shadow-[4px_4px_0_rgba(15,23,42,0.9)]">
                    <div className={piece.wide ? "aspect-[4/3] bg-black" : "aspect-[3/4]"}>
                      <Image
                        src={piece.src}
                        alt={piece.alt}
                        width={600}
                        height={800}
                        className={`h-full w-full ${
                          piece.wide ? "object-contain" : "object-cover"
                        }`}
                        unoptimized
                      />
                    </div>

                    <div className="border-t border-slate-700/70 bg-slate-950/90 px-3 py-3">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-lime-300 mb-1">
                        {piece.label}
                      </p>

                      <h3 className="text-xs md:text-sm font-semibold text-slate-50 mb-1">
                        {piece.title}
                      </h3>

                      <p className="text-[11px] text-slate-100/85">
                        {piece.description}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-14">
            <div className="rounded-3xl border border-cyan-300/40 bg-slate-950/85 p-5 md:p-6 shadow-[0_0_30px_rgba(56,189,248,0.25)]">
              <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-300 mb-2">
                Connected Universe
              </p>

              <h2 className="text-lg md:text-2xl font-semibold mb-3">
                From film frames to comic panels.
              </h2>

              <p className="text-xs md:text-sm text-slate-100/80 max-w-3xl mb-4">
                JAB Comics is not separate from the film, app, and story worlds.
                It is another doorway. Those Ryderz can become graphic action
                pages. Board can become interface mythology. Paranormal Activity
                Division can expand into case files. Anderzone can fracture into
                surreal panels. The comics page is where the universe gets drawn
                before it fully arrives.
              </p>

              <div className="grid gap-3 md:grid-cols-4 text-[11px] md:text-xs">
                <div className="rounded-xl border border-pink-400/50 bg-pink-500/10 px-3 py-3 text-pink-100">
                  THOSE RYDERZ graphic lore
                </div>

                <div className="rounded-xl border border-lime-300/50 bg-lime-300/10 px-3 py-3 text-lime-100">
                  Kid Paranormal visual files
                </div>

                <div className="rounded-xl border border-cyan-300/50 bg-cyan-300/10 px-3 py-3 text-cyan-100">
                  Board / OS-style comic concepts
                </div>

                <div className="rounded-xl border border-yellow-300/50 bg-yellow-300/10 px-3 py-3 text-yellow-100">
                  Future JAB Comics sampler drops
                </div>
              </div>
            </div>
          </section>

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
                    comic artist, storyboarder, illustrator, letterer, designer,
                    or writer
                  </span>{" "}
                  who wants to help build stylized worlds, you&apos;re invited
                  to plug into the JAB Visions™ ecosystem.
                </p>

                <p className="text-xs md:text-sm text-slate-100/80 mb-4">
                  Start by joining the main{" "}
                  <span className="font-semibold text-emerald-300">
                    JAB Visions database
                  </span>{" "}
                  and note your interest in comics, illustration, storyboarding,
                  or visual development.
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
                    href="mailto:support@jabvisions.com"
                    className="underline underline-offset-4 text-cyan-300 hover:text-cyan-100"
                  >
                    support@jabvisions.com
                  </a>
                  <br />
                  Subject line:{" "}
                  <span className="italic text-lime-300">
                    &quot;JAB Comics Inquiry&quot;
                  </span>
                </p>

                <p className="text-[11px] md:text-xs text-slate-400/90">
                  Please include links to your portfolio, socials, sample pages,
                  or sketches if you have them. Rough concepts are welcome. This
                  is a drawing-board space first.
                </p>
              </div>
            </div>
          </section>

          <section className="border-t border-slate-700/70 pt-6 mt-6">
            <p className="text-[11px] md:text-xs text-slate-400/90">
              JAB Comics is an imprint of JAB Visions™: building a{" "}
              <span className="text-lime-300">visual universe</span> that lives
              across film, pages, apps, music, and everything in between.
            </p>
          </section>
        </div>
      </main>
    </>
  );
}
