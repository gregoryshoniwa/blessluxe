"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search, User, Heart, ShoppingBag, Menu, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui";
import { useCartStore } from "@/stores/cart";
import { useWishlistStore } from "@/stores/wishlist";
import { AnnouncementBar } from "./AnnouncementBar";

// Main navigation with submenus
const navLinks = [
  {
    label: "Women",
    href: "/shop?category=women",
    submenu: {
      featured: {
        title: "Featured",
        items: [
          { href: "/shop", label: "New Arrivals", icon: "✨" },
          { href: "/shop?category=women", label: "Bestsellers", icon: "🏆" },
          { href: "/shop?category=women", label: "Trending Now", icon: "🔥" },
        ],
      },
      categories: {
        title: "Categories",
        items: [
          { href: "/shop?category=dresses", label: "Dresses" },
          { href: "/shop?category=tops", label: "Tops & Blouses" },
          { href: "/shop?category=bottoms", label: "Pants & Skirts" },
          { href: "/shop?category=women", label: "Matching Sets" },
          { href: "/shop?category=outerwear", label: "Jackets & Coats" },
          { href: "/shop?category=women", label: "Knitwear" },
        ],
      },
      occasions: {
        title: "Shop by Occasion",
        items: [
          { href: "/shop?category=women", label: "Date Night" },
          { href: "/shop?category=women", label: "Work Luxe" },
          { href: "/shop?category=women", label: "Casual Chic" },
          { href: "/shop?category=women", label: "Evening & Formal" },
          { href: "/shop?category=women", label: "Vacation Ready" },
        ],
      },
      accessories: {
        title: "Accessories",
        items: [
          { href: "/shop?category=accessories", label: "Bags" },
          { href: "/shop?category=accessories", label: "Jewelry" },
          { href: "/shop?category=accessories", label: "Shoes" },
          { href: "/shop?category=accessories", label: "Scarves" },
        ],
      },
    },
  },
  {
    label: "Men",
    href: "/shop?category=men",
    submenu: {
      featured: {
        title: "Featured",
        items: [
          { href: "/shop?category=men", label: "New Arrivals", icon: "✨" },
          { href: "/shop?category=men", label: "Bestsellers", icon: "🏆" },
        ],
      },
      categories: {
        title: "Categories",
        items: [
          { href: "/shop?category=men", label: "Suits & Blazers" },
          { href: "/shop?category=men", label: "Shirts" },
          { href: "/shop?category=men", label: "Trousers" },
          { href: "/shop?category=men", label: "Knitwear" },
          { href: "/shop?category=outerwear", label: "Jackets & Coats" },
          { href: "/shop?category=men", label: "Casual Wear" },
        ],
      },
      occasions: {
        title: "Shop by Occasion",
        items: [
          { href: "/shop?category=men", label: "Business" },
          { href: "/shop?category=men", label: "Smart Casual" },
          { href: "/shop?category=men", label: "Weekend" },
        ],
      },
      accessories: {
        title: "Accessories",
        items: [
          { href: "/shop?category=accessories", label: "Watches" },
          { href: "/shop?category=accessories", label: "Belts" },
          { href: "/shop?category=accessories", label: "Shoes" },
          { href: "/shop?category=accessories", label: "Bags" },
        ],
      },
    },
  },
  {
    label: "Children",
    href: "/shop?category=children",
    submenu: {
      featured: {
        title: "Featured",
        items: [
          { href: "/shop?category=children", label: "New Arrivals", icon: "✨" },
          { href: "/shop?category=children", label: "Bestsellers", icon: "🏆" },
        ],
      },
      categories: {
        title: "Girls",
        items: [
          { href: "/shop?category=children", label: "Dresses" },
          { href: "/shop?category=children", label: "Tops" },
          { href: "/shop?category=children", label: "Bottoms" },
          { href: "/shop?category=children", label: "Sets" },
        ],
      },
      occasions: {
        title: "Boys",
        items: [
          { href: "/shop?category=children", label: "Shirts" },
          { href: "/shop?category=children", label: "Trousers" },
          { href: "/shop?category=children", label: "Casual" },
          { href: "/shop?category=children", label: "Formal" },
        ],
      },
      accessories: {
        title: "Baby",
        items: [
          { href: "/shop?category=children", label: "Clothing" },
          { href: "/shop?category=children", label: "Accessories" },
          { href: "/shop?category=children", label: "Gift Sets" },
        ],
      },
    },
  },
  { label: "Sale", href: "/shop", isSale: true },
];

