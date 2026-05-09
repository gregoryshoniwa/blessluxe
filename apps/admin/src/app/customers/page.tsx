"use client";

import { useEffect, useState, FormEvent } from "react";
import { Plus, Search } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthGate } from "@/lib/useAuthGate";
import type { Customer } from "@/lib/types";
import { AdminShell } from "@/components/AdminShell";
import { useDialog } from "@/components/Dialog";
import { Pagination } from "@/components/Pagination";
import {
  Modal,
  Field,
  PageHeader,
  inputCls,
  btnPrimary,
  btnGhost,
} from "@/components/Modal";

const TIERS = ["bronze", "silver", "gold", "platinum"] as const;

const TIER_BADGE: Record<Customer["loyalty_tier"], string> = {
  bronze: "badge badge-warn",
  silver: "badge badge-mute",
  gold: "badge badge-gold",
  platinum: "badge badge-info",
};

export default function CustomersPage() {
  const { user, loading } = useAuthGate();
  const dialog = useDialog();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const load = async () => {
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String((page - 1) * pageSize),
    });
    if (q) params.set("q", q);
    const res = await api.get<{ customers: Customer[]; count: number }>(
      `/admin/customers?${params.toString()}`
    );
    setCustomers(res.customers);
    setCount(res.count);
  };

  useEffect(() => {
    if (user) void load();
  }, [user, page, pageSize, q]);

  useEffect(() => { setPage(1); }, [q]);

  const onLoyaltyDelta = async (c: Customer, delta: number) => {
    const reason = await dialog.prompt({
      title: `${delta > 0 ? "Award" : "Deduct"} ${Math.abs(delta)} points`,
      message: (
        <>
          <span className="font-medium">{c.email}</span> · current balance{" "}
          <span className="font-display text-base">{c.loyalty_points}</span>
        </>
      ),
      inputLabel: "Reason for adjustment",
      placeholder: "e.g. Goodwill credit, returned order, referral bonus",
      defaultValue: "manual",
      multiline: true,
      tone: delta > 0 ? "success" : "warning",
      confirmLabel: delta > 0 ? `Add ${delta} pts` : `Deduct ${Math.abs(delta)} pts`,
    });
    if (reason == null) return;
    await api.post(`/admin/customers/${c.id}/loyalty`, { delta, reason: reason || "manual" });
    await load();
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const body = {
      email: String(fd.get("email") || "").trim(),
      first_name: String(fd.get("first_name") || "") || undefined,
      last_name: String(fd.get("last_name") || "") || undefined,
      phone: String(fd.get("phone") || "") || undefined,
      loyalty_tier: String(fd.get("loyalty_tier") || "bronze"),
      loyalty_points: Number(fd.get("loyalty_points") || 0),
      marketing_consent: fd.get("marketing_consent") === "on",
    };
    try {
      if (editing) {
        await api.patch(`/admin/customers/${editing.id}`, body);
      } else {
        await api.post("/admin/customers", body);
      }
      setOpen(false);
      await load();
    } catch (err: unknown) {
      setError((err as { message?: string }).message || "Failed");
    } finally {
      setBusy(false);
    }
  };

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
        title="Customers"
        subtitle="Loyalty points, tiers, and referral codes."
        actions={
          <button onClick={() => { setEditing(null); setError(null); setOpen(true); }} className={btnPrimary}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New customer
          </button>
        }
      />

      <div className="mb-6 flex items-center gap-3">
        <form
          className="relative flex-1 max-w-md"
          onSubmit={(e) => { e.preventDefault(); setQ(searchInput.trim()); }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-muted)]" />
          <input
            placeholder="Search by name or email…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="input pl-10"
          />
        </form>
        <button
          type="button"
          onClick={() => setQ(searchInput.trim())}
          className={btnGhost}
        >
          Search
        </button>
        {q && (
          <button
            type="button"
            onClick={() => { setSearchInput(""); setQ(""); }}
            className="text-[10px] uppercase tracking-luxe text-[var(--ink-muted)] hover:text-[var(--gold-dark)]"
          >
            clear
          </button>
        )}
      </div>

      <div
        className="overflow-hidden bg-white"
        style={{ border: "1px solid var(--line)", borderRadius: 4 }}
      >
        <table className="w-full text-sm">
          <thead style={{ background: "var(--cream)" }}>
            <tr className="text-left text-[10px] font-semibold uppercase tracking-luxe text-[var(--ink-muted)]">
              <th className="px-5 py-3">Customer</th>
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3">Tier</th>
              <th className="px-5 py-3">Points</th>
              <th className="px-5 py-3">Referral</th>
              <th className="px-5 py-3 text-right pr-5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr
                key={c.id}
                className="transition-colors hover:bg-[var(--cream)]"
                style={{ borderTop: "1px solid var(--line-soft)" }}
              >
                <td className="px-5 py-4 font-display text-base font-medium tracking-soft">
                  {[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}
                </td>
                <td className="px-5 py-4 text-[var(--ink-light)]">{c.email}</td>
                <td className="px-5 py-4">
                  <span className={TIER_BADGE[c.loyalty_tier]}>{c.loyalty_tier}</span>
                </td>
                <td className="px-5 py-4 font-display text-base">{c.loyalty_points}</td>
                <td className="px-5 py-4 font-mono text-xs text-[var(--ink-muted)]">
                  {c.referral_code || "—"}
                </td>
                <td className="px-5 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => onLoyaltyDelta(c, 100)} className={`${btnGhost} btn-sm`}>+100</button>
                    <button onClick={() => onLoyaltyDelta(c, -100)} className={`${btnGhost} btn-sm`}>-100</button>
                    <button onClick={() => { setEditing(c); setError(null); setOpen(true); }} className={`${btnGhost} btn-sm`}>Edit</button>
                  </div>
                </td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-16 text-center">
                  <p className="font-display text-2xl text-[var(--ink-muted)]">No customers yet</p>
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
            itemNoun="customers"
          />
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit · ${editing.email}` : "New customer"}
        footer={
          <>
            <button onClick={() => setOpen(false)} className={btnGhost} type="button">Cancel</button>
            <button form="customer-form" type="submit" disabled={busy} className={btnPrimary}>
              {busy ? "Saving…" : editing ? "Save" : "Create"}
            </button>
          </>
        }
      >
        <form id="customer-form" onSubmit={onSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="First name">
              <input name="first_name" defaultValue={editing?.first_name || ""} className={inputCls} />
            </Field>
            <Field label="Last name">
              <input name="last_name" defaultValue={editing?.last_name || ""} className={inputCls} />
            </Field>
          </div>
          <Field label="Email" required>
            <input type="email" name="email" required defaultValue={editing?.email || ""} className={inputCls} />
          </Field>
          <Field label="Phone">
            <input name="phone" defaultValue={editing?.phone || ""} className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Loyalty tier">
              <select name="loyalty_tier" defaultValue={editing?.loyalty_tier || "bronze"} className="select">
                {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Loyalty points">
              <input type="number" name="loyalty_points" defaultValue={editing?.loyalty_points ?? 0} className={inputCls} />
            </Field>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--ink-light)]">
            <input
              type="checkbox"
              name="marketing_consent"
              defaultChecked={editing?.marketing_consent ?? false}
              className="h-4 w-4 accent-[var(--gold-dark)]"
            />
            Marketing consent
          </label>
          {error && (
            <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
          )}
        </form>
      </Modal>
    </AdminShell>
  );
}
