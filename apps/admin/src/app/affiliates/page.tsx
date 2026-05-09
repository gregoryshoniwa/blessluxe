"use client";

import { useEffect, useState, FormEvent } from "react";
import { Plus, DollarSign } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthGate } from "@/lib/useAuthGate";
import type { Affiliate } from "@/lib/types";
import { AdminShell } from "@/components/AdminShell";
import { useDialog } from "@/components/Dialog";
import { Pagination, paginate } from "@/components/Pagination";
import {
  Modal,
  Field,
  PageHeader,
  inputCls,
  btnPrimary,
  btnGhost,
  btnDanger,
} from "@/components/Modal";

const STATUSES = ["pending", "active", "inactive"] as const;

const STATUS_BADGE: Record<Affiliate["status"], string> = {
  active: "badge badge-success",
  inactive: "badge badge-mute",
  pending: "badge badge-warn",
};

export default function AffiliatesPage() {
  const { user, loading } = useAuthGate();
  const dialog = useDialog();
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Affiliate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const res = await api.get<{ affiliates: Affiliate[] }>("/admin/affiliates");
    setAffiliates(res.affiliates);
  };

  useEffect(() => {
    if (user) void load();
  }, [user]);

  const onDelete = async (a: Affiliate) => {
    const ok = await dialog.confirm({
      title: `Delete affiliate ${a.email}?`,
      message: "Sales attributed to this affiliate stay on record, but their code will stop working.",
      tone: "danger",
      confirmLabel: "Delete affiliate",
    });
    if (!ok) return;
    await api.delete(`/admin/affiliates/${a.id}`);
    await load();
  };

  const onPayout = async (a: Affiliate) => {
    const amountStr = await dialog.prompt({
      title: `Create payout for ${a.email}`,
      message: (
        <>
          Outstanding earnings:{" "}
          <span className="font-display text-base">
            ${((a.total_earnings - a.paid_out) / 100).toFixed(2)}
          </span>
        </>
      ),
      inputLabel: "Amount (in cents)",
      inputType: "number",
      placeholder: "e.g. 12500 = $125.00",
      required: true,
      tone: "info",
      confirmLabel: "Create payout",
      validate: (val) => {
        const n = Number(val);
        if (!Number.isFinite(n) || n <= 0) return "Enter a positive amount in cents.";
        return null;
      },
    });
    if (amountStr == null) return;
    const amount = Number(amountStr);
    if (!amount || amount <= 0) return;
    await api.post(`/admin/affiliates/${a.id}/payouts`, { amount });
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
      code: String(fd.get("code") || "") || undefined,
      commission_rate: Number(fd.get("commission_rate") || 10),
      status: String(fd.get("status") || "pending"),
    };
    try {
      if (editing) {
        await api.patch(`/admin/affiliates/${editing.id}`, body);
      } else {
        await api.post("/admin/affiliates", body);
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
        title="Affiliates"
        subtitle="Promo codes, commission rates, sales attribution, and payouts."
        actions={
          <button onClick={() => { setEditing(null); setError(null); setOpen(true); }} className={btnPrimary}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New affiliate
          </button>
        }
      />

      <div
        className="overflow-hidden bg-white"
        style={{ border: "1px solid var(--line)", borderRadius: 4 }}
      >
        <table className="w-full text-sm">
          <thead style={{ background: "var(--cream)" }}>
            <tr className="text-left text-[10px] font-semibold uppercase tracking-luxe text-[var(--ink-muted)]">
              <th className="px-5 py-3">Code</th>
              <th className="px-5 py-3">Affiliate</th>
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3">Rate</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Earnings</th>
              <th className="px-5 py-3 text-right pr-5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginate(affiliates, page, pageSize).map((a) => (
              <tr
                key={a.id}
                className="transition-colors hover:bg-[var(--cream)]"
                style={{ borderTop: "1px solid var(--line-soft)" }}
              >
                <td className="px-5 py-4 font-mono text-xs font-semibold text-[var(--gold-dark)]">{a.code}</td>
                <td className="px-5 py-4 font-display text-base font-medium tracking-soft">
                  {[a.first_name, a.last_name].filter(Boolean).join(" ") || "—"}
                </td>
                <td className="px-5 py-4 text-[var(--ink-light)]">{a.email}</td>
                <td className="px-5 py-4 font-display text-base">{a.commission_rate}%</td>
                <td className="px-5 py-4">
                  <span className={STATUS_BADGE[a.status]}>{a.status}</span>
                </td>
                <td className="px-5 py-4">
                  <span className="font-display text-base">${(a.total_earnings / 100).toFixed(2)}</span>
                  <span className="ml-1 text-[10px] uppercase tracking-luxe text-[var(--ink-muted)]">
                    paid ${(a.paid_out / 100).toFixed(2)}
                  </span>
                </td>
                <td className="px-5 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => onPayout(a)} className={`${btnGhost} btn-sm`}>
                      <DollarSign className="mr-1 h-3 w-3" /> Payout
                    </button>
                    <button onClick={() => { setEditing(a); setError(null); setOpen(true); }} className={`${btnGhost} btn-sm`}>Edit</button>
                    <button onClick={() => onDelete(a)} className={btnDanger}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {affiliates.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-16 text-center">
                  <p className="font-display text-2xl text-[var(--ink-muted)]">No affiliates yet</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {affiliates.length > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={affiliates.length}
            onPageChange={setPage}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            itemNoun="affiliates"
          />
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit · ${editing.email}` : "New affiliate"}
        footer={
          <>
            <button onClick={() => setOpen(false)} className={btnGhost} type="button">Cancel</button>
            <button form="aff-form" type="submit" disabled={busy} className={btnPrimary}>
              {busy ? "Saving…" : editing ? "Save" : "Create"}
            </button>
          </>
        }
      >
        <form id="aff-form" onSubmit={onSubmit} className="space-y-5">
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
          <Field label="Promo code" hint="Auto-generated if blank">
            <input name="code" defaultValue={editing?.code || ""} className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Commission %">
              <input type="number" step="0.1" name="commission_rate" defaultValue={editing?.commission_rate ?? 10} className={inputCls} />
            </Field>
            <Field label="Status">
              <select name="status" defaultValue={editing?.status || "pending"} className="select">
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          {error && (
            <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
          )}
        </form>
      </Modal>
    </AdminShell>
  );
}