export function Header() {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const menuTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  const { isHeaderScrolled, setHeaderScrolled, openMobileNav, openSearch } = useUIStore();
  const cartItemCount = useCartStore((state) => state.getItemCount());
  const wishlistCount = useWishlistStore((state) => state.getItemCount());
  const toggleCart = useCartStore((state) => state.toggleCart);

  // Determine which nav item is currently active based on URL
  const activeNavItem = useMemo(() => {
    if (pathname !== "/shop") return null;
    const category = searchParams.get("category");
    if (!category) return null;
    
    // Map category to nav labels
    if (["women", "dresses", "tops", "bottoms", "outerwear"].includes(category)) {
      return "Women";
    }
    if (category === "men") return "Men";
    if (category === "children") return "Children";
    if (category === "accessories") return "Women"; // accessories under women for now
    return null;
  }, [pathname, searchParams]);

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

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
          "sticky top-0 z-50 transition-all duration-300",
          "border-b border-gold/20",
          isHeaderScrolled
            ? "bg-cream/95 backdrop-blur-md shadow-lg shadow-gold/10"
            : "bg-cream"
        )}
      >
        <div className="max-w-[1600px] mx-auto px-[5%]">
          <div className="flex items-center justify-between py-4">
            {/* Mobile Menu Button */}
            <button
              onClick={openMobileNav}
              className="lg:hidden p-2 -ml-2 hover:text-gold transition-colors"
              aria-label="Open menu"
            >
              <Menu className="w-6 h-6" />
            </button>

            {/* Logo - overflows header for larger appearance */}
            <Link href="/" className="flex items-center flex-shrink-0">
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
            <nav className="hidden lg:flex items-center gap-8">
              {navLinks.map((link) => (
                <div
                  key={link.label}
                  className="relative"
                  onMouseEnter={() => link.submenu && handleMenuEnter(link.label)}
                  onMouseLeave={handleMenuLeave}
                >
                  <Link
                    href={link.href}
                    className={cn(
                      "relative flex items-center gap-1.5 font-body text-sm font-medium tracking-widest uppercase",
                      "py-3 transition-colors",
                      link.isSale ? "text-red-600" : "text-black hover:text-gold",
                      // Active state when hovering mega menu
                      activeMenu === link.label && "text-gold",
                      // Active state when on corresponding page
                      activeNavItem === link.label && "text-gold",
                      // Underline animation
                      "after:absolute after:bottom-0 after:left-0",
                      "after:w-0 after:h-0.5 after:bg-gold",
                      "after:transition-all after:duration-300",
                      "hover:after:w-full",
                      // Show underline when active (hover or current page)
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

            {/* Header Actions */}
            <div className="flex items-center gap-5">
              <button
                onClick={openSearch}
                className="p-2 hover:text-gold transition-colors hover:scale-110"
                aria-label="Search"
              >
                <Search className="w-5 h-5" strokeWidth={1.5} />
              </button>

              <Link
                href="/account"
                className="hidden sm:block p-2 hover:text-gold transition-colors hover:scale-110"
                aria-label="Account"
              >
                <User className="w-5 h-5" strokeWidth={1.5} />
              </Link>

              <Link
                href="/wishlist"
                className="relative p-2 hover:text-gold transition-colors hover:scale-110"
                aria-label="Wishlist"
              >
                <Heart className="w-5 h-5" strokeWidth={1.5} />
                {mounted && wishlistCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-gold text-white text-[10px] font-semibold rounded-full flex items-center justify-center animate-pop-in">
                    {wishlistCount}
                  </span>
                )}
              </Link>

              <button
                onClick={toggleCart}
                className="relative p-2 hover:text-gold transition-colors hover:scale-110"
                aria-label="Cart"
              >
                <ShoppingBag className="w-5 h-5" strokeWidth={1.5} />
                {mounted && cartItemCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-gold text-white text-[10px] font-semibold rounded-full flex items-center justify-center animate-pop-in">
                    {cartItemCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mega Menu Dropdown */}
        <AnimatePresence>
          {activeMenu && navLinks.find(l => l.label === activeMenu)?.submenu && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              onMouseEnter={handleSubmenuEnter}
              onMouseLeave={handleMenuLeave}
              className="absolute left-0 right-0 bg-white shadow-xl border-t border-gold/10 z-40"
            >
              <div className="max-w-[1400px] mx-auto px-[5%] py-10">
                <div className="grid grid-cols-4 gap-12">
                  {(() => {
                    const submenu = navLinks.find(l => l.label === activeMenu)?.submenu;
                    if (!submenu) return null;
                    return Object.entries(submenu).map(([key, section]) => (
                      <div key={key}>
                        <h3 className="font-display text-sm tracking-widest uppercase text-gold mb-5 pb-2 border-b border-gold/20">
                          {section.title}
                        </h3>
                        <ul className="space-y-3">
                          {section.items.map((item) => (
                            <li key={item.href}>
                              <Link
                                href={item.href}
                                className="flex items-center gap-2 text-sm text-black/70 hover:text-gold transition-colors group"
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
                <div className="mt-10 pt-8 border-t border-gold/10">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-script text-2xl text-gold">New Season</p>
                      <p className="text-black/70 text-sm mt-1">Up to 40% off selected styles</p>
                    </div>
                    <Link
                      href="/collections/sale"
                      className="inline-block bg-gold text-white px-8 py-3 text-xs font-semibold tracking-widest uppercase hover:bg-gold-dark transition-colors"
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
