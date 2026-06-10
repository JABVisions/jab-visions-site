"use client";

import React, { useState, FormEvent } from "react";
import Link from "next/link";
type Status = "idle" | "submitting" | "success" | "error";

function formValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function joinLines(...parts: string[]) {
  return parts.filter(Boolean).join("\n");
}

function buildGoogleSheetsPayload(formData: FormData) {
  const fullName = formValue(formData, "Full Name");
  const email = formValue(formData, "Email");
  const phone = formValue(formData, "Phone");
  const dateOfBirth = formValue(formData, "Date of Birth");
  const location = formValue(formData, "City / State");
  const castOrCrew = formValue(formData, "Cast or Crew?");
  const role = formValue(formData, "Desired Role / Position");
  const emergencyName = formValue(formData, "Emergency Contact Name");
  const emergencyPhone = formValue(formData, "Emergency Contact Phone");
  const instagram = formValue(formData, "Instagram");
  const website = formValue(formData, "Website / Reel");
  const experience = formValue(formData, "Experience");
  const notes = formValue(formData, "Additional Notes");
  const emergencyRelationship = formValue(formData, "Emergency Contact Relationship");
  const boardCompany = formValue(formData, "BoardCompany");

  const availability = joinLines(
    experience ? `Experience: ${experience}` : "",
    notes ? `Notes / Availability: ${notes}` : "",
    emergencyRelationship
      ? `Emergency Relationship: ${emergencyRelationship}`
      : ""
  );
  const links = joinLines(
    instagram ? `Instagram: ${instagram}` : "",
    website ? `Website / Reel: ${website}` : ""
  );

  return {
    FullName: fullName,
    Email: email,
    Phone: phone,
    DateOfBirth: dateOfBirth,
    Location: location,
    CastOrCrew: castOrCrew,
    Role: role,
    EmergencyContactName: emergencyName,
    EmergencyContactPhone: emergencyPhone,
    Availability: availability,
    Links: links,
    BoardCompany: boardCompany,
  };
}

