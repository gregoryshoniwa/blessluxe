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
  const { setTheme, resetTheme } = useThemeStore();

  // Determine theme from path/params
  const determineTheme = useCallback((): ThemeType => {
    // Home page → default theme
    if (pathname === '/' || pathname === '') {
      return 'default';
    }

    // First, check for parent param (used for subcategories like outerwear, accessories)
    const parentParam = searchParams.get('parent');
    if (parentParam) {
      const parentTheme = getThemeForCategory(parentParam);
      if (parentTheme !== 'default') return parentTheme;
    }

    // Check URL search params for category
    const categoryParam = searchParams.get('category');
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
  }, [pathname, searchParams]);

  // Apply theme to document
  useEffect(() => {
    const theme = determineTheme();
    
    // Set theme on body element
    if (theme === 'default') {
      document.body.removeAttribute('data-theme');
      resetTheme();
    } else {
      document.body.setAttribute('data-theme', theme);
      setTheme(theme);
    }

    // Cleanup on unmount
    return () => {
      // Keep the theme attribute for smooth transitions
    };
  }, [determineTheme, setTheme, resetTheme]);

  return <>{children}</>;
}

export default ThemeProvider;
