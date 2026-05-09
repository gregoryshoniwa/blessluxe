"use client";

import { useEffect, useState, FormEvent } from "react";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthGate } from "@/lib/useAuthGate";
import type { Catalogue, Heading } from "@/lib/types";
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

export default function CataloguesPage() {
  const { user, loading } = useAuthGate();
  const dialog = useDialog();
  const [catalogues, setCatalogues] = useState<Catalogue[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [filterHeading, setFilterHeading] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Catalogue | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const qs = filterHeading ? `?heading_id=${encodeURIComponent(filterHeading)}` : "";
    const [cs, hs] = await Promise.all([
      api.get<{ catalogues: Catalogue[] }>(`/admin/catalogues${qs}`),
      api.get<{ headings: Heading[] }>("/admin/headings"),
    ]);
    setCatalogues(cs.catalogues);
    setHeadings(hs.headings);
  };

  useEffect(() => {
    if (user) void load();
  }, [user, filterHeading]);

  useEffect(() => { setPage(1); }, [filterHeading]);

  const onCreate = () => { setEditing(null); setError(null); setOpen(true); };
  const onEdit = (c: Catalogue) => { setEditing(c); setError(null); setOpen(true); };

  const onDelete = async (c: Catalogue) => {
    const ok = await dialog.confirm({
      title: `Delete "${c.name}"?`,
      message: "Products will be unlinked from this catalogue. This cannot be undone.",
      tone: "danger",
      confirmLabel: "Delete catalogue",
    });
    if (!ok) return;
    await api.delete(`/admin/catalogues/${c.id}`);
    await load();
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const body = {
      heading_id: String(fd.get("heading_id") || ""),
      name: String(fd.get("name") || "").trim(),
      handle: String(fd.get("handle") || "").trim() || undefined,
      description: String(fd.get("description") || "") || undefined,
      thumbnail: String(fd.get("thumbnail") || "") || undefined,
      rank: Number(fd.get("rank") || 0),
      is_active: fd.get("is_active") === "on",
    };
    try {
      if (editing) {
        await api.patch(`/admin/catalogues/${editing.id}`, body);
      } else {
        await api.post("/admin/catalogues", body);
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
        title="Catalogues"
        subtitle="Catalogues are grouped under each heading. Products attach to catalogues — that hierarchy drives the storefront mega-menu."
        actions={
          <button onClick={onCreate} className={btnPrimary} disabled={headings.length === 0}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New catalogue
          </button>
        }
      />

      <div className="flex items-center gap-3 mb-6">
        <span className="text-[10px] font-semibold uppercase tracking-luxe text-[var(--ink-muted)]">
          Filter by heading
        </span>
        <select
          value={filterHeading}
          onChange={(e) => setFilterHeading(e.target.value)}
          className="select max-w-xs"
        >
          <option value="">All headings</option>
          {headings.map((h) => (
            <option key={h.id} value={h.id}>{h.name}</option>
          ))}
        </select>
      </div>

      <div
        className="overflow-hidden bg-white"
        style={{ border: "1px solid var(--line)", borderRadius: 4 }}
      >
        <table className="w-full text-sm">
          <thead style={{ background: "var(--cream)" }}>
            <tr className="text-left text-[10px] font-semibold uppercase tracking-luxe text-[var(--ink-muted)]">
              <th className="px-5 py-3">Heading</th>
              <th className="px-5 py-3">Catalogue</th>
              <th className="px-5 py-3">Handle</th>
              <th className="px-5 py-3">Products</th>
              <th className="px-5 py-3">Rank</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right pr-5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginate(catalogues, page, pageSize).map((c) => (
              <tr
                key={c.id}
                className="transition-colors hover:bg-[var(--cream)]"
                style={{ borderTop: "1px solid var(--line-soft)" }}
              >
                <td className="px-5 py-4 text-xs uppercase tracking-luxe text-[var(--gold-dark)]">
                  {c.heading_name || c.heading_handle}
                </td>
                <td className="px-5 py-4">
                  <p className="font-display text-base font-medium tracking-soft">{c.name}</p>
                  {c.description && (
                    <p className="mt-0.5 text-xs text-[var(--ink-muted)] line-clamp-1">
                      {c.description}
                    </p>
                  )}
                </td>
                <td className="px-5 py-4 font-mono text-xs text-[var(--ink-muted)]">{c.handle}</td>
                <td className="px-5 py-4 font-display text-base">{c.product_count ?? 0}</td>
                <td className="px-5 py-4 text-xs font-mono text-[var(--ink-muted)]">#{c.rank}</td>
                <td className="px-5 py-4">
                  {c.is_active ? (
                    <span className="badge badge-success">Active</span>
                  ) : (
                    <span className="badge badge-mute">Hidden</span>
                  )}
                </td>
                <td className="px-5 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => onEdit(c)} className={`${btnGhost} btn-sm`}>Edit</button>
                    <button onClick={() => onDelete(c)} className={btnDanger}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {catalogues.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-16 text-center">
                  <p className="font-display text-2xl text-[var(--ink-muted)]">
                    {headings.length === 0 ? "Create a heading first" : "No catalogues here yet"}
                  </p>
                  <p className="mt-1 text-xs text-[var(--ink-muted)]">
                    {headings.length === 0
                      ? "Catalogues need a parent heading."
                      : "Click New catalogue to add one."}
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {catalogues.length > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={catalogues.length}
            onPageChange={setPage}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            itemNoun="catalogues"
          />
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit · ${editing.name}` : "New catalogue"}
        subtitle="Catalogues group products under a heading."
        footer={
          <>
            <button onClick={() => setOpen(false)} className={btnGhost} type="button">Cancel</button>
            <button form="catalogue-form" type="submit" disabled={busy} className={btnPrimary}>
              {busy ? "Saving…" : editing ? "Save changes" : "Create catalogue"}
            </button>
          </>
        }
      >
        <form id="catalogue-form" onSubmit={onSubmit} className="space-y-5">
          <Field label="Heading" required>
            <select
              name="heading_id"
              required
              defaultValue={editing?.heading_id || ""}
              className="select"
            >
              <option value="" disabled>Select a heading…</option>
              {headings.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name" required>
              <input name="name" required defaultValue={editing?.name || ""} className={inputCls} />
            </Field>
            <Field label="Handle" hint="Auto-generated if blank">
              <input name="handle" defaultValue={editing?.handle || ""} className={inputCls} />
            </Field>
          </div>
          <Field label="Description">
            <textarea name="description" rows={2} defaultValue={editing?.description || ""} className="textarea" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Thumbnail URL">
              <input name="thumbnail" defaultValue={editing?.thumbnail || ""} className={inputCls} />
            </Field>
            <Field label="Rank">
              <input type="number" name="rank" defaultValue={editing?.rank ?? 0} className={inputCls} />
            </Field>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--ink-light)]">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={editing ? editing.is_active : true}
              className="h-4 w-4 accent-[var(--gold-dark)]"
            />
            Active in storefront menu
          </label>
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
