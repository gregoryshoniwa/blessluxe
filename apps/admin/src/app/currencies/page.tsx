"use client";

import { useEffect, useState, FormEvent } from "react";
import { Plus, Star, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthGate } from "@/lib/useAuthGate";
import { AdminShell } from "@/components/AdminShell";
import { useDialog } from "@/components/Dialog";
import {
  PageHeader,
  Modal,
  Field,
  inputCls,
  btnPrimary,
  btnGhost,
  btnDanger,
  SectionTitle,
} from "@/components/Modal";

interface Currency {
  code: string;
  name: string;
  symbol: string | null;
  rate_to_root: string | number;
  is_root: boolean;
  is_active: boolean;
  sort_order: number;
}

export default function CurrenciesPage() {
  const { user, loading } = useAuthGate();
  const dialog = useDialog();
  const [rows, setRows] = useState<Currency[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Currency | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await api.get<{ currencies: Currency[] }>("/admin/currencies");
    setRows(res.currencies);
  };

  useEffect(() => {
    if (user) void load();
  }, [user]);

  const setRoot = async (c: Currency) => {
    if (c.is_root) return;
    const ok = await dialog.confirm({
      title: `Set ${c.code.toUpperCase()} as the root currency?`,
      message:
        "All variant prices are entered in the root currency and auto-converted for others. Existing prices stay as-is until you re-save a variant.",
      confirmLabel: "Set as root",
    });
    if (!ok) return;
    try {
      await api.put(`/admin/currencies/${c.code}`, { is_root: true });
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed";
      await dialog.alert({ title: "Failed", message, tone: "danger" });
    }
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const code = String(fd.get("code") || "").toLowerCase().trim();
    const body = {
      name: String(fd.get("name") || "").trim(),
      symbol: String(fd.get("symbol") || "").trim() || undefined,
      rate_to_root: Number(fd.get("rate_to_root") || 1),
      is_active: fd.get("is_active") === "on",
      sort_order: Number(fd.get("sort_order") || 0),
    };
    try {
      await api.put(`/admin/currencies/${code}`, body);
      setOpen(false);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed";
      await dialog.alert({ title: "Save failed", message, tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (c: Currency) => {
    if (c.is_root) return;
    const ok = await dialog.confirm({
      title: `Delete ${c.code.toUpperCase()}?`,
      tone: "danger",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      await api.delete(`/admin/currencies/${c.code}`);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed";
      await dialog.alert({ title: "Delete failed", message, tone: "danger" });
    }
  };

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="font-script text-2xl text-[var(--gold-dark)]">Bless</p>
      </div>
    );
  }

  const root = rows.find((r) => r.is_root);

  return (
    <AdminShell user={user}>
      <PageHeader
        title="Currencies"
        subtitle="Manage display currencies and exchange rates. Prices are entered in the root currency and converted for the rest."
      />

      <div className="mb-6 flex justify-between items-center">
        <SectionTitle hint={`Root: ${root ? root.code.toUpperCase() : "—"}. Star a currency to make it the new root.`}>
          Active currencies
        </SectionTitle>
        <button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
          className={btnPrimary}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New currency
        </button>
      </div>

      <div
        className="bg-white"
        style={{ border: "1px solid var(--line)", borderRadius: 4 }}
      >
        <table className="w-full text-sm">
          <thead style={{ background: "var(--cream)" }}>
            <tr className="text-left text-[10px] font-semibold uppercase tracking-luxe text-[var(--ink-muted)]">
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Symbol</th>
              <th className="px-4 py-3 text-right">Rate to root</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr
                key={c.code}
                style={{ borderTop: "1px solid var(--line-soft)" }}
                className="transition-colors hover:bg-[var(--cream)]"
              >
                <td className="px-4 py-3 font-mono text-xs uppercase tracking-luxe text-[var(--gold-dark)]">
                  {c.code.toUpperCase()}
                </td>
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3">{c.symbol || "—"}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">
                  {c.is_root ? "1.0 (root)" : Number(c.rate_to_root).toFixed(4)}
                </td>
                <td className="px-4 py-3 text-center">
                  {c.is_root && <span className="badge badge-success mr-1">Root</span>}
                  {c.is_active ? (
                    <span className="badge badge-info">Active</span>
                  ) : (
                    <span className="badge badge-mute">Hidden</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => setRoot(c)}
                      disabled={c.is_root}
                      className={btnGhost}
                      title={c.is_root ? "Already root" : "Set as root"}
                    >
                      <Star
                        className="h-3.5 w-3.5"
                        fill={c.is_root ? "var(--gold)" : "transparent"}
                        color="var(--gold)"
                      />
                    </button>
                    <button
                      onClick={() => {
                        setEditing(c);
                        setOpen(true);
                      }}
                      className={btnGhost}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onDelete(c)}
                      disabled={c.is_root}
                      className={btnDanger}
                      title={c.is_root ? "Cannot delete root" : "Delete"}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-16 text-center">
                  <p className="font-display text-xl text-[var(--ink-muted)]">
                    No currencies yet
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.code.toUpperCase()}` : "New currency"}
        footer={
          <>
            <button onClick={() => setOpen(false)} className={btnGhost}>
              Cancel
            </button>
            <button form="cur-form" type="submit" disabled={busy} className={btnPrimary}>
              {busy ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        <form id="cur-form" onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Code" required hint="ISO 4217, lowercase, 3 letters">
              <input
                name="code"
                required
                defaultValue={editing?.code || ""}
                readOnly={!!editing}
                pattern="[a-zA-Z]{3}"
                maxLength={3}
                className={inputCls}
                placeholder="usd"
              />
            </Field>
            <Field label="Symbol">
              <input
                name="symbol"
                defaultValue={editing?.symbol || ""}
                className={inputCls}
                placeholder="$"
              />
            </Field>
          </div>
          <Field label="Name" required>
            <input
              name="name"
              required
              defaultValue={editing?.name || ""}
              className={inputCls}
              placeholder="US Dollar"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Rate to root"
              hint="How many of this currency per 1 of the root currency. Use 1 for the root."
            >
              <input
                type="number"
                step="0.0001"
                min={0}
                name="rate_to_root"
                defaultValue={editing ? Number(editing.rate_to_root) : 1}
                disabled={editing?.is_root}
                className={inputCls}
              />
            </Field>
            <Field label="Sort order">
              <input
                type="number"
                name="sort_order"
                defaultValue={editing?.sort_order ?? 99}
                className={inputCls}
              />
            </Field>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={editing ? editing.is_active : true}
              className="h-4 w-4 accent-[var(--gold-dark)]"
            />
            Active (shown on storefront)
          </label>
        </form>
      </Modal>
    </AdminShell>
  );
}
