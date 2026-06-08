'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import Navbar from '../components/Navbar';

const RYDERZ = [
  {
    id: 'rubi',
    name: 'Rubi Wong',
    title: 'The Red Ryder',
    img: '/assets/chaeyeon-kim-headshot.jpeg',
    signalArt: '/assets/those-ryderz/rubi-signal-art.jpg',
    aura: 'red',
    performer: 'Chaeyeon Kim',
    flaw: 'Envy',
    ability: 'Duplication, empathic awareness, red light blade',
    profile:
      'Rubi carries confidence like armor, but underneath the shine is the ache of feeling overlooked. Her power splits her into multiples, forcing her to face every version of herself she tries to outrun.',
    signal:
      'Unstable brilliance, multiplied desire, emotional precision.',
  },
  {
    id: 'leo',
    name: 'Leo Montana',
    title: 'The Yellow Ryder',
    img: '/assets/haylee-brown-headshot.jpeg',
    signalArt: '/assets/those-ryderz/leo-signal-art.jpg',
    aura: 'yellow',
    performer: 'Haylee Brown',
    flaw: 'Pride',
    ability: 'Super speed, kinetic impact, spiked knuckles',
    profile:
      'Leo is fashion, pressure, ego, and command wrapped into one dangerous spark. She moves faster than most people can understand her, but pride keeps her from slowing down long enough to be truly seen.',
    signal:
      'High velocity aura, elevated self-image, fracture risk under humiliation.',
  },
  {
    id: 'aaron',
    name: 'Aaron Addams',
    title: 'The Black Ryder',
    img: '/assets/hadi-taloustan-headshot.jpg',
    signalArt: '/assets/those-ryderz/aaron-signal-art.jpg',
    aura: 'black',
    performer: 'Hadi Taloustan',
    flaw: 'Greed',
    ability: 'Teleportation, shadow movement, black aura axe',
    profile:
      'Aaron is soft-spoken, observant, and harder to read than he looks. His greed is not just about wanting more. It is about wanting to keep what makes him feel safe, even when his heart is split between loyalty and longing.',
    signal:
      'Spatial distortion, guarded attachment, emotional concealment.',
  },
  {
    id: 'zoe',
    name: 'Zoe Folie',
    title: 'The Blue Ryder',
    img: '/assets/aria-patterson-headshot.jpg',
    signalArt: '/assets/those-ryderz/zoe-signal-art.jpg',
    aura: 'blue',
    performer: 'Aria Patterson',
    flaw: 'Lust',
    ability: 'Force fields, levitation, blue energy projection',
    profile:
      'Zoe is bubbly, reckless, romantic, and louder than the pain she refuses to explain. Her aura protects her body before she learns how to protect her spirit.',
    signal:
      'Defensive glamour, unstable longing, high-impact emotional discharge.',
  },
  {
    id: 'keven',
    name: 'Keven Hart',
    title: 'The Pink Ryder',
    img: '/assets/john_andy_headshot.jpg',
    signalArt: '/assets/those-ryderz/keven-signal-art.jpg',
    aura: 'pink',
    performer: 'John Andy',
    flaw: 'Sloth',
    ability: 'Invisibility, phasing, phantom movement, pink energy darts',
    profile:
      'Keven looks unserious until the room needs saving. His stillness is mistaken for weakness, but his power lives in patience, timing, and the strange courage to disappear before striking back.',
    signal:
      'Phantom pulse, delayed activation, redeemer-class anomaly.',
  },
] as const;

const statusItems = [
  ['Feature Film', 'The first story'],
  ['Pitch Deck in Development', 'Current focus'],
  ['Proof-of-Concept', 'Existing material'],
  ['JAB Visions Original', 'Independent IP'],
];

