"use client";

import { useState, useEffect } from "react";

type Breakpoint = "sm" | "md" | "lg" | "xl" | "2xl";

const breakpoints: Record<Breakpoint, number> = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
};

/**
 * Hook to check if a media query matches
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);

    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

/**
 * Hook to check if viewport is at least a certain breakpoint
 */
export function useBreakpoint(breakpoint: Breakpoint): boolean {
  return useMediaQuery(`(min-width: ${breakpoints[breakpoint]}px)`);
}

/**
 * Hook to check if viewport is below a certain breakpoint
 */
export function useBreakpointDown(breakpoint: Breakpoint): boolean {
  return useMediaQuery(`(max-width: ${breakpoints[breakpoint] - 1}px)`);
}

/**
 * Hook to check if device is mobile
 */
export function useIsMobile(): boolean {
  return useBreakpointDown("md");
}

/**
 * Hook to check if device is tablet
 */
export function useIsTablet(): boolean {
  const isAboveSm = useBreakpoint("sm");
  const isBelowLg = useBreakpointDown("lg");
  return isAboveSm && isBelowLg;
}

/**
 * Hook to check if device is desktop
 */
export function useIsDesktop(): boolean {
  return useBreakpoint("lg");
}
