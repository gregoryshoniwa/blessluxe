"use client";

import { useEffect, useState, FormEvent } from "react";
import { Plus, Megaphone, Search } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthGate } from "@/lib/useAuthGate";
import type { Campaign, Product } from "@/lib/types";
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
  SectionTitle,
} from "@/components/Modal";

const fmtDate = (s: string) => {
  try {
    return new Date(s).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
};

const isLive = (c: Campaign) => {
  const now = Date.now();
  const start = new Date(c.starts_at).getTime();
  const end = new Date(c.ends_at).getTime();
  return c.is_active && start <= now && now <= end;
};

const isUpcoming = (c: Campaign) => {
  const now = Date.now();
  const start = new Date(c.starts_at).getTime();
  return c.is_active && start > now;
};

export default function CampaignsPage() {
  const { user, loading } = useAuthGate();
  const dialog = useDialog();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [editingProductIds, setEditingProductIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState("");

  const load = async () => {
    const [c, p] = await Promise.all([
      api.get<{ campaigns: Campaign[] }>("/admin/campaigns"),
      api.get<{ products: Product[] }>("/admin/products?limit=500"),
    ]);
    setCampaigns(c.campaigns);
    setProducts(p.products);
  };

  useEffect(() => {
    if (user) void load();
  }, [user]);

  const onCreate = () => {
    setEditing(null);
    setEditingProductIds([]);
    setError(null);
    setProductSearch("");
    setOpen(true);
  };

  const onEdit = async (c: Campaign) => {
    setError(null);
    const detail = await api.get<{ campaign: Campaign }>(`/admin/campaigns/${c.id}`);
    setEditing(detail.campaign);
    setEditingProductIds((detail.campaign.products || []).map((p) => p.id));
    setProductSearch("");
    setOpen(true);
  };

  const onDelete = async (c: Campaign) => {
    const ok = await dialog.confirm({
      title: `Delete "${c.name}"?`,
      message: "The campaign banner will stop appearing on the storefront immediately.",
      tone: "danger",
      confirmLabel: "Delete campaign",
    });
    if (!ok) return;
    await api.delete(`/admin/campaigns/${c.id}`);
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
      banner_text: String(fd.get("banner_text") || "") || undefined,
      banner_cta_label: String(fd.get("banner_cta_label") || "") || undefined,
      banner_cta_href: String(fd.get("banner_cta_href") || "") || undefined,
      banner_url: String(fd.get("banner_url") || "") || undefined,
      discount_percent: fd.get("discount_percent") ? Number(fd.get("discount_percent")) : null,
      starts_at: new Date(String(fd.get("starts_at"))).toISOString(),
      ends_at: new Date(String(fd.get("ends_at"))).toISOString(),
      is_active: fd.get("is_active") === "on",
      show_countdown: fd.get("show_countdown") === "on",
      product_ids: editingProductIds,
    };
    try {
      if (editing) {
        await api.patch(`/admin/campaigns/${editing.id}`, body);
      } else {
        await api.post("/admin/campaigns", body);
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

  const filteredProducts = products.filter((p) =>
    productSearch
      ? p.title.toLowerCase().includes(productSearch.toLowerCase()) ||
        p.handle.toLowerCase().includes(productSearch.toLowerCase())
      : true
  );

  const toLocalDt = (s: string | undefined | null) =>
    s ? new Date(s).toISOString().slice(0, 16) : "";

  return (
    <AdminShell user={user}>
      <PageHeader
        title="Campaigns"
        subtitle="Schedule sales, banners, and countdown promotions. Black Friday, end-of-season, flash sales."
        actions={
          <button onClick={onCreate} className={btnPrimary}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New campaign
          </button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {paginate(campaigns, page, pageSize).map((c) => {
          const live = isLive(c);
          const upcoming = isUpcoming(c);
          return (
            <article
              key={c.id}
              className="bg-white p-6 transition-shadow hover:shadow-sm"
              style={{
                border: "1px solid var(--line)",
                borderRadius: 4,
                borderTop: live ? "3px solid var(--gold)" : undefined,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Megaphone className="h-4 w-4 text-[var(--gold-dark)]" />
                    <span className="font-display text-xl font-medium tracking-soft">{c.name}</span>
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-[var(--ink-muted)]">/{c.handle}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {live && <span className="badge badge-success">Live now</span>}
                  {upcoming && <span className="badge badge-info">Upcoming</span>}
                  {!c.is_active && <span className="badge badge-mute">Paused</span>}
                  {c.discount_percent != null && c.discount_percent > 0 && (
                    <span className="badge badge-gold">−{c.discount_percent}%</span>
                  )}
                </div>
              </div>

              {c.banner_text && (
                <p className="mt-4 italic text-sm text-[var(--ink-light)]">&ldquo;{c.banner_text}&rdquo;</p>
              )}

              <div
                className="mt-5 flex items-center justify-between text-[11px] uppercase tracking-luxe text-[var(--ink-muted)]"
                style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 12 }}
              >
                <span>Starts {fmtDate(c.starts_at)}</span>
                <span>Ends {fmtDate(c.ends_at)}</span>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-[var(--ink-muted)]">
                  <span className="font-display text-base text-[var(--ink)]">{c.product_count ?? 0}</span>{" "}
                  products
                </span>
                <div className="flex gap-2">
                  <button onClick={() => onEdit(c)} className={`${btnGhost} btn-sm`}>Edit</button>
                  <button onClick={() => onDelete(c)} className={btnDanger}>Delete</button>
                </div>
              </div>
            </article>
          );
        })}
        {campaigns.length === 0 && (
          <div
            className="bg-white p-16 text-center md:col-span-2 xl:col-span-3"
            style={{ border: "1px solid var(--line)", borderRadius: 4 }}
          >
            <p className="font-display text-2xl text-[var(--ink-muted)]">No campaigns yet</p>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">
              Create one to schedule a banner, countdown, or product-level discount.
            </p>
          </div>
        )}
      </div>

      {campaigns.length > pageSize && (
        <div
          className="mt-6 bg-white"
          style={{ border: "1px solid var(--line)", borderRadius: 4 }}
        >
          <Pagination
            page={page}
            pageSize={pageSize}
            total={campaigns.length}
            onPageChange={setPage}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            pageSizeOptions={[12, 24, 48, 96]}
            itemNoun="campaigns"
          />
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit · ${editing.name}` : "New campaign"}
        subtitle="Schedule a sale, banner, or marketing moment."
        width="max-w-3xl"
        footer={
          <>
            <button onClick={() => setOpen(false)} className={btnGhost} type="button">Cancel</button>
            <button form="campaign-form" type="submit" disabled={busy} className={btnPrimary}>
              {busy ? "Saving…" : editing ? "Save changes" : "Create campaign"}
            </button>
          </>
        }
      >
        <form id="campaign-form" onSubmit={onSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name" required>
              <input
                name="name"
                required
                defaultValue={editing?.name || ""}
                placeholder="Black Friday 2026"
                className={inputCls}
              />
            </Field>
            <Field label="Handle" hint="Auto-generated if blank">
              <input name="handle" defaultValue={editing?.handle || ""} className={inputCls} />
            </Field>
          </div>
          <Field label="Description">
            <textarea
              name="description"
              rows={2}
              defaultValue={editing?.description || ""}
              className="textarea"
            />
          </Field>

          <div className="card p-4">
            <SectionTitle hint="Customer-facing banner copy and call-to-action.">Banner</SectionTitle>
            <Field label="Headline / banner text">
              <input
                name="banner_text"
                defaultValue={editing?.banner_text || ""}
                placeholder="Up to 40% off all dresses · ends Sunday"
                className={inputCls}
              />
            </Field>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <Field label="CTA label">
                <input
                  name="banner_cta_label"
                  defaultValue={editing?.banner_cta_label || ""}
                  placeholder="Shop sale"
                  className={inputCls}
                />
              </Field>
              <Field label="CTA href">
                <input
                  name="banner_cta_href"
                  defaultValue={editing?.banner_cta_href || ""}
                  placeholder="/shop?sale=true"
                  className={inputCls}
                />
              </Field>
            </div>
            <Field label="Banner image URL">
              <input
                name="banner_url"
                defaultValue={editing?.banner_url || ""}
                placeholder="https://…"
                className={inputCls}
              />
            </Field>
          </div>

          <div className="card p-4">
            <SectionTitle>Schedule</SectionTitle>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Starts" required>
                <input
                  type="datetime-local"
                  name="starts_at"
                  required
                  defaultValue={toLocalDt(editing?.starts_at) || toLocalDt(new Date().toISOString())}
                  className={inputCls}
                />
              </Field>
              <Field label="Ends" required>
                <input
                  type="datetime-local"
                  name="ends_at"
                  required
                  defaultValue={toLocalDt(editing?.ends_at) ||
                    toLocalDt(new Date(Date.now() + 7 * 86400000).toISOString())}
                  className={inputCls}
                />
              </Field>
              <Field label="Discount %" hint="Display only">
                <input
                  type="number"
                  step="0.1"
                  name="discount_percent"
                  defaultValue={editing?.discount_percent ?? ""}
                  placeholder="20"
                  className={inputCls}
                />
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap gap-5 text-sm text-[var(--ink-light)]">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  name="is_active"
                  defaultChecked={editing ? editing.is_active : true}
                  className="h-4 w-4 accent-[var(--gold-dark)]"
                />
                Active
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  name="show_countdown"
                  defaultChecked={editing ? editing.show_countdown : true}
                  className="h-4 w-4 accent-[var(--gold-dark)]"
                />
                Show countdown timer on storefront
              </label>
            </div>
          </div>

          <div className="card p-4">
            <SectionTitle hint="Selected products will be tagged in the storefront banner and tracked in finance reports.">
              Featured products ({editingProductIds.length})
            </SectionTitle>
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-muted)]" />
              <input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search products…"
                className="input pl-10"
              />
            </div>
            <div
              className="max-h-64 overflow-y-auto rounded-sm"
              style={{ border: "1px solid var(--line-soft)" }}
            >
              {filteredProducts.map((p) => {
                const checked = editingProductIds.includes(p.id);
                return (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-[var(--cream)]"
                    style={{ borderBottom: "1px solid var(--line-soft)" }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setEditingProductIds((prev) =>
                          e.target.checked ? [...prev, p.id] : prev.filter((x) => x !== p.id)
                        )
                      }
                      className="h-4 w-4 accent-[var(--gold-dark)]"
                    />
                    {p.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.thumbnail} alt="" className="h-9 w-9 rounded-sm object-cover" />
                    ) : (
                      <div
                        className="h-9 w-9 rounded-sm"
                        style={{ background: "var(--cream-dark)" }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{p.title}</p>
                      <p className="text-[10px] font-mono text-[var(--ink-muted)]">{p.handle}</p>
                    </div>
                  </label>
                );
              })}
            </div>
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
