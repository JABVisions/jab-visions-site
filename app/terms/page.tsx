import Link from "next/link";

export const metadata = {
  title: "Terms of Service | JAB Visions Board",
};

const TERMS_VERSION = "1.0";
const LAST_UPDATED = "January 20, 2026";

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <header className="mb-8">
        <p className="text-sm opacity-70">
          Version {TERMS_VERSION} • Last Updated: {LAST_UPDATED}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          JAB Visions™ Board Terms of Service
        </h1>
        <p className="mt-3 opacity-80">
          Please read these Terms carefully. By using Board, you agree to them.
        </p>
        <div className="mt-4 text-sm opacity-80">
          <Link className="underline" href="/privacy">Privacy Policy</Link>{" "}
          <span className="px-2">•</span>
          <Link className="underline" href="/guidelines">Community Guidelines</Link>
        </div>
      </header>

      <article className="prose prose-invert max-w-none">
        {/* Paste your Terms content below, formatted with headings + paragraphs */}

        <h2>1) Who we are</h2>
        <p>Company: JAB Visions LLC ...</p>

        <h2>2) Eligibility and age requirements</h2>
        <p>Board is intended for users 13+ ...</p>

        {/* Continue… */}
      </article>
    </main>
  );
}
