'use client';

import React, { useRef, useState } from 'react';

const SIGNNOW_URL = 'https://signnow.com/s/M1MdKxRK';
const FORM_ENDPOINT =
  'https://script.google.com/macros/s/AKfycbyzHY-4g8pIKhIWjAH0pDe4ABG42_-DycBk-2pzNe97jHnMokRsuOc3IE7fR6Ff11OT/exec';

type FormState = {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  castOrCrew: 'Cast' | 'Crew' | '';
  emergencyName: string;
  emergencyPhone: string;
  availability: string;
  links: string;
  notes: string;
  company?: string; // honeypot
};

export default function JoinUsPage() {
  const [form, setForm] = useState<FormState>({
    fullName: '',
    email: '',
    phone: '',
    location: '',
    castOrCrew: '',
    emergencyName: '',
    emergencyPhone: '',
    availability: '',
    links: '',
    notes: '',
    company: '',
  });
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const onChange =
    (key: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm((s) => ({ ...s, [key]: e.target.value }));
    };

  const onIframeLoad = () => {
    setResult({ ok: true, message: 'Thanks! Your registration was sent.' });
    setForm({
      fullName: '',
      email: '',
      phone: '',
      location: '',
      castOrCrew: '',
      emergencyName: '',
      emergencyPhone: '',
      availability: '',
      links: '',
      notes: '',
      company: '',
    });
    if (fileRef.current) fileRef.current.value = '';
  };

  function onSubmit(e: React.FormEvent) {
    // Require headshot for Cast
    if (form.castOrCrew === 'Cast' && (!fileRef.current?.files || fileRef.current.files.length === 0)) {
      e.preventDefault();
      setResult({ ok: false, message: 'A current headshot is required for talent. Please upload your headshot.' });
      return;
    }
    // Max size 10MB
    const f = fileRef.current?.files?.[0];
    if (f && f.size > 10 * 1024 * 1024) {
      e.preventDefault();
      setResult({ ok: false, message: 'Headshot is too large (>10MB).' });
      return;
    }
    setResult({ ok: true, message: 'Submitting…' });
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-emerald-200">
      {/* Hidden iframe to keep the page in place after submit */}
      <iframe name="hidden_iframe" onLoad={onIframeLoad} className="hidden" title="hidden_iframe" />

      <section className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-emerald-200 drop-shadow-[0_0_12px_rgba(16,185,129,0.65)]">
          Join Us
        </h1>
        <p className="mt-3 text-emerald-300/80">
          Be part of <span className="font-semibold text-emerald-200">Those Ryderz</span> and future JAB Visions productions.
          Please sign the release below and complete the registration form.
        </p>

        {/* Release */}
        <div className="mt-8 rounded-2xl border border-emerald-500/20 bg-emerald-400/5 p-5 backdrop-blur-sm">
          <h2 className="text-xl font-semibold text-emerald-200">General Talent Release</h2>
          <p className="mt-2 text-sm text-emerald-300/80">
            Our talent release now includes a <span className="font-medium text-emerald-200">confidentiality clause</span>.
          </p>
          <div className="mt-4">
            <a
              href={SIGNNOW_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-2xl px-4 py-2 text-sm font-semibold
                         ring-1 ring-emerald-500/30 hover:ring-emerald-400/50
                         bg-emerald-400/10 hover:bg-emerald-400/15 transition"
            >
              Sign the General Talent Release (with Confidentiality Clause)
            </a>
          </div>
          <p className="mt-3 text-xs text-emerald-300/70">After signing, return here to submit your registration details.</p>
        </div>

        {/* Native HTML form posts directly to Apps Script */}
        <form
          action={FORM_ENDPOINT}
          method="POST"
          encType="multipart/form-data"
          target="hidden_iframe"
          onSubmit={onSubmit}
          className="mt-10 space-y-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input name="FullName" label="Full Name" value={form.fullName} onChange={onChange('fullName')} required placeholder="First Last" />
            <Input name="Email" label="Email" type="email" value={form.email} onChange={onChange('email')} required placeholder="name@example.com" />
            <Input name="Phone" label="Phone" type="tel" value={form.phone} onChange={onChange('phone')} required placeholder="(555) 555-5555" />
            <Input name="Location" label="City / State" value={form.location} onChange={onChange('location')} placeholder="New York, NY" />
          </div>

          <div>
            <label className="block text-sm mb-1">Are you applying for Cast or Crew?</label>
            <select
              name="CastOrCrew"
              value={form.castOrCrew}
              onChange={onChange('castOrCrew')}
              required
              className="w-full rounded-xl bg-neutral-900/70 border border-emerald-500/20 px-3 py-2 outline-none
                         focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/30 text-emerald-100"
            >
              <option value="" disabled>Select one</option>
              <option value="Cast">Cast</option>
              <option value="Crew">Crew</option>
            </select>
          </div>

          {/* Emergency (optional) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input name="EmergencyContactName" label="Emergency Contact – Name (optional)" value={form.emergencyName} onChange={onChange('emergencyName')} />
            <Input name="EmergencyContactPhone" label="Emergency Contact – Phone (optional)" type="tel" value={form.emergencyPhone} onChange={onChange('emergencyPhone')} />
          </div>

          <Textarea name="Availability" label="Availability (dates/times)" value={form.availability} onChange={onChange('availability')} placeholder="e.g., Weeknights after 6pm; weekends; blackout dates" />
          <Input name="Links" label="Links (website, Instagram, portfolio, reels)" value={form.links} onChange={onChange('links')} placeholder="https://..., @handle" />

          {/* Headshot (required for Cast) */}
          <div>
            <label className="block text-sm mb-1">Headshot</label>
            <input
              ref={fileRef}
              name="HeadshotFile"
              type="file"
              accept="image/*"
              className="w-full rounded-xl bg-neutral-900/70 border border-emerald-500/20 px-3 py-2 outline-none
                         focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/30 text-emerald-100"
            />
            <p className="mt-1 text-xs text-emerald-300/80">
              <span className="font-medium text-emerald-200">Talent note:</span> A current, professional headshot is required for casting (Cast applicants). JPG/PNG/WEBP/HEIC, up to 10MB.
            </p>
          </div>

          <Textarea name="Notes" label="Notes" value={form.notes} onChange={onChange('notes')} placeholder="Anything else we should know?" />

          {/* Honeypot */}
          <div className="hidden"><input name="company" value={form.company} onChange={onChange('company')} readOnly /></div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="inline-flex items-center rounded-2xl px-4 py-2 text-sm font-semibold
                         ring-1 ring-emerald-500/30 hover:ring-emerald-400/50
                         bg-emerald-400/10 hover:bg-emerald-400/15 transition"
            >
              Submit Registration
            </button>
            <span className="text-xs text-emerald-300/70">Please sign the release above prior to or right after submitting this form.</span>
          </div>

          {result && (
            <p className={`text-sm ${result.ok ? 'text-emerald-300' : 'text-red-300'}`}>{result.message}</p>
          )}
        </form>
      </section>
    </main>
  );
}

/* --- UI helpers --- */
function Input({
  name, label, value, onChange, type = 'text', required = false, placeholder = ''
}: {
  name: string; label: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string; required?: boolean; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm mb-1">{label}</label>
      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        className="w-full rounded-xl bg-neutral-900/70 border border-emerald-500/20 px-3 py-2 outline-none
                   focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/30
                   placeholder:text-emerald-300/40 text-emerald-100"
        placeholder={placeholder}
      />
    </div>
  );
}

function Textarea({
  name, label, value, onChange, rows = 3, placeholder = ''
}: {
  name: string; label: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  rows?: number; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm mb-1">{label}</label>
      <textarea
        name={name}
        value={value}
        onChange={onChange}
        rows={rows}
        className="w-full rounded-xl bg-neutral-900/70 border border-emerald-500/20 px-3 py-2 outline-none
                   focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/30
                   placeholder:text-emerald-300/40 text-emerald-100"
        placeholder={placeholder}
      />
    </div>
  );
}
