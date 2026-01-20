"use client";

import React, { useEffect, useMemo, useState } from "react";

import WorkDesk from "@/app/components/board/WorkDesk";
import ProjectNotebook from "@/app/components/board/ProjectNotebook";
import QuickActionsRemote, { type DropPadApp } from "@/app/components/board/QuickActionsRemote";

// ✅ swap DropPadOS -> DropPadOS.v3 (your patch file)
import DropPadOS from "@/app/components/board/DropPadOS.v3";

import { supabaseBrowser } from "@/lib/supabase/browser";

import { POWER_EVENT, readPower, togglePower, setPower } from "@/lib/board/powerBus";
import { DROP_PAD_APP_EVENT, readDropPadApp, setDropPadApp } from "@/lib/board/dropPadNavBus";

export default function WorkPage() {
  // ✅ single supabase client instance for the page lifetime
  const sb = useMemo(() => supabaseBrowser(), []);

  const [osOn, setOsOn] = useState(false);
  const [osApp, setOsApp] = useState<DropPadApp>("home");

  // ✅ auth hydrate gate
  const [authReady, setAuthReady] = useState(false);

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
    let cancelled = false;

    const run = async () => {
      // Hydrate session cookies on first load.
      await sb.auth.getSession();
      if (!cancelled) setAuthReady(true);
    };

    run();

    const { data: sub } = sb.auth.onAuthStateChange(() => {
      if (!cancelled) setAuthReady(true);
    });

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe?.();
    };
  }, [sb]);

  const goHome = () => setDropPadApp("home");

  const goOff = () => {
    setDropPadApp("home");
    setPower(false);
  };

  return (
    <main className="work-root">
      <section className="work-row">
        <div className="panel desk">
          <WorkDesk />
        </div>

        <div className="panel notebook">
          <ProjectNotebook />
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
            {/* ✅ Gate render until Supabase session has hydrated */}
            {authReady ? (
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
            ) : (
              <div className="h-full grid place-items-center text-sm text-white/60">
                Initializing Supabase…
              </div>
            )}
          </div>
        </div>
      </section>

      <style jsx>{`
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
        }

        .notebook {
          min-height: 740px;
          min-width: 0;
        }

        .qar {
          min-height: 740px;
          display: grid;
          place-items: start center;
          padding: 10px;
          overflow: visible;
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
        }

        .droppad-shell {
          width: 100%;
          max-width: 430px;
          height: 700px;
        }

        @media (max-width: 1360px) {
          .work-row {
            grid-template-columns: 360px minmax(420px, 1fr) 190px;
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
