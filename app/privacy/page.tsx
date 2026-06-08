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
        <p>
          This Privacy Policy explains how JAB Visions™ Board ("Board," "we," "our," or "us")
          collects, uses, stores, and shares information when you use the Board website,
          apps, content, and related services.
        </p>

        <h2>1) Scope</h2>
        <p>
          This policy applies to public pages on the Board website, account creation and login,
          creator profiles, project drops, community feed activity, forums, uploads, and other
          Board features that are operated by JAB Visions.
        </p>

        <h2>2) Information we collect</h2>
        <p>We may collect the following categories of information:</p>
        <ul>
          <li>Account information, such as your email address and encrypted authentication data.</li>
          <li>Profile information, such as display name, bio, profile image, cover image, links, aura settings, and account preferences.</li>
          <li>Community content, such as posts, project drops, forum threads, replies, reactions, saved items, and uploads you choose to publish.</li>
          <li>Project and collaboration information, such as casting call details, invites, project room posts, and creator contact information you add to a project.</li>
          <li>Payment-related information you choose to add to Pay Drops, such as checkout links, payment descriptions, prices, and future hosted checkout metadata.</li>
          <li>Technical and usage information, such as browser type, approximate device information, page interactions, and error logs used to operate and improve the service.</li>
          <li>Local device storage, including data saved in your browser for product features like profile drafts, drop states, buckets, project panels, and interface preferences.</li>
        </ul>

        <h2>3) How we collect information</h2>
        <p>We collect information in a few different ways:</p>
        <ul>
          <li>Directly from you when you create an account, complete your profile, post content, upload files, create projects, or contact us.</li>
          <li>Automatically through your use of Board, including browser-based storage, authentication sessions, and feature interactions.</li>
          <li>From service providers that help us operate Board, such as authentication, storage, hosting, analytics, and payment partners.</li>
        </ul>

        <h2>4) How we use information</h2>
        <p>We use information to:</p>
        <ul>
          <li>Provide, secure, and maintain Board.</li>
          <li>Create and manage your account and sessions.</li>
          <li>Display your content and enable creator/community features.</li>
          <li>Process project, feed, forum, and profile interactions.</li>
          <li>Support payment-related features and checkout flows.</li>
          <li>Respond to support requests, prevent abuse, and enforce our Terms and Community Guidelines.</li>
          <li>Improve Board, diagnose bugs, and plan future product features.</li>
        </ul>

        <h2>5) Public and private content</h2>
        <p>
          Some Board features are social by design. If you post content to a public profile,
          public feed, community room, forum, or project drop, that content may be visible to
          other users or visitors depending on the feature and your settings.
        </p>
        <p>
          Please do not post personal, confidential, or sensitive information that you do not
          want others to see. You are responsible for the information you choose to publish.
        </p>

        <h2>6) Payments and checkout providers</h2>
        <p>
          Board may support Pay Drops, checkout links, and embedded or hosted payment flows.
          Payment transactions may be handled by third-party payment providers or merchant
          gateways, including providers connected through National Bankcard, Authorize.Net,
          Payanywhere, or similar services.
        </p>
        <p>
          We do not intend to store full payment card numbers directly in Board when checkout is
          handled by a hosted or embedded third-party payment processor. Payment processors may
          collect and process information under their own privacy terms and security practices.
        </p>

        <h2>7) Storage and service providers</h2>
        <p>
          Board currently uses third-party infrastructure providers for services such as account
          authentication, cloud storage, and hosting. Those providers may process information on
          our behalf in order to operate the service.
        </p>
        <p>
          User-uploaded files and creator content may be stored in third-party cloud storage
          environments selected by JAB Visions.
        </p>

        <h2>8) Browser storage and prototypes</h2>
        <p>
          Some Board features currently rely on browser-based local storage to preserve drafts,
          preferences, saved panels, and experimental product states. That means some information
          may remain on the device and browser you used until you clear it or we migrate the
          feature to server-backed storage.
        </p>

        <h2>9) Sharing of information</h2>
        <p>We may share information:</p>
        <ul>
          <li>With service providers that help us run Board.</li>
          <li>With payment, hosting, storage, and authentication partners as needed to provide features.</li>
          <li>When content is intentionally made public by you or through the normal operation of a public feature.</li>
          <li>When required by law, legal process, or a good-faith belief that disclosure is necessary to protect rights, safety, or the integrity of the platform.</li>
          <li>In connection with a business transfer, restructuring, financing, or acquisition involving Board or JAB Visions.</li>
        </ul>
        <p>
          We do not currently describe Board as selling personal information for advertising
          purposes. If our practices materially change, we will update this policy.
        </p>

        <h2>10) Your choices</h2>
        <p>You may be able to:</p>
        <ul>
          <li>Edit or remove certain profile content and creator content from your account.</li>
          <li>Change visibility or preference settings where those controls are offered.</li>
          <li>Request account-related assistance by contacting us.</li>
          <li>Clear browser-stored data locally on your device.</li>
        </ul>

        <h2>11) Data retention</h2>
        <p>
          We retain information for as long as reasonably necessary to operate Board, comply with
          legal obligations, resolve disputes, enforce our agreements, and improve the service.
          Some content may persist in backups, logs, or system records for a period of time after
          deletion requests or account changes.
        </p>

        <h2>12) Security</h2>
        <p>
          We use reasonable administrative, technical, and organizational measures to protect
          information. No system is perfectly secure, and we cannot guarantee absolute security.
          You should use a strong password and protect access to your own devices and accounts.
        </p>

        <h2>13) Children and age requirements</h2>
        <p>
          Board is intended for users who are at least 13 years old, and some features may be
          intended only for adults depending on the content or use case. If you believe a child
          has provided personal information in violation of applicable law or our policies, please
          contact us.
        </p>

        <h2>14) International use</h2>
        <p>
          If you access Board from outside the United States, your information may be processed in
          the United States or other jurisdictions where our service providers operate.
        </p>

        <h2>15) Updates to this policy</h2>
        <p>
          We may update this Privacy Policy from time to time. If we make material changes, we may
          update the date above and take additional steps when appropriate.
        </p>

        <h2>16) Contact</h2>
        <p>
          For privacy questions, account requests, or data concerns, contact JAB Visions at{" "}
          <a href="mailto:JohnAndyBooks@gmail.com">JohnAndyBooks@gmail.com</a>.
        </p>
      </article>
    </main>
  );
}
