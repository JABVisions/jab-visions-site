"use client";

import Link from "next/link";

type Track = {
  id: string;
  title: string;
  artist: string;
  tag: string;
  project: string;
  note: string;
  spotifyEmbed?: string;
  status: string;
};

const tracks: Track[] = [
  {
    id: "spidey",
    title: "Spidey",
    artist: "John Andy & CyBando",
    tag: "Origin Record",
    project: "JAB Archive",
    note: "The first recording: family-built, raw, and alive.",
    spotifyEmbed:
      "https://open.spotify.com/embed/track/40a973TDkUWWlz0DzvFUkl?utm_source=generator",
    status: "Free Stream",
  },
  {
    id: "baby",
    title: "bAbY",
    artist: "John Andy",
    tag: "Single",
    project: "JAB Music",
    note: "A melodic late-night record shaped by vulnerability and clean edges.",
    spotifyEmbed:
      "https://open.spotify.com/embed/track/1Tp7paiXQKYW4HJa8wVF5r?utm_source=generator",
    status: "Free Stream",
  },
  {
    id: "sense",
    title: "$eN$E",
    artist: "John Andy",
    tag: "Remaster Signal",
    project: "JAB Archive",
    note: "The original signal is being rebuilt with greater clarity and harmony.",
    status: "In Progress",
  },
];

const artistFeatures = [
  "Build your artist profile",
  "Share songs and previews",
  "Network with creatives",
  "Collaborate with JAB Visions",
  "Connect music to films, Drops, and projects",
];

