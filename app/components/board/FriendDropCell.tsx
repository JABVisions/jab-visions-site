"use client";

import Link from "next/link";
import React from "react";

export type FriendDropCellProps = {
  name: string;
  avatar?: string | null;
  selected?: boolean;
  /** 0..3: higher = more “interactive glow” */
  tier?: 0 | 1 | 2 | 3;
  onClick?: () => void;
  href?: string;
};

export default function FriendDropCell({
  name,
  avatar = null,
  selected = false,
  tier = 0,
  onClick,
  href,
}: FriendDropCellProps) {
  const className = `fz_orbCell ${selected ? "on" : ""} glow${tier}`;
  const title = href ? `Open ${name}'s Board` : `Message ${name}`;
  const inner = (
    <>
      <div className="fz_orb" aria-hidden>
        <div className="fz_orbInner" aria-hidden>
          <div className="fz_avatarTile" aria-hidden>
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="fz_avatarImg" src={avatar} alt="" />
            ) : (
              <span className="fz_orbEmoji">🙂</span>
            )}
          </div>
        </div>
      </div>

      <div className="fz_orbName">{name}</div>

      <style jsx global>{`
        .fz_orbCell {
          border: none;
          background: transparent;
          padding: 0;
          cursor: pointer;
          min-width: 168px;
          text-align: center;
          user-select: none;
          text-decoration: none;
          display: block;
        }

        .fz_orb {
          width: 132px;
          height: 132px;
          margin: 0 auto;
          border-radius: 999px;
          display: grid;
          place-items: center;

          background:
            radial-gradient(circle at 30% 25%, rgba(255,255,255,0.16), rgba(255,255,255,0.05) 42%, rgba(0,0,0,0.14) 74%),
            linear-gradient(to bottom, rgba(255,255,255,0.06), rgba(0,0,0,0.10));

          border: 1px solid rgba(255,255,255,0.20);

          box-shadow:
            inset 0 0 0 1px rgba(255,255,255,0.06),
            inset 0 -10px 30px rgba(0,0,0,0.20);

          transition: transform 180ms ease, filter 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
          animation: fz_orbPulse 3.8s ease-in-out infinite;
          will-change: transform;
        }

        .fz_orbInner {
          width: 108px;
          height: 108px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.10);
          box-shadow: inset 0 0 16px rgba(255,255,255,0.06);
        }

        .fz_avatarTile {
          width: 88px;
          height: 88px;
          border-radius: 24px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(0,0,0,0.20);
          overflow: hidden;
          display: grid;
          place-items: center;
          animation: fz_tileFloat 2.6s ease-in-out infinite;
        }

        .fz_avatarImg {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .fz_orbEmoji {
          font-size: 32px;
          opacity: 0.9;
        }

        .fz_orbName {
          margin-top: 12px;
          font-size: 14px;
          font-weight: 900;
          letter-spacing: 0.02em;
          color: rgba(255,255,255,0.82);
          width: 168px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .fz_orbCell:hover .fz_orb {
          transform: translateY(-2px);
          filter: brightness(1.06);
          border-color: rgba(255,255,255,0.30);
        }

        .fz_orbCell.on .fz_orb {
          border-color: rgba(255,255,255,0.38);
          box-shadow:
            0 0 0 1px rgba(0,255,150,0.10),
            0 0 22px rgba(255,0,190,0.10),
            inset 0 0 0 1px rgba(255,255,255,0.08);
        }

        /* Interactivity glow tiers */
        .fz_orbCell.glow0 .fz_orb {
          box-shadow:
            inset 0 0 0 1px rgba(255,255,255,0.06),
            inset 0 -10px 30px rgba(0,0,0,0.20);
        }
        .fz_orbCell.glow1 .fz_orb {
          box-shadow:
            0 0 14px rgba(255,255,255,0.08),
            inset 0 0 0 1px rgba(255,255,255,0.06),
            inset 0 -10px 30px rgba(0,0,0,0.20);
        }
        .fz_orbCell.glow2 .fz_orb {
          box-shadow:
            0 0 18px rgba(0,255,150,0.10),
            0 0 14px rgba(255,0,190,0.08),
            inset 0 0 0 1px rgba(255,255,255,0.06),
            inset 0 -10px 30px rgba(0,0,0,0.20);
        }
        .fz_orbCell.glow3 .fz_orb {
          box-shadow:
            0 0 26px rgba(0,255,150,0.14),
            0 0 24px rgba(255,0,190,0.12),
            0 0 16px rgba(255,214,74,0.08),
            inset 0 0 0 1px rgba(255,255,255,0.07),
            inset 0 -10px 30px rgba(0,0,0,0.20);
        }

        @keyframes fz_tileFloat {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
          100% { transform: translateY(0px); }
        }

        @keyframes fz_orbPulse {
          0% { filter: brightness(1); }
          50% { filter: brightness(1.04); }
          100% { filter: brightness(1); }
        }

        @media (prefers-reduced-motion: reduce) {
          .fz_orb,
          .fz_avatarTile {
            animation: none !important;
          }
        }
      `}</style>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className} title={title}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" className={className} onClick={onClick} title={title}>
      {inner}
    </button>
  );
}
