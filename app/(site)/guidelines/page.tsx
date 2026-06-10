import Link from "next/link";

export const metadata = {
  title: "Community Guidelines | JAB Visions Board",
};

const GUIDELINES_VERSION = "1.0";
const LAST_UPDATED = "January 20, 2026";

export default function GuidelinesPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <header className="mb-8">
        <p className="text-sm opacity-70">
          Version {GUIDELINES_VERSION} • Last Updated: {LAST_UPDATED}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          JAB Visions™ Board Community Guidelines
        </h1>
        <div className="mt-4 text-sm opacity-80">
          <Link className="underline" href="/terms">Terms</Link>{" "}
          <span className="px-2">•</span>
          <Link className="underline" href="/privacy">Privacy Policy</Link>
        </div>
      </header>

      <article className="prose prose-invert max-w-none">
        <p>
          Board is a creator community built for vision, collaboration, project sharing,
          and real opportunities. These Community Guidelines explain what is expected when
          you post, message, collaborate, host projects, create Pay Drops, or participate
          in Board spaces.
        </p>

        <h2>1) Create with respect</h2>
        <p>
          Treat other people with respect. We do not allow harassment, bullying, targeted
          humiliation, intimidation, threats, stalking, or attempts to pressure people into
          unwanted interaction on or off the platform.
        </p>

        <h2>2) No hate or discrimination</h2>
        <p>
          Do not post or promote hateful, degrading, or discriminatory content directed at
          people based on race, ethnicity, nationality, religion, disability, gender, gender
          identity, sexual orientation, age, or similar protected characteristics.
        </p>

        <h2>3) No illegal or dangerous activity</h2>
        <p>
          Board may not be used to promote illegal activity, violent crime, trafficking,
          exploitation, fraud, hacking, weapons misuse, terrorism, or instructions for causing
          serious harm. Content that encourages dangerous real-world acts may be removed.
        </p>

        <h2>4) Sexual content and minors</h2>
        <p>
          Any sexual exploitation of minors is strictly prohibited and will be removed and
          escalated as appropriate. Do not post, request, store, or distribute sexual content
          involving minors or content that appears to sexualize minors in any way.
        </p>
        <p>
          Adult content, if later allowed in limited contexts, must still comply with all
          applicable law, consent standards, and platform rules. Until explicitly supported,
          avoid posting explicit sexual content on Board.
        </p>

        <h2>5) Protect privacy</h2>
        <p>
          Do not share someone else&apos;s private or identifying information without permission.
          That includes doxxing, leaking personal contacts, addresses, financial details,
          government IDs, private messages, or confidential production information.
        </p>

        <h2>6) Be real and don&apos;t impersonate</h2>
        <p>
          Do not impersonate another person, brand, production, or organization in a misleading
          way. Profiles, project calls, and creator opportunities should honestly represent who
          is posting them and what is actually being offered.
        </p>

        <h2>7) No spam, scams, or deceptive promotion</h2>
        <p>
          Do not use Board for spam, fake engagement, repetitive mass-posting, phishing,
          deceptive funnels, pyramid schemes, fake job offers, or fraudulent financial
          solicitations. If you are promoting an opportunity, product, service, or casting call,
          it should be truthful and clearly described.
        </p>

        <h2>8) Casting calls and project drops must be honest</h2>
        <p>
          If you create a project drop, casting call, or work opportunity, include real details
          about the project whenever possible. Do not misrepresent compensation, availability,
          ownership, deadlines, collaborator roles, location requirements, or the purpose of the
          project.
        </p>
        <p>
          If a project has unpaid, volunteer, speculative, or revenue-share terms, say so
          clearly. If a role is already filled, outdated, or paused, update or remove the post.
        </p>

        <h2>9) Respect intellectual property</h2>
        <p>
          Only post content that you own, have permission to share, or are otherwise allowed to
          use. Do not upload stolen media, leaked materials, pirated works, or other content that
          infringes someone else&apos;s rights.
        </p>
        <p>
          If you use third-party artwork, logos, beats, tracks, scripts, brand assets, or video,
          make sure you have the right to use them in the way you are posting them on Board.
        </p>

        <h2>10) Use Pay Drops responsibly</h2>
        <p>
          Pay Drops and embedded checkout links must only be used for legitimate offerings,
          donations, memberships, tickets, commissions, or related creator transactions. Do not
          use Pay Drops for unlawful sales, prohibited goods, chargeback abuse, money laundering,
          or deceptive billing.
        </p>
        <p>
          If you collect payment through a third-party provider, you are responsible for making
          sure your offer, refund policy, and fulfillment terms are clear and lawful.
        </p>

        <h2>11) Keep uploads and embeds safe</h2>
        <p>
          Do not upload malware, malicious scripts, harmful files, or embeds designed to damage,
          disrupt, or exploit users. Links, media embeds, and uploads should be relevant to the
          experience you are presenting and should not be used to trick people into unsafe actions.
        </p>

        <h2>12) Community spaces should stay usable</h2>
        <p>
          Feed, Profile, Forums, Project Rooms, and other shared spaces should remain useful for
          the community. Excessive flooding, repetitive off-topic posting, abusive tagging, or
          attempts to manipulate visibility may result in content limits or removal.
        </p>

        <h2>13) Enforcement</h2>
        <p>
          We may remove content, restrict visibility, suspend features, lock accounts, or remove
          users who violate these Guidelines, our Terms, or applicable law. We may also take action
          where behavior creates safety, legal, fraud, or platform integrity risk.
        </p>

        <h2>14) Reporting concerns</h2>
        <p>
          If you see content or behavior that appears unsafe, abusive, fraudulent, infringing, or
          otherwise in violation of these rules, contact JAB Visions at{" "}
          <a href="mailto:JohnAndyBooks@gmail.com">JohnAndyBooks@gmail.com</a>.
        </p>

        <h2>15) Updates</h2>
        <p>
          These Guidelines may evolve as Board grows. If we make important changes, we will update
          the version and date shown above.
        </p>
      </article>
    </main>
  );
}
