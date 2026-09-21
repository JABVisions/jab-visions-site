"use client";

import { useEffect, useState } from "react";

import ProjectNotebook from "@/app/components/board/ProjectNotebook";
import {
  BOARD_PROJECT_NOTEBOOK_EVENT,
  closeProjectNotebook,
  createProjectDrop,
  openProjectRoom,
  type ProjectNotebookDetail,
} from "@/lib/board/projectNotebookBus";

export default function ProjectNotebookWindow() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onNotebook = (event: Event) => {
      const detail = (event as CustomEvent<ProjectNotebookDetail>).detail;
      const action = detail?.action || "open";
      if (action === "close") {
        setOpen(false);
        return;
      }
      if (action === "toggle") {
        setOpen((current) => !current);
        return;
      }
      setOpen(true);
      if (detail?.projectId) openProjectRoom(detail.projectId);
    };
    window.addEventListener(BOARD_PROJECT_NOTEBOOK_EVENT, onNotebook as EventListener);
    return () => window.removeEventListener(BOARD_PROJECT_NOTEBOOK_EVENT, onNotebook as EventListener);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div className="projectNotebookPopup" role="dialog" aria-modal="true" aria-label="Project Notebook">
      <button
        type="button"
        className="projectNotebookPopupBackdrop"
        aria-label="Close Project Notebook"
        onClick={() => {
          setOpen(false);
          closeProjectNotebook();
        }}
      />
      <div className="projectNotebookPopupFrame">
        <div className="projectNotebookPopupChrome">
          <div className="min-w-0">
            <div className="text-[11px] tracking-[0.34em] text-cyan-50/72">DROP PAD WINDOW</div>
            <div className="mt-1 text-lg font-semibold text-white/90">Project Notebook</div>
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              closeProjectNotebook();
            }}
            className="rounded-2xl border border-white/18 bg-white/10 px-4 py-2 text-sm text-white/84 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] hover:bg-white/14 transition"
          >
            Close
          </button>
        </div>
        <div className="projectNotebookPopupBody" data-space-scroll>
          <ProjectNotebook
            bigger
            limit={40}
            onCreateProject={() => {
              setOpen(false);
              createProjectDrop();
            }}
            onOpenProject={(projectId) => {
              openProjectRoom(projectId);
              setOpen(false);
              closeProjectNotebook();
            }}
          />
        </div>
      </div>
      <style jsx>{`
        .projectNotebookPopup {
          position: fixed;
          inset: 0;
          z-index: 140;
          display: grid;
          place-items: center;
          padding: 18px 14px 120px;
        }
        .projectNotebookPopupBackdrop {
          position: absolute;
          inset: 0;
          border: 0;
          background:
            radial-gradient(circle at center, rgba(195, 255, 244, 0.08), transparent 34%),
            rgba(4, 6, 14, 0.62);
          backdrop-filter: blur(8px);
        }
        .projectNotebookPopupFrame {
          position: relative;
          z-index: 1;
          width: min(920px, calc(100vw - 24px));
          height: min(82vh, 860px);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border-radius: 34px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.16), rgba(190, 245, 255, 0.08) 18%, rgba(26, 34, 52, 0.72) 46%, rgba(9, 14, 28, 0.86) 100%);
          box-shadow:
            0 24px 120px rgba(0, 0, 0, 0.42),
            0 0 90px rgba(160, 255, 238, 0.12),
            inset 0 1px 0 rgba(255, 255, 255, 0.4);
          backdrop-filter: blur(30px);
        }
        .projectNotebookPopupChrome {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.14);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.04));
        }
        .projectNotebookPopupBody {
          min-height: 0;
          flex: 1;
          overflow: auto;
          padding: 16px;
        }
        @media (max-width: 720px) {
          .projectNotebookPopup {
            padding: 0;
            place-items: stretch;
          }
          .projectNotebookPopupFrame {
            width: 100vw;
            height: 100dvh;
            border-radius: 0;
          }
        }
      `}</style>
    </div>
  );
}
