import { create } from "zustand";

interface UIState {
  // Mobile nav
  isMobileNavOpen: boolean;
  openMobileNav: () => void;
  closeMobileNav: () => void;
  toggleMobileNav: () => void;

  // Search modal
  isSearchOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  toggleSearch: () => void;

  // Quick view modal
  isQuickViewOpen: boolean;
  quickViewProductId: string | null;
  openQuickView: (productId: string) => void;
  closeQuickView: () => void;

  // Auth modal
  isAuthModalOpen: boolean;
  authModalView: "login" | "register" | "forgot-password";
  openAuthModal: (view?: "login" | "register" | "forgot-password") => void;
  closeAuthModal: () => void;
  setAuthModalView: (view: "login" | "register" | "forgot-password") => void;

  // Header scroll state
  isHeaderScrolled: boolean;
  setHeaderScrolled: (scrolled: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  // Mobile nav
  isMobileNavOpen: false,
  openMobileNav: () => set({ isMobileNavOpen: true }),
  closeMobileNav: () => set({ isMobileNavOpen: false }),
  toggleMobileNav: () =>
    set((state) => ({ isMobileNavOpen: !state.isMobileNavOpen })),

  // Search modal
  isSearchOpen: false,
  openSearch: () => set({ isSearchOpen: true }),
  closeSearch: () => set({ isSearchOpen: false }),
  toggleSearch: () => set((state) => ({ isSearchOpen: !state.isSearchOpen })),

  // Quick view modal
  isQuickViewOpen: false,
  quickViewProductId: null,
  openQuickView: (productId) =>
    set({ isQuickViewOpen: true, quickViewProductId: productId }),
  closeQuickView: () =>
    set({ isQuickViewOpen: false, quickViewProductId: null }),

  // Auth modal
  isAuthModalOpen: false,
  authModalView: "login",
  openAuthModal: (view = "login") =>
    set({ isAuthModalOpen: true, authModalView: view }),
  closeAuthModal: () => set({ isAuthModalOpen: false }),
  setAuthModalView: (view) => set({ authModalView: view }),

  // Header scroll state
  isHeaderScrolled: false,
  setHeaderScrolled: (scrolled) => set({ isHeaderScrolled: scrolled }),
}));
