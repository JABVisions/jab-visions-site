"use client";

import { useEffect, useState } from "react";

import DropPadPopup from "@/app/components/board/DropPadPopup";
import ProjectNotebook from "@/app/components/board/ProjectNotebook";
import {
  BOARD_PROJECT_NOTEBOOK_EVENT,
  closeProjectNotebook,
  createProjectDrop,
  openProjectDropInfo,
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
      // A focused project Drop belongs in the project-info popup, not this list
      // window and not the in-frame Work Board project room.
      if (detail?.projectId) {
        setOpen(false);
        return;
      }
      if (action === "toggle") {
        setOpen((current) => !current);
        return;
      }
      setOpen(true);
    };
    window.addEventListener(BOARD_PROJECT_NOTEBOOK_EVENT, onNotebook as EventListener);
    return () => window.removeEventListener(BOARD_PROJECT_NOTEBOOK_EVENT, onNotebook as EventListener);
  }, []);

  if (!open) return null;

  return (
    <DropPadPopup
      open={open}
      title="Project Notebook"
      label="Project Notebook"
      onClose={() => {
        setOpen(false);
        closeProjectNotebook();
      }}
    >
      <ProjectNotebook
        bigger
        limit={40}
        onCreateProject={() => {
          setOpen(false);
          createProjectDrop();
        }}
        onOpenProject={(projectId) => {
          setOpen(false);
          closeProjectNotebook();
          openProjectDropInfo(projectId);
        }}
      />
    </DropPadPopup>
  );
}
