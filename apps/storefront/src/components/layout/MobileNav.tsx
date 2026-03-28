"use client";

import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { X, ChevronRight, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui";
import { useState } from "react";
import { useNavigation } from "@/hooks/useNavigation";
import { usePathname } from "next/navigation";

const accountLinks = [
  { href: "/account/login", label: "Login" },
  { href: "/account/signup", label: "Create Account" },
  { href: "/account", label: "My Dashboard" },
  { href: "/wishlist", label: "Wishlist" },
  { href: "/affiliate/dashboard", label: "Affiliate Dashboard" },
];

const helpLinks = [
  { href: "/help/shipping", label: "Shipping Info" },
  { href: "/help/returns", label: "Returns & Exchanges" },
  { href: "/help/sizing", label: "Size Guide" },
  { href: "/contact", label: "Contact Us" },
];

export function MobileNav() {
  const { isMobileNavOpen, closeMobileNav } = useUIStore();
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null);
  const { navLinks } = useNavigation();
  const pathname = usePathname();
  const isAffiliateShopPage = /^\/affiliate\/shop\/[^/?#]+/i.test(pathname);
  const affiliateCodeFromPage = (() => {
    const match = pathname.match(/^\/affiliate\/shop\/([^/?#]+)/i);
    return match?.[1] || "";
  })();
  const withAffiliateRef = (href: string) => {
    if (!affiliateCodeFromPage || !href.startsWith("/shop")) return href;
    const separator = href.includes("?") ? "&" : "?";
    return `${href}${separator}ref=${encodeURIComponent(affiliateCodeFromPage)}`;
  };

  // Handle body scroll lock
  useEffect(() => {
    if (isMobileNavOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileNavOpen]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMobileNav();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [closeMobileNav]);

  const toggleExpand = (label: string) => {
    setExpandedMenu(expandedMenu === label ? null : label);
  };

  return (
    <>
      {/* Backdrop */}
      <AnimatePresence>
        {isMobileNavOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-50 bg-black/50"
            onClick={closeMobileNav}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* Drawer */}
      <motion.div
        initial={{ x: "-100%" }}
        animate={{ x: isMobileNavOpen ? 0 : "-100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className={cn(
          "fixed top-0 left-0 z-50 h-full w-80 max-w-[85vw]",
          "bg-cream shadow-2xl"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gold/20">
          <Image
            src="/logo.png"
            alt="BLESSLUXE"
            width={150}
            height={150}
            className="h-16 w-auto -my-2"
          />
          <button
            onClick={closeMobileNav}
            className="p-2 -mr-2 hover:text-gold transition-colors"
            aria-label="Close menu"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Navigation Content */}
        <div className="h-[calc(100%-80px)] overflow-y-auto">
          {/* Main Navigation with accordions */}
          <nav className="p-5">
            <p className="text-xs font-semibold tracking-widest text-gold uppercase mb-4">
              Shop
            </p>
            <ul className="space-y-1">
              {!isAffiliateShopPage ? (
                <li>
                  <Link
                    href={withAffiliateRef("/shop/packs")}
                    onClick={closeMobileNav}
                    className={cn(
                      "block py-3 px-2 -mx-2 rounded-lg font-body text-sm font-medium tracking-widest uppercase",
                      pathname === "/shop/packs" ? "text-gold bg-gold/10" : "text-black hover:text-gold"
                    )}
                  >
                    Packs
                  </Link>
                </li>
              ) : null}
              {!isAffiliateShopPage ? navLinks.map((link) => (
                <li key={link.label}>
                  {link.submenu ? (
                    <>
                      <button
                        onClick={() => toggleExpand(link.label)}
                        className={cn(
                          "w-full flex items-center justify-between py-3 px-2 -mx-2",
                          "font-display text-lg",
                          "rounded-lg hover:bg-gold/5 transition-colors"
                        )}
                      >
                        <span>{link.label}</span>
                        <ChevronDown
                          className={cn(
                            "w-4 h-4 transition-transform",
                            expandedMenu === link.label && "rotate-180"
                          )}
                        />
                      </button>
                      <AnimatePresence>
                        {expandedMenu === link.label && (
                          <motion.ul
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden pl-4 border-l-2 border-gold/20 ml-2"
                          >
                            {Object.values(link.submenu)
                              .flatMap((section) => section.items)
                              .map((sub, index) => (
                              <li key={`${sub.href}-${sub.label}-${index}`}>
                                <Link
                                  href={withAffiliateRef(sub.href)}
                                  onClick={closeMobileNav}
                                  className="flex items-center gap-2 py-2 text-sm text-black/70 hover:text-gold transition-colors"
                                >
                                  {"icon" in sub && sub.icon && <span>{sub.icon}</span>}
                                  <span>{sub.label}</span>
                                </Link>
                              </li>
                            ))}
                          </motion.ul>
                        )}
                      </AnimatePresence>
                    </>
                  ) : (
                    <Link
                      href={withAffiliateRef(link.href)}
                      onClick={closeMobileNav}
                      className={cn(
                        "flex items-center justify-between py-3 px-2 -mx-2",
                        "font-display text-lg",
                        "rounded-lg hover:bg-gold/5 transition-colors",
                        link.isSale && "text-red-600"
                      )}
                    >
                      <span>{link.label}</span>
                      <ChevronRight className="w-4 h-4 opacity-40" />
                    </Link>
                  )}
                </li>
              )) : (
                <li className="py-2 text-sm text-black/60">Affiliate shop menu is streamlined on this page.</li>
              )}
            </ul>
          </nav>

          <div className="border-t border-gold/10 mx-5" />

          {/* Account Links */}
          <nav className="p-5">
            <p className="text-xs font-semibold tracking-widest text-gold uppercase mb-4">
              Account
            </p>
            <ul className="space-y-1">
              {accountLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={closeMobileNav}
                    className="flex items-center justify-between py-2.5 px-2 -mx-2 text-sm rounded-lg hover:bg-gold/5 transition-colors"
                  >
                    <span>{link.label}</span>
                    <ChevronRight className="w-4 h-4 opacity-40" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="border-t border-gold/10 mx-5" />

          {/* Help Links */}
          <nav className="p-5">
            <p className="text-xs font-semibold tracking-widest text-gold uppercase mb-4">
              Help
            </p>
            <ul className="space-y-1">
              {helpLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={closeMobileNav}
                    className="flex items-center justify-between py-2.5 px-2 -mx-2 text-sm rounded-lg hover:bg-gold/5 transition-colors"
                  >
                    <span>{link.label}</span>
                    <ChevronRight className="w-4 h-4 opacity-40" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </motion.div>
    </>
  );
}
