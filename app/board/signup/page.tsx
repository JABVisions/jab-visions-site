"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/browser";

const MONTHS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

const AURA_COLORS = [
  { key: "sloth_pink", label: "Sleepy Pink", hex: "#FF4FD8", emblem: "■" },
  { key: "lust_blue", label: "Dreamy Blue", hex: "#2D7CFF", emblem: "■" },
  { key: "greed_black", label: "Selfish Black", hex: "#111111", emblem: "■" },
  { key: "pride_yellow", label: "Pride Yellow", hex: "#FFD12D", emblem: "■" },
  { key: "envy_red", label: "Really Red", hex: "#FF2D2D", emblem: "■" },
  { key: "gluttony_orange", label: "Juicy Orange", hex: "#FF7A1A", emblem: "■" },
  { key: "wrath_purple", label: "Royal Purple", hex: "#7A44FF", emblem: "■" },
  { key: "lilly_yellowgreen", label: "Nature Green", hex: "#B7FF2D", emblem: "■" },
];

const PROFILE_VIBES = [
  { key: "locked_in", emoji: "🎧", label: "Locked In" },
  { key: "joyful", emoji: "✨", label: "Joyful" },
  { key: "dreamy", emoji: "☁️", label: "Dreamy" },
  { key: "romantic", emoji: "💞", label: "Romantic" },
  { key: "mysterious", emoji: "🔮", label: "Mysterious" },
  { key: "chaotic", emoji: "🌀", label: "Chaotic" },
  { key: "sleepy", emoji: "🌙", label: "Sleepy" },
  { key: "grateful", emoji: "🤍", label: "Grateful" },
];

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function getAgeFromBirthDate(month: string, day: string, year: string) {
  const m = Number(month);
  const d = Number(day);
  const y = Number(year);
  if (!m || !d || !y) return null;

  const birthDate = new Date(y, m - 1, d);
  const isValidDate =
    birthDate.getFullYear() === y &&
    birthDate.getMonth() === m - 1 &&
    birthDate.getDate() === d;

  if (!isValidDate) return null;

  const today = new Date();
  let age = today.getFullYear() - y;
  const birthdayPassed =
    today.getMonth() > m - 1 || (today.getMonth() === m - 1 && today.getDate() >= d);
  if (!birthdayPassed) age -= 1;

  return age;
}

