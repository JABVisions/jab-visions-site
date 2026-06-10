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
        <h2>1) Who we are</h2>
        <p>
          JAB Visions™ Board ("Board") is operated by JAB Visions ("we," "our," or "us").
          These Terms of Service govern your access to and use of the Board website, apps,
          creator tools, public and private community spaces, and related services.
        </p>

        <h2>2) Eligibility and age requirements</h2>
        <p>
          You must be at least 13 years old to use Board. If you are under the age of majority
          in your jurisdiction, you may only use Board with any permissions required by law.
          You may not use Board if you are prohibited from doing so under applicable law.
        </p>

        <h2>3) Your account</h2>
        <p>
          You are responsible for maintaining the confidentiality of your login credentials and
          for activity that occurs under your account. You agree to provide accurate information,
          keep your account information reasonably current, and notify us if you believe your
          account has been compromised.
        </p>

        <h2>4) What Board allows you to do</h2>
        <p>
          Board is a creator platform for sharing content, building a profile, creating drops,
          posting projects and casting calls, participating in forums, collaborating with others,
          and using related creator and payment-oriented tools that we make available.
        </p>
        <p>
          Some features may be experimental, in development, locally stored in your browser, or
          changed, limited, or removed over time.
        </p>

        <h2>5) Community rules</h2>
        <p>
          Your use of Board must comply with these Terms, our{" "}
          <Link href="/guidelines">Community Guidelines</Link>, and our{" "}
          <Link href="/privacy">Privacy Policy</Link>. We may remove content or restrict access
          when we believe conduct violates those rules or creates legal, safety, fraud, or
          platform-integrity risk.
        </p>

        <h2>6) Your content</h2>
        <p>
          You retain ownership of the content you create and upload to Board, subject to any
          rights granted in these Terms. "Content" includes posts, drops, profile materials,
          project listings, images, audio, video, links, comments, forum activity, and other
          materials you submit through the service.
        </p>
        <p>
          You are solely responsible for your content and for making sure you have the rights,
          permissions, and authority necessary to post it.
        </p>

        <h2>7) License you give to Board</h2>
        <p>
          By posting content to Board, you grant us a non-exclusive, worldwide, royalty-free
          license to host, store, reproduce, modify for technical formatting, display, perform,
          distribute, and otherwise use that content as needed to operate, improve, promote, and
          provide Board features.
        </p>
        <p>
          This license is limited to operating and promoting the service and does not transfer
          ownership of your content to us.
        </p>

        <h2>8) Prohibited uses</h2>
        <p>You may not use Board to:</p>
        <ul>
          <li>Violate any law or regulation.</li>
          <li>Harass, threaten, exploit, defraud, or impersonate others.</li>
          <li>Post infringing, stolen, or unauthorized content.</li>
          <li>Share private, confidential, or sensitive information without permission.</li>
          <li>Distribute malware, malicious code, or harmful files.</li>
          <li>Interfere with the normal operation, security, or integrity of Board.</li>
          <li>Use automation, scraping, or abusive technical behavior in a way we have not authorized.</li>
          <li>Create deceptive project drops, false opportunities, fake payment requests, or scam offers.</li>
        </ul>

        <h2>9) Projects, collaborations, and opportunities</h2>
        <p>
          Board may let users publish project drops, project rooms, invites, casting calls,
          collaboration requests, and work opportunities. We do not guarantee the accuracy,
          legitimacy, safety, availability, or outcome of user-posted opportunities.
        </p>
        <p>
          Any collaboration, hiring, casting, contracting, production, or business relationship
          formed through Board is between the participating users or entities, not with JAB Visions.
        </p>

        <h2>10) Pay Drops and third-party payments</h2>
        <p>
          Board may support Pay Drops, checkout links, or embedded/hosted payment experiences.
          Payment processing may be provided by third-party processors, gateways, or merchant
          service providers, including Stripe (and Stripe Connect for creator payouts) or similar services.
        </p>
        <p>
          We are not a bank, payment network, or money transmitter. We do not guarantee payment
          completion, buyer performance, seller performance, refunds, chargeback outcomes, or the
          legality of items or services offered by users through payment-related features.
        </p>
        <p>
          If you create or collect payment through a Pay Drop, you are responsible for complying
          with all applicable laws, taxes, consumer disclosures, refund obligations, and processor
          requirements tied to your offering.
        </p>

        <h2>11) Intellectual property</h2>
        <p>
          Board, including its branding, software, interface elements, design, text, and service
          materials, is protected by intellectual property and other laws. Except as expressly
          permitted, you may not copy, reproduce, sell, license, reverse engineer, or exploit
          Board or our materials without permission.
        </p>

        <h2>12) Feedback</h2>
        <p>
          If you send us suggestions, feature requests, ideas, or feedback, you agree that we may
          use them without restriction or compensation to you.
        </p>

        <h2>13) Suspension and termination</h2>
        <p>
          We may suspend, limit, or terminate your access to Board at any time if we believe you
          have violated these Terms, the Community Guidelines, applicable law, or created risk to
          users, third parties, or the platform.
        </p>
        <p>
          You may stop using Board at any time. Termination does not automatically remove all
          content from backups, logs, or technical records immediately.
        </p>

        <h2>14) Availability and changes</h2>
        <p>
          Board is provided on an evolving basis. We may update features, redesign workflows,
          change eligibility rules, add or remove integrations, or discontinue portions of the
          service at any time.
        </p>

        <h2>15) Disclaimers</h2>
        <p>
          Board is provided on an "as is" and "as available" basis to the fullest extent permitted
          by law. We disclaim warranties of any kind, whether express or implied, including implied
          warranties of merchantability, fitness for a particular purpose, title, and
          non-infringement.
        </p>
        <p>
          We do not warrant that Board will be uninterrupted, secure, error-free, compatible with
          every device or browser, or that user content, collaborations, or payment activity will
          always be available or preserved without issue.
        </p>

        <h2>16) Limitation of liability</h2>
        <p>
          To the fullest extent permitted by law, JAB Visions and its affiliates, owners, officers,
          employees, contractors, and service providers will not be liable for any indirect,
          incidental, special, consequential, exemplary, or punitive damages, or for any loss of
          profits, revenues, goodwill, data, content, projects, or business opportunities arising
          out of or related to your use of Board.
        </p>
        <p>
          To the fullest extent permitted by law, our total liability for claims relating to Board
          will not exceed the greater of one hundred U.S. dollars (USD $100) or the amount you paid
          us, if any, for the specific service giving rise to the claim during the twelve months
          before the claim arose.
        </p>

        <h2>17) Indemnification</h2>
        <p>
          You agree to defend, indemnify, and hold harmless JAB Visions and its affiliates,
          personnel, and service providers from claims, liabilities, damages, losses, and expenses
          arising out of or related to your content, your use of Board, your violation of these
          Terms, or your violation of any rights of another person or entity.
        </p>

        <h2>18) Governing law</h2>
        <p>
          These Terms are governed by the laws of the State of New York, without regard to conflict
          of law principles, except to the extent applicable law requires otherwise.
        </p>

        <h2>19) Changes to these Terms</h2>
        <p>
          We may update these Terms from time to time. If we make material changes, we may revise
          the date above and take additional steps when appropriate. Your continued use of Board
          after updated Terms take effect means you accept the revised Terms.
        </p>

        <h2>20) Contact</h2>
        <p>
          For questions about these Terms, contact JAB Visions at{" "}
          <a href="mailto:JohnAndyBooks@gmail.com">JohnAndyBooks@gmail.com</a>.
        </p>
      </article>
    </main>
  );
}
