"use client";

import { useEffect, useState } from "react";
import { ImageIcon, PackagePlus, TrendingUp, AlertTriangle, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthGate } from "@/lib/useAuthGate";
import { AdminShell } from "@/components/AdminShell";
import { useDialog } from "@/components/Dialog";
import { Pagination, paginate } from "@/components/Pagination";
import { PageHeader, inputCls, btnPrimary, btnGhost, SectionTitle } from "@/components/Modal";
import { AiAdvisory } from "@/components/AiAdvisory";

type Tab = "overview" | "low" | "aging" | "fresh" | "movements";

interface AgingVariant {
  id: string;
  product_id: string;
  product_title: string;
  thumbnail: string | null;
  title: string;
  sku: string | null;
  inventory_quantity: number;
  received_at: string | null;
  bucket: "fresh" | "recent" | "aging" | "stale" | "unknown";
  age_days: number | null;
}

interface VelocityVariant {
  variant_id: string;
  product_id: string;
  title: string;
  sku: string | null;
  units_sold: number;
}

interface VariantRow {
  id: string;
  product_id: string;
  product_title: string;
  product_thumbnail: string | null;
  title: string;
  sku: string | null;
  inventory_quantity: number;
  received_at: string | null;
  cost_price?: number | null;
  bucket?: string;
  age_days?: number | null;
  units_sold?: number;
  _dirty?: boolean;
}

interface Movement {
  id: string;
  variant_id: string;
  variant_title: string;
  product_title: string;
  product_id: string;
  sku: string | null;
  delta: number;
  reason: string;
  reference: string | null;
  notes: string | null;
  cost_per_unit: number | null;
  created_at: string;
}

