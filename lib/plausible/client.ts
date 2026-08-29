export type PlausibleClientOptions = {
  props?: Record<string, string | number | boolean>;
};

declare global {
  interface Window {
    plausible?: (
      event: string,
      options?: PlausibleClientOptions
    ) => void;
  }
}

export function trackPlausibleClientEvent(
  name: string,
  props?: Record<string, string | number | boolean>
): void {
  if (typeof window === "undefined" || typeof window.plausible !== "function") {
    return;
  }

  window.plausible(name, props ? { props } : undefined);
}
