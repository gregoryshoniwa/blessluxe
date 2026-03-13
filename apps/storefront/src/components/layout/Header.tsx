"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search, User, Heart, ShoppingBag, Menu, ChevronDown } from "lucide-react";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui";
import { useCartStore } from "@/stores/cart";
import { useWishlistStore } from "@/stores/wishlist";
import { useNavigation } from "@/hooks/useNavigation";
import { AnnouncementBar } from "./AnnouncementBar";

export function Header() {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const menuTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamKey = searchParams.toString();
  const { data: oauthSession } = useSession();
  const { navLinks } = useNavigation();
  const affiliateCodeFromPage = useMemo(() => {
    const match = pathname.match(/^\/affiliate\/shop\/([^/?#]+)/i);
    return match?.[1] || "";
  }, [pathname]);
  const isAffiliateShopPage = useMemo(() => /^\/affiliate\/shop\/[^/?#]+/i.test(pathname), [pathname]);
  const withAffiliateRef = (href: string) => {
    if (!affiliateCodeFromPage || !href.startsWith("/shop")) return href;
    const separator = href.includes("?") ? "&" : "?";
    return `${href}${separator}ref=${encodeURIComponent(affiliateCodeFromPage)}`;
  };
  
  const { isHeaderScrolled, setHeaderScrolled, openMobileNav, openSearch } = useUIStore();
  const cartItemCount = useCartStore((state) => state.getItemCount());
  const wishlistCount = useWishlistStore((state) => state.getItemCount());
  const toggleCart = useCartStore((state) => state.toggleCart);

  // Determine which nav item is currently active based on URL
  const activeNavItem = useMemo(() => {
    if (pathname !== "/shop") return null;
    const category = searchParams.get("category");
    if (!category) return null;

    const match = navLinks.find((link) => {
      if (link.categoryHandle === category) return true;
      if (!link.submenu) return false;
      return Object.values(link.submenu).some((section) =>
        section.items.some((item) => item.href.includes(`category=${category}`))
      );
    });
    return match?.label ?? null;
  }, [pathname, searchParams, navLinks]);

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const loadSessionState = async () => {
      try {
        const res = await fetch("/api/account/me", { cache: "no-store" });
        const data = (await res.json()) as { customer?: unknown };
        setIsLoggedIn(Boolean(data.customer || oauthSession?.user?.email));
      } catch {
        setIsLoggedIn(Boolean(oauthSession?.user?.email));
      }
    };
    loadSessionState();
  }, [pathname, searchParamKey, oauthSession?.user?.email]);

  // Handle scroll effect
  useEffect(() => {
    const handleScroll = () => {
      setHeaderScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [setHeaderScrolled]);

  // Menu hover handlers with delay to prevent flickering
  const handleMenuEnter = (label: string) => {
    if (menuTimeoutRef.current) {
      clearTimeout(menuTimeoutRef.current);
    }
    setActiveMenu(label);
  };

  const handleMenuLeave = () => {
    menuTimeoutRef.current = setTimeout(() => {
      setActiveMenu(null);
    }, 150);
  };

  const handleSubmenuEnter = () => {
    if (menuTimeoutRef.current) {
      clearTimeout(menuTimeoutRef.current);
    }
  };

  return (
    <>
      <AnnouncementBar />
      <header
        className={cn(
          "sticky top-0 z-50 transition-all duration-500 theme-transition",
          "border-b border-theme-primary/20",
          isHeaderScrolled
            ? "bg-theme-background/95 backdrop-blur-md shadow-lg"
            : "bg-theme-background"
        )}
        style={{
          boxShadow: isHeaderScrolled ? `0 4px 20px color-mix(in srgb, var(--theme-primary) 15%, transparent)` : 'none'
        }}
      >
        <div className="max-w-[1600px] mx-auto px-[5%]">
          <div className="flex items-center justify-between py-4">
            {/* Mobile Menu Button */}
            <button
              onClick={openMobileNav}
              className="lg:hidden p-2 -ml-2 hover:text-theme-primary theme-transition"
              aria-label="Open menu"
            >
              <Menu className="w-6 h-6" />
            </button>

            {/* Logo - overflows header for larger appearance */}
            <Link
              href={affiliateCodeFromPage ? `/affiliate/shop/${encodeURIComponent(affiliateCodeFromPage)}` : "/"}
              className="flex items-center flex-shrink-0"
            >
              <Image
                src="/logo.png"
                alt="BLESSLUXE"
                width={200}
                height={200}
                className={cn(
                  "w-auto transition-all duration-300 -my-4",
                  isHeaderScrolled ? "h-16" : "h-20"
                )}
                priority
              />
            </Link>

            {/* Desktop Navigation with Mega Menu */}
            {!isAffiliateShopPage ? (
              <nav className="hidden lg:flex items-center gap-8">
                {navLinks.map((link) => (
                  <div
                    key={link.label}
                    className="relative"
                    onMouseEnter={() => link.submenu && handleMenuEnter(link.label)}
                    onMouseLeave={handleMenuLeave}
                  >
                    <Link
                      href={withAffiliateRef(link.href)}
                      className={cn(
                        "relative flex items-center gap-1.5 font-body text-sm font-medium tracking-widest uppercase",
                        "py-3 transition-colors",
                        link.isSale ? "text-red-600" : "text-black hover:text-theme-primary",
                        activeMenu === link.label && "text-theme-primary",
                        activeNavItem === link.label && "text-theme-primary",
                        "after:absolute after:bottom-0 after:left-0",
                        "after:w-0 after:h-0.5 after:transition-all after:duration-300",
                        "hover:after:w-full",
                        (activeMenu === link.label || activeNavItem === link.label) && "after:w-full"
                      )}
                    >
                      {link.label}
                      {link.submenu && (
                        <ChevronDown
                          className={cn(
                            "w-3.5 h-3.5 transition-transform duration-200",
                            activeMenu === link.label && "rotate-180"
                          )}
                        />
                      )}
                    </Link>
                  </div>
                ))}
              </nav>
            ) : (
              <div className="hidden lg:block flex-1" />
            )}

            {/* Header Actions */}
            <div className="flex items-center gap-5">
              <button
                onClick={openSearch}
                className="p-2 hover:text-theme-primary transition-colors hover:scale-110 theme-transition"
                aria-label="Search"
              >
                <Search className="w-5 h-5" strokeWidth={1.5} />
              </button>

              <Link
                href={isLoggedIn ? "/account" : "/account/login"}
                className="hidden sm:flex items-center gap-2 p-2 hover:text-theme-primary transition-colors hover:scale-110 theme-transition"
                aria-label="Account"
              >
                <User className="w-5 h-5" strokeWidth={1.5} />
                <span className="text-[10px] font-semibold tracking-[0.2em] uppercase">
                  {isLoggedIn ? "Profile" : "Login"}
                </span>
              </Link>

              <Link
                href="/wishlist"
                className="relative p-2 hover:text-theme-primary transition-colors hover:scale-110 theme-transition"
                aria-label="Wishlist"
              >
                <Heart className="w-5 h-5" strokeWidth={1.5} />
                {mounted && wishlistCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-theme-primary text-white text-[10px] font-semibold rounded-full flex items-center justify-center animate-pop-in theme-transition">
                    {wishlistCount}
                  </span>
                )}
              </Link>

              <button
                onClick={toggleCart}
                className="relative p-2 hover:text-theme-primary transition-colors hover:scale-110 theme-transition"
                aria-label="Cart"
              >
                <ShoppingBag className="w-5 h-5" strokeWidth={1.5} />
                {mounted && cartItemCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-theme-primary text-white text-[10px] font-semibold rounded-full flex items-center justify-center animate-pop-in theme-transition">
                    {cartItemCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mega Menu Dropdown */}
        <AnimatePresence>
          {!isAffiliateShopPage && activeMenu && navLinks.find(l => l.label === activeMenu)?.submenu && (
            <motion.div
              key={activeMenu}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              onMouseEnter={handleSubmenuEnter}
              onMouseLeave={handleMenuLeave}
              className="absolute left-0 right-0 bg-white shadow-xl border-t border-theme-primary/20 z-40 theme-transition"
            >
              <div className="max-w-[1400px] mx-auto px-[5%] py-10">
                <div className="grid grid-cols-4 gap-12">
                  {(() => {
                    const submenu = navLinks.find(l => l.label === activeMenu)?.submenu;
                    if (!submenu) return null;
                    return Object.entries(submenu).map(([key, section]) => (
                      <div key={key}>
                        <h3 className="font-display text-sm tracking-widest uppercase text-theme-primary mb-5 pb-2 border-b border-theme-primary/30 theme-transition">
                          {section.title}
                        </h3>
                        <ul className="space-y-3">
                          {section.items.map((item, index) => (
                            <li key={`${key}-${item.label}-${index}`}>
                              <Link
                                href={withAffiliateRef(item.href)}
                                className="flex items-center gap-2 text-sm text-black/70 hover:text-theme-primary transition-colors group"
                              >
                                {"icon" in item && (
                                  <span>{item.icon}</span>
                                )}
                                <span className="group-hover:translate-x-1 transition-transform">
                                  {item.label}
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ));
                  })()}
                </div>

                {/* Featured promo in mega menu */}
                <div className="mt-10 pt-8 border-t border-theme-primary/20 theme-transition">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-script text-2xl text-theme-primary theme-transition">New Season</p>
                      <p className="text-black/70 text-sm mt-1">Up to 40% off selected styles</p>
                    </div>
                    <Link
                      href={withAffiliateRef("/shop")}
                      className="inline-block bg-theme-primary text-white px-8 py-3 text-xs font-semibold tracking-widest uppercase hover:bg-theme-primary-dark theme-transition"
                    >
                      Shop Now
                    </Link>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>
    </>
  );
}
