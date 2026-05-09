"use client";

import { useEffect, useState, FormEvent } from "react";
import { ChevronUp, ChevronDown, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthGate } from "@/lib/useAuthGate";
import type { Heading } from "@/lib/types";
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

export default function HeadingsPage() {
  const { user, loading } = useAuthGate();
  const dialog = useDialog();
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Heading | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await api.get<{ headings: Heading[] }>("/admin/headings");
      setHeadings(res.headings);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (user) void load();
  }, [user]);

  const onCreate = () => {
    setEditing(null);
    setError(null);
    setOpen(true);
  };

  const onEdit = (h: Heading) => {
    setEditing(h);
    setError(null);
    setOpen(true);
  };

  const onDelete = async (h: Heading) => {
    const ok = await dialog.confirm({
      title: `Delete "${h.name}"?`,
      message: "All catalogues attached to this heading will also be removed. This cannot be undone.",
      tone: "danger",
      confirmLabel: "Delete heading",
    });
    if (!ok) return;
    await api.delete(`/admin/headings/${h.id}`);
    await load();
  };

  const onMove = async (h: Heading, dir: -1 | 1) => {
    const sorted = [...headings].sort((a, b) => a.rank - b.rank);
    const idx = sorted.findIndex((x) => x.id === h.id);
    const swap = idx + dir;
    if (swap < 0 || swap >= sorted.length) return;
    const order = sorted.map((x) => x.id);
    [order[idx], order[swap]] = [order[swap], order[idx]];
    await api.post("/admin/headings/reorder", { order });
    await load();
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const body = {
      name: String(fd.get("name") || "").trim(),
      handle: String(fd.get("handle") || "").trim() || undefined,
      description: String(fd.get("description") || "") || undefined,
      rank: Number(fd.get("rank") || 0),
      is_active: fd.get("is_active") === "on",
      is_sale: fd.get("is_sale") === "on",
    };
    try {
      if (editing) {
        await api.patch(`/admin/headings/${editing.id}`, body);
      } else {
        await api.post("/admin/headings", body);
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
        title="Headings"
        subtitle="Top-level navigation items the storefront renders. Each heading owns its own catalogues."
        actions={
          <button onClick={onCreate} className={btnPrimary}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New heading
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
              <th className="px-5 py-3 w-28">Order</th>
              <th className="px-5 py-3">Heading</th>
              <th className="px-5 py-3">Handle</th>
              <th className="px-5 py-3">Catalogues</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right pr-5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginate(
              [...headings].sort((a, b) => a.rank - b.rank),
              page,
              pageSize
            ).map((h, i, arr) => (
                <tr
                  key={h.id}
                  className="transition-colors hover:bg-[var(--cream)]"
                  style={{ borderTop: "1px solid var(--line-soft)" }}
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onMove(h, -1)}
                        disabled={i === 0}
                        className="rounded-sm p-1 text-[var(--ink-muted)] transition-colors hover:bg-[var(--cream-dark)] hover:text-[var(--gold-dark)] disabled:opacity-30"
                        aria-label="Move up"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => onMove(h, 1)}
                        disabled={i === arr.length - 1}
                        className="rounded-sm p-1 text-[var(--ink-muted)] transition-colors hover:bg-[var(--cream-dark)] hover:text-[var(--gold-dark)] disabled:opacity-30"
                        aria-label="Move down"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      <span className="ml-1 text-[11px] font-mono text-[var(--ink-muted)]">
                        #{h.rank}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <p className="font-display text-lg font-medium tracking-soft text-[var(--ink)]">
                      {h.name}
                    </p>
                    {h.description && (
                      <p className="mt-0.5 text-xs text-[var(--ink-muted)] line-clamp-1">
                        {h.description}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-4 font-mono text-xs text-[var(--ink-muted)]">
                    {h.handle}
                  </td>
                  <td className="px-5 py-4 text-[var(--ink-light)]">
                    <span className="font-display text-base">{h.catalogue_count ?? 0}</span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1.5">
                      {h.is_active ? (
                        <span className="badge badge-success">Active</span>
                      ) : (
                        <span className="badge badge-mute">Hidden</span>
                      )}
                      {h.is_sale && <span className="badge badge-danger">Sale</span>}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => onEdit(h)} className={`${btnGhost} btn-sm`}>
                        Edit
                      </button>
                      <button onClick={() => onDelete(h)} className={btnDanger}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            {headings.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-16 text-center">
                  <p className="font-display text-2xl text-[var(--ink-muted)]">
                    No headings yet
                  </p>
                  <p className="mt-1 text-xs text-[var(--ink-muted)]">
                    Click <span className="text-[var(--gold-dark)]">New heading</span> to add the first one.
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {headings.length > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={headings.length}
            onPageChange={setPage}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            itemNoun="headings"
          />
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit · ${editing.name}` : "New heading"}
        subtitle={editing ? "Update the navigation entry." : "Create a top-level navigation item."}
        footer={
          <>
            <button onClick={() => setOpen(false)} className={btnGhost} type="button">
              Cancel
            </button>
            <button form="heading-form" type="submit" disabled={busy} className={btnPrimary}>
              {busy ? "Saving…" : editing ? "Save changes" : "Create heading"}
            </button>
          </>
        }
      >
        <form id="heading-form" onSubmit={onSubmit} className="space-y-5">
          <Field label="Name" required>
            <input
              name="name"
              required
              defaultValue={editing?.name || ""}
              className={inputCls}
              placeholder="e.g. Women"
            />
          </Field>
          <Field label="Handle" hint="URL-safe slug, used in storefront links. Auto-generated if blank.">
            <input
              name="handle"
              defaultValue={editing?.handle || ""}
              className={inputCls}
              placeholder="women"
            />
          </Field>
          <Field label="Description">
            <textarea
              name="description"
              rows={2}
              defaultValue={editing?.description || ""}
              className="textarea"
              placeholder="Short editorial line shown in the menu (optional)"
            />
          </Field>
          <Field label="Rank" hint="Lower numbers appear first.">
            <input
              type="number"
              name="rank"
              defaultValue={editing?.rank ?? 0}
              className={inputCls}
            />
          </Field>
          <div className="flex flex-wrap gap-6 pt-2">
            <CheckLabel name="is_active" defaultChecked={editing ? editing.is_active : true}>
              Active in storefront menu
            </CheckLabel>
            <CheckLabel name="is_sale" defaultChecked={editing?.is_sale ?? false}>
              Render as sale link (red)
            </CheckLabel>
          </div>
          {error && (
            <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </form>
      </Modal>
    </AdminShell>
  );
}

function CheckLabel({
  children,
  name,
  defaultChecked,
}: {
  children: React.ReactNode;
  name: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--ink-light)]">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="h-4 w-4 accent-[var(--gold-dark)]"
      />
      {children}
    </label>
  );
}
