"use client";

export default function DropConsoleSleepDock({ onWake }: { onWake: () => void }) {
  return (
    <div className="dock">
      <div className="dockLeft">
        <div className="dockTitle">DROP CONSOLE</div>
        <div className="dockSub">Sleeping…</div>
      </div>
      <button type="button" className="dockWake" onClick={onWake}>
        WAKE
      </button>

      <style>{`
        .dock {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border-radius: 20px;
          padding: 12px 14px;
          background: rgba(255, 255, 255, 0.92);
          border: 1px solid rgba(0, 0, 0, 0.08);
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.12);
        }
        .dockTitle {
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgba(0, 170, 160, 1);
        }
        .dockSub {
          margin-top: 6px;
          font-size: 12px;
          font-weight: 800;
          color: rgba(0, 0, 0, 0.48);
        }
        .dockWake {
          border-radius: 16px;
          padding: 12px 14px;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          border: 1px solid rgba(0, 0, 0, 0.16);
          background: rgba(0, 0, 0, 0.84);
          color: rgba(200, 255, 230, 0.95);
          cursor: pointer;
          transition: transform 160ms ease, filter 160ms ease;
        }
        .dockWake:hover {
          transform: translateY(-1px);
          filter: brightness(1.02);
        }
      `}</style>
    </div>
  );
}
