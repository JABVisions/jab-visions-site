// app/join-us/page.tsx
'use client';

import React, { useState } from 'react';
import Navbar from '../../components/Navbar';

const JoinUsPage: React.FC = () => {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('submitting');

    const form = e.currentTarget;
    const fd = new FormData(form);

    // Optional: 10MB cap for headshots
    const file = fd.get('HeadshotFile') as File | null;
    if (file && file.size > 10 * 1024 * 1024) {
      alert('Headshot file must be 10MB or less.');
      setStatus('idle');
      return;
    }

    try {
      const res = await fetch('/api/submit', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || (data && data.ok === false)) {
        throw new Error(data?.message || `HTTP ${res.status}`);
      }
      setStatus('success');
      form.reset();
      alert('Thanks! Your registration was submitted.');
    } catch (err) {
      console.error(err);
      setStatus('error');
      alert('There was a problem submitting the form. Please try again.');
    }
  }

  const inputCls =
    'w-full rounded-xl border border-emerald-500/25 bg-neutral-900 text-emerald-100 px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500/50';
  const labelCls = 'block text-sm mb-1 text-emerald-300/90';

  return (
    <>
      {/* Navbar (includes the JAB banner above it) */}
      <Navbar />

      <main className="min-h-screen bg-black text-emerald-200 px-4 pt-8 pb-10">
        <div className="mx-auto w-full max-w-4xl">
          {/* Glitch neon title */}
          <h1 className="glitch text-5xl font-extrabold tracking-tight mb-2" data-text="Join Us">
            Join Us
          </h1>
          <p className="text-emerald-300/80 mb-8">
            Be part of <span className="font-semibold text-emerald-200">Those Ryderz</span> and future JAB Visions productions.
            Please sign the release below and complete the registration form.
          </p>

          {/* General Talent Release – highlighted card */}
          <section className="rounded-2xl border border-emerald-500/20 bg-emerald-900/[0.07] p-5 shadow-[0_0_40px_-15px_rgba(16,185,129,0.5)] mb-8">
            <h2 className="text-xl font-semibold text-emerald-200 mb-1">General Talent Release</h2>

            {/* Indicator (brand cyan + soft glow) */}
            <p className="text-xs md:text-sm text-cyan-300/95 mb-2 note-cyan">
              <span className="font-semibold uppercase tracking-wide">Note:</span>{' '}
              This online Talent Release is intended <span className="font-semibold">only for Extras and designated Production Assistants (PAs)</span>.
              Principal/featured talent, department heads, and vendors will receive separate agreements.
            </p>

            <p className="text-emerald-300/80 mb-4">Our talent release now includes a confidentiality clause.</p>
            <a
              href="https://signnow.com/s/t7rt43y5"
              target="_blank"
              rel="noreferrer"
              className="inline-block rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100 px-5 py-2 border border-emerald-400/40 transition"
            >
              Sign the General Talent Release (with Confidentiality Clause)
            </a>
            <p className="text-xs text-emerald-300/60 mt-2">
              After signing, return here to submit your registration details.{' '}
              <span className="text-cyan-300/95 font-medium note-cyan">
                Only Extras & select PAs should sign this online release.
              </span>
            </p>
          </section>

          {/* FORM */}
          <form onSubmit={handleSubmit} encType="multipart/form-data" className="space-y-6">
            {/* Row 1 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="FullName" className={labelCls}>Full Name</label>
                <input id="FullName" name="FullName" type="text" required placeholder="First Last" className={inputCls} />
              </div>
              <div>
                <label htmlFor="Email" className={labelCls}>Email</label>
                <input id="Email" name="Email" type="email" required placeholder="name@example.com" className={inputCls} />
              </div>
            </div>

            {/* Row 2 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="Phone" className={labelCls}>Phone</label>
                <input id="Phone" name="Phone" type="tel" required placeholder="(555) 555-5555" className={inputCls} />
              </div>
              <div>
                <label htmlFor="Location" className={labelCls}>City / State</label>
                <input id="Location" name="Location" type="text" required placeholder="New York, NY" className={inputCls} />
              </div>
            </div>

            {/* Cast or Crew */}
            <div>
              <label htmlFor="CastOrCrew" className={labelCls}>Are you applying for Cast or Crew?</label>
              <select id="CastOrCrew" name="CastOrCrew" required defaultValue="" className={inputCls}>
                <option value="" disabled>Select one</option>
                <option value="Cast">Cast</option>
                <option value="Crew">Crew</option>
                <option value="Both">Both</option>
              </select>
            </div>

            {/* Role — required for both */}
            <div>
              <label htmlFor="Role" className={labelCls}>
                Role <span className="text-emerald-400">*</span>
              </label>
              <input
                id="Role"
                name="Role"
                type="text"
                required
                aria-required="true"
                aria-describedby="roleHelp"
                placeholder="e.g., Zoe (Cast), Assistant Director (Crew), or Extras"
                className={inputCls}
                onInvalid={(e) =>
                  (e.currentTarget as HTMLInputElement).setCustomValidity(
                    'Role is required. Please specify your intended position (e.g., Zoe, Assistant Director, Extras).'
                  )
                }
                onInput={(e) => (e.currentTarget as HTMLInputElement).setCustomValidity('')}
              />
              <p id="roleHelp" className="text-xs text-emerald-300/70 mt-1">
                Role is <strong>required</strong>. Examples: Zoe (Cast), Assistant Director (Crew), Extras.
              </p>
            </div>

            {/* Emergency contacts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="EmergencyContactName" className={labelCls}>Emergency Contact – Name (optional)</label>
                <input id="EmergencyContactName" name="EmergencyContactName" type="text" className={inputCls} />
              </div>
              <div>
                <label htmlFor="EmergencyContactPhone" className={labelCls}>Emergency Contact – Phone (optional)</label>
                <input id="EmergencyContactPhone" name="EmergencyContactPhone" type="tel" className={inputCls} />
              </div>
            </div>

            {/* Links */}
            <div>
              <label htmlFor="Links" className={labelCls}>Links (website, Instagram, portfolio, reels)</label>
              <input id="Links" name="Links" type="text" placeholder="https://…, @handle" className={inputCls} />
            </div>

            {/* Headshot + maintenance note */}
            <div>
              <label htmlFor="HeadshotFile" className={labelCls}>Headshot</label>

              {/* Maintenance note (now cyan with glow) */}
              <p className="text-xs text-cyan-300/95 note-cyan mb-2">
                Headshot file upload is <strong>currently down for maintenance</strong>. Please submit the form without a file and either
                paste a link in the “Links” field above or email your headshot to{' '}
                <a href="mailto:JohnAndyBooks@gmail.com" className="underline">JohnAndyBooks@gmail.com</a>.
              </p>

              <input
                id="HeadshotFile"
                name="HeadshotFile"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                className="w-full text-sm"
              />
              <p className="text-xs text-emerald-300/70 mt-2">
                Talent note: A current, professional headshot is required for casting (Cast applicants).
                JPG/PNG/WEBP/HEIC, up to 10MB.
              </p>
            </div>

            {/* Availability */}
            <div>
              <label htmlFor="Availability" className={labelCls}>Availability (dates/times)</label>
              <textarea
                id="Availability"
                name="Availability"
                rows={3}
                placeholder="e.g., Weeknights after 6pm; weekends; blackout dates"
                className={inputCls}
              />
            </div>

            {/* Notes */}
            <div>
              <label htmlFor="Notes" className={labelCls}>Notes</label>
              <textarea id="Notes" name="Notes" rows={3} placeholder="Anything else you should know?" className={inputCls} />
            </div>

            {/* Submit bar with right caption */}
            <div className="pt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <button
                type="submit"
                disabled={status === 'submitting'}
                className="rounded-full bg-emerald-500/90 hover:bg-emerald-400 text-black font-semibold px-6 py-2 transition disabled:opacity-60"
              >
                {status === 'submitting' ? 'Submitting…' : 'Submit Registration'}
              </button>
              <span className="text-xs text-emerald-300/70">
                Please sign the release above prior to or right after submitting this form.
              </span>
            </div>
          </form>
        </div>

        {/* Glitch/neon styles */}
        <style jsx>{`
          .glitch {
            position: relative;
            color: #d1fae5;
            text-shadow: 0 0 12px rgba(16,185,129,.8), 0 0 36px rgba(16,185,129,.4);
            animation: flicker 3.2s infinite;
          }
          .glitch::before, .glitch::after {
            content: attr(data-text);
            position: absolute; inset: 0;
            mix-blend-mode: screen; opacity: .9;
          }
          .glitch::before {
            transform: translateX(-1px);
            color: rgba(16,185,129,.9);
            text-shadow: -2px 0 rgba(52,211,153,.6);
            animation: g1 2s infinite linear alternate-reverse;
          }
          .glitch::after {
            transform: translateX(1px);
            color: rgba(110,231,183,.9);
            text-shadow: 2px 0 rgba(16,185,129,.6);
            animation: g2 1.7s infinite linear alternate-reverse;
          }

          /* Soft neon-cyan glow for indicator + headshot note */
          .note-cyan {
            text-shadow:
              0 0 8px rgba(34, 211, 238, 0.35),
              0 0 18px rgba(34, 211, 238, 0.20);
          }

          @keyframes flicker { 0%,19%,21%,23%,80%,100%{opacity:1} 20%,22%,24%{opacity:.92} 81%,83%{opacity:.96} }
          @keyframes g1 { 0%{clip-path:inset(0 0 0 0)} 33%{clip-path:inset(2% 0 0 0)} 66%{clip-path:inset(0 0 3% 0)} 100%{clip-path:inset(1% 0 1% 0)} }
          @keyframes g2 { 0%{clip-path:inset(0 0 0 0)} 25%{clip-path:inset(1% 0 2% 0)} 50%{clip-path:inset(0 0 1% 0)} 100%{clip-path:inset(2% 0 0 0)} }
        `}</style>
      </main>
    </>
  );
};

export default JoinUsPage;
