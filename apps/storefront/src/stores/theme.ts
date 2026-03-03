import { create } from 'zustand';
import { ThemeType } from '@/config/theme-config';

interface ThemeState {
  currentTheme: ThemeType;
  previousTheme: ThemeType | null;
  setTheme: (theme: ThemeType) => void;
  resetTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  currentTheme: 'default',
  previousTheme: null,
  
  setTheme: (theme) =>
    set((state) => ({
      previousTheme: state.currentTheme,
      currentTheme: theme,
    })),
  
  resetTheme: () =>
    set((state) => ({
      previousTheme: state.currentTheme,
      currentTheme: 'default',
    })),
}));
