"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import WorkDesk from "@/app/components/board/WorkDesk";
import ProjectCenter from "@/app/components/board/ProjectCenter";
import QuickActionsRemote, { type DropPadApp } from "@/app/components/board/QuickActionsRemote";

// ✅ swap DropPadOS -> DropPadOS.v3 (your patch file)
import DropPadOS from "@/app/components/board/DropPadOS.v3";

import { supabaseBrowser } from "@/lib/supabase/browser";
import {
  readBoardProjects,
  resolveBoardProjects,
  writeBoardProjects,
} from "@/lib/board/projects";

import { POWER_EVENT, readPower, togglePower, setPower } from "@/lib/board/powerBus";
import { DROP_PAD_APP_EVENT, readDropPadApp, setDropPadApp } from "@/lib/board/dropPadNavBus";

export default function WorkPage() {
  // ✅ single supabase client instance for the page lifetime
  const sb = useMemo<SupabaseClient | null>(() => {
    try {
      return supabaseBrowser();
    } catch (error) {
      console.error("Failed to initialize Supabase browser client.", error);
      return null;
    }
  }, []);

  const [osOn, setOsOn] = useState(false);
  const [osApp, setOsApp] = useState<DropPadApp>("home");

  useEffect(() => {
    // initial sync for power + app
    setOsOn(readPower());
    setOsApp(readDropPadApp() as DropPadApp);

    const onPowerEvt = () => setOsOn(readPower());
    window.addEventListener(POWER_EVENT, onPowerEvt as EventListener);

    const onAppEvt = () => setOsApp(readDropPadApp() as DropPadApp);
    window.addEventListener(DROP_PAD_APP_EVENT, onAppEvt as EventListener);

    return () => {
      window.removeEventListener(POWER_EVENT, onPowerEvt as EventListener);
      window.removeEventListener(DROP_PAD_APP_EVENT, onAppEvt as EventListener);
    };
  }, []);

  // ✅ warm up supabase session on this page
  useEffect(() => {
    if (!sb) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        // Hydrate session cookies on first load, but don't let auth boot block the Work board.
        await Promise.race([
          sb.auth.getSession(),
          new Promise((resolve) => window.setTimeout(resolve, 2500)),
        ]);
      } catch (error) {
        console.error("Supabase session warmup failed on Work board.", error);
      } finally {
        if (!cancelled) {
          // Auth warmup is intentionally non-blocking; the Work board should stay visible.
        }
      }
    };

    run();

    const { data: sub } = sb.auth.onAuthStateChange(() => {
      if (!cancelled) {
        // Session changes are handled by child components that need auth.
      }
    });

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe?.();
    };
  }, [sb]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = readBoardProjects();
    const resolved = resolveBoardProjects();

    if (resolved.length > stored.length) {
      writeBoardProjects(resolved);
    }
  }, []);

  const goHome = () => setDropPadApp("home");
  const openProjects = () => {
    setPower(true, "project_notebook");
    setDropPadApp("projects");
  };
  const createProjectDrop = () => {
    setPower(true, "project_notebook");
    setDropPadApp("projects");
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("board:projects:create"));
    }
  };

  const goOff = () => {
    setDropPadApp("home");
    setPower(false);
  };

  return (
    <main className="work-root">
      <section className="work-row">
        <div className="panel desk">
          <WorkDesk
            onToggleDropPadPower={() => { }}
            // Future: wire Pay Drops to National Bank Card or another marketplace payout provider once payout routing is finalized.
            onManagePayDrops={() => { }}
          />

        </div>

        <div className="panel notebook">
          <ProjectCenter />
        </div>

        <div className="panel qar">
          <div className="qar-shell">
            <QuickActionsRemote
              osOn={osOn}
              activeApp={osApp}
              onPower={() => togglePower()}
              onHome={goHome}
              onOff={goOff}
              onNavigate={(app) => setDropPadApp(app)}
            />
          </div>
        </div>

        <div className="panel droppad">
          <div className="droppad-shell">
            <DropPadOS
              osOn={osOn}
              osApp={osApp}
              onPower={() => togglePower()}
              onHome={goHome}
              onOff={goOff}
              onNavigate={(app) => setDropPadApp(app)}
              subtitle="Drop Pad OS"
              title="DROP PAD OS"
            />
          </div>
        </div>
      </section>

      <style>{`
        .work-root {
          min-height: 100vh;
          padding: 22px 18px;
        }

        .work-row {
          max-width: 1760px;
          margin: 0 auto;
          display: grid;
          gap: 16px;
          align-items: stretch;
          grid-template-columns: 360px minmax(420px, 1fr) 190px minmax(520px, 1.15fr);
        }

        .panel {
          border-radius: 18px;
          overflow: hidden;
          background: rgba(12, 12, 12, 0.88);
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
        }

        .desk {
          min-height: 740px;
          order: 1;
        }

        .notebook {
          min-height: 740px;
          min-width: 0;
          order: 2;
        }

        .qar {
          min-height: 740px;
          display: grid;
          place-items: start center;
          padding: 10px;
          overflow: visible;
          order: 3;
        }

        .qar-shell {
          width: 100%;
          max-width: 170px;
          height: 560px;
          display: grid;
          place-items: center;
        }

        .droppad {
          min-height: 740px;
          min-width: 0;
          display: grid;
          place-items: start center;
          padding: 10px;
          overflow: visible;
          order: 4;
        }

        .droppad-shell {
          width: 100%;
          max-width: 430px;
          height: 700px;
          overflow: visible;
          position: relative;
          z-index: 2;
        }

        @media (max-width: 1360px) {
          .work-row {
            grid-template-columns: 360px minmax(420px, 1fr);
          }
          .droppad {
            order: 2;
          }
          .notebook {
            order: 3;
          }
          /* Quick Actions Remote is a desktop-only panel for now. */
          .qar {
            display: none;
          }
          .droppad {
            grid-column: 1 / -1;
            min-height: 760px;
          }
          .droppad-shell {
            max-width: 520px;
          }
        }

        @media (max-width: 980px) {
          .work-row {
            grid-template-columns: 1fr;
          }
          .desk {
            order: 1;
          }
          .droppad {
            order: 2;
          }
          .qar {
            order: 3;
          }
          .notebook {
            order: 4;
          }
          .desk,
          .notebook,
          .qar,
          .droppad {
            min-height: unset;
          }
          .qar-shell {
            max-width: 220px;
            height: 360px;
          }
          .droppad-shell {
            max-width: 520px;
            height: 720px;
          }
        }
      `}</style>
    </main>
  );
}