export default function InventoryPage() {
  const { user, loading } = useAuthGate();
  const dialog = useDialog();
  const [tab, setTab] = useState<Tab>("overview");
  const [rows, setRows] = useState<VariantRow[]>([]);
  const [aging, setAging] = useState<AgingVariant[]>([]);
  const [velocity, setVelocity] = useState<VelocityVariant[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState(30);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const load = async () => {
    type StoreProduct = {
      id: string;
      title: string;
      thumbnail: string | null;
      variants: Array<{
        id: string;
        title: string;
        sku: string | null;
        inventory_quantity: number;
      }>;
    };
    const [storeProducts, agingRes, velocityRes, movementsRes] = await Promise.all([
      api.get<{ products: StoreProduct[] }>("/store/products?limit=999"),
      api.get<{ variants: AgingVariant[] }>("/admin/inventory/aging"),
      api.get<{ variants: VelocityVariant[] }>(`/admin/inventory/velocity?days=${windowDays}`),
      api.get<{ movements: Movement[] }>("/admin/inventory/movements?limit=80"),
    ]);

    const agingByVariant = new Map(agingRes.variants.map((a) => [a.id, a]));
    const velocityByVariant = new Map(velocityRes.variants.map((v) => [v.variant_id, v]));

    const flat: VariantRow[] = [];
    for (const p of storeProducts.products) {
      for (const v of p.variants || []) {
        const a = agingByVariant.get(v.id);
        const vel = velocityByVariant.get(v.id);
        flat.push({
          id: v.id,
          product_id: p.id,
          product_title: p.title,
          product_thumbnail: p.thumbnail,
          title: v.title,
          sku: v.sku,
          inventory_quantity: v.inventory_quantity ?? 0,
          received_at: a?.received_at || null,
          bucket: a?.bucket,
          age_days: a?.age_days || null,
          units_sold: vel?.units_sold || 0,
        });
      }
    }
    setRows(flat);
    setAging(agingRes.variants);
    setVelocity(velocityRes.variants);
    setMovements(movementsRes.movements);
  };

  useEffect(() => {
    if (user) void load();
  }, [user, windowDays]);

  useEffect(() => { setPage(1); }, [tab]);

  const onSave = async (r: VariantRow) => {
    setBusyId(r.id);
    try {
      await api.post("/admin/inventory/update", {
        variant_id: r.id,
        quantity: r.inventory_quantity,
      });
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, _dirty: false } : x)));
    } finally {
      setBusyId(null);
    }
  };

  const onReceive = async (r: VariantRow) => {
    const qtyStr = await dialog.prompt({
      title: "Receive stock",
      message: `${r.product_title} · ${r.title}${r.sku ? ` (SKU ${r.sku})` : ""}`,
      inputLabel: "Units received",
      inputType: "number",
      placeholder: "e.g. 24",
      required: true,
      confirmLabel: "Next",
      validate: (val) => {
        const n = Number(val);
        if (!Number.isFinite(n) || n <= 0) return "Enter a positive number.";
        return null;
      },
    });
    if (qtyStr == null) return;
    const qty = Number(qtyStr);
    if (!qty || qty <= 0) return;
    const costStr = await dialog.prompt({
      title: "Cost per unit",
      message: "Optional — used to compute margin in finance reports. Leave blank to skip.",
      inputLabel: "Cost per unit (major units, e.g. 12.50)",
      inputType: "number",
      placeholder: "12.50",
      confirmLabel: "Confirm receipt",
      tone: "info",
      validate: (val) => {
        if (!val.trim()) return null;
        const n = Number(val);
        if (!Number.isFinite(n) || n < 0) return "Enter a non-negative number, or leave blank.";
        return null;
      },
    });
    if (costStr == null) return; // user cancelled the second step
    const cost = Number(costStr);
    await api.post("/admin/inventory/receive", {
      variant_id: r.id,
      quantity: qty,
      cost_per_unit: cost > 0 ? Math.round(cost * 100) : null,
    });
    await load();
  };

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="font-script text-2xl text-[var(--gold-dark)]">Bless</p>
      </div>
    );
  }

  const totals = {
    totalUnits: rows.reduce((s, r) => s + r.inventory_quantity, 0),
    totalSkus: rows.length,
    outOfStock: rows.filter((r) => r.inventory_quantity === 0).length,
    lowStock: rows.filter((r) => r.inventory_quantity > 0 && r.inventory_quantity <= 3).length,
    aging: aging.filter((a) => a.bucket === "aging" || a.bucket === "stale").length,
  };

  const visibleRows =
    tab === "low"
      ? rows.filter((r) => r.inventory_quantity > 0 && r.inventory_quantity <= 3)
      : tab === "aging"
        ? rows.filter((r) => r.bucket === "aging" || r.bucket === "stale")
        : tab === "fresh"
          ? rows.filter((r) => r.bucket === "fresh" || r.bucket === "recent")
          : rows;

  const sortedRows = [...visibleRows].sort((a, b) => (b.units_sold || 0) - (a.units_sold || 0));
  const totalRowsForTab = tab === "movements" ? movements.length : sortedRows.length;
  const pagedRows = paginate(sortedRows, page, pageSize);
  const pagedMovements = paginate(movements, page, pageSize);

  return (
    <AdminShell user={user}>
      <PageHeader
        title="Inventory"
        subtitle="Stock levels, age, and velocity. Receive new shipments, plan reorders, and let AI flag risks."
      />

      {/* Stat strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5 mb-8">
        <Stat icon={<TrendingUp className="h-3.5 w-3.5" />} label="Total units" value={totals.totalUnits} />
        <Stat icon={<PackagePlus className="h-3.5 w-3.5" />} label="SKUs tracked" value={totals.totalSkus} />
        <Stat
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          label="Out of stock"
          value={totals.outOfStock}
          accent={totals.outOfStock > 0 ? "danger" : undefined}
        />
        <Stat
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          label="Low stock"
          value={totals.lowStock}
          accent={totals.lowStock > 0 ? "warn" : undefined}
        />
        <Stat
          icon={<Clock className="h-3.5 w-3.5" />}
          label="Aging > 30d"
          value={totals.aging}
          accent={totals.aging > 0 ? "warn" : undefined}
        />
      </div>

      {/* Tabs */}
      <div className="mb-6 flex items-center gap-1" style={{ borderBottom: "1px solid var(--line)" }}>
        {(["overview", "low", "aging", "fresh", "movements"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="relative px-4 py-2.5 text-[11px] font-semibold uppercase tracking-luxe transition-colors"
            style={{ color: tab === t ? "var(--ink)" : "var(--ink-muted)" }}
          >
            {t === "overview" ? "All stock"
              : t === "low" ? "Low stock"
              : t === "aging" ? "Aging"
              : t === "fresh" ? "New stock"
              : "Movements"}
            {tab === t && (
              <span
                className="absolute bottom-[-1px] left-0 right-0 h-[2px]"
                style={{ background: "var(--gold)" }}
              />
            )}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 pb-1">
          <span className="text-[10px] uppercase tracking-luxe text-[var(--ink-muted)]">Velocity</span>
          <select
            value={windowDays}
            onChange={(e) => setWindowDays(Number(e.target.value))}
            className="select max-w-[150px]"
          >
            <option value={7}>7-day</option>
            <option value={30}>30-day</option>
            <option value={90}>90-day</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-8">
        <div>
          {tab !== "movements" && (
            <div
              className="overflow-hidden bg-white"
              style={{ border: "1px solid var(--line)", borderRadius: 4 }}
            >
              <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "44%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "10%" }} />
                </colgroup>
                <thead style={{ background: "var(--cream)" }}>
                  <tr className="text-left text-[10px] font-semibold uppercase tracking-luxe text-[var(--ink-muted)]">
                    <th className="px-4 py-3">Product / Variant</th>
                    <th className="px-3 py-3">SKU</th>
                    <th className="px-3 py-3">Stock</th>
                    <th className="px-3 py-3">Age</th>
                    <th className="px-3 py-3 text-right whitespace-nowrap">{windowDays}d sold</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((r) => (
                    <tr
                      key={r.id}
                      className="transition-colors hover:bg-[var(--cream)]"
                      style={{ borderTop: "1px solid var(--line-soft)" }}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {r.product_thumbnail ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={r.product_thumbnail}
                              alt=""
                              className="h-9 w-9 flex-shrink-0 rounded-sm object-cover"
                              style={{ border: "1px solid var(--line-soft)" }}
                            />
                          ) : (
                            <div
                              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-sm"
                              style={{ background: "var(--cream-dark)", color: "var(--ink-muted)" }}
                            >
                              <ImageIcon className="h-3.5 w-3.5" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{r.product_title}</p>
                            <p className="text-xs text-[var(--ink-muted)] truncate">{r.title}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px] text-[var(--ink-muted)] truncate">
                        {r.sku || "—"}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={0}
                            value={r.inventory_quantity}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setRows((prev) =>
                                prev.map((x) =>
                                  x.id === r.id
                                    ? { ...x, inventory_quantity: v, _dirty: true }
                                    : x
                                )
                              );
                            }}
                            className={`${inputCls} w-14 px-2 py-1.5 text-sm`}
                          />
                          {r.inventory_quantity === 0 && <span className="badge badge-danger">Out</span>}
                          {r.inventory_quantity > 0 && r.inventory_quantity <= 3 && (
                            <span className="badge badge-warn">Low</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs whitespace-nowrap">
                        <AgeBadge bucket={r.bucket} ageDays={r.age_days} />
                      </td>
                      <td className="px-3 py-3 text-right font-display text-base">
                        {r.units_sold || 0}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onReceive(r)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-sm transition-colors hover:bg-[var(--cream-dark)] hover:text-[var(--gold-dark)]"
                            style={{ border: "1px solid var(--line)", color: "var(--ink-light)" }}
                            title="Receive stock"
                            aria-label="Receive stock"
                          >
                            <PackagePlus className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => onSave(r)}
                            disabled={!r._dirty || busyId === r.id}
                            className={`${btnPrimary} btn-sm`}
                            style={{ minWidth: 64 }}
                          >
                            {busyId === r.id ? "…" : "Save"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {sortedRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-16 text-center">
                        <p className="font-display text-2xl text-[var(--ink-muted)]">No matches</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {sortedRows.length > 0 && (
                <Pagination
                  page={page}
                  pageSize={pageSize}
                  total={sortedRows.length}
                  onPageChange={setPage}
                  onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
                  itemNoun="variants"
                />
              )}
            </div>
          )}

          {tab === "movements" && (
            <div
              className="overflow-hidden bg-white"
              style={{ border: "1px solid var(--line)", borderRadius: 4 }}
            >
              <table className="w-full text-sm">
                <thead style={{ background: "var(--cream)" }}>
                  <tr className="text-left text-[10px] font-semibold uppercase tracking-luxe text-[var(--ink-muted)]">
                    <th className="px-5 py-3">When</th>
                    <th className="px-5 py-3">Product / Variant</th>
                    <th className="px-5 py-3">SKU</th>
                    <th className="px-5 py-3">Reason</th>
                    <th className="px-5 py-3 text-right">Δ</th>
                    <th className="px-5 py-3">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedMovements.map((m) => (
                    <tr
                      key={m.id}
                      style={{ borderTop: "1px solid var(--line-soft)" }}
                    >
                      <td className="px-5 py-3 text-xs uppercase tracking-luxe text-[var(--ink-muted)]">
                        {new Date(m.created_at).toLocaleString()}
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-medium">{m.product_title}</p>
                        <p className="text-xs text-[var(--ink-muted)]">{m.variant_title}</p>
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-[var(--ink-muted)]">
                        {m.sku || "—"}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={
                            m.reason === "receive" ? "badge badge-success"
                            : m.reason === "sale" ? "badge badge-info"
                            : m.reason === "return" ? "badge badge-warn"
                            : "badge badge-mute"
                          }
                        >
                          {m.reason}
                        </span>
                      </td>
                      <td
                        className="px-5 py-3 text-right font-display text-base"
                        style={{ color: m.delta > 0 ? "var(--gold-dark)" : "#B91C1C" }}
                      >
                        {m.delta > 0 ? `+${m.delta}` : m.delta}
                      </td>
                      <td className="px-5 py-3 text-xs text-[var(--ink-muted)]">
                        {m.reference || m.notes || "—"}
                      </td>
                    </tr>
                  ))}
                  {movements.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-16 text-center">
                        <p className="font-display text-2xl text-[var(--ink-muted)]">
                          No movements yet
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {movements.length > 0 && (
                <Pagination
                  page={page}
                  pageSize={pageSize}
                  total={movements.length}
                  onPageChange={setPage}
                  onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
                  itemNoun="movements"
                />
              )}
            </div>
          )}
        </div>

        {/* AI advisory side panel */}
        <div className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <div className="card p-5">
            <SectionTitle hint="Top movers in the last selected window.">Velocity leaders</SectionTitle>
            <ul className="space-y-2.5 text-sm">
              {velocity.slice(0, 5).map((v) => (
                <li key={v.variant_id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{v.title}</p>
                    {v.sku && (
                      <p className="text-[10px] font-mono text-[var(--ink-muted)]">{v.sku}</p>
                    )}
                  </div>
                  <span className="font-display text-base text-[var(--gold-dark)]">
                    {v.units_sold}
                  </span>
                </li>
              ))}
              {velocity.length === 0 && (
                <li className="text-xs italic text-[var(--ink-muted)]">No sales in this window.</li>
              )}
            </ul>
          </div>

          <AiAdvisory
            topic="inventory"
            helperHint="Gemini analyses stock levels, ageing, velocity, and out-of-stock SKUs."
            defaultQuestion="Which SKUs should I prioritise to restock or discount? What dead inventory should I clear?"
            context={{
              window_days: windowDays,
              totals,
              variants: rows.map((r) => ({
                product: r.product_title,
                variant: r.title,
                sku: r.sku,
                stock: r.inventory_quantity,
                bucket: r.bucket,
                age_days: r.age_days,
                sold_in_window: r.units_sold,
              })),
            }}
          />
        </div>
      </div>
    </AdminShell>
  );
}

function Stat({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  accent?: "warn" | "danger";
}) {
  return (
    <div
      className="bg-white p-4"
      style={{ border: "1px solid var(--line)", borderRadius: 4 }}
    >
      <div className="flex items-center gap-2">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-sm"
          style={{
            background:
              accent === "danger"
                ? "color-mix(in srgb, #B91C1C 12%, white)"
                : accent === "warn"
                  ? "color-mix(in srgb, var(--gold) 18%, white)"
                  : "var(--cream-dark)",
            color:
              accent === "danger"
                ? "#B91C1C"
                : accent === "warn"
                  ? "var(--gold-dark)"
                  : "var(--ink-light)",
          }}
        >
          {icon}
        </div>
        <p className="text-[10px] font-semibold uppercase tracking-luxe text-[var(--ink-muted)]">
          {label}
        </p>
      </div>
      <p className="mt-2 font-display text-2xl font-medium">{value}</p>
    </div>
  );
}

function AgeBadge({ bucket, ageDays }: { bucket?: string; ageDays?: number | null }) {
  if (!bucket || bucket === "unknown")
    return <span className="text-[10px] text-[var(--ink-muted)]">—</span>;
  const cls =
    bucket === "fresh"
      ? "badge badge-success"
      : bucket === "recent"
        ? "badge badge-info"
        : bucket === "aging"
          ? "badge badge-warn"
          : "badge badge-danger";
  const label =
    bucket === "fresh"
      ? "Fresh"
      : bucket === "recent"
        ? "Recent"
        : bucket === "aging"
          ? "Aging"
          : "Stale";
  return (
    <span className="flex items-center gap-1.5">
      <span className={cls}>{label}</span>
      {ageDays != null && (
        <span className="text-[10px] text-[var(--ink-muted)]">{ageDays}d</span>
      )}
    </span>
  );
}
