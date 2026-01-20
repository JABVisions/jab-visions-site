"use client";

import Link from "next/link";

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/**
 * WorkCallsTile
 * Half-width tile companion to DropConsole on Feed.
 * Styled to match Board Profile tiles:
 * - white tile
 * - soft shaded edges
 * - subtle light-blue rim line
 */
export default function WorkCallsTile() {
  return (
    <section className="boardTile">
      <div className="tileInner">
        <div className="tileHeader">
          <div>
            <div className="tileTitle">Work Calls</div>
            <div className="tileSub">
              Roles, collabs, paid gigs, and production needs.
            </div>
          </div>

          <Link href="/board/work" className="tilePill">
            Open Work
          </Link>
        </div>

        <div className="tileBody">
          <div className="callCard">
            <div className="callTop">
              <div className="callTag">FEATURED</div>
              <div className="callTime">Today</div>
            </div>

            <div className="callRole">Production Assistant</div>
            <div className="callMeta">NYC • Set days + errands • Paid</div>

            <div className="callActions">
              <Link href="/board/work" className="btnSoft">
                View details
              </Link>
              <Link href="/board/work" className="btnDark">
                Apply
              </Link>
            </div>
          </div>

          <div className="callCard">
            <div className="callTop">
              <div className="callTag">NEW</div>
              <div className="callTime">This week</div>
            </div>

            <div className="callRole">Actor Self-Tape</div>
            <div className="callMeta">Drama / Sci-Fi • Open call</div>

            <div className="callActions">
              <Link href="/board/work" className="btnSoft">
                View details
              </Link>
              <Link href="/board/work" className="btnDark">
                Submit
              </Link>
            </div>
          </div>

          <div className="hint">
            This tile will pull from the Work database next. For now it’s a
            polished placeholder.
          </div>
        </div>
      </div>

      {/* Local styles to match your Profile tile vibe */}
      <style jsx>{`
        .boardTile {
          border-radius: 28px;
          background: rgba(255, 255, 255, 0.72);
          border: 1px solid rgba(0, 0, 0, 0.08);
          box-shadow:
            0 18px 45px rgba(0, 0, 0, 0.08),
            0 0 0 3px rgba(170, 230, 255, 0.55); /* light-blue rim line */
          overflow: hidden;
        }

        .tileInner {
          border-radius: 28px;
          padding: 18px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0.78));
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.9),
            inset 0 -10px 22px rgba(0, 0, 0, 0.04); /* shaded edges */
        }

        .tileHeader {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          padding: 6px 6px 14px 6px;
        }

        .tileTitle {
          font-size: 18px;
          font-weight: 700;
          color: rgba(0, 160, 80, 1);
          letter-spacing: 0.02em;
        }

        .tileSub {
          margin-top: 4px;
          font-size: 12px;
          color: rgba(0, 0, 0, 0.55);
        }

        .tilePill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 9px 14px;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.85);
          color: rgba(167, 243, 208, 1);
          border: 1px solid rgba(0, 255, 150, 0.25);
          box-shadow: 0 0 22px rgba(0, 255, 150, 0.18);
          font-size: 12px;
          font-weight: 600;
          text-decoration: none;
          white-space: nowrap;
        }

        .tileBody {
          display: grid;
          gap: 12px;
          padding: 0 6px 6px 6px;
        }

        .callCard {
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.8);
          border: 1px solid rgba(0, 0, 0, 0.10);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.85),
            0 10px 22px rgba(0, 0, 0, 0.06);
          padding: 14px;
        }

        .callTop {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 10px;
        }

        .callTag {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.18em;
          color: rgba(255, 0, 190, 0.92);
          text-transform: uppercase;
        }

        .callTime {
          font-size: 11px;
          color: rgba(0, 0, 0, 0.45);
        }

        .callRole {
          font-size: 15px;
          font-weight: 750;
          color: rgba(0, 0, 0, 0.82);
        }

        .callMeta {
          margin-top: 4px;
          font-size: 12px;
          color: rgba(0, 0, 0, 0.55);
        }

        .callActions {
          margin-top: 12px;
          display: flex;
          gap: 10px;
        }

        .btnSoft {
          flex: 1;
          text-align: center;
          padding: 9px 12px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.75);
          border: 1px solid rgba(0, 0, 0, 0.12);
          color: rgba(0, 0, 0, 0.72);
          text-decoration: none;
          font-size: 12px;
          font-weight: 600;
        }

        .btnDark {
          flex: 1;
          text-align: center;
          padding: 9px 12px;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.86);
          border: 1px solid rgba(0, 255, 150, 0.22);
          color: rgba(167, 243, 208, 1);
          text-decoration: none;
          font-size: 12px;
          font-weight: 700;
          box-shadow: 0 0 22px rgba(0, 255, 150, 0.14);
        }

        .hint {
          margin-top: 4px;
          font-size: 11px;
          color: rgba(0, 0, 0, 0.45);
          padding: 2px 4px;
        }
      `}</style>
    </section>
  );
}
