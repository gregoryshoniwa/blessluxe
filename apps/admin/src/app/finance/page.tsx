"use client";

import { useEffect, useState } from "react";
import {
  Banknote,
  TrendingUp,
  TrendingDown,
  ShoppingBag,
  Receipt,
  LineChart,
  FileText,
  Trophy,
  ListOrdered,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuthGate } from "@/lib/useAuthGate";
import { AdminShell } from "@/components/AdminShell";
import { PageHeader, SectionTitle } from "@/components/Modal";
import { AiAdvisory } from "@/components/AiAdvisory";

interface Summary {
  window: { days: number; since: string; until: string };
  current: {
    orders: number;
    revenue: number;
    subtotal: number;
    discounts: number;
    shipping: number;
    tax: number;
    cost: number;
    gross_profit: number;
  };
  previous: { orders: number; revenue: number };
  lifetime: { orders: number; revenue: number };
  currency_breakdown: Array<{
    currency_code: string;
    orders: number;
    revenue: number;
  }>;
}

interface Timeseries {
  points: Array<{ date: string; orders: number; revenue: number }>;
}

interface TopProduct {
  product_id: string;
  title: string;
  thumbnail: string | null;
  units: number;
  revenue: number;
}

interface RecentOrder {
  id: string;
  order_number: string;
  email: string | null;
  total: number;
  currency_code: string;
  status: string;
  payment_status: string | null;
  created_at: string;
  customer_first_name: string | null;
  customer_last_name: string | null;
}

const formatMoney = (cents: number, currency = "usd") =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).format(cents / 100);

type Tab = "trend" | "pl" | "top" | "orders";

const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: "trend", label: "Trend", icon: <LineChart className="h-3.5 w-3.5" /> },
  { id: "pl", label: "Profit & Loss", icon: <FileText className="h-3.5 w-3.5" /> },
  { id: "top", label: "Top performers", icon: <Trophy className="h-3.5 w-3.5" /> },
  { id: "orders", label: "Recent orders", icon: <ListOrdered className="h-3.5 w-3.5" /> },
];

