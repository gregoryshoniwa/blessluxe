'use client';

import { useEffect, useCallback } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useThemeStore } from '@/stores/theme';
import { getThemeForCategory, ThemeType } from '@/config/theme-config';

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  /** Primitives only — `searchParams` object identity can change every render and must not be a hook dep. */
  const categoryParam = searchParams.get('category');
  const parentParam = searchParams.get('parent');

  const setTheme = useThemeStore((s) => s.setTheme);
  const resetTheme = useThemeStore((s) => s.resetTheme);

  // Determine theme from path/params
  const determineTheme = useCallback((): ThemeType => {
    // Home page → default theme
    if (pathname === '/' || pathname === '') {
      return 'default';
    }

    // First, check for parent param (used for subcategories like outerwear, accessories)
    if (parentParam) {
      const parentTheme = getThemeForCategory(parentParam);
      if (parentTheme !== 'default') return parentTheme;
    }

    // Check URL search params for category
    if (categoryParam) {
      return getThemeForCategory(categoryParam);
    }

    // Check path segments for category
    const segments = pathname.split('/').filter(Boolean);

    // /shop/women, /shop/men, /shop/children
    if (segments.includes('shop')) {
      const categorySegment = segments[segments.length - 1];
      const theme = getThemeForCategory(categorySegment);
      if (theme !== 'default') return theme;
    }

    // Direct paths like /women, /men, /children
    for (const segment of segments) {
      const theme = getThemeForCategory(segment);
      if (theme !== 'default') return theme;
    }

    return 'default';
  }, [pathname, categoryParam, parentParam]);

  // Apply theme to document (avoid redundant Zustand updates — those retrigger renders and can loop with unstable searchParams)
  useEffect(() => {
    const theme = determineTheme();

    if (theme === 'default') {
      document.body.removeAttribute('data-theme');
      const current = useThemeStore.getState().currentTheme;
      if (current !== 'default') {
        resetTheme();
      }
    } else {
      document.body.setAttribute('data-theme', theme);
      const current = useThemeStore.getState().currentTheme;
      if (current !== theme) {
        setTheme(theme);
      }
    }
  }, [determineTheme, setTheme, resetTheme]);

  return <>{children}</>;
}

export default ThemeProvider;
