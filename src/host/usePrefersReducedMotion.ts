import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Track the learner's reduced-motion preference.
 *
 * Reduced motion must remove non-essential motion without changing instructional
 * meaning or any authoritative value (docs/ACCESSIBILITY.md).
 */
export function usePrefersReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState<boolean>(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const list = window.matchMedia(QUERY);
    const onChange = (event: MediaQueryListEvent) => setPrefersReduced(event.matches);
    list.addEventListener("change", onChange);
    setPrefersReduced(list.matches);
    return () => list.removeEventListener("change", onChange);
  }, []);

  return prefersReduced;
}
