"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

const GLITCH_REPORTS_STORAGE_KEY = "jab_board_glitch_reports_v1";

type GlitchPage =
  | "Home"
  | "Feed"
  | "Forums"
  | "Work"
  | "Profile"
  | "Options"
  | "Explore"
  | "Friend Zone"
  | "Onboarding"
  | "Other";

type GlitchSeverity =
  | "Minor visual issue"
  | "Confusing behavior"
  | "Broken feature"
  | "Page/app crash";

type GlitchReport = {
  id: string;
  createdAt: string;
  page: GlitchPage;
  severity: GlitchSeverity;
  description: string;
  optionalLink: string;
  userAgent?: string;
  currentPath?: string;
};

type Props = {
  compact?: boolean;
  className?: string;
};

const pageOptions: GlitchPage[] = [
  "Home",
  "Feed",
  "Forums",
  "Work",
  "Profile",
  "Options",
  "Explore",
  "Friend Zone",
  "Onboarding",
  "Other",
];

const severityOptions: GlitchSeverity[] = [
  "Minor visual issue",
  "Confusing behavior",
  "Broken feature",
  "Page/app crash",
];

function safeReadReports() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(GLITCH_REPORTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function defaultPageFromPath(pathname: string): GlitchPage {
  if (pathname.startsWith("/board/profile")) return "Profile";
  if (pathname.startsWith("/board/feed")) return "Feed";
  if (pathname.startsWith("/board/forums")) return "Forums";
  if (pathname.startsWith("/board/work")) return "Work";
  if (pathname.startsWith("/board/friend-zone")) {
    return "Friend Zone";
  }
  if (pathname.startsWith("/board/options")) return "Options";
  if (pathname.startsWith("/board/explore")) return "Explore";
  if (pathname.startsWith("/board/onboarding")) return "Onboarding";
  if (pathname === "/board" || pathname === "/") return "Home";
  return "Other";
}

export default function GlitchReportButton({ compact = false, className = "" }: Props) {
  const pathname = usePathname();
  const defaultPage = useMemo(() => defaultPageFromPath(pathname || ""), [pathname]);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [page, setPage] = useState<GlitchPage>(defaultPage);
  const [severity, setSeverity] = useState<GlitchSeverity>("Confusing behavior");
  const [optionalLink, setOptionalLink] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitMessage, setSubmitMessage] = useState(
    "Glitch report saved. Thank you for helping improve Board."
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closePanel();
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
    // closePanel intentionally stays local to the current render state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function resetForm() {
    setDescription("");
    setPage(defaultPage);
    setSeverity("Confusing behavior");
    setOptionalLink("");
  }

  function closePanel() {
    setOpen(false);
    setSubmitted(false);
    setSubmitMessage("Glitch report saved. Thank you for helping improve Board.");
    resetForm();
  }

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = description.trim();
    if (!trimmed) return;

    const report: GlitchReport = {
      id: `glitch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      page,
      severity,
      description: trimmed,
      optionalLink: optionalLink.trim(),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      currentPath: typeof window !== "undefined" ? window.location.pathname : pathname || undefined,
    };

    try {
      const reports = safeReadReports();
      window.localStorage.setItem(
        GLITCH_REPORTS_STORAGE_KEY,
        JSON.stringify([report, ...reports].slice(0, 80))
      );
      window.dispatchEvent(new CustomEvent("board:glitch-report:saved", { detail: report }));
    } catch {
      // Local beta reporting should never interrupt Board itself.
    }

    try {
      const response = await fetch("/api/board/glitch-reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(report),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        setSubmitMessage(
          payload?.message ||
            "Glitch report saved locally. Supabase sync needs setup before reports can land in the support table."
        );
      } else {
        setSubmitMessage("Glitch report saved to Board support. Thank you for helping improve Board.");
      }
    } catch {
      setSubmitMessage(
        "Glitch report saved locally. Board could not reach Supabase from this browser session."
      );
    }

    setSubmitted(true);
    resetForm();
  }

  const modal =
    mounted && open ? (
      <div
        className="glitchOverlay"
        role="dialog"
        aria-modal="true"
        aria-label="Report a Board glitch"
        onClick={closePanel}
      >
        <div className="glitchPanel" onClick={(event) => event.stopPropagation()}>
          <div className="glitchPanelGlow" aria-hidden />
          <div className="glitchPanelHead">
            <div>
              <p className="glitchKicker">BOARD BETA SUPPORT</p>
              <h2>Report a Board Glitch</h2>
              <p>Tell us what happened so Board can keep improving during beta.</p>
            </div>
            <button type="button" className="glitchClose" onClick={closePanel} aria-label="Close glitch report">
              ×
            </button>
          </div>

          {submitted ? (
            <div className="glitchSuccess">
              {submitMessage}
            </div>
          ) : null}

          <form className="glitchForm" onSubmit={submitReport}>
            <label>
              <span>What happened?</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Describe the glitch, what you clicked, or what felt broken."
                rows={5}
                required
              />
            </label>

            <div className="glitchGrid">
              <label>
                <span>Where did it happen?</span>
                <select value={page} onChange={(event) => setPage(event.target.value as GlitchPage)}>
                  {pageOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>How serious is it?</span>
                <select
                  value={severity}
                  onChange={(event) => setSeverity(event.target.value as GlitchSeverity)}
                >
                  {severityOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              <span>Optional screenshot or link</span>
              <input
                value={optionalLink}
                onChange={(event) => setOptionalLink(event.target.value)}
                placeholder="Paste a screenshot URL, page link, or short note."
              />
            </label>

            <div className="glitchActions">
              <button type="button" className="glitchCancel" onClick={closePanel}>
                Cancel
              </button>
              <button type="submit" className="glitchSubmit">
                Send Glitch Report
              </button>
            </div>
          </form>
        </div>
      </div>
    ) : null;

  return (
    <>
      <button
        type="button"
        className={`glitchBtn ${compact ? "glitchBtnCompact" : ""} ${className}`}
        onClick={() => {
          setPage(defaultPage);
          setSubmitted(false);
          setOpen(true);
        }}
        aria-label="Report a Board glitch"
      >
        <span className="glitchMark" aria-hidden>
          !
        </span>
        <span className="glitchText">Report Glitch</span>
      </button>

      {modal ? createPortal(modal, document.body) : null}

      <style jsx global>{`
        .glitchBtn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 38px;
          padding: 9px 13px;
          border-radius: 999px;
          border: 1px solid rgba(255, 212, 76, 0.6);
          background:
            linear-gradient(135deg, rgba(255, 255, 255, 0.92), rgba(255, 247, 198, 0.86)),
            rgba(255, 255, 255, 0.8);
          color: rgba(35, 31, 20, 0.92);
          box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.5),
            0 0 22px rgba(255, 221, 87, 0.22);
          font-family: inherit;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          white-space: nowrap;
          cursor: pointer;
          transition:
            transform 160ms ease,
            box-shadow 160ms ease,
            filter 160ms ease;
        }

        .glitchBtn:hover {
          transform: translateY(-1px);
          filter: brightness(1.03);
          box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.62),
            0 0 26px rgba(255, 221, 87, 0.32);
        }

        .glitchBtnCompact {
          min-height: 34px;
          padding: 8px 11px;
          font-size: 10px;
        }

        .glitchMark {
          display: grid;
          place-items: center;
          width: 18px;
          height: 18px;
          border-radius: 999px;
          background: #ff4fd8;
          color: white;
          box-shadow: 0 0 16px rgba(255, 79, 216, 0.34);
          line-height: 1;
        }

        .glitchOverlay {
          position: fixed;
          inset: 0;
          z-index: 99999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }

        .glitchPanel {
          position: relative;
          width: min(92vw, 540px);
          max-height: 86vh;
          overflow-y: auto;
          overflow-x: hidden;
          border-radius: 28px;
          border: 1px solid rgba(255, 255, 255, 0.65);
          background:
            radial-gradient(circle at 16% 0%, rgba(210, 255, 0, 0.23), transparent 36%),
            radial-gradient(circle at 92% 0%, rgba(255, 79, 216, 0.14), transparent 34%),
            linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(248, 255, 226, 0.95));
          box-shadow: 0 30px 90px rgba(0, 0, 0, 0.35);
          padding: 24px;
          color: rgba(24, 23, 18, 0.94);
        }

        .glitchPanelGlow {
          pointer-events: none;
          position: absolute;
          inset: -40px;
          background:
            radial-gradient(circle at 18% 12%, rgba(210, 255, 0, 0.26), transparent 34%),
            radial-gradient(circle at 86% 18%, rgba(255, 79, 216, 0.18), transparent 34%);
          filter: blur(10px);
        }

        .glitchPanelHead,
        .glitchForm,
        .glitchSuccess {
          position: relative;
          z-index: 1;
        }

        .glitchPanelHead {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
        }

        .glitchKicker {
          margin: 0 0 8px;
          color: rgba(31, 145, 86, 0.98);
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }

        .glitchPanel h2 {
          margin: 0;
          color: rgba(43, 146, 74, 0.98);
          font-size: clamp(1.7rem, 3vw, 2.25rem);
          line-height: 1;
          font-weight: 950;
          letter-spacing: -0.03em;
        }

        .glitchPanelHead p:last-child {
          margin: 8px 0 0;
          color: rgba(38, 38, 30, 0.68);
          font-size: 13px;
          line-height: 1.5;
          font-weight: 750;
        }

        .glitchClose {
          display: grid;
          place-items: center;
          width: 38px;
          height: 38px;
          flex: 0 0 auto;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          background: rgba(255, 255, 255, 0.74);
          color: rgba(0, 0, 0, 0.62);
          cursor: pointer;
          font-size: 24px;
          line-height: 1;
        }

        .glitchForm {
          margin-top: 20px;
          display: grid;
          gap: 14px;
        }

        .glitchGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .glitchForm label {
          display: grid;
          gap: 7px;
        }

        .glitchForm label span {
          color: rgba(0, 0, 0, 0.52);
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }

        .glitchForm textarea,
        .glitchForm select,
        .glitchForm input {
          width: 100%;
          border-radius: 18px;
          border: 1px solid rgba(0, 0, 0, 0.11);
          background: rgba(255, 255, 255, 0.78);
          color: rgba(17, 17, 17, 0.86);
          font: inherit;
          font-size: 14px;
          font-weight: 750;
          padding: 12px 14px;
          outline: none;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.62);
        }

        .glitchForm textarea:focus,
        .glitchForm select:focus,
        .glitchForm input:focus {
          border-color: rgba(255, 79, 216, 0.52);
          box-shadow: 0 0 0 4px rgba(255, 79, 216, 0.12);
        }

        .glitchSuccess {
          margin-top: 16px;
          border-radius: 18px;
          border: 1px solid rgba(31, 145, 86, 0.2);
          background: rgba(210, 255, 208, 0.46);
          color: rgba(31, 120, 70, 0.96);
          font-size: 13px;
          font-weight: 900;
          padding: 12px 14px;
        }

        .glitchActions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 4px;
        }

        .glitchCancel,
        .glitchSubmit {
          border-radius: 999px;
          padding: 11px 15px;
          font-family: inherit;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          cursor: pointer;
        }

        .glitchCancel {
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(255, 255, 255, 0.72);
          color: rgba(0, 0, 0, 0.62);
        }

        .glitchSubmit {
          border: 1px solid rgba(35, 35, 28, 0.92);
          background: rgba(35, 35, 28, 0.96);
          color: rgba(211, 255, 224, 0.98);
          box-shadow: 0 12px 26px rgba(0, 0, 0, 0.16);
        }

        @media (max-width: 640px) {
          .glitchText {
            display: none;
          }

          .glitchGrid {
            grid-template-columns: 1fr;
          }

          .glitchPanel {
            padding: 20px;
          }
        }
      `}</style>
    </>
  );
}