export default function ThoseRyderz() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedRyderId, setSelectedRyderId] = useState<string | null>(null);
  const selectedRyder = RYDERZ.find((ryder) => ryder.id === selectedRyderId);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const fontSize = 14;
    const chars = '0123456789ABCDEFJABλΔΨRYDRZ';
    let drops: number[] = [];
    let animationFrame = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      drops = Array(Math.ceil(canvas.width / fontSize)).fill(0);
    };

    const draw = () => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#31ff96';
      ctx.font = `${fontSize}px monospace`;

      drops.forEach((drop, index) => {
        const character = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(character, index * fontSize, drop * fontSize);
        drops[index] += 1;

        if (drops[index] * fontSize > canvas.height && Math.random() > 0.982) {
          drops[index] = 0;
        }
      });

      animationFrame = requestAnimationFrame(draw);
    };

    resize();
    draw();
    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <main className="ryderz-page">
      <canvas ref={canvasRef} className="ryderz-matrix" aria-hidden="true" />
      <div className="ryderz-scanlines" aria-hidden="true" />
      <Navbar />

      <div className="pitch-shell">
        <section className="hero-tile">
          <div className="transmission-bar">
            <span>JAB VISIONS FEATURE TRANSMISSION</span>
            <span>FIRST FILM / SIGNAL ACTIVE</span>
          </div>

          <div className="hero-layout">
            <div className="logo-frame">
              <video
                className="hero-video"
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                aria-label="Animated Those Ryderz signal origin logo"
              >
                <source src="/videos/those-ryderz-intro.mp4" type="video/mp4" />
              </video>
              <div className="logo-shade" />
              <div className="video-scan" aria-hidden="true" />
              <div className="logo-caption">
                <span>THOSE RYDERZ / SIGNAL ORIGIN</span>
                <strong>The Spirit Never Left. It Found New Hosts.</strong>
              </div>
            </div>

            <div className="project-copy">
              <p className="project-eyebrow">A JAB Visions feature film in development</p>
              <h1>Seven sins. Five signals. One awakening.</h1>
              <p className="project-lead">
                When the seven bowls of Armageddon release living auras into the
                world, five young people are drawn into a supernatural awakening
                that will change them forever. Marked by power, burdened by flaw,
                and tied to the language of the seven deadly sins, the first Ryderz
                emerge as both answers to prayer and vessels of dangerous
                transformation.
              </p>
              <p className="project-note">
                Those Ryderz is the first film transmission into a larger mythology:
                a coming-of-age supernatural superhero drama where faith, identity,
                desire, and destruction collide. This page centers the first story,
                the proof, the prophecy, and the five young people carrying the
                signal forward.
              </p>
              <div className="signal-tags" aria-label="Those Ryderz development signals">
                <span>Supernatural Superhero Drama</span>
                <span>Seven Deadly Sins Mythology</span>
                <span>First-Film Transmission</span>
                <span>JAB Visions Original</span>
                <span>Proof-of-Concept in Motion</span>
              </div>
            </div>
          </div>
        </section>

        <section className="character-tile">
          <div className="section-heading">
            <div>
              <p>CAST SIGNAL / 001</p>
              <h2>The First Five Ryderz</h2>
            </div>
            <p className="section-intro">
              Five flawed young people become living answers to prayer, each carrying
              an aura born from the seven bowls of Armageddon.
            </p>
          </div>

          <div className="character-grid">
            {RYDERZ.map((ryder) => (
              <button
                type="button"
                className={`character-card aura-${ryder.aura}${
                  selectedRyderId === ryder.id ? ' character-card-active' : ''
                }`}
                key={ryder.name}
                onClick={() =>
                  setSelectedRyderId(selectedRyderId === ryder.id ? null : ryder.id)
                }
                aria-expanded={selectedRyderId === ryder.id}
                aria-controls="ryder-profile-bubble"
              >
                <div
                  className="character-icon"
                  style={{
                    position: 'relative',
                    width: '100%',
                    aspectRatio: '1 / 1',
                    overflow: 'hidden',
                  }}
                >
                  <Image
                    src={ryder.img}
                    alt={ryder.name}
                    fill
                    unoptimized
                    className="character-image"
                    style={{ objectFit: 'cover' }}
                  />
                  <div className="icon-glass" />
                </div>
                <div className="character-copy">
                  <span>{ryder.title}</span>
                  <h3>{ryder.name}</h3>
                  <p>Signal active</p>
                </div>
              </button>
            ))}
          </div>

          {selectedRyder && (
            <aside
              id="ryder-profile-bubble"
              className={`profile-bubble aura-${selectedRyder.aura}`}
              aria-live="polite"
            >
              <div className="profile-scan" aria-hidden="true" />
              <div className="profile-bubble-header">
                <div>
                  <span>Transmission Opened</span>
                  <strong>Ryder profile detected</strong>
                </div>
                <button
                  type="button"
                  className="profile-close"
                  onClick={() => setSelectedRyderId(null)}
                  aria-label="Close character profile"
                >
                  ×
                </button>
              </div>

              <div className="profile-bubble-layout">
                <div className="profile-identity">
                  <div
                    className="profile-mini-icon"
                    style={{
                      position: 'relative',
                      width: 78,
                      height: 78,
                      overflow: 'hidden',
                    }}
                  >
                    <Image
                      src={selectedRyder.img}
                      alt=""
                      fill
                      unoptimized
                      className="character-image"
                      style={{ objectFit: 'cover' }}
                    />
                  </div>
                  <div>
                    <p>{selectedRyder.title}</p>
                    <h3>{selectedRyder.name}</h3>
                    <span className="cast-credit">
                      Portrayed by {selectedRyder.performer}
                    </span>
                  </div>
                </div>

                <div className="profile-stats">
                  <div>
                    <span>Spiritual flaw</span>
                    <strong>{selectedRyder.flaw}</strong>
                  </div>
                  <div>
                    <span>Aura ability</span>
                    <strong>{selectedRyder.ability}</strong>
                  </div>
                </div>
              </div>

              {selectedRyder.signalArt && (
                <figure className="profile-signal-art">
                  <div className="profile-signal-art-frame">
                    <Image
                      src={selectedRyder.signalArt}
                      alt={`${selectedRyder.name} concept art`}
                      width={1600}
                      height={1800}
                      unoptimized
                    />
                    <div className="profile-signal-art-scan" aria-hidden="true" />
                  </div>
                  <figcaption>
                    <span>Signal artifact / concept art</span>
                    <strong>{selectedRyder.title}</strong>
                  </figcaption>
                </figure>
              )}

              <p className="profile-text">{selectedRyder.profile}</p>
              <p className="signal-reading">
                <span>Signal reading</span>
                {selectedRyder.signal}
              </p>
            </aside>
          )}
        </section>

        <section className="status-tile">
          <div className="status-copy">
            <p>Current Stage</p>
            <h2>Building the pitch from what already exists.</h2>
            <span>
              Those Ryderz is being prepared as a first-film pitch deck and
              proof-of-concept presentation for future development, production
              support, and distribution conversations.
            </span>
          </div>

          <div className="status-grid">
            {statusItems.map(([title, note]) => (
              <div className="status-pill" key={title}>
                <span>{note}</span>
                <strong>{title}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>

      <style jsx global>{`
        .ryderz-page {
          position: relative;
          min-height: 100vh;
          overflow-x: hidden;
          background: #010402;
          color: #f5fff8;
          padding-bottom: 72px;
          isolation: isolate;
        }

        .ryderz-matrix {
          position: fixed;
          inset: 0;
          z-index: -3;
          width: 100%;
          height: 100%;
          opacity: 0.42;
          background: #000;
        }

        .ryderz-scanlines {
          position: fixed;
          inset: 0;
          z-index: -1;
          pointer-events: none;
          opacity: 0.22;
          background-image: repeating-linear-gradient(
            0deg,
            rgba(255, 255, 255, 0.025) 0,
            rgba(255, 255, 255, 0.025) 1px,
            transparent 1px,
            transparent 4px
          );
        }

        .pitch-shell {
          width: min(1240px, calc(100% - 40px));
          margin: 0 auto;
          padding-top: 112px;
          display: grid;
          gap: 22px;
        }

        .hero-tile,
        .character-tile,
        .status-tile {
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(166, 255, 0, 0.27);
          border-radius: 24px;
          background: rgba(3, 15, 8, 0.82);
          box-shadow:
            0 0 40px rgba(157, 255, 0, 0.14),
            inset 0 0 40px rgba(157, 255, 0, 0.045);
          backdrop-filter: blur(18px);
        }

        .hero-tile::before,
        .character-tile::before,
        .status-tile::before {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            linear-gradient(90deg, rgba(49, 255, 150, 0.06), transparent 36%),
            repeating-linear-gradient(
              90deg,
              transparent 0,
              transparent 79px,
              rgba(166, 255, 0, 0.04) 80px
            );
        }

        .transmission-bar {
          position: relative;
          z-index: 1;
          display: flex;
          justify-content: space-between;
          gap: 18px;
          padding: 13px 18px;
          border-bottom: 1px solid rgba(166, 255, 0, 0.2);
          color: #9effc4;
          font: 700 0.7rem/1.3 monospace;
          letter-spacing: 0.15em;
        }

        .hero-layout {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: minmax(0, 1.25fr) minmax(330px, 0.75fr);
          gap: 28px;
          padding: 28px;
        }

        .logo-frame {
          position: relative;
          min-height: 510px;
          overflow: hidden;
          border: 1px solid rgba(199, 236, 255, 0.25);
          border-radius: 18px;
          background: #020502;
          box-shadow: inset 0 0 42px rgba(0, 0, 0, 0.55);
        }

        .hero-video {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          display: block;
          object-fit: cover;
          object-position: center;
          background: #000;
        }

        .logo-shade {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            180deg,
            rgba(0, 0, 0, 0.08),
            transparent 42%,
            rgba(0, 0, 0, 0.88)
          );
        }

        .video-scan {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.22;
          mix-blend-mode: screen;
          background:
            linear-gradient(
              110deg,
              transparent 28%,
              rgba(113, 255, 173, 0.18) 48%,
              transparent 68%
            ),
            repeating-linear-gradient(
              0deg,
              rgba(255, 255, 255, 0.035) 0,
              rgba(255, 255, 255, 0.035) 1px,
              transparent 1px,
              transparent 4px
            );
          animation: heroSignalSweep 5.5s ease-in-out infinite;
        }

        .logo-caption {
          position: absolute;
          left: 22px;
          right: 22px;
          bottom: 20px;
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 20px;
        }

        .logo-caption span,
        .project-eyebrow,
        .section-heading > div > p,
        .status-copy > p {
          color: #77ffae;
          font: 800 0.7rem/1.3 monospace;
          letter-spacing: 0.17em;
          text-transform: uppercase;
        }

        .logo-caption strong {
          max-width: 340px;
          color: #f7fff9;
          font-size: 0.78rem;
          line-height: 1.45;
          text-align: right;
          letter-spacing: 0.04em;
        }

        .project-copy {
          align-self: center;
          padding: 18px 12px;
        }

        .project-copy h1,
        .section-heading h2,
        .status-copy h2 {
          margin: 12px 0 16px;
          color: #f8fff9;
          letter-spacing: 0;
        }

        .project-copy h1 {
          max-width: 470px;
          font-size: clamp(2.45rem, 5vw, 4.8rem);
          line-height: 0.98;
          text-shadow: 0 0 24px rgba(49, 255, 150, 0.16);
        }

        .project-lead {
          margin: 0;
          color: rgba(244, 255, 248, 0.88);
          font-size: 1.04rem;
          line-height: 1.72;
        }

        .project-note {
          margin: 18px 0 0;
          padding-left: 15px;
          border-left: 2px solid rgba(255, 221, 87, 0.72);
          color: rgba(218, 236, 224, 0.72);
          font-size: 0.9rem;
          line-height: 1.65;
        }

        .signal-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 24px;
        }

        .signal-tags span {
          padding: 8px 10px;
          border: 1px solid rgba(49, 255, 150, 0.23);
          border-radius: 999px;
          background: rgba(49, 255, 150, 0.065);
          color: rgba(219, 255, 231, 0.88);
          font: 700 0.65rem/1.2 monospace;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .character-tile {
          padding: 28px;
        }

        .section-heading {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: minmax(240px, 0.75fr) minmax(300px, 1.25fr);
          align-items: end;
          gap: 24px;
          margin-bottom: 24px;
        }

        .section-heading h2,
        .status-copy h2 {
          margin-bottom: 0;
          font-size: clamp(1.8rem, 4vw, 3.15rem);
          line-height: 1.05;
        }

        .section-intro {
          max-width: 650px;
          margin: 0;
          color: rgba(225, 241, 230, 0.72);
          line-height: 1.65;
        }

        .character-grid {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 12px;
        }

        .character-card {
          appearance: none;
          width: 100%;
          min-width: 0;
          padding: 13px;
          border: 1px solid rgba(255, 255, 255, 0.13);
          border-radius: 16px;
          background: rgba(0, 0, 0, 0.42);
          color: inherit;
          cursor: pointer;
          font: inherit;
          text-align: left;
          transition:
            transform 180ms ease,
            border-color 180ms ease,
            box-shadow 180ms ease;
        }

        .character-card:hover {
          transform: translateY(-3px);
          border-color: var(--aura);
          box-shadow: 0 0 24px var(--aura-soft);
        }

        .character-card:focus-visible {
          outline: 2px solid var(--aura);
          outline-offset: 4px;
        }

        .character-card-active {
          transform: translateY(-3px);
          border-color: var(--aura);
          background:
            radial-gradient(circle at 50% 18%, var(--aura-soft), transparent 48%),
            rgba(0, 0, 0, 0.56);
          box-shadow:
            0 0 30px var(--aura-soft),
            inset 0 0 26px var(--aura-soft);
        }

        .character-icon {
          position: relative;
          width: 100%;
          aspect-ratio: 1;
          overflow: hidden;
          border: 2px solid var(--aura);
          border-radius: 50%;
          box-shadow:
            0 0 18px var(--aura-soft),
            inset 0 0 22px rgba(0, 0, 0, 0.46);
        }

        .character-image {
          object-fit: cover;
        }

        .icon-glass {
          position: absolute;
          inset: 0;
          border-radius: inherit;
          box-shadow:
            inset 0 0 20px var(--aura-soft),
            inset 0 0 0 5px rgba(255, 255, 255, 0.04);
        }

        .character-copy {
          padding: 15px 2px 3px;
        }

        .character-copy span {
          color: var(--aura);
          font: 800 0.62rem/1.2 monospace;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .character-copy h3 {
          margin: 7px 0 5px;
          overflow-wrap: anywhere;
          color: white;
          font-size: 1rem;
          letter-spacing: 0;
        }

        .character-copy p {
          margin: 0;
          color: rgba(228, 239, 232, 0.47);
          font: 700 0.62rem/1.2 monospace;
          letter-spacing: 0.11em;
          text-transform: uppercase;
        }

        .profile-bubble {
          position: relative;
          z-index: 1;
          margin-top: 22px;
          padding: 26px;
          overflow: hidden;
          border: 1px solid var(--aura);
          border-radius: 20px;
          background:
            radial-gradient(circle at 10% 0%, var(--aura-soft), transparent 34%),
            linear-gradient(135deg, rgba(4, 20, 10, 0.95), rgba(0, 8, 4, 0.9));
          box-shadow:
            0 0 34px var(--aura-soft),
            inset 0 0 32px rgba(166, 255, 0, 0.045);
          animation: profileBubbleOpen 260ms ease-out;
        }

        .profile-scan {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(
            90deg,
            transparent,
            color-mix(in srgb, var(--aura) 12%, transparent),
            transparent
          );
          transform: translateX(-100%);
          animation: profileScan 2.8s ease-in-out infinite;
        }

        .profile-bubble-header {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
          padding-bottom: 17px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .profile-bubble-header span,
        .profile-bubble-header strong {
          display: block;
          font-family: monospace;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        .profile-bubble-header span {
          margin-bottom: 5px;
          color: var(--aura);
          font-size: 0.67rem;
          font-weight: 800;
        }

        .profile-bubble-header strong {
          color: rgba(238, 255, 243, 0.62);
          font-size: 0.62rem;
        }

        .profile-close {
          appearance: none;
          display: grid;
          flex: 0 0 auto;
          place-items: center;
          width: 34px;
          height: 34px;
          padding: 0;
          border: 1px solid color-mix(in srgb, var(--aura) 45%, transparent);
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.34);
          color: white;
          cursor: pointer;
          font-size: 1.25rem;
          line-height: 1;
        }

        .profile-close:hover,
        .profile-close:focus-visible {
          border-color: var(--aura);
          box-shadow: 0 0 18px var(--aura-soft);
          outline: none;
        }

        .profile-bubble-layout {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: minmax(260px, 0.72fr) minmax(360px, 1.28fr);
          gap: 24px;
          padding-top: 22px;
        }

        .profile-identity {
          display: flex;
          align-items: center;
          gap: 17px;
          min-width: 0;
        }

        .profile-mini-icon {
          position: relative;
          flex: 0 0 auto;
          width: 78px;
          height: 78px;
          overflow: hidden;
          border: 2px solid var(--aura);
          border-radius: 50%;
          box-shadow: 0 0 22px var(--aura-soft);
        }

        .profile-identity p {
          margin: 0 0 5px;
          color: var(--aura);
          font: 800 0.67rem/1.25 monospace;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .profile-identity h3 {
          margin: 0;
          color: #f8fff9;
          font-size: clamp(1.7rem, 4vw, 3rem);
          line-height: 1;
          letter-spacing: 0;
          text-shadow: 0 0 20px var(--aura-soft);
        }

        .cast-credit {
          display: block;
          width: fit-content;
          margin-top: 9px;
          padding-top: 7px;
          border-top: 1px solid color-mix(in srgb, var(--aura) 26%, transparent);
          color: rgba(226, 239, 230, 0.52);
          font: 700 0.59rem/1.3 monospace;
          letter-spacing: 0.09em;
          text-transform: uppercase;
        }

        .profile-stats {
          display: grid;
          grid-template-columns: 0.65fr 1.35fr;
          gap: 10px;
        }

        .profile-stats div {
          min-width: 0;
          padding: 13px 14px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 13px;
          background: rgba(0, 0, 0, 0.27);
        }

        .profile-stats span,
        .profile-stats strong {
          display: block;
        }

        .profile-stats span {
          margin-bottom: 6px;
          color: rgba(225, 244, 231, 0.48);
          font: 700 0.59rem/1.2 monospace;
          letter-spacing: 0.11em;
          text-transform: uppercase;
        }

        .profile-stats strong {
          color: rgba(249, 255, 250, 0.88);
          font-size: 0.83rem;
          line-height: 1.45;
        }

        .profile-text,
        .signal-reading {
          position: relative;
          z-index: 1;
        }

        .profile-signal-art {
          position: relative;
          z-index: 1;
          width: min(45%, 369px);
          margin: 24px auto 0;
        }

        .profile-signal-art-frame {
          position: relative;
          overflow: hidden;
          border: 0;
          border-radius: 14px;
          background: transparent;
          box-shadow: 0 0 26px var(--aura-soft);
        }

        .profile-signal-art-frame img {
          display: block;
          width: 100%;
          height: auto;
          object-fit: initial;
        }

        .profile-signal-art-scan {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.22;
          background:
            linear-gradient(
              110deg,
              transparent 32%,
              color-mix(in srgb, var(--aura) 22%, transparent) 50%,
              transparent 68%
            ),
            repeating-linear-gradient(
              0deg,
              rgba(255, 255, 255, 0.035) 0,
              rgba(255, 255, 255, 0.035) 1px,
              transparent 1px,
              transparent 4px
            );
        }

        .profile-signal-art figcaption {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          padding: 10px 2px 0;
          color: rgba(229, 246, 234, 0.48);
          font: 700 0.58rem/1.35 monospace;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .profile-signal-art figcaption strong {
          color: var(--aura);
          text-align: right;
        }

        .profile-text {
          max-width: 940px;
          margin: 22px 0 0;
          color: rgba(239, 250, 242, 0.82);
          font-size: 0.95rem;
          line-height: 1.72;
        }

        .signal-reading {
          margin: 18px 0 0;
          padding: 13px 15px;
          border-left: 2px solid var(--aura);
          background: rgba(0, 0, 0, 0.22);
          color: color-mix(in srgb, var(--aura) 76%, white);
          font: 700 0.76rem/1.6 monospace;
          letter-spacing: 0.035em;
          text-shadow: 0 0 14px var(--aura-soft);
        }

        .signal-reading span {
          display: block;
          margin-bottom: 3px;
          color: rgba(229, 246, 234, 0.45);
          font-size: 0.58rem;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        .aura-red {
          --aura: #ff5c66;
          --aura-soft: rgba(255, 48, 64, 0.32);
        }

        .aura-yellow {
          --aura: #ffe85c;
          --aura-soft: rgba(255, 230, 0, 0.3);
        }

        .aura-black {
          --aura: #a7adb0;
          --aura-soft: rgba(0, 0, 0, 0.78);
        }

        .aura-blue {
          --aura: #66cfff;
          --aura-soft: rgba(40, 180, 255, 0.32);
        }

        .aura-pink {
          --aura: #ff68d7;
          --aura-soft: rgba(255, 85, 204, 0.32);
        }

        .status-tile {
          display: grid;
          grid-template-columns: minmax(300px, 0.9fr) minmax(380px, 1.1fr);
          gap: 28px;
          padding: 28px;
        }

        .status-copy,
        .status-grid {
          position: relative;
          z-index: 1;
        }

        .status-copy span {
          display: block;
          max-width: 650px;
          color: rgba(225, 241, 230, 0.7);
          line-height: 1.65;
        }

        .status-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .status-pill {
          min-width: 0;
          padding: 16px;
          border: 1px solid rgba(199, 236, 255, 0.16);
          border-radius: 14px;
          background: rgba(199, 236, 255, 0.055);
        }

        .status-pill span {
          display: block;
          margin-bottom: 7px;
          color: #9effc4;
          font: 700 0.61rem/1.2 monospace;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .status-pill strong {
          color: #f7fff9;
          font-size: 0.88rem;
          line-height: 1.3;
        }

        @keyframes profileBubbleOpen {
          from {
            opacity: 0;
            transform: translateY(14px) scale(0.988);
          }

          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes profileScan {
          0% {
            transform: translateX(-100%);
          }

          46%,
          100% {
            transform: translateX(100%);
          }
        }

        @keyframes heroSignalSweep {
          0%,
          18% {
            transform: translateX(-28%);
            opacity: 0.08;
          }

          48% {
            opacity: 0.26;
          }

          82%,
          100% {
            transform: translateX(28%);
            opacity: 0.08;
          }
        }

        @media (max-width: 980px) {
          .pitch-shell {
            padding-top: 96px;
          }

          .hero-layout,
          .status-tile {
            grid-template-columns: 1fr;
          }

          .logo-frame {
            min-height: 440px;
          }

          .project-copy {
            padding: 8px 2px;
          }

          .character-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .profile-bubble-layout {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 680px) {
          .pitch-shell {
            width: min(100% - 20px, 1240px);
            padding-top: 86px;
          }

          .transmission-bar,
          .logo-caption,
          .section-heading {
            display: block;
          }

          .transmission-bar span:last-child {
            display: block;
            margin-top: 5px;
            color: rgba(158, 255, 196, 0.56);
          }

          .hero-layout,
          .character-tile,
          .status-tile {
            padding: 14px;
          }

          .logo-frame {
            min-height: 360px;
          }

          .logo-caption strong {
            display: block;
            margin-top: 5px;
            text-align: left;
          }

          .section-intro {
            margin-top: 13px;
          }

          .character-grid,
          .status-grid,
          .profile-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .profile-bubble {
            padding: 20px;
          }

          .profile-signal-art {
            width: min(62%, 369px);
          }
        }

        @media (max-width: 430px) {
          .character-grid {
            grid-template-columns: 1fr;
          }

          .character-card {
            display: grid;
            grid-template-columns: 96px minmax(0, 1fr);
            align-items: center;
            gap: 14px;
          }

          .character-copy {
            padding: 0;
          }

          .profile-stats {
            grid-template-columns: 1fr;
          }

          .profile-identity h3 {
            font-size: 1.65rem;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .ryderz-matrix {
            opacity: 0.22;
          }

          .character-card {
            transition: none;
          }
        }
      `}</style>
    </main>
  );
}
