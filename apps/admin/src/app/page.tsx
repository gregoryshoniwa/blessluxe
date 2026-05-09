"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LayoutList,
  FolderTree,
  Package,
  Users,
  Star,
  TrendingUp,
  ArrowUpRight,
} from "lucide-react";
import { api, getToken, setToken } from "@/lib/api";
import type { AdminUser, Heading, Product, Customer, Review } from "@/lib/types";
import { AdminShell } from "@/components/AdminShell";
import { PageHeader } from "@/components/Modal";

interface Stats {
  headings: number;
  products: number;
  customers: number;
  pendingReviews: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    (async () => {
      try {
        const me = await api.get<{ user: AdminUser }>("/auth/me");
        setUser(me.user);
        const [headings, products, customers, reviews] = await Promise.all([
          api.get<{ headings: Heading[] }>("/admin/headings").catch(() => ({ headings: [] })),
          api.get<{ products: Product[]; count: number }>("/admin/products?limit=1").catch(() => ({ products: [], count: 0 })),
          api.get<{ customers: Customer[]; count: number }>("/admin/customers?limit=1").catch(() => ({ customers: [], count: 0 })),
          api.get<{ reviews: Review[]; count: number }>("/admin/reviews?status=pending&limit=1").catch(() => ({ reviews: [], count: 0 })),
        ]);
        setStats({
          headings: headings.headings.length,
          products: (products as { count: number }).count ?? 0,
          customers: (customers as { count: number }).count ?? 0,
          pendingReviews: (reviews as { count: number }).count ?? 0,
        });
      } catch {
        setToken(null);
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <p className="font-script text-2xl text-[var(--gold-dark)]">Bless</p>
          <p className="mt-1 text-xs uppercase tracking-luxe text-[var(--ink-muted)]">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <AdminShell user={user}>
      <PageHeader
        title={`Welcome, ${user.first_name || "Atelier"}`}
        subtitle="A snapshot of the BLESSLUXE catalogue and audience. Manage every facet of the storefront from this atelier."
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={<LayoutList className="h-4 w-4" />}
          label="Headings"
          value={stats?.headings}
          href="/headings"
        />
        <Stat
          icon={<Package className="h-4 w-4" />}
          label="Products"
          value={stats?.products}
          href="/products"
        />
        <Stat
          icon={<Users className="h-4 w-4" />}
          label="Customers"
          value={stats?.customers}
          href="/customers"
        />
        <Stat
          icon={<Star className="h-4 w-4" />}
          label="Pending reviews"
          value={stats?.pendingReviews}
          href="/reviews?status=pending"
          accent={(stats?.pendingReviews ?? 0) > 0}
        />
      </div>

      <div className="mt-12">
        <div className="flex items-end justify-between mb-5">
          <h2 className="font-display text-2xl font-medium tracking-soft">Quick actions</h2>
          <span className="h-px flex-1 mx-6 bg-[var(--line)]" />
          <p className="text-[10px] uppercase tracking-luxe text-[var(--ink-muted)]">
            Curate · Configure · Care
          </p>
        </div>
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <QuickLink
            icon={<LayoutList className="h-5 w-5" />}
            href="/headings"
            title="Configure headings"
            hint="Top-level menu items the storefront renders. Reorder, hide, or mark as sale."
          />
          <QuickLink
            icon={<FolderTree className="h-5 w-5" />}
            href="/catalogues"
            title="Curate catalogues"
            hint="Group products under each heading. The hierarchy drives the mega-menu."
          />
          <QuickLink
            icon={<Package className="h-5 w-5" />}
            href="/products"
            title="Manage products"
            hint="Edit titles, thumbnails, and assign each product to one or more catalogues."
          />
          <QuickLink
            icon={<Star className="h-5 w-5" />}
            href="/reviews"
            title="Moderate reviews"
            hint="Approve, reject, or respond to customer reviews."
          />
          <QuickLink
            icon={<Users className="h-5 w-5" />}
            href="/customers"
            title="Customer atelier"
            hint="Loyalty tiers, points adjustments, and referral codes."
          />
          <QuickLink
            icon={<TrendingUp className="h-5 w-5" />}
            href="/affiliates"
            title="Affiliate programme"
            hint="Codes, commissions, and payouts."
          />
        </ul>
      </div>
    </AdminShell>
  );
}

function Stat({
  icon,
  label,
  value,
  href,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | undefined;
  href: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group relative block bg-white p-5 transition-all"
      style={{
        border: "1px solid var(--line)",
        borderRadius: 4,
      }}
    >
      <div
        className={
          "absolute inset-0 pointer-events-none transition-opacity opacity-0 group-hover:opacity-100"
        }
        style={{
          boxShadow: "0 12px 28px -16px color-mix(in srgb, var(--gold) 50%, transparent)",
          borderRadius: 4,
        }}
      />
      <div className="relative flex items-start justify-between">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-sm"
          style={{
            background: accent ? "color-mix(in srgb, var(--gold) 15%, white)" : "var(--cream-dark)",
            color: accent ? "var(--gold-dark)" : "var(--ink-light)",
          }}
        >
          {icon}
        </div>
        <ArrowUpRight className="h-4 w-4 text-[var(--ink-muted)] opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <p className="mt-5 text-[11px] font-semibold uppercase tracking-luxe text-[var(--ink-muted)]">
        {label}
      </p>
      <p className="mt-1 font-display text-4xl font-medium tracking-soft text-[var(--ink)]">
        {value ?? "—"}
      </p>
    </Link>
  );
}

function QuickLink({
  icon,
  href,
  title,
  hint,
}: {
  icon: React.ReactNode;
  href: string;
  title: string;
  hint: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="group flex h-full flex-col bg-white p-5 transition-colors"
        style={{ border: "1px solid var(--line)", borderRadius: 4 }}
      >
        <div
          className="flex h-10 w-10 items-center justify-center rounded-sm transition-colors group-hover:bg-[color-mix(in_srgb,var(--gold)_20%,white)] group-hover:text-[var(--gold-dark)]"
          style={{ background: "var(--cream-dark)", color: "var(--ink-light)" }}
        >
          {icon}
        </div>
        <p className="mt-4 font-display text-xl font-medium tracking-soft transition-colors group-hover:text-[var(--gold-dark)]">
          {title}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--ink-muted)]">{hint}</p>
        <span className="mt-4 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-luxe text-[var(--gold-dark)]">
          Open
          <ArrowUpRight className="h-3 w-3" />
        </span>
      </Link>
    </li>
  );
}
