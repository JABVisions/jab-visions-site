export const BOARD_PROJECT_NOTEBOOK_EVENT = "board:project-notebook";
export const BOARD_OPEN_PROJECT_EVENT = "board:projects:open";
export const BOARD_CREATE_PROJECT_EVENT = "board:projects:create";

export type ProjectNotebookAction = "open" | "close" | "toggle";
export type ProjectDropClickIntent = "info" | "enter-room";
export type ProjectDropPresentation = "popup" | "embed";

export type ProjectNotebookDetail = {
  action: ProjectNotebookAction;
  projectId?: string | null;
};

export function presentationForProjectDropClick(
  intent: ProjectDropClickIntent = "info"
): ProjectDropPresentation {
  return intent === "enter-room" ? "embed" : "popup";
}

export function projectDropInfoHref(projectId?: string | null) {
  const id = String(projectId || "").trim();
  if (!id) return "/board/work";
  return `/board/work?project=${encodeURIComponent(id)}`;
}

export function projectIdFromWorkHref(href?: string | null) {
  const value = String(href || "").trim();
  if (!value) return null;
  try {
    const url = new URL(value, "https://jabvisions.com");
    if (!url.pathname.startsWith("/board/work")) return null;
    const id = String(url.searchParams.get("project") || url.searchParams.get("projectId") || "").trim();
    return id || null;
  } catch {
    return null;
  }
}

export function openProjectNotebook(projectId?: string | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(BOARD_PROJECT_NOTEBOOK_EVENT, {
      detail: { action: "open", projectId: projectId || null },
    })
  );
}

export function openProjectDropInfo(projectId: string) {
  const id = String(projectId || "").trim();
  if (!id) {
    openProjectNotebook();
    return;
  }
  openProjectNotebook(id);
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
