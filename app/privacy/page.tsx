import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | JAB Visions Board",
};

const PRIVACY_VERSION = "1.0";
const LAST_UPDATED = "January 20, 2026";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <header className="mb-8">
        <p className="text-sm opacity-70">
          Version {PRIVACY_VERSION} • Last Updated: {LAST_UPDATED}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          JAB Visions™ Board Privacy Policy
        </h1>
        <div className="mt-4 text-sm opacity-80">
          <Link className="underline" href="/terms">Terms</Link>{" "}
          <span className="px-2">•</span>
          <Link className="underline" href="/guidelines">Community Guidelines</Link>
        </div>
      </header>

      <article className="prose prose-invert max-w-none">
        {/* Paste your Privacy content here */}
      </article>
    </main>
  );
}
