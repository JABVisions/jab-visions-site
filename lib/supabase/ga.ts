declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}

export const trackEvent = (event: string, params: Record<string, any> = {}) => {
  if (typeof window === "undefined") return;
  if (!window.gtag) return;
  window.gtag("event", event, params);
};