export default function BoardSignupPage() {
  const router = useRouter();
  const authAvailable = isSupabaseConfigured();

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState("Creator");
  const [boardGoal, setBoardGoal] = useState("");
  const [profileVibe, setProfileVibe] = useState("locked_in");
  const [signalColor, setSignalColor] = useState("sloth_pink");
  const [signalMenuOpen, setSignalMenuOpen] = useState(false);

  const [agree, setAgree] = useState(false);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const currentYear = new Date().getFullYear();
  const birthYears = Array.from({ length: 121 }, (_, index) => String(currentYear - index));
  const selectedSignalColor =
    AURA_COLORS.find((color) => color.key === signalColor) ?? AURA_COLORS[0];

  useEffect(() => {
    const confirmationError = new URLSearchParams(window.location.search).get("error");
    if (confirmationError) setErr(confirmationError);
  }, []);

  function validatePassword(pw: string) {
    if (pw.length < 8) return "Password must be at least 8 characters.";
    return null;
  }

  function cleanUsername(value: string) {
    return value.trim().toLowerCase().replace(/^@+/, "").replace(/[^a-z0-9_]/g, "").slice(0, 24);
  }

  async function onSignup(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);

    const nextFullName = fullName.trim().replace(/\s+/g, " ");
    const nextUsername = cleanUsername(username);
    const nextAge = getAgeFromBirthDate(birthMonth, birthDay, birthYear);
    const selectedSignal = AURA_COLORS.find((color) => color.key === signalColor) ?? AURA_COLORS[0];
    const selectedVibe = PROFILE_VIBES.find((vibeOption) => vibeOption.key === profileVibe) ?? PROFILE_VIBES[0];

    if (nextFullName.length < 2) {
      setErr("Please enter your full name.");
      return;
    }
    if (nextUsername.length < 3) {
      setErr("Choose a username with at least 3 letters, numbers, or underscores.");
      return;
    }
    if (nextAge === null || nextAge < 13 || nextAge > 120) {
      setErr("Board is 13+. Please enter a valid birth date.");
      return;
    }
    if (!agree) {
      setErr("Please confirm you agree to the Terms, Privacy Policy, and Guidelines.");
      return;
    }
    if (!email.trim() || !password) {
      setErr("Please enter your email and password.");
      return;
    }
    const pwErr = validatePassword(password);
    if (pwErr) {
      setErr(pwErr);
      return;
    }
    if (!authAvailable) {
      setErr(
        "Supabase is not connected. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local, then restart the development server."
      );
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/board/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          metadata: {
            onboarding: "v1",
            full_name: nextFullName,
            display_name: nextFullName,
            name: nextFullName,
            username: nextUsername,
            age: nextAge,
            birth_month: Number(birthMonth),
            birth_day: Number(birthDay),
            birth_year: Number(birthYear),
            birth_date: `${birthYear}-${pad2(Number(birthMonth))}-${pad2(Number(birthDay))}`,
            board_account_type: accountType,
            board_goal: boardGoal.trim(),
            board_vibe: selectedVibe.key,
            board_vibe_label: selectedVibe.label,
            board_signal_color: selectedSignal.key,
            board_signal_label: selectedSignal.label,
            board_signal_hex: selectedSignal.hex,
          },
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        setErr(result.message || "Signup failed. Please try again.");
        return;
      }

      // Supabase can return a user before email confirmation. Only an active
      // session is allowed through the authenticated Board gate.
      if (result.hasSession) {
        setOk("Account created. Redirecting...");
        await fetch("/api/board/profile/ensure", { method: "POST" }).catch(() => undefined);
        router.replace("/board/work");
        router.refresh();
      } else {
        setOk("Account created. Check your email to confirm your account, then log in.");
      }
    } catch (e: any) {
      setErr(e?.message || "Signup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen">
      <header className="mx-auto max-w-6xl px-6 pt-10 pb-6">
        <div className="flex items-center justify-between gap-4">
          <Link href="/board" className="flex items-center gap-3">
            <div className="h-10 w-10 overflow-hidden rounded-2xl border border-white/10 bg-black/40 ring-1 ring-white/10 shadow-[0_0_40px_rgba(210,255,60,0.25)]">
              <img
                src="/assets/board-logo-signup.jpg"
                alt="Board logo"
                className="h-full w-full object-cover object-center"
              />
            </div>
            <div>
              <div className="text-sm opacity-70">JAB Visions™</div>
              <div className="text-lg font-semibold tracking-tight">Board</div>
            </div>
          </Link>

          <nav className="flex items-center gap-4 text-sm">
            <Link className="opacity-80 hover:opacity-100" href="/terms">
              Terms
            </Link>
            <Link className="opacity-80 hover:opacity-100" href="/privacy">
              Privacy
            </Link>
            <Link className="opacity-80 hover:opacity-100" href="/guidelines">
              Guidelines
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 pb-14 pt-4">
        <div className="rounded-3xl border border-white/10 bg-black/30 p-8 shadow-[0_0_80px_rgba(0,200,255,0.08)]">
          <h1 className="text-3xl font-semibold tracking-tight">Create account</h1>
          <p className="mt-2 text-sm opacity-80">
            Set up your Board identity. Drop, connect, build.
          </p>

          {!authAvailable ? (
            <div className="mt-4 rounded-2xl border border-amber-200/25 bg-amber-200/10 p-3 text-xs leading-5 text-amber-50">
              Supabase setup is required before a new account can be created. The signup form remains available below.
            </div>
          ) : null}

          <form className="mt-6 grid gap-4" onSubmit={onSignup}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <label className="text-xs opacity-70">Full name</label>
                <input
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/20"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  type="text"
                  placeholder="First and last name"
                  autoComplete="name"
                />
              </div>

              <div className="grid gap-2">
                <label className="text-xs opacity-70">Username</label>
                <div className="flex items-center rounded-2xl border border-white/10 bg-black/40 px-4 py-3 focus-within:border-white/20">
                  <span className="text-sm opacity-50">@</span>
                  <input
                    className="min-w-0 flex-1 bg-transparent pl-1 text-sm outline-none"
                    value={username}
                    onChange={(e) => setUsername(cleanUsername(e.target.value))}
                    type="text"
                    placeholder="yourname"
                    autoComplete="username"
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
              <div className="grid gap-2">
                <label className="text-xs opacity-70">Birth date</label>
                <div className="grid gap-2 sm:grid-cols-[1.2fr_0.8fr_0.9fr]">
                  <select
                    className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/20"
                    value={birthMonth}
                    onChange={(e) => setBirthMonth(e.target.value)}
                    autoComplete="bday-month"
                  >
                    <option value="">Month</option>
                    {MONTHS.map((month) => (
                      <option key={month.value} value={month.value}>
                        {month.label}
                      </option>
                    ))}
                  </select>

                  <select
                    className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/20"
                    value={birthDay}
                    onChange={(e) => setBirthDay(e.target.value)}
                    autoComplete="bday-day"
                  >
                    <option value="">Day</option>
                    {Array.from({ length: 31 }, (_, index) => String(index + 1)).map((day) => (
                      <option key={day} value={day}>
                        {day}
                      </option>
                    ))}
                  </select>

                  <select
                    className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/20"
                    value={birthYear}
                    onChange={(e) => setBirthYear(e.target.value)}
                    autoComplete="bday-year"
                  >
                    <option value="">Year</option>
                    {birthYears.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-2">
                <label className="text-xs opacity-70">Account lane</label>
                <select
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/20"
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value)}
                >
                  <option>Creator</option>
                  <option>Artist</option>
                  <option>Business</option>
                  <option>Collaborator</option>
                  <option>Supporter</option>
                </select>
              </div>
            </div>

            <div className="grid gap-2">
              <label className="text-xs opacity-70">Email</label>
              <input
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/20"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-xs opacity-70">Password</label>
              <input
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/20"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
              <div className="text-[11px] opacity-60">
                Tip: use 8+ characters. You can upgrade password rules later.
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <label className="text-xs opacity-70">What are you building on Board?</label>
                <textarea
                  className="min-h-[108px] w-full resize-none rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/20"
                  value={boardGoal}
                  onChange={(e) => setBoardGoal(e.target.value.slice(0, 180))}
                  placeholder="This becomes your profile bio: music, films, projects, a portfolio, community..."
                />
              </div>

              <div className="grid gap-2">
                <label className="text-xs opacity-70">Board setup</label>
                <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                  <select
                    className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/20"
                    value={profileVibe}
                    onChange={(e) => setProfileVibe(e.target.value)}
                    aria-label="Profile vibe"
                  >
                    {PROFILE_VIBES.map((vibeOption) => (
                      <option key={vibeOption.key} value={vibeOption.key}>
                        {vibeOption.emoji} Profile vibe: {vibeOption.label}
                      </option>
                    ))}
                  </select>

                  <div className="relative">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-left text-sm outline-none transition hover:border-white/20 focus:border-white/25"
                      onClick={() => setSignalMenuOpen((open) => !open)}
                      aria-haspopup="listbox"
                      aria-expanded={signalMenuOpen}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span
                          className="h-6 w-6 shrink-0 rounded-[8px] border border-white/30"
                          style={{
                            background: selectedSignalColor.hex,
                            boxShadow: `0 0 16px ${selectedSignalColor.hex}66`,
                          }}
                          aria-hidden
                        />
                        <span className="truncate">Signal color: {selectedSignalColor.label}</span>
                      </span>
                      <span className="text-xs opacity-55" aria-hidden>
                        {signalMenuOpen ? "▲" : "▼"}
                      </span>
                    </button>

                    {signalMenuOpen ? (
                      <div
                        className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 grid max-h-72 gap-1 overflow-auto rounded-2xl border border-white/10 bg-[#080b08] p-2 shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
                        role="listbox"
                        aria-label="Signal color"
                      >
                        {AURA_COLORS.map((color) => (
                          <button
                            key={color.key}
                            type="button"
                            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-white/10 ${
                              signalColor === color.key ? "bg-white/10" : "bg-transparent"
                            }`}
                            onClick={() => {
                              setSignalColor(color.key);
                              setSignalMenuOpen(false);
                            }}
                            role="option"
                            aria-selected={signalColor === color.key}
                          >
                            <span
                              className="h-7 w-7 shrink-0 rounded-[9px] border border-white/30"
                              style={{
                                background: color.hex,
                                boxShadow: `0 0 16px ${color.hex}66`,
                              }}
                              aria-hidden
                            />
                            <span className="font-semibold">{color.label}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <label className="mt-2 flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs leading-5">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-white"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
              />
              <span className="opacity-80">
                I confirm I’m 13+ and I agree to the{" "}
                <Link className="underline" href="/terms" target="_blank">
                  Terms
                </Link>
                ,{" "}
                <Link className="underline" href="/privacy" target="_blank">
                  Privacy Policy
                </Link>
                , and{" "}
                <Link className="underline" href="/guidelines" target="_blank">
                  Community Guidelines
                </Link>
                .
              </span>
            </label>

            {err ? (
              <div className="rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-red-200">
                {err}
              </div>
            ) : null}

            {ok ? (
              <div className="rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-green-200">
                {ok}
              </div>
            ) : null}

            <button
              disabled={loading}
              className="mt-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black hover:opacity-95 disabled:opacity-60"
              type="submit"
            >
              {loading ? "Creating…" : "Create account"}
            </button>

            <div className="mt-2 text-xs opacity-70">
              Already have an account?{" "}
              <Link className="underline" href="/board/login">
                Log in
              </Link>
              .
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