export default function JabMusicPage() {
  return (
    <>
      <main className="music-page">
        <div className="sonar-field" aria-hidden="true">
          <div className="sonar-origin">
            <span />
            <span />
            <span />
            <i />
          </div>
          <div className="signal-grid" />
          <div className="signal-wave signal-wave-one" />
          <div className="signal-wave signal-wave-two" />
        </div>

        <div className="music-shell">
          <section className="music-hero" aria-labelledby="music-title">
            <div className="hero-copy">
              <p className="music-eyebrow">JAB Visions / Sonic Archive</p>
              <h1 id="music-title">JAB Music</h1>
              <p className="hero-subtitle">
                The sound archive of JAB Visions: records, previews, and sonic
                fragments from the worlds we are building.
              </p>
              <p className="hero-body">
                Stream project-linked records from John Andy and the growing
                creative universe behind JAB Visions. Artists are invited to
                join Board, build a profile, share their music, and find
                collaborators across film, literature, fashion, and digital
                media.
              </p>
              <p className="frequency-line">
                JAB Music is not a playlist. It is the frequency layer of JAB
                Visions.
              </p>

              <div className="hero-actions">
                <a className="music-button music-button-primary" href="#library">
                  Listen Now
                </a>
                <Link className="music-button" href="/board/signup">
                  Join Board as an Artist
                </Link>
                <Link className="music-link" href="/">
                  Explore JAB Visions
                </Link>
              </div>
            </div>

            <div className="hero-sonar" aria-hidden="true">
              <div className="hero-disc">
                <div className="disc-grooves" />
                <div className="disc-label">
                  <span>JAB</span>
                  <strong>MUSIC</strong>
                  <small>Signal 001</small>
                </div>
              </div>
              <div className="telemetry">
                <span>Archive online</span>
                <span>Frequency stable</span>
                <span>Free stream active</span>
              </div>
            </div>
          </section>

          <section className="featured-section" aria-labelledby="featured-title">
            <div className="section-heading">
              <div>
                <p className="music-eyebrow">Featured Record</p>
                <h2 id="featured-title">The origin signal</h2>
              </div>
              <p>Record 001 / JAB Archive</p>
            </div>

            <article className="featured-record">
              <div className="featured-art">
                <div className="record-sleeve">
                  <span className="sleeve-index">JAB MUSIC / 001</span>
                  <strong>SPIDEY</strong>
                  <span>John Andy &amp; CyBando</span>
                  <div className="sleeve-wave" />
                </div>
                <div className="vinyl-disc">
                  <span>SPIDEY</span>
                </div>
              </div>

              <div className="featured-copy">
                <div className="tag-row">
                  <span>Free Stream</span>
                  <span>Origin Record</span>
                  <span>JAB Archive</span>
                </div>
                <h3>Spidey</h3>
                <p className="artist-name">John Andy &amp; CyBando</p>
                <p>
                  The first entry in the JAB Music archive. Built with John
                  Andy&apos;s brother Cyrus, who produces as CyBando, the record
                  established a family-made sound rooted in experimentation,
                  melody, and cinematic instinct.
                </p>
                <SpotifyPlayer
                  title="Spidey by John Andy and CyBando"
                  src={tracks[0].spotifyEmbed!}
                />
              </div>
            </article>
          </section>

          <section id="library" className="library-section" aria-labelledby="library-title">
            <div className="section-heading">
              <div>
                <p className="music-eyebrow">Stream / Preview / Connect</p>
                <h2 id="library-title">JAB Music Library</h2>
              </div>
              <p>Records from the frequency layer of JAB Visions.</p>
            </div>

            <div className="track-grid">
              {tracks.map((track, index) => (
                <TrackCard key={track.id} track={track} index={index + 1} />
              ))}
            </div>
          </section>

          <section className="artist-section" aria-labelledby="artist-title">
            <div className="artist-copy">
              <p className="music-eyebrow">Board / Artist Network</p>
              <h2 id="artist-title">Artists, bring your sound to Board.</h2>
              <p>
                Board is becoming a creative network for artists, actors,
                filmmakers, writers, designers, and worldbuilders. Musicians
                can create profiles, share music, discover collaborators, and
                connect with JAB Visions projects.
              </p>
              <div className="artist-actions">
                <Link className="music-button music-button-primary" href="/board/signup">
                  Join Board
                </Link>
                <Link className="music-button" href="/board/profile">
                  View Artist Profiles
                </Link>
              </div>
            </div>

            <div className="artist-feature-grid">
              {artistFeatures.map((feature, index) => (
                <div className="artist-feature" key={feature}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <p>{feature}</p>
                </div>
              ))}
            </div>
          </section>

          <footer className="music-footer">
            <span>JAB Music / Sonic archive online</span>
            <a href="mailto:support@jabvisions.com">support@jabvisions.com</a>
          </footer>
        </div>
      </main>

      <style jsx global>{`
        .music-page {
          position: relative;
          min-height: 100vh;
          overflow: hidden;
          color: #eefbff;
          background:
            radial-gradient(circle at 72% 8%, rgba(46, 196, 255, 0.15), transparent 34rem),
            radial-gradient(circle at 12% 45%, rgba(10, 111, 180, 0.15), transparent 38rem),
            linear-gradient(145deg, #01060c 0%, #03111e 48%, #020912 100%);
        }

        .sonar-field {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
        }

        .signal-grid {
          position: absolute;
          inset: 0;
          opacity: 0.16;
          background-image:
            linear-gradient(rgba(103, 218, 255, 0.16) 1px, transparent 1px),
            linear-gradient(90deg, rgba(103, 218, 255, 0.16) 1px, transparent 1px);
          background-size: 54px 54px;
          mask-image: linear-gradient(to bottom, black, transparent 80%);
        }

        .sonar-origin {
          position: absolute;
          top: 2rem;
          right: -13rem;
          width: min(72vw, 72rem);
          aspect-ratio: 1;
        }

        .sonar-origin span {
          position: absolute;
          inset: 50%;
          border: 1px solid rgba(105, 224, 255, 0.18);
          border-radius: 50%;
          transform: translate(-50%, -50%);
          animation: sonarPulse 6s ease-out infinite;
        }

        .sonar-origin span:nth-child(2) {
          animation-delay: 2s;
        }

        .sonar-origin span:nth-child(3) {
          animation-delay: 4s;
        }

        .sonar-origin i {
          position: absolute;
          inset: 15%;
          border-radius: 50%;
          background: conic-gradient(
            from 12deg,
            transparent 0 82%,
            rgba(99, 226, 255, 0.2) 92%,
            transparent 100%
          );
          animation: sonarSweep 9s linear infinite;
        }

        .signal-wave {
          position: absolute;
          height: 1px;
          width: 44rem;
          opacity: 0.42;
          background: linear-gradient(90deg, transparent, #69e1ff, transparent);
          box-shadow: 0 0 18px rgba(105, 225, 255, 0.6);
        }

        .signal-wave::after {
          content: "";
          position: absolute;
          inset: -14px 0;
          background: repeating-linear-gradient(
            90deg,
            transparent 0 16px,
            rgba(116, 229, 255, 0.22) 17px 18px,
            transparent 19px 28px
          );
          clip-path: polygon(0 50%, 8% 50%, 12% 15%, 18% 83%, 24% 34%, 31% 68%, 39% 50%, 100% 50%, 100% 54%, 0 54%);
        }

        .signal-wave-one {
          top: 24rem;
          left: -10rem;
          transform: rotate(-8deg);
        }

        .signal-wave-two {
          top: 64rem;
          right: -8rem;
          transform: rotate(10deg);
        }

        .music-shell {
          position: relative;
          z-index: 1;
          width: min(1180px, calc(100% - 32px));
          margin: 0 auto;
          padding: 8rem 0 5rem;
        }

        .music-hero {
          min-height: min(760px, 82vh);
          display: grid;
          grid-template-columns: minmax(0, 1.1fr) minmax(300px, 0.9fr);
          align-items: center;
          gap: clamp(2.5rem, 7vw, 7rem);
          padding: 2rem 0 5rem;
        }

        .music-eyebrow {
          margin: 0 0 0.8rem;
          color: #7cdeef;
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.22em;
          line-height: 1.4;
          text-transform: uppercase;
        }

        .hero-copy h1 {
          margin: 0;
          color: #f4fdff;
          font-size: clamp(4rem, 11vw, 8.5rem);
          font-weight: 800;
          letter-spacing: 0;
          line-height: 0.88;
          text-shadow: 0 0 36px rgba(89, 215, 255, 0.2);
        }

        .hero-subtitle {
          max-width: 43rem;
          margin: 2rem 0 0;
          color: #cdeef4;
          font-size: clamp(1.25rem, 2vw, 1.7rem);
          font-weight: 650;
          line-height: 1.45;
        }

        .hero-body,
        .artist-copy > p {
          max-width: 45rem;
          margin: 1.35rem 0 0;
          color: rgba(218, 241, 246, 0.72);
          font-size: 1rem;
          line-height: 1.75;
        }

        .frequency-line {
          max-width: 42rem;
          margin: 1.8rem 0 0;
          padding-left: 1rem;
          border-left: 2px solid #70dcf2;
          color: #eaffff;
          font-weight: 700;
          line-height: 1.6;
        }

        .hero-actions,
        .artist-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.75rem;
          margin-top: 2rem;
        }

        .music-button,
        .music-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 44px;
          padding: 0.75rem 1.1rem;
          border: 1px solid rgba(148, 229, 249, 0.28);
          border-radius: 6px;
          background: rgba(12, 42, 59, 0.52);
          color: #eaffff;
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          transition:
            transform 180ms ease,
            border-color 180ms ease,
            box-shadow 180ms ease,
            background 180ms ease;
        }

        .music-button:hover,
        .music-button:focus-visible,
        .music-link:hover,
        .music-link:focus-visible {
          transform: translateY(-2px);
          border-color: rgba(139, 234, 255, 0.68);
          box-shadow: 0 0 22px rgba(73, 204, 242, 0.16);
          outline: none;
        }

        .music-button-primary {
          border-color: rgba(125, 230, 251, 0.62);
          background: #baf4ff;
          color: #05141d;
          box-shadow: 0 0 30px rgba(92, 222, 252, 0.2);
        }

        .music-link {
          border-color: transparent;
          background: transparent;
          color: #8ee1f1;
        }

        .hero-sonar {
          position: relative;
          display: grid;
          place-items: center;
          min-height: 34rem;
        }

        .hero-sonar::before,
        .hero-sonar::after {
          content: "";
          position: absolute;
          width: 100%;
          aspect-ratio: 1;
          border: 1px solid rgba(110, 224, 249, 0.17);
          border-radius: 50%;
          box-shadow: 0 0 46px rgba(57, 191, 229, 0.08);
        }

        .hero-sonar::after {
          width: 74%;
        }

        .hero-disc {
          position: relative;
          z-index: 1;
          width: min(76%, 24rem);
          aspect-ratio: 1;
          display: grid;
          place-items: center;
          border: 1px solid rgba(148, 234, 255, 0.35);
          border-radius: 50%;
          background:
            radial-gradient(circle, #183544 0 8%, #07121a 8.5% 28%, transparent 29%),
            repeating-radial-gradient(circle, #091821 0 2px, #02070b 3px 7px);
          box-shadow:
            0 0 60px rgba(56, 200, 240, 0.18),
            inset 0 0 45px rgba(87, 223, 255, 0.12);
          animation: recordSpin 24s linear infinite;
        }

        .disc-grooves {
          position: absolute;
          inset: 4%;
          border: 1px solid rgba(160, 238, 255, 0.15);
          border-radius: 50%;
        }

        .disc-label {
          width: 32%;
          aspect-ratio: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(181, 242, 255, 0.52);
          border-radius: 50%;
          background: radial-gradient(circle, #d9fbff, #65cee6);
          color: #03121a;
          text-align: center;
        }

        .disc-label span,
        .disc-label small {
          font-size: 0.48rem;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .disc-label strong {
          font-size: clamp(0.75rem, 2vw, 1.15rem);
          letter-spacing: 0;
        }

        .telemetry {
          position: absolute;
          z-index: 2;
          right: 0;
          bottom: 1rem;
          display: grid;
          gap: 0.45rem;
          padding: 0.8rem;
          border: 1px solid rgba(135, 226, 248, 0.2);
          border-radius: 6px;
          background: rgba(3, 20, 30, 0.7);
          backdrop-filter: blur(18px);
        }

        .telemetry span {
          color: rgba(202, 244, 252, 0.68);
          font-family: monospace;
          font-size: 0.62rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .telemetry span::before {
          content: "";
          display: inline-block;
          width: 5px;
          height: 5px;
          margin-right: 0.5rem;
          border-radius: 50%;
          background: #76e6f8;
          box-shadow: 0 0 10px #76e6f8;
        }

        .featured-section,
        .library-section,
        .artist-section {
          scroll-margin-top: 7rem;
          margin-top: 3rem;
        }

        .section-heading {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 2rem;
          margin-bottom: 1.25rem;
        }

        .section-heading h2,
        .artist-copy h2 {
          margin: 0;
          color: #f3fdff;
          font-size: clamp(2rem, 5vw, 4rem);
          letter-spacing: 0;
          line-height: 1;
        }

        .section-heading > p {
          max-width: 22rem;
          margin: 0;
          color: rgba(202, 235, 241, 0.55);
          font-size: 0.78rem;
          letter-spacing: 0.08em;
          line-height: 1.6;
          text-align: right;
          text-transform: uppercase;
        }

        .featured-record,
        .track-card,
        .artist-section {
          border: 1px solid rgba(150, 229, 247, 0.22);
          border-radius: 8px;
          background:
            linear-gradient(135deg, rgba(15, 45, 60, 0.72), rgba(4, 18, 29, 0.58)),
            rgba(5, 21, 31, 0.7);
          box-shadow:
            0 24px 70px rgba(0, 0, 0, 0.28),
            inset 0 1px rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(24px) saturate(125%);
        }

        .featured-record {
          display: grid;
          grid-template-columns: minmax(300px, 0.85fr) minmax(0, 1.15fr);
          gap: clamp(2rem, 6vw, 5rem);
          padding: clamp(1rem, 4vw, 3rem);
        }

        .featured-art {
          position: relative;
          min-height: 26rem;
          display: grid;
          align-items: center;
        }

        .record-sleeve {
          position: relative;
          z-index: 2;
          width: min(88%, 25rem);
          aspect-ratio: 1;
          display: flex;
          flex-direction: column;
          justify-content: end;
          padding: 1.5rem;
          overflow: hidden;
          border: 1px solid rgba(177, 239, 252, 0.32);
          border-radius: 4px;
          background:
            radial-gradient(circle at 68% 18%, rgba(126, 234, 255, 0.36), transparent 26%),
            linear-gradient(155deg, #092b3b 0%, #06151f 56%, #03080c 100%);
          box-shadow: 0 18px 54px rgba(0, 0, 0, 0.42);
        }

        .record-sleeve::before {
          content: "";
          position: absolute;
          inset: 0;
          opacity: 0.26;
          background-image: repeating-linear-gradient(
            0deg,
            transparent 0 11px,
            rgba(151, 236, 255, 0.18) 12px
          );
        }

        .record-sleeve strong,
        .record-sleeve span {
          position: relative;
          z-index: 1;
        }

        .record-sleeve strong {
          font-size: clamp(2.7rem, 6vw, 5rem);
          line-height: 0.9;
        }

        .record-sleeve > span:not(.sleeve-index) {
          margin-top: 0.75rem;
          color: #9be6f4;
          font-size: 0.74rem;
          font-weight: 700;
          letter-spacing: 0.13em;
          text-transform: uppercase;
        }

        .sleeve-index {
          position: absolute !important;
          top: 1.25rem;
          left: 1.25rem;
          color: #a6eaf5;
          font-family: monospace;
          font-size: 0.62rem;
          letter-spacing: 0.12em;
        }

        .sleeve-wave {
          position: absolute;
          top: 43%;
          left: -10%;
          width: 120%;
          height: 2px;
          background: #8feaff;
          box-shadow: 0 0 20px #5edcf6;
          transform: rotate(-12deg);
        }

        .vinyl-disc {
          position: absolute;
          right: -4%;
          width: 68%;
          aspect-ratio: 1;
          display: grid;
          place-items: center;
          border: 1px solid rgba(129, 225, 247, 0.18);
          border-radius: 50%;
          background:
            radial-gradient(circle, #9decfa 0 7%, #071118 7.5% 18%, transparent 18.5%),
            repeating-radial-gradient(circle, #08141c 0 2px, #020508 3px 7px);
          box-shadow: 0 0 40px rgba(80, 216, 248, 0.12);
        }

        .vinyl-disc span {
          color: #defaff;
          font-size: 0.58rem;
          font-weight: 800;
          letter-spacing: 0.14em;
        }

        .featured-copy {
          align-self: center;
        }

        .tag-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
        }

        .tag-row span {
          padding: 0.35rem 0.55rem;
          border: 1px solid rgba(139, 226, 246, 0.24);
          border-radius: 999px;
          background: rgba(96, 213, 240, 0.07);
          color: #a9e7f3;
          font-size: 0.58rem;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .featured-copy h3 {
          margin: 1.2rem 0 0;
          font-size: clamp(3rem, 7vw, 6rem);
          letter-spacing: 0;
          line-height: 0.9;
        }

        .artist-name {
          margin: 0.8rem 0 0;
          color: #8ee0f0;
          font-weight: 750;
        }

        .featured-copy > p:last-of-type {
          max-width: 38rem;
          margin: 1.4rem 0 1.5rem;
          color: rgba(220, 243, 247, 0.7);
          line-height: 1.7;
        }

        .spotify-shell {
          overflow: hidden;
          border: 1px solid rgba(135, 225, 246, 0.18);
          border-radius: 8px;
          background: rgba(2, 10, 15, 0.45);
        }

        .spotify-shell iframe {
          display: block;
          width: 100%;
          border: 0;
        }

        .track-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 1rem;
        }

        .track-card {
          position: relative;
          min-width: 0;
          display: flex;
          flex-direction: column;
          padding: 1rem;
          transition:
            transform 180ms ease,
            border-color 180ms ease,
            box-shadow 180ms ease;
        }

        .track-card:hover {
          transform: translateY(-4px);
          border-color: rgba(139, 232, 252, 0.48);
          box-shadow:
            0 26px 75px rgba(0, 0, 0, 0.34),
            0 0 30px rgba(74, 205, 237, 0.1);
        }

        .track-art {
          position: relative;
          aspect-ratio: 1;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 1rem;
          overflow: hidden;
          border-radius: 5px;
          background:
            radial-gradient(circle at 70% 28%, rgba(131, 237, 255, 0.34), transparent 24%),
            linear-gradient(145deg, #0d3444, #06121b 64%, #02070b);
        }

        .track-art::after {
          content: "";
          position: absolute;
          inset: 18%;
          border: 1px solid rgba(130, 228, 250, 0.22);
          border-radius: 50%;
          box-shadow:
            0 0 0 2rem rgba(94, 216, 246, 0.025),
            0 0 0 4rem rgba(94, 216, 246, 0.02);
        }

        .track-index,
        .track-art strong,
        .equalizer {
          position: relative;
          z-index: 1;
        }

        .track-index {
          color: rgba(185, 239, 250, 0.68);
          font-family: monospace;
          font-size: 0.65rem;
          letter-spacing: 0.14em;
        }

        .track-art strong {
          font-size: clamp(1.8rem, 4vw, 3.4rem);
          line-height: 0.95;
        }

        .equalizer {
          height: 22px;
          display: flex;
          align-items: end;
          gap: 3px;
        }

        .equalizer i {
          width: 3px;
          height: 35%;
          background: #92e9f8;
          box-shadow: 0 0 8px rgba(101, 220, 245, 0.62);
          animation: equalizer 1.2s ease-in-out infinite alternate;
        }

        .equalizer i:nth-child(2) {
          height: 80%;
          animation-delay: 180ms;
        }

        .equalizer i:nth-child(3) {
          height: 50%;
          animation-delay: 360ms;
        }

        .equalizer i:nth-child(4) {
          height: 100%;
          animation-delay: 540ms;
        }

        .track-details {
          display: flex;
          flex-direction: column;
          flex: 1;
          padding: 1rem 0.2rem 0.15rem;
        }

        .track-details h3 {
          margin: 0.85rem 0 0.25rem;
          font-size: 1.35rem;
          letter-spacing: 0;
        }

        .track-details .artist-name {
          margin: 0;
          font-size: 0.8rem;
        }

        .track-note {
          flex: 1;
          margin: 0.9rem 0 1rem;
          color: rgba(212, 238, 243, 0.62);
          font-size: 0.82rem;
          line-height: 1.6;
        }

        .incoming-signal {
          display: grid;
          place-items: center;
          min-height: 152px;
          padding: 1rem;
          border: 1px solid rgba(136, 226, 247, 0.15);
          border-radius: 8px;
          background: rgba(1, 9, 14, 0.4);
          color: rgba(176, 232, 243, 0.6);
          font-family: monospace;
          font-size: 0.66rem;
          letter-spacing: 0.12em;
          text-align: center;
          text-transform: uppercase;
        }

        .artist-section {
          display: grid;
          grid-template-columns: minmax(0, 1.05fr) minmax(320px, 0.95fr);
          gap: clamp(2rem, 7vw, 6rem);
          padding: clamp(1.5rem, 5vw, 4rem);
        }

        .artist-feature-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.65rem;
        }

        .artist-feature {
          min-height: 7rem;
          padding: 1rem;
          border: 1px solid rgba(144, 229, 249, 0.18);
          border-radius: 6px;
          background: rgba(14, 48, 63, 0.35);
        }

        .artist-feature:last-child {
          grid-column: 1 / -1;
        }

        .artist-feature span {
          color: #77d8e9;
          font-family: monospace;
          font-size: 0.65rem;
          letter-spacing: 0.12em;
        }

        .artist-feature p {
          margin: 1.1rem 0 0;
          color: #e6f9fc;
          font-size: 0.88rem;
          font-weight: 700;
          line-height: 1.4;
        }

        .music-footer {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          margin-top: 4rem;
          padding-top: 1.2rem;
          border-top: 1px solid rgba(139, 225, 246, 0.18);
          color: rgba(177, 226, 236, 0.52);
          font-size: 0.68rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .music-footer a {
          color: #93e3f2;
        }

        @keyframes sonarPulse {
          from {
            width: 0;
            height: 0;
            opacity: 0.75;
          }
          to {
            width: 100%;
            height: 100%;
            opacity: 0;
          }
        }

        @keyframes sonarSweep {
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes recordSpin {
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes equalizer {
          to {
            height: 100%;
          }
        }

        @media (max-width: 920px) {
          .music-hero,
          .featured-record,
          .artist-section {
            grid-template-columns: 1fr;
          }

          .music-hero {
            min-height: auto;
            padding-bottom: 3rem;
          }

          .hero-sonar {
            min-height: 26rem;
          }

          .featured-art {
            min-height: 24rem;
          }

          .track-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 640px) {
          .music-shell {
            width: min(100% - 24px, 1180px);
            padding-top: 6.5rem;
          }

          .music-hero {
            gap: 1rem;
          }

          .hero-copy h1 {
            font-size: clamp(4rem, 22vw, 6rem);
          }

          .hero-sonar {
            min-height: 20rem;
          }

          .telemetry {
            right: auto;
            bottom: 0;
          }

          .section-heading,
          .music-footer {
            align-items: start;
            flex-direction: column;
          }

          .section-heading > p {
            text-align: left;
          }

          .featured-record {
            padding: 0.75rem;
          }

          .featured-art {
            min-height: 19rem;
          }

          .record-sleeve {
            width: 84%;
          }

          .track-grid,
          .artist-feature-grid {
            grid-template-columns: 1fr;
          }

          .artist-feature:last-child {
            grid-column: auto;
          }

          .music-button,
          .music-link {
            width: 100%;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .sonar-origin span,
          .sonar-origin i,
          .hero-disc,
          .equalizer i {
            animation: none;
          }

          .music-button,
          .music-link,
          .track-card {
            transition: none;
          }
        }
      `}</style>
    </>
  );
}

function SpotifyPlayer({ title, src }: { title: string; src: string }) {
  return (
    <div className="spotify-shell">
      <iframe
        title={title}
        src={src}
        height="152"
        loading="lazy"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      />
    </div>
  );
}

function TrackCard({ track, index }: { track: Track; index: number }) {
  return (
    <article className="track-card">
      <div className="track-art">
        <span className="track-index">
          SIGNAL {String(index).padStart(3, "0")}
        </span>
        <div className="equalizer" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
        <strong>{track.title}</strong>
      </div>
      <div className="track-details">
        <div className="tag-row">
          <span>{track.status}</span>
          <span>{track.tag}</span>
          <span>{track.project}</span>
        </div>
        <h3>{track.title}</h3>
        <p className="artist-name">{track.artist}</p>
        <p className="track-note">{track.note}</p>
        {track.spotifyEmbed ? (
          <SpotifyPlayer title={`${track.title} by ${track.artist}`} src={track.spotifyEmbed} />
        ) : (
          <div className="incoming-signal">Remaster signal incoming</div>
        )}
      </div>
    </article>
  );
}
