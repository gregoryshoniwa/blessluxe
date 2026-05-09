"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  LayoutList,
  FolderTree,
  Package,
  Boxes,
  Megaphone,
  Banknote,
  Users,
  Star,
  TrendingUp,
  Globe,
  LogOut,
  Gift,
  Truck,
} from "lucide-react";
import type { ReactNode } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
}

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Atelier",
    items: [
      { href: "/", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
    ],
  },
  {
    title: "Catalogue",
    items: [
      { href: "/headings", label: "Headings", icon: <LayoutList className="h-4 w-4" /> },
      { href: "/catalogues", label: "Catalogues", icon: <FolderTree className="h-4 w-4" /> },
      { href: "/products", label: "Products", icon: <Package className="h-4 w-4" /> },
      { href: "/inventory", label: "Inventory", icon: <Boxes className="h-4 w-4" /> },
      { href: "/packs", label: "Packs", icon: <Gift className="h-4 w-4" /> },
    ],
  },
  {
    title: "Operations",
    items: [
      { href: "/packages", label: "Packages", icon: <Truck className="h-4 w-4" /> },
    ],
  },
  {
    title: "Commercial",
    items: [
      { href: "/campaigns", label: "Campaigns", icon: <Megaphone className="h-4 w-4" /> },
      { href: "/finance", label: "Finance", icon: <Banknote className="h-4 w-4" /> },
    ],
  },
  {
    title: "Audience",
    items: [
      { href: "/customers", label: "Customers", icon: <Users className="h-4 w-4" /> },
      { href: "/reviews", label: "Reviews", icon: <Star className="h-4 w-4" /> },
      { href: "/affiliates", label: "Affiliates", icon: <TrendingUp className="h-4 w-4" /> },
    ],
  },
  {
    title: "Settings",
    items: [{ href: "/regions", label: "Regions", icon: <Globe className="h-4 w-4" /> }],
  },
];

export function Sidebar({ onSignOut }: { onSignOut: () => void }) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname?.startsWith(href);

  return (
    <aside
      className="sticky top-0 flex h-screen w-64 flex-shrink-0 flex-col bg-white"
      style={{ borderRight: "1px solid var(--line-soft)" }}
    >
      {/* Brand mark */}
      <div className="px-6 py-6" style={{ borderBottom: "1px solid var(--line-soft)" }}>
        <Link href="/" className="block">
          <p className="font-script text-xl leading-none text-[var(--gold-dark)]">Bless</p>
          <p className="font-display text-2xl font-medium tracking-[0.25em] text-[var(--ink)]">
            BLESSLUXE
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className="h-px w-6 bg-[var(--gold)]" />
            <span className="text-[9px] font-semibold uppercase tracking-luxe text-[var(--ink-muted)]">
              Admin
            </span>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-6">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-luxe text-[var(--ink-muted)]">
              {group.title}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="group relative flex items-center gap-3 rounded-sm px-3 py-2 text-sm transition-colors"
                      style={{
                        color: active ? "var(--ink)" : "var(--ink-light)",
                        backgroundColor: active ? "var(--cream-dark)" : "transparent",
                        fontWeight: active ? 600 : 500,
                      }}
                    >
                      {/* Gold left accent for active */}
                      {active && (
                        <span
                          className="absolute left-0 top-2 bottom-2 w-[2px]"
                          style={{ background: "var(--gold)" }}
                        />
                      )}
                      <span
                        style={{
                          color: active ? "var(--gold-dark)" : "var(--ink-muted)",
                        }}
                        className="transition-colors group-hover:text-[var(--gold-dark)]"
                      >
                        {item.icon}
                      </span>
                      <span className="tracking-soft">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div
        className="px-4 py-4"
        style={{ borderTop: "1px solid var(--line-soft)" }}
      >
        <button
          onClick={onSignOut}
          className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-xs font-medium uppercase tracking-luxe text-[var(--ink-muted)] transition-colors hover:bg-[var(--cream-dark)] hover:text-[var(--ink)]"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
