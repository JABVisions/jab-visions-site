import {
  BOARD_CREATE_PROJECT_EVENT,
  BOARD_OPEN_PROJECT_EVENT,
  BOARD_PROJECT_NOTEBOOK_EVENT,
  closeProjectNotebook,
  createProjectDrop,
  openProjectDropInfo,
  openProjectNotebook,
  openProjectRoom,
  presentationForProjectDropClick,
  projectDropInfoHref,
  projectIdFromWorkHref,
} from "./projectNotebookBus";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

if (typeof globalThis.window === "undefined") {
  const target = new EventTarget();
  (globalThis as { window: Window }).window = {
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
  } as Window;
}

const events: Array<{ type: string; detail: unknown }> = [];
const onNotebook = (event: Event) => {
  events.push({ type: event.type, detail: (event as CustomEvent).detail });
};
window.addEventListener(BOARD_PROJECT_NOTEBOOK_EVENT, onNotebook);
window.addEventListener(BOARD_OPEN_PROJECT_EVENT, onNotebook);
window.addEventListener(BOARD_CREATE_PROJECT_EVENT, onNotebook);

openProjectNotebook();
openProjectDropInfo("project_ryder");
closeProjectNotebook();
openProjectRoom("project_ryder");
createProjectDrop();

assert(events[0]?.type === BOARD_PROJECT_NOTEBOOK_EVENT, "notebook list open uses the popup bus");
assert(
  (events[0]?.detail as { action?: string; projectId?: string | null }).action === "open",
  "notebook open action is open"
);
assert(
  (events[0]?.detail as { projectId?: string | null }).projectId == null,
  "notebook list open does not focus a project room"
);
assert(events[1]?.type === BOARD_PROJECT_NOTEBOOK_EVENT, "project drop info uses the popup bus");
assert(
  (events[1]?.detail as { projectId?: string }).projectId === "project_ryder",
  "picking a project drop focuses that drop in the popup"
);
assert(
  events.filter((event) => event.type === BOARD_OPEN_PROJECT_EVENT).length === 1,
  "picking a project drop does not embed the Work Board project room"
);
assert(
  (events[2]?.detail as { action?: string }).action === "close",
  "notebook close does not embed into Drop Pad"
);
assert(events[3]?.type === BOARD_OPEN_PROJECT_EVENT, "explicit Enter Room still uses the room bus");
assert(
  (events[3]?.detail as { projectId?: string }).projectId === "project_ryder",
  "Enter Room can still open the in-frame project room"
);
assert(events[4]?.type === BOARD_CREATE_PROJECT_EVENT, "new project drop still uses the create event");

assert(
  presentationForProjectDropClick("info") === "popup",
  "project drop info clicks stay in a desktop popup"
);
assert(
  presentationForProjectDropClick() === "popup",
  "default project drop click is popup, not the embedded room"
);
assert(
  presentationForProjectDropClick("enter-room") === "embed",
  "explicit Enter Room can still embed the project room"
);
assert(
  projectDropInfoHref("project_ryder") === "/board/work?project=project_ryder",
  "work href carries the project drop id so the popup can reopen"
);
assert(
  projectIdFromWorkHref("/board/work?project=project_ryder") === "project_ryder",
  "work href parser reads the focused project drop"
);
assert(projectIdFromWorkHref("/board/feed") === null, "non-work hrefs are not treated as project popups");

window.removeEventListener(BOARD_PROJECT_NOTEBOOK_EVENT, onNotebook);
window.removeEventListener(BOARD_OPEN_PROJECT_EVENT, onNotebook);
window.removeEventListener(BOARD_CREATE_PROJECT_EVENT, onNotebook);

console.log("projectNotebookBus.check.ts: ok");
