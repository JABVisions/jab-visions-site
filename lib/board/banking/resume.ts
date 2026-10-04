export const BOARD_RESUME_PAY_DROP_KEY = "jab_board_resume_pay_drop";

export function markResumePayDrop() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BOARD_RESUME_PAY_DROP_KEY, "1");
}

export function consumeResumePayDrop() {
  if (typeof window === "undefined") return false;
  const marked = window.localStorage.getItem(BOARD_RESUME_PAY_DROP_KEY) === "1";
  window.localStorage.removeItem(BOARD_RESUME_PAY_DROP_KEY);
  return marked;
}

export function shouldResumePayDrop() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("pay") === "compose" || window.localStorage.getItem(BOARD_RESUME_PAY_DROP_KEY) === "1";
}
