export const DROP_PAD_APP_EVENT = "jab:drop_pad_app";
const APP_KEY = "jab_drop_pad_app_v1";

export type DropPadApp = "home" | "assets" | "projects" | "portfolio" | "work_calls";

export function readDropPadApp(): DropPadApp {
  try {
    const raw = localStorage.getItem(APP_KEY);
    if (
      raw === "home" ||
      raw === "assets" ||
      raw === "projects" ||
      raw === "portfolio" ||
      raw === "work_calls"
    ) {
      return raw;
    }
    return "home";
  } catch {
    return "home";
  }
}

export function setDropPadApp(app: DropPadApp) {
  try {
    localStorage.setItem(APP_KEY, app);
  } catch {}

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(DROP_PAD_APP_EVENT));
  }
}
