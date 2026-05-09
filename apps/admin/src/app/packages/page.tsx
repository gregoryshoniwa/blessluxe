"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Truck, Search, Gift, Package as PackageIcon } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthGate } from "@/lib/useAuthGate";
import type { PackageRow } from "@/lib/types";
import { AdminShell } from "@/components/AdminShell";
import { PageHeader, inputCls } from "@/components/Modal";
import { Pagination } from "@/components/Pagination";

const STATUSES = [
  "created",
  "label_printed",
  "picked",
  "packed",
  "shipped",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "returned",
  "cancelled",
] as const;

const STATUS_BADGE: Record<string, string> = {
  created: "badge badge-info",
  label_printed: "badge badge-info",
  picked: "badge badge-warn",
  packed: "badge badge-warn",
  shipped: "badge badge-gold",
  in_transit: "badge badge-gold",
  out_for_delivery: "badge badge-gold",
  delivered: "badge badge-success",
  returned: "badge badge-mute",
  cancelled: "badge badge-mute",
};

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";

export default function PackagesPage() {
  const router = useRouter();
  const { user, loading } = useAuthGate();
  const [rows, setRows] = useState<PackageRow[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [status, setStatus] = useState("");
  const [isPack, setIsPack] = useState<"" | "true" | "false">("");
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");

  const queryString = useMemo(() => {
    const p = new URLSearchParams({
      limit: String(pageSize),
      offset: String((page - 1) * pageSize),
    });
    if (status) p.set("status", status);
    if (isPack) p.set("is_pack", isPack);
    if (q) p.set("q", q);
    return p.toString();
  }, [page, pageSize, status, isPack, q]);

  const load = async () => {
    const r = await api.get<{ packages: PackageRow[]; count: number }>(
      `/admin/packages?${queryString}`
    );
    setRows(r.packages);
    setCount(r.count);
  };

  useEffect(() => { if (user) void load(); }, [user, queryString]);
  useEffect(() => { setPage(1); }, [status, isPack, q]);

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="font-script text-2xl text-[var(--gold-dark)]">Bless</p>
      </div>
    );
  }

  return (
    <AdminShell user={user}>
      <PageHeader
        title="Packages"
        subtitle="Trackable packages auto-created from each order. Update status, log events, and verify pack sub-codes."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form
          className="relative flex-1 max-w-md"
          onSubmit={(e) => { e.preventDefault(); setQ(qInput.trim()); }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-muted)]" />
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Search code, order number, or customer email…"
            className={`${inputCls} pl-10`}
          />
        </form>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="select max-w-[180px]">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
        <select value={isPack} onChange={(e) => setIsPack(e.target.value as "" | "true" | "false")} className="select max-w-[140px]">
          <option value="">Any type</option>
          <option value="true">Pack only</option>
          <option value="false">Standard only</option>
        </select>
      </div>

      <div className="overflow-hidden bg-white" style={{ border: "1px solid var(--line)", borderRadius: 4 }}>
        <table className="w-full text-sm">
          <thead style={{ background: "var(--cream)" }}>
            <tr className="text-left text-[10px] font-semibold uppercase tracking-luxe text-[var(--ink-muted)]">
              <th className="px-4 py-3">Code</th>
              <th className="px-3 py-3">Order</th>
              <th className="px-3 py-3">Customer</th>
              <th className="px-3 py-3">Items</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Carrier</th>
              <th className="px-3 py-3">Created</th>
              <th className="px-3 py-3">Shipped</th>
              <th className="px-3 py-3">Delivered</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => router.push(`/packages/${r.package_code}`)}
                className="cursor-pointer transition-colors hover:bg-[var(--cream)]"
                style={{ borderTop: "1px solid var(--line-soft)" }}
              >
                <td className="px-4 py-3">
                  <p className="font-mono text-xs font-semibold text-[var(--gold-dark)]">{r.package_code}</p>
                  {r.is_pack && (
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] uppercase tracking-luxe text-[var(--gold-dark)]">
                      <Gift className="h-2.5 w-2.5" />
                      Pack
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 font-mono text-xs">{r.order_number}</td>
                <td className="px-3 py-3 text-sm">
                  {r.customer_email ? (
                    <>
                      <p className="font-medium">
                        {[r.customer_first_name, r.customer_last_name].filter(Boolean).join(" ") || "—"}
                      </p>
                      <p className="text-xs text-[var(--ink-muted)]">{r.customer_email}</p>
                    </>
                  ) : (
                    <span className="text-[var(--ink-muted)]">Guest</span>
                  )}
                </td>
                <td className="px-3 py-3 font-display text-base">{r.item_count}</td>
                <td className="px-3 py-3">
                  <span className={STATUS_BADGE[r.status] || "badge badge-mute"}>
                    {r.status.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-3 py-3 text-xs text-[var(--ink-light)]">
                  {r.carrier ? (
                    <span className="inline-flex items-center gap-1">
                      <Truck className="h-3 w-3" />
                      {r.carrier}
                    </span>
                  ) : (
                    <span className="text-[var(--ink-muted)]">—</span>
                  )}
                </td>
                <td className="px-3 py-3 text-xs text-[var(--ink-muted)]">{fmtDate(r.created_at)}</td>
                <td className="px-3 py-3 text-xs text-[var(--ink-muted)]">{fmtDate(r.shipped_at)}</td>
                <td className="px-3 py-3 text-xs text-[var(--ink-muted)]">{fmtDate(r.delivered_at)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-5 py-16 text-center">
                  <PackageIcon className="mx-auto h-8 w-8 text-[var(--ink-muted)] mb-2" />
                  <p className="font-display text-2xl text-[var(--ink-muted)]">No packages</p>
                  <p className="mt-1 text-xs text-[var(--ink-muted)]">
                    Packages auto-create when a customer completes an order.
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {count > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={count}
            onPageChange={setPage}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            itemNoun="packages"
          />
        )}
      </div>
    </AdminShell>
  );
}
