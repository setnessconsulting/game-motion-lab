import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Track the learner's reduced-motion preference.
 *
 * Reduced motion must remove non-essential motion without changing instructional
 * meaning or any authoritative value (docs/ACCESSIBILITY.md).
 *
 * A media query is an external store, so this subscribes to it with
 * `useSyncExternalStore` rather than mirroring it into state from an effect. That keeps the
 * first render already correct (no animated frame is painted before the preference is
 * read) and means a preference change during a session is picked up without a cascading
 * re-render.
 */

function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const list = window.matchMedia(QUERY);
  list.addEventListener("change", onStoreChange);
  return () => list.removeEventListener("change", onStoreChange);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(QUERY).matches;
}

/** Non-browser render: motion is never assumed to be reduced. */
function getServerSnapshot(): boolean {
  return false;
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
