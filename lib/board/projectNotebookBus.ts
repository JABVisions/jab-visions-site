export const BOARD_PROJECT_NOTEBOOK_EVENT = "board:project-notebook";
export const BOARD_OPEN_PROJECT_EVENT = "board:projects:open";
export const BOARD_CREATE_PROJECT_EVENT = "board:projects:create";

export type ProjectNotebookAction = "open" | "close" | "toggle";

export type ProjectNotebookDetail = {
  action: ProjectNotebookAction;
  projectId?: string | null;
};

export function openProjectNotebook(projectId?: string | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(BOARD_PROJECT_NOTEBOOK_EVENT, {
      detail: { action: "open", projectId: projectId || null },
    })
  );
}

export function closeProjectNotebook() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(BOARD_PROJECT_NOTEBOOK_EVENT, {
      detail: { action: "close" },
    })
  );
}

export function openProjectRoom(projectId: string) {
  if (typeof window === "undefined") return;
  const id = String(projectId || "").trim();
  if (!id) return;
  window.dispatchEvent(
    new CustomEvent(BOARD_OPEN_PROJECT_EVENT, {
      detail: { projectId: id },
    })
  );
}

export function createProjectDrop() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(BOARD_CREATE_PROJECT_EVENT));
}