export default function JoinUs() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("submitting");
    setError(null);

    const form = e.currentTarget;
    const formData = new FormData(form);
    const payload = buildGoogleSheetsPayload(formData);

    try {
      console.log("[JoinUs] POST /api/join-us payload", payload);

      const res = await fetch("/api/join-us", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json().catch(() => null);

      console.log("[JoinUs] /api/join-us response", {
        ok: res.ok,
        status: res.status,
        result,
      });

      if (!res.ok) {
        throw new Error(
          result?.message || "Submission failed. Please check the required fields and try again."
        );
      }

      setStatus("success");
      form.reset();
    } catch (err) {
      console.error("[JoinUs] submission failed", err);
      setStatus("error");
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again or email JohnAndyBooks@gmail.com."
      );
    }
  };

  return (
    <>
      <main className="min-h-screen bg-black text-emerald-100 relative overflow-hidden">
        {/* MATRIX GRID BACKGROUND */}
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, #22c55e 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/70 via-emerald-950/30 to-black/90" />

        {/* CONTENT */}
        {/* ✅ pt-24 keeps content safely below the fixed navbar */}
        <div className="relative max-w-6xl mx-auto px-4 pt-24 pb-16">
          {/* HEADER */}
          <header className="mb-8">
            <p className="text-xs tracking-[0.35em] uppercase text-emerald-400 mb-2">
              JAB VISIONS // ACCESS PORTAL
            </p>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight mb-3">
              Join Us<span className="text-emerald-400">_</span>
            </h1>
            <p className="text-sm md:text-base text-emerald-200/70 max-w-2xl">
              Plug into the{" "}
              <span className="text-emerald-400 font-semibold">JAB Visions</span>{" "}
              creative network. Register for{" "}
              <span className="text-emerald-300 font-semibold">cast</span>,{" "}
              <span className="text-emerald-300 font-semibold">crew</span>,{" "}
              <span className="text-emerald-300 font-semibold">music</span>, or{" "}
              <span className="text-emerald-300 font-semibold">visual art</span>{" "}
              collaboration on{" "}
              <span className="text-emerald-400 font-semibold">Those Ryderz</span>{" "}
              and future projects.
            </p>
          </header>

          {/* CYAN LINK TABS */}
          <nav className="mb-10">
            <div className="inline-flex rounded-full bg-zinc-950/70 border border-cyan-400/40 p-1 shadow-[0_0_25px_rgba(34,211,238,0.45)] backdrop-blur">
              <button className="px-4 md:px-5 py-1.5 text-xs md:text-sm rounded-full bg-cyan-400 text-black font-semibold shadow-[0_0_20px_rgba(34,211,238,0.9)]">
                Registration Form
              </button>
              <a
                href="https://signnow.com/s/t7rt43y5"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 md:px-5 py-1.5 text-xs md:text-sm rounded-full text-cyan-200 hover:text-cyan-50 hover:bg-cyan-500/20 transition"
              >
                Talent Release
              </a>
              <button
                disabled
                className="px-4 md:px-5 py-1.5 text-xs md:text-sm rounded-full text-cyan-200/50 cursor-not-allowed"
              >
                NDA (coming soon)
              </button>
            </div>
          </nav>

          <div className="mb-8 rounded-2xl border border-yellow-300/70 bg-yellow-300/10 p-4 text-yellow-50 shadow-[0_0_24px_rgba(250,204,21,0.25)]">
            <p className="text-[11px] uppercase tracking-[0.22em] text-yellow-200 mb-2">
              Registration Notice · Updated May 23 at 5:23 PM
            </p>
            <p className="text-xs md:text-sm leading-relaxed text-yellow-50/90">
              If you submitted a cast or crew registration any time since
              September and have not received a response, please resubmit your
              information. A technical issue may have prevented some form
              details from saving correctly.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-[2fr,1fr] items-start">
            {/* FORM CARD */}
            <section className="bg-zinc-950/80 rounded-2xl border border-emerald-500/40 p-6 md:p-8 shadow-[0_0_45px_rgba(16,185,129,0.35)] backdrop-blur">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg md:text-xl font-medium">
                  Access Request: <span className="text-emerald-400">Online</span>
                </h2>
                <span className="text-[10px] px-2 py-1 rounded-full border border-emerald-500/60 text-emerald-300/90 bg-emerald-500/5">
                  FORM ID: JR-2024
                </span>
              </div>

              <form action="/api/join-us" method="post" onSubmit={handleSubmit} className="space-y-6">
                <div
                  className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden"
                  aria-hidden="true"
                >
                  <label htmlFor="board-company">Company</label>
                  <input
                    id="board-company"
                    name="BoardCompany"
                    tabIndex={-1}
                    autoComplete="off"
                  />
                </div>

                {/* BASIC INFO */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs mb-1" htmlFor="full-name">
                      Full Name *
                    </label>
                    <input
                      id="full-name"
                      name="Full Name"
                      required
                      className="w-full rounded-lg bg-black/60 border border-emerald-600/50 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/60"
                    />
                  </div>

                  <div>
                    <label className="block text-xs mb-1" htmlFor="email">
                      Email *
                    </label>
                    <input
                      id="email"
                      name="Email"
                      type="email"
                      required
                      className="w-full rounded-lg bg-black/60 border border-emerald-600/50 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/60"
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs mb-1" htmlFor="phone">
                      Phone Number *
                    </label>
                    <input
                      id="phone"
                      name="Phone"
                      required
                      className="w-full rounded-lg bg-black/60 border border-emerald-600/50 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/60"
                    />
                  </div>

                  <div>
                    <label className="block text-xs mb-1" htmlFor="dob">
                      Date of Birth
                    </label>
                    <input
                      id="dob"
                      name="Date of Birth"
                      type="date"
                      className="w-full rounded-lg bg-black/60 border border-emerald-600/50 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/60"
                    />
                  </div>

                  <div>
                    <label className="block text-xs mb-1" htmlFor="city-state">
                      City / State
                    </label>
                    <input
                      id="city-state"
                      name="City / State"
                      className="w-full rounded-lg bg-black/60 border border-emerald-600/50 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/60"
                    />
                  </div>
                </div>

                {/* CAST OR CREW + POSITION */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs mb-1" htmlFor="cast-or-crew">
                      Cast or Crew? *
                    </label>
                    <select
                      id="cast-or-crew"
                      name="Cast or Crew?"
                      required
                      className="w-full rounded-lg bg-black/60 border border-emerald-600/50 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/60"
                    >
                      <option value="">Select one</option>
                      <option value="Cast">Cast</option>
                      <option value="Crew">Crew</option>
                      <option value="Either">Either / Open to both</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs mb-1" htmlFor="position">
                      Desired Role / Position *
                    </label>
                    <input
                      id="position"
                      name="Desired Role / Position"
                      required
                      className="w-full rounded-lg bg-black/60 border border-emerald-600/50 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/60"
                      placeholder="Example: Actor, PA, DP, Producer, Vocalist, Graphic Designer, Illustrator, etc."
                    />
                  </div>
                </div>

                {/* SOCIALS */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs mb-1" htmlFor="instagram">
                      Instagram Handle
                    </label>
                    <input
                      id="instagram"
                      name="Instagram"
                      className="w-full rounded-lg bg-black/60 border border-emerald-600/50 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/60"
                      placeholder="@username"
                    />
                  </div>

                  <div>
                    <label className="block text-xs mb-1" htmlFor="website">
                      Website / Reel / Portfolio
                    </label>
                    <input
                      id="website"
                      name="Website / Reel"
                      className="w-full rounded-lg bg-black/60 border border-emerald-600/50 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/60"
                      placeholder="Reel, portfolio, music links, or samples (optional)"
                    />
                  </div>
                </div>

                {/* EXPERIENCE */}
                <div>
                  <label className="block text-xs mb-1" htmlFor="experience">
                    Briefly describe your experience
                  </label>
                  <textarea
                    id="experience"
                    name="Experience"
                    rows={4}
                    className="w-full rounded-lg bg-black/60 border border-emerald-600/50 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/60"
                    placeholder="Credits, skills, tools, genres, collaborations, training, etc."
                  />
                </div>

                {/* EMERGENCY CONTACT */}
                <div className="pt-3 border-t border-emerald-800/50">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-400 mb-3">
                    Emergency Contact
                  </p>

                  <div className="grid md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs mb-1" htmlFor="emergency-name">
                        Name *
                      </label>
                      <input
                        id="emergency-name"
                        name="Emergency Contact Name"
                        required
                        className="w-full rounded-lg bg-black/60 border border-emerald-600/50 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/60"
                      />
                    </div>

                    <div>
                      <label className="block text-xs mb-1" htmlFor="emergency-phone">
                        Phone *
                      </label>
                      <input
                        id="emergency-phone"
                        name="Emergency Contact Phone"
                        required
                        className="w-full rounded-lg bg-black/60 border border-emerald-600/50 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/60"
                      />
                    </div>

                    <div>
                      <label className="block text-xs mb-1" htmlFor="emergency-relation">
                        Relationship
                      </label>
                      <input
                        id="emergency-relation"
                        name="Emergency Contact Relationship"
                        className="w-full rounded-lg bg-black/60 border border-emerald-600/50 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/60"
                      />
                    </div>
                  </div>
                </div>

                {/* NOTES */}
                <div>
                  <label className="block text-xs mb-1" htmlFor="notes">
                    Anything else we should know?
                  </label>
                  <textarea
                    id="notes"
                    name="Additional Notes"
                    rows={3}
                    className="w-full rounded-lg bg-black/60 border border-emerald-600/50 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/60"
                    placeholder="Availability, what you want to collaborate on, what you’re looking for, etc."
                  />
                </div>

                {/* STATUS + SUBMIT */}
                <div className="flex flex-col gap-3 pt-2">
                  {status === "success" && (
                    <p className="text-xs md:text-sm text-emerald-300">
                      ACCESS GRANTED: Your submission was received. We’ll be in touch if there’s a fit for current or future projects.
                    </p>
                  )}
                  {status === "error" && error && <p className="text-xs md:text-sm text-red-400">{error}</p>}

                  <button
                    type="submit"
                    disabled={status === "submitting"}
                    className="inline-flex items-center justify-center rounded-lg bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-black hover:bg-emerald-300 disabled:opacity-60 disabled:cursor-not-allowed transition shadow-[0_0_25px_rgba(52,211,153,0.7)]"
                  >
                    {status === "submitting" ? "// SENDING..." : "// SUBMIT REGISTRATION"}
                  </button>
                </div>
              </form>
            </section>

            {/* SIDE INFO CARD */}
            <aside className="space-y-4">
              <div className="bg-zinc-950/70 rounded-2xl border border-emerald-800/60 p-5 shadow-[0_0_25px_rgba(16,185,129,0.35)] backdrop-blur">
                <h3 className="text-sm font-semibold mb-2">
                  System Notes <span className="text-emerald-400">[Read]</span>
                </h3>
                <p className="text-xs text-emerald-100/80 mb-3">
                  JAB Visions is an independent studio based in NYC. By registering here, you’re joining our internal database for
                  casting, crew, music, and visual collaboration opportunities across{" "}
                  <span className="font-semibold text-emerald-300">Those Ryderz</span> and future projects.
                </p>

                <ul className="text-[11px] text-emerald-100/80 space-y-1.5 mb-4 list-disc list-inside">
                  <li>You must be 18+ or have a parent/guardian involved.</li>
                  <li>Some roles require in-person work in NYC; others may be remote.</li>
                  <li>
                    Compensation varies by project (stipend, deferred, or volunteer). Details are provided with each specific call.
                  </li>
                </ul>

                <a
                  href="https://signnow.com/s/t7rt43y5"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex text-[11px] font-semibold text-cyan-300 underline underline-offset-4 hover:text-cyan-100 transition"
                >
                  Open General Talent Release in SignNow
                </a>
              </div>

              <div className="bg-zinc-950/60 rounded-2xl border border-cyan-500/40 p-5 backdrop-blur shadow-[0_0_25px_rgba(34,211,238,0.45)]">
                <h3 className="text-sm font-semibold mb-2">
                  Contact <span className="text-cyan-300">/ /</span> Support
                </h3>
                <p className="text-xs text-emerald-100/80 mb-2">
                  For casting, crew, music, or collaboration questions, reach out directly:
                </p>
                <p className="text-xs text-emerald-50">
                  John Andy <br />
                  Writer / Director / Lead Actor – <span className="font-semibold">Those Ryderz</span>
                  <br />
                  JAB Visions
                  <br />
                  <a
                    href="mailto:JohnAndyBooks@gmail.com"
                    className="underline underline-offset-4 text-cyan-300 hover:text-cyan-100"
                  >
                    JohnAndyBooks@gmail.com
                  </a>
                </p>
              </div>
            </aside>
          </div>
        </div>
      </main>
    </>
  );
}
