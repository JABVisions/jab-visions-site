import {
  BOARD_CREATE_PROJECT_EVENT,
  BOARD_OPEN_PROJECT_EVENT,
  BOARD_PROJECT_NOTEBOOK_EVENT,
  closeProjectNotebook,
  createProjectDrop,
  openProjectNotebook,
  openProjectRoom,
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

openProjectNotebook("project_ryder");
closeProjectNotebook();
openProjectRoom("project_ryder");
createProjectDrop();

assert(events[0]?.type === BOARD_PROJECT_NOTEBOOK_EVENT, "notebook open uses the popup bus");
assert(
  (events[0]?.detail as { action?: string; projectId?: string }).action === "open",
  "notebook open action is open"
);
assert(
  (events[0]?.detail as { projectId?: string }).projectId === "project_ryder",
  "notebook open can focus a project drop"
);
assert(
  (events[1]?.detail as { action?: string }).action === "close",
  "notebook close does not embed into Drop Pad"
);
assert(
  (events[2]?.detail as { projectId?: string }).projectId === "project_ryder",
  "opening a project drop targets the Work Board project room"
);
assert(events[3]?.type === BOARD_CREATE_PROJECT_EVENT, "new project drop still uses the create event");

window.removeEventListener(BOARD_PROJECT_NOTEBOOK_EVENT, onNotebook);
window.removeEventListener(BOARD_OPEN_PROJECT_EVENT, onNotebook);
window.removeEventListener(BOARD_CREATE_PROJECT_EVENT, onNotebook);

console.log("projectNotebookBus.check.ts: ok");