export default function FinancePage() {
  const { user, loading } = useAuthGate();
  const [days, setDays] = useState(30);
  const [currency, setCurrency] = useState<string>("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [timeseries, setTimeseries] = useState<Timeseries | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [tab, setTab] = useState<Tab>("trend");

  const load = async () => {
    const qs = (path: string) =>
      `${path}${path.includes("?") ? "&" : "?"}days=${days}${currency ? `&currency=${currency}` : ""}`;
    const [s, t, top, ord] = await Promise.all([
      api.get<Summary>(qs("/admin/finance/summary")),
      api.get<Timeseries>(qs("/admin/finance/timeseries")),
      api.get<{ products: TopProduct[] }>(qs("/admin/finance/top-products?limit=10")),
      api.get<{ orders: RecentOrder[] }>("/admin/finance/recent-orders?limit=15"),
    ]);
    setSummary(s);
    setTimeseries(t);
    setTopProducts(top.products);
    setRecentOrders(ord.orders);
  };

  useEffect(() => {
    if (user) void load();
  }, [user, days, currency]);

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="font-script text-2xl text-[var(--gold-dark)]">Bless</p>
      </div>
    );
  }

  const revenueDelta =
    summary && summary.previous.revenue
      ? ((summary.current.revenue - summary.previous.revenue) / summary.previous.revenue) * 100
      : null;
  const margin =
    summary && summary.current.revenue
      ? (summary.current.gross_profit / summary.current.revenue) * 100
      : null;
  const aov =
    summary && summary.current.orders
      ? summary.current.revenue / summary.current.orders
      : 0;

  const primaryCurrency = currency || summary?.currency_breakdown[0]?.currency_code || "usd";

  return (
    <AdminShell user={user}>
      <PageHeader
        title="Finance"
        subtitle="Revenue, profit, and order analytics. P&L, sales statements, top performers, and AI advisory."
      />

      <div className="mb-8 flex items-center gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-luxe text-[var(--ink-muted)]">
          Window
        </span>
        <div className="flex gap-1">
          {[7, 30, 90, 365].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className="rounded-sm px-3 py-1.5 text-[11px] font-semibold uppercase tracking-luxe transition-colors"
              style={
                days === d
                  ? { background: "var(--ink)", color: "white" }
                  : { background: "white", color: "var(--ink-muted)", border: "1px solid var(--line)" }
              }
            >
              {d === 365 ? "1Y" : `${d}D`}
            </button>
          ))}
        </div>
        {summary && summary.currency_breakdown.length > 1 && (
          <>
            <span className="ml-4 text-[10px] font-semibold uppercase tracking-luxe text-[var(--ink-muted)]">
              Currency
            </span>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="select max-w-[140px]"
            >
              <option value="">All</option>
              {summary.currency_breakdown.map((b) => (
                <option key={b.currency_code} value={b.currency_code}>
                  {b.currency_code.toUpperCase()}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 mb-8">
        <BigStat
          icon={<Banknote className="h-4 w-4" />}
          label="Revenue"
          value={summary ? formatMoney(summary.current.revenue, primaryCurrency) : "—"}
          delta={revenueDelta}
          deltaSuffix="vs prior period"
        />
        <BigStat
          icon={<TrendingUp className="h-4 w-4" />}
          label="Gross profit"
          value={summary ? formatMoney(summary.current.gross_profit, primaryCurrency) : "—"}
          subtitle={
            margin != null
              ? `${margin.toFixed(1)}% margin`
              : "set cost on variants for margin"
          }
        />
        <BigStat
          icon={<ShoppingBag className="h-4 w-4" />}
          label="Orders"
          value={summary ? summary.current.orders.toLocaleString() : "—"}
          subtitle={
            summary
              ? `${summary.previous.orders} in prior period`
              : ""
          }
        />
        <BigStat
          icon={<Receipt className="h-4 w-4" />}
          label="Avg. order value"
          value={summary ? formatMoney(aov, primaryCurrency) : "—"}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-8">
        <div>
          {/* Tab strip */}
          <div
            className="mb-5 flex items-center gap-1 overflow-x-auto"
            style={{ borderBottom: "1px solid var(--line)" }}
          >
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className="relative flex items-center gap-1.5 whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-luxe transition-colors"
                  style={{ color: active ? "var(--ink)" : "var(--ink-muted)" }}
                >
                  <span style={{ color: active ? "var(--gold-dark)" : "var(--ink-muted)" }}>
                    {t.icon}
                  </span>
                  {t.label}
                  {active && (
                    <span
                      className="absolute bottom-[-1px] left-0 right-0 h-[2px]"
                      style={{ background: "var(--gold)" }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Trend tab */}
          {tab === "trend" && (
            <div
              className="bg-white p-6 animate-fade-in"
              style={{ border: "1px solid var(--line)", borderRadius: 4 }}
            >
              <div className="flex items-end justify-between mb-4">
                <SectionTitle hint="Revenue and orders per day for the selected window.">
                  Trend
                </SectionTitle>
                <span className="text-[10px] uppercase tracking-luxe text-[var(--ink-muted)]">
                  {timeseries?.points.length ?? 0} days with activity
                </span>
              </div>
              {timeseries && timeseries.points.length > 0 ? (
                <Sparkline points={timeseries.points} primaryCurrency={primaryCurrency} />
              ) : (
                <div className="flex h-40 items-center justify-center text-sm italic text-[var(--ink-muted)]">
                  No sales data in this window. Place a test order to populate the chart.
                </div>
              )}
            </div>
          )}

          {/* Profit & Loss tab */}
          {tab === "pl" && (
            <div
              className="bg-white p-6 animate-fade-in"
              style={{ border: "1px solid var(--line)", borderRadius: 4 }}
            >
              <SectionTitle hint="Simplified income statement for the selected window.">
                Profit & Loss
              </SectionTitle>
              <table className="w-full text-sm">
                <tbody>
                  <PLRow label="Subtotal" amount={summary?.current.subtotal} currency={primaryCurrency} />
                  <PLRow
                    label="Discounts"
                    amount={summary ? -summary.current.discounts : null}
                    currency={primaryCurrency}
                    subtle
                  />
                  <PLRow
                    label="Shipping income"
                    amount={summary?.current.shipping}
                    currency={primaryCurrency}
                    subtle
                  />
                  <PLRow
                    label="Tax collected"
                    amount={summary?.current.tax}
                    currency={primaryCurrency}
                    subtle
                  />
                  <PLRow
                    label="Net revenue"
                    amount={summary?.current.revenue}
                    currency={primaryCurrency}
                    bold
                  />
                  <PLRow
                    label="Cost of goods"
                    amount={summary ? -summary.current.cost : null}
                    currency={primaryCurrency}
                    subtle
                  />
                  <PLRow
                    label="Gross profit"
                    amount={summary?.current.gross_profit}
                    currency={primaryCurrency}
                    bold
                    highlight
                  />
                </tbody>
              </table>
            </div>
          )}

          {/* Top performers tab */}
          {tab === "top" && (
            <div
              className="bg-white p-6 animate-fade-in"
              style={{ border: "1px solid var(--line)", borderRadius: 4 }}
            >
              <SectionTitle hint="Highest revenue contributors in the selected window.">
                Top performers
              </SectionTitle>
              {topProducts.length === 0 ? (
                <p className="text-sm italic text-[var(--ink-muted)]">
                  Top sellers will appear once orders are recorded.
                </p>
              ) : (
                <ul className="space-y-2">
                  {topProducts.map((p, i) => (
                    <li
                      key={p.product_id}
                      className="flex items-center gap-3 py-2"
                      style={{ borderTop: i === 0 ? undefined : "1px solid var(--line-soft)" }}
                    >
                      <span className="font-display text-2xl text-[var(--gold-dark)] w-8 text-right">
                        {i + 1}
                      </span>
                      {p.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.thumbnail}
                          alt=""
                          className="h-10 w-10 rounded-sm object-cover"
                          style={{ border: "1px solid var(--line-soft)" }}
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-sm" style={{ background: "var(--cream-dark)" }} />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{p.title}</p>
                        <p className="text-xs text-[var(--ink-muted)]">{p.units} units</p>
                      </div>
                      <span className="font-display text-base">
                        {formatMoney(p.revenue, primaryCurrency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Recent orders tab */}
          {tab === "orders" && (
            <div
              className="overflow-hidden bg-white animate-fade-in"
              style={{ border: "1px solid var(--line)", borderRadius: 4 }}
            >
              <div className="px-6 pt-5 pb-3" style={{ borderBottom: "1px solid var(--line-soft)" }}>
                <SectionTitle hint="Latest orders across all currencies.">
                  Recent orders
                </SectionTitle>
              </div>
              <table className="w-full text-sm">
                <thead style={{ background: "var(--cream)" }}>
                  <tr className="text-left text-[10px] font-semibold uppercase tracking-luxe text-[var(--ink-muted)]">
                    <th className="px-5 py-3">Order</th>
                    <th className="px-5 py-3">Customer</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right pr-5">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((o) => (
                    <tr key={o.id} style={{ borderTop: "1px solid var(--line-soft)" }}>
                      <td className="px-5 py-3">
                        <p className="font-mono text-xs">{o.order_number}</p>
                        <p className="text-[10px] uppercase tracking-luxe text-[var(--ink-muted)]">
                          {new Date(o.created_at).toLocaleDateString()}
                        </p>
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-medium">
                          {[o.customer_first_name, o.customer_last_name].filter(Boolean).join(" ") ||
                            "Guest"}
                        </p>
                        {o.email && (
                          <p className="text-xs text-[var(--ink-muted)]">{o.email}</p>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={
                            o.payment_status === "paid"
                              ? "badge badge-success"
                              : o.payment_status === "pending"
                                ? "badge badge-warn"
                                : "badge badge-mute"
                          }
                        >
                          {o.payment_status || o.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-display text-base">
                        {formatMoney(o.total, o.currency_code)}
                      </td>
                    </tr>
                  ))}
                  {recentOrders.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-5 py-12 text-center">
                        <p className="font-display text-xl text-[var(--ink-muted)]">
                          No orders yet
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sidebar: currency breakdown + AI */}
        <div className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <div className="card p-5">
            <SectionTitle>Currency mix</SectionTitle>
            {summary && summary.currency_breakdown.length > 0 ? (
              <ul className="space-y-2.5 text-sm">
                {summary.currency_breakdown.map((b) => (
                  <li key={b.currency_code} className="flex items-center justify-between">
                    <span className="badge badge-gold">{b.currency_code}</span>
                    <div className="text-right">
                      <p className="font-display text-base">{formatMoney(b.revenue, b.currency_code)}</p>
                      <p className="text-[10px] uppercase tracking-luxe text-[var(--ink-muted)]">
                        {b.orders} orders
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs italic text-[var(--ink-muted)]">No multi-currency data yet.</p>
            )}
          </div>

          <div className="card p-5">
            <SectionTitle>Lifetime</SectionTitle>
            <p className="font-display text-3xl text-[var(--ink)]">
              {summary ? formatMoney(summary.lifetime.revenue, primaryCurrency) : "—"}
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-luxe text-[var(--ink-muted)]">
              {summary?.lifetime.orders.toLocaleString() ?? "—"} orders since launch
            </p>
          </div>

          <AiAdvisory
            topic="finance"
            helperHint="Gemini analyses revenue trends, currency mix, top SKUs, and margin."
            defaultQuestion="Where is the biggest opportunity to lift profit this month? Watch out for any concentration risk."
            context={{
              window_days: days,
              currency_filter: currency || null,
              summary,
              top_products: topProducts,
              recent_orders: recentOrders.slice(0, 10),
            }}
          />
        </div>
      </div>
    </AdminShell>
  );
}

function BigStat({
  icon,
  label,
  value,
  subtitle,
  delta,
  deltaSuffix,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  delta?: number | null;
  deltaSuffix?: string;
}) {
  const positive = delta != null && delta > 0;
  const negative = delta != null && delta < 0;
  return (
    <div
      className="bg-white p-5"
      style={{ border: "1px solid var(--line)", borderRadius: 4 }}
    >
      <div className="flex items-center justify-between">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-sm"
          style={{ background: "var(--cream-dark)", color: "var(--ink-light)" }}
        >
          {icon}
        </div>
        {delta != null && (
          <span
            className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-luxe"
            style={{ color: positive ? "#15803D" : negative ? "#B91C1C" : "var(--ink-muted)" }}
          >
            {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {delta > 0 ? "+" : ""}
            {delta.toFixed(1)}%
          </span>
        )}
      </div>
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-luxe text-[var(--ink-muted)]">
        {label}
      </p>
      <p className="mt-1 font-display text-3xl font-medium tracking-soft">{value}</p>
      {subtitle && (
        <p className="mt-1 text-[10px] uppercase tracking-luxe text-[var(--ink-muted)]">
          {subtitle}
        </p>
      )}
      {deltaSuffix && delta != null && (
        <p className="mt-1 text-[10px] uppercase tracking-luxe text-[var(--ink-muted)]">
          {deltaSuffix}
        </p>
      )}
    </div>
  );
}

function PLRow({
  label,
  amount,
  currency,
  subtle,
  bold,
  highlight,
}: {
  label: string;
  amount: number | null | undefined;
  currency: string;
  subtle?: boolean;
  bold?: boolean;
  highlight?: boolean;
}) {
  return (
    <tr style={{ borderTop: "1px solid var(--line-soft)" }}>
      <td
        className="py-2.5 text-sm"
        style={{
          color: subtle ? "var(--ink-muted)" : "var(--ink)",
          fontWeight: bold ? 600 : 400,
        }}
      >
        {label}
      </td>
      <td
        className="py-2.5 text-right font-display text-base"
        style={{
          color: highlight ? "var(--gold-dark)" : subtle ? "var(--ink-muted)" : "var(--ink)",
          fontWeight: bold ? 600 : 400,
        }}
      >
        {amount != null ? formatMoney(amount, currency) : "—"}
      </td>
    </tr>
  );
}

function Sparkline({
  points,
  primaryCurrency,
}: {
  points: Array<{ date: string; revenue: number; orders: number }>;
  primaryCurrency: string;
}) {
  const max = Math.max(...points.map((p) => p.revenue), 1);
  const width = 800;
  const height = 160;
  const stepX = width / Math.max(points.length - 1, 1);
  const yFor = (v: number) => height - 20 - (v / max) * (height - 40);
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${i * stepX} ${yFor(p.revenue)}`)
    .join(" ");
  const area = `${path} L ${(points.length - 1) * stepX} ${height - 20} L 0 ${height - 20} Z`;

  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none" style={{ height: 200 }}>
        <defs>
          <linearGradient id="gold-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#gold-fill)" />
        <path d={path} fill="none" stroke="var(--gold-dark)" strokeWidth="2" />
        {points.map((p, i) => (
          <circle key={i} cx={i * stepX} cy={yFor(p.revenue)} r={2.5} fill="var(--gold-dark)" />
        ))}
      </svg>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-luxe text-[var(--ink-muted)]">
        <span>{points[0]?.date}</span>
        <span>
          Peak {formatMoney(max, primaryCurrency)} on{" "}
          {points.find((p) => p.revenue === max)?.date}
        </span>
        <span>{points[points.length - 1]?.date}</span>
      </div>
    </div>
  );
}
